import { FeatureService } from "@/internal/features/FeatureService.js";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import {
  AggregateType,
  CreditSystemConfig,
  Feature,
  FeatureResponseSchema,
  FeatureType,
  MeteredConfig,
} from "@autumn/shared";
import { CreateFeatureSchema } from "@autumn/shared";
import express from "express";
import { generateId } from "@/utils/genUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { handleUpdateFeature } from "./handleUpdateFeature.js";
import { validateCreditSystem } from "@/internal/features/featureUtils.js";
import { validateMeteredConfig } from "@/internal/features/featureUtils.js";

export const featureApiRouter = express.Router();



export const validateFeature = (data: any) => {
  let featureType = data.type;

  let config = data.config;
  if (featureType == FeatureType.Metered) {
    config = validateMeteredConfig(config);
  } else if (featureType == FeatureType.CreditSystem) {
    config = validateCreditSystem(config);
  }

  try {
    const parsedFeature = CreateFeatureSchema.parse({ ...data, config });
    return parsedFeature;
  } catch (error: any) {
    throw new RecaseError({
      message: `Invalid feature: ${formatZodError(error)}`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }
};

export const initNewFeature = ({
  data,
  orgId,
  env,
}: {
  data: any;
  orgId: string;
  env: any;
}) => {
  return {
    ...data,
    org_id: orgId,
    env,
    created_at: Date.now(),
    internal_id: generateId("fe"),
  };
};

featureApiRouter.get("", async (req: any, res) => {
  let features = await FeatureService.getFromReq(req);
  res
    .status(200)
    .json(features.map((feature) => FeatureResponseSchema.parse(feature)));
});

featureApiRouter.post("", async (req: any, res) => {
  let data = req.body;

  try {
    let parsedFeature = validateFeature(data);

    let feature: Feature = {
      internal_id: generateId("fe"),
      org_id: req.orgId,
      created_at: Date.now(),
      env: req.env,
      ...parsedFeature,
    };

    let insertedFeature = await FeatureService.insert({
      sb: req.sb,
      data: feature,
    });

    res.status(200).json(insertedFeature);
  } catch (error) {
    handleRequestError({ req, error, res, action: "Create feature" });
  }
});

featureApiRouter.post("/:feature_id", handleUpdateFeature);

featureApiRouter.delete("/:featureId", async (req: any, res) => {
  let orgId = req.orgId;
  let { featureId } = req.params;

  try {
    const { feature, creditSystems } =
      await FeatureService.getWithCreditSystems({
        sb: req.sb,
        orgId,
        featureId,
        env: req.env,
      });

    if (creditSystems.length > 0) {
      throw new RecaseError({
        message: `Feature ${featureId} is used by credit system ${creditSystems[0].id}`,
        code: ErrCode.InvalidFeature,
        statusCode: 400,
      });
    }

    // Get prices that use this feature
    const ents: any[] = await EntitlementService.getByFeature({
      sb: req.sb,
      orgId,
      internalFeatureId: feature.internal_id,
      env: req.env,
      withProduct: true,
    });

    if (ents.length > 0) {
      throw new RecaseError({
        message: `Feature ${featureId} is used in ${ents[0].product.name}`,
        code: ErrCode.InvalidFeature,
        statusCode: 400,
      });
    }

    await FeatureService.deleteStrict({
      sb: req.sb,
      orgId,
      featureId,
      env: req.env,
    });

    res.status(200).json({ message: "Feature deleted" });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Delete feature" });
  }
});
