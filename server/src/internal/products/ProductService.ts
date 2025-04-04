import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, Price, Product } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";

export class ProductService {
  // GET
  static async get(
    sb: SupabaseClient,
    productId: string,
    orgId: string,
    env: AppEnv
  ) {
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

  static async getByInternalId({
    sb,
    internalId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    internalId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("internal_id", internalId)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      throw error;
    }
    return data;
  }
  static async getFullDefaultProducts({
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
      .select(
        "*, prices(*), entitlements(*, feature:features(*)), free_trial:free_trials(*)"
      )
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("is_default", true)
      .eq("prices.is_custom", false)
      .eq("entitlements.is_custom", false)
      .eq("free_trial.is_custom", false);

    if (error) {
      throw error;
    }

    for (const product of data) {
      product.free_trial =
        product.free_trial.length > 0 ? product.free_trial[0] : null;
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

  static async getFullProducts({
    sb,
    orgId,
    env,
    inIds,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
    inIds?: string[];
  }) {
    const query = sb
      .from("products")
      .select(
        `*,
        entitlements (
          *,
          feature:features (*)
        ),
        prices(*),
        free_trial:free_trials(*)
      `
      )
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("prices.is_custom", false)
      .eq("entitlements.is_custom", false)
      .eq("free_trial.is_custom", false)
      .order("created_at", {
        ascending: false
      }).order("id");

    if (inIds) {
      query.in("id", inIds);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    for (const product of data) {
      product.free_trial =
        product.free_trial.length > 0 ? product.free_trial[0] : null;
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
        ` *,
        free_trial:free_trials(*),
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
      .eq("entitlements.is_custom", false)
      .eq("free_trial.is_custom", false)
      .single();

    if (error) {
      throw error;
    }

    data.free_trial = data.free_trial.length > 0 ? data.free_trial[0] : null;
    return data;
  }

  static async getEntitlementsByProductId({
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
      .from("entitlements")
      .select("*, feature:features(id, name, type)")
      .eq("product_id", productId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    return data;
  }

  // UPDATES
  static async update({
    sb,
    internalId,
    update,
  }: {
    sb: SupabaseClient;
    internalId: string;
    update: any;
  }) {
    const { data, error } = await sb
      .from("products")
      .update(update)
      .eq("internal_id", internalId);

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
  static async deleteProduct({
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
}
