import {
  AllowanceType,
  CusProductStatus,
  Price,
  ProcessorType,
  EntInterval,
  CustomerEntitlement,
  CusProduct,
  FeatureOptions,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import { Customer, Feature, FeatureType } from "@autumn/shared";
import { EntitlementWithFeature, FullProduct } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";
import RecaseError from "@/utils/errorUtils.js";
import { getEntOptions } from "@/internal/prices/priceUtils.js";
import { CustomerPrice } from "@autumn/shared";
import { CusProductService } from "../products/CusProductService.js";

export const initCusEntitlement = ({
  entitlement,
  customer,
  cusProductId,
  options,
  nextResetAt,
  billLaterOnly = false,
}: {
  entitlement: EntitlementWithFeature;
  customer: Customer;
  cusProductId: string;
  options?: FeatureOptions;
  nextResetAt?: number;
  billLaterOnly?: boolean;
}) => {
  const feature: Feature = entitlement.feature;

  // 1. Initialize balance...
  let allowance = entitlement.allowance || 0;
  let quantity = options?.quantity || 1;

  let balance = billLaterOnly ? 0 : allowance * quantity;

  // 2. Define reset interval (interval at which balance is reset to quantity * allowance)
  let reset_interval = entitlement.interval as EntInterval;
  let nextResetAtCalculated = null;
  if (reset_interval && reset_interval != EntInterval.Lifetime) {
    nextResetAtCalculated = getNextEntitlementReset(
      null,
      reset_interval
    ).getTime();
  }

  // 3. Define expires at (TODO next time...)
  let isBooleanFeature = feature.type === FeatureType.Boolean;

  return {
    id: generateId("cus_ent"),
    internal_customer_id: customer.internal_id,
    internal_feature_id:
      entitlement.internal_feature_id || entitlement.feature.internal_id,
    customer_id: customer.id,
    feature_id: feature.id,

    // Foreign keys
    entitlement_id: entitlement.id,
    custom_entitlement_id: null,
    customer_product_id: cusProductId,
    created_at: Date.now(),

    // Entitlement fields
    unlimited: isBooleanFeature
      ? null
      : entitlement.allowance_type === AllowanceType.Unlimited,
    balance: isBooleanFeature ? null : balance,
    usage_allowed: isBooleanFeature ? null : false,
    next_reset_at: isBooleanFeature
      ? null
      : nextResetAt || nextResetAtCalculated,
  };
};

export const initCusPrice = ({
  price,
  customer,
  cusProductId,
}: {
  price: Price;
  customer: Customer;
  cusProductId: string;
}) => {
  const cusPrice: CustomerPrice = {
    id: generateId("cus_price"),
    internal_customer_id: customer.internal_id,
    customer_product_id: cusProductId,
    created_at: Date.now(),

    price_id: price.id || null,
  };

  return cusPrice;
};

export const initCusProduct = ({
  customer,
  product,
  subscriptionId,
  cusProdId,
  startsAt,
  subscriptionScheduleId,
  optionsList,
}: {
  customer: Customer;
  product: FullProduct;
  subscriptionId: string | undefined | null;
  cusProdId: string;
  startsAt?: number;
  subscriptionScheduleId?: string | null;
  optionsList: FeatureOptions[];
}) => {
  let isFuture = startsAt && startsAt > Date.now();

  return {
    id: cusProdId,
    internal_customer_id: customer.internal_id,
    customer_id: customer.id,
    internal_product_id: product.internal_id,
    product_id: product.id,
    created_at: Date.now(),

    status: isFuture ? CusProductStatus.Scheduled : CusProductStatus.Active,

    processor: {
      type: ProcessorType.Stripe,
      subscription_id: subscriptionId,
      subscription_schedule_id: subscriptionScheduleId,
      last_invoice_id: null,
    },

    starts_at: startsAt || Date.now(),

    options: optionsList || [],
  };
};

export const insertFullCusProduct = async ({
  sb,
  cusProd,
  cusEnts,
  cusPrices,
}: {
  sb: SupabaseClient;
  cusProd: CusProduct;
  cusEnts: CustomerEntitlement[];
  cusPrices: CustomerPrice[];
}) => {
  const { error: prodError } = await sb
    .from("customer_products")
    .insert(cusProd);

  if (prodError) {
    console.log("Error inserting customer product: ", prodError);
    throw new RecaseError({
      message: "Error inserting customer product",
      code: ErrCode.InternalError,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }

  const { error: entError } = await sb
    .from("customer_entitlements")
    .insert(cusEnts);
  if (entError) {
    console.log("Error inserting customer entitlements: ", entError);
    throw new RecaseError({
      message: "Error inserting customer entitlements",
      code: ErrCode.InternalError,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }

  const { error: priceError } = await sb
    .from("customer_prices")
    .insert(cusPrices);
  if (priceError) {
    console.log("Error inserting customer prices: ", priceError);
    throw new RecaseError({
      message: "Error inserting customer prices",
      code: ErrCode.InternalError,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export const expireOrDeleteCusProduct = async ({
  sb,
  customer,
  startsAt,
}: {
  sb: SupabaseClient;
  customer: Customer;
  startsAt?: number;
}) => {
  // 1. If startsAt
  if (startsAt && startsAt > Date.now()) {
    await CusProductService.deleteFutureProduct({
      sb,
      internalCustomerId: customer.internal_id,
    });
  } else {
    await CusProductService.expireCurrentProduct({
      sb,
      internalCustomerId: customer.internal_id,
    });
  }
};

export const createFullCusProduct = async ({
  sb,
  customer,
  product,
  prices,
  entitlements,
  optionsList,
  startsAt,
  subscriptionId,
  subscriptionScheduleId,
  nextResetAt,
  billLaterOnly = false,
}: {
  sb: SupabaseClient;
  customer: Customer;
  product: FullProduct;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  optionsList: FeatureOptions[];
  startsAt?: number;
  subscriptionId?: string;
  subscriptionScheduleId?: string;
  nextResetAt?: number;
  billLaterOnly?: boolean;
}) => {
  if (!product.is_add_on) {
    await expireOrDeleteCusProduct({
      sb,
      customer,
      startsAt,
    });
  }

  const cusProdId = generateId("cus_prod");

  // 1. create customer entitlements
  const cusEnts: CustomerEntitlement[] = [];

  for (const entitlement of entitlements) {
    const options = getEntOptions(optionsList, entitlement);

    const cusEnt: any = initCusEntitlement({
      entitlement,
      customer,
      cusProductId: cusProdId,
      options: options || undefined,
      nextResetAt,
      billLaterOnly,
    });

    cusEnts.push(cusEnt);
  }

  // 2. create customer prices
  const cusPrices: CustomerPrice[] = [];
  for (const price of prices) {
    const cusPrice: CustomerPrice = initCusPrice({
      price,
      customer,
      cusProductId: cusProdId,
    });

    cusPrices.push(cusPrice);
  }

  // 3. create customer product
  const cusProd = initCusProduct({
    cusProdId,
    customer,
    product,
    subscriptionId,
    startsAt,
    subscriptionScheduleId,
    optionsList,
  });

  await insertFullCusProduct({
    sb,
    cusProd,
    cusEnts,
    cusPrices,
  });

  return cusProd;
};
