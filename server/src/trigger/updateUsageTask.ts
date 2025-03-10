import { createSupabaseClient } from "@/external/supabaseUtils.js";
import {
  getBelowThresholdPrice,
  handleBelowThresholdInvoicing,
} from "./invoiceThresholdUtils.js";
import {
  AllowanceType,
  AppEnv,
  CusProductStatus,
  Customer,
  Feature,
  FeatureType,
  FullCustomerEntitlement,
  Organization,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { getCusEntsInFeatures } from "@/internal/api/customers/cusUtils.js";

import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { getFeatureBalance } from "@/internal/customers/entitlements/cusEntUtils.js";
import { Decimal } from "decimal.js";
import {
  getGroupBalanceFromProperties,
  initGroupBalancesForEvent,
} from "@/internal/customers/entitlements/groupByUtils.js";
import {
  deductAllowanceFromCusEnt,
  deductFromUsageBasedCusEnt,
} from "./updateBalanceTask.js";
import { JobName } from "@/queue/JobName.js";

// 2. Get deductions for each feature
const getFeatureDeductions = ({
  cusEnts,
  value,
  features,
  shouldSet,
}: {
  cusEnts: FullCustomerEntitlement[];
  value: number;
  features: Feature[];
  shouldSet: boolean;
}) => {
  let meteredFeature = features.find((f) => f.type === FeatureType.Metered)!;
  const featureDeductions = [];
  for (const feature of features) {
    let unlimitedExists = cusEnts.some(
      (cusEnt) =>
        cusEnt.entitlement.allowance_type === AllowanceType.Unlimited &&
        cusEnt.entitlement.internal_feature_id == feature.internal_id
    );

    if (unlimitedExists) {
      continue;
    }

    if (feature.type === FeatureType.CreditSystem) {
      value = featureToCreditSystem({
        featureId: meteredFeature.id,
        creditSystem: feature,
        amount: value,
      });
    }

    // If it's set
    let deduction = value;

    if (shouldSet) {
      let totalAllowance = cusEnts.reduce((acc, curr) => {
        return acc + (curr.entitlement.allowance || 0);
      }, 0);

      let targetBalance = new Decimal(totalAllowance).sub(value).toNumber();

      let totalBalance = getFeatureBalance({
        cusEnts,
        internalFeatureId: feature.internal_id!,
      })!;

      deduction = new Decimal(totalBalance).sub(targetBalance).toNumber();
    }

    if (deduction == 0) {
      console.log(`   - Skipping feature ${feature.id} -- deduction is 0`);
      continue;
    }

    featureDeductions.push({
      feature,
      deduction,
    });
  }

  featureDeductions.sort((a, b) => {
    if (
      a.feature.type === FeatureType.CreditSystem &&
      b.feature.type !== FeatureType.CreditSystem
    ) {
      return 1;
    }

    if (
      a.feature.type !== FeatureType.CreditSystem &&
      b.feature.type === FeatureType.CreditSystem
    ) {
      return -1;
    }

    return a.feature.id.localeCompare(b.feature.id);
  });

  return featureDeductions;
};

const logUsageUpdate = ({
  timeTaken,
  customer,
  features,
  cusEnts,
  featureDeductions,
  properties,
  org,
  setUsage,
}: {
  timeTaken: string;
  customer: Customer;
  features: Feature[];
  cusEnts: FullCustomerEntitlement[];
  featureDeductions: any;
  properties: any;
  org: Organization;
  setUsage: boolean;
}) => {
  console.log(`   - getCusEntsInFeatures: ${timeTaken}ms`);
  console.log(
    `   - Customer: ${customer.id} (${customer.env}) | Org: ${
      org.slug
    } | Features: ${features.map((f) => f.id).join(", ")} | Set Usage: ${
      setUsage ? "true" : "false"
    }`
  );

  console.log(
    "   - CusEnts:",
    cusEnts.map((cusEnt: any) => {
      let balanceStr = cusEnt.balance;
      let { groupVal, balance } = getGroupBalanceFromProperties({
        properties,
        cusEnt,
        features,
      });

      try {
        if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
          balanceStr = "Unlimited";
        } else if (groupVal) {
          balanceStr = `${balance} [${groupVal}]`;
        }
      } catch (error) {
        balanceStr = "failed_to_get_balance";
      }

      return `${cusEnt.feature_id} - ${balanceStr} (${
        cusEnt.customer_product ? cusEnt.customer_product.product_id : ""
      })`;
    }),
    "| Deductions:",
    featureDeductions.map((f: any) => `${f.feature.id}: ${f.deduction}`)
  );
};

// Main function to update customer balance
export const updateUsage = async ({
  sb,
  customer,
  features,
  org,
  env,
  value,
  properties,
  setUsage,
}: {
  sb: SupabaseClient;
  customer: Customer;
  features: Feature[];
  org: Organization;
  env: AppEnv;
  value: number;
  properties: any;
  setUsage: boolean;
}) => {
  const startTime = performance.now();
  const { cusEnts, cusPrices } = await getCusEntsInFeatures({
    sb,
    internalCustomerId: customer.internal_id,
    internalFeatureIds: features.map((f) => f.internal_id!),
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    withPrices: true,
  });
  const endTime = performance.now();

  // 1. Get deductions for each feature
  const featureDeductions = getFeatureDeductions({
    cusEnts,
    value,
    shouldSet: setUsage,
    features,
  });

  logUsageUpdate({
    timeTaken: (endTime - startTime).toFixed(2),
    customer,
    features,
    cusEnts,
    featureDeductions,
    properties,
    org,
    setUsage,
  });

  // 2. Handle group_by initialization
  await initGroupBalancesForEvent({
    sb,
    features,
    cusEnts,
    properties,
  });

  // 3. Return if no customer entitlements or features found
  if (cusEnts.length === 0 || features.length === 0) {
    console.log("   - No customer entitlements or features found");
    return;
  }

  // 4. Perform deductions and update customer balance
  for (const obj of featureDeductions) {
    let { feature, deduction: toDeduct } = obj;

    for (const cusEnt of cusEnts) {
      if (cusEnt.entitlement.internal_feature_id != feature.internal_id) {
        continue;
      }

      toDeduct = await deductAllowanceFromCusEnt({
        toDeduct,
        cusEnt,
        features,
        deductParams: {
          sb,
          feature,
          env,
          org,
          cusPrices: cusPrices as any[],
          customer,
          properties,
        },
        featureDeductions,
        willDeductCredits: true,
      });
    }

    if (toDeduct == 0) {
      continue;
    }

    await deductFromUsageBasedCusEnt({
      toDeduct,
      cusEnts,
      deductParams: {
        sb,
        feature,
        env,
        org,
        cusPrices: cusPrices as any[],
        customer,
        properties,
      },
    });
  }

  return cusEnts;
};

// MAIN FUNCTION
export const runUpdateUsageTask = async ({
  payload,
  logger,
}: {
  payload: any;
  logger: any;
}) => {
  try {
    const sb = createSupabaseClient();

    // 1. Update customer balance
    const { customer, features, value, set_usage, properties, org, env } =
      payload;

    console.log("--------------------------------");
    console.log(
      `HANDLING USAGE TASK FOR CUSTOMER (${customer.id}), ORG: ${org.slug}`
    );

    const cusEnts: any = await updateUsage({
      sb,
      customer,
      features,
      value,
      properties,
      org,
      env,
      setUsage: set_usage,
    });

    if (!cusEnts || cusEnts.length === 0) {
      return;
    }
    console.log("   ✅ Customer balance updated");

    // 2. Check if there's below threshold price
    const belowThresholdPrice = await getBelowThresholdPrice({
      sb,
      internalCustomerId: customer.internal_id,
      cusEnts,
    });

    if (belowThresholdPrice) {
      console.log("2. Below threshold price found");

      await handleBelowThresholdInvoicing({
        sb,
        internalCustomerId: payload.internalCustomerId,
        belowThresholdPrice,
      });
    } else {
      console.log("   ✅ No below threshold price found");
    }
  } catch (error) {
    if (logger) {
      logger.use((log: any) => {
        return {
          ...log,
          task: JobName.UpdateUsage,
          data: payload,
        };
      });

      logger.error(`ERROR UPDATING USAGE`);
      logger.error(error);
    } else {
      console.log(error);
    }
  }
};
