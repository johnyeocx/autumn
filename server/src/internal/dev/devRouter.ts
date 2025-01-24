import { createKey, deleteKey, updateKey } from "@/external/unkeyUtils.js";
import { withOrgAuth } from "@/middleware/authMiddleware.js";
import { ApiKey, AppEnv } from "@autumn/shared";
import { Router } from "express";
import { ApiKeyService } from "./ApiKeyService.js";

export const devRouter = Router();

devRouter.get("/data", withOrgAuth, async (req: any, res) => {
  const apiKeys = await ApiKeyService.getByOrg(req.sb, req.org.id, req.env);

  res.status(200).json({
    api_keys: apiKeys,
  });
});

devRouter.post("/api_key", withOrgAuth, async (req: any, res) => {
  const env = req.env;
  const org = req.org;
  const { name } = req.body;

  // 1. Create API key
  let prefix = "am_test";
  if (env === AppEnv.Live) {
    prefix = "am_live";
  }

  const apiKey = await createKey(env, name, org.id, prefix, {});
  if (!apiKey.result) {
    console.error("Failed to create API key", apiKey);
    res.status(500).json({ error: "Failed to create API key" });
    return;
  }

  const apiKeyData: ApiKey = {
    id: apiKey.result!.keyId,
    org_id: org.id,
    user_id: req.user.id,
    name,
    prefix: apiKey.result!.key.substring(0, 10),
    created_at: Date.now(),
    env,
  };

  await ApiKeyService.insert(req.sb, apiKeyData);

  res.status(200).json({
    api_key: apiKey.result!.key,
  });
});

devRouter.delete("/api_key/:id", withOrgAuth, async (req: any, res) => {
  const { id } = req.params;
  try {
    let count = await ApiKeyService.deleteStrict(req.sb, id, req.org.id);
    if (count === 0) {
      console.error("API key not found");
      res.status(404).json({ error: "API key not found" });
      return;
    }

    await deleteKey(id);
  } catch (error) {
    console.error("Failed to delete API key", error);
    res.status(500).json({ error: "Failed to delete API key" });
    return;
  }

  res.status(200).json({ message: "API key deleted" });
});

// am_live_3ZaPDgqt7K4GkdirAU9oDFT3
// am_test_3ZTRcHdEsdAdoxvSUGL8L35x
