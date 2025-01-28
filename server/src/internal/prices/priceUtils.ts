import { priceToStripeItem } from "@/external/stripe/stripePriceUtils.js";
import { compareObjects } from "@/utils/genUtils.js";
import {
  BillWhen,
  BillingInterval,
  BillingType,
  FixedPriceConfig,
  Price,
  PriceType,
  UsagePriceConfig,
  Entitlement,
  EntitlementWithFeature,
  FeatureOptions,
} from "@autumn/shared";
import { AttachParams } from "../customers/products/AttachParams.js";

export const getBillingType = (config: FixedPriceConfig | UsagePriceConfig) => {
  if (
    config.type == PriceType.Fixed &&
    config.interval == BillingInterval.OneOff
  ) {
    return BillingType.OneOff;
  } else if (config.type == PriceType.Fixed) {
    return BillingType.FixedCycle;
  }

  let usageConfig = config as UsagePriceConfig;
  if (usageConfig.bill_when == BillWhen.InAdvance) {
    return BillingType.UsageInAdvance;
  } else if (usageConfig.bill_when == BillWhen.BelowThreshold) {
    return BillingType.UsageBelowThreshold;
  }

  return BillingType.UsageInArrear;
};

export const getBillingInterval = (prices: Price[]) => {
  for (const price of prices) {
    if (price.config && price.config.interval) {
      return price.config.interval;
    }
  }
  return null;
};

export const pricesOnlyOneOff = (prices: Price[]) => {
  for (const price of prices) {
    if (price.billing_type != BillingType.OneOff) {
      return false;
    }
  }
  return true;
};

export const pricesContainRecurring = (prices: Price[]) => {
  return prices.some((price) => price.billing_type != BillingType.OneOff);
};

export const pricesOnlyRequireSetup = (prices: Price[]) => {
  return prices.every((price) => {
    return (
      price.billing_type == BillingType.UsageBelowThreshold ||
      price.billing_type == BillingType.UsageInArrear
    );
  });
};

// Check if prices have different recurring intervals
export const haveDifferentRecurringIntervals = (prices: Price[]) => {
  let interval = null;

  for (const price of prices) {
    const newInterval = price.config?.interval;

    if (newInterval == BillingInterval.OneOff) {
      continue;
    }

    if (interval !== null && newInterval !== null && newInterval !== interval) {
      return true;
    }

    interval = newInterval;
  }
  return false;
};

// Get bill now vs bill later prices
export const getBillNowPrices = (prices: Price[]) => {
  return prices.filter(
    (price) =>
      price.billing_type == BillingType.OneOff ||
      price.billing_type == BillingType.FixedCycle ||
      price.billing_type == BillingType.UsageInAdvance
  );
};

export const getBillLaterPrices = (prices: Price[]) => {
  return prices.filter(
    (price) =>
      price.billing_type == BillingType.UsageBelowThreshold ||
      price.billing_type == BillingType.UsageInArrear
  );
};

// Get price options
export const getEntOptions = (
  optionsList: FeatureOptions[],
  entitlement: Entitlement | EntitlementWithFeature
) => {
  if (!entitlement) {
    return null;
  }
  const options = optionsList.find(
    (options) => options.internal_feature_id === entitlement.internal_feature_id
  );
  return options;
};

export const getPriceEntitlement = (
  price: Price,
  entitlements: EntitlementWithFeature[]
) => {
  let config = price.config as UsagePriceConfig;

  const entitlement = entitlements.find(
    (ent) => ent.internal_feature_id === config.internal_feature_id
  );

  return entitlement as EntitlementWithFeature;
};

export const pricesAreSame = (price1: Price, price2: Price) => {
  for (const key in price1.config) {
    const originalValue = (price1.config as any)[key];
    const newValue = (price2.config as any)[key];

    if (key == "usage_tiers") {
      for (let i = 0; i < originalValue.length; i++) {
        const originalTier = originalValue[i];
        const newTier = newValue[i];
        if (!compareObjects(originalTier, newTier)) {
          return false;
        }
      }
    } else if (originalValue !== newValue) {
      return false;
    }
  }

  return true;
};

export function compareBillingIntervals(
  a: BillingInterval | null,
  b: BillingInterval | null
): number {
  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  const priority = {
    [BillingInterval.OneOff]: 0,
    [BillingInterval.Month]: 1,
    [BillingInterval.Year]: 2,
    [BillingInterval.Quarter]: 3,
    [BillingInterval.SemiAnnual]: 4,
  };

  return priority[a] - priority[b];
}

// Stripe items
export const getStripeSubItems = ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  const { product, prices, entitlements, optionsList, org } = attachParams;
  const billNowPrices = getBillNowPrices(prices);

  let subItems: any[] = [];

  // TODO: Check if non bill now prices can be added to stripe subscription...?
  for (const price of billNowPrices) {
    const priceEnt = getPriceEntitlement(price, entitlements);
    const options = getEntOptions(optionsList, priceEnt);

    subItems.push(
      priceToStripeItem({
        price,
        product,
        org,
        options,
      })
    );
  }
  return subItems;
};
