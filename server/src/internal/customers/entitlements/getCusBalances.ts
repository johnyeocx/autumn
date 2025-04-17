import {
  APIVersion,
  EntitlementWithFeature,
  Entity,
  Feature,
  FeatureType,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
} from "@autumn/shared";
import { getEntOptions } from "@/internal/prices/priceUtils.js";

import { notNullOrUndefined } from "@/utils/genUtils.js";

import { BREAK_API_VERSION } from "@/utils/constants.js";
import {
  getCusEntMasterBalance,
  getRelatedCusPrice,
  getResetBalance,
  getUnlimitedAndUsageAllowed,
} from "./cusEntUtils.js";

export const getV1EntitlementsRes = ({
  org,
  cusEnt,
  isBoolean,
  unlimited,
  ent,
}: {
  org: Organization;
  cusEnt: FullCustomerEntitlement;
  isBoolean: boolean;
  unlimited: boolean;
  ent: EntitlementWithFeature;
}) => {
  let res: any =  {
    feature_id: ent.feature.id,
    unlimited: isBoolean ? undefined : unlimited,
    interval: isBoolean || unlimited ? null : ent.interval || undefined,
    balance: isBoolean ? undefined : unlimited ? null : 0,
    total: isBoolean || unlimited ? undefined : 0,
    adjustment: isBoolean || unlimited ? undefined : 0,
    used: isBoolean ? undefined : unlimited ? null : 0,
    unused: 0,
  };

  if (org.config.api_version >= BREAK_API_VERSION) {
    res.next_reset_at =
      isBoolean || unlimited ? undefined : cusEnt.next_reset_at;
    res.allowance = isBoolean || unlimited ? undefined : 0;
  }

  return res;
}
  

// IMPORTANT FUNCTION
export const getCusBalances = async ({
  cusEntsWithCusProduct,
  cusPrices,
  entities,
  org,
}: {
  cusEntsWithCusProduct: (FullCustomerEntitlement & {
    customer_product: FullCusProduct;
  })[];
  cusPrices: FullCustomerPrice[];
  entities: Entity[];
  org: Organization;
}) => {
  const data: Record<string, any> = {};
  const features = cusEntsWithCusProduct.map((cusEnt) => cusEnt.entitlement.feature);

  
  for (const cusEnt of cusEntsWithCusProduct) {
    const cusProduct = cusEnt.customer_product;
    const feature = cusEnt.entitlement.feature;
    const ent: EntitlementWithFeature = cusEnt.entitlement;
    let key = `${ent.interval || "no-interval"}-${feature.id}`;

    
    // 1. Handle boolean
    let isBoolean = feature.type == FeatureType.Boolean;
    const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
      cusEnts: cusEntsWithCusProduct,
      internalFeatureId: feature.internal_id!,
    });

    // 1. Initialize balance object
    if (!data[key] && org.api_version == APIVersion.v1) {
      data[key] = getV1EntitlementsRes({
        org,
        cusEnt,
        isBoolean,
        unlimited,
        ent,
      });
    } else if (!data[key]) {
      if (isBoolean) {
        data[key] = {
          feature_id: feature.id,
        };
      } else if (unlimited) {
        data[key] = {
          feature_id: feature.id,
          unlimited: true,
        };
      } else {
        data[key] = {
          feature_id: feature.id, 
          unlimited: isBoolean ? undefined : unlimited,
          interval: isBoolean || unlimited ? undefined : ent.interval || undefined,
          balance: isBoolean ? undefined : unlimited ? null : 0,
          total: isBoolean || unlimited ? undefined : 0,
          adjustment: isBoolean || unlimited ? undefined : 0,
          used: isBoolean ? undefined : unlimited ? null : 0,
          unused: 0,
        };
  
        if (org.config.api_version >= BREAK_API_VERSION) {
          data[key].next_reset_at =
            isBoolean || unlimited ? undefined : cusEnt.next_reset_at;
          data[key].allowance = isBoolean || unlimited ? undefined : 0;
        }
      }
    }

    // // 2. Initialize data
    // // if (!data[key]) {
    //   data[key] = {
    //     feature_id: feature.id,
    //     unlimited: isBoolean ? undefined : unlimited,
    //     interval: isBoolean || unlimited ? undefined : ent.interval || undefined,
    //     balance: isBoolean ? undefined : unlimited ? null : 0,
    //     total: isBoolean || unlimited ? undefined : 0,
    //     adjustment: isBoolean || unlimited ? undefined : 0,
    //     used: isBoolean ? undefined : unlimited ? null : 0,
    //     unused: 0,
    //   };

    //   if (org.config.api_version >= BREAK_API_VERSION) {
    //     data[key].next_reset_at =
    //       isBoolean || unlimited ? undefined : cusEnt.next_reset_at;
    //     data[key].allowance = isBoolean || unlimited ? undefined : 0;
    //   }
    // // }

    if (isBoolean || unlimited) {
      continue;
    }

    

    let { balance, adjustment, count, unused } = getCusEntMasterBalance({
      cusEnt,
      entities,
    });

    data[key].balance += balance || 0;
    data[key].adjustment += adjustment || 0;
    let total =
      (getResetBalance({
        entitlement: ent,
        options: getEntOptions(cusProduct.options, ent),
        relatedPrice: getRelatedCusPrice(cusEnt, cusPrices)?.price,
        productQuantity: cusProduct.quantity || 1,
      }) || 0) * count;

    data[key].total += total;
    data[key].unused += unused || 0;

    if (org.config.api_version >= BREAK_API_VERSION) {
      if (
        !data[key].next_reset_at ||
        (cusEnt.next_reset_at && cusEnt.next_reset_at < data[key].next_reset_at)
      ) {
        data[key].next_reset_at = cusEnt.next_reset_at;
      }

      data[key].allowance += getResetBalance({
        entitlement: ent,
        options: getEntOptions(cusProduct.options, ent),
        relatedPrice: getRelatedCusPrice(cusEnt, cusPrices)?.price,
      });
    }

  }

  const balances = Object.values(data);

  

  for (const balance of balances) {
    if (
      notNullOrUndefined(balance.total) &&
      notNullOrUndefined(balance.balance)
    ) {
      balance.used =
        balance.total +
        balance.adjustment -
        balance.balance -
        (balance.unused || 0);

      delete balance.total;
      delete balance.adjustment;
    }
    delete balance.unused;
  }


  // Sort balances
  if (org.api_version == APIVersion.v1) {
    balances.sort((a: any, b: any) => {
      let featureA = features.find((f) => f.id == a.feature_id);
      let featureB = features.find((f) => f.id == b.feature_id);
  
      if (featureA?.type == FeatureType.Boolean && featureB?.type != FeatureType.Boolean) {
        return -1;
      } else if (featureA?.type != FeatureType.Boolean && featureB?.type == FeatureType.Boolean) {
        return 1;
      }
  
      if (a.unlimited && !b.unlimited) {
        return -1;
      } else if (!a.unlimited && b.unlimited) {
        return 1;
      }
  
      return a.feature_id.localeCompare(b.feature_id);
    });
  }

  return balances;
};
