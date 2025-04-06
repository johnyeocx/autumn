import {
  AppEnv,
  CusProductStatus,
  Customer,
  FullCusProduct,
  FullProduct,
  MigrationJob,
  MigrationJobStep,
  Organization,
  Product,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { MigrationService } from "../MigrationService.js";
import {
  handleUpgrade,
  ProrationBehavior,
} from "@/internal/customers/change-product/handleUpgrade.js";
import { AttachParams } from "@/internal/customers/products/AttachParams.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getExistingCusProducts } from "@/internal/customers/add-product/handleExistingProduct.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { createStripePriceIFNotExist } from "@/external/stripe/stripePriceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { constructMigrationError } from "../migrationUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { migrateCustomer } from "./migrateCustomer.js";
import { sendMigrationEmail } from "./sendMigrationEmail.js";

export const migrateCustomers = async ({
  sb,
  migrationJob,
  fromProduct,
  toProduct,
  logger,
  customers,
}: {
  sb: SupabaseClient;
  migrationJob: MigrationJob;
  fromProduct: FullProduct;
  toProduct: FullProduct;
  logger: any;
  customers: Customer[];
}) => {
  await MigrationService.updateJob({
    sb,
    migrationJobId: migrationJob.id,
    updates: {
      current_step: MigrationJobStep.MigrateCustomers,
    },
  });

  let batchCount = 0;
  let { org_id: orgId, env } = migrationJob;

  let org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  org.config.bill_upgrade_immediately = false;

  // Create stripe prices if they don't exist
  let stripeCli = createStripeCli({ org, env });
  let batchCreate = [];
  for (let price of toProduct.prices) {
    batchCreate.push(
      createStripePriceIFNotExist({
        sb,
        stripeCli,
        price,
        entitlements: toProduct.entitlements,
        product: toProduct,
        org,
        logger,
      })
    );
  }

  await Promise.all(batchCreate);

  let batchSize = 5;

  for (let i = 0; i < customers.length; i += batchSize) {
    let batchCustomers = customers.slice(i, i + batchSize);
    let batchPromises = [];
    for (let customer of batchCustomers) {
      batchPromises.push(
        migrateCustomer({
          migrationJob,
          sb,
          customer,
          org,
          logger,
          env,
          orgId,
          fromProduct,
          toProduct,
        })
      );
    }

    let results = await Promise.all(batchPromises);
    let numPassed = results.filter((r) => r).length;
    let numFailed = results.filter((r) => !r).length;
    logger.info(
      `Job: ${migrationJob.id} - Migrated ${i + batchCustomers.length}/${
        customers.length
      }  customers, ${numPassed} passed, ${numFailed} failed`
    );

    // Get current number of customers migrated
    let curMigrationJob = await MigrationService.getJob({
      sb,
      id: migrationJob.id,
    });
    let curSucceeded =
      curMigrationJob.step_details[MigrationJobStep.MigrateCustomers]
        ?.succeeded || 0;
    let curFailed =
      curMigrationJob.step_details[MigrationJobStep.MigrateCustomers]?.failed ||
      0;

    await MigrationService.updateJob({
      sb,
      migrationJobId: migrationJob.id,
      updates: {
        step_details: {
          ...curMigrationJob.step_details,
          [MigrationJobStep.MigrateCustomers]: {
            ...(curMigrationJob.step_details[
              MigrationJobStep.MigrateCustomers
            ] || {}),

            succeeded: curSucceeded + numPassed,

            failed: curFailed + numFailed,
          },
        },
      },
    });

    batchCount++;
  }

  // Get number of errors
  let migrationDetails: any = {};
  try {
    let errors = await MigrationService.getErrors({
      sb,
      migrationJobId: migrationJob.id,
    });

    migrationDetails.num_errors = errors!.length;
    migrationDetails.failed_customers = errors!.map(
      (e: any) => `${e.customer.id} - ${e.customer.name}`
    );
  } catch (error) {
    migrationDetails.failed_to_get_errors = true;
    migrationDetails.error = error;
    logger.error("Failed to get migration errors");
    logger.error(error);
  }

  let curMigrationJob = await MigrationService.getJob({
    sb,
    id: migrationJob.id,
  });

  await MigrationService.updateJob({
    sb,
    migrationJobId: migrationJob.id,
    updates: {
      current_step: MigrationJobStep.Finished,
      step_details: {
        ...curMigrationJob.step_details,
        [MigrationJobStep.MigrateCustomers]: migrationDetails,
      },
    },
  });

  await sendMigrationEmail({
    sb,
    migrationJobId: migrationJob.id,
    org,
  });
};
