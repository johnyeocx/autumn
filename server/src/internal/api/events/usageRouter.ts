import { Router } from "express";
import { Customer, ErrCode, Event } from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { generateId, nullish } from "@/utils/genUtils.js";

import { EventService } from "./EventService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { createNewCustomer } from "../customers/cusUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { StatusCodes } from "http-status-codes";
import { QueueManager } from "@/queue/QueueManager.js";
import { z } from "zod";
import { JobName } from "@/queue/JobName.js";
export const eventsRouter = Router();
export const usageRouter = Router();

const getCusFeatureAndOrg = async ({
  req,
  customerId,
  featureId,
  customerData,
}: {
  req: any;
  customerId: string;
  featureId: string;
  customerData: any;
}) => {
  // 1. Get customer
  let [customer, featureRes, org] = await Promise.all([
    CusService.getById({
      sb: req.sb,
      id: customerId,
      orgId: req.orgId,
      env: req.env,
    }),
    FeatureService.getWithCreditSystems({
      sb: req.sb,
      featureId,
      orgId: req.orgId,
      env: req.env,
    }),
    OrgService.getFullOrg({
      sb: req.sb,
      orgId: req.minOrg.id,
    }),
  ]);

  let { feature, creditSystems } = featureRes;
  if (!feature) {
    throw new RecaseError({
      message: `Feature ${featureId} not found`,
      code: ErrCode.FeatureNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  if (!customer) {
    customer = await createNewCustomer({
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      customer: {
        id: customerId,
        name: customerData?.name,
        email: customerData?.email,
        fingerprint: customerData?.fingerprint,
      },
    });
  }

  return { customer, org, feature, creditSystems };
};

const createAndInsertEvent = async ({
  req,
  customer,
  featureId,
  value,
  set_usage,
  properties,
}: {
  req: any;
  customer: Customer;
  featureId: string;
  value?: number;
  set_usage?: boolean;
  properties: any;
}) => {
  const newEvent: Event = {
    id: generateId("evt"),
    org_id: req.orgId,
    env: req.env,
    internal_customer_id: customer.internal_id,
    timestamp: Date.now(),
    customer_id: customer.id,
    event_name: featureId,
    properties,
    value,
    set_usage: set_usage || false,
  };

  await EventService.insertEvent(req.sb, newEvent);
};

export const handleUsageEvent = async ({
  req,
  setUsage = false,
}: {
  req: any;
  setUsage?: boolean;
}) => {
  let { customer_id, customer_data, properties, feature_id, value } = req.body;
  properties = properties || {};

  const { customer, org, feature, creditSystems } = await getCusFeatureAndOrg({
    req,
    customerId: customer_id,
    featureId: feature_id,
    customerData: customer_data,
  });

  await createAndInsertEvent({
    req,
    customer,
    featureId: feature_id,
    value,
    set_usage: setUsage,
    properties,
  });

  const features = [feature, ...creditSystems];

  const queue = await QueueManager.getQueue({ useBackup: false });

  if (nullish(value) || isNaN(parseFloat(value))) {
    value = 1;
  } else {
    value = parseFloat(value);
  }

  const payload = {
    customerId: customer.internal_id,
    customer,
    features,
    org,
    env: req.env,
    properties,
    value,
    set_usage: setUsage,
  };

  try {
    // Add timeout to queue operation
    await queue.add(JobName.UpdateUsage, payload);
  } catch (error: any) {
    try {
      console.log("Adding update-balance to backup queue");
      const backupQueue = await QueueManager.getQueue({ useBackup: true });
      await backupQueue.add(JobName.UpdateUsage, payload);
    } catch (error: any) {
      throw new RecaseError({
        message: "Failed to add update-usage to queue (backup)",
        code: "EVENT_QUEUE_ERROR",
        statusCode: 500,
        data: {
          message: error.message,
        },
      });
    }
  }

  return;
};

usageRouter.post("", async (req: any, res: any) => {
  try {
    await handleUsageEvent({ req, setUsage: true });
    res.status(StatusCodes.OK).json({ success: true });
  } catch (error) {
    return handleRequestError({
      req,
      res,
      error,
      action: "handleUsageEvent",
    });
  }
});
