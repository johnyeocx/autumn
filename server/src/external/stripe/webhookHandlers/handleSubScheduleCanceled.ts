import { SupabaseClient } from "@supabase/supabase-js";

import { AppEnv } from "@shared/models/genModels.js";
import Stripe from "stripe";
import { CusProductStatus, Organization } from "@autumn/shared";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";

export const handleSubscriptionScheduleCanceled = async ({
  sb,
  schedule,
  env,
  org,
}: {
  sb: SupabaseClient;
  schedule: Stripe.SubscriptionSchedule;
  org: Organization;
  env: AppEnv;
}) => {
  const cusProductsOnSchedule = await CusProductService.getByScheduleId({
    sb,
    scheduleId: schedule.id,
    orgId: org.id,
    env,
  });

  if (cusProductsOnSchedule.length === 0) {
    console.log("   - subscription_schedule.canceled: no cus products found");
    return;
  }

  console.log("Handling subscription_schedule.canceled");
  console.log(
    "   - Found",
    cusProductsOnSchedule.length,
    "cus products on schedule"
  );
  for (const cusProduct of cusProductsOnSchedule) {
    console.log("   - Cus product", cusProduct.product.name, cusProduct.status);
    if (cusProduct.status === CusProductStatus.Scheduled) {
      await CusProductService.delete({
        sb,
        cusProductId: cusProduct.id,
      });
    } else {
      await CusProductService.update({
        sb,
        cusProductId: cusProduct.id,
        updates: {
          scheduled_ids: cusProduct.scheduled_ids?.filter(
            (id: string) => id !== schedule.id
          ),
        },
      });
    }
  }

  // if (cusProduct) {
  //   console.log("Handling subscription_schedule.canceled");
  //   await CusProductService.delete({
  //     sb,
  //     cusProductId: cusProduct.id,
  //   });
  //   console.log("   - Deleted cus product");

  //   for (const subId of cusProduct?.subscription_ids!) {
  //     if (subId === schedule.id) {
  //       continue;
  //     }

  //     try {
  //       await stripeCli.subscriptions.cancel(subId);
  //     } catch (error) {
  //       throw new RecaseError({
  //         message: `handleSubScheduleCanceled: failed to cancel subscription ${subId}`,
  //         code: ErrCode.StripeCancelSubscriptionScheduleFailed,
  //         statusCode: 200,
  //         data: error,
  //       });
  //     }
  //   }
  //   console.log("   - Cancelled all other scheduled subs");
  // }
};
