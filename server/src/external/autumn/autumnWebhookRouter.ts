import express from "express";
import { Webhook } from "svix";

export const autumnWebhookRouter = express.Router();

const verifyAutumnWebhook = async (req: any, res: any) => {
  const wh = new Webhook(process.env.AUTUMN_WEBHOOK_SECRET!);

  const headers = req.headers;
  const payload = req.body;

  const svix_id = headers["svix-id"];
  const svix_timestamp = headers["svix-timestamp"];
  const svix_signature = headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    res.status(400).json({
      success: false,
      message: "Error: Missing svix headers",
    });
    return;
  }

  let evt: any;
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id as string,
      "svix-timestamp": svix_timestamp as string,
      "svix-signature": svix_signature as string,
    });
  } catch (err) {
    console.log("Error: Could not verify webhook");
    res.status(400).json({
      success: false,
      message: "Error: Could not verify webhook",
    });
    return;
  }

  return evt;
};

autumnWebhookRouter.post(
  "",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("Webhook from autumn");

    const evt = await verifyAutumnWebhook(req, res);
    console.log(evt);
  }
);
