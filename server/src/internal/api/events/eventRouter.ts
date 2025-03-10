import { Router } from "express";
import {
  AppEnv,
  CreateEventSchema,
  Customer,
  ErrCode,
  Event,
  Feature,
} from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";

import { EventService } from "./EventService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { Client } from "pg";
import { createNewCustomer } from "../customers/cusUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { QueueManager } from "@/queue/QueueManager.js";
import { subDays } from "date-fns";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { handleUsageEvent } from "./usageRouter.js";

export const eventsRouter = Router();

const getEventAndCustomer = async ({
  sb,
  orgId,
  env,
  customer_id,
  customer_data,
  event_data,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer_id: string;
  customer_data: any;
  event_data: any;
}) => {
  let customer: Customer;

  // 2. Check if customer ID is valid
  customer = await CusService.getById({
    sb: sb,
    id: customer_id,
    orgId: orgId,
    env: env,
  });

  if (!customer) {
    customer = await createNewCustomer({
      sb: sb,
      orgId: orgId,
      env: env,
      customer: {
        id: customer_id,
        name: customer_data?.name,
        email: customer_data?.email,
        fingerprint: customer_data?.fingerprint,
      },
    });
  }

  // 3. Insert event

  const parsedEvent = CreateEventSchema.parse(event_data);

  let eventTimestamp = Date.now();
  if (parsedEvent.timestamp) {
    let thirtyDaysAgo = subDays(new Date(), 30).getTime();
    if (parsedEvent.timestamp > thirtyDaysAgo) {
      eventTimestamp = parsedEvent.timestamp;
    }
  }

  const newEvent: Event = {
    ...parsedEvent,
    properties: parsedEvent.properties || {},
    id: generateId("evt"),
    org_id: orgId,
    env: env,
    internal_customer_id: customer.internal_id,
    timestamp: eventTimestamp,
  };

  await EventService.insertEvent(sb, newEvent);

  return { customer, event: newEvent };
};

const getAffectedFeatures = async ({
  pg,
  event,
  orgId,
  env,
}: {
  pg: Client;
  event: Event;
  orgId: string;
  env: AppEnv;
}) => {
  const { rows }: { rows: Feature[] } = await pg.query(`
    with features_with_event as (
      select * from features
      where org_id = '${orgId}'
      and env = '${env}'
      and config -> 'filters' @> '[{"value": ["${event.event_name}"]}]'::jsonb
    )

    select * from features WHERE
    org_id = '${orgId}'
    and env = '${env}'
    and EXISTS (
      SELECT 1 FROM jsonb_array_elements(config->'schema') as schema_element WHERE
      schema_element->>'metered_feature_id' IN (SELECT id FROM features_with_event)
    )
    UNION all
    select * from features_with_event
  `);

  return rows;
};

export const handleEventSent = async ({
  req,
  customer_id,
  customer_data,
  event_data,
}: {
  req: any;
  customer_id: string;
  customer_data: any;
  event_data: any;
}) => {
  if (event_data.feature_id) {
    return handleUsageEvent({
      req,
    });
  }

  const { sb, pg, orgId, env } = req;

  const org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  const { customer, event } = await getEventAndCustomer({
    sb,
    orgId,
    env,
    customer_id,
    customer_data,
    event_data,
  });

  const affectedFeatures = await getAffectedFeatures({
    pg: pg,
    event,
    orgId,
    env,
  });

  if (affectedFeatures.length > 0) {
    const payload = {
      customerId: customer.internal_id,
      customer,
      features: affectedFeatures,
      event,
      org,
      env,
    };

    const queue = await QueueManager.getQueue({ useBackup: false });

    try {
      // Add timeout to queue operation
      await queue.add("update-balance", payload);
      // console.log("Added update-balance to queue");
    } catch (error: any) {
      try {
        console.log("Adding update-balance to backup queue");
        const backupQueue = await QueueManager.getQueue({ useBackup: true });
        await backupQueue.add("update-balance", payload);
      } catch (error: any) {
        throw new RecaseError({
          message: "Failed to add update-balance to queue (backup)",
          code: "EVENT_QUEUE_ERROR",
          statusCode: 500,
          data: {
            message: error.message,
          },
        });
      }
    }
  }
};

eventsRouter.post("", async (req: any, res: any) => {
  const body = req.body;
  const orgId = req.orgId;
  const env = req.env;

  try {
    await handleEventSent({
      req,
      customer_id: body.customer_id,
      customer_data: body.customer_data,
      event_data: body,
    });

    res.status(200).json({ success: true });
    return;
  } catch (error) {
    handleRequestError({ req, res, error, action: "POST event failed" });
    return;
  }

  return;
});
