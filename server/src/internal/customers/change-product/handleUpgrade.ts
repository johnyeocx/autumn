import { getStripeExpandedInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import {
  getStripeSchedules,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  FullCusProduct,
  ErrCode,
  FullProduct,
  CusProductStatus,
  Organization,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { handleAddProduct } from "../add-product/handleAddProduct.js";
import { InvoiceService } from "../invoices/InvoiceService.js";
import { AttachParams } from "../products/AttachParams.js";
import { CusProductService } from "../products/CusProductService.js";
import { attachParamsToInvoice } from "../invoices/invoiceUtils.js";
import { cancelFutureProductSchedule, updateScheduledSubWithNewItems } from "./scheduleUtils.js";
import { billForRemainingUsages } from "./billRemainingUsages.js";
import { updateStripeSubscription } from "@/external/stripe/stripeSubUtils/updateStripeSub.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";

import {
  addBillingIntervalUnix,
  subtractBillingIntervalUnix,
} from "@/internal/prices/billingIntervalUtils.js";
import { formatUnixToDateTime } from "@/utils/genUtils.js";
import { differenceInSeconds, subSeconds } from "date-fns";
import { getExistingCusProducts } from "../add-product/handleExistingProduct.js";

// UPGRADE FUNCTIONS
const handleStripeSubUpdate = async ({
  sb,
  stripeCli,
  curCusProduct,
  attachParams,
  disableFreeTrial,
  stripeSubs,
  logger,
}: {
  sb: SupabaseClient;
  stripeCli: Stripe;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  disableFreeTrial?: boolean;
  stripeSubs: Stripe.Subscription[];
  logger: any;
}) => {
  // HANLDE UPGRADE

  // 1. Get item sets
  const itemSets = await getStripeSubItems({
    attachParams,
  });
  const firstSub = stripeSubs[0];
  const firstItemSet = itemSets[0];
  let curPrices = curCusProduct.customer_prices.map((cp) => cp.price);

  // 1. DELETE ITEMS FROM CURRENT SUB THAT CORRESPOND TO OLD PRODUCT
  for (const item of firstSub.items.data) {
    let stripePriceExists = curPrices.some(
      (p) => p.config!.stripe_price_id === item.price.id
    );

    let stripeProdExists =
      item.price.product == curCusProduct.product.processor?.id;

    if (!stripePriceExists && !stripeProdExists) {
      continue;
    }

    firstItemSet.items.push({
      id: item.id,
      deleted: true,
    });
  }

  // 2. Add trial to new subscription?
  let trialEnd;
  if (!disableFreeTrial) {
    trialEnd = freeTrialToStripeTimestamp(attachParams.freeTrial);
  }

  // 3. Update current subscription
  let newSubs = [];
  const subUpdate: Stripe.Subscription = await updateStripeSubscription({
    stripeCli,
    subscriptionId: firstSub.id,
    items: firstItemSet.items,
    trialEnd,
    org: attachParams.org,
    customer: attachParams.customer,
    prices: firstItemSet.prices,
    invoiceOnly: attachParams.invoiceOnly || false,
  });
  newSubs.push(subUpdate);

  // 4. If scheduled_ids exist, need to update schedule too (BRUH)!
  if (curCusProduct.scheduled_ids && curCusProduct.scheduled_ids.length > 0) {
    let schedules = await getStripeSchedules({
      stripeCli,
      scheduleIds: curCusProduct.scheduled_ids,
    });

    for (const scheduleObj of schedules) {
      const { interval } = scheduleObj;
      // Get corresponding item set
      const itemSet = itemSets.find((itemSet) => itemSet.interval === interval);
      if (!itemSet) {
        continue;
      }

      await updateScheduledSubWithNewItems({
        scheduleObj,
        newItems: itemSet.items,
        stripeCli,
        cusProducts: [curCusProduct, attachParams.curScheduledProduct],
      });
    }
  }

  // what's happening here...
  await attachParamsToInvoice({
    sb,
    attachParams,
    invoiceId: subUpdate.latest_invoice as string,
    logger,
  });

  // 2. Create new subscriptions
  let newSubIds = [];
  newSubIds.push(firstSub.id);
  const newItemSets = itemSets.slice(1);
  let invoiceIds = [];

  // CREATE NEW SUBSCRIPTIONS
  for (const itemSet of newItemSets) {
    // 1. Next billing date for first sub
    const nextCycleAnchor = firstSub.current_period_end * 1000;
    let nextCycleAnchorUnix = nextCycleAnchor;
    const naturalBillingDate = addBillingIntervalUnix(
      Date.now(),
      itemSet.interval
    );

    while (true) {
      const subtractedUnix = subtractBillingIntervalUnix(
        nextCycleAnchorUnix,
        itemSet.interval
      );

      if (subtractedUnix < Date.now()) {
        break;
      }

      nextCycleAnchorUnix = subtractedUnix;
    }

    let billingCycleAnchorUnix: number | undefined = nextCycleAnchorUnix;
    if (
      differenceInSeconds(
        new Date(naturalBillingDate),
        new Date(nextCycleAnchorUnix)
      ) < 60
    ) {
      billingCycleAnchorUnix = undefined;
    }

    const newSub = await createStripeSub({
      stripeCli,
      customer: attachParams.customer,
      org: attachParams.org,
      itemSet,
      invoiceOnly: attachParams.invoiceOnly || false,
      freeTrial: attachParams.freeTrial,
      billingCycleAnchorUnix,
    });

    newSubs.push(newSub);
    newSubIds.push(newSub.id);
    invoiceIds.push(newSub.latest_invoice as string);
  }

  // 3. Cancel old subscriptions
  let remainingExistingSubIds = stripeSubs.slice(1).map((sub) => sub.id);

  return {
    subUpdate,
    newSubIds,
    invoiceIds,
    remainingExistingSubIds,
    newSubs,
  };
};

const handleOnlyEntsChanged = async ({
  req,
  res,
  attachParams,
  curCusProduct,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
}) => {
  const logger = req.logtail;
  logger.info("Only entitlements changed, no need to update prices");

  // Remove subscription from previous cus product
  await CusProductService.update({
    sb: req.sb,
    cusProductId: curCusProduct.id,
    updates: {
      subscription_ids: [],
    },
  });

  await createFullCusProduct({
    sb: req.sb,
    attachParams: attachToInsertParams(attachParams, attachParams.products[0]),
    subscriptionIds: curCusProduct.subscription_ids || [],
    disableFreeTrial: false,
    keepResetIntervals: true,
  });

  logger.info("✅ Successfully updated entitlements for product");

  res.status(200).json({
    success: true,
    message: `Successfully updated entitlements for ${curCusProduct.product.name}`,
  });
};

const cancelScheduledProductIfExists = async ({
  req,
  org,
  stripeCli,
  attachParams,
  curFullProduct,
  logger,
}: {
  req: any;
  org: Organization;
  stripeCli: Stripe;
  attachParams: AttachParams;
  curFullProduct: FullProduct;
  logger: any;
}) => {
  let { curScheduledProduct } = await getExistingCusProducts({
    product: curFullProduct,
    cusProducts: attachParams.cusProducts!,
  });

  if (curScheduledProduct) {
    logger.info(`0. Cancelling future scheduled product: ${curScheduledProduct.product.name}`);
     // 1. Cancel future product schedule
     await cancelFutureProductSchedule({
      sb: req.sb,
      org,
      cusProducts: attachParams.cusProducts!,
      product: curScheduledProduct.product as any,
      stripeCli,
      logger,
    });

    // 2. Delete scheduled product
    await CusProductService.delete({
      sb: req.sb,
      cusProductId: curScheduledProduct.id,
    });
  }
}

export const handleUpgrade = async ({
  req,
  res,
  attachParams,
  curCusProduct,
  curFullProduct,
  hasPricesChanged = true,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: FullCusProduct;
  curFullProduct: FullProduct;
  hasPricesChanged?: boolean;
}) => {
  const logger = req.logtail;
  const { org, customer, products } = attachParams;
  let product = products[0];

  if (!hasPricesChanged) {
    await handleOnlyEntsChanged({
      req,
      res,
      attachParams,
      curCusProduct,
    });
    return;
  }

  logger.info(
    `Upgrading ${curFullProduct.name} to ${product.name} for ${customer.id}`
  );

  const stripeCli = createStripeCli({ org, env: customer.env });
  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids!,
  });

  // 2. TO FIX: If current product is a trial, just start a new period (with new subscription_ids)
  if (curCusProduct.trial_ends_at && curCusProduct.trial_ends_at > Date.now()) {
    logger.info(
      "Current product is a TRIAL, cancelling and starting new subscription"
    );

    await handleAddProduct({
      req,
      res,
      attachParams,
    });

    for (const subId of curCusProduct.subscription_ids!) {
      try {
        await stripeCli.subscriptions.cancel(subId);
      } catch (error) {
        throw new RecaseError({
          message: `Handling upgrade (cur product on trial): failed to cancel subscription ${subId}`,
          code: ErrCode.StripeCancelSubscriptionFailed,
          statusCode: StatusCodes.BAD_REQUEST,
          data: error,
        });
      }
    }
    return;
  }

  const disableFreeTrial = false;


  logger.info("1. Updating current subscription to new product");
  let { subUpdate, newSubIds, invoiceIds, remainingExistingSubIds, newSubs } =
    await handleStripeSubUpdate({
      sb: req.sb,
      curCusProduct,
      stripeCli,
      attachParams,
      disableFreeTrial,
      stripeSubs,
      logger,
    });


  logger.info("2. Bill for remaining usages");
  await billForRemainingUsages({
    sb: req.sb,
    attachParams,
    curCusProduct,
    newSubs,
    logger,
  });

  logger.info(
    "2.1. Remove old subscription ID from old cus product and expire"
  );
  await CusProductService.update({
    sb: req.sb,
    cusProductId: curCusProduct.id,
    updates: {
      subscription_ids: curCusProduct.subscription_ids!.filter(
        (subId) => subId !== subUpdate.id
      ),
      processor: {
        ...curCusProduct.processor,
        subscription_id: null,
      } as any,
      status: CusProductStatus.Expired,
    },
  });

  if (remainingExistingSubIds && remainingExistingSubIds.length > 0) {
    logger.info("2.2. Canceling old subscriptions");
    for (const subId of remainingExistingSubIds) {
      logger.info("   - Cancelling old subscription", subId);
      await stripeCli.subscriptions.cancel(subId);
    }
  }

  // Handle backend
  logger.info("3. Creating new full cus product");
  await createFullCusProduct({
    sb: req.sb,
    attachParams: attachToInsertParams(attachParams, products[0]),
    subscriptionIds: newSubIds,
    // nextResetAt: subUpdate.current_period_end
    //   ? subUpdate.current_period_end * 1000
    //   : undefined,
    keepResetIntervals: true,
    disableFreeTrial,
  });

  // Create invoices
  logger.info("4. Creating invoices");
  logger.info(`Invoice IDs: ${invoiceIds}`);
  const batchInsertInvoice = [];
  for (const invoiceId of invoiceIds) {
    const insertInvoice = async () => {
      const stripeInvoice = await getStripeExpandedInvoice({
        stripeCli,
        stripeInvoiceId: invoiceId,
      });

      await InvoiceService.createInvoiceFromStripe({
        sb: req.sb,
        stripeInvoice,
        internalCustomerId: customer.internal_id,
        org,
        productIds: products.map((p) => p.id),
        internalProductIds: products.map((p) => p.internal_id),
      });
    };
    batchInsertInvoice.push(insertInvoice());
  }

  await Promise.all(batchInsertInvoice);
  logger.info("✅ Done!");

  res.status(200).json({
    success: true,
    message: `Successfully attached ${product.name} to ${customer.name} -- upgraded from ${curFullProduct.name}`,
  });
};

// // 1. If current product is free, retire old product (should already be handled?)
// if (isFreeProduct(curFullProduct.prices)) {
//   logger.info("NOTE: Current product is free, using add product flow");
//   await handleAddProduct({
//     req,
//     res,
//     attachParams,
//   });
//   return;
// }
