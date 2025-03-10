import { Router } from "express";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { z } from "zod";
import {
  BillingType,
  Entitlement,
  FeatureOptions,
  FeatureOptionsSchema,
  FullCusProduct,
  Price,
} from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";
import {
  createStripeCusIfNotExists,
  getCusPaymentMethod,
} from "@/external/stripe/stripeCusUtils.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";

import {
  getBillingType,
  getEntOptions,
  getPriceEntitlement,
  getProductForPrice,
  priceIsOneOffAndTiered,
} from "@/internal/prices/priceUtils.js";
import { PricesInput } from "@autumn/shared";
import { getFullCusProductData } from "@/internal/customers/products/attachUtils.js";
import {
  checkStripeProductExists,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import { createStripePriceIFNotExist } from "@/external/stripe/stripePriceUtils.js";
import { notNullOrUndefined, nullOrUndefined } from "@/utils/genUtils.js";
import chalk from "chalk";
import { handleExistingProduct } from "@/internal/customers/add-product/handleExistingProduct.js";
import { handleAddFreeProduct } from "@/internal/customers/add-product/handleAddFreeProduct.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { handleInvoiceOnly } from "@/internal/customers/add-product/handleInvoiceOnly.js";
import { handleChangeProduct } from "@/internal/customers/change-product/handleChangeProduct.js";

import {
  clearLock,
  handleAttachRaceCondition,
} from "@/external/redis/redisUtils.js";

export const attachRouter = Router();

export const checkoutPricesValid = (prices: Price[]) => {
  for (const price of prices) {
    if (price.billing_type === BillingType.UsageBelowThreshold) {
      return false;
    }
  }

  return true;
};

export const checkAddProductErrors = async ({
  attachParams,
  useCheckout = false,
}: {
  attachParams: AttachParams;
  useCheckout?: boolean;
}) => {
  const { prices, entitlements, optionsList } = attachParams;

  if (useCheckout && !checkoutPricesValid(prices)) {
    throw new RecaseError({
      message: `Can't use /checkout for below threshold prices`,
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }

  // 2. Check if options are valid
  for (const price of prices) {
    const billingType = getBillingType(price.config!);

    if (billingType === BillingType.UsageInAdvance) {
      // Get options for price
      let priceEnt = getPriceEntitlement(price, entitlements);
      let options = getEntOptions(optionsList, priceEnt);

      // 1. If not checkout, quantity should be defined
      if (!useCheckout && nullOrUndefined(options?.quantity)) {
        throw new RecaseError({
          message: `Pass in 'quantity' for feature ${priceEnt.feature_id} in options`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      if (
        nullOrUndefined(options?.quantity) &&
        priceIsOneOffAndTiered(price, priceEnt)
      ) {
        throw new RecaseError({
          code: ErrCode.InvalidRequest,
          message:
            "Quantity is required for start of period price that is one off and tiered",
          statusCode: 400,
        });
      }

      // 2. Quantity must be >= feature allowance
      if (
        notNullOrUndefined(options?.quantity) &&
        priceEnt.allowance &&
        options!.quantity! < priceEnt.allowance
      ) {
        throw new RecaseError({
          message: `Quantity must be greater than or equal to allowance (${priceEnt.allowance})`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      // 2. If there's only one price, quantity must be greater than 0
      if (options?.quantity === 0 && prices.length === 1) {
        throw new RecaseError({
          message: `When there's only one price, quantity must be greater than 0`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }
    } else if (billingType === BillingType.UsageBelowThreshold) {
      let priceEnt = getPriceEntitlement(price, entitlements);
      let options = getEntOptions(optionsList, priceEnt);

      if (!options?.threshold) {
        throw new RecaseError({
          message: `Pass in 'threshold' for feature '${priceEnt.feature_id}' in options`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }
    }
  }
};

export const handlePublicAttachErrors = async ({
  curCusProduct,
  isPublic,
}: {
  curCusProduct: FullCusProduct | null;
  isPublic: boolean;
}) => {
  if (!isPublic) {
    return;
  }

  if (!curCusProduct) {
    return;
  }

  // 1. If on paid plan, not allowed to switch product
  const curProductFree = isFreeProduct(
    curCusProduct?.customer_prices.map((cp: any) => cp.price) || [] // if no current product...
  );

  if (!curProductFree) {
    throw new RecaseError({
      message: "Public attach: not allowed to upgrade / downgrade (from paid)",
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }
};

export const checkStripeConnections = async ({
  req,
  attachParams,
}: {
  req: any;
  attachParams: AttachParams;
}) => {
  const { org, customer, products, prices, entitlements } = attachParams;
  const env = customer.env;

  if (!org.stripe_connected) {
    throw new RecaseError({
      message: "Please connect to Stripe to add products",
      code: ErrCode.StripeConfigNotFound,
      statusCode: 400,
    });
  }

  const stripeCli = createStripeCli({ org, env });

  const batchProductUpdates = [
    createStripeCusIfNotExists({
      sb: req.sb,
      org,
      env,
      customer,
      logger: req.logger,
    }),
  ];
  for (const product of products) {
    batchProductUpdates.push(
      checkStripeProductExists({
        sb: req.sb,
        org,
        env,
        product,
        logger: req.logger,
      })
    );
  }
  await Promise.all(batchProductUpdates);

  const batchPriceUpdates = [];
  for (const price of prices) {
    let product = getProductForPrice(price, products);
    batchPriceUpdates.push(
      createStripePriceIFNotExist({
        sb: req.sb,
        stripeCli,
        price,
        entitlements,
        product: product!,
        org,
        logger: req.logger,
      })
    );
  }
  await Promise.all(batchPriceUpdates);
};

export const customerHasPm = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  // SCENARIO 3: No payment method, checkout required
  const paymentMethod = await getCusPaymentMethod({
    org: attachParams.org,
    env: attachParams.customer.env,
    stripeId: attachParams.customer.processor.id,
  });

  return notNullOrUndefined(paymentMethod) ? true : false;
};

attachRouter.post("/attach", async (req: any, res) => {
  const {
    customer_id,
    product_id,
    customer_data,

    is_custom,
    prices,
    entitlements,
    free_trial,
    product_ids,
    options,
    force_checkout,
    invoice_only,
    success_url,
  } = req.body;

  const { orgId, env } = req;
  const logger = req.logtail;

  const sb = req.sb;
  const pricesInput: PricesInput = prices || [];
  const entsInput: Entitlement[] = entitlements || [];
  const optionsListInput: FeatureOptions[] = options || [];
  const invoiceOnly = invoice_only || false;
  const successUrl = success_url || undefined;

  // PUBLIC STUFF
  let forceCheckout = req.isPublic || force_checkout || false;
  let isCustom = is_custom || false;
  if (req.isPublic) {
    isCustom = false;
  }

  logger.info("--------------------------------");
  let publicStr = req.isPublic ? "(Public) " : "";
  logger.info(`${publicStr}ATTACH PRODUCT REQUEST (from ${req.minOrg.slug})`);

  let lockKey;
  try {
    lockKey = await handleAttachRaceCondition({ req, res });

    z.array(FeatureOptionsSchema).parse(optionsListInput);

    // Get curCusProducts too...
    const attachParams: AttachParams = await getFullCusProductData({
      sb,
      customerId: customer_id,
      productId: product_id,
      customerData: customer_data,
      orgId,
      env,
      pricesInput,
      entsInput,
      optionsListInput,
      freeTrialInput: free_trial,
      isCustom,
      productIds: product_ids,
    });

    attachParams.successUrl = successUrl;

    logger.info(
      `Customer: ${chalk.yellow(
        `${attachParams.customer.id} (${attachParams.customer.name})`
      )}`
    );

    // 3. Check for stripe connection
    await checkStripeConnections({ req, attachParams });

    let hasPm = await customerHasPm({ attachParams });
    const useCheckout = !hasPm || forceCheckout;

    logger.info(
      `Has PM: ${chalk.yellow(hasPm)}, Force Checkout: ${chalk.yellow(
        forceCheckout
      )}, Use Checkout: ${chalk.yellow(useCheckout)}, Is Custom: ${chalk.yellow(
        isCustom
      )}`
    );

    // -------------------- ERROR CHECKING --------------------

    // 1. Check for normal errors (eg. options, different recurring intervals)
    await checkAddProductErrors({
      attachParams,
      useCheckout,
    });

    // 2. Check for existing product and fetch
    const { curCusProduct, done } = await handleExistingProduct({
      req,
      res,
      attachParams,
      useCheckout,
      invoiceOnly,
      isCustom,
    });

    await handlePublicAttachErrors({
      curCusProduct,
      isPublic: req.isPublic,
    });

    if (done) return;

    // // -------------------- ATTACH PRODUCT --------------------

    // SCENARIO 1: Free product, no existing product
    const newProductsFree = isFreeProduct(attachParams.prices);
    const allAddOns = attachParams.products.every((p) => p.is_add_on);

    if ((!curCusProduct && newProductsFree) || (allAddOns && newProductsFree)) {
      logger.info("SCENARIO 1: FREE PRODUCT");
      await handleAddFreeProduct({
        req,
        res,
        attachParams,
      });
      return;
    }

    // SCENARIO 2: Invoice only
    if (invoiceOnly) {
      await handleInvoiceOnly({
        req,
        res,
        attachParams,
        curCusProduct,
      });
      return;
    }

    if (useCheckout) {
      logger.info("SCENARIO 2: USING CHECKOUT");
      await handleCreateCheckout({
        sb,
        req,
        res,
        attachParams,
      });
      return;
    }

    // SCENARIO 4: Switching product
    if (curCusProduct) {
      logger.info("SCENARIO 3: SWITCHING PRODUCT");

      await handleChangeProduct({
        req,
        res,
        attachParams,
        curCusProduct,
        isCustom,
      });
      return;
    }

    // SCENARIO 5: No existing product, not free product
    logger.info("SCENARIO 4: ADDING PRODUCT");
    await handleAddProduct({
      req,
      res,
      attachParams,
    });
  } catch (error: any) {
    handleRequestError({ req, res, error, action: "attach product" });
  }
});
