import { OrgService } from "@/internal/orgs/OrgService.js";
import { AppEnv, ErrCode } from "@autumn/shared";

const allowedEndpoints = ["/v1/entitled", "/v1/attach"];

export const verifyBearerPublishableKey = async (
  pkey: string,
  req: any,
  res: any,
  next: any
) => {
  try {
    if (!allowedEndpoints.includes(req.originalUrl)) {
      return {
        error: ErrCode.EndpointNotPublic,
        fallback: false,
        statusCode: 401,
      };
    }

    if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
      return {
        error: ErrCode.InvalidPublishableKey,
        fallback: false,
        statusCode: 400,
      };
    }

    let env: AppEnv = pkey.startsWith("am_pk_test")
      ? AppEnv.Sandbox
      : AppEnv.Live;

    const org = await OrgService.getFromPkey({
      sb: req.sb,
      pkey: pkey,
      env: env,
    });

    if (!org) {
      return {
        error: ErrCode.OrgNotFound,
        fallback: false,
        statusCode: 401,
      };
    }

    req.minOrg = {
      id: org.id,
      slug: org.slug,
    };
    req.orgId = org.id;
    req.env = env;
    req.isPublic = true;

    console.log("Public request from:", org.slug);
    next();
    return {
      error: null,
      fallback: null,
      statusCode: null,
    };
  } catch (error: any) {
    console.log(`Failed to get org from publishable key ${pkey}`);
    return {
      error: ErrCode.GetOrgFromPublishableKeyFailed,
      fallback: false,
      statusCode: 500,
    };
  }
};

export const verifyPublishableKey = async (req: any, res: any, next: any) => {
  if (!allowedEndpoints.includes(req.originalUrl)) {
    return {
      error: ErrCode.EndpointNotPublic,
      fallback: true,
      statusCode: null,
    };
  }

  const pkey =
    req.headers["x-publishable-key"] || req.headers["X-Publishable-Key"];

  if (!pkey) {
    return {
      error: ErrCode.NoPublishableKey,
      fallback: true,
      statusCode: null,
    };
  }

  if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
    return {
      error: ErrCode.InvalidPublishableKey,
      fallback: true,
      statusCode: null,
    };
  }

  let env: AppEnv = pkey.startsWith("am_pk_test")
    ? AppEnv.Sandbox
    : AppEnv.Live;

  // 2. Get orgId from publishable key
  try {
    const org = await OrgService.getFromPkey({
      sb: req.sb,
      pkey: pkey,
      env: env,
    });

    if (!org) {
      return {
        error: ErrCode.OrgNotFound,
        fallback: false,
        statusCode: 401,
      };
    }

    req.minOrg = {
      id: org.id,
      slug: org.slug,
    };
    req.orgId = org.id;
    req.env = env;
    req.isPublic = true;

    console.log("Public request from:", org.slug);
    next();
    return {
      error: null,
    };
  } catch (error: any) {
    console.log(`Failed to get org from publishable key ${pkey}`);
    return {
      error: ErrCode.GetOrgFromPublishableKeyFailed,
      fallback: false,
      statusCode: 500,
    };
  }
};
