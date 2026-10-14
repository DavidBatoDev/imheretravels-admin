import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  limit,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ConfirmedBooking,
  ConfirmedBookingUpdateData,
} from "@/types/pre-departure-pack";

const CONFIRMED_BOOKINGS_COLLECTION = "confirmedBookings";
const BOOKINGS_COLLECTION = "bookings";
const TOUR_PACKAGES_COLLECTION = "tourPackages";

// ============================================================================
// CONFIRMED BOOKINGS CRUD OPERATIONS
// ============================================================================

/**
 * Get all confirmed bookings
 */
export async function getAllConfirmedBookings(): Promise<ConfirmedBooking[]> {
  try {
    const q = query(
      collection(db, CONFIRMED_BOOKINGS_COLLECTION),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ConfirmedBooking[];
  } catch (error) {
    console.error("Error fetching confirmed bookings:", error);
    throw new Error("Failed to fetch confirmed bookings");
  }
}

/**
 * Get confirmed bookings by status
 */
export async function getConfirmedBookingsByStatus(
  status: "created" | "sent"
): Promise<ConfirmedBooking[]> {
  try {
    const q = query(
      collection(db, CONFIRMED_BOOKINGS_COLLECTION),
      where("status", "==", status),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ConfirmedBooking[];
  } catch (error) {
    console.error("Error fetching confirmed bookings by status:", error);
    throw new Error("Failed to fetch confirmed bookings");
  }
}

/**
 * Get confirmed booking by booking document ID
 */
export async function getConfirmedBookingByBookingId(
  bookingDocumentId: string
): Promise<ConfirmedBooking | null> {
  try {
    const q = query(
      collection(db, CONFIRMED_BOOKINGS_COLLECTION),
      where("bookingDocumentId", "==", bookingDocumentId),
      limit(1)
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as ConfirmedBooking;
  } catch (error) {
    console.error("Error fetching confirmed booking by booking ID:", error);
    throw new Error("Failed to fetch confirmed booking");
  }
}

/**
 * Count confirmed bookings by tour package name
 * Used for generating booking reference counter
 */
export async function countConfirmedBookingsByTourPackage(
  tourPackageName: string
): Promise<number> {
  try {
    const q = query(
      collection(db, CONFIRMED_BOOKINGS_COLLECTION),
      where("tourPackageName", "==", tourPackageName),
      orderBy("createdAt", "asc")
    );
    const countSnapshot = await getCountFromServer(q);

    return countSnapshot.data().count;
  } catch (error) {
    console.error("Error counting confirmed bookings:", error);
    throw new Error("Failed to count confirmed bookings");
  }
}

/**
 * Generate booking reference
 * Format: IMT-{tourDate:yyyy-MM-dd}-{tourCode}-{counter:0000}
 */
export async function generateBookingReference(
  tourPackageName: string,
  tourDate: Date
): Promise<string> {
  try {
    // Get tour code from tourPackages collection
    const tourPackagesQuery = query(
      collection(db, TOUR_PACKAGES_COLLECTION),
      where("name", "==", tourPackageName),
      limit(1)
    );
    const tourSnapshot = await getDocs(tourPackagesQuery);

    let tourCode = "XXX"; // Default if not found
    if (!tourSnapshot.empty) {
      const tourData = tourSnapshot.docs[0].data();
      tourCode = tourData.tourCode || "XXX";
    }

    // Format tour date as yyyy-MM-dd
    const year = tourDate.getFullYear();
    const month = String(tourDate.getMonth() + 1).padStart(2, "0");
    const day = String(tourDate.getDate()).padStart(2, "0");
    const formattedDate = `${year}-${month}-${day}`;

    // Count existing bookings for this tour package
    const counter = await countConfirmedBookingsByTourPackage(tourPackageName);
    const formattedCounter = String(counter + 1).padStart(4, "0");

    return `IMT-${formattedDate}-${tourCode}-${formattedCounter}`;
  } catch (error) {
    console.error("Error generating booking reference:", error);
    throw new Error("Failed to generate booking reference");
  }
}

/**
 * Create a confirmed booking
 */
export async function createConfirmedBooking(
  bookingDocumentId: string,
  bookingId: string,
  tourPackageName: string,
  tourDate: Timestamp,
  preDeparturePackId: string | null,
  preDeparturePackName: string | null,
  status: "created" | "sent",
  sentEmailLink?: string,
  sentAt?: Timestamp
): Promise<string> {
  try {
    // Check if confirmed booking already exists for this booking
    const existing = await getConfirmedBookingByBookingId(bookingDocumentId);
    if (existing) {
      throw new Error("Confirmed booking already exists for this booking");
    }

    // Generate booking reference
    const bookingReference = await generateBookingReference(
      tourPackageName,
      tourDate.toDate()
    );

    const confirmedBookingData: Omit<ConfirmedBooking, "id"> = {
      bookingDocumentId,
      bookingId,
      tourPackageName,
      tourDate,
      preDeparturePackId,
      preDeparturePackName,
      status,
      createdAt: Timestamp.now(),
      lastModified: Timestamp.now(),
      bookingReference,
      tags: [],
    };

    if (status === "sent") {
      confirmedBookingData.sentEmailLink = sentEmailLink;
      confirmedBookingData.sentAt = sentAt || Timestamp.now();
    }

    const docRef = await addDoc(
      collection(db, CONFIRMED_BOOKINGS_COLLECTION),
      confirmedBookingData
    );

    console.log("Confirmed booking created:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error creating confirmed booking:", error);
    throw error;
  }
}

/**
 * Update confirmed booking status
 */
export async function updateConfirmedBookingStatus(
  confirmedBookingId: string,
  updateData: ConfirmedBookingUpdateData
): Promise<void> {
  try {
    const docRef = doc(db, CONFIRMED_BOOKINGS_COLLECTION, confirmedBookingId);

    const updates: any = {
      status: updateData.status,
      lastModified: Timestamp.now(),
    };

    if (updateData.status === "sent") {
      updates.sentEmailLink = updateData.sentEmailLink || "";
      updates.sentAt = updateData.sentAt
        ? Timestamp.fromDate(updateData.sentAt)
        : Timestamp.now();
    }

    await updateDoc(docRef, updates);

    console.log("Confirmed booking updated:", confirmedBookingId);
  } catch (error) {
    console.error("Error updating confirmed booking:", error);
    throw error;
  }
}

/**
 * Delete a confirmed booking
 */
export async function deleteConfirmedBooking(
  confirmedBookingId: string
): Promise<void> {
  try {
    const docRef = doc(db, CONFIRMED_BOOKINGS_COLLECTION, confirmedBookingId);
    await deleteDoc(docRef);

    console.log("Confirmed booking deleted:", confirmedBookingId);
  } catch (error) {
    console.error("Error deleting confirmed booking:", error);
    throw error;
  }
}

/**
 * Get count of unsent confirmed bookings
 */
export async function getUnsentConfirmedBookingsCount(): Promise<number> {
  try {
    const q = query(
      collection(db, CONFIRMED_BOOKINGS_COLLECTION),
      where("status", "==", "created")
    );
    const countSnapshot = await getCountFromServer(q);

    return countSnapshot.data().count;
  } catch (error) {
    console.error("Error counting unsent confirmed bookings:", error);
    return 0;
  }
}
