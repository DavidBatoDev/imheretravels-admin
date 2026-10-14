import "server-only";

import { db, collection, addDoc, Timestamp } from "@/lib/server-firestore";
import { NotificationType } from "@/types/notifications";

// ============================================================================
// NOTIFICATION SERVICE (server-only: firebase-admin via server-firestore, so
// the browser can no longer forge admin notifications)
// ============================================================================

interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  body: string;
  data: {
    bookingId?: string;
    bookingDocumentId?: string;
    amount?: number;
    currency?: string;
    travelerName?: string;
    tourPackageName?: string;
    paymentPlan?: string;
    mainBookerName?: string;
    isGuestBooking?: boolean;
    [key: string]: any;
  };
  targetType?: "global" | "specific";
  targetUserIds?: string[];
}

/**
 * Create a new notification document
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<string> {
  try {
    const notificationData = {
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
      targetType: params.targetType || "global",
      targetUserIds: params.targetUserIds || [],
      createdAt: Timestamp.now(),
      readBy: {}, // Empty initially - users mark as read individually
    };

    const notificationRef = await addDoc(
      collection(db, "notifications"),
      notificationData
    );

    console.log(
      `✅ Notification created: ${notificationRef.id} - ${params.title}`
    );
    return notificationRef.id;
  } catch (error) {
    console.error("❌ Error creating notification:", error);
    throw error;
  }
}

/**
 * Create notification for main booker reservation payment (Step 2)
 */
export async function createReservationPaymentNotification(params: {
  bookingId: string;
  bookingDocumentId: string;
  travelerName: string;
  tourPackageName: string;
  amount: number;
  currency: string;
}): Promise<string> {
  return createNotification({
    type: "new_booking",
    title: "New Reservation Payment",
    body: `${params.travelerName} paid reservation fee for ${params.tourPackageName} (Booking ID: ${params.bookingId})`,
    data: {
      bookingId: params.bookingId,
      bookingDocumentId: params.bookingDocumentId,
      travelerName: params.travelerName,
      tourPackageName: params.tourPackageName,
      amount: params.amount,
      currency: params.currency,
      isGuestBooking: false,
    },
  });
}

/**
 * Create notification for guest reservation payment (Step 2)
 */
export async function createGuestReservationPaymentNotification(params: {
  bookingId: string;
  bookingDocumentId: string;
  travelerName: string;
  mainBookerName: string;
  tourPackageName: string;
  amount: number;
  currency: string;
}): Promise<string> {
  return createNotification({
    type: "new_booking",
    title: "New Guest Reservation Payment",
    body: `${params.travelerName} (guest of ${params.mainBookerName}) paid reservation fee for ${params.tourPackageName} (Booking ID: ${params.bookingId})`,
    data: {
      bookingId: params.bookingId,
      bookingDocumentId: params.bookingDocumentId,
      travelerName: params.travelerName,
      mainBookerName: params.mainBookerName,
      tourPackageName: params.tourPackageName,
      amount: params.amount,
      currency: params.currency,
      isGuestBooking: true,
    },
  });
}
