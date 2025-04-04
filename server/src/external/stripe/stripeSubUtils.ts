import Stripe from "stripe";
import { CusProductStatus, Feature, FullCusProduct } from "@autumn/shared";
import { differenceInSeconds } from "date-fns";

export const getStripeSubs = async ({
  stripeCli,
  subIds,
}: {
  stripeCli: Stripe;
  subIds: string[];
}) => {
  const batchGet = [];
  const getStripeSub = async (subId: string) => {
    try {
      return await stripeCli.subscriptions.retrieve(subId);
    } catch (error: any) {
      console.log("Error getting stripe subscription.", error.message);
      return null;
    }
  };

  for (const subId of subIds) {
    batchGet.push(getStripeSub(subId));
  }
  let subs = await Promise.all(batchGet);
  subs = subs.filter((sub) => sub !== null);

  // Sort by current_period_end (latest first)
  subs.sort((a: any, b: any) => {
    return b.current_period_end - a.current_period_end;
  });

  return subs as Stripe.Subscription[];
};

export const stripeToAutumnSubStatus = (stripeSubStatus: string) => {
  switch (stripeSubStatus) {
    case "trialing":
      return CusProductStatus.Active;
    case "active":
      return CusProductStatus.Active;
    case "past_due":
      return CusProductStatus.PastDue;

    default:
      return stripeSubStatus;
  }
};

export const deleteScheduledIds = async ({
  stripeCli,
  scheduledIds,
}: {
  stripeCli: Stripe;
  scheduledIds: string[];
}) => {
  for (const scheduledId of scheduledIds) {
    try {
      await stripeCli.subscriptionSchedules.cancel(scheduledId);
    } catch (error: any) {
      console.log("Error deleting scheduled id.", error.message);
    }
  }
};

// Get in advance sub
export const getUsageBasedSub = async ({
  stripeCli,
  subIds,
  feature,
  stripeSubs,
}: {
  stripeCli: Stripe;
  subIds: string[];
  feature: Feature;
  stripeSubs?: Stripe.Subscription[];
}) => {
  let subs;
  if (stripeSubs) {
    subs = stripeSubs;
  } else {
    subs = await getStripeSubs({
      stripeCli,
      subIds,
    });
  }

  for (const stripeSub of subs) {
    let usageFeatures: string[] | null = null;

    try {
      usageFeatures = JSON.parse(stripeSub.metadata.usage_features);
    } catch (error) {
      continue;
    }

    if (
      !usageFeatures ||
      usageFeatures.find(
        (feat: any) => feat.internal_id == feature.internal_id
      ) === undefined
    ) {
      continue;
    }

    return stripeSub;
  }

  return null;
};

export const getSubItemsForCusProduct = async ({
  stripeSub,
  cusProduct,
}: {
  stripeSub: Stripe.Subscription;
  cusProduct: FullCusProduct;
}) => {
  let prices = cusProduct.customer_prices.map((cp) => cp.price);
  let product = cusProduct.product;

  let subItems = [];
  for (const item of stripeSub.items.data) {
    if (item.price.product == product.processor?.id) {
      subItems.push(item);
    } else if (prices.some((p) => p.config?.stripe_price_id == item.price.id)) {
      subItems.push(item);
    }
  }
  let otherSubItems = stripeSub.items.data.filter(
    (item) => !subItems.some((i) => i.id == item.id)
  );

  return { subItems, otherSubItems };
};

export const getStripeSchedules = async ({
  stripeCli,
  scheduleIds,
}: {
  stripeCli: Stripe;
  scheduleIds: string[];
}) => {
  const batchGet = [];
  const getStripeSchedule = async (scheduleId: string) => {
    try {
      const schedule = await stripeCli.subscriptionSchedules.retrieve(
        scheduleId
      );
      const firstItem = schedule.phases[0].items[0];
      const price = await stripeCli.prices.retrieve(firstItem.price as string);
      return { schedule, interval: price.recurring?.interval };
    } catch (error: any) {
      console.log("Error getting stripe schedule.", error.message);
      return null;
    }
  };

  for (const scheduleId of scheduleIds) {
    batchGet.push(getStripeSchedule(scheduleId));
  }

  let schedulesAndSubs = await Promise.all(batchGet);

  return schedulesAndSubs.filter((schedule) => schedule !== null);
};

// OTHERS
export const subIsPrematurelyCanceled = (sub: Stripe.Subscription) => {
  if (sub.cancel_at_period_end) {
    return false;
  }

  return (
    differenceInSeconds(sub.current_period_end * 1000, sub.cancel_at! * 1000) >
    20
  );
};
