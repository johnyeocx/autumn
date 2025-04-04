import { Router } from "express";
import { FeatureService } from "../features/FeatureService.js";
import { entitlementRouter } from "./entitlementRouter.js";
import { PriceService } from "../prices/PriceService.js";
import { ProductService } from "./ProductService.js";
import { EntitlementWithFeature } from "@autumn/shared";
import { BillingType } from "@autumn/shared";
import { FeatureOptions } from "@autumn/shared";
import { getBillingType } from "../prices/priceUtils.js";
import { OrgService } from "../orgs/OrgService.js";
import { CouponService } from "../coupons/CouponService.js";

export const productRouter = Router({ mergeParams: true });

productRouter.get("/data", async (req: any, res) => {
  let sb = req.sb;

  try {
    await OrgService.getFullOrg({
      sb,
      orgId: req.orgId,
    });
    const [products, features, org, coupons] = await Promise.all([
      ProductService.getFullProducts({ sb, orgId: req.orgId, env: req.env }),
      FeatureService.getFromReq(req),
      OrgService.getFromReq(req),
      CouponService.getAll({ sb, orgId: req.orgId, env: req.env }),
    ]);

    res.status(200).json({
      products,
      features,
      org: {
        id: org.id,
        name: org.name,
        test_pkey: org.test_pkey,
        live_pkey: org.live_pkey,
        default_currency: org.default_currency,
      },
      coupons,
    });
  } catch (error) {
    console.error("Failed to get products", error);
    res.status(500).send(error);
  }
});

// Get stripe products

productRouter.get("/:productId/data", async (req: any, res) => {
  const { productId } = req.params;
  const sb = req.sb;
  const orgId = req.orgId;
  const env = req.env;

  try {
    const product = await ProductService.getFullProductStrict({
      sb,
      productId,
      orgId,
      env,
    });

    let entitlements = product.entitlements;
    let prices = product.prices;

    // Sort entitlements by created_at descending, then id
    entitlements = entitlements.sort((a: any, b: any) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id.localeCompare(a.id);
    });

    // Sort prices by created_at descending, then id
    prices = prices.sort((a: any, b: any) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id.localeCompare(a.id);
    });

    const features = await FeatureService.getFeatures({
      sb,
      orgId,
      env,
    });

    const org = await OrgService.getFromReq(req);

    res.status(200).send({
      product,
      entitlements,
      prices,
      features,
      org: {
        id: org.id,
        name: org.name,
        test_pkey: org.test_pkey,
        live_pkey: org.live_pkey,
        default_currency: org.default_currency,
      },
    });
  } catch (error) {
    console.error("Failed to get products", error);
    res.status(500).send(error);
  }
});

// Individual Product routes
productRouter.get("/:productId", async (req: any, res) => {
  const { productId } = req.params;
  try {
    const Product = await ProductService.getProductStrict({
      sb: req.sb,
      productId,
      orgId: req.orgId,
      env: req.env,
    });

    const entitlements = await ProductService.getEntitlementsByProductId({
      sb: req.sb,
      productId,
      orgId: req.orgId,
      env: req.env,
    });

    const prices = await PriceService.getPricesByProductId(req.sb, productId);

    res.status(200).send({ Product, entitlements, prices });
  } catch (error) {
    console.log("Failed to get Product", error);
    res.status(404).send("Product not found");
    return;
  }
});

productRouter.use(entitlementRouter);

productRouter.post("/product_options", async (req: any, res: any) => {
  const { prices } = req.body;

  const features = await FeatureService.getFromReq(req);
  const featureToOptions: { [key: string]: FeatureOptions } = {};

  for (const price of prices) {
    // get billing tyoe
    const billingType = getBillingType(price.config);
    const feature = features.find(
      (f) => f.internal_id === price.config.internal_feature_id
    );

    if (billingType === BillingType.UsageBelowThreshold) {
      if (!featureToOptions[feature.id]) {
        featureToOptions[feature.id] = {
          feature_id: feature.id,
          threshold: 0,
        };
      } else {
        featureToOptions[feature.id].threshold = 0;
      }
    } else if (billingType === BillingType.UsageInAdvance) {
      if (!featureToOptions[feature.id]) {
        featureToOptions[feature.id] = {
          feature_id: feature.id,
          quantity: 0,
        };
      }

      featureToOptions[feature.id].quantity = 0;
    }
  }

  res.status(200).send({ options: Object.values(featureToOptions) });
});
