import type { Firestore } from "firebase/firestore";

type PaymentSuccessActionInput = {
  db: Firestore;
  paymentIntentId?: string;
  paymentDocId?: string;
  email: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  nationality: string;
  bookingType: string;
  groupSize: number;
  tourPackage: string;
  tourDate: string;
  selectedPackageName: string;
  selectedPackageDeposit: number;
  completedSteps: number[];
  setCompletedSteps: (
    update: number[] | ((prev: number[]) => number[]),
  ) => void;
  setPaymentConfirmed: (value: boolean) => void;
  setBookingId: (value: string) => void;
  onError: (error: unknown) => void;
};

export const runPaymentSuccessAction = async ({
  db,
  paymentIntentId,
  paymentDocId,
  email,
  firstName,
  lastName,
  birthdate,
  nationality,
  bookingType,
  groupSize,
  tourPackage,
  tourDate,
  selectedPackageName,
  selectedPackageDeposit,
  completedSteps,
  setCompletedSteps,
  setPaymentConfirmed,
  setBookingId,
  onError,
}: PaymentSuccessActionInput): Promise<void> => {
  try {
    const {
      doc,
      updateDoc,
      serverTimestamp,
      collection,
      query,
      where,
      getDocs,
    } = await import("firebase/firestore");

    const updateData: Record<string, unknown> = {
      "customer.email": email,
      "customer.firstName": firstName,
      "customer.lastName": lastName,
      "customer.birthdate": birthdate,
      "customer.nationality": nationality,
      "booking.type": bookingType,
      "booking.groupSize":
        bookingType === "Group Booking"
          ? groupSize
          : bookingType === "Duo Booking"
            ? 2
            : 1,
      "tour.packageId": tourPackage,
      "tour.packageName": selectedPackageName,
      "tour.date": tourDate,
      "payment.status": "reserve_paid",
      "payment.stripeIntentId": paymentIntentId,
      "timestamps.updatedAt": serverTimestamp(),
    };

    let actualPaymentDocId = paymentDocId;
    if (paymentDocId) {
      await updateDoc(doc(db, "stripePayments", paymentDocId), updateData);
    } else {
      const paymentsRef = collection(db, "stripePayments");
      const q = query(
        paymentsRef,
        where("payment.stripeIntentId", "==", paymentIntentId),
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const paymentDoc = querySnapshot.docs[0];
        actualPaymentDocId = paymentDoc.id;
        await updateDoc(doc(db, "stripePayments", paymentDoc.id), updateData);
      }
    }

    if (actualPaymentDocId && process.env.NEXT_PUBLIC_ENV !== "production") {
      const response = await fetch("/api/stripe-payments/create-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentDocId: actualPaymentDocId,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setBookingId(result.bookingId);

      }
    } else if (
      actualPaymentDocId &&
      process.env.NEXT_PUBLIC_ENV === "production"
    ) {
      try {
        const { onSnapshot } = await import("firebase/firestore");

        const createdBookingId = await new Promise<string>(
          (resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error("Timeout waiting for booking creation"));
            }, 30000);

            const unsubscribe = onSnapshot(
              doc(db, "stripePayments", actualPaymentDocId),
              (docSnapshot) => {
                const data = docSnapshot.data();
                const bookingId = data?.booking?.id;
                const bookingDocId = data?.booking?.documentId;

                if (bookingId && bookingId !== "PENDING" && bookingDocId) {
                  clearTimeout(timeoutId);
                  unsubscribe();
                  setBookingId(bookingId);
                  resolve(bookingId);
                }
              },
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              },
            );
          },
        );

        if (createdBookingId) {
          setBookingId(createdBookingId);
        }
      } catch {
        // Preserve current behavior: continue even if webhook wait fails.
      }
    }

    try {
      const sessionKey = `stripe_payment_${email}_${tourPackage}`;
      sessionStorage.removeItem(sessionKey);
      const guestsSessionKey = `additional_guests_${email}_${tourPackage}`;
      sessionStorage.removeItem(guestsSessionKey);
    } catch {}

    setPaymentConfirmed(true);
    if (!completedSteps.includes(1)) {
      setCompletedSteps((prev) => [...prev, 1]);
    }
    if (!completedSteps.includes(2)) {
      setCompletedSteps((prev) => [...prev, 2]);
    }
  } catch (error) {
    onError(error);
  }
};
