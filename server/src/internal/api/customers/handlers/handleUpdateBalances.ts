import { handleRequestError } from "@/utils/errorUtils.js";

import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import RecaseError from "@/utils/errorUtils.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCusEntsInFeatures } from "../cusUtils.js";
import { Decimal } from "decimal.js";
import {
  deductAllowanceFromCusEnt,
  deductFromUsageBasedCusEnt,
} from "@/trigger/updateBalanceTask.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import {
  getGroupBalanceFromProperties,
  initGroupBalancesFromUpdateBalances,
} from "@/internal/customers/entitlements/groupByUtils.js";
import {
  notNullish,
  notNullOrUndefined,
  nullish,
  nullOrUndefined,
} from "@/utils/genUtils.js";
import {
  getUnlimitedAndUsageAllowed,
  updateCusEntInStripe,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";

const getCusFeaturesAndOrg = async (req: any, customerId: string) => {
  // 1. Get customer
  const [customer, features, org] = await Promise.all([
    CusService.getById({
      sb: req.sb,
      id: customerId,
      orgId: req.orgId,
      env: req.env,
    }),
    FeatureService.getFromReq(req),
    OrgService.getFullOrg({
      sb: req.sb,
      orgId: req.minOrg.id,
    }),
  ]);

  if (!customer) {
    throw new RecaseError({
      message: `Customer ${customerId} not found`,
      code: ErrCode.CustomerNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  return { customer, features, org };
};

export const handleUpdateBalances = async (req: any, res: any) => {
  try {
    const logger = req.logtail;
    const cusId = req.params.customer_id;
    const { sb, env } = req;
    const { balances } = req.body;

    if (!Array.isArray(balances)) {
      throw new RecaseError({
        message: "Balances must be an array",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    const { customer, features, org } = await getCusFeaturesAndOrg(req, cusId);

    const featuresToUpdate = features.filter((f: any) =>
      balances.map((b: any) => b.feature_id).includes(f.id)
    );

    if (featuresToUpdate.length === 0) {
      throw new RecaseError({
        message: "No valid features found to update",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // Can't update feature -> credit system here...

    const { cusEnts, cusPrices } = await getCusEntsInFeatures({
      sb: req.sb,
      internalCustomerId: customer.internal_id,
      internalFeatureIds: featuresToUpdate.map((f) => f.internal_id),
      inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
      withPrices: true,
    });

    // Initialize balances
    await initGroupBalancesFromUpdateBalances({
      sb: req.sb,
      cusEnts,
      features: featuresToUpdate,
      updates: balances,
    });

    logger.info("--------------------------------");
    logger.info(
      `REQUEST: UPDATE BALANCES FOR CUSTOMER ${customer.id}, ORG: ${req.minOrg.slug}`
    );
    logger.info(
      `Features to update: ${balances.map(
        (b: any) => `${b.feature_id} - ${b.unlimited ? "unlimited" : b.balance}`
      )}`
    );

    // Get deductions for each feature
    const featureDeductions = [];
    for (const balance of balances) {
      if (!balance.feature_id) {
        throw new RecaseError({
          message: "Feature ID is required",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (typeof balance.balance !== "number" && balance.unlimited !== true) {
        throw new RecaseError({
          message: "Balance must be a number",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      const feature = featuresToUpdate.find((f) => f.id === balance.feature_id);

      if (balance.unlimited === true) {
        featureDeductions.push({
          feature,
          unlimited: true,
          toDeduct: 0,
        });
        continue;
      }

      let { unlimited } = getUnlimitedAndUsageAllowed({
        cusEnts,
        internalFeatureId: feature.internal_id,
      });

      if (unlimited) {
        throw new RecaseError({
          message: `Can't set balance for unlimited feature: ${feature.id}`,
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      // Get deductions
      let newBalance = balance.balance;
      let curBalance = new Decimal(0);
      let properties = structuredClone(balance);
      delete properties.feature_id;
      delete properties.balance;

      for (const cusEnt of cusEnts) {
        if (cusEnt.internal_feature_id === feature.internal_id) {
          // curBalance = curBalance.add(new Decimal(cusEnt.balance!));
          const { groupVal, balance } = getGroupBalanceFromProperties({
            properties,
            feature,
            cusEnt,
            features: featuresToUpdate,
          });

          if (notNullish(groupVal) && nullish(balance)) {
            logger.info(
              `   - No balance found for group by value: ${groupVal}, for customer: ${customer.id}, skipping`
            );
            continue;
          }

          curBalance = curBalance.add(new Decimal(balance!));
        }
      }

      let toDeduct = curBalance.sub(newBalance).toNumber();

      if (toDeduct == 0) {
        logger.info(`Skipping ${feature.id} -- no change`);
      }

      featureDeductions.push({
        feature,
        toDeduct,
        properties,
      });
    }

    const batchDeduct = [];

    for (const featureDeduction of featureDeductions) {
      // 1. Deduct from allowance
      const performDeduction = async () => {
        let { toDeduct, feature, properties } = featureDeduction;

        // Handle unlimited
        if (featureDeduction.unlimited) {
          // Get one active cusEnt and set unlimited to true
          const cusEnt = cusEnts.find(
            (cusEnt) => cusEnt.internal_feature_id === feature.internal_id
          );

          if (!cusEnt) {
            logger.warn(
              `No active cus ent to set unlimited balance for feature: ${feature.id}`
            );
            return;
          }

          await CustomerEntitlementService.update({
            sb: req.sb,
            id: cusEnt.id,
            updates: {
              unlimited: true,
              next_reset_at: null,
            },
          });

          return;
        }

        for (const cusEnt of cusEnts) {
          if (
            cusEnt.internal_feature_id !== featureDeduction.feature.internal_id
          ) {
            continue;
          }

          toDeduct = await deductAllowanceFromCusEnt({
            toDeduct,
            deductParams: {
              sb: req.sb,
              feature,
              env: req.env,
              org,
              cusPrices: cusPrices as any[],
              customer,
              properties,
            },
            cusEnt,
            features,
            featureDeductions: [], // not important because not deducting credits
            willDeductCredits: false,
          });
        }

        if (toDeduct == 0) {
          return;
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
      };
      batchDeduct.push(performDeduction());
    }
    await Promise.all(batchDeduct);
    logger.info("   ✅ Successfully updated balances");

    res.status(200).json({ success: true });
  } catch (error) {
    handleRequestError({ req, error, res, action: "update customer balances" });
  }
};
