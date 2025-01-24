import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, Product } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";

export class ProductService {
  // GET
  static async get(sb: SupabaseClient, productId: string) {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }
    return data;
  }

  static async getFullDefaultProduct({
    sb,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .select("*, prices(*), entitlements(*, feature:features(*))")
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("is_default", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async create({
    sb,
    product,
  }: {
    sb: SupabaseClient;
    product: Product;
  }) {
    const { data, error } = await sb.from("products").insert(product);
    if (error) {
      throw new RecaseError({
        message: "Failed to create product",
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }
    return data;
  }

  static async getProductStrict({
    sb,
    productId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    productId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }

    return data;
  }

  static async deleteProductStrict(
    sb: SupabaseClient,
    productId: string,
    orgId: string,
    env: AppEnv
  ) {
    const { error } = await sb
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }
  }

  static async getProducts(sb: SupabaseClient, orgId: string, env: AppEnv) {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    return data;
  }

  static async getFullProducts(sb: SupabaseClient, orgId: string, env: AppEnv) {
    const { data, error } = await sb
      .from("products")
      .select(
        `*,
        entitlements (
          *,
          feature:features (id, name, type)
        ),
        prices(*)
      `
      )
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("prices.is_custom", false);

    if (error) {
      throw error;
    }

    return data;
  }

  static async getEntitlementsByProductId(
    sb: SupabaseClient,
    productId: string
  ) {
    const { data, error } = await sb
      .from("entitlements")
      .select("*, feature:features(id, name, type)")
      .eq("product_id", productId);

    if (error) {
      if (error.code !== "PGRST116") {
        return [];
      }
      throw error;
    }

    return data;
  }

  static async getFullProduct({
    sb,
    productId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    productId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .select(
        `*,
        entitlements (
          *,
          feature:features (id, name, type)
        ),
        prices (*)
      `
      )
      .eq("id", productId)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getFullProductStrict({
    sb,
    productId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    productId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .select(
        `
      *,
      entitlements (
        *,
        feature:features (id, name, type)
      ),
      prices (*)
    `
      )
      .eq("id", productId)
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("prices.is_custom", false)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  // UPDATES
  static async update({
    sb,
    productId,
    update,
  }: {
    sb: SupabaseClient;
    productId: string;
    update: any;
  }) {
    const { data, error } = await sb
      .from("products")
      .update(update)
      .eq("id", productId);

    if (error) {
      throw new RecaseError({
        message: `Error updating product...please try again later.`,
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }
  }

  // Delete product
  static async deleteProduct(sb: SupabaseClient, productId: string) {
    const { error } = await sb.from("products").delete().eq("id", productId);
    if (error) {
      throw error;
    }
  }
}
