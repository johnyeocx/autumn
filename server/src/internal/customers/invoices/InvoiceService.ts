import { SupabaseClient } from "@supabase/supabase-js";
import {
  Invoice,
  InvoiceStatus,
  LoggerAction,
  Organization,
} from "@autumn/shared";
import Stripe from "stripe";
import { generateId } from "@/utils/genUtils.js";
import { Autumn } from "@/external/autumn/autumnCli.js";
import { getInvoiceDiscounts } from "@/external/stripe/stripeInvoiceUtils.js";
import { logger } from "@trigger.dev/sdk/v3";
import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";

export const processInvoice = (invoice: Invoice) => {
  return {
    product_ids: invoice.product_ids,
    stripe_id: invoice.stripe_id,
    status: invoice.status,
    total: invoice.total,
    currency: invoice.currency,
    created_at: invoice.created_at,
    hosted_invoice_url: invoice.hosted_invoice_url,
  };
};

export class InvoiceService {
  static async getByInternalCustomerId({
    sb,
    internalCustomerId,
    limit = 100,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
    limit?: number;
  }) {
    const { data, error } = await sb
      .from("invoices")
      .select("*")
      .eq("internal_customer_id", internalCustomerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data;
  }

  static async createInvoice({
    sb,
    invoice,
  }: {
    sb: SupabaseClient;
    invoice: Invoice;
  }) {
    const { error } = await sb.from("invoices").insert(invoice);
    if (error) {
      throw error;
    }
  }

  static async getById({ sb, id }: { sb: SupabaseClient; id: string }) {
    const { data, error } = await sb
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  static async getInvoiceByStripeId({
    sb,
    stripeInvoiceId,
  }: {
    sb: SupabaseClient;
    stripeInvoiceId: string;
  }) {
    const { data, error } = await sb
      .from("invoices")
      .select("*")
      .eq("stripe_id", stripeInvoiceId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }
    return data;
  }

  static async createInvoiceFromStripe({
    sb,
    stripeInvoice,
    internalCustomerId,
    productIds,
    internalProductIds,
    status,
    org,
    sendRevenueEvent = true,
  }: {
    sb: SupabaseClient;
    stripeInvoice: Stripe.Invoice;
    internalCustomerId: string;
    productIds: string[];
    internalProductIds: string[];
    status?: InvoiceStatus | null;
    org: Organization;
    sendRevenueEvent?: boolean;
  }) {
    // Convert product ids to unique product ids
    const uniqueProductIds = [...new Set(productIds)];
    const uniqueInternalProductIds = [...new Set(internalProductIds)];

    let logger = createLogtailWithContext({
      org_slug: org.slug,
      stripe_invoice: stripeInvoice,
      action: LoggerAction.InsertStripeInvoice,
      internal_customer_id: internalCustomerId,
    });

    const invoice: Invoice = {
      id: generateId("inv"),
      internal_customer_id: internalCustomerId,
      product_ids: uniqueProductIds,
      created_at: stripeInvoice.created * 1000,
      stripe_id: stripeInvoice.id,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
      status: status || (stripeInvoice.status as InvoiceStatus | null),
      internal_product_ids: uniqueInternalProductIds,
      // Stripe stuff
      total: stripeInvoice.total / 100,
      currency: stripeInvoice.currency,
      discounts: getInvoiceDiscounts({
        expandedInvoice: stripeInvoice,
        logger: logger,
      }),
    };

    const { error } = await sb.from("invoices").insert(invoice);

    if (error) {
      if (error.code == "23505") {
        console.log("   🧐 Invoice already exists");

        // Update invoice status
        return;
      }
      console.log("   ❌ Error inserting Stripe invoice: ", error);
      return;
    }

    console.log("   ✅ Created invoice from stripe");

    // Send monthly_revenue event
    try {
      if (!stripeInvoice.livemode || !sendRevenueEvent) {
        return;
      }

      const autumn = new Autumn();
      await autumn.sendEvent({
        customerId: org.id,
        eventName: "revenue",
        properties: {
          value: stripeInvoice.total / 100,
        },
        customer_data: {
          name: org.slug,
        },
      });
      console.log("   ✅ Sent revenue event");
    } catch (error) {
      console.log("Failed to send revenue event", error);
    }
  }

  static async updateByStripeId({
    sb,
    stripeInvoiceId,
    updates,
  }: {
    sb: SupabaseClient;
    stripeInvoiceId: string;
    updates: Partial<Invoice>;
  }) {
    const { error } = await sb
      .from("invoices")
      .update(updates)
      .eq("stripe_id", stripeInvoiceId);

    if (error) {
      throw error;
    }
  }
}

// // Check if invoice already exists
// // TODO: Fix This
// const existingInvoice = await this.getInvoiceByStripeId({
//   sb,
//   stripeInvoiceId: stripeInvoice.id,
// });

// if (existingInvoice) {
//   console.log("Invoice already exists");
//   return;
// }

// // const { error } = await sb
// //   .from("invoices")
// //   .upsert(invoice, {
// //     onConflict: "stripe_id",
// //   })
// //   .select();
