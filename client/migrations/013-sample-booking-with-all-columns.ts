import { db } from "./firebase-config";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  setDoc,
} from "firebase/firestore";

// ============================================================================
// MIGRATION CONFIGURATION
// ============================================================================

const MIGRATION_ID = "013-sample-booking-with-all-columns";
const BOOKINGS_COLLECTION = "bookings";
const COLUMNS_COLLECTION = "bookingSheetColumns";

// ============================================================================
// SAMPLE DATA GENERATORS
// ============================================================================

function generateSampleValue(columnType: string, options?: string[]): any {
  switch (columnType) {
    case "string":
      return "Sample String Value";
    case "number":
      return Math.floor(Math.random() * 1000) + 1;
    case "boolean":
      return Math.random() > 0.5;
    case "date":
      return new Date();
    case "select":
      return options && options.length > 0 ? options[0] : "Default Option";
    case "email":
      return "sample@example.com";
    case "currency":
      return Math.floor(Math.random() * 10000) + 100;
    case "function":
      return "function() { /* Action */ }";
    default:
      return "Default Value";
  }
}

function generateSampleBookingData(columns: any[]): Record<string, any> {
  const bookingData: Record<string, any> = {
    // Core booking fields with realistic values
    bookingId: "BK-" + Date.now(),
    bookingCode: "BC-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
    tourCode: "SIA", // Siargao Island Adventure
    reservationDate: new Date(),
    bookingType: "Individual",
    bookingStatus: "Confirmed",
    daysBetweenBookingAndTour: 45,
    groupId: "GRP-001",
    isMainBooker: true,
    
    // Traveller information
    travellerInitials: "JS",
    firstName: "John",
    lastName: "Smith",
    fullName: "John Smith",
    emailAddress: "john.smith@example.com",
    
    // Tour package details
    tourPackageNameUniqueCounter: 1,
    tourPackageName: "Siargao Island Adventure",
    formattedDate: "2025-03-15",
    tourDate: new Date("2025-03-15"),
    returnDate: new Date("2025-03-20"),
    tourDuration: 6,
    
    // Pricing
    useDiscountedTourCost: true,
    originalTourCost: 430,
    discountedTourCost: 380,
    
    // Email management - Reservation
    reservationEmail: "reservations@imheretravels.com",
    includeBccReservation: true,
    generateEmailDraft: true,
    emailDraftLink: "https://docs.google.com/draft/sample",
    subjectLineReservation: "Your Siargao Adventure Confirmation",
    sendEmail: true,
    sentEmailLink: "https://mail.google.com/sent/sample",
    reservationEmailSentDate: new Date(),
    
    // Payment terms
    paymentCondition: "Partial Payment",
    eligible2ndOfMonths: true,
    availablePaymentTerms: "50% deposit, 50% 30 days before",
    paymentPlan: "Monthly",
    paymentMethod: "Credit Card",
    enablePaymentReminder: true,
    paymentProgress: 50,
    
    // Payment details
    fullPayment: 380,
    fullPaymentDueDate: new Date("2025-02-15"),
    fullPaymentAmount: 190,
    fullPaymentDatePaid: new Date("2025-01-15"),
    paymentTerm1: "Deposit: £190 due 2025-01-15, Paid 2025-01-15",
    paymentTerm2: "Final: £190 due 2025-02-15, Reminder sent",
    paymentTerm3: "",
    paymentTerm4: "",
    reservationFee: 50,
    paid: 190,
    remainingBalance: 190,
    manualCredit: 0,
    creditFrom: "",
    
    // Cancellation management
    reasonForCancellation: "",
    includeBccCancellation: false,
    generateCancellationEmailDraft: false,
    cancellationEmailDraftLink: "",
    subjectLineCancellation: "",
    sendCancellationEmail: false,
    sentCancellationEmailLink: "",
    cancellationEmailSentDate: null,
  };

  // Add values for all columns from the bookingSheetColumns collection
  columns.forEach((column) => {
    if (!(column.id in bookingData)) {
      bookingData[column.id] = generateSampleValue(column.type, column.options);
    }
  });

  return bookingData;
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

export async function runMigration(dryRun: boolean = false): Promise<{
  success: boolean;
  message: string;
  details?: {
    columnsFound: number;
    bookingCreated: boolean;
    errors: string[];
  };
}> {
  console.log(`🚀 Starting migration: ${MIGRATION_ID}`);
  console.log(`📊 Dry run mode: ${dryRun ? "ON" : "OFF"}`);

  const results = {
    columnsFound: 0,
    bookingCreated: false,
    errors: [] as string[],
  };

  try {
    // Step 1: Fetch all columns from bookingSheetColumns collection
    console.log("🔍 Fetching columns from bookingSheetColumns collection...");
    const columnsSnapshot = await getDocs(
      query(collection(db, COLUMNS_COLLECTION), orderBy("order", "asc"))
    );
    
    if (columnsSnapshot.empty) {
      throw new Error("No columns found in bookingSheetColumns collection. Run migration 012 first.");
    }

    const columns = columnsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    results.columnsFound = columns.length;
    console.log(`✅ Found ${columns.length} columns in bookingSheetColumns collection`);

    // Step 2: Generate sample booking data with all columns
    console.log("📝 Generating sample booking data...");
    const sampleBookingData = generateSampleBookingData(columns);
    
    console.log(`📊 Generated data for ${Object.keys(sampleBookingData).length} fields`);

    // Step 3: Create the sample booking document
    if (!dryRun) {
      console.log("💾 Creating sample booking document...");
      
      // Create a document with a specific ID for easy reference
      const bookingId = "sample-booking-" + Date.now();
      const bookingRef = doc(db, BOOKINGS_COLLECTION, bookingId);
      
      await setDoc(bookingRef, {
        ...sampleBookingData,
        id: bookingId,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Add metadata
        _migration: MIGRATION_ID,
        _isSample: true,
        _description: "Sample booking created by migration 013 to test all columns"
      });

      results.bookingCreated = true;
      console.log(`✅ Created sample booking with ID: ${bookingId}`);
      console.log(`📊 Document contains ${Object.keys(sampleBookingData).length} fields`);
    } else {
      console.log("🔍 [DRY RUN] Would create sample booking document");
      console.log(`📊 Would contain ${Object.keys(sampleBookingData).length} fields`);
      results.bookingCreated = true;
    }

    const success = results.errors.length === 0;
    const message = dryRun
      ? `Migration dry run completed. Found ${results.columnsFound} columns, would create sample booking.`
      : `Migration completed successfully. Found ${results.columnsFound} columns, created sample booking.`;

    console.log(
      `🎯 Migration ${success ? "SUCCESS" : "COMPLETED WITH ERRORS"}`
    );
    console.log(
      `📊 Results: ${results.columnsFound} columns found, booking ${results.bookingCreated ? "created" : "not created"}, ${results.errors.length} errors`
    );

    return {
      success,
      message,
      details: results,
    };
  } catch (error) {
    const errorMsg = `Migration failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    console.error(`❌ ${errorMsg}`);
    return {
      success: false,
      message: errorMsg,
    };
  }
}

export async function rollbackMigration(): Promise<{
  success: boolean;
  message: string;
  details?: {
    deleted: number;
    errors: string[];
  };
}> {
  console.log(`🔄 Rolling back migration: ${MIGRATION_ID}`);

  const results = {
    deleted: 0,
    errors: [] as string[],
  };

  try {
    // Find and delete sample bookings created by this migration
    const sampleBookingsQuery = query(
      collection(db, BOOKINGS_COLLECTION),
      // Note: In a real scenario, you might want to add a where clause to find specific sample bookings
    );
    
    const sampleBookingsSnapshot = await getDocs(sampleBookingsQuery);
    
    for (const doc of sampleBookingsSnapshot.docs) {
      const data = doc.data();
      if (data._migration === MIGRATION_ID && data._isSample === true) {
        try {
          await doc.ref.delete();
          console.log(`🗑️  Deleted sample booking: ${doc.id}`);
          results.deleted++;
        } catch (error) {
          const errorMsg = `Failed to delete sample booking ${doc.id}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          console.error(`❌ ${errorMsg}`);
          results.errors.push(errorMsg);
        }
      }
    }

    const success = results.errors.length === 0;
    const message = `Rollback ${
      success ? "completed successfully" : "completed with errors"
    }. Deleted ${results.deleted} sample bookings.`;

    console.log(`🎯 Rollback ${success ? "SUCCESS" : "COMPLETED WITH ERRORS"}`);
    console.log(
      `📊 Results: ${results.deleted} deleted, ${results.errors.length} errors`
    );

    return {
      success,
      message,
      details: results,
    };
  } catch (error) {
    const errorMsg = `Rollback failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
    console.error(`❌ ${errorMsg}`);
    return {
      success: false,
      message: errorMsg,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  id: MIGRATION_ID,
  name: "Sample Booking with All Columns",
  description:
    "Create a sample booking document with values for all columns from the bookingSheetColumns collection",
  run: runMigration,
  rollback: rollbackMigration,
};
