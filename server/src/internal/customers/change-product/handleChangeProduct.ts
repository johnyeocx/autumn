import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeSubItems } from "@/internal/prices/priceUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  isFreeProduct,
  isProductUpgrade,
  isSameBillingInterval,
} from "@/internal/products/productUtils.js";
import Stripe from "stripe";

import { CusProductWithProduct, ErrCode, FullProduct } from "@autumn/shared";

import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { handleAddProduct } from "../add-product/handleAddProduct.js";
import { CusProductService } from "../products/CusProductService.js";
import { AttachParams } from "../products/AttachParams.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import chalk from "chalk";
import RecaseError, { isPaymentDeclined } from "@/utils/errorUtils.js";
import { updateStripeSubscription } from "@/external/stripe/stripeSubUtils.js";
import { handleCreateCheckout } from "../add-product/handleCreateCheckout.js";

const scheduleStripeSubscription = async ({
  attachParams,
  stripeCli,
  endOfBillingPeriod,
}: {
  attachParams: AttachParams;
  stripeCli: Stripe;
  endOfBillingPeriod: number;
}) => {
  const { org, customer } = attachParams;

  const { items, itemMetas } = getStripeSubItems({
    attachParams,
  });

  const paymentMethod = await getCusPaymentMethod({
    org,
    env: customer.env,
    stripeId: customer.processor.id,
  });

  const newSubscriptionSchedule = await stripeCli.subscriptionSchedules.create({
    customer: customer.processor.id,
    start_date: endOfBillingPeriod,
    phases: [
      {
        items,
        default_payment_method: paymentMethod as string,
      },
    ],
  });

  return newSubscriptionSchedule.id;
};

const handleDowngrade = async ({
  req,
  res,
  attachParams,
  curCusProduct,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: CusProductWithProduct;
}) => {
  console.log(
    `Handling downgrade from ${curCusProduct.product.name} to ${attachParams.product.name}`
  );

  // 1. Cancel current subscription
  console.log("1. Cancelling current subscription (at period end)");

  const stripeCli = createStripeCli({
    org: attachParams.org,
    env: attachParams.customer.env,
  });

  const subscription = await stripeCli.subscriptions.retrieve(
    curCusProduct.processor?.subscription_id!
  );

  await stripeCli.subscriptions.update(subscription.id, {
    cancel_at_period_end: true,
  });

  // 3. Schedule new subscription IF new product is not free...
  console.log("2. Scheduling new subscription");
  let scheduleId;
  if (!isFreeProduct(attachParams.prices)) {
    // Delete previous schedules
    const schedules = await stripeCli.subscriptionSchedules.list({
      customer: attachParams.customer.processor.id,
    });

    for (const schedule of schedules.data) {
      const existingCusProduct = await CusProductService.getByScheduleId({
        sb: req.sb,
        scheduleId: schedule.id,
      });

      // Delete only if not in the same group
      if (
        (!existingCusProduct ||
          existingCusProduct.product.group === attachParams.product.group) &&
        schedule.status !== "canceled"
      ) {
        await stripeCli.subscriptionSchedules.cancel(schedule.id);
      }
    }

    scheduleId = await scheduleStripeSubscription({
      attachParams,
      stripeCli,
      endOfBillingPeriod: subscription.current_period_end,
    });
  }

  // 2. Insert new full cus product with starts_at later than current billing period
  console.log("3. Inserting new full cus product (starts at period end)");
  await createFullCusProduct({
    sb: req.sb,
    attachParams,
    subscriptionId: undefined,
    startsAt: subscription.current_period_end * 1000,
    subscriptionScheduleId: scheduleId,
    nextResetAt: subscription.current_period_end * 1000,
    disableFreeTrial: true,
  });

  res.status(200).json({ success: true, message: "Downgrade handled" });
};

// UPGRADE FUNCTIONS
const handleStripeSubUpdate = async ({
  stripeCli,
  subscriptionId,
  attachParams,
  disableFreeTrial,
}: {
  stripeCli: Stripe;
  subscriptionId: string;
  attachParams: AttachParams;
  disableFreeTrial?: boolean;
}) => {
  // HANLDE UPGRADE

  const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);

  // Get stripe subscription from product
  const { items, itemMetas } = getStripeSubItems({
    attachParams,
  });

  // Delete existing subscription items
  for (const item of subscription.items.data) {
    items.push({
      id: item.id,
      deleted: true,
    });
  }

  let trialEnd = undefined;
  if (!disableFreeTrial) {
    trialEnd = freeTrialToStripeTimestamp(attachParams.freeTrial);
  }

  // Switch subscription
  const subUpdate: Stripe.Subscription = await updateStripeSubscription({
    stripeCli,
    subscriptionId,
    items,
    trialEnd,
    org: attachParams.org,
    customer: attachParams.customer,
  });

  return subUpdate;
};

const handleUpgrade = async ({
  req,
  res,
  attachParams,
  curCusProduct,
  curFullProduct,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: CusProductWithProduct;
  curFullProduct: FullProduct;
}) => {
  const { org, customer, product } = attachParams;

  console.log(
    `Upgrading ${curFullProduct.name} to ${product.name} for ${customer.id}`
  );

  const sameBillingInterval = isSameBillingInterval(curFullProduct, product);

  const stripeCli = createStripeCli({ org, env: customer.env });

  // 1. If current product is free, retire old product
  if (isFreeProduct(curFullProduct.prices)) {
    console.log("NOTE: Current product is free, using add product flow");
    await handleAddProduct({
      req,
      res,
      attachParams,
    });
    return;
  }

  const disableFreeTrial =
    curFullProduct.free_trial && org.config?.free_trial_paid_to_paid;

  // Maybe do it such that if cur cus product has no subscription ID, we just create a new one?

  console.log("1. Updating current subscription to new product");
  let subUpdate;
  subUpdate = await handleStripeSubUpdate({
    subscriptionId: curCusProduct.processor?.subscription_id!,
    stripeCli,
    attachParams,
  });

  // Handle backend
  console.log("2. Creating new full cus product");
  await createFullCusProduct({
    sb: req.sb,
    attachParams,
    subscriptionId: subUpdate.id,
    nextResetAt: sameBillingInterval
      ? subUpdate.current_period_end * 1000
      : undefined,
    disableFreeTrial,
  });

  res.status(200).json({ success: true, message: "Product change handled" });
};

export const handleChangeProduct = async ({
  req,
  res,
  attachParams,
  curCusProduct,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  curCusProduct: CusProductWithProduct;
}) => {
  // Get subscription
  const curProduct = curCusProduct.product;
  const { org, customer, product, prices, entitlements, optionsList } =
    attachParams;

  const curFullProduct = await ProductService.getFullProduct({
    sb: req.sb,
    productId: curProduct.id,
    orgId: org.id,
    env: customer.env,
  });

  const isUpgrade = isProductUpgrade(curFullProduct, product);

  if (!isUpgrade) {
    await handleDowngrade({
      req,
      res,
      attachParams,
      curCusProduct,
    });
    return;
  } else {
    await handleUpgrade({
      req,
      res,
      attachParams,
      curCusProduct,
      curFullProduct,
    });
  }
};
