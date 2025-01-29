import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import {
  CreateFreeTrial,
  CreateFreeTrialSchema,
  FreeTrial,
  FreeTrialDuration,
  FullProduct,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addMinutes, addSeconds, getTime } from "date-fns";
import { FreeTrialService } from "./FreeTrialService.js";

export const validateAndInitFreeTrial = ({
  freeTrial,
  internalProductId,
  isCustom = false,
}: {
  freeTrial: CreateFreeTrial;
  internalProductId: string;
  isCustom?: boolean;
}): FreeTrial => {
  const freeTrialSchema = CreateFreeTrialSchema.parse(freeTrial);

  return {
    ...freeTrialSchema,
    id: generateId("ft"),
    created_at: Date.now(),
    duration: FreeTrialDuration.Day,
    internal_product_id: internalProductId,
    is_custom: isCustom,
  };
};

export const freeTrialsAreSame = (
  ft1?: FreeTrial | null,
  ft2?: FreeTrial | null
) => {
  if (!ft1 && !ft2) return true;
  if (!ft1 || !ft2) return false;
  return (
    ft1.length === ft2.length &&
    ft1.unique_fingerprint === ft2.unique_fingerprint
  );
};

export const freeTrialToStripeTimestamp = (freeTrial: FreeTrial | null) => {
  if (!freeTrial) return undefined;
  // 1. Add days
  let trialEnd = addDays(new Date(), freeTrial.length);
  trialEnd = addMinutes(trialEnd, 1);

  return Math.ceil(trialEnd.getTime() / 1000);
};

export const trialFingerprintExists = async ({
  sb,
  freeTrialId,
  fingerprint,
}: {
  sb: SupabaseClient;
  freeTrialId: string;
  fingerprint: string | null;
}) => {
  const { data, error } = await sb
    .from("customer_products")
    .select("*, customer:customers!inner(*)")
    .eq("free_trial_id", freeTrialId)
    .eq("customer.fingerprint", fingerprint);

  if (error) {
    throw error;
  }

  if (data && data.length > 0) {
    return true;
  }

  return false;
};

export const getFreeTrialAfterFingerprint = async ({
  sb,
  freeTrial,
  fingerprint,
}: {
  sb: SupabaseClient;
  freeTrial: FreeTrial | null;
  fingerprint: string | null | undefined;
}): Promise<FreeTrial | null> => {
  if (!freeTrial) return null;

  if (freeTrial.unique_fingerprint && fingerprint) {
    let exists = await trialFingerprintExists({
      sb,
      fingerprint,
      freeTrialId: freeTrial.id,
    });

    if (exists) {
      console.log("Free trial fingerprint exists");
      return null;
    }
  }

  return freeTrial;
};

// Init Free Trial

export const handleNewFreeTrial = async ({
  sb,
  newFreeTrial,
  curFreeTrial,
  internalProductId,
  isCustom = false,
}: {
  sb: SupabaseClient;
  newFreeTrial: FreeTrial | null;
  curFreeTrial: FreeTrial | null;
  internalProductId: string;
  isCustom: boolean;
}) => {
  if (!newFreeTrial) {
    return null;
  }

  if (freeTrialsAreSame(curFreeTrial, newFreeTrial)) {
    return curFreeTrial;
  }

  const createdFreeTrial = validateAndInitFreeTrial({
    freeTrial: newFreeTrial,
    internalProductId,
    isCustom,
  });

  if (isCustom && newFreeTrial) {
    await FreeTrialService.insert({
      sb,
      data: createdFreeTrial,
    });
  } else if (!isCustom && newFreeTrial) {
    createdFreeTrial.id = curFreeTrial?.id || createdFreeTrial.id;
    await FreeTrialService.update({
      sb,
      freeTrialId: createdFreeTrial.id,
      update: createdFreeTrial,
    });
  }

  return createdFreeTrial;
};
