import { ErrCode } from "@/errors/errCodes.js";
import { CusService } from "@/internal/customers/CusService.js";
import { EntitlementService } from "@/internal/products/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import {
  CusEntWithEntitlement,
  Entitlement,
  Feature,
  FeatureType,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";

export const entitlementApiRouter = Router();

entitlementApiRouter.post("", async (req: any, res) => {
  const data = req.body;
  const { product_id } = data;

  try {
    const product = await ProductService.getProductStrict({
      sb: req.sb,
      productId: product_id,
      orgId: req.org.id,
      env: req.env,
    });

    if (!product) {
      throw new RecaseError({
        message: `Product ${product_id} not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const entitlement: Entitlement = {
      id: generateId("ent"),
      org_id: req.org.id,
      product_id: product_id,
      created_at: Date.now(),
      ...data,
    };

    await EntitlementService.createEntitlement(req.sb, entitlement);

    res.status(200).json({ message: "Entitlement created" });
  } catch (error: any) {
    if (error instanceof RecaseError) {
      error.print();
      res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
      });
    } else {
      console.log("Failed to create entitlement:", error);
      res.status(500).json({ message: "Failed to create entitlement" });
    }
  }
});
