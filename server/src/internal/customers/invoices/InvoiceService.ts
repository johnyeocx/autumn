import { SupabaseClient } from "@supabase/supabase-js";
import { Invoice, InvoiceStatus, ProcessorType } from "@autumn/shared";
import Stripe from "stripe";
import { generateId } from "@/utils/genUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";

export class InvoiceService {
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

  static async getInvoices({
    sb,
    internalCustomerId,
  }: {
    sb: SupabaseClient;
    internalCustomerId: string;
  }) {
    const { data, error } = await sb
      .from("invoices")
      .select("*")
      .eq("internal_customer_id", internalCustomerId)
      .order("created_at", { ascending: false });

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
    status,
  }: {
    sb: SupabaseClient;
    stripeInvoice: Stripe.Invoice;
    internalCustomerId: string;
    productIds: string[];
    status?: InvoiceStatus | null;
  }) {
    const invoice: Invoice = {
      id: generateId("inv"),
      internal_customer_id: internalCustomerId,
      product_ids: productIds,
      created_at: stripeInvoice.created * 1000,
      stripe_id: stripeInvoice.id,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
      status: status || (stripeInvoice.status as InvoiceStatus | null),
    };

    // Check if invoice already exists
    // TODO: Fix This
    const existingInvoice = await this.getInvoiceByStripeId({
      sb,
      stripeInvoiceId: stripeInvoice.id,
    });

    if (existingInvoice) {
      console.log("Invoice already exists");
      return;
    }

    const { error } = await sb.from("invoices").upsert(invoice, {
      onConflict: "stripe_id",
    });

    if (error) {
      console.log("Failed to create invoice from stripe", error);
      throw new RecaseError({
        code: ErrCode.CreateInvoiceFailed,
        message: error.message,
      });
    }
  }
}
