import {
  AppEnv,
  BillingInterval,
  BillingType,
  Entitlement,
  EntitlementSchema,
  EntitlementWithFeature,
  ErrCode,
  Feature,
  Organization,
  Price,
  PriceSchema,
  PriceType,
  ProcessorType,
  ProductSchema,
  UsagePriceConfig,
} from "@autumn/shared";
import { FullProduct } from "@autumn/shared";
import {
  compareBillingIntervals,
  getBillingInterval,
  getBillingType,
} from "@/internal/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { ProductService } from "./ProductService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  AttachParams,
  InsertCusProductParams,
} from "../customers/products/AttachParams.js";
import { getEntitlementsForProduct } from "./entitlements/entitlementUtils.js";
import { Decimal } from "decimal.js";
import { generateId } from "@/utils/genUtils.js";
import { PriceService } from "../prices/PriceService.js";
import { EntitlementService } from "./entitlements/EntitlementService.js";
import RecaseError from "@/utils/errorUtils.js";

export const isProductUpgrade = ({
  prices1,
  prices2,
}: {
  prices1: Price[];
  prices2: Price[];
}) => {
  if (
    prices1.every(
      (p) => getBillingType(p.config!) === BillingType.UsageInArrear
    ) &&
    prices2.every(
      (p) => getBillingType(p.config!) === BillingType.UsageInArrear
    )
  ) {
    return true;
  }

  let billingInterval1 = getBillingInterval(prices1);
  let billingInterval2 = getBillingInterval(prices2);

  // 2. Get total price for each product
  const getTotalPrice = (prices: Price[]) => {
    // Get each product's price prorated to a year
    let totalPrice = new Decimal(0);
    for (const price of prices) {
      let interval = price.config?.interval;

      if (!interval || interval === BillingInterval.OneOff) {
        continue;
      }

      if ("usage_tiers" in price.config!) {
        // Just get total price for first tier
        totalPrice = totalPrice.plus(price.config!.usage_tiers[0].amount);
      } else {
        totalPrice = totalPrice.plus(price.config!.amount);
      }
    }
    return totalPrice.toNumber();
  };

  // 3. Compare prices
  if (billingInterval1 == billingInterval2) {
    return getTotalPrice(prices1) < getTotalPrice(prices2);
  } else {
    // If billing interval is different, compare the billing intervals
    return compareBillingIntervals(billingInterval1, billingInterval2) < 0;
  }
};

export const isSameBillingInterval = (
  product1: FullProduct,
  product2: FullProduct
) => {
  return (
    getBillingInterval(product1.prices) === getBillingInterval(product2.prices)
  );
};

export const isFreeProduct = (prices: Price[]) => {
  if (prices.length === 0) {
    return true;
  }

  let totalPrice = 0;
  for (const price of prices) {
    if ("usage_tiers" in price.config!) {
      totalPrice += price.config!.usage_tiers.reduce(
        (acc, tier) => acc + tier.amount,
        0
      );
    } else {
      totalPrice += price.config!.amount;
    }
  }
  return totalPrice === 0;
};

export const getOptionsFromPrices = (prices: Price[], features: Feature[]) => {
  const featureToOptions: { [key: string]: any } = {};
  for (const price of prices) {
    if (price.config!.type == PriceType.Fixed) {
      continue;
    }

    const config = price.config! as UsagePriceConfig;
    // get billing tyoe
    const billingType = getBillingType(price.config!);
    const feature = features.find(
      (f) => f.internal_id === config.internal_feature_id
    );

    if (!feature) {
      continue;
    }

    if (billingType === BillingType.UsageBelowThreshold) {
      if (!featureToOptions[feature.id]) {
        featureToOptions[feature.id] = {
          feature_id: feature.id,
          feature_name: feature.name,
          threshold: 0,
        };
      } else {
        featureToOptions[feature.id].threshold = 0;
      }
    } else if (billingType === BillingType.UsageInAdvance) {
      if (!featureToOptions[feature.id]) {
        featureToOptions[feature.id] = {
          feature_id: feature.id,
          feature_name: feature.name,
          quantity: 0,
        };
      }

      featureToOptions[feature.id].quantity = 0;
    }
  }

  return Object.values(featureToOptions);
};

export const checkStripeProductExists = async ({
  sb,
  org,
  env,
  product,
  logger,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  logger: any;
}) => {
  let createNew = false;
  let stripeCli = createStripeCli({
    org,
    env,
  });

  if (!product.processor || !product.processor.id) {
    createNew = true;
  } else {
    try {
      let stripeProduct = await stripeCli.products.retrieve(
        product.processor!.id
      );
      if (!stripeProduct.active) {
        createNew = true;
      }
    } catch (error) {
      createNew = true;
    }
  }

  if (createNew) {
    logger.info(`Creating new product in Stripe for ${product.name}`);
    const stripeProduct = await stripeCli.products.create({
      name: product.name,
    });

    await ProductService.update({
      sb,
      internalId: product.internal_id,
      update: {
        processor: { id: stripeProduct.id, type: ProcessorType.Stripe },
      },
    });

    product.processor = {
      id: stripeProduct.id,
      type: ProcessorType.Stripe,
    };
  }
};

export const getPricesForProduct = (product: FullProduct, prices: Price[]) => {
  return prices.filter((p) => p.internal_product_id === product.internal_id);
};

export const attachToInsertParams = (
  attachParams: AttachParams,
  product: FullProduct
) => {
  return {
    ...attachParams,
    product,
    prices: getPricesForProduct(product, attachParams.prices),
    entitlements: getEntitlementsForProduct(product, attachParams.entitlements),
  } as InsertCusProductParams;
};

// COPY PRODUCT
export const copyProduct = async ({
  sb,
  product,
  toOrgId,
  toEnv,
  features,
}: {
  sb: SupabaseClient;
  product: FullProduct;
  toOrgId: string;
  toEnv: AppEnv;
  features: Feature[];
}) => {
  const newProduct = {
    ...product,
    name: `${product.name}`,
    id: `${product.id}`,
    internal_id: generateId("prod"),
    org_id: toOrgId,
    env: toEnv,
    processor: null,
  };

  const newPrices = product.prices.map((price) => {
    let copiedPrice = structuredClone(price);

    delete copiedPrice.config!.stripe_price_id;
    delete (copiedPrice.config! as UsagePriceConfig).stripe_meter_id;
    delete (copiedPrice.config! as UsagePriceConfig).stripe_product_id;

    return PriceSchema.parse({
      ...copiedPrice,
      id: generateId("pr"),
      org_id: toOrgId,
      internal_product_id: newProduct.internal_id,
      env: toEnv,
    });
  });

  const newEntitlements = product.entitlements.map(
    (entitlement: Entitlement) => {
      let feature = features.find((f) => f.id === entitlement.feature_id);
      if (!feature) {
        throw new RecaseError({
          message: `Feature ${entitlement.feature_id} not found`,
          code: ErrCode.FeatureNotFound,
          statusCode: 404,
        });
      }

      return EntitlementSchema.parse({
        ...entitlement,
        id: generateId("ent"),
        org_id: toOrgId,
        internal_product_id: newProduct.internal_id,
        internal_feature_id: feature.internal_id,
      });
    }
  );

  await ProductService.create({
    sb,
    product: ProductSchema.parse(newProduct),
  });

  await Promise.all([
    PriceService.insert({
      sb,
      data: newPrices,
    }),

    EntitlementService.insert({
      sb,
      data: newEntitlements,
    }),
  ]);
};
