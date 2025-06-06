import {
  AppEnv,
  AuthType,
  Feature,
  MinOrg,
  Organization,
} from "@autumn/shared";
import { Logtail } from "@logtail/node";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { Client } from "pg";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { PostHog } from "posthog-node";

export interface ExtendedRequest extends ExpressRequest {
  id: string;
  authType: AuthType;

  pg: Client;
  db: DrizzleCli;

  userId?: string;

  logtail: Logtail;
  orgId: string;
  env: AppEnv;

  minOrg: MinOrg;
  org: Organization;
  features: Feature[];

  posthog?: PostHog;
  apiVersion?: number;

  timestamp: number;
}

export interface ActionRequest {
  id: string;
  authType: AuthType;
  method: string;
  path: string;
  body: any;
  timestamp: number;
}

export interface ExtendedResponse extends ExpressResponse {}
