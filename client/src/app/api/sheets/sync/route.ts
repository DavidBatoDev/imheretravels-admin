import { NextRequest, NextResponse } from "next/server";
import { googleSheetsServerService } from "@/lib/google-sheets/google-sheets-server-service";
import Papa from "papaparse";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { allBookingSheetColumns } from "@/app/functions/columns";
import { bookingService } from "@/services/booking-service";
import { bookingVersionHistoryService } from "@/services/booking-version-history-service";
import { db } from "@/lib/firebase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spreadsheetId, sheetName } = body;

    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, message: "Spreadsheet ID is required" },
        { status: 400 },
      );
    }

    // Set config flag to skip Cloud Function triggers
    await setDoc(
      doc(db, "config", "import-sync"),
      {
        skipTriggers: true,
        operation: "sheets-sync",
        startedAt: Timestamp.now(),
      },
      { merge: true },
    );

    try {
      // Step 1: Download CSV content from Google Sheets
      const csvContent = await googleSheetsServerService.downloadCSVContent(
        spreadsheetId,
        sheetName || "Main Dashboard",
      );

      // Step 2: Parse CSV content
      const parseResult = Papa.parse(csvContent, {
        header: false,
        skipEmptyLines: true,
      });

      if (parseResult.errors && parseResult.errors.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Failed to parse CSV data",
            error: parseResult.errors[0].message,
          },
          { status: 400 },
        );
      }

      const rawData = parseResult.data as string[][];

      if (rawData.length < 4) {
        return NextResponse.json(
          {
            success: false,
            message: "CSV file must have at least 4 rows (header on row 3)",
          },
          { status: 400 },
        );
      }

      // Row 3 (index 2) contains headers - same as CSV import
      const headers = rawData[2];

      if (!headers || headers.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Header row (row 3) is empty",
          },
          { status: 400 },
        );
      }

      // Rows 4+ (index 3+) are data rows
      const dataRows = rawData.slice(3);

      // Filter out rows where column A is empty (same as CSV import)
      const validRows = dataRows.filter((row) => {
        const columnA = row[0];
        return columnA && columnA.toString().trim() !== "";
      });

      // Step 3: Get column definitions from code
      const allColumns = allBookingSheetColumns.map((col) => ({
        id: col.id,
        columnName: col.data.columnName,
        dataType: col.data.dataType,
      }));

      // Separate non-function and function columns (same as CSV import)
      const nonFunctionColumns = allColumns.filter(
        (col) => col.dataType !== "function",
      );
      const functionColumns = allColumns.filter(
        (col) => col.dataType === "function",
      );

      // Create column mapping for non-function columns
      const nonFunctionColumnMapping = new Map<
        number,
        { field: string; dataType: string }
      >();

      nonFunctionColumns.forEach((column) => {
        const headerIndex = headers.findIndex(
          (header) =>
            header &&
            header.toLowerCase().trim() ===
              column.columnName.toLowerCase().trim(),
        );

        if (headerIndex !== -1) {
          nonFunctionColumnMapping.set(headerIndex, {
            field: column.id,
            dataType: column.dataType,
          });
        }
      });

      // Create column mapping for function columns
      const functionColumnMapping = new Map<
        number,
        { field: string; dataType: string }
      >();

      functionColumns.forEach((column) => {
        const headerIndex = headers.findIndex(
          (header) =>
            header &&
            header.toLowerCase().trim() ===
              column.columnName.toLowerCase().trim(),
        );

        if (headerIndex !== -1) {
          functionColumnMapping.set(headerIndex, {
            field: column.id,
            dataType: column.dataType,
          });
        }
      });

      // Step 4: Map CSV data to booking documents (exact same logic as CSV import)
      const now = Timestamp.now();
      const documents: any[] = [];

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const rowNumber = i + 1; // Use sequential row numbers starting from 1

        const document: any = {
          row: rowNumber,
          createdAt: now,
          updatedAt: now,
        };

        // Map non-function columns first
        nonFunctionColumnMapping.forEach((mapping, csvIndex) => {
          const cellValue = row[csvIndex];
          const convertedValue = convertValue(cellValue, mapping.dataType);
          document[mapping.field] = convertedValue;
        });

        // Map function columns after non-function columns
        functionColumnMapping.forEach((mapping, csvIndex) => {
          const cellValue = row[csvIndex];
          let convertedValue;

          if (mapping.dataType === "function") {
            // For function columns, check if it looks like a currency value
            if (cellValue && cellValue.toString().trim() !== "") {
              const stringValue = cellValue.toString().trim();
              const hasCurrencySymbol = /[$£¥₹₽¢₱₦₩₪₨₡₵₫﷼]/.test(stringValue);

              if (hasCurrencySymbol) {
                convertedValue = parseCurrencyValue(stringValue);
              } else {
                // Store as string for function columns
                convertedValue = stringValue;
              }
            } else {
              convertedValue = null;
            }
          } else {
            convertedValue = convertValue(cellValue, mapping.dataType);
          }
          document[mapping.field] = convertedValue;
        });

        documents.push(document);
      }

      // Step 5: Delete all existing bookings and track IDs for version history
      const existingBookings = await bookingService.getAllBookings();
      const existingBookingIds = existingBookings.map((booking) => booking.id);

      await bookingService.deleteAllBookings();

      // Step 6: Create new bookings in batches (exact same as CSV import)
      const BATCH_SIZE = 400;
      try {
        for (let i = 0; i < documents.length; i += BATCH_SIZE) {
          const slice = documents.slice(i, i + BATCH_SIZE);
          await Promise.all(
            slice.map(async (document, index) => {
              // Create booking with Firebase auto-generated ID (empty object to get UID)
              const newId = await bookingService.createBooking({});

              // Ensure we have a valid ID
              if (!newId) {
                throw new Error(
                  `Failed to generate ID for document at index ${i + index}`,
                );
              }

              // Create the complete document with the generated ID
              const documentWithId = {
                ...document,
                id: newId,
              };

              // Update the document with all the data including the id field
              await bookingService.updateBooking(newId, documentWithId);
            }),
          );
        }

        console.log(`✅ [SHEETS SYNC] Created ${documents.length} bookings`);
      } catch (batchError) {
        console.error(
          "❌ [SHEETS SYNC] Failed to create bookings:",
          batchError,
        );
        throw batchError;
      }

      // Step 7: Create bulk operation version snapshot (same as CSV import)
      try {
        // Use system user for server-side operations
        const currentUserId = "system";
        const currentUserName = "System (Sheets Sync)";

        const newBookings = await bookingService.getAllBookings();
        const newBookingIds = newBookings.map((booking) => booking.id);

        await bookingVersionHistoryService.createBulkOperationSnapshot({
          operationType: "import",
          operationDescription: `Google Sheets Sync: Replaced ${existingBookingIds.length} existing bookings with ${documents.length} new bookings`,
          affectedBookingIds: [...existingBookingIds, ...newBookingIds],
          userId: currentUserId,
          userName: currentUserName,
          totalCount: existingBookingIds.length + documents.length,
          successCount: documents.length,
          failureCount: 0,
        });

        console.log("✅ [SHEETS SYNC] Created bulk operation snapshot");
      } catch (versionError) {
        console.error(
          "❌ [SHEETS SYNC] Failed to create version snapshot:",
          versionError,
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: `Successfully synced ${documents.length} bookings from Google Sheets`,
          data: {
            totalRows: dataRows.length,
            validRows: documents.length,
          },
        },
        { status: 200 },
      );
    } catch (importError) {
      throw importError;
    }
  } catch (error) {
    console.error("Error in sync API route:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to sync from Google Sheets",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  } finally {
    // Clear config flag to re-enable triggers
    try {
      await setDoc(
        doc(db, "config", "import-sync"),
        {
          skipTriggers: false,
          operation: null,
          completedAt: Timestamp.now(),
        },
        { merge: true },
      );
    } catch (flagError) {
      console.error("[SHEETS SYNC] Failed to clear skip flag:", flagError);
    }
  }
}

// Helper function to convert values based on data type (copied from CSV import)
function convertValue(value: any, dataType: string): any {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const stringValue = value.toString().trim();

  switch (dataType) {
    case "string":
    case "email":
    case "select":
      return stringValue;

    case "number":
      // If the value contains any non-digit characters (except decimal points),
      // keep it as a string to preserve formatting
      if (
        stringValue !== parseFloat(stringValue).toString() ||
        stringValue.includes(",")
      ) {
        return stringValue;
      }
      const numValue = parseFloat(stringValue);
      return isNaN(numValue) ? null : numValue;

    case "currency":
      return parseCurrencyValue(stringValue);

    case "boolean":
      const lowerValue = stringValue.toLowerCase();
      if (lowerValue === "true" || lowerValue === "1" || lowerValue === "yes") {
        return true;
      } else if (
        lowerValue === "false" ||
        lowerValue === "0" ||
        lowerValue === "no"
      ) {
        return false;
      }
      return null;

    case "date":
      try {
        const date = new Date(stringValue);
        return isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
      } catch {
        return null;
      }

    default:
      return stringValue;
  }
}

// Helper function to parse currency values (copied from CSV import)
function parseCurrencyValue(value: string): number | null {
  if (!value || value.trim() === "") {
    return null;
  }

  const trimmedValue = value.toString().trim();
  let isNegative = false;
  let workingValue = trimmedValue;

  // Handle negative values in parentheses
  if (workingValue.startsWith("(") && workingValue.endsWith(")")) {
    isNegative = true;
    workingValue = workingValue.substring(1, workingValue.length - 1).trim();
  }

  // Currency symbols to strip
  const currencySymbols = [
    "$",
    "£",
    "¥",
    "₹",
    "₽",
    "¢",
    "₱",
    "₦",
    "₩",
    "₪",
    "₨",
    "₡",
    "₵",
    "₫",
    "﷼",
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "CAD",
    "AUD",
    "CNY",
    "INR",
    "PHP",
    "SGD",
    "HKD",
    "THB",
    "MYR",
    "KRW",
    "TWD",
    "VND",
  ];

  let cleanValue = workingValue;

  // Strip currency symbols from beginning
  for (const symbol of currencySymbols) {
    if (cleanValue.toLowerCase().startsWith(symbol.toLowerCase())) {
      cleanValue = cleanValue.substring(symbol.length).trim();
      break;
    }
  }

  // Strip currency symbols from end
  for (const symbol of currencySymbols) {
    if (cleanValue.toLowerCase().endsWith(symbol.toLowerCase())) {
      cleanValue = cleanValue
        .substring(0, cleanValue.length - symbol.length)
        .trim();
      break;
    }
  }

  // Remove thousand separators but keep decimal points
  cleanValue = cleanValue.replace(/[,\s]/g, "");

  // Handle minus signs
  if (cleanValue.startsWith("-") || cleanValue.endsWith("-")) {
    isNegative = true;
    cleanValue = cleanValue.replace(/-/g, "");
  }

  // Remove any remaining non-numeric characters except decimal point
  cleanValue = cleanValue.replace(/[^\d.]/g, "");

  // Ensure only one decimal point
  const decimalParts = cleanValue.split(".");
  if (decimalParts.length > 2) {
    cleanValue = decimalParts[0] + "." + decimalParts[decimalParts.length - 1];
  }

  // Parse the cleaned value
  const numValue = parseFloat(cleanValue);

  if (isNaN(numValue)) {
    return null;
  }

  return isNegative ? -numValue : numValue;
}
