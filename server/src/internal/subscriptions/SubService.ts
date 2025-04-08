import { SupabaseClient } from "@supabase/supabase-js";
import { Subscription } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";

export class SubService {
  static async createSub({
    sb,
    sub,
  }: {
    sb: SupabaseClient;
    sub: Subscription;
  }) {
    let { data, error } = await sb
      .from("subscriptions")
      .insert(sub)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async addUsageFeatures({
    sb,
    stripeId,
    scheduleId,
    usageFeatures,
  }: {
    sb: SupabaseClient;
    stripeId?: string;
    scheduleId?: string;
    usageFeatures: string[];
  }) {
    if (!stripeId && !scheduleId) {
      throw new Error("Either stripeId or scheduleId must be provided");
    }

    let query = sb.from("subscriptions").select("*");
    if (stripeId) {
      query = query.eq("stripe_id", stripeId);
    } else if (scheduleId) {
      query = query.eq("stripe_schedule_id", scheduleId);
    }

    let { data, error: curSubsError } = await query;

    if (curSubsError || !data) {
      throw curSubsError;
    }

    if (data.length == 0) {
      // throw new Error("Subscription not found");
      // From old plan
      return await SubService.createSub({
        sb,
        sub: {
          id: generateId("sub"),
          created_at: Date.now(),
          stripe_id: stripeId || null,
          stripe_schedule_id: scheduleId || null,
          usage_features: usageFeatures,
        },
      });
    }

    let curSub = data[0];
    let { data: updatedSub, error } = await sb
      .from("subscriptions")
      .update({
        usage_features: [
          ...new Set([...curSub.usage_features, ...usageFeatures]),
        ],
      })
      .eq("id", curSub.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return updatedSub;
  }

  static async updateFromStripeId({
    sb,
    stripeId,
    updates,
  }: {
    sb: SupabaseClient;
    stripeId: string;
    updates: any;
  }) {
    let { data, error } = await sb
      .from("subscriptions")
      .update(updates)
      .eq("stripe_id", stripeId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getFromScheduleId({
    sb,
    scheduleId,
  }: {
    sb: SupabaseClient;
    scheduleId: string;
  }) {
    let { data, error } = await sb
      .from("subscriptions")
      .select("*")
      .eq("stripe_schedule_id", scheduleId);

    if (error || !data) {
      throw error;
    }

    if (data.length == 0) {
      return null;
    }

    return data[0];
  }

  static async updateFromScheduleId({
    sb,
    scheduleId,
    updates,
  }: {
    sb: SupabaseClient;
    scheduleId: string;
    updates: any;
  }) {
    let { data: updatedSub, error } = await sb
      .from("subscriptions")
      .update(updates)
      .eq("stripe_schedule_id", scheduleId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return updatedSub;
  }

  static async getInStripeIds({
    sb,
    ids,
  }: {
    sb: SupabaseClient;
    ids: string[];
  }) {
    let { data, error } = await sb
      .from("subscriptions")
      .select("*")
      .in("stripe_id", ids);

    if (error) {
      throw error;
    }

    return data;
  }
}
