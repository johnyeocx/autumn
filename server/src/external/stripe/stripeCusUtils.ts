import { AppEnv, Customer, Organization, ProcessorType } from "@autumn/shared";
import stripe, { Stripe } from "stripe";
import { createStripeCli } from "./utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";
import { SupabaseClient } from "@supabase/supabase-js";
import { CusService } from "@/internal/customers/CusService.js";

export const createStripeCusIfNotExists = async ({
  sb,
  org,
  env,
  customer,
  logger,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  customer: Customer;
  logger: any;
}) => {
  let createNew = false;
  const stripeCli = createStripeCli({ org, env });
  if (!customer.processor || !customer.processor.id) {
    createNew = true;
  } else {
    try {
      await stripeCli.customers.retrieve(customer.processor.id);
    } catch (error) {
      createNew = true;
    }
  }

  if (createNew) {
    logger.info(`Creating new stripe customer for ${customer.id}`);
    const stripeCustomer = await createStripeCustomer({
      org,
      env,
      customer,
    });

    await CusService.update({
      sb,
      internalCusId: customer.internal_id,
      update: {
        processor: {
          id: stripeCustomer.id,
          type: ProcessorType.Stripe,
        },
      },
    });

    customer.processor = {
      id: stripeCustomer.id,
      type: ProcessorType.Stripe,
    };
  }

  return;
};

export const createStripeCustomer = async ({
  org,
  env,
  customer,
  testClockId,
}: {
  org: Organization;
  env: AppEnv;
  customer: Customer;
  testClockId?: string;
}) => {
  const stripeCli = createStripeCli({ org, env });

  try {
    const stripeCustomer = await stripeCli.customers.create({
      name: customer.name || undefined,
      email: customer.email || undefined,
      metadata: {
        autumn_id: customer.id,
        autumn_internal_id: customer.internal_id,
      },
      test_clock: testClockId,
    });

    return stripeCustomer;
  } catch (error: any) {
    throw new RecaseError({
      message: `Error creating customer in Stripe. ${error.message}`,
      code: ErrCode.StripeCreateCustomerFailed,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export const deleteStripeCustomer = async ({
  org,
  env,
  stripeId,
}: {
  org: Organization;
  env: AppEnv;
  stripeId: string;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const stripeCustomer = await stripeCli.customers.del(stripeId);

  return stripeCustomer;
};

export const getCusPaymentMethod = async ({
  org,
  env,
  stripeId,
}: {
  org: Organization;
  env: AppEnv;
  stripeId: string;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const stripeCustomer = (await stripeCli.customers.retrieve(
    stripeId
  )) as Stripe.Customer;

  let paymentMethodId = stripeCustomer.invoice_settings.default_payment_method;

  if (!paymentMethodId) {
    let res = await stripeCli.paymentMethods.list({
      customer: stripeId,
    });

    // const paymentMethods = res.data.filter((pm) => pm.type === "card" );

    const paymentMethods = res.data;
    paymentMethods.sort((a, b) => b.created - a.created);

    if (res.data.length === 0) {
      return null;
    }

    return paymentMethods[0].id;
  }

  return paymentMethodId;
};

// 2. Create a payment method and attach to customer
export const attachPmToCus = async ({
  sb,
  customer,
  org,
  env,
  willFail = false,
  testClockId,
}: {
  sb: SupabaseClient;
  customer: Customer;
  org: Organization;
  env: AppEnv;
  willFail?: boolean;
  testClockId?: string;
}) => {
  // 1. Create stripe customer if not exists

  let stripeCusId = customer.processor?.id;
  if (!stripeCusId) {
    const stripeCustomer = await createStripeCustomer({
      org,
      env,
      customer,
      testClockId,
    });

    await sb
      .from("customers")
      .update({
        processor: {
          id: stripeCustomer.id,
          type: "stripe",
        },
      })
      .eq("internal_id", customer.internal_id);
    stripeCusId = stripeCustomer.id;
    customer.processor = {
      id: stripeCustomer.id,
      type: "stripe",
    };
  }

  const stripeCli = createStripeCli({ org, env });

  try {
    let token = willFail ? "tok_chargeCustomerFail" : "tok_visa";
    const pm = await stripeCli.paymentMethods.create({
      type: "card",
      card: {
        token,
      },
    });
    await stripeCli.paymentMethods.attach(pm.id, {
      customer: stripeCusId,
    });

    await stripeCli.customers.update(stripeCusId, {
      invoice_settings: {
        default_payment_method: pm.id,
      },
    });
    // console.log("   - Payment method attached");
  } catch (error) {
    console.log("   - Error attaching payment method", error);
  }
};

export const attachFailedPaymentMethod = async ({
  stripeCli,
  customer,
}: {
  stripeCli: Stripe;
  customer: Customer;
}) => {
  // Delete existing payment method
  const paymentMethods = await stripeCli.paymentMethods.list({
    customer: customer.processor?.id,
  });
  for (const pm of paymentMethods.data) {
    await stripeCli.paymentMethods.detach(pm.id);
  }

  const pm = await stripeCli.paymentMethods.create({
    type: "card",
    card: {
      token: "tok_chargeCustomerFail",
    },
  });
  await stripeCli.paymentMethods.attach(pm.id, {
    customer: customer.processor?.id,
  });
};
