import { apiAuthMiddleware } from "@/middleware/apiMiddleware.js";
import { Router } from "express";
import { eventsRouter } from "./events/eventRouter.js";
import { cusRouter } from "./customers/cusRouter.js";
import { productApiRouter } from "./products/productRouter.js";
import { priceRouter } from "./prices/priceRouter.js";

import { entitlementApiRouter } from "./entitlements/entitlementsRouter.js";
import { featureApiRouter } from "./features/featureApiRouter.js";
import { entitledRouter } from "./entitled/entitledRouter.js";
import { attachRouter } from "./customers/products/cusProductRouter.js";
import {
  FeatureId,
  isEntitled,
  sendFeatureEvent,
  sendProductEvent,
} from "@/external/autumn/autumnUtils.js";
import { OrgService } from "../orgs/OrgService.js";
import { handleRequestError } from "@/utils/errorUtils.js";

const apiRouter = Router();

const pricingMiddleware = async (req: any, res: any, next: any) => {
  let path = req.url;
  let method = req.method;

  if (
    req.minOrg.slug == "autumn" ||
    req.minOrg.slug == "firecrawl" ||
    req.minOrg.slug == "pipeline" ||
    req.minOrg.slug == "alex"
  ) {
    next();
    return;
  }

  try {
    if (path == "/products" && method == "POST") {
      await isEntitled({
        minOrg: req.minOrg,
        env: req.env,
        featureId: FeatureId.Products,
      });
    }

    if (path == "/attach" && method == "POST") {
      await isEntitled({
        minOrg: req.minOrg,
        env: req.env,
        featureId: FeatureId.Revenue,
      });
    }

    next();
  } catch (error) {
    handleRequestError({ error, res, action: "pricingMiddleware" });
    return;
  }

  if (res.statusCode === 200) {
    if (path == "/products" && method === "POST") {
      await sendProductEvent({
        minOrg: req.minOrg,
        env: req.env,
        incrementBy: 1,
      });
    }

    if (path.match(/^\/products\/[^\/]+$/) && method === "DELETE") {
      await sendProductEvent({
        minOrg: req.minOrg,
        env: req.env,
        incrementBy: -1,
      });
    }
  }
};

apiRouter.use(apiAuthMiddleware);
apiRouter.use(pricingMiddleware);

apiRouter.use("/attach", attachRouter);
apiRouter.use("/customers", cusRouter);
apiRouter.use("/products", productApiRouter);
apiRouter.use("/features", featureApiRouter);

apiRouter.use("/entitlements", entitlementApiRouter);
apiRouter.use("/events", eventsRouter);
apiRouter.use("/prices", priceRouter);
apiRouter.use("/entitled", entitledRouter);

export { apiRouter };
