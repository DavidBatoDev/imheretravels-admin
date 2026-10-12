import {
  collection,
  doc,
  getDocs,
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
  GuestInvitation,
  GuestInvitationUpdateData,
} from "@/types/pre-departure-pack";

const GUEST_INVITATIONS_COLLECTION = "guestInvitations";

// ============================================================================
// GUEST INVITATIONS CRUD OPERATIONS
// ============================================================================

/**
 * Get all guest invitations
 */
export async function getAllGuestInvitations(): Promise<GuestInvitation[]> {
  try {
    const q = query(
      collection(db, GUEST_INVITATIONS_COLLECTION),
      orderBy("createdAt", "desc"),
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as GuestInvitation[];
  } catch (error) {
    console.error("Error fetching guest invitations:", error);
    throw new Error("Failed to fetch guest invitations");
  }
}

/**
 * Get guest invitations by status
 */
export async function getGuestInvitationsByStatus(
  status: "created" | "sent",
): Promise<GuestInvitation[]> {
  try {
    const q = query(
      collection(db, GUEST_INVITATIONS_COLLECTION),
      where("status", "==", status),
      orderBy("createdAt", "desc"),
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as GuestInvitation[];
  } catch (error) {
    console.error("Error fetching guest invitations by status:", error);
    throw new Error("Failed to fetch guest invitations");
  }
}

/**
 * Get guest invitation by booking document ID
 */
export async function getGuestInvitationByBookingId(
  bookingDocumentId: string,
): Promise<GuestInvitation | null> {
  try {
    const q = query(
      collection(db, GUEST_INVITATIONS_COLLECTION),
      where("bookingDocumentId", "==", bookingDocumentId),
      limit(1),
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as GuestInvitation;
  } catch (error) {
    console.error("Error fetching guest invitation by booking ID:", error);
    throw new Error("Failed to fetch guest invitation");
  }
}

/**
 * Create a guest invitation
 */
export async function createGuestInvitation(
  bookingDocumentId: string,
  bookingId: string,
  tourPackageName: string,
  tourDate: Timestamp,
  recipientEmail: string,
  recipientName: string,
  status: "created" | "sent" = "created",
  sentEmailLink?: string,
  sentAt?: Timestamp,
): Promise<string> {
  try {
    // Check if guest invitation already exists for this booking
    const existing = await getGuestInvitationByBookingId(bookingDocumentId);
    if (existing) {
      throw new Error("Guest invitation already exists for this booking");
    }

    const guestInvitationData: Omit<GuestInvitation, "id"> = {
      bookingDocumentId,
      bookingId,
      tourPackageName,
      tourDate,
      recipientEmail,
      recipientName,
      status,
      createdAt: Timestamp.now(),
      lastModified: Timestamp.now(),
    };

    if (status === "sent") {
      guestInvitationData.sentEmailLink = sentEmailLink;
      guestInvitationData.sentAt = sentAt || Timestamp.now();
    }

    const docRef = await addDoc(
      collection(db, GUEST_INVITATIONS_COLLECTION),
      guestInvitationData,
    );

    console.log("Guest invitation created:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error creating guest invitation:", error);
    throw error;
  }
}

/**
 * Update guest invitation status
 */
export async function updateGuestInvitationStatus(
  guestInvitationId: string,
  updateData: GuestInvitationUpdateData,
): Promise<void> {
  try {
    const docRef = doc(db, GUEST_INVITATIONS_COLLECTION, guestInvitationId);

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

    if (updateData.status === "created") {
      updates.sentEmailLink = null;
      updates.sentAt = null;
    }

    await updateDoc(docRef, updates);

    console.log("Guest invitation updated:", guestInvitationId);
  } catch (error) {
    console.error("Error updating guest invitation:", error);
    throw error;
  }
}

/**
 * Delete a guest invitation
 */
export async function deleteGuestInvitation(
  guestInvitationId: string,
): Promise<void> {
  try {
    const docRef = doc(db, GUEST_INVITATIONS_COLLECTION, guestInvitationId);
    await deleteDoc(docRef);

    console.log("Guest invitation deleted:", guestInvitationId);
  } catch (error) {
    console.error("Error deleting guest invitation:", error);
    throw error;
  }
}

/**
 * Get count of unsent guest invitations
 */
export async function getUnsentGuestInvitationsCount(): Promise<number> {
  try {
    const q = query(
      collection(db, GUEST_INVITATIONS_COLLECTION),
      where("status", "==", "created"),
    );
    const countSnapshot = await getCountFromServer(q);

    return countSnapshot.data().count;
  } catch (error) {
    console.error("Error counting unsent guest invitations:", error);
    return 0;
  }
}
