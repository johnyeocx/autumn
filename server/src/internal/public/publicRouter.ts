import { Router } from "express";
import { OrgService } from "../orgs/OrgService.js";
import {
  AppEnv,
  CusProductStatus,
  CustomerResponseSchema,
  ErrCode,
  FeatureType,
  FullProduct,
  Price,
  PriceType,
  Product,
  PublicEntitlementSchema,
  PublicProductSchema,
  UsagePriceConfig,
} from "@autumn/shared";
import { ProductService } from "../products/ProductService.js";
import { CusProductService } from "../customers/products/CusProductService.js";
import { processFullCusProduct } from "../customers/products/cusProductUtils.js";
import {
  getOptionsFromPrices,
  isProductUpgrade,
} from "../products/productUtils.js";
import { FeatureService } from "../features/FeatureService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { CusService } from "../customers/CusService.js";
import { getCustomerDetails } from "../api/customers/cusUtils.js";
import publicProductsRouter from "./getPublicProducts.js";
import { publicAttachRouter } from "./publicAttach.js";

export const publicRouter = Router();

const publicRouterMiddleware = async (req: any, res: any, next: any) => {
  const pkey = req.headers["x-publishable-key"];

  if (!pkey) {
    console.log("No pkey:", pkey);
    return res.status(400).json({ message: "Publishable key is required" });
  }

  if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
    console.log("Invalid pkey:", pkey);
    return res.status(400).json({ message: "Invalid publishable key" });
  }

  let env: AppEnv = pkey.startsWith("am_pk_test")
    ? AppEnv.Sandbox
    : AppEnv.Live;

  // 2. Get orgId from publishable key
  try {
    const org = await OrgService.getFromPkey({
      sb: req.sb,
      pkey: pkey,
      env: env,
    });

    if (!org) {
      return res.status(401).json({
        message: "Unauthorized -- org not found for this publishable key",
      });
    }
    req.org = org;
    req.minOrg = {
      id: org.id,
      slug: org.slug,
    };
    req.orgId = org.id;
    req.env = env;

    console.log("Public request from:", org.slug);
    next();
  } catch (error: any) {
    console.log("Failed to get org from pkey");
    console.log("Error code:", error.code);
    return res.status(400).json({ message: "Invalid publishable key" });
  }
};

publicRouter.use(publicRouterMiddleware);

publicRouter.get("/customers/:customer_id", async (req: any, res: any) => {
  try {
    const customerId = req.params.customer_id;
    console.log("Getting customer (public)", customerId);
    console.log("Org ID", req.org.id);
    console.log("Env", req.env);
    const customer = await CusService.getById({
      sb: req.sb,
      id: customerId,
      orgId: req.org.id,
      env: req.env,
    });

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customerId} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const { main, addOns, balances, invoices } = await getCustomerDetails({
      customer,
      sb: req.sb,
      orgId: req.org.id,
      env: req.env,
      params: req.query,
    });

    res.status(200).json({
      customer: CustomerResponseSchema.parse(customer),
      products: main,
      add_ons: addOns,
      entitlements: balances,
      invoices,
    });
  } catch (error) {
    handleRequestError({ req, error, res, action: "get customer" });
  }
});

publicRouter.get(
  "/customers/:customerId/products",
  async (req: any, res: any) => {
    const customerId = req.params.customerId;

    const cusProducts = await CusProductService.getFullByCustomerId({
      sb: req.sb,
      customerId,
      orgId: req.org.id,
      env: req.env,
      inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
    });

    if (!cusProducts || cusProducts.length === 0) {
      return res.status(200).json({
        main: [],
        add_ons: [],
      });
    }

    let main = [];
    let addOns = [];

    for (const cusProduct of cusProducts) {
      let processed = processFullCusProduct(cusProduct);

      if (processed.status == CusProductStatus.Trialing) {
        processed.status = CusProductStatus.Active;
      }

      let isAddOn = cusProduct.product.is_add_on;
      if (isAddOn) {
        addOns.push(processed);
      } else {
        main.push(processed);
      }
    }

    // console.log("main", main);

    res.status(200).json({
      main,
      add_ons: addOns,
    });
  }
);

publicRouter.get(
  "/products/:product_id/options",
  async (req: any, res: any) => {
    const product = await ProductService.getFullProductStrict({
      sb: req.sb,
      productId: req.params.product_id,
      orgId: req.org.id,
      env: req.env,
    });

    const features = await FeatureService.getFeatures({
      sb: req.sb,
      orgId: req.org.id,
      env: req.env,
    });

    const prices = product.prices;

    const options = getOptionsFromPrices(prices, features);

    res.status(200).json(options);
  }
);

publicRouter.use("/products", publicProductsRouter);
publicRouter.use("/attach", publicAttachRouter);
