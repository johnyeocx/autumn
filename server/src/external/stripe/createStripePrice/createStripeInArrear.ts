import { PriceService } from "@/internal/prices/PriceService.js";
import { getPriceEntitlement } from "@/internal/prices/priceUtils.js";
import {
  Product,
  Price,
  Organization,
  EntitlementWithFeature,
  UsagePriceConfig,
  Feature,
  TierInfinite,
  Entitlement,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { billingIntervalToStripe } from "../stripePriceUtils.js";
import { Decimal } from "decimal.js";

export const searchStripeMeter = async ({
  stripeCli,
  eventName,
  meterId,
  logger,
}: {
  stripeCli: Stripe;
  eventName: string;
  meterId?: string;
  logger: any;
}) => {
  let allStripeMeters = [];
  let hasMore = true;
  let startingAfter;

  const start = performance.now();
  while (hasMore) {
    const response: any = await stripeCli.billing.meters.list({
      limit: 100,
      status: "active",
      starting_after: startingAfter,
    });

    allStripeMeters.push(...response.data);
    hasMore = response.has_more;

    if (hasMore && response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }
  const end = performance.now();
  logger.info(`Stripe meter list took ${end - start}ms`);

  let stripeMeter = allStripeMeters.find(
    (m) => m.event_name == eventName || m.id == meterId
  );

  return stripeMeter;
};

export const getStripeMeter = async ({
  product,
  feature,
  stripeCli,
  price,
  logger,
}: {
  product: Product;
  feature: Feature;
  stripeCli: Stripe;
  price: Price;
  logger: any;
}) => {
  let config = price.config as UsagePriceConfig;

  let createNew = false;
  try {
    let stripeMeter = await searchStripeMeter({
      stripeCli,
      eventName: price.id!,
      meterId: config.stripe_meter_id!,
      logger,
    });

    if (!stripeMeter) {
      createNew = true;
    } else {
      logger.info(
        `✅ Found existing meter for ${product.name} - ${feature!.name}`
      );
      return stripeMeter;
    }
  } catch (error) {
    createNew = true;
  }
  let meter = await stripeCli.billing.meters.create({
    display_name: `${product.name} - ${feature!.name}`,
    event_name: price.id!,
    default_aggregation: {
      formula: "sum",
    },
  });
  return meter;
};

// IN ARREAR
export const priceToInArrearTiers = (
  price: Price,
  entitlement: Entitlement
) => {
  let usageConfig = structuredClone(price.config) as UsagePriceConfig;
  const tiers: any[] = [];
  if (entitlement.allowance) {
    tiers.push({
      unit_amount: 0,
      up_to: entitlement.allowance,
    });

    for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
      let tier = usageConfig.usage_tiers[i];
      if (tier.to != -1 && tier.to != TierInfinite) {
        usageConfig.usage_tiers[i].to = (tier.to || 0) + entitlement.allowance;
      }
    }
  }

  for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
    const tier = usageConfig.usage_tiers[i];
    let amount = new Decimal(tier.amount)
      .div(usageConfig.billing_units ?? 1)
      .mul(100)
      .toString();

    tiers.push({
      unit_amount_decimal: amount,
      up_to: tier.to == -1 ? "inf" : tier.to,
    });
  }

  return tiers;
};

export const createStripeInArrearPrice = async ({
  sb,
  stripeCli,
  product,
  price,
  entitlements,
  org,
  logger,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  product: Product;
  price: Price;
  org: Organization;
  entitlements: EntitlementWithFeature[];
  logger: any;
}) => {
  let config = price.config as UsagePriceConfig;

  // 1. Create meter
  const feature = entitlements.find(
    (e) => e.internal_feature_id === config.internal_feature_id
  )!.feature;

  // 1. Get meter by event_name
  let meter = await getStripeMeter({
    product,
    feature,
    stripeCli,
    price,
    logger,
  });

  config.stripe_meter_id = meter.id;

  const tiers = priceToInArrearTiers(
    price,
    getPriceEntitlement(price, entitlements)
  );

  let priceAmountData = {};
  if (tiers.length == 1) {
    priceAmountData = {
      unit_amount_decimal: tiers[0].unit_amount_decimal,
    };
  } else {
    priceAmountData = {
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: tiers,
    };
  }

  let productData = {};
  if (config.stripe_product_id) {
    productData = {
      product: config.stripe_product_id,
    };
  } else {
    productData = {
      product_data: {
        name: `${product.name} - ${feature!.name}`,
      },
    };
  }

  const stripePrice = await stripeCli.prices.create({
    ...productData,
    ...priceAmountData,
    currency: org.default_currency,
    recurring: {
      ...(billingIntervalToStripe(price.config!.interval!) as any),
      meter: meter!.id,
      usage_type: "metered",
    },
    nickname: `Autumn Price (${price.name})`,
  });

  config.stripe_price_id = stripePrice.id;
  config.stripe_product_id = stripePrice.product as string;
  config.stripe_meter_id = meter!.id;
  await PriceService.update({
    sb,
    priceId: price.id!,
    update: { config },
  });
};
