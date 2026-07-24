#!/usr/bin/env node

// Load environment variables first
import dotenv from "dotenv";
import path from "path";

// Load .env.local file
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Environment variables loaded via dotenv

import {
  runMigration as runMigration002,
  rollbackMigration as rollbackMigration002,
} from "./002-additional-tour-packages";
import {
  runMigration as runMigration003,
  rollbackMigration as rollbackMigration003,
} from "./003-final-tour-packages";
import {
  runMigration as runMigration004,
  rollbackMigration as rollbackMigration004,
} from "./004-payment-plans";
import {
  runMigration as runMigration005,
  rollbackMigration as rollbackMigration005,
} from "./005-currency-usd-to-eur";
import {
  runMigration as runMigration006,
  rollbackMigration as rollbackMigration006,
} from "./006-conditional-email-templates";
import {
  runMigration008,
  rollbackMigration008,
} from "./008-cancellation-email-template";
import {
  runMigration as runMigration009,
  rollbackMigration as rollbackMigration009,
} from "./009-initial-payment-reminder-template";
import {
  runMigration as runMigration010,
  rollbackMigration as rollbackMigration010,
} from "./010-scheduled-reminder-email-template";
import {
  runMigration as runMigration012,
  rollbackMigration as rollbackMigration012,
} from "./012-default-booking-sheet-columns";
import {
  runMigration as runMigration013,
  rollbackMigration as rollbackMigration013,
} from "./013-sample-booking-with-all-columns";
import {
  runMigration as runMigration014,
  rollbackMigration as rollbackMigration014,
} from "./014-update-column-interface";
import {
  runMigration as runMigration015,
  rollbackMigration as rollbackMigration015,
} from "./015-remove-column-behavior-fields";
import {
  runMigration as runMigration016,
  rollbackMigration as rollbackMigration016,
} from "./016-remove-column-required-field";
import {
  runMigration as runMigration017,
  rollbackMigration as rollbackMigration017,
} from "./017-update-payment-columns";
import {
  runMigration as runMigration018,
  rollbackMigration as rollbackMigration018,
  dryRun as dryRun018,
} from "./018-update-booking-field-names";
import {
  runMigration as runMigration019,
  rollbackMigration as rollbackMigration019,
  dryRun as dryRun019,
} from "./019-update-column-ids";
import {
  runMigration as runMigration020,
  rollbackMigration as rollbackMigration020,
  dryRun as dryRun020,
} from "./020-rebuild-columns-with-custom-ids";
import {
  runMigration as runMigration023,
  rollbackMigration as rollbackMigration023,
} from "./023-add-parent-tab-field";
import {
  runMigration024,
  rollbackMigration024,
} from "./024-update-parent-tabs";
import {
  runMigration025,
  rollbackMigration025,
} from "./025-remove-emoji-from-parent-tabs";
import {
  runMigration026,
  rollbackMigration026,
} from "./026-move-payment-progress-to-payment-setting";
import {
  runMigration as runMigration027,
  rollbackMigration as rollbackMigration027,
} from "./027-import-booking-sheet-columns";
import {
  runMigration as runMigration028,
  rollbackMigration as rollbackMigration028,
} from "./028-import-ts-folders";
import {
  runMigration as runMigration029,
  rollbackMigration as rollbackMigration029,
} from "./029-import-ts-files";
import {
  runMigration as runMigration030,
  rollbackMigration as rollbackMigration030,
} from "./030-import-payment-terms";
import {
  runMigration as runMigration031,
  rollbackMigration as rollbackMigration031,
} from "./031-import-tour-packages";
import {
  runMigration as runMigration032,
  rollbackMigration as rollbackMigration032,
} from "./032-import-email-templates";
import {
  runMigration as runMigration033,
  rollbackMigration as rollbackMigration033,
} from "./033-convert-duration-to-string";
import {
  runMigration as runMigration040,
  rollbackMigration as rollbackMigration040,
} from "./040-booking-confirmation-email-template";
import {
  runMigration as runMigration041,
  rollbackMigration as rollbackMigration041,
} from "./041-pre-departure-config";
import {
  runMigration as runMigration042,
  rollbackMigration as rollbackMigration042,
} from "./042-revolut-payment-status-email-templates";
import {
  runMigration as runMigration043,
  rollbackMigration as rollbackMigration043,
} from "./043-update-revolut-payment-status-term-label";
import {
  runMigration as runMigration044,
  rollbackMigration as rollbackMigration044,
} from "./044-late-fees-config";
import {
  runMigration as runMigration045,
  rollbackMigration as rollbackMigration045,
} from "./045-late-fee-notice-email-template";
import {
  runMigration as runMigration046,
  rollbackMigration as rollbackMigration046,
} from "./046-update-japan-adventure";
import {
  runMigration as runMigration047,
  rollbackMigration as rollbackMigration047,
} from "./047-update-japan-adventure-skiing";
import {
  runMigration as runMigration048,
  rollbackMigration as rollbackMigration048,
} from "./048-enrich-tour-presentation";
import {
  runMigration as runMigration049,
  rollbackMigration as rollbackMigration049,
} from "./049-backfill-gallery-and-tags";
import {
  runMigration as runMigration050,
  rollbackMigration as rollbackMigration050,
} from "./050-backfill-destinations";
import {
  runMigration as runMigration051,
  rollbackMigration as rollbackMigration051,
} from "./051-backfill-keyfacts";
import {
  runMigration as runMigration052,
  rollbackMigration as rollbackMigration052,
} from "./052-backfill-inclusions";
import {
  runMigration as runMigration053,
  rollbackMigration as rollbackMigration053,
} from "./053-backfill-itinerary-details";
import {
  runMigration as runMigration054,
  rollbackMigration as rollbackMigration054,
} from "./054-backfill-card-header-title";
import {
  runMigration as runMigration055,
  rollbackMigration as rollbackMigration055,
} from "./055-backfill-card-sub-header";
import {
  runMigration as runMigration056,
  rollbackMigration as rollbackMigration056,
} from "./056-backfill-things-to-know-and-tips";
import {
  runMigration as runMigration057,
  rollbackMigration as rollbackMigration057,
} from "./057-prepend-domain-to-things-to-know-hrefs";
import {
  runMigration as runMigration058,
  rollbackMigration as rollbackMigration058,
} from "./058-remove-legacy-location-route";
import {
  runMigration as runMigration059,
  rollbackMigration as rollbackMigration059,
} from "./059-restore-keyfacts";
import {
  runMigration as runMigration060,
  rollbackMigration as rollbackMigration060,
} from "./060-seed-resident-hosts";
import {
  runMigration as runMigration061,
  rollbackMigration as rollbackMigration061,
} from "./061-flag-hosted-tours";
import {
  runMigration as runMigration062,
  rollbackMigration as rollbackMigration062,
} from "./062-roxana-sunset-from-normal";
import {
  runMigration as runMigration063,
  rollbackMigration as rollbackMigration063,
} from "./063-backfill-reservation-booking-link";
import {
  runMigration as runMigration064,
  rollbackMigration as rollbackMigration064,
} from "./064-maldives-itinerary-from-www";
import {
  runMigration as runMigration065,
  rollbackMigration as rollbackMigration065,
} from "./065-tanzania-itinerary-from-www";
import {
  runMigration as runMigration066,
  rollbackMigration as rollbackMigration066,
} from "./066-vietnam-itinerary-from-www";
import {
  runMigration as runMigration069,
  rollbackMigration as rollbackMigration069,
} from "./069-unify-group-ids";
import {
  runMigration as runMigration070,
  rollbackMigration as rollbackMigration070,
} from "./070-reservation-confirmed-template";
import {
  runMigration as runMigration071,
  rollbackMigration as rollbackMigration071,
} from "./071-pay-link-to-booking-status";
import {
  runMigration as runMigration072,
  rollbackMigration as rollbackMigration072,
} from "./072-final-payment-deadline-section";
import migration034 from "./034-initialize-columns-metadata";

// ============================================================================
// MIGRATION RUNNER
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const dryRun = args.includes("--dry-run") || args.includes("-d");

  console.log("🚀 ImHere Travels - Database Migration Runner");
  console.log("=============================================");

  switch (command) {
    case "run":

    case "002":
      console.log("📊 Running migration: 002-additional-tour-packages");
      const result002 = await runMigration002(dryRun);
      console.log(`\n🎯 ${result002.message}`);
      if (result002.details) {
        console.log(
          `📊 Details: ${result002.details.created} created, ${result002.details.skipped} skipped, ${result002.details.errors} errors`,
        );
        if (
          result002.details.errorDetails &&
          result002.details.errorDetails.length > 0
        ) {
          console.log("\n❌ Errors:");
          result002.details.errorDetails.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "043":
      console.log(
        "📊 Running migration: 043-update-revolut-payment-status-term-label",
      );
      const result043 = await runMigration043(dryRun);
      console.log(`\n🎯 ${result043.message}`);
      if (result043.details) {
        console.log(
          `📊 Details: ${result043.details.updated} updated, ${result043.details.skipped} skipped, ${result043.details.errors.length} errors`,
        );
        if (result043.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result043.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "044":
      console.log("📊 Running migration: 044-late-fees-config");
      await runMigration044();
      break;

    case "045":
      console.log("📊 Running migration: 045-late-fee-notice-email-template");
      const result045 = await runMigration045(dryRun);
      console.log(`\n🎯 ${result045.message}`);
      if (result045.details) {
        console.log(
          `📊 Details: ${result045.details.created} created, ${result045.details.skipped} skipped, ${result045.details.errors.length} errors`,
        );
        if (result045.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result045.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "046":
      console.log("📊 Running migration: 046-update-japan-adventure");
      const result046 = await runMigration046(dryRun);
      console.log(`\n🎯 ${result046.message}`);
      break;

    case "047":
      console.log("📊 Running migration: 047-update-japan-adventure-skiing");
      const result047 = await runMigration047(dryRun);
      console.log(`\n🎯 ${result047.message}`);
      break;

    case "048":
      console.log("📊 Running migration: 048-enrich-tour-presentation");
      const result048 = await runMigration048(dryRun);
      console.log(`\n🎯 ${result048.message}`);
      break;

    case "049":
      console.log("📊 Running migration: 049-backfill-gallery-and-tags");
      const result049 = await runMigration049(dryRun);
      console.log(`\n🎯 ${result049.message}`);
      break;

    case "003":
      console.log("📊 Running migration: 003-final-tour-packages");
      const result003 = await runMigration003(dryRun);
      console.log(`\n🎯 ${result003.message}`);
      if (result003.details) {
        console.log(
          `📊 Details: ${result003.details.created} created, ${result003.details.skipped} skipped, ${result003.details.errors} errors`,
        );
        if (
          result003.details.errorDetails &&
          result003.details.errorDetails.length > 0
        ) {
          console.log("\n❌ Errors:");
          result003.details.errorDetails.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "004":
      console.log("📊 Running migration: 004-payment-plans");
      const result004 = await runMigration004(dryRun);
      console.log(`\n🎯 ${result004.message}`);
      if (result004.details) {
        console.log(
          `📊 Details: ${result004.details.created} created, ${result004.details.skipped} skipped, ${result004.details.errors.length} errors`,
        );
        if (result004.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result004.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "005":
      console.log("📊 Running migration: 005-currency-usd-to-eur");
      const result005 = await runMigration005(dryRun);
      console.log(`\n🎯 ${result005.message}`);
      if (result005.details) {
        console.log(
          `📊 Details: ${result005.details.updated} updated, ${result005.details.skipped} skipped, ${result005.details.errors.length} errors`,
        );
        if (result005.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result005.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "006":
      console.log("📊 Running migration: 006-conditional-email-templates");
      const result006 = await runMigration006(dryRun);
      console.log(`\n🎯 ${result006.message}`);
      if (result006.details) {
        console.log(
          `📊 Details: ${result006.details.created} created, ${result006.details.skipped} skipped, ${result006.details.errors.length} errors`,
        );
        if (result006.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result006.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "008":
      console.log("📊 Running migration: 008-cancellation-email-template");
      const result008 = await runMigration008(dryRun);
      console.log(`\n🎯 ${result008.message}`);
      if (result008.details) {
        console.log(
          `�� Details: ${result008.details.created} created, ${result008.details.skipped} skipped, ${result008.details.errors.length} errors`,
        );
        if (result008.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result008.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "009":
      console.log(
        "📊 Running migration: 009-initial-payment-reminder-template",
      );
      const result009 = await runMigration009(dryRun);
      console.log(`\n🎯 ${result009.message}`);
      if (result009.details) {
        console.log(
          `📊 Details: ${result009.details.created} created, ${result009.details.skipped} skipped, ${result009.details.errors.length} errors`,
        );
        if (result009.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result009.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "010":
      console.log(
        "📊 Running migration: 010-scheduled-reminder-email-template",
      );
      const result010 = await runMigration010(dryRun);
      console.log(`\n🎯 ${result010.message}`);
      if (result010.details) {
        console.log(
          `📊 Details: ${result010.details.created} created, ${result010.details.skipped} skipped, ${result010.details.errors.length} errors`,
        );
        if (result010.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result010.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "012":
      console.log("📊 Running migration: 012-default-booking-sheet-columns");
      const result012 = await runMigration012(dryRun);
      console.log(`\n🎯 ${result012.message}`);
      if (result012.details) {
        console.log(
          `📊 Details: ${result012.details.created} created, ${result012.details.skipped} skipped, ${result012.details.errors.length} errors`,
        );
        if (result012.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result012.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "013":
      console.log("📊 Running migration: 013-sample-booking-with-all-columns");
      const result013 = await runMigration013(dryRun);
      console.log(`\n🎯 ${result013.message}`);
      if (result013.details) {
        console.log(
          `📊 Details: ${
            result013.details.columnsFound
          } columns found, booking ${
            result013.details.bookingCreated ? "created" : "not created"
          }, ${result013.details.errors.length} errors`,
        );
        if (result013.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result013.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "014":
      console.log("📊 Running migration: 014-update-column-interface");
      const result014 = await runMigration014(dryRun);
      console.log(`\n🎯 ${result014.message}`);
      if (result014.details) {
        console.log(
          `📊 Details: ${result014.details.updatedCount} updated, ${result014.details.skippedCount} skipped, ${result014.details.errorCount} errors`,
        );
        if (result014.details.errorCount > 0) {
          console.log("\n❌ Errors:");
          result014.details.migrationResults
            .filter((r: any) => r.status === "error")
            .forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
        }
      }
      break;

    case "015":
      console.log("📊 Running migration: 015-remove-column-behavior-fields");
      const result015 = await runMigration015(dryRun);
      console.log(`\n🎯 ${result015.message}`);
      if (result015.details) {
        console.log(
          `📊 Details: ${result015.details.updatedCount} updated, ${result015.details.skippedCount} skipped, ${result015.details.errorCount} errors`,
        );
        if (result015.details.errorCount > 0) {
          console.log("\n❌ Errors:");
          result015.details.migrationResults
            .filter((r: any) => r.status === "error")
            .forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
        }
      }
      break;

    case "016":
      console.log("📊 Running migration: 016-remove-column-required-field");
      const result016 = await runMigration016(dryRun);
      console.log(`\n🎯 ${result016.message}`);
      if (result016.details) {
        console.log(
          `📊 Details: ${result016.details.updatedCount} updated, ${result016.details.skippedCount} skipped, ${result016.details.errorCount} errors`,
        );
        if (result016.details.errorCount > 0) {
          console.log("\n❌ Errors:");
          result016.details.migrationResults
            .filter((r: any) => r.status === "error")
            .forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
        }
      }
      break;

    case "017":
      console.log("📊 Running migration: 017-update-payment-columns");
      const result017 = await runMigration017(dryRun);
      console.log(`\n🎯 ${result017.message}`);
      if (result017.details) {
        console.log(
          `📊 Details: ${result017.details.deletedCount} deleted, ${result017.details.addedCount} added, ${result017.details.updatedCount} updated, ${result017.details.errorCount} errors`,
        );
        if (result017.details.errorCount > 0) {
          console.log("\n❌ Errors:");
          result017.details.migrationResults
            .filter((r: any) => r.status === "error")
            .forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
        }
      }
      break;

    case "018":
      console.log("📊 Running migration: 018-update-booking-field-names");
      if (dryRun) {
        await dryRun018();
      } else {
        await runMigration018();
      }
      break;

    case "019":
      console.log("📊 Running migration: 019-update-column-ids");
      if (dryRun) {
        await dryRun019();
      } else {
        await runMigration019();
      }
      break;

    case "020":
      console.log("📊 Running migration: 020-rebuild-columns-with-custom-ids");
      if (dryRun) {
        await dryRun020();
      } else {
        await runMigration020();
      }
      break;

    case "027":
      console.log("📊 Running migration: 027-import-booking-sheet-columns");
      const result027 = await runMigration027(dryRun);
      console.log(`\n🎯 ${result027.message}`);
      if (result027.details) {
        console.log(
          `📊 Details: ${result027.details.created} created, ${result027.details.skipped} skipped, ${result027.details.errors} errors`,
        );
        console.log(`📄 File: ${result027.details.fileUsed}`);
      }
      break;

    case "028":
      console.log("📊 Running migration: 028-import-ts-folders");
      const result028 = await runMigration028(dryRun);
      console.log(`\n🎯 ${result028.message}`);
      break;

    case "029":
      console.log("📊 Running migration: 029-import-ts-files");
      const result029 = await runMigration029(dryRun);
      console.log(`\n🎯 ${result029.message}`);
      break;

    case "030":
      console.log("📊 Running migration: 030-import-payment-terms");
      const result030 = await runMigration030(dryRun);
      console.log(`\n🎯 ${result030.message}`);
      break;

    case "031":
      console.log("📊 Running migration: 031-import-tour-packages");
      const result031 = await runMigration031(dryRun);
      console.log(`\n🎯 ${result031.message}`);
      break;

    case "032":
      console.log("📊 Running migration: 032-import-email-templates");
      const result032 = await runMigration032(dryRun);
      console.log(`\n🎯 ${result032.message}`);
      break;

    case "033":
      console.log("📊 Running migration: 033-convert-duration-to-string");
      const result033 = await runMigration033(dryRun);
      console.log(`\n🎯 ${result033.message}`);
      if (result033.details) {
        console.log(
          `📊 Details: ${result033.details.updated} updated, ${result033.details.skipped} skipped, ${result033.details.errors.length} errors`,
        );
        if (result033.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result033.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "040":
      console.log(
        "📊 Running migration: 040-booking-confirmation-email-template",
      );
      await runMigration040();
      break;

    case "041":
      console.log("📊 Running migration: 041-pre-departure-config");
      await runMigration041();
      break;

    case "042":
      console.log(
        "📊 Running migration: 042-revolut-payment-status-email-templates",
      );
      const result042 = await runMigration042(dryRun);
      console.log(`\n🎯 ${result042.message}`);
      if (result042.details) {
        console.log(
          `📊 Details: ${result042.details.created} created, ${result042.details.skipped} skipped, ${result042.details.errors.length} errors`,
        );
        if (result042.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result042.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "034":
      console.log("📊 Running migration: 034-initialize-columns-metadata");
      const result034 = await migration034.run();
      console.log(`\n🎯 ${result034.message}`);
      if (result034.details) {
        console.log(
          `📊 Details: ${result034.details.usersUpdated} users updated, ${result034.details.errors.length} errors`,
        );
        if (result034.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          result034.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "023":
      console.log("📊 Running migration: 023-add-parent-tab-field");
      const result023 = await runMigration023(dryRun);
      console.log(`\n🎯 ${result023.message}`);
      if (result023.details) {
        console.log(
          `📊 Details: ${result023.details.updatedCount} updated, ${result023.details.skippedCount} skipped, ${result023.details.errorCount} errors`,
        );
        if (result023.details.migrationResults) {
          const errors = result023.details.migrationResults.filter(
            (r: any) => r.status === "error",
          );
          if (errors.length > 0) {
            console.log("\n❌ Errors:");
            errors.forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
          }
        }
      }
      break;

    case "024":
      console.log("📊 Running migration: 024-update-parent-tabs");
      await runMigration024();
      break;

    case "025":
      console.log("📊 Running migration: 025-remove-emoji-from-parent-tabs");
      await runMigration025();
      break;

    case "026":
      console.log(
        "📊 Running migration: 026-move-payment-progress-to-payment-setting",
      );
      await runMigration026();
      break;

    case "rollback":
    case "rollback002":
      console.log("🔄 Rolling back migration: 002-additional-tour-packages");
      const rollbackResult002 = await rollbackMigration002();
      console.log(`\n🎯 ${rollbackResult002.message}`);
      if (rollbackResult002.details) {
        console.log(
          `📊 Details: ${rollbackResult002.details.deleted} deleted, ${rollbackResult002.details.errors} errors`,
        );
        if (
          rollbackResult002.details.errorDetails &&
          rollbackResult002.details.errorDetails.length > 0
        ) {
          console.log("\n❌ Errors:");
          rollbackResult002.details.errorDetails.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback043":
      console.log(
        "🔄 Rolling back migration: 043-update-revolut-payment-status-term-label",
      );
      const rollbackResult043 = await rollbackMigration043();
      console.log(`\n🎯 ${rollbackResult043.message}`);
      break;

    case "rollback044":
      console.log("🔄 Rolling back migration: 044-late-fees-config");
      await rollbackMigration044();
      break;

    case "rollback046":
      console.log("🔄 Rolling back migration: 046-update-japan-adventure");
      await rollbackMigration046();
      break;

    case "rollback047":
      console.log("🔄 Rolling back migration: 047-update-japan-adventure-skiing");
      await rollbackMigration047();
      break;

    case "rollback045":
      console.log(
        "🔄 Rolling back migration: 045-late-fee-notice-email-template",
      );
      const rollbackResult045 = await rollbackMigration045();
      console.log(`\n🎯 ${rollbackResult045.message}`);
      break;

    case "rollback003":
      console.log("🔄 Rolling back migration: 003-final-tour-packages");
      const rollbackResult003 = await rollbackMigration003();
      console.log(`\n🎯 ${rollbackResult003.message}`);
      if (rollbackResult003.details) {
        console.log(
          `📊 Details: ${rollbackResult003.details.deleted} deleted, ${rollbackResult003.details.errors} errors`,
        );
        if (
          rollbackResult003.details.errorDetails &&
          rollbackResult003.details.errorDetails.length > 0
        ) {
          console.log("\n❌ Errors:");
          rollbackResult003.details.errorDetails.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback004":
      console.log("🔄 Rolling back migration: 004-payment-plans");
      const rollbackResult004 = await rollbackMigration004();
      console.log(`\n🎯 ${rollbackResult004.message}`);
      if (rollbackResult004.details) {
        console.log(
          `📊 Details: ${rollbackResult004.details.deleted} deleted, ${rollbackResult004.details.errors.length} errors`,
        );
        if (rollbackResult004.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult004.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback005":
      console.log("🔄 Rolling back migration: 005-currency-usd-to-eur");
      const rollbackResult005 = await rollbackMigration005();
      console.log(`\n🎯 ${rollbackResult005.message}`);
      if (rollbackResult005.details) {
        console.log(
          `📊 Details: ${rollbackResult005.details.reverted} reverted, ${rollbackResult005.details.errors.length} errors`,
        );
        if (rollbackResult005.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult005.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback006":
      console.log("🔄 Rolling back migration: 006-conditional-email-templates");
      const rollbackResult006 = await rollbackMigration006();
      console.log(`\n🎯 ${rollbackResult006.message}`);
      if (rollbackResult006.details) {
        console.log(
          `📊 Details: ${rollbackResult006.details.deleted} deleted, ${rollbackResult006.details.errors.length} errors`,
        );
        if (rollbackResult006.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult006.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback008":
      console.log("🔄 Rolling back migration: 008-cancellation-email-template");
      const rollbackResult008 = await rollbackMigration008();
      console.log(`\n🎯 ${rollbackResult008.message}`);
      if (rollbackResult008.details) {
        console.log(
          `📊 Details: ${rollbackResult008.details.created} created, ${rollbackResult008.details.skipped} skipped, ${rollbackResult008.details.errors.length} errors`,
        );
        if (rollbackResult008.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult008.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback009":
      console.log(
        "🔄 Rolling back migration: 009-initial-payment-reminder-template",
      );
      const rollbackResult009 = await rollbackMigration009();
      console.log(`\n🎯 ${rollbackResult009.message}`);
      if (rollbackResult009.details) {
        console.log(
          `📊 Details: ${rollbackResult009.details.deleted} deleted, ${rollbackResult009.details.errors.length} errors`,
        );
        if (rollbackResult009.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult009.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback010":
      console.log(
        "🔄 Rolling back migration: 010-scheduled-reminder-email-template",
      );
      const rollbackResult010 = await rollbackMigration010();
      console.log(`\n🎯 ${rollbackResult010.message}`);
      if (rollbackResult010.details) {
        console.log(
          `📊 Details: ${rollbackResult010.details.deleted} deleted, ${rollbackResult010.details.errors.length} errors`,
        );
        if (rollbackResult010.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult010.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback012":
      console.log(
        "🔄 Rolling back migration: 012-default-booking-sheet-columns",
      );
      const rollbackResult012 = await rollbackMigration012();
      console.log(`\n🎯 ${rollbackResult012.message}`);
      if (rollbackResult012.details) {
        console.log(
          `📊 Details: ${rollbackResult012.details.deleted} deleted, ${rollbackResult012.details.errors.length} errors`,
        );
        if (rollbackResult012.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult012.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback013":
      console.log(
        "🔄 Rolling back migration: 013-sample-booking-with-all-columns",
      );
      const rollbackResult013 = await rollbackMigration013();
      console.log(`\n🎯 ${rollbackResult013.message}`);
      if (rollbackResult013.details) {
        console.log(
          `📊 Details: ${rollbackResult013.details.deleted} deleted, ${rollbackResult013.details.errors.length} errors`,
        );
        if (rollbackResult013.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult013.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback014":
      console.log("🔄 Rolling back migration: 014-update-column-interface");
      const rollbackResult014 = await rollbackMigration014();
      console.log(`\n🎯 ${rollbackResult014.message}`);
      if (rollbackResult014.details) {
        console.log(
          `📊 Details: ${rollbackResult014.details.rollbackCount} rolled back, ${rollbackResult014.details.errorCount} errors`,
        );
        if (rollbackResult014.details.errorCount > 0) {
          console.log("\n❌ Errors:");
          rollbackResult014.details.rollbackResults
            .filter((r: any) => r.status === "error")
            .forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
        }
      }
      break;

    case "rollback015":
      console.log(
        "🔄 Rolling back migration: 015-remove-column-behavior-fields",
      );
      const rollbackResult015 = await rollbackMigration015();
      console.log(`\n🎯 ${rollbackResult015.message}`);
      if (rollbackResult015.details) {
        console.log(
          `📊 Details: ${rollbackResult015.details.rollbackCount} rolled back, ${rollbackResult015.details.errorCount} errors`,
        );
        if (rollbackResult015.details.errorCount > 0) {
          console.log("\n❌ Errors:");
          rollbackResult015.details.rollbackResults
            .filter((r: any) => r.status === "error")
            .forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
        }
      }
      break;

    case "rollback016":
      console.log(
        "🔄 Rolling back migration: 016-remove-column-required-field",
      );
      const rollbackResult016 = await rollbackMigration016();
      console.log(`\n🎯 ${rollbackResult016.message}`);
      if (rollbackResult016.details) {
        console.log(
          `📊 Details: ${rollbackResult016.details.rollbackCount} rolled back, ${rollbackResult016.details.errorCount} errors`,
        );
        if (rollbackResult016.details.errorCount > 0) {
          console.log("\n❌ Errors:");
          rollbackResult016.details.rollbackResults
            .filter((r: any) => r.status === "error")
            .forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
        }
      }
      break;

    case "rollback017":
      console.log("🔄 Rolling back migration: 017-update-payment-columns");
      const rollbackResult017 = await rollbackMigration017();
      console.log(`\n🎯 ${rollbackResult017.message}`);
      if (rollbackResult017.details) {
        console.log(
          `📊 Details: ${rollbackResult017.details.rollbackCount} rolled back, ${rollbackResult017.details.errorCount} errors`,
        );
        if (rollbackResult017.details.errorCount > 0) {
          console.log("\n❌ Errors:");
          rollbackResult017.details.rollbackResults
            .filter((r: any) => r.status === "error")
            .forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
        }
      }
      break;

    case "rollback018":
      console.log("🔄 Rolling back migration: 018-update-booking-field-names");
      await rollbackMigration018();
      break;

    case "rollback019":
      console.log("🔄 Rolling back migration: 019-update-column-ids");
      await rollbackMigration019();
      break;

    case "rollback020":
      console.log(
        "🔄 Rolling back migration: 020-rebuild-columns-with-custom-ids",
      );
      await rollbackMigration020();
      break;

    case "rollback033":
      console.log("🔄 Rolling back migration: 033-convert-duration-to-string");
      const rollbackResult033 = await rollbackMigration033();
      console.log(`\n🎯 ${rollbackResult033.message}`);
      if (rollbackResult033.details) {
        console.log(
          `📊 Details: ${rollbackResult033.details.reverted} reverted, ${rollbackResult033.details.errors.length} errors`,
        );
        if (rollbackResult033.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult033.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback040":
      console.log(
        "🔄 Rolling back migration: 040-booking-confirmation-email-template",
      );
      await rollbackMigration040();
      break;

    case "rollback041":
      console.log("🔄 Rolling back migration: 041-pre-departure-config");
      await rollbackMigration041();
      break;

    case "rollback042":
      console.log(
        "🔄 Rolling back migration: 042-revolut-payment-status-email-templates",
      );
      const rollbackResult042 = await rollbackMigration042();
      console.log(`\n🎯 ${rollbackResult042.message}`);
      if (rollbackResult042.details) {
        console.log(
          `📊 Details: ${rollbackResult042.details.deleted} deleted, ${rollbackResult042.details.errors.length} errors`,
        );
        if (rollbackResult042.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult042.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback034":
      console.log("🔄 Rolling back migration: 034-initialize-columns-metadata");
      const rollbackResult034 = await migration034.rollback();
      console.log(`\n🎯 ${rollbackResult034.message}`);
      if (rollbackResult034.details) {
        console.log(
          `📊 Details: ${rollbackResult034.details.usersRolledBack} users rolled back, ${rollbackResult034.details.errors.length} errors`,
        );
        if (rollbackResult034.details.errors.length > 0) {
          console.log("\n❌ Errors:");
          rollbackResult034.details.errors.forEach((error) =>
            console.log(`  - ${error}`),
          );
        }
      }
      break;

    case "rollback023":
      console.log("🔄 Rolling back migration: 023-add-parent-tab-field");
      const rollbackResult023 = await rollbackMigration023();
      console.log(`\n🎯 ${rollbackResult023.message}`);
      if (rollbackResult023.details) {
        console.log(
          `📊 Details: ${rollbackResult023.details.rollbackCount} rolled back, ${rollbackResult023.details.errorCount} errors`,
        );
        if (rollbackResult023.details.rollbackResults) {
          const errors = rollbackResult023.details.rollbackResults.filter(
            (r: any) => r.status === "error",
          );
          if (errors.length > 0) {
            console.log("\n❌ Errors:");
            errors.forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
          }
        }
      }
      break;

    case "rollback024":
      console.log("🔄 Rolling back migration: 024-update-parent-tabs");
      await rollbackMigration024();
      break;

    case "rollback025":
      console.log(
        "🔄 Rolling back migration: 025-remove-emoji-from-parent-tabs",
      );
      await rollbackMigration025();
      break;

    case "rollback026":
      console.log(
        "🔄 Rolling back migration: 026-move-payment-progress-to-payment-setting",
      );
      await rollbackMigration026();
      break;

    case "dry-run":
    case "dry-run002":
      console.log(
        "🔍 Running migration in DRY RUN mode: 002-additional-tour-packages",
      );
      const dryRunResult002 = await runMigration002(true);
      console.log(`\n🎯 ${dryRunResult002.message}`);
      if (dryRunResult002.details) {
        console.log(
          `📊 Details: ${dryRunResult002.details.created} would be created, ${dryRunResult002.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run003":
      console.log(
        "🔍 Running migration in DRY RUN mode: 003-final-tour-packages",
      );
      const dryRunResult003 = await runMigration003(true);
      console.log(`\n🎯 ${dryRunResult003.message}`);
      if (dryRunResult003.details) {
        console.log(
          `📊 Details: ${dryRunResult003.details.created} would be created, ${dryRunResult003.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run043":
      console.log(
        "🔍 Running migration in DRY RUN mode: 043-update-revolut-payment-status-term-label",
      );
      const dryRunResult043 = await runMigration043(true);
      console.log(`\n🎯 ${dryRunResult043.message}`);
      if (dryRunResult043.details) {
        console.log(
          `📊 Details: ${dryRunResult043.details.updated} would be updated, ${dryRunResult043.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run004":
      console.log("🔍 Running migration in DRY RUN mode: 004-payment-plans");
      const dryRunResult004 = await runMigration004(true);
      console.log(`\n🎯 ${dryRunResult004.message}`);
      if (dryRunResult004.details) {
        console.log(
          `📊 Details: ${dryRunResult004.details.created} would be created, ${dryRunResult004.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run005":
      console.log(
        "🔍 Running migration in DRY RUN mode: 005-currency-usd-to-eur",
      );
      const dryRunResult005 = await runMigration005(true);
      console.log(`\n🎯 ${dryRunResult005.message}`);
      if (dryRunResult005.details) {
        console.log(
          `📊 Details: ${dryRunResult005.details.updated} would be updated, ${dryRunResult005.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run006":
      console.log(
        "🔍 Running migration in DRY RUN mode: 006-conditional-email-templates",
      );
      const dryRunResult006 = await runMigration006(true);
      console.log(`\n🎯 ${dryRunResult006.message}`);
      if (dryRunResult006.details) {
        console.log(
          `📊 Details: ${dryRunResult006.details.created} would be created, ${dryRunResult006.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run008":
      console.log(
        "🔍 Running migration in DRY RUN mode: 008-cancellation-email-template",
      );
      const dryRunResult008 = await runMigration008(true);
      console.log(`\n🎯 ${dryRunResult008.message}`);
      if (dryRunResult008.details) {
        console.log(
          `📊 Details: ${dryRunResult008.details.created} would be created, ${dryRunResult008.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run009":
      console.log(
        "🔍 Running migration in DRY RUN mode: 009-initial-payment-reminder-template",
      );
      const dryRunResult009 = await runMigration009(true);
      console.log(`\n🎯 ${dryRunResult009.message}`);
      if (dryRunResult009.details) {
        console.log(
          `📊 Details: ${dryRunResult009.details.created} would be created, ${dryRunResult009.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run010":
      console.log(
        "🔍 Running migration in DRY RUN mode: 010-scheduled-reminder-email-template",
      );
      const dryRunResult010 = await runMigration010(true);
      console.log(`\n🎯 ${dryRunResult010.message}`);
      if (dryRunResult010.details) {
        console.log(
          `📊 Details: ${dryRunResult010.details.created} would be created, ${dryRunResult010.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run012":
      console.log(
        "🔍 Running migration in DRY RUN mode: 012-default-booking-sheet-columns",
      );
      const dryRunResult012 = await runMigration012(true);
      console.log(`\n🎯 ${dryRunResult012.message}`);
      if (dryRunResult012.details) {
        console.log(
          `📊 Details: ${dryRunResult012.details.created} would be created, ${dryRunResult012.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run013":
      console.log(
        "🔍 Running migration in DRY RUN mode: 013-sample-booking-with-all-columns",
      );
      const dryRunResult013 = await runMigration013(true);
      console.log(`\n🎯 ${dryRunResult013.message}`);
      if (dryRunResult013.details) {
        console.log(
          `📊 Details: ${dryRunResult013.details.columnsFound} columns found, would create sample booking`,
        );
      }
      break;

    case "dry-run014":
      console.log(
        "🔍 Running migration in DRY RUN mode: 014-update-column-interface",
      );
      const dryRunResult014 = await runMigration014(true);
      console.log(`\n🎯 ${dryRunResult014.message}`);
      if (dryRunResult014.details) {
        console.log(
          `📊 Details: ${dryRunResult014.details.updatedCount} would be updated, ${dryRunResult014.details.skippedCount} would be skipped`,
        );
      }
      break;

    case "dry-run015":
      console.log(
        "🔍 Running migration in DRY RUN mode: 015-remove-column-behavior-fields",
      );
      const dryRunResult015 = await runMigration015(true);
      console.log(`\n🎯 ${dryRunResult015.message}`);
      if (dryRunResult015.details) {
        console.log(
          `📊 Details: ${dryRunResult015.details.updatedCount} would be updated, ${dryRunResult015.details.skippedCount} would be skipped`,
        );
      }
      break;

    case "dry-run016":
      console.log(
        "🔍 Running migration in DRY RUN mode: 016-remove-column-required-field",
      );
      const dryRunResult016 = await runMigration016(true);
      console.log(`\n🎯 ${dryRunResult016.message}`);
      if (dryRunResult016.details) {
        console.log(
          `📊 Details: ${dryRunResult016.details.updatedCount} would be updated, ${dryRunResult016.details.skippedCount} would be skipped`,
        );
      }
      break;

    case "dry-run017":
      console.log(
        "🔍 Running migration in DRY RUN mode: 017-update-payment-columns",
      );
      const dryRunResult017 = await runMigration017(true);
      console.log(`\n🎯 ${dryRunResult017.message}`);
      if (dryRunResult017.details) {
        console.log(
          `📊 Details: ${dryRunResult017.details.deletedCount} would be deleted, ${dryRunResult017.details.addedCount} would be added, ${dryRunResult017.details.updatedCount} would be updated`,
        );
      }
      break;

    case "dry-run018":
      console.log(
        "🔍 Running migration in DRY RUN mode: 018-update-booking-field-names",
      );
      await dryRun018();
      break;

    case "dry-run019":
      console.log(
        "🔍 Running migration in DRY RUN mode: 019-update-column-ids",
      );
      await dryRun019();
      break;

    case "dry-run033":
      console.log(
        "🔍 Running migration in DRY RUN mode: 033-convert-duration-to-string",
      );
      const dryRunResult033 = await runMigration033(true);
      console.log(`\n🎯 ${dryRunResult033.message}`);
      if (dryRunResult033.details) {
        console.log(
          `📊 Details: ${dryRunResult033.details.updated} would be updated, ${dryRunResult033.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run020":
      console.log(
        "🔍 Running migration in DRY RUN mode: 020-rebuild-columns-with-custom-ids",
      );
      await dryRun020();
      break;

    case "dry-run023":
      console.log(
        "🔍 Running migration in DRY RUN mode: 023-add-parent-tab-field",
      );
      const dryRunResult023 = await runMigration023(true);
      console.log(`\n🎯 ${dryRunResult023.message}`);
      if (dryRunResult023.details) {
        console.log(
          `📊 Details: ${dryRunResult023.details.updatedCount} would be updated, ${dryRunResult023.details.skippedCount} skipped, ${dryRunResult023.details.errorCount} errors`,
        );
        if (dryRunResult023.details.migrationResults) {
          const errors = dryRunResult023.details.migrationResults.filter(
            (r: any) => r.status === "error",
          );
          if (errors.length > 0) {
            console.log("\n❌ Errors:");
            errors.forEach((error: any) =>
              console.log(`  - ${error.id}: ${error.error}`),
            );
          }
        }
      }
      break;

    case "dry-run042":
      console.log(
        "🔍 Running migration in DRY RUN mode: 042-revolut-payment-status-email-templates",
      );
      const dryRunResult042 = await runMigration042(true);
      console.log(`\n🎯 ${dryRunResult042.message}`);
      if (dryRunResult042.details) {
        console.log(
          `📊 Details: ${dryRunResult042.details.created} would be created, ${dryRunResult042.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run045":
      console.log(
        "🔍 Running migration in DRY RUN mode: 045-late-fee-notice-email-template",
      );
      const dryRunResult045 = await runMigration045(true);
      console.log(`\n🎯 ${dryRunResult045.message}`);
      if (dryRunResult045.details) {
        console.log(
          `📊 Details: ${dryRunResult045.details.created} would be created, ${dryRunResult045.details.skipped} would be skipped`,
        );
      }
      break;

    case "dry-run046":
      console.log(
        "🔍 Running migration in DRY RUN mode: 046-update-japan-adventure",
      );
      const dryRunResult046 = await runMigration046(true);
      console.log(`\n🎯 ${dryRunResult046.message}`);
      break;

    case "dry-run047":
      console.log(
        "🔍 Running migration in DRY RUN mode: 047-update-japan-adventure-skiing",
      );
      const dryRunResult047 = await runMigration047(true);
      console.log(`\n🎯 ${dryRunResult047.message}`);
      break;

    case "dry-run048":
      console.log(
        "🔍 Running migration in DRY RUN mode: 048-enrich-tour-presentation",
      );
      const dryRunResult048 = await runMigration048(true);
      console.log(`\n🎯 ${dryRunResult048.message}`);
      break;

    case "dry-run049":
      console.log(
        "🔍 Running migration in DRY RUN mode: 049-backfill-gallery-and-tags",
      );
      const dryRunResult049 = await runMigration049(true);
      console.log(`\n🎯 ${dryRunResult049.message}`);
      break;

    case "rollback048":
      console.log("↩️ Rolling back migration: 048-enrich-tour-presentation");
      await rollbackMigration048();
      break;

    case "rollback049":
      console.log("↩️ Rolling back migration: 049-backfill-gallery-and-tags");
      await rollbackMigration049();
      break;

    case "050":
      console.log("📊 Running migration: 050-backfill-destinations");
      const result050 = await runMigration050(dryRun);
      console.log(`\n🎯 ${result050.message}`);
      if (result050.details) {
        console.log(
          `📊 Details: ${result050.details.updated} updated, ${result050.details.skipped} skipped, ${result050.details.notMapped} not in map, ${result050.details.errors} errors`,
        );
      }
      break;

    case "dry-run050":
      console.log("🔍 Running migration in DRY RUN mode: 050-backfill-destinations");
      const dryRunResult050 = await runMigration050(true);
      console.log(`\n🎯 ${dryRunResult050.message}`);
      if (dryRunResult050.details) {
        console.log(
          `📊 Details: ${dryRunResult050.details.updated} would be updated, ${dryRunResult050.details.notMapped} not in map`,
        );
      }
      break;

    case "rollback050":
      console.log("↩️ Rolling back migration: 050-backfill-destinations");
      const rollbackResult050 = await rollbackMigration050();
      console.log(`\n🎯 ${rollbackResult050.message}`);
      if (rollbackResult050.details) {
        console.log(
          `📊 Details: ${rollbackResult050.details.removed} removed, ${rollbackResult050.details.errors} errors`,
        );
      }
      break;

    case "051":
      console.log("📊 Running migration: 051-backfill-keyfacts");
      const result051 = await runMigration051(dryRun);
      console.log(`\n🎯 ${result051.message}`);
      if (result051.details) {
        console.log(
          `📊 Details: ${result051.details.updated} updated, ${result051.details.notMapped} not in map, ${result051.details.errors} errors`,
        );
      }
      break;

    case "dry-run051":
      console.log("🔍 Running migration in DRY RUN mode: 051-backfill-keyfacts");
      const dryRunResult051 = await runMigration051(true);
      console.log(`\n🎯 ${dryRunResult051.message}`);
      if (dryRunResult051.details) {
        console.log(
          `📊 Details: ${dryRunResult051.details.updated} would be updated, ${dryRunResult051.details.notMapped} not in map`,
        );
      }
      break;

    case "rollback051":
      console.log("↩️ Rolling back migration: 051-backfill-keyfacts");
      const rollbackResult051 = await rollbackMigration051();
      console.log(`\n🎯 ${rollbackResult051.message}`);
      if (rollbackResult051.details) {
        console.log(
          `📊 Details: ${rollbackResult051.details.removed} removed, ${rollbackResult051.details.errors} errors`,
        );
      }
      break;

    case "052":
      console.log("📊 Running migration: 052-backfill-inclusions");
      const result052 = await runMigration052(dryRun);
      console.log(`\n🎯 ${result052.message}`);
      if (result052.details) {
        console.log(
          `📊 Details: ${result052.details.updated} updated, ${result052.details.notMapped} not in map, ${result052.details.errors} errors`,
        );
      }
      break;

    case "dry-run052":
      console.log("🔍 Running migration in DRY RUN mode: 052-backfill-inclusions");
      const dryRunResult052 = await runMigration052(true);
      console.log(`\n🎯 ${dryRunResult052.message}`);
      if (dryRunResult052.details) {
        console.log(
          `📊 Details: ${dryRunResult052.details.updated} would be updated, ${dryRunResult052.details.notMapped} not in map`,
        );
      }
      break;

    case "rollback052":
      console.log("↩️ Rolling back migration: 052-backfill-inclusions");
      const rollbackResult052 = await rollbackMigration052();
      console.log(`\n🎯 ${rollbackResult052.message}`);
      if (rollbackResult052.details) {
        console.log(
          `📊 Details: ${rollbackResult052.details.removed} removed, ${rollbackResult052.details.errors} errors`,
        );
      }
      break;

    case "053":
      console.log("📊 Running migration: 053-backfill-itinerary-details");
      const result053 = await runMigration053(dryRun);
      console.log(`\n🎯 ${result053.message}`);
      if (result053.details) {
        console.log(
          `📊 Details: ${result053.details.updated} updated, ${result053.details.skipped} skipped, ${result053.details.errors} errors`,
        );
      }
      break;

    case "dry-run053":
      console.log("🔍 Running migration in DRY RUN mode: 053-backfill-itinerary-details");
      const dryRunResult053 = await runMigration053(true);
      console.log(`\n🎯 ${dryRunResult053.message}`);
      if (dryRunResult053.details) {
        console.log(
          `📊 Details: ${dryRunResult053.details.updated} would be updated, ${dryRunResult053.details.skipped} skipped`,
        );
      }
      break;

    case "rollback053":
      console.log("↩️ Rolling back migration: 053-backfill-itinerary-details");
      const rollbackResult053 = await rollbackMigration053();
      console.log(`\n🎯 ${rollbackResult053.message}`);
      if (rollbackResult053.details) {
        console.log(
          `📊 Details: ${rollbackResult053.details.removed} rolled back, ${rollbackResult053.details.errors} errors`,
        );
      }
      break;

    case "054":
      console.log("📊 Running migration: 054-backfill-card-header-title");
      const result054 = await runMigration054(dryRun);
      console.log(`\n🎯 ${result054.message}`);
      if (result054.details) {
        console.log(
          `📊 Details: ${result054.details.updated} updated, ${result054.details.skipped} skipped, ${result054.details.errors} errors`,
        );
      }
      break;

    case "dry-run054":
      console.log("🔍 Running migration in DRY RUN mode: 054-backfill-card-header-title");
      const dryRunResult054 = await runMigration054(true);
      console.log(`\n🎯 ${dryRunResult054.message}`);
      if (dryRunResult054.details) {
        console.log(
          `📊 Details: ${dryRunResult054.details.updated} would be updated, ${dryRunResult054.details.skipped} skipped`,
        );
      }
      break;

    case "rollback054":
      console.log("↩️ Rolling back migration: 054-backfill-card-header-title");
      const rollbackResult054 = await rollbackMigration054();
      console.log(`\n🎯 ${rollbackResult054.message}`);
      if (rollbackResult054.details) {
        console.log(
          `📊 Details: ${rollbackResult054.details.removed} removed, ${rollbackResult054.details.errors} errors`,
        );
      }
      break;

    case "055":
      console.log("📊 Running migration: 055-backfill-card-sub-header");
      const result055 = await runMigration055(dryRun);
      console.log(`\n🎯 ${result055.message}`);
      if (result055.details) {
        console.log(
          `📊 Details: ${result055.details.updated} updated, ${result055.details.skipped} skipped, ${result055.details.errors} errors`,
        );
      }
      break;

    case "dry-run055":
      console.log("🔍 Running migration in DRY RUN mode: 055-backfill-card-sub-header");
      const dryRunResult055 = await runMigration055(true);
      console.log(`\n🎯 ${dryRunResult055.message}`);
      if (dryRunResult055.details) {
        console.log(
          `📊 Details: ${dryRunResult055.details.updated} would be updated, ${dryRunResult055.details.skipped} skipped`,
        );
      }
      break;

    case "rollback055":
      console.log("↩️ Rolling back migration: 055-backfill-card-sub-header");
      const rollbackResult055 = await rollbackMigration055();
      console.log(`\n🎯 ${rollbackResult055.message}`);
      if (rollbackResult055.details) {
        console.log(
          `📊 Details: ${rollbackResult055.details.removed} removed, ${rollbackResult055.details.errors} errors`,
        );
      }
      break;

    case "056":
      console.log("📊 Running migration: 056-backfill-things-to-know-and-tips");
      const result056 = await runMigration056(dryRun);
      console.log(`\n🎯 ${result056.message}`);
      if (result056.details) {
        console.log(
          `📊 Details: ${result056.details.updated} updated, ${result056.details.skipped} skipped, ${result056.details.errors} errors`,
        );
      }
      break;

    case "dry-run056":
      console.log("🔍 Running migration in DRY RUN mode: 056-backfill-things-to-know-and-tips");
      const dryRunResult056 = await runMigration056(true);
      console.log(`\n🎯 ${dryRunResult056.message}`);
      if (dryRunResult056.details) {
        console.log(
          `📊 Details: ${dryRunResult056.details.updated} would be updated, ${dryRunResult056.details.skipped} skipped`,
        );
      }
      break;

    case "rollback056":
      console.log("↩️ Rolling back migration: 056-backfill-things-to-know-and-tips");
      const rollbackResult056 = await rollbackMigration056();
      console.log(`\n🎯 ${rollbackResult056.message}`);
      if (rollbackResult056.details) {
        console.log(
          `📊 Details: ${rollbackResult056.details.removed} removed, ${rollbackResult056.details.errors} errors`,
        );
      }
      break;

    case "057":
      console.log("📊 Running migration: 057-prepend-domain-to-things-to-know-hrefs");
      const result057 = await runMigration057(dryRun);
      console.log(`\n🎯 ${result057.message}`);
      if (result057.details) {
        console.log(
          `📊 Details: ${result057.details.updated} updated, ${result057.details.skipped} skipped, ${result057.details.errors} errors`,
        );
      }
      break;

    case "dry-run057":
      console.log("🔍 Running migration in DRY RUN mode: 057-prepend-domain-to-things-to-know-hrefs");
      const dryRunResult057 = await runMigration057(true);
      console.log(`\n🎯 ${dryRunResult057.message}`);
      if (dryRunResult057.details) {
        console.log(
          `📊 Details: ${dryRunResult057.details.updated} would be updated, ${dryRunResult057.details.skipped} skipped`,
        );
      }
      break;

    case "rollback057":
      console.log("↩️ Rolling back migration: 057-prepend-domain-to-things-to-know-hrefs");
      const rollbackResult057 = await rollbackMigration057();
      console.log(`\n🎯 ${rollbackResult057.message}`);
      if (rollbackResult057.details) {
        console.log(
          `📊 Details: ${rollbackResult057.details.removed} removed, ${rollbackResult057.details.errors} errors`,
        );
      }
      break;

    case "058":
      console.log("📊 Running migration: 058-remove-legacy-location-route");
      const result058 = await runMigration058(dryRun);
      console.log(`\n🎯 ${result058.message}`);
      if (result058.details) {
        console.log(
          `📊 Details: ${result058.details.updated} updated, ${result058.details.skipped} skipped, ${result058.details.errors} errors`,
        );
      }
      break;

    case "dry-run058":
      console.log("🔍 Running migration in DRY RUN mode: 058-remove-legacy-location-route");
      const dryRunResult058 = await runMigration058(true);
      console.log(`\n🎯 ${dryRunResult058.message}`);
      if (dryRunResult058.details) {
        console.log(
          `📊 Details: ${dryRunResult058.details.updated} would be updated, ${dryRunResult058.details.skipped} skipped`,
        );
      }
      break;

    case "rollback058":
      console.log("↩️ Rolling back migration: 058-remove-legacy-location-route");
      const rollbackResult058 = await rollbackMigration058();
      console.log(`\n🎯 ${rollbackResult058.message}`);
      if (rollbackResult058.details) {
        console.log(
          `📊 Details: ${rollbackResult058.details.removed} removed, ${rollbackResult058.details.errors} errors`,
        );
      }
      break;

    case "059":
      console.log("📊 Running migration: 059-restore-keyfacts");
      const result059 = await runMigration059(dryRun);
      console.log(`\n🎯 ${result059.message}`);
      if (result059.details) {
        console.log(
          `📊 Details: ${result059.details.updated} updated, ${result059.details.notMapped} not mapped, ${result059.details.errors} errors`,
        );
      }
      break;

    case "dry-run059":
      console.log("🔍 Running migration in DRY RUN mode: 059-restore-keyfacts");
      const dryRunResult059 = await runMigration059(true);
      console.log(`\n🎯 ${dryRunResult059.message}`);
      if (dryRunResult059.details) {
        console.log(
          `📊 Details: ${dryRunResult059.details.updated} would be updated, ${dryRunResult059.details.notMapped} not mapped`,
        );
      }
      break;

    case "rollback059":
      console.log("↩️ Rolling back migration: 059-restore-keyfacts");
      const rollbackResult059 = await rollbackMigration059();
      console.log(`\n🎯 ${rollbackResult059.message}`);
      if (rollbackResult059.details) {
        console.log(
          `📊 Details: ${rollbackResult059.details.removed} removed, ${rollbackResult059.details.errors} errors`,
        );
      }
      break;

    case "060":
      console.log("📊 Running migration: 060-seed-resident-hosts");
      const result060 = await runMigration060(dryRun);
      console.log(`\n🎯 ${result060.message}`);
      if (result060.details) {
        console.log(
          `📊 Details: ${result060.details.created} created, ${result060.details.skipped} skipped, ${result060.details.errors} errors`,
        );
      }
      break;

    case "dry-run060":
      console.log("🔍 Running migration in DRY RUN mode: 060-seed-resident-hosts");
      const dryRunResult060 = await runMigration060(true);
      console.log(`\n🎯 ${dryRunResult060.message}`);
      if (dryRunResult060.details) {
        console.log(
          `📊 Details: ${dryRunResult060.details.created} would be created, ${dryRunResult060.details.errors} errors`,
        );
      }
      break;

    case "rollback060":
      console.log("↩️ Rolling back migration: 060-seed-resident-hosts");
      const rollbackResult060 = await rollbackMigration060();
      console.log(`\n🎯 ${rollbackResult060.message}`);
      if (rollbackResult060.details) {
        console.log(
          `📊 Details: ${rollbackResult060.details.deleted} deleted, ${rollbackResult060.details.errors} errors`,
        );
      }
      break;

    case "061":
      console.log("📊 Running migration: 061-flag-hosted-tours");
      const result061 = await runMigration061(dryRun);
      console.log(`\n🎯 ${result061.message}`);
      if (result061.details) {
        console.log(
          `📊 Details: ${result061.details.updated} updated, ${result061.details.notFound} not found, ${result061.details.errors} errors`,
        );
      }
      break;

    case "dry-run061":
      console.log("🔍 Running migration in DRY RUN mode: 061-flag-hosted-tours");
      const dryRunResult061 = await runMigration061(true);
      console.log(`\n🎯 ${dryRunResult061.message}`);
      if (dryRunResult061.details) {
        console.log(
          `📊 Details: ${dryRunResult061.details.updated} would be updated, ${dryRunResult061.details.notFound} not found`,
        );
      }
      break;

    case "rollback061":
      console.log("↩️ Rolling back migration: 061-flag-hosted-tours");
      const rollbackResult061 = await rollbackMigration061();
      console.log(`\n🎯 ${rollbackResult061.message}`);
      if (rollbackResult061.details) {
        console.log(
          `📊 Details: ${rollbackResult061.details.removed} removed, ${rollbackResult061.details.errors} errors`,
        );
      }
      break;

    case "062":
      console.log("📊 Running migration: 062-roxana-sunset-from-normal");
      const result062 = await runMigration062(dryRun);
      console.log(`\n🎯 ${result062.message}`);
      if (result062.details) {
        console.log(
          `📊 Details: ${result062.details.copied} copied, ${result062.details.errors} errors`,
        );
      }
      break;

    case "dry-run062":
      console.log("🔍 Running migration in DRY RUN mode: 062-roxana-sunset-from-normal");
      const dryRunResult062 = await runMigration062(true);
      console.log(`\n🎯 ${dryRunResult062.message}`);
      if (dryRunResult062.details) {
        console.log(`📊 Details: ${dryRunResult062.details.copied} would be copied`);
      }
      break;

    case "rollback062":
      console.log("↩️ Rolling back migration: 062-roxana-sunset-from-normal");
      const rollbackResult062 = await rollbackMigration062();
      console.log(`\n🎯 ${rollbackResult062.message}`);
      if (rollbackResult062.details) {
        console.log(
          `📊 Details: ${rollbackResult062.details.restored} restored, ${rollbackResult062.details.errors} errors`,
        );
      }
      break;

    case "063":
      console.log("📊 Running migration: 063-backfill-reservation-booking-link");
      const result063 = await runMigration063(dryRun);
      console.log(`\n🎯 ${result063.message}`);
      if (result063.details) {
        console.log(
          `📊 Details: ${result063.details.updated} updated, ${result063.details.skippedHasLink} already had a link, ${result063.details.skippedNoSlug} no slug, ${result063.details.errors} errors`,
        );
      }
      break;

    case "dry-run063":
      console.log("🔍 Running migration in DRY RUN mode: 063-backfill-reservation-booking-link");
      const dryRunResult063 = await runMigration063(true);
      console.log(`\n🎯 ${dryRunResult063.message}`);
      if (dryRunResult063.details) {
        console.log(
          `📊 Details: ${dryRunResult063.details.updated} would be updated, ${dryRunResult063.details.skippedHasLink} already had a link, ${dryRunResult063.details.skippedNoSlug} no slug`,
        );
      }
      break;

    case "rollback063":
      console.log("↩️ Rolling back migration: 063-backfill-reservation-booking-link");
      const rollbackResult063 = await rollbackMigration063();
      console.log(`\n🎯 ${rollbackResult063.message}`);
      if (rollbackResult063.details) {
        console.log(
          `📊 Details: ${rollbackResult063.details.restored} restored, ${rollbackResult063.details.errors} errors`,
        );
      }
      break;

    case "064":
      console.log("📊 Running migration: 064-maldives-itinerary-from-www");
      const result064 = await runMigration064(dryRun);
      console.log(`\n🎯 ${result064.message}`);
      if (result064.details) {
        console.log(
          `📊 Details: ${result064.details.updated} updated, ${result064.details.errors} errors`,
        );
      }
      break;

    case "dry-run064":
      console.log("🔍 Running migration in DRY RUN mode: 064-maldives-itinerary-from-www");
      const dryRunResult064 = await runMigration064(true);
      console.log(`\n🎯 ${dryRunResult064.message}`);
      if (dryRunResult064.details) {
        console.log(
          `📊 Details: ${dryRunResult064.details.prevDays} → ${dryRunResult064.details.newDays} days (1 tour)`,
        );
      }
      break;

    case "rollback064":
      console.log("↩️ Rolling back migration: 064-maldives-itinerary-from-www");
      const rollbackResult064 = await rollbackMigration064();
      console.log(`\n🎯 ${rollbackResult064.message}`);
      if (rollbackResult064.details) {
        console.log(
          `📊 Details: ${rollbackResult064.details.restored} restored, ${rollbackResult064.details.errors} errors`,
        );
      }
      break;

    case "065":
      console.log("📊 Running migration: 065-tanzania-itinerary-from-www");
      const result065 = await runMigration065(dryRun);
      console.log(`\n🎯 ${result065.message}`);
      if (result065.details) {
        console.log(
          `📊 Details: ${result065.details.updated} updated, ${result065.details.errors} errors`,
        );
      }
      break;

    case "dry-run065":
      console.log("🔍 Running migration in DRY RUN mode: 065-tanzania-itinerary-from-www");
      const dryRunResult065 = await runMigration065(true);
      console.log(`\n🎯 ${dryRunResult065.message}`);
      if (dryRunResult065.details) {
        console.log(
          `📊 Details: ${dryRunResult065.details.prevDays} → ${dryRunResult065.details.newDays} days (1 tour)`,
        );
      }
      break;

    case "rollback065":
      console.log("↩️ Rolling back migration: 065-tanzania-itinerary-from-www");
      const rollbackResult065 = await rollbackMigration065();
      console.log(`\n🎯 ${rollbackResult065.message}`);
      if (rollbackResult065.details) {
        console.log(
          `📊 Details: ${rollbackResult065.details.restored} restored, ${rollbackResult065.details.errors} errors`,
        );
      }
      break;

    case "066":
      console.log("📊 Running migration: 066-vietnam-itinerary-from-www");
      const result066 = await runMigration066(dryRun);
      console.log(`\n🎯 ${result066.message}`);
      if (result066.details) {
        console.log(
          `📊 Details: ${result066.details.updated} updated, ${result066.details.errors} errors`,
        );
      }
      break;

    case "dry-run066":
      console.log("🔍 Running migration in DRY RUN mode: 066-vietnam-itinerary-from-www");
      const dryRunResult066 = await runMigration066(true);
      console.log(`\n🎯 ${dryRunResult066.message}`);
      if (dryRunResult066.details) {
        console.log(
          `📊 Details: ${dryRunResult066.details.prevDays} → ${dryRunResult066.details.newDays} days (1 tour)`,
        );
      }
      break;

    case "rollback066":
      console.log("↩️ Rolling back migration: 066-vietnam-itinerary-from-www");
      const rollbackResult066 = await rollbackMigration066();
      console.log(`\n🎯 ${rollbackResult066.message}`);
      if (rollbackResult066.details) {
        console.log(
          `📊 Details: ${rollbackResult066.details.restored} restored, ${rollbackResult066.details.errors} errors`,
        );
      }
      break;

    case "069":
      console.log("📊 Running migration: 069-unify-group-ids");
      const result069 = await runMigration069(dryRun);
      console.log(`\n🎯 ${result069.message}`);
      if (result069.details) {
        console.log(
          `📊 Details: ${result069.details.partiesRepaired} parties repaired, ${result069.details.partiesAlreadyConsistent} already consistent, ${result069.details.updated} bookings updated, ${result069.details.generatorFieldsRemoved} generator fields removed, ${result069.details.unlinked} unlinked, ${result069.details.errors} errors`,
        );
      }
      break;

    case "dry-run069":
      console.log("🔍 Running migration in DRY RUN mode: 069-unify-group-ids");
      const dryRunResult069 = await runMigration069(true);
      console.log(`\n🎯 ${dryRunResult069.message}`);
      if (dryRunResult069.details) {
        console.log(
          `📊 Details: ${dryRunResult069.details.partiesRepaired} parties would be repaired, ${dryRunResult069.details.partiesAlreadyConsistent} already consistent, ${dryRunResult069.details.updated} bookings would be updated, ${dryRunResult069.details.unlinked} unlinked`,
        );
      }
      break;

    case "rollback069":
      console.log("↩️ Rolling back migration: 069-unify-group-ids");
      const rollbackResult069 = await rollbackMigration069();
      console.log(`\n🎯 ${rollbackResult069.message}`);
      if (rollbackResult069.details) {
        console.log(
          `📊 Details: ${rollbackResult069.details.restored} restored, ${rollbackResult069.details.errors} errors`,
        );
      }
      break;

    case "070":
      console.log("📊 Running migration: 070-reservation-confirmed-template");
      const result070 = await runMigration070(dryRun);
      console.log(`\n🎯 ${result070.message}`);
      if (result070.details) {
        console.log(
          `📊 Details: ${result070.details.updated} updated, ${result070.details.errors} errors`,
        );
      }
      break;

    case "dry-run070":
      console.log(
        "🔍 Running migration in DRY RUN mode: 070-reservation-confirmed-template",
      );
      const dryRunResult070 = await runMigration070(true);
      console.log(`\n🎯 ${dryRunResult070.message}`);
      if (dryRunResult070.details) {
        console.log(
          `📊 Details: ${dryRunResult070.details.updated} would be updated`,
        );
      }
      break;

    case "rollback070":
      console.log("↩️ Rolling back migration: 070-reservation-confirmed-template");
      const rollbackResult070 = await rollbackMigration070();
      console.log(`\n🎯 ${rollbackResult070.message}`);
      if (rollbackResult070.details) {
        console.log(
          `📊 Details: ${rollbackResult070.details.restored} restored, ${rollbackResult070.details.errors} errors`,
        );
      }
      break;

    case "071":
      console.log("📊 Running migration: 071-pay-link-to-booking-status");
      const result071 = await runMigration071(dryRun);
      console.log(`
🎯 ${result071.message}`);
      if (result071.details) {
        console.log(
          `📊 Details: ${result071.details.updated} templates updated, ${result071.details.totalLinks} links repointed, ${result071.details.skipped} untouched, ${result071.details.errors} errors`,
        );
      }
      break;

    case "dry-run071":
      console.log("🔍 Running migration in DRY RUN mode: 071-pay-link-to-booking-status");
      const dryRunResult071 = await runMigration071(true);
      console.log(`
🎯 ${dryRunResult071.message}`);
      if (dryRunResult071.details) {
        console.log(
          `📊 Details: ${dryRunResult071.details.updated} templates would be updated, ${dryRunResult071.details.totalLinks} links repointed`,
        );
      }
      break;

    case "rollback071":
      console.log("↩️ Rolling back migration: 071-pay-link-to-booking-status");
      const rollbackResult071 = await rollbackMigration071();
      console.log(`
🎯 ${rollbackResult071.message}`);
      if (rollbackResult071.details) {
        console.log(
          `📊 Details: ${rollbackResult071.details.restored} restored, ${rollbackResult071.details.errors} errors`,
        );
      }
      break;

    case "072":
      console.log("📊 Running migration: 072-final-payment-deadline-section");
      const result072 = await runMigration072(dryRun);
      console.log(`
🎯 ${result072.message}`);
      if (result072.details) {
        console.log(
          `📊 Details: ${result072.details.updated} updated, ${result072.details.errors} errors`,
        );
      }
      break;

    case "dry-run072":
      console.log("🔍 Running migration in DRY RUN mode: 072-final-payment-deadline-section");
      const dryRunResult072 = await runMigration072(true);
      console.log(`
🎯 ${dryRunResult072.message}`);
      if (dryRunResult072.details) {
        console.log(
          `📊 Details: ${dryRunResult072.details.updated} would be updated`,
        );
      }
      break;

    case "rollback072":
      console.log("↩️ Rolling back migration: 072-final-payment-deadline-section");
      const rollbackResult072 = await rollbackMigration072();
      console.log(`
🎯 ${rollbackResult072.message}`);
      if (rollbackResult072.details) {
        console.log(
          `📊 Details: ${rollbackResult072.details.restored} restored, ${rollbackResult072.details.errors} errors`,
        );
      }
      break;

    case "revalidate": {
      const url =
        process.env.WWW_REVALIDATE_URL ||
        "https://www.imheretravels.com/api/revalidate";
      const secret = process.env.REVALIDATE_SECRET;
      if (!secret) {
        console.error(
          "❌ REVALIDATE_SECRET not set in .env.local — cannot revalidate www.",
        );
        process.exit(1);
      }
      console.log(`🔄 Triggering www revalidation at ${url}`);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-revalidate-secret": secret,
          },
          body: JSON.stringify({ all: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          console.log("✅ www revalidation triggered:", data);
        } else {
          console.error(`❌ Revalidation failed (${res.status}):`, data);
          process.exit(1);
        }
      } catch (err) {
        console.error("❌ Failed to reach www revalidation endpoint:", err);
        process.exit(1);
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default:
      console.log("❌ Unknown command. Use 'help' to see available commands.");
      process.exit(1);
  }

  process.exit(0);
}

function showHelp() {
  console.log(`
📖 Available Commands:

  run, 001           Run the migration to create initial tour packages
  002                Run the migration to create additional tour packages
  003                Run the migration to create final tour packages
  004                Run the migration to create payment plans
  005                Run the migration to create currency conversion rates (USD to EUR)
  006                Run the migration to create conditional email templates
  008                Run the migration to create cancellation email templates
  009                Run the migration to create initial payment reminder template
  010                Run the migration to create scheduled reminder email template
  012                Run the migration to create default booking sheet columns
  013                Run the migration to create sample booking with all columns
  014                Run the migration to update column interface (name->columnName, type->dataType)
  015                Run the migration to remove column behavior fields (visible, editable, sortable, filterable)
  016                Run the migration to remove column required field
  017                Run the migration to update payment columns structure
  018                Run the migration to update booking field names from col-<n> to Firestore column IDs
  019                Run the migration to update column id fields to use actual Firestore document IDs
  020                Run the migration to rebuild columns with custom IDs based on column names
  042                Run the migration to create Revolut payment decision email templates
  043                Run the migration to update Revolut payment templates with approved term labels
  044                Run the migration to create late-fees config document
  045                Run the migration to create late-fee notice email template
  069                Unify Duo/Group booking Group IDs onto the main booker's code
  070                Upload the updated "Reservation Confirmed" email template
  071                Repoint "Pay securely online" buttons to the booking status page
  072                Add the Final Payment Deadline section to Reservation Confirmed
  rollback, undo     Rollback the migration 001 (delete created tours)
  rollback002        Rollback the migration 002 (delete created tours)
  rollback003        Rollback the migration 003 (delete created tours)
  rollback004        Rollback the migration 004 (delete created payment plans)
  rollback005        Rollback the migration 005 (delete currency conversion rates)
  rollback006        Rollback the migration 006 (delete conditional email templates)
  rollback008        Rollback the migration 008 (delete cancellation email template)
  rollback009        Rollback the migration 009 (delete initial payment reminder template)
  rollback010        Rollback the migration 010 (delete scheduled reminder email template)
  rollback012        Rollback the migration 012 (delete default booking sheet columns)
  rollback013        Rollback the migration 013 (delete sample booking)
  rollback014        Rollback the migration 014 (restore old column interface)
  rollback015        Rollback the migration 015 (restore column behavior fields)
  rollback016        Rollback the migration 016 (restore column required field)
  rollback017        Rollback the migration 017 (restore old payment columns structure)
  rollback018        Rollback the migration 018 (restore col-<n> field names)
  rollback019        Rollback the migration 019 (restore col-<n> id fields)
  rollback020        Rollback the migration 020 (delete columns with custom IDs)
  rollback042        Rollback the migration 042 (delete Revolut payment decision email templates)
  rollback043        Rollback the migration 043 (no-op informational rollback)
  rollback044        Rollback the migration 044 (delete late-fees config document)
  rollback045        Rollback the migration 045 (delete late-fee notice email template)
  dry-run, test     Test the migration 001 without making changes
  dry-run002        Test the migration 002 without making changes
  dry-run003        Test the migration 003 without making changes
  dry-run004        Test the migration 004 without making changes
  dry-run005        Test the migration 005 without making changes
  dry-run006        Test the migration 006 without making changes
  dry-run008        Test the migration 008 without making changes
  dry-run009        Test the migration 009 without making changes
  dry-run010        Test the migration 010 without making changes
  dry-run012        Test the migration 012 without making changes
  dry-run013        Test the migration 013 without making changes
  dry-run014        Test the migration 014 without making changes
  dry-run015        Test the migration 015 without making changes
  dry-run016        Test the migration 016 without making changes
  dry-run017        Test the migration 017 without making changes
  dry-run018        Test the migration 018 without making changes
  dry-run019        Test the migration 019 without making changes
  dry-run020        Test the migration 020 without making changes
  dry-run042        Test the migration 042 without making changes
  dry-run043        Test the migration 043 without making changes
  dry-run045        Test the migration 045 without making changes
  help               Show this help message

📝 Examples:

  tsx migrations/migrate.ts 001        # Run migration 001 (initial tours)
  tsx migrations/migrate.ts 002        # Run migration 002 (additional tours)
  tsx migrations/migrate.ts 003        # Run migration 003 (final tours)
  tsx migrations/migrate.ts 004        # Run migration 004 (payment plans)
  tsx migrations/migrate.ts 005        # Run migration 005 (currency conversion)
  tsx migrations/migrate.ts 006        # Run migration 006 (conditional email templates)
  tsx migrations/migrate.ts 008        # Run migration 008 (cancellation email templates)
  tsx migrations/migrate.ts 009        # Run migration 009 (initial payment reminder template)
  tsx migrations/migrate.ts 010        # Run migration 010 (scheduled reminder email template)
  tsx migrations/migrate.ts 012        # Run migration 012 (default booking sheet columns)
  tsx migrations/migrate.ts 013        # Run migration 013 (sample booking with all columns)
  tsx migrations/migrate.ts 014        # Run migration 014 (update column interface)
  tsx migrations/migrate.ts 015        # Run migration 015 (remove column behavior fields)
  tsx migrations/migrate.ts 016        # Run migration 016 (remove column required field)
  tsx migrations/migrate.ts dry-run    # Test migration 001 without changes
  tsx migrations/migrate.ts dry-run002 # Test migration 002 without changes
  tsx migrations/migrate.ts dry-run003 # Test migration 003 without changes
  tsx migrations/migrate.ts dry-run004 # Test migration 004 without changes
  tsx migrations/migrate.ts dry-run005 # Test migration 005 without changes
  tsx migrations/migrate.ts dry-run006 # Test migration 006 without changes
  tsx migrations/migrate.ts dry-run008 # Test migration 008 without changes
  tsx migrations/migrate.ts rollback   # Undo migration 001
  tsx migrations/migrate.ts rollback002 # Undo migration 002
  tsx migrations/migrate.ts rollback003 # Undo migration 003
  tsx migrations/migrate.ts rollback004 # Undo migration 004
  tsx migrations/migrate.ts rollback005 # Undo migration 005
  tsx migrations/migrate.ts rollback006 # Undo migration 006
  tsx migrations/migrate.ts rollback008 # Undo migration 008
  tsx migrations/migrate.ts rollback009 # Undo migration 009
  tsx migrations/migrate.ts rollback010 # Undo migration 010
  tsx migrations/migrate.ts rollback012 # Undo migration 012
  tsx migrations/migrate.ts rollback013 # Undo migration 013
  tsx migrations/migrate.ts rollback014 # Undo migration 014

🔧 Options:

  --dry-run, -d     Run in dry-run mode (no actual changes)

📊 What These Migrations Do:

  Migration 001 - Initial Tour Packages:
  - Siargao Island Adventure (SIA)
  - Philippine Sunrise (PHS) 
  - Philippine Sunset (PSS)
  - Maldives Bucketlist (MLB)

  Migration 002 - Additional Tour Packages:
  - Sri Lanka Wander Tour (SLW)
  - Argentina's Wonders (ARW)
  - Brazil's Treasures (BZT)
  - Vietnam Expedition (VNE)

  Migration 003 - Final Tour Packages:
  - India Discovery Tour (IDD)
  - India Holi Festival Tour (IHF)
  - Tanzania Exploration (TXP)
  - New Zealand Expedition (NZE)

  Migration 004 - Payment Plans:
  - Invalid Booking (0% deposit)
  - Full Payment Required Within 2 Days (0% deposit)
  - P1 - Single Installment (0% deposit, 100% in 1 payment)
  - P2 - Two Installments (0% deposit, 50% × 2 payments)
  - P3 - Three Installments (0% deposit, 33.33% × 3 payments)
  - P4 - Four Instalments (0% deposit, 25% × 4 payments)

  Migration 005 - Currency Conversion:
  - Converts all USD prices to EUR prices
  - Updates all currency fields in the database

  Migration 006 - Conditional Email Templates:
  - Adds reservation email template with conditional rendering
  - Supports different payment term scenarios (P1, P2, P3, P4, Invalid, etc.)
  - Dynamic content based on booking type and payment terms
  - Uses custom conditional syntax: <? if (condition) { ?> content <? } ?>

  Migration 008 - Cancellation Email Templates:
  - Adds a template for sending cancellation emails
  - Supports different booking statuses (Cancelled, Refunded, etc.)
  - Dynamic content based on booking details
  - Uses custom conditional syntax: <? if (condition) { ?> content <? } ?>

  Migration 009 - Initial Payment Reminder Template:
  - Adds a comprehensive payment reminder email template
  - Supports different payment methods (Stripe, Revolut, Ulster)
  - Dynamic payment tracker table with array-based data
  - Uses Google Apps Script-like syntax: <?= variable ?> and <? logic ?>
  - Includes calendar integration and payment tracking

  Migration 010 - Scheduled Reminder Email Template:
  - Adds a tour reminder email template for travelers before departure
  - Supports different booking types (Individual, Duo, Group)

  Migration 012 - Default Booking Sheet Columns:
  - Creates the initial set of 60+ columns for the booking sheet
  - Includes all core booking fields, traveler info, tour details, payment terms, etc.
  - Sets up the foundation for the hybrid column approach

  Migration 013 - Sample Booking with All Columns:
  - Creates a sample booking document with values for all defined columns
  - Demonstrates the hybrid column system in action
  - Provides test data for the sheet management interface

  Migration 014 - Update Column Interface:
  - Updates existing columns from old interface (name, type) to new interface
  - New fields: columnName, dataType, function, arguments, includeInForms
  - Automatically sets includeInForms=false for function columns
  - Enables integration with TypeScript functions from ts_files collection
  - Conditional rendering for group-specific information
  - Dynamic content based on booking details and special instructions
  - Professional layout with tour details table and important reminders

  Migration 012 - Default Booking Sheet Columns:
  - Populates the bookingSheetColumns collection with 60 default columns
  - Establishes the foundation for the hybrid booking system
  - Includes core booking fields, traveller information, tour details, pricing
  - Covers email management, payment terms, and cancellation handling
  - Sets up column metadata with types, validation, and behavior rules

  Each tour includes:
  - Complete itinerary with day-by-day activities
  - Multiple travel dates with capacity limits
  - Pricing and deposit information
  - Highlights and requirements
  - External links (Stripe, brochures)
`);
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// ============================================================================
// RUN THE MIGRATION
// ============================================================================

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });
}
