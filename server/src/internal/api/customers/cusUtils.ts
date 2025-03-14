import {
  CreateCustomerSchema,
  CusProductSchema,
  CusProductStatus,
  Customer,
  CustomerSchema,
  ErrCode,
  FullCusProduct,
  Organization,
  ProductSchema,
} from "@autumn/shared";

import { CreateCustomer } from "@autumn/shared";

import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";

import { generateId } from "@/utils/genUtils.js";
import { z } from "zod";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  fullCusProductToCusEnts,
  fullCusProductToCusPrices,
  processFullCusProduct,
} from "@/internal/customers/products/cusProductUtils.js";
import {
  getCusBalancesByEntitlement,
  sortCusEntsForDeduction,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { processInvoice } from "@/internal/customers/invoices/InvoiceService.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { initGroupBalancesFromGetCus } from "@/internal/customers/entitlements/groupByUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import RecaseError from "@/utils/errorUtils.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";
import { handleAddDefaultPaid } from "@/internal/customers/add-product/handleAddDefaultPaid.js";

export const createNewCustomer = async ({
  sb,
  orgId,
  env,
  customer,
  nextResetAt,
  logger,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer: CreateCustomer;
  nextResetAt?: number;
  logger: any;
}) => {
  console.log("Creating new customer");
  console.log("Org ID:", orgId);
  console.log("Customer data:", customer);

  const org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  const parsedCustomer = CreateCustomerSchema.parse(customer);

  const customerData: Customer = {
    ...parsedCustomer,
    name: parsedCustomer.name || "",
    email: parsedCustomer.email || "",

    internal_id: generateId("cus"),
    org_id: orgId,
    created_at: Date.now(),
    env,
  };

  const newCustomer = await CusService.createCustomer({
    sb,
    customer: customerData,
  });

  // Attach default product to customer
  const defaultProds = await ProductService.getFullDefaultProducts({
    sb,
    orgId,
    env,
  });

  for (const product of defaultProds) {
    // Handle prices
    let prices = product.prices;
    if (prices) {
      // 1. Try handle add product...?
      await handleAddDefaultPaid({
        sb,
        attachParams: {
          org,
          customer: newCustomer,
          prices: product.prices,
          entitlements: product.entitlements,
          freeTrial: null,
          optionsList: [],
          cusProducts: [],
          products: [product],
        },
        logger,
      });
    } else {
      await createFullCusProduct({
        sb,
        attachParams: {
          org,
          customer: newCustomer,
          product,
          prices: product.prices,
          entitlements: product.entitlements,
          freeTrial: null, // TODO: Free trial not supported on default product yet
          optionsList: [],
          cusProducts: [],
        },
        nextResetAt,
      });
    }
  }

  return newCustomer;
};

export const attachDefaultProducts = async ({
  sb,
  orgId,
  env,
  customer,
  nextResetAt,
  org,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer: Customer;
  org: Organization;
  nextResetAt?: number;
}) => {
  const defaultProds = await ProductService.getFullDefaultProducts({
    sb,
    orgId,
    env,
  });

  for (const product of defaultProds) {
    await createFullCusProduct({
      sb,
      attachParams: {
        org,
        customer: customer,
        product,
        prices: product.prices,
        entitlements: product.entitlements,
        freeTrial: null, // TODO: Free trial not supported on default product yet
        optionsList: [],
      },
      nextResetAt,
    });
  }
};

const CusProductResultSchema = CusProductSchema.extend({
  customer: CustomerSchema,
  product: ProductSchema,
});

export const flipProductResults = (
  cusProducts: z.infer<typeof CusProductResultSchema>[]
) => {
  const customers = [];

  for (const cusProduct of cusProducts) {
    customers.push({
      ...cusProduct.customer,
      customer_products: [cusProduct],
    });
  }
  return customers;
};

// getCustomerDetails helpers
const getCusInvoices = async ({
  sb,
  internalCustomerId,
  limit = 20,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  limit?: number;
}) => {
  // Get customer invoices
  const invoices = await InvoiceService.getByInternalCustomerId({
    sb,
    internalCustomerId,
    limit,
  });

  const processedInvoices = invoices.map(processInvoice);

  return processedInvoices;
};

const processFullCusProducts = (fullCusProducts: any) => {
  // Process full cus products
  let main = [];
  let addOns = [];
  for (const cusProduct of fullCusProducts) {
    let processed = processFullCusProduct(cusProduct);

    let isAddOn = cusProduct.product.is_add_on;
    if (isAddOn) {
      addOns.push(processed);
    } else {
      main.push(processed);
    }
  }

  return { main, addOns };
};

export const getCustomerDetails = async ({
  customer,
  sb,
  orgId,
  env,
  params = {},
}: {
  customer: Customer;
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  params?: any;
}) => {
  // 1. Get full customer products & processed invoices
  const [fullCusProducts, processedInvoices] = await Promise.all([
    CusService.getFullCusProducts({
      sb,
      internalCustomerId: customer.internal_id,
      withProduct: true,
      withPrices: true,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
    }),
    getCusInvoices({
      sb,
      internalCustomerId: customer.internal_id,
      limit: 20,
    }),
  ]);

  // 2. Initialize group by balances
  let cusEnts = fullCusProductToCusEnts(fullCusProducts) as any;
  await initGroupBalancesFromGetCus({
    sb,
    cusEnts,
    params,
  });

  // Get entitlements
  const balances = await getCusBalancesByEntitlement({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: fullCusProductToCusPrices(fullCusProducts),
    groupVals: params,
  });

  const { main, addOns } = processFullCusProducts(fullCusProducts);

  return {
    customer,
    main,
    addOns,
    balances,
    invoices: processedInvoices,
  };
};

export const getCusEntsInFeatures = async ({
  sb,
  internalCustomerId,
  internalFeatureIds,
  inStatuses = [CusProductStatus.Active],
  withPrices = false,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  internalFeatureIds: string[];
  inStatuses?: CusProductStatus[];
  withPrices?: boolean;
}) => {
  const fullCusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId,
    inStatuses: inStatuses,
    withPrices: withPrices,
  });

  const cusEntsWithCusProduct = fullCusProductToCusEnts(
    fullCusProducts!,
    inStatuses
  );

  if (!cusEntsWithCusProduct) {
    return { cusEnts: [] };
  }

  const cusEnts = cusEntsWithCusProduct.filter((cusEnt) =>
    internalFeatureIds.includes(cusEnt.internal_feature_id)
  );

  sortCusEntsForDeduction(cusEnts);

  if (!withPrices) {
    return { cusEnts, cusPrices: undefined };
  }

  const cusPrices = fullCusProductToCusPrices(fullCusProducts, inStatuses);

  return { cusEnts, cusPrices };
};
