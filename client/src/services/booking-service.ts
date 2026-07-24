import { db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  where,
  getDocs,
  DocumentData,
  Unsubscribe,
} from "firebase/firestore";

// ============================================================================
// COLLECTION CONSTANTS
// ============================================================================

const COLLECTION_NAME = "bookings";

// ============================================================================
// BOOKING SERVICE INTERFACE
// ============================================================================

export interface BookingService {
  // CRUD Operations
  updateBooking(bookingId: string, updates: Record<string, any>): Promise<void>;
  deleteBooking(bookingId: string): Promise<void>;
  deleteAllBookings(): Promise<void>;
  createBooking(bookingData: Record<string, any>): Promise<string>;
  getBooking(bookingId: string): Promise<DocumentData | null>;
  getAllBookings(): Promise<DocumentData[]>;
  getGroupMembers(groupId: string): Promise<DocumentData[]>;

  // Real-time Listeners (remain Firebase-based)
  subscribeToBookings(
    callback: (bookings: DocumentData[]) => void
  ): Unsubscribe;
  subscribeToBooking(
    bookingId: string,
    callback: (booking: DocumentData | null) => void
  ): Unsubscribe;

  // Utility Methods
  updateBookingField(
    bookingId: string,
    fieldPath: string,
    value: any
  ): Promise<void>;

  // Create or update a complete booking
  createOrUpdateBooking(
    bookingId: string,
    bookingData: Record<string, any>
  ): Promise<void>;

  // Row number management
  getNextRowNumber(): Promise<number>;
  getRowNumberForId(bookingId: string): Promise<number>;

  // Clear booking fields (keep document, clear data)
  clearBookingFields(bookingId: string): Promise<void>;

  // Delete booking and shift subsequent rows
  deleteBookingWithRowShift(bookingId: string): Promise<void>;
}

// ============================================================================
// BOOKING SERVICE IMPLEMENTATION
// ============================================================================

class BookingServiceImpl implements BookingService {
  // ========================================================================
  // CRUD OPERATIONS (Now using API routes)
  // ========================================================================

  async updateBooking(
    bookingId: string,
    updates: Record<string, any>
  ): Promise<void> {
    console.log(
      `🔍 [UPDATE BOOKING] Calling API for ${bookingId}, updates:`,
      Object.keys(updates)
    );
    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update booking");
      }

      console.log(`✅ Updated booking ${bookingId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update booking ${bookingId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  async deleteBooking(bookingId: string): Promise<void> {
    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete booking");
      }

      console.log(`✅ Deleted booking ${bookingId}`);
    } catch (error) {
      console.error(
        `❌ Failed to delete booking ${bookingId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  async deleteAllBookings(): Promise<void> {
    try {
      const response = await fetch("/api/bookings", {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete all bookings");
      }

      console.log(`✅ Deleted all ${data.count} bookings`);
    } catch (error) {
      console.error(
        `❌ Failed to delete all bookings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  async createBooking(bookingData: Record<string, any>): Promise<string> {
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create booking");
      }

      console.log(`✅ Created booking with ID: ${data.bookingId}`);
      return data.bookingId;
    } catch (error) {
      console.error(
        `❌ Failed to create booking: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  async getBooking(bookingId: string): Promise<DocumentData | null> {
    try {
      const response = await fetch(`/api/bookings/${bookingId}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(data.error || "Failed to get booking");
      }

      if (!data.success) {
        throw new Error(data.error || "Failed to get booking");
      }

      return data.booking;
    } catch (error) {
      console.error(
        `❌ Failed to get booking ${bookingId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  async getAllBookings(): Promise<DocumentData[]> {
    try {
      const response = await fetch("/api/bookings");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to get all bookings");
      }

      return data.bookings;
    } catch (error) {
      console.error(
        `❌ Failed to get all bookings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  /**
   * Every booking in a Duo/Group travel party, main booker first.
   *
   * Single-field equality only — adding `isMainBooker` to the query would need
   * a composite index that does not exist, so ordering happens in memory.
   */
  async getGroupMembers(groupId: string): Promise<DocumentData[]> {
    if (!groupId) return [];

    try {
      const snapshot = await getDocs(
        query(collection(db, COLLECTION_NAME), where("groupId", "==", groupId))
      );

      return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const aMain = a.isMainBooker === true ? 0 : 1;
          const bMain = b.isMainBooker === true ? 0 : 1;
          if (aMain !== bMain) return aMain - bMain;
          return String(a.fullName || "").localeCompare(String(b.fullName || ""));
        });
    } catch (error) {
      console.error(
        `❌ Failed to get group members for ${groupId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return [];
    }
  }

  // ========================================================================
  // REAL-TIME LISTENERS (Remain Firebase-based on client)
  // ========================================================================

  subscribeToBookings(
    callback: (bookings: DocumentData[]) => void
  ): Unsubscribe {
    return onSnapshot(
      query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc")),
      (querySnapshot) => {
        const bookings = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        callback(bookings);
      },
      (error) => {
        console.error(`❌ Error listening to bookings: ${error.message}`);
      }
    );
  }

  subscribeToBooking(
    bookingId: string,
    callback: (booking: DocumentData | null) => void
  ): Unsubscribe {
    return onSnapshot(
      doc(db, COLLECTION_NAME, bookingId),
      (docSnap) => {
        if (docSnap.exists()) {
          callback({ id: docSnap.id, ...docSnap.data() });
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error(
          `❌ Error listening to booking ${bookingId}: ${error.message}`
        );
      }
    );
  }

  // ========================================================================
  // UTILITY METHODS (Now using API routes)
  // ========================================================================

  async updateBookingField(
    bookingId: string,
    fieldPath: string,
    value: any
  ): Promise<void> {
    console.log(
      `🔍 [UPDATE FIELD] Calling API for ${bookingId}, field: ${fieldPath}, value:`,
      value
    );
    try {
      const response = await fetch(`/api/bookings/${bookingId}/field`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldPath, value }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update booking field");
      }

      console.log(`✅ Updated field ${fieldPath} in booking ${bookingId}`);
    } catch (error) {
      console.error(
        `❌ Failed to update field ${fieldPath} in booking ${bookingId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  async createOrUpdateBooking(
    bookingId: string,
    bookingData: Record<string, any>
  ): Promise<void> {
    try {
      const response = await fetch(
        `/api/bookings/${bookingId}/create-or-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookingData),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create/update booking");
      }

      console.log(`✅ Created/Updated booking ${bookingId}`);
    } catch (error) {
      console.error(
        `❌ Failed to create/update booking ${bookingId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  // ========================================================================
  // ROW NUMBER MANAGEMENT
  // ========================================================================

  async getNextRowNumber(): Promise<number> {
    try {
      const response = await fetch("/api/bookings/next-row");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to get next row number");
      }

      return data.rowNumber;
    } catch (error) {
      console.error(
        `❌ Failed to get next row number: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  async getRowNumberForId(bookingId: string): Promise<number> {
    try {
      const numericId = parseInt(bookingId);
      if (isNaN(numericId)) {
        throw new Error(`Invalid booking ID: ${bookingId}`);
      }
      return numericId;
    } catch (error) {
      console.error(
        `❌ Failed to get row number for ID ${bookingId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  // ========================================================================
  // FIELD CLEARING
  // ========================================================================

  async clearBookingFields(bookingId: string): Promise<void> {
    try {
      const response = await fetch(`/api/bookings/${bookingId}/clear`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to clear booking fields");
      }

      console.log(
        `✅ Cleared all fields from booking ${bookingId}, preserved essential fields`
      );
    } catch (error) {
      console.error(
        `❌ Failed to clear booking fields ${bookingId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  // ========================================================================
  // DELETE WITH ROW SHIFTING
  // ========================================================================

  async deleteBookingWithRowShift(bookingId: string): Promise<void> {
    try {
      console.log(
        `🗑️ Calling API to delete booking ${bookingId} with row shift...`
      );

      const response = await fetch(`/api/bookings/${bookingId}/with-shift`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to delete booking with row shift"
        );
      }

      console.log(
        `✅ Successfully deleted booking and shifted ${data.rowsShifted} subsequent rows down`
      );
    } catch (error) {
      console.error(
        `❌ Failed to delete booking with row shift ${bookingId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const bookingService = new BookingServiceImpl();
export default bookingService;
