import {
  BillingInterval,
  BillingType,
  Price,
  Feature,
  Customer,
  FullCusProduct,
  UsagePriceConfig,
  FullProduct,
  Organization,
  Entitlement,
  EntitlementWithFeature,
} from "@autumn/shared";

import Stripe from "stripe";
import {
  compareBillingIntervals,
  getBillingType,
  getEntOptions,
  getPriceEntitlement,
  getPriceForOverage,
  getProductForPrice,
} from "@/internal/products/prices/priceUtils.js";

import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import { getExistingUsageFromCusProducts } from "@/internal/customers/entitlements/cusEntUtils.js";
import { priceToStripeItem } from "./priceToStripeItem/priceToStripeItem.js";
import { getFeatureName } from "@/internal/features/utils/displayUtils.js";
import { notNullish } from "@/utils/genUtils.js";

export const createSubMeta = ({ features }: { features: Feature[] }) => {
  const usageFeatures = features.map((f) => ({
    internal_id: f.internal_id,
    id: f.id,
  }));
  return { usage_features: JSON.stringify(usageFeatures) };
};

export const billingIntervalToStripe = (interval: BillingInterval) => {
  switch (interval) {
    case BillingInterval.Month:
      return {
        interval: "month",
        interval_count: 1,
      };
    case BillingInterval.Quarter:
      return {
        interval: "month",
        interval_count: 3,
      };
    case BillingInterval.SemiAnnual:
      return {
        interval: "month",
        interval_count: 6,
      };
    case BillingInterval.Year:
      return {
        interval: "year",
        interval_count: 1,
      };
    default:
      break;
  }
};

// STRIPE TO SUB ITEMS
export const getStripeSubItems = async ({
  attachParams,
  isCheckout = false,
  carryExistingUsages = false,
}: {
  attachParams: AttachParams;
  isCheckout?: boolean;
  carryExistingUsages?: boolean;
}) => {
  const { products, prices, entitlements, optionsList, org, cusProducts } =
    attachParams;

  prices.sort((a, b) => {
    // Put year prices first
    return -compareBillingIntervals(a.config!.interval!, b.config!.interval!);
  });

  // First do interval to prices
  const intervalToPrices: Record<string, Price[]> = {};

  for (const price of prices) {
    if (!intervalToPrices[price.config!.interval!]) {
      intervalToPrices[price.config!.interval!] = [];
    }
    intervalToPrices[price.config!.interval!].push(price);
  }

  let oneOffPrices =
    intervalToPrices[BillingInterval.OneOff] &&
    intervalToPrices[BillingInterval.OneOff].length > 0;

  // If there are multiple intervals, add one off prices to the top interval
  if (oneOffPrices && Object.keys(intervalToPrices).length > 1) {
    const nextIntervalKey = Object.keys(intervalToPrices)[0];
    intervalToPrices[nextIntervalKey!].push(
      ...structuredClone(intervalToPrices[BillingInterval.OneOff]),
    );
    delete intervalToPrices[BillingInterval.OneOff];
  }

  const itemSets: any[] = [];

  for (const interval in intervalToPrices) {
    // Get prices for this interval
    const prices = intervalToPrices[interval];

    let subItems: any[] = [];

    let usage_features: any[] = [];

    for (const price of prices) {
      const priceEnt = getPriceEntitlement(price, entitlements);
      const options = getEntOptions(optionsList, priceEnt);
      const billingType = getBillingType(price.config!);
      let existingUsage = getExistingUsageFromCusProducts({
        entitlement: priceEnt,
        cusProducts: attachParams.cusProducts,
        entities: attachParams.entities,
        carryExistingUsages,
        internalEntityId: attachParams.internalEntityId,
      });

      if (
        billingType == BillingType.UsageInArrear ||
        billingType == BillingType.InArrearProrated ||
        billingType == BillingType.UsageInAdvance
      ) {
        usage_features.push({
          internal_id: priceEnt.feature.internal_id,
          id: priceEnt.feature.id,
        });
      }

      let product = getProductForPrice(price, products)!;

      const stripeItem = priceToStripeItem({
        price,
        product,
        org,
        options,
        isCheckout,
        relatedEnt: priceEnt,
        existingUsage,
        withEntity: notNullish(attachParams.internalEntityId),
      });

      if (!stripeItem) {
        continue;
      }

      const { lineItem } = stripeItem;

      subItems.push(lineItem);
    }

    if (subItems.length == 0) {
      // Get all monthly items...
      subItems.push(
        ...getArrearItems({
          prices,
          org,
          interval: interval as BillingInterval,
          products,
          entitlements,
        }),
      );
    }

    itemSets.push({
      items: subItems,
      interval,
      subMeta: {
        usage_features: JSON.stringify(usage_features),
      },
      usageFeatures: usage_features.map((f) => f.internal_id) || [],
      prices,
    });
  }

  itemSets.sort((a, b) => {
    let order = [
      BillingInterval.Year,
      BillingInterval.SemiAnnual,
      BillingInterval.Quarter,
      BillingInterval.Month,
      BillingInterval.OneOff,
    ];
    return order.indexOf(a.interval) - order.indexOf(b.interval);
  });

  return itemSets;
};

export const getInvoiceItemForUsage = ({
  stripeInvoiceId,
  price,
  feature,
  totalUsage,
  overage,
  currency,
  customer,
  cusProduct,
  logger,
  periodStart,
  periodEnd,
}: {
  stripeInvoiceId: string;
  price: Price;
  feature: Feature;
  totalUsage: number;
  overage: number;
  currency: string;
  customer: Customer;
  cusProduct: FullCusProduct;
  logger: any;
  periodStart: number;
  periodEnd: number;
}) => {
  let priceAmount = getPriceForOverage(price, overage);
  let featureName = getFeatureName({
    feature,
    plural: totalUsage == 1 ? false : true,
    capitalize: true,
  });

  let config = price.config! as UsagePriceConfig;
  let invoiceItem: Stripe.InvoiceItemCreateParams = {
    invoice: stripeInvoiceId,
    customer: customer.processor.id,
    currency,

    description: `${cusProduct.product.name} - ${featureName} x ${Math.round(
      totalUsage,
    )}`,

    price_data: {
      product: config.stripe_product_id!,
      unit_amount: Math.max(Math.round(priceAmount * 100), 0),
      currency,
    },
    period: {
      start: periodStart,
      end: periodEnd,
    },
  };

  logger.info(
    `🌟🌟 Created invoice item for ${
      feature.name
    } usage. Amount: ${priceAmount.toFixed(2)}, Total Usage: ${totalUsage}`,
  );

  return invoiceItem;
};

export const getArrearItems = ({
  prices,
  products,
  entitlements,
  org,
  interval,
}: {
  prices: Price[];
  products: FullProduct[];
  entitlements: EntitlementWithFeature[];
  interval: BillingInterval;
  org: Organization;
}) => {
  let placeholderItems: any[] = [];
  for (const price of prices) {
    let billingType = getBillingType(price.config!);
    if (price.config!.interval! != interval) {
      continue;
    }

    if (billingType == BillingType.UsageInArrear) {
      let config = price.config! as UsagePriceConfig;
      placeholderItems.push({
        price_data: {
          product: config.stripe_product_id!,
          unit_amount: 0,
          currency: org.default_currency || "usd",
          recurring: {
            ...billingIntervalToStripe(interval),
          },
        },
        quantity: 0,
      });
    }
  }

  return placeholderItems;
};

export const getPlaceholderItem = ({
  product,
  org,
  interval,
}: {
  product: FullProduct;
  org: Organization;
  interval: BillingInterval;
}) => {
  return {
    price_data: {
      product: product.processor!.id,
      unit_amount: 0,
      currency: org.default_currency || "usd",
      recurring: {
        ...billingIntervalToStripe(interval as BillingInterval),
      },
    },
    quantity: 0,
  };
};
