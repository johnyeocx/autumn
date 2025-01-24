import {
  getBillLaterPrices,
  getBillNowPrices,
  getEntOptions,
  getPriceEntitlement,
  getStripeSubItems,
  pricesOnlyOneOff,
} from "@/internal/prices/priceUtils.js";

import {
  AppEnv,
  Customer,
  EntitlementWithFeature,
  FeatureOptions,
  FullProduct,
  Organization,
  Price,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { InvoiceService } from "../invoices/InvoiceService.js";
import chalk from "chalk";
import { priceToStripeItem } from "@/external/stripe/stripePriceUtils.js";

const handleBillNowPrices = async ({
  sb,
  customer,
  product,
  prices,
  entitlements,
  optionsList,
  org,
  env,
}: {
  sb: SupabaseClient;
  customer: Customer;
  product: FullProduct;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  optionsList: FeatureOptions[];
  org: Organization;
  env: AppEnv;
}) => {
  console.log("Adding product to customer", customer.id, product.id);

  const billNowPrices = getBillNowPrices(prices);
  const stripeCli = createStripeCli({ org, env });

  const subItems = getStripeSubItems({
    entitlements,
    product,
    prices,
    org,
    optionsList,
  });

  const paymentMethod = await getCusPaymentMethod({
    org,
    env,
    stripeId: customer.processor.id,
  });

  let subscription;

  try {
    subscription = await stripeCli.subscriptions.create({
      customer: customer.processor.id,
      default_payment_method: paymentMethod as string,
      items: subItems as any,
    });
  } catch (error: any) {
    console.log("Error creating stripe subscription", error?.message || error);

    throw new RecaseError({
      code: ErrCode.CreateStripeSubscriptionFailed,
      message: "Failed to create stripe subscription",
      statusCode: 500,
    });
  }

  // Add product and entitlements to customer
  const cusProd = await createFullCusProduct({
    sb,
    customer,
    product,
    prices,
    entitlements,
    optionsList,
    subscriptionId: subscription.id,
  });

  // Add invoice
  const stripeInvoice = await stripeCli.invoices.retrieve(
    subscription.latest_invoice as string
  );

  await InvoiceService.createInvoiceFromStripe({
    sb,
    internalCustomerId: customer.internal_id,
    productIds: [product.id],
    stripeInvoice,
  });

  return cusProd;
};

export const handleAddProduct = async ({
  req,
  res,
  customer,
  product,
  prices,
  entitlements,
  org,
  env,
  optionsList,
}: {
  req: any;
  res: any;
  customer: Customer;
  product: FullProduct;
  prices: Price[];
  entitlements: EntitlementWithFeature[];
  org: Organization;
  env: AppEnv;
  optionsList: FeatureOptions[];
}) => {
  if (product.is_add_on) {
    console.log(
      `Adding add-on ${chalk.yellowBright(
        product.name
      )} to customer ${chalk.yellowBright(customer.id)}`
    );
  } else {
    console.log(
      `Adding product ${chalk.yellowBright(
        product.name
      )} to customer ${chalk.yellowBright(customer.id)}`
    );
  }

  // 1. Handle one-off payment products
  if (pricesOnlyOneOff(prices)) {
    console.log("Handling one-off payment products");
    return;
  }

  // 2. Get one-off + fixed cycle prices
  const billNowPrices = getBillNowPrices(prices);

  if (billNowPrices.length > 0) {
    await handleBillNowPrices({
      sb: req.sb,
      customer,
      product,
      prices,
      entitlements,
      optionsList,
      org,
      env,
    });

    res.status(200).send({ success: true });
    return;
  }

  console.log("Creating bill later prices");

  const billLaterPrices = getBillLaterPrices(prices);

  await createFullCusProduct({
    sb: req.sb,
    customer,
    product,
    prices,
    entitlements,
    optionsList,
    subscriptionId: undefined,
    billLaterOnly: true,
  });

  console.log("Successfully created full cus product");

  res.status(200).send({ success: true });
};
