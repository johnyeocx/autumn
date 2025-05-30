import { decryptData, generatePublishableKey } from "@/utils/encryptUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, Organization } from "@autumn/shared";
import { createSvixApp } from "@/external/svix/svixUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "./OrgService.js";
import { FeatureService } from "../features/FeatureService.js";

export const constructOrg = ({ id, slug }: { id: string; slug: string }) => {
  return {
    id,
    slug,
    created_at: Date.now(),
    default_currency: "usd",
    stripe_connected: false,
    stripe_config: null,
    test_pkey: generatePublishableKey(AppEnv.Sandbox),
    live_pkey: generatePublishableKey(AppEnv.Live),
    svix_config: {
      sandbox_app_id: "",
      live_app_id: "",
    },
    config: {} as any,
  };
};
export const initOrgSvixApps = async ({
  id,
  slug,
}: {
  id: string;
  slug: string;
}) => {
  const batchCreate = [];
  batchCreate.push(
    createSvixApp({
      name: `${slug}_${AppEnv.Sandbox}`,
      orgId: id,
      env: AppEnv.Sandbox,
    }),
  );
  batchCreate.push(
    createSvixApp({
      name: `${slug}_${AppEnv.Live}`,
      orgId: id,
      env: AppEnv.Live,
    }),
  );

  const [sandboxApp, liveApp] = await Promise.all(batchCreate);

  return { sandboxApp, liveApp };
};

export const deleteStripeWebhook = async ({
  org,
  env,
}: {
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({ org, env });
  const webhookEndpoints = await stripeCli.webhookEndpoints.list({
    limit: 100,
  });

  for (const webhook of webhookEndpoints.data) {
    if (webhook.url.includes(org.id)) {
      try {
        await stripeCli.webhookEndpoints.del(webhook.id);
      } catch (error: any) {
        console.log(`Failed to delete stripe webhook (${env}) ${webhook.url}`);
        console.log(error.message);
      }
    }
  }
};

export const getStripeWebhookSecret = (org: Organization, env: AppEnv) => {
  if (!org.stripe_config) {
    throw new RecaseError({
      code: ErrCode.StripeConfigNotFound,
      message: `Stripe config not found for org ${org.id}`,
      statusCode: 400,
    });
  }

  const webhookSecret =
    env === AppEnv.Sandbox
      ? org.stripe_config.test_webhook_secret
      : org.stripe_config!.live_webhook_secret;

  return decryptData(webhookSecret);
};

export const initDefaultConfig = () => {
  return {
    free_trial_paid_to_paid: false,

    // 1. Upgrade prorates immediately
    bill_upgrade_immediately: true,

    // 2. Convert invoice to charge automatically
    convert_to_charge_automatically: false,
  };
};

export const createOrgResponse = (org: Organization) => {
  return {
    id: org.id,
    slug: org.slug,
    default_currency: org.default_currency,
    stripe_connected: org.stripe_connected,
    created_at: org.created_at,
    test_pkey: org.test_pkey,
    live_pkey: org.live_pkey,
  };
};

export const getOrgAndFeatures = async ({ req }: { req: any }) => {
  let { orgId, env } = req;

  let [org, features] = await Promise.all([
    OrgService.getFromReq(req),
    FeatureService.getFromReq(req),
  ]);

  return { org, features };
};
