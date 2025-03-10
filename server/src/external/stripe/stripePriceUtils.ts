import {
  BillingInterval,
  BillingType,
  FixedPriceConfig,
  Organization,
  FullProduct,
  Price,
  UsagePriceConfig,
  FeatureOptions,
  Product,
  AllowanceType,
  EntitlementWithFeature,
} from "@autumn/shared";

import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import Stripe from "stripe";
import {
  compareBillingIntervals,
  getBillingType,
  getCheckoutRelevantPrices,
  getEntOptions,
  getPriceAmount,
  getPriceEntitlement,
  getPriceForOverage,
  getPriceOptions,
  getProductForPrice,
  priceIsOneOffAndTiered,
} from "@/internal/prices/priceUtils.js";

import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import { nullOrUndefined } from "@/utils/genUtils.js";

import {
  createStripeFixedCyclePrice,
  createStripeInAdvancePrice,
  createStripeInArrearPrice,
} from "./createStripePrice.js";

import { getExistingUsageFromCusProducts } from "@/internal/customers/entitlements/cusEntUtils.js";

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

// GET STRIPE LINE / SUB ITEM
export const priceToStripeItem = ({
  price,
  relatedEnt,
  product,
  org,
  options,
  isCheckout = false,
  existingUsage,
}: {
  price: Price;
  relatedEnt: EntitlementWithFeature;
  product: FullProduct;
  org: Organization;
  options: FeatureOptions | undefined | null;
  isCheckout: boolean;
  existingUsage: number;
}) => {
  // TODO: Implement this
  const billingType = price.billing_type;
  const stripeProductId = product.processor?.id;

  if (!stripeProductId) {
    throw new RecaseError({
      code: ErrCode.ProductNotFound,
      message: "Product not created in Stripe",
      statusCode: 400,
    });
  }

  let lineItemMeta = null;
  let lineItem = null;
  if (billingType == BillingType.OneOff) {
    const config = price.config as FixedPriceConfig;

    lineItem = {
      quantity: 1,
      price_data: {
        product: stripeProductId,
        unit_amount: Math.round(config.amount * 100),
        currency: org.default_currency,
      },
    };
  } else if (billingType == BillingType.FixedCycle) {
    const config = price.config as FixedPriceConfig;
    lineItem = {
      price: config.stripe_price_id,
      quantity: 1,
    };
    // lineItem = {
    //   quantity: 1,
    //   price_data: {
    //     product: stripeProductId,
    //     unit_amount: Math.round(config.amount * 100),
    //     currency: org.default_currency,
    //     recurring: billingIntervalToStripe(config.interval as BillingInterval),
    //   },
    // };
  } else if (
    billingType == BillingType.UsageInAdvance &&
    priceIsOneOffAndTiered(price, relatedEnt)
  ) {
    const config = price.config as UsagePriceConfig;
    let quantity = options?.quantity!;
    let overage = quantity * config.billing_units! - relatedEnt.allowance!;
    // console.log("Overage:", overage);
    // console.log("Quantity:", quantity);
    // console.log("Allowance:", relatedEnt.allowance);
    if (overage <= 0) {
      return null;
    }
    const amount = getPriceForOverage(price, overage);
    // let perUnitAmount = new Decimal(amount).div(overage).toNumber();
    if (!config.stripe_product_id) {
      console.log(
        `WARNING: One off & tiered in advance price has no stripe product id: ${price.id}, ${relatedEnt.feature.name}`
      );
    }
    lineItem = {
      price_data: {
        product: config.stripe_product_id
          ? config.stripe_product_id
          : stripeProductId,
        unit_amount: Number(amount.toFixed(2)) * 100,
        currency: org.default_currency,
      },
      // quantity: overage,
      quantity: 1,
    };
  } else if (billingType == BillingType.UsageInAdvance) {
    const config = price.config as UsagePriceConfig;
    let quantity = options?.quantity;

    // 1. If quantity is 0 and is checkout, skip over line item
    if (options?.quantity === 0 && isCheckout) {
      console.log(`Quantity for ${config.feature_id} is 0`);
      return null;
    }

    // 2. If quantity is null or undefined and is checkout, default to 1
    else if (nullOrUndefined(quantity) && isCheckout) {
      quantity = 1;
    }

    const adjustableQuantity = isCheckout
      ? {
          enabled: true,
          maximum: 999999,
          minimum: relatedEnt.allowance,
        }
      : undefined;

    if (!config.stripe_price_id) {
      throw new RecaseError({
        code: ErrCode.PriceNotFound,
        message: `Price ${price.id} has no Stripe price id`,
        statusCode: 400,
      });
    }

    lineItem = {
      price: config.stripe_price_id,
      quantity: quantity,
      adjustable_quantity: adjustableQuantity,
    };
    // lineItemMeta = {
    //   internal_feature_id: config.internal_feature_id,
    //   feature_id: config.feature_id,
    //   price_id: price.id,
    // };
  } else if (billingType == BillingType.UsageInArrear) {
    // TODO: Implement this
    const config = price.config as UsagePriceConfig;
    const priceId = config.stripe_price_id;

    if (!priceId) {
      throw new RecaseError({
        code: ErrCode.PriceNotFound,
        message: `Couldn't find price: ${price.name}, ${price.id} in Stripe`,
        statusCode: 400,
      });
    }

    lineItem = {
      price: priceId,
    };
  } else if (billingType == BillingType.InArrearProrated) {
    const config = price.config as UsagePriceConfig;
    let quantity = existingUsage || 0;
    if (quantity == 0 && isCheckout) {
      // Get product id...
      lineItem = {
        price: config.stripe_placeholder_price_id,
      };
    } else {
      lineItem = {
        price: config.stripe_price_id,
        quantity,
      };
    }

    // OLD
    // TODO: Implement this
    // if (isCheckout) {
    //   let config = price.config as UsagePriceConfig;
    //   lineItem = {
    //     price: config.stripe_price_id!,
    //   };
    // } else {
    //   return null;
    // }
    // lineItem = {
    //   price: price.config!.stripe_price_id!,
    // };
  }

  return {
    lineItem,
    lineItemMeta,
  };
};

// STRIPE TO SUB ITEMS
export const getStripeSubItems = async ({
  attachParams,
  isCheckout = false,
}: {
  attachParams: AttachParams;
  isCheckout?: boolean;
}) => {
  const { products, prices, entitlements, optionsList, org, cusProducts } =
    attachParams;

  const checkoutRelevantPrices = getCheckoutRelevantPrices(prices);
  checkoutRelevantPrices.sort((a, b) => {
    // Put year prices first
    return -compareBillingIntervals(a.config!.interval!, b.config!.interval!);
  });

  // First do interval to prices
  const intervalToPrices: Record<string, Price[]> = {};

  for (const price of checkoutRelevantPrices) {
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
      ...structuredClone(intervalToPrices[BillingInterval.OneOff])
    );
    delete intervalToPrices[BillingInterval.OneOff];
  }

  const itemSets: any[] = [];

  for (const interval in intervalToPrices) {
    // Get prices for this interval
    const prices = intervalToPrices[interval];

    let subItems: any[] = [];
    let itemMetas: any[] = [];

    let usage_features: any[] = [];

    for (const price of prices) {
      const priceEnt = getPriceEntitlement(price, entitlements);
      const options = getEntOptions(optionsList, priceEnt);
      const billingType = getBillingType(price.config!);
      const existingUsage = getExistingUsageFromCusProducts({
        entitlement: priceEnt,
        cusProducts: attachParams.cusProducts,
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
      });

      if (!stripeItem) {
        continue;
      }

      const { lineItem, lineItemMeta } = stripeItem;

      subItems.push(lineItem);
      itemMetas.push(lineItemMeta);
    }

    itemSets.push({
      items: subItems,
      itemMetas,
      interval,
      subMeta: {
        usage_features: JSON.stringify(usage_features),
      },
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

const getProductIdFromPrice = async ({
  stripeCli,
  price,
}: {
  stripeCli: Stripe;
  price: Price;
}) => {
  const config = price.config as UsagePriceConfig;
  if (!config.stripe_product_id) {
    return null;
  }

  try {
    const stripeProduct = await stripeCli.products.retrieve(
      config.stripe_product_id!
    );
    if (!stripeProduct.active) {
      return null;
    }
    return config.stripe_product_id;
  } catch (error) {
    return null;
  }
};

export const pricesToInvoiceItems = async ({
  sb,
  stripeCli,
  attachParams,
  stripeInvoiceId,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  attachParams: AttachParams;
  stripeInvoiceId: string;
}) => {
  const { prices, optionsList, entitlements, products, customer } =
    attachParams;
  for (const price of prices) {
    // Calculate amount
    const options = getPriceOptions(price, optionsList);
    const entitlement = getPriceEntitlement(price, entitlements);
    const { amountPerUnit, quantity } = getPriceAmount(price, options!);

    let allowanceStr = "";
    if (entitlement) {
      allowanceStr =
        entitlement.allowance_type == AllowanceType.Unlimited
          ? "Unlimited"
          : entitlement.allowance_type == AllowanceType.None
          ? "None"
          : `${entitlement.allowance}`;
      allowanceStr = `x ${allowanceStr} (${entitlement.feature.name})`;
    }

    let product = getProductForPrice(price, products)!;

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: amountPerUnit * quantity * 100,
      invoice: stripeInvoiceId,
      description: `Invoice for ${product.name} -- ${quantity}${allowanceStr}`,
    });
  }
};

export const createStripePriceIFNotExist = async ({
  sb,
  stripeCli,
  price,
  entitlements,
  product,
  org,
  logger,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  price: Price;
  entitlements: EntitlementWithFeature[];
  product: Product;
  org: Organization;
  logger: any;
}) => {
  const billingType = getBillingType(price.config!);

  let config = price.config! as UsagePriceConfig;

  try {
    if (config.stripe_price_id) {
      const stripePrice = await stripeCli.prices.retrieve(
        config.stripe_price_id
      );

      if (!stripePrice.active) {
        config.stripe_price_id = undefined;
        config.stripe_meter_id = undefined;
      }

      if (config.stripe_product_id) {
        const stripeProduct = await stripeCli.products.retrieve(
          config.stripe_product_id as string
        );

        if (!stripeProduct.active) {
          config.stripe_product_id = null;
        }
      }
    }
  } catch (error: any) {
    logger.info("Stripe price not found / inactive");
    logger.info("Error:", error.message);
    config.stripe_price_id = undefined;
    config.stripe_meter_id = undefined;
  }

  if (billingType == BillingType.FixedCycle) {
    if (!config.stripe_price_id) {
      logger.info("Creating stripe fixed cycle price");
      await createStripeFixedCyclePrice({
        sb,
        stripeCli,
        price,
        product,
        org,
      });
    }
  } else if (billingType == BillingType.UsageInAdvance) {
    // If tiered and one off
    let relatedEnt = getPriceEntitlement(price, entitlements);
    let isOneOffAndTiered = priceIsOneOffAndTiered(price, relatedEnt);

    if (isOneOffAndTiered) {
      // Check if product_id doesn't exist -- create
      let productId = await getProductIdFromPrice({
        stripeCli,
        price,
      });

      if (!productId) {
        logger.info(
          "Creating stripe product for in advance price, one off & tiered"
        );
        await createStripeInAdvancePrice({
          sb,
          stripeCli,
          price,
          entitlements,
          product,
          org,
        });
      }
    }

    // For the rest
    if (!isOneOffAndTiered && !config.stripe_price_id) {
      logger.info("Creating stripe price for in advance price");
      await createStripeInAdvancePrice({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
      });
    }
  } else if (billingType == BillingType.UsageInArrear) {
    if (!config.stripe_price_id) {
      logger.info("Creating stripe price for in arrear price");
      await createStripeInArrearPrice({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
      });
    }
  } else if (billingType == BillingType.InArrearProrated) {
    if (!config.stripe_price_id) {
      logger.info("Creating stripe price for in arrear prorated price");
      await createStripeInAdvancePrice({
        sb,
        stripeCli,
        price,
        entitlements,
        product,
        org,
      });
    }
  }
};
