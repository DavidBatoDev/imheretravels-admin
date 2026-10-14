"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase";
import { Timestamp } from "firebase/firestore";
import BirthdatePicker from "../reservation-booking-form/components/BirthdatePicker";
import Select from "../reservation-booking-form/components/Select";
import StripePayment from "../reservation-booking-form/components/StripePayment";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  validateGuestInvitation,
  getDaysUntilExpiration,
  formatExpirationDate,
  type ParentBookingData,
  type GuestInvitation,
} from "@/lib/guest-booking-utils";

const GuestReservationPage = () => {
  // URL Parameters
  const searchParams = useSearchParams();
  const router = useRouter();
  const parentBookingId = searchParams.get("booking");
  const guestEmail = searchParams.get("email");

  // Validation State
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [parentBooking, setParentBooking] = useState<ParentBookingData | null>(
    null,
  );
  const [invitation, setInvitation] = useState<GuestInvitation | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<number>(0);

  // Form State - Step 1: Personal Details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState<string>("");
  const [nationality, setNationality] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState("");

  // Form State - Multi-step
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [submitted, setSubmitted] = useState(false);

  // Payment State
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [paymentDocId, setPaymentDocId] = useState<string | null>(null);
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [parentPaymentPlanDetails, setParentPaymentPlanDetails] =
    useState<any>(null);
  const [parentSelectedPaymentPlan, setParentSelectedPaymentPlan] =
    useState<string>("");

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Nationality options
  const nationalityOptions = [
    "Philippines",
    "United States",
    "United Kingdom",
    "Canada",
    "Australia",
    "India",
    "Germany",
    "France",
    "Spain",
    "Italy",
    "Japan",
    "China",
    "South Korea",
    "Singapore",
    "Malaysia",
    "Thailand",
    "Other",
  ].map((n) => ({ label: n, value: n }));

  // ============================================================================
  // VALIDATION ON MOUNT
  // ============================================================================

  useEffect(() => {
    async function validateInvitation() {
      if (!parentBookingId || !guestEmail) {
        setValidationError(
          "Invalid invitation link. Missing required parameters.",
        );
        setIsValidating(false);
        return;
      }

      const result = await validateGuestInvitation(parentBookingId, guestEmail);

      if (!result.isValid) {
        setValidationError(result.error || "Invalid invitation");
        setIsValidating(false);
        return;
      }

      // Validation passed
      setParentBooking(result.parentBooking!);
      setInvitation(result.invitation!);
      setDaysRemaining(getDaysUntilExpiration(result.invitation!.expiresAt));

      // Fetch tour package to get the cover image
      if (result.parentBooking?.tourPackageId) {
        try {
          const { getDoc, doc } = await import("firebase/firestore");
          const tourPackageRef = doc(
            db,
            "tourPackages",
            result.parentBooking.tourPackageId,
          );
          const tourPackageSnap = await getDoc(tourPackageRef);

          if (tourPackageSnap.exists()) {
            const tourData = tourPackageSnap.data();
            const coverImage =
              tourData?.media?.coverImage || tourData?.coverImage || "";

            // Update parent booking with image
            setParentBooking((prev) =>
              prev ? { ...prev, tourImage: coverImage } : prev,
            );
          }
        } catch (error) {
          console.warn("Error fetching tour package image:", error);
        }
      }

      // Fetch the main booker's booking document to get accurate pricing
      try {
        // First, fetch the payment document to get the booking document ID
        const { getDoc, doc } = await import("firebase/firestore");
        const paymentDocRef = doc(db, "stripePayments", parentBookingId);
        const paymentDocSnap = await getDoc(paymentDocRef);

        if (paymentDocSnap.exists()) {
          const paymentData = paymentDocSnap.data();
          const bookingDocId = paymentData?.booking?.documentId;

          // Store payment plan details from parent's stripePayment document
          if (paymentData?.payment?.paymentPlanDetails) {
            setParentPaymentPlanDetails(paymentData.payment.paymentPlanDetails);
          }
          if (paymentData?.payment?.selectedPaymentPlan) {
            setParentSelectedPaymentPlan(
              paymentData.payment.selectedPaymentPlan,
            );
          }

          console.log("📝 Payment document fetched:", {
            paymentDocId: parentBookingId,
            bookingDocId,
            paymentData: paymentData?.booking,
            paymentPlanDetails: paymentData?.payment?.paymentPlanDetails,
            selectedPaymentPlan: paymentData?.payment?.selectedPaymentPlan,
          });

          if (bookingDocId) {
            // Now fetch the actual booking document
            const bookingDocRef = doc(db, "bookings", bookingDocId);
            const bookingDocSnap = await getDoc(bookingDocRef);

            if (bookingDocSnap.exists()) {
              const bookingData = bookingDocSnap.data();
              // Use the reservationFee field instead of payment plan deposit
              const amount = bookingData?.reservationFee || 0;
              const paymentPlan = bookingData?.paymentPlan || "";
              const paymentMethod = bookingData?.paymentMethod || "";

              console.log("✅ Found booking via payment document reference:", {
                reservationFee: amount,
                paymentPlan,
                paymentMethod,
                bookingData,
              });

              setDepositAmount(amount);

              // Update parentBooking with payment plan info
              setParentBooking((prev) =>
                prev
                  ? {
                      ...prev,
                      paymentPlan,
                      paymentMethod,
                    }
                  : prev,
              );

              setIsValidating(false);
              return;
            } else {
              console.warn("❌ Booking document not found:", bookingDocId);
            }
          } else {
            console.warn("❌ No booking.documentId in payment document");
          }
        } else {
          console.warn("❌ Payment document not found:", parentBookingId);
        }
      } catch (error) {
        console.warn("Error fetching payment/booking documents:", error);
      }

      // Fallback: try using parentBookingId as booking document ID directly
      try {
        console.log(
          "📝 Trying fallback: using parentBookingId as booking doc ID",
        );
        const { getDoc, doc } = await import("firebase/firestore");
        const bookingRef = doc(db, "bookings", parentBookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data();
          // Use the reservationFee field instead of payment plan deposit
          const amount = bookingData?.reservationFee || 0;
          const paymentPlan = bookingData?.paymentPlan || "";
          const paymentMethod = bookingData?.paymentMethod || "";

          console.log("✅ Fallback: Found booking via direct doc ID:", {
            reservationFee: amount,
            paymentPlan,
            paymentMethod,
            bookingData,
          });

          setDepositAmount(amount);

          // Update parentBooking with payment plan info
          setParentBooking((prev) =>
            prev
              ? {
                  ...prev,
                  paymentPlan,
                  paymentMethod,
                }
              : prev,
          );
        } else {
          console.warn("❌ Fallback: No booking found via direct doc ID");
          setDepositAmount(0);
        }
      } catch (e) {
        console.warn("Error with fallback booking fetch:", e);
        setDepositAmount(0);
      }

      setIsValidating(false);
    }

    validateInvitation();
  }, [parentBookingId, guestEmail]);

  // ============================================================================
  // FORM VALIDATION
  // ============================================================================

  const validateStep1 = (): boolean => {
    const newErrors: { [k: string]: string } = {};

    // First Name
    if (!firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    // Last Name
    if (!lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    // Birthdate
    if (!birthdate) {
      newErrors.birthdate = "Birthdate is required";
    } else {
      const birthdateObj = new Date(birthdate);
      const today = new Date();
      const age = today.getFullYear() - birthdateObj.getFullYear();
      if (age < 18) {
        newErrors.birthdate = "You must be at least 18 years old";
      }
    }

    // Nationality
    if (!nationality) {
      newErrors.nationality = "Nationality is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================================
  // STEP NAVIGATION
  // ============================================================================

  const handleProceedToPayment = async () => {
    if (isSubmitting) return; // Prevent double-clicks

    setSubmitted(true);
    if (!validateStep1()) {
      return;
    }

    // If we already have a paymentDocId, update it with current form data
    if (paymentDocId) {
      try {
        const {
          updateDoc,
          doc: firestoreDoc,
          serverTimestamp,
        } = await import("firebase/firestore");

        const paymentUpdateData: any = {
          amount: depositAmount || 0,
          currency: "GBP",
          status: "reserve_pending",
          type: "reservationFee",
        };

        // Inherit payment plan details if available
        if (parentPaymentPlanDetails) {
          paymentUpdateData.paymentPlanDetails = parentPaymentPlanDetails;
        }
        if (parentSelectedPaymentPlan) {
          paymentUpdateData.selectedPaymentPlan = parentSelectedPaymentPlan;
        }

        await updateDoc(firestoreDoc(db, "stripePayments", paymentDocId), {
          customer: {
            email: guestEmail,
            firstName,
            lastName,
            birthdate,
            nationality,
          },
          booking: {
            type: parentBooking?.bookingType || "Single Booking",
            groupSize: parentBooking?.groupSize || 1,
            isGuest: true,
            id: "PENDING",
            documentId: "",
          },
          tour: {
            packageId: parentBooking?.tourPackageId || "",
            packageName: parentBooking?.tourName || "",
            date: parentBooking?.tourDate || "",
          },
          payment: paymentUpdateData,
          guestBooking: {
            parentBookingId: parentBookingId,
            guestEmail: guestEmail,
          },
          "timestamps.updatedAt": serverTimestamp(),
        });

        console.log(
          "✅ Updated existing guest payment document:",
          paymentDocId,
        );
      } catch (error) {
        console.error("Error updating payment document:", error);
        alert("Unable to update payment record. Please try again.");
        return;
      }

      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Create a placeholder payment document for guest
    try {
      const {
        collection,
        addDoc,
        serverTimestamp,
        doc: firestoreDoc,
        setDoc,
      } = await import("firebase/firestore");

      const paymentsRef = collection(db, "stripePayments");

      const paymentData: any = {
        amount: depositAmount || 0,
        currency: "GBP",
        status: "reserve_pending",
        type: "reservationFee",
      };

      // Inherit payment plan details if available
      if (parentPaymentPlanDetails) {
        paymentData.paymentPlanDetails = parentPaymentPlanDetails;
      }
      if (parentSelectedPaymentPlan) {
        paymentData.selectedPaymentPlan = parentSelectedPaymentPlan;
      }

      const newDoc = await addDoc(paymentsRef, {
        customer: {
          email: guestEmail,
          firstName,
          lastName,
          birthdate,
          nationality,
        },
        booking: {
          type: parentBooking?.bookingType || "Single Booking",
          groupSize: parentBooking?.groupSize || 1,
          isGuest: true,
          id: "PENDING",
          documentId: "",
        },
        tour: {
          packageId: parentBooking?.tourPackageId || "",
          packageName: parentBooking?.tourName || "",
          date: parentBooking?.tourDate || "",
        },
        payment: paymentData,
        guestBooking: {
          parentBookingId: parentBookingId,
          guestEmail: guestEmail,
        },
        timestamps: {
          createdAt: serverTimestamp(),
        },
      });

      // Write the id into the document for convenience
      await setDoc(
        firestoreDoc(db, "stripePayments", newDoc.id),
        { id: newDoc.id },
        { merge: true },
      );

      setPaymentDocId(newDoc.id);

      // Proceed to step 2 (payment)
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Error creating payment placeholder:", error);
      alert("Unable to create payment record. Please try again.");
    }
  };

  const handleBackToDetails = () => {
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ============================================================================
  // PAYMENT SUCCESS HANDLER
  // ============================================================================

  const handlePaymentSuccess = async (docId: string) => {
    setPaymentDocId(docId);
    setPaymentConfirmed(true);
    setIsCreatingBooking(true);

    try {
      console.log("🎉 Guest payment succeeded! Creating booking...");

      // Determine payment status based on parent's payment plan
      const hasPaymentPlan =
        parentBooking?.paymentPlan &&
        parentBooking.paymentPlan.toUpperCase() !== "FULL PAYMENT";
      const paymentStatus = hasPaymentPlan ? "terms_selected" : "reserve_paid";

      console.log("💳 Payment status decision:", {
        parentPaymentPlan: parentBooking?.paymentPlan,
        hasPaymentPlan,
        paymentStatus,
      });

      // First, update the stripePayments document with guest details
      const { doc, updateDoc, serverTimestamp } =
        await import("firebase/firestore");

      const updateData: any = {
        "customer.email": guestEmail,
        "customer.firstName": firstName,
        "customer.lastName": lastName,
        "customer.birthdate": birthdate,
        "customer.nationality": nationality,
        "payment.status": paymentStatus,
        "timestamps.updatedAt": serverTimestamp(),
      };

      console.log("📤 Updating guest payment document with:", updateData);

      await updateDoc(doc(db, "stripePayments", docId), updateData);
      console.log("✅ Guest payment document updated!");

      // Call the create-guest-booking API
      const response = await fetch(
        "/api/stripe-payments/create-guest-booking",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentDocId: docId,
            parentBookingId: parentBookingId!,
            guestEmail: guestEmail!,
            guestData: {
              email: guestEmail,
              firstName,
              lastName,
              birthdate,
              nationality,
              phoneNumber,
              dietaryRestrictions,
            },
          }),
        },
      );

      const result = await response.json();

      if (response.ok) {
        console.log("✅ Guest booking created:", result);
        setBookingConfirmed(true);

        // Send booking status confirmation email with QR code
        try {
          console.log("📧 Sending booking status confirmation email...");
          const emailResponse = await fetch(
            "/api/send-booking-status-confirmation",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                bookingDocumentId: result.bookingDocumentId || "",
                email: guestEmail,
              }),
            },
          );

          const emailResult = await emailResponse.json();

          if (emailResponse.ok) {
            console.log(
              "✅ Booking status confirmation email sent!",
              emailResult,
            );
          } else {
            console.warn(
              "⚠️ Failed to send booking status email:",
              emailResult.error,
            );
            // Don't block the user flow if email fails
          }
        } catch (emailError) {
          console.warn("⚠️ Error sending booking status email:", emailError);
          // Don't block the user flow if email fails
        }

      } else {
        console.error("❌ Failed to create guest booking:", result.error);
        alert(`Failed to create booking: ${result.error}`);
      }
    } catch (error) {
      console.error("❌ Error creating guest booking:", error);
      alert(
        "An error occurred while creating your booking. Please contact support.",
      );
    } finally {
      setIsCreatingBooking(false);
    }
  };

  // ============================================================================
  // RENDER STATES
  // ============================================================================

  // Loading State
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Validating your invitation...
          </p>
        </div>
      </div>
    );
  }

  // Error State
  if (validationError) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-crimson-red/5 via-sunglow-yellow/5 to-spring-green/5 dark:from-crimson-red/20 dark:via-creative-midnight/30 dark:to-spring-green/20 animate-gradient-shift bg-[length:200%_200%]" />
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-destructive/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl"></div>

        <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
          <div className="max-w-lg w-full">
            {/* Error Card */}
            <div className="bg-card/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-border overflow-hidden">
              {/* Header with gradient */}
              <div className="bg-gradient-to-r from-destructive/10 via-amber-500/10 to-destructive/10 p-6 border-b border-border/50">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-destructive/20 rounded-full blur-xl"></div>
                    <div className="relative w-16 h-16 bg-gradient-to-br from-destructive to-amber-600 rounded-full flex items-center justify-center shadow-lg">
                      <svg
                        className="w-8 h-8 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-foreground mb-1">
                      Invalid Invitation
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      This invitation link is not valid
                    </p>
                  </div>
                </div>
              </div>

              {/* Error details */}
              <div className="p-6">
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-sm text-foreground flex-1">
                      {validationError}
                    </p>
                  </div>
                </div>

                {/* Possible reasons */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Common reasons:
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>The invitation link has expired</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>The booking has been cancelled</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>The link may have been copied incorrectly</span>
                    </li>
                  </ul>
                </div>

                {/* Support section */}
                <div className="mt-6 pt-6 border-t border-border">
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                        />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground mb-1">
                          Need help?
                        </p>
                        <p className="text-xs text-muted-foreground mb-2">
                          Please contact{" "}
                          <a
                            href="https://mail.google.com/mail/?view=cm&fs=1&to=bella@imheretravels.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline"
                          >
                            bella@imheretravels.com
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success State
  if (bookingConfirmed) {
    return (
      <div className="min-h-screen bg-background relative">
        {/* Animated gradient background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-crimson-red/5 via-sunglow-yellow/5 to-spring-green/5 dark:from-crimson-red/20 dark:via-creative-midnight/30 dark:to-spring-green/20 animate-gradient-shift bg-[length:200%_200%]" />
        </div>

        <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
          <div className="max-w-2xl w-full bg-card rounded-2xl shadow-xl p-8 border border-border">
            <div className="bg-spring-green/10 border border-spring-green/30 p-6 rounded-lg mb-6">
              <div className="flex items-start gap-3">
                <svg
                  className="h-8 w-8 text-spring-green flex-shrink-0 mt-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    Booking Confirmed!
                  </h2>
                  <p className="text-muted-foreground">
                    You're all set for {parentBooking?.tourName}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted/10 border border-border rounded-lg p-6 mb-6">
              <h3 className="font-semibold text-foreground mb-4">
                What's Next?
              </h3>
              <ul className="space-y-3 text-foreground">
                <li className="flex items-start">
                  <svg
                    className="w-5 h-5 text-spring-green mr-3 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    Check your email ({guestEmail}) for your booking
                    confirmation
                  </span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="w-5 h-5 text-spring-green mr-3 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    You'll receive payment reminders according to your payment
                    plan
                  </span>
                </li>
                <li className="flex items-start">
                  <svg
                    className="w-5 h-5 text-spring-green mr-3 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    Contact us if you have any questions about your booking
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => router.push("/")}
                className="flex-1 px-6 py-3 border-2 border-border text-foreground rounded-lg hover:bg-muted/50 transition-colors font-semibold"
              >
                Return to Home
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-crimson-red text-white rounded-lg hover:opacity-90 transition-all font-semibold shadow-lg hover:shadow-xl"
              >
                Print Confirmation
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN FORM RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-background relative">
      {/* Animated gradient background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-crimson-red/5 via-sunglow-yellow/5 to-spring-green/5 dark:from-crimson-red/20 dark:via-creative-midnight/30 dark:to-spring-green/20 animate-gradient-shift bg-[length:200%_200%]" />
      </div>

      <div className="relative z-10 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8 relative">
            <div className="absolute top-0 right-0">
              <ThemeToggle />
            </div>
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-primary to-crimson-red rounded-2xl shadow-lg">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-primary via-crimson-red to-sunglow-yellow">
              Complete Your Group Reservation
            </h1>
            <p className="text-muted-foreground text-lg">
              You've been invited to join a group booking for{" "}
              <span className="font-semibold text-primary">
                {parentBooking?.tourName}
              </span>
            </p>
          </div>

          {/* Expiration Warning */}
          {daysRemaining <= 3 && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-md">
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-3 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    {daysRemaining === 0
                      ? "Invitation expires today!"
                      : `Invitation expires in ${daysRemaining} day${
                          daysRemaining > 1 ? "s" : ""
                        }`}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Complete your booking before{" "}
                    {invitation && formatExpirationDate(invitation.expiresAt)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Progress Indicator */}
          <div className="mb-8">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-foreground">
                  Complete Your Reservation
                </h2>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Takes about 2-3 minutes
                </p>
              </div>
            </div>

            <div className="relative w-full bg-muted/30 backdrop-blur-sm rounded-full h-3 overflow-hidden shadow-inner border border-border/50">
              <div
                className={`h-full bg-gradient-to-r from-primary via-crimson-red to-spring-green rounded-full transition-all duration-500 ease-out shadow-lg relative ${
                  step === 2 ? "w-full" : "w-1/2"
                }`}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full"></div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                }}
                className="flex items-center gap-1.5 sm:gap-2 transition-all duration-200 hover:opacity-80 cursor-pointer group"
              >
                <div
                  className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                    step === 1
                      ? "bg-gradient-to-br from-primary to-crimson-red text-primary-foreground shadow-lg scale-110 ring-2 ring-primary/30"
                      : "bg-white text-green-600 shadow-md group-hover:scale-105 ring-2 ring-green-500/30"
                  }`}
                >
                  {step > 1 ? (
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    "1"
                  )}
                </div>
                <div
                  className={`font-semibold ${
                    step === 1 ? "text-foreground" : "text-foreground/70"
                  }`}
                >
                  Personal Details
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (step === 2) setStep(2);
                }}
                disabled={step === 1}
                className={`flex items-center gap-1.5 sm:gap-2 transition-all duration-200 group ${
                  step === 1
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:opacity-80 cursor-pointer"
                }`}
              >
                <div
                  className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                    step === 2
                      ? "bg-gradient-to-br from-primary to-crimson-red text-primary-foreground shadow-lg scale-110 ring-2 ring-primary/30"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  2
                </div>
                <div
                  className={`font-semibold ${
                    step === 2 ? "text-foreground" : "text-foreground/70"
                  }`}
                >
                  Payment
                </div>
              </button>
            </div>
          </div>

          {/* Form Content */}
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="bg-card rounded-2xl shadow-xl p-8 border border-border"
              >
                {/* Tour Selection Section */}
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border/50">
                    <div className="p-4 bg-crimson-red rounded-full rounded-br-none">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-foreground">
                      Tour Selection
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[70%_30%] gap-4 items-start mb-6">
                    {/* Tour Name (Inherited - Read-only) */}
                    <div>
                      <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                        Tour name
                        <span className="text-muted-foreground text-xs font-normal">
                          (Inherited from main booker)
                        </span>
                      </label>
                      <div className="relative">
                        <div className="flex items-center gap-4 p-3 border-2 border-border rounded-xl bg-muted/50 cursor-not-allowed opacity-75 h-[70px]">
                          <div className="w-16 h-14 rounded-lg overflow-hidden flex-shrink-0">
                            {parentBooking?.tourImage ? (
                              <img
                                src={parentBooking.tourImage}
                                alt={parentBooking.tourName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                                <svg
                                  className="w-6 h-6 text-muted-foreground"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-foreground truncate">
                              {parentBooking?.tourName || "Loading..."}
                            </h4>
                          </div>
                          <svg
                            className="w-5 h-5 text-muted-foreground flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Tour Date (Inherited - Read-only) */}
                    {parentBooking?.tourDate && (
                      <div>
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                          Tour date
                          <span className="text-muted-foreground text-xs font-normal">
                            (Inherited)
                          </span>
                        </label>
                        <div className="px-4 py-3 rounded-lg border-2 border-border bg-muted/50 text-foreground cursor-not-allowed opacity-75 h-[70px] flex items-center justify-between">
                          <span>
                            {new Date(
                              typeof parentBooking.tourDate === "string"
                                ? parentBooking.tourDate
                                : parentBooking.tourDate.toDate(),
                            ).toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <svg
                            className="w-5 h-5 text-muted-foreground flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Personal Details Section */}
                <div>
                  <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border/50">
                    <div className="p-4 bg-crimson-red rounded-full rounded-br-none">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-foreground">
                      Your Personal Details
                    </h3>
                  </div>

                  <div className="space-y-6">
                    {/* Email and Birthdate - Same Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Email (Inherited - Read-only) */}
                      <div>
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                          Email Address
                          <span className="text-muted-foreground text-xs font-normal">
                            (From invitation)
                          </span>
                          {guestEmail && (
                            <svg
                              className="w-4 h-4 text-green-600"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type="email"
                            value={guestEmail || ""}
                            disabled
                            className="w-full px-4 py-3 pr-10 rounded-lg border-2 border-green-500 bg-muted/50 text-foreground cursor-not-allowed opacity-75"
                          />
                          <svg
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        </div>
                      </div>

                      {/* Birthdate */}
                      <div>
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                          Birthdate
                          <span className="text-destructive text-xs">*</span>
                        </label>
                        <BirthdatePicker
                          value={birthdate}
                          onChange={setBirthdate}
                        />
                        {submitted && errors.birthdate && (
                          <p className="text-destructive text-sm mt-1">
                            {errors.birthdate}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* First Name and Last Name - Same Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* First Name */}
                      <div>
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                          First Name
                          <span className="text-destructive text-xs">*</span>
                        </label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className={`w-full px-4 py-3 rounded-lg border-2 ${
                            submitted && errors.firstName
                              ? "border-destructive"
                              : "border-border"
                          } bg-background text-foreground focus:ring-2 focus:ring-primary transition-colors`}
                          placeholder="Enter your first name"
                        />
                        {submitted && errors.firstName && (
                          <p className="text-destructive text-sm mt-1">
                            {errors.firstName}
                          </p>
                        )}
                      </div>

                      {/* Last Name */}
                      <div>
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                          Last Name
                          <span className="text-destructive text-xs">*</span>
                        </label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className={`w-full px-4 py-3 rounded-lg border-2 ${
                            submitted && errors.lastName
                              ? "border-destructive"
                              : "border-border"
                          } bg-background text-foreground focus:ring-2 focus:ring-primary transition-colors`}
                          placeholder="Enter your last name"
                        />
                        {submitted && errors.lastName && (
                          <p className="text-destructive text-sm mt-1">
                            {errors.lastName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Nationality and Booking Type - Same Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Nationality */}
                      <div>
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                          Nationality
                          <span className="text-destructive text-xs">*</span>
                        </label>
                        <Select
                          value={nationality}
                          onChange={setNationality}
                          options={nationalityOptions}
                          placeholder="Select your nationality"
                        />
                        {submitted && errors.nationality && (
                          <p className="text-destructive text-sm mt-1">
                            {errors.nationality}
                          </p>
                        )}
                      </div>

                      {/* Booking Type (Inherited - Read-only) */}
                      <div>
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                          Booking Type
                          <span className="text-muted-foreground text-xs font-normal">
                            (Inherited)
                          </span>
                          {parentBooking?.bookingType && (
                            <svg
                              className="w-4 h-4 text-green-600"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={parentBooking?.bookingType || "Loading..."}
                            disabled
                            className={`w-full px-4 py-3 pr-10 rounded-lg border-2 ${
                              parentBooking?.bookingType
                                ? "border-green-500"
                                : "border-border"
                            } bg-muted/50 text-foreground cursor-not-allowed opacity-75`}
                          />
                          <svg
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={handleProceedToPayment}
                    disabled={isSubmitting}
                    className="px-8 py-3 bg-gradient-to-r from-primary to-crimson-red text-white rounded-lg hover:opacity-90 transition-all font-semibold flex items-center space-x-2 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>Proceed to Payment</span>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="bg-card rounded-2xl shadow-xl p-8 border border-border"
              >
                <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border/50">
                  <div className="p-4 bg-spring-green/10 rounded-full rounded-br-none">
                    <svg
                      className="w-5 h-5 text-spring-green"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">
                      Complete Your Payment
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Secure your spot with the reservation fee
                    </p>
                  </div>
                </div>

                {/* Payment Summary */}
                <div className="mb-8 bg-muted/10 border-2 border-border rounded-lg p-6">
                  <h3 className="font-semibold text-foreground mb-4">
                    Booking Summary
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tour:</span>
                      <span className="font-medium text-foreground">
                        {parentBooking?.tourName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Travel Date:
                      </span>
                      <span className="font-medium text-foreground">
                        {parentBooking?.tourDate &&
                          new Date(
                            typeof parentBooking.tourDate === "string"
                              ? parentBooking.tourDate
                              : parentBooking.tourDate.toDate(),
                          ).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Payment Plan:
                      </span>
                      <span className="font-medium text-foreground">
                        {parentBooking?.paymentPlan
                          ? `${parentBooking.paymentPlan} - ${
                              parentBooking.paymentPlan === "P1"
                                ? "Full Payment"
                                : parentBooking.paymentPlan === "P2"
                                  ? "2 Installments"
                                  : parentBooking.paymentPlan === "P3"
                                    ? "3 Installments"
                                    : parentBooking.paymentPlan === "P4"
                                      ? "4 Installments"
                                      : "Standard"
                            }`
                          : "Not selected yet"}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border/50">
                      <span className="text-muted-foreground">
                        Reservation Fee:
                      </span>
                      <span className="font-bold text-lg text-crimson-red">
                        £{depositAmount?.toFixed(2) || "0.00"}
                      </span>
                    </div>
                  </div>

                  {!parentBooking?.paymentPlan ? (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mt-4">
                      <p className="text-sm text-foreground">
                        <span className="inline-block mr-1">ℹ️</span>
                        The main booker hasn't selected a payment plan yet.
                        You'll follow the same payment plan once they complete
                        their booking.
                      </p>
                    </div>
                  ) : (
                    parentBooking.paymentPlan !== "P1" && (
                      <p className="text-sm text-muted-foreground mt-4">
                        <span className="inline-block mr-1">ℹ️</span>
                        You'll follow the same payment plan as the main booker.
                        Remaining payments will be due on the same schedule.
                      </p>
                    )
                  )}
                </div>

                {/* Stripe Payment Component */}
                {isCreatingBooking ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                    <p className="text-muted-foreground">
                      Creating your booking...
                    </p>
                  </div>
                ) : !paymentDocId ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                    <p className="text-muted-foreground">
                      Preparing payment...
                    </p>
                  </div>
                ) : (
                  <>
                    <StripePayment
                      tourPackageId={parentBooking?.tourPackageId || ""}
                      tourPackageName={parentBooking?.tourName || ""}
                      email={guestEmail || ""}
                      amountGBP={depositAmount || 0}
                      onPaymentSuccess={handlePaymentSuccess}
                      onPaymentDocIdCreated={setPaymentDocId}
                      onBack={handleBackToDetails}
                      isGuestBooking={true}
                      parentBookingId={parentBookingId!}
                      guestEmail={guestEmail!}
                      paymentDocId={paymentDocId}
                      guestData={{
                        firstName,
                        lastName,
                        birthdate,
                        nationality,
                        phoneNumber,
                        dietaryRestrictions,
                      }}
                    />

                    {/* Back to Details Button */}
                    <div className="mt-6 flex justify-start">
                      <button
                        onClick={handleBackToDetails}
                        className="px-6 py-3 border-2 border-border text-foreground rounded-lg hover:bg-muted/50 transition-colors font-semibold flex items-center gap-2"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                        Back to Personal Details
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <GuestReservationPage />
    </Suspense>
  );
}
