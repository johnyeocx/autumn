import { z } from "zod";

export const EventSchema = z.object({
  // Submitted by the client
  customer_id: z.string().nonempty(),
  event_name: z.string().nonempty(),
  properties: z.record(z.string(), z.any()),
  idempotency_key: z.string().nullish(),

  // Internal usage
  id: z.string(),
  env: z.string(),
  org_id: z.string(),
  timestamp: z.number(),
  internal_customer_id: z.string(),
  value: z.number().nullish(),
  set_usage: z.boolean().nullish(),
});

export const CreateEventSchema = z.object({
  customer_id: z.string().nonempty(),
  event_name: z.string().nonempty(),
  properties: z.record(z.string(), z.any()).nullish(),
  timestamp: z.number().nullish(),
  idempotency_key: z.string().nullish(),
  value: z.number().nullish(),
  set_usage: z.boolean().nullish(),
});

export type Event = z.infer<typeof EventSchema>;
export type CreateEvent = z.infer<typeof CreateEventSchema>;
