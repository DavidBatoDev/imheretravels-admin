// StripePayment.tsx - Updated version
"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useTheme } from "next-themes";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

/** Shortest time the "Payment successful" modal stays up, so it can be read. */
const SUCCESS_MODAL_MIN_MS = 1500;

interface PaymentFormProps {
  clientSecret: string;
  paymentDocId: string | null;
  onSuccess?: (
    paymentIntentId?: string,
    paymentDocId?: string,
  ) => void | Promise<void>;
  onPaymentSuccess?: (paymentDocId: string) => void | Promise<void>;
  onError: (error: string) => void;
  onProcessingChange?: (processing: boolean) => void;
  isGuestBooking?: boolean;
  /** Runs before confirming; false aborts (e.g. a sale hold that ended). */
  onBeforeConfirm?: () => Promise<boolean>;
}

function PaymentForm({
  clientSecret,
  paymentDocId,
  onSuccess,
  onPaymentSuccess,
  onError,
  onProcessingChange,
  isGuestBooking = false,
  onBeforeConfirm,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [declineCode, setDeclineCode] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalStatus, setModalStatus] = useState<
    "processing" | "success" | "error" | "3ds" | "verifying"
  >("processing");
  const [modalMessage, setModalMessage] = useState("");
  const [modalDetail, setModalDetail] = useState("");
  const [mounted, setMounted] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [modalMinimized, setModalMinimized] = useState(false);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<string | null>(
    null,
  );
  const minimizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorMessageRef = useRef<HTMLDivElement | null>(null);
  const [modalTransform, setModalTransform] = useState<string>("");
  const popupWindowRef = useRef<Window | null>(null);
  const isPaymentSucceeded =
    modalStatus === "success" || (!!message && message.includes("succeeded"));

  // Saving the booking can take a while after Stripe succeeds (on production it
  // waits for the webhook), so the modal stays up until that has finished.
  const finishPayment = async (paymentIntentId: string) => {
    try {
      await Promise.all([
        new Promise((resolve) => setTimeout(resolve, SUCCESS_MODAL_MIN_MS)),
        isGuestBooking && onPaymentSuccess && paymentDocId
          ? onPaymentSuccess(paymentDocId)
          : onSuccess?.(paymentIntentId, paymentDocId || undefined),
      ]);
    } finally {
      // Close helper popup if open
      try {
        popupWindowRef.current?.close();
      } catch {}
      setIsProcessing(false);
      onProcessingChange?.(false);
      setShowModal(false);
    }
  };

  const openRedirectPopup = () => {
    try {
      const popup = window.open(
        "",
        "paymentVerification",
        "width=420,height=580,noopener,noreferrer",
      );
      if (popup) {
        popup.document.open();
        popup.document
          .write(`<!doctype html><html><head><meta charset="utf-8" />
          <title>Verifying Payment</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', Arial, sans-serif; margin:0; padding:24px; background:#0b0b0f; color:#e6e6e6; }
            .card { max-width: 360px; margin: 0 auto; background:#15151c; border:1px solid #2a2a33; border-radius:12px; padding:20px; box-shadow: 0 10px 25px rgba(0,0,0,0.35); }
            .title { font-weight:600; font-size:18px; margin-bottom:8px; }
            .desc { font-size:14px; opacity:0.8; }
            .spinner { width:44px; height:44px; border:4px solid #e6e6e61a; border-top-color:#ff4d4f; border-radius:50%; animation: spin 1s linear infinite; margin:16px auto; }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head><body>
          <div class="card">
            <div class="title">Revolut Pay verification</div>
            <div class="desc">A secure verification page has opened. Complete it to continue your payment.<br/><br/>This window will close automatically once you return.</div>
            <div class="spinner"></div>
          </div>
        </body></html>`);
        popup.document.close();
      }
      popupWindowRef.current = popup;
    } catch (e) {
      console.warn("Unable to open verification popup:", e);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Countdown timer effect for error modal
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Clear minimization timeout when modal is reopened
  useEffect(() => {
    if (!modalMinimized && minimizeTimeoutRef.current) {
      clearTimeout(minimizeTimeoutRef.current);
      minimizeTimeoutRef.current = null;
      setCountdown(0); // Reset countdown display
      setModalTransform(""); // Reset transform
    } else if (modalMinimized && errorMessageRef.current) {
      // Calculate transform to animate modal into error message position
      const errorRect = errorMessageRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Center of viewport (where modal is currently)
      const modalCenterX = viewportWidth / 2;
      const modalCenterY = viewportHeight / 2;

      // Center of error message
      const errorCenterX = errorRect.left + errorRect.width / 2;
      const errorCenterY = errorRect.top + errorRect.height / 2;

      // Calculate translation
      const translateX = errorCenterX - modalCenterX;
      const translateY = errorCenterY - modalCenterY;

      // Calculate scale (error message is much smaller than modal)
      const scaleX = errorRect.width / 384; // 384px is max-w-md (28rem)
      const scaleY = errorRect.height / 200; // Approximate modal height
      const scale = Math.min(scaleX, scaleY, 0.15); // Cap scale for smooth animation

      setModalTransform(
        `translate(${translateX}px, ${translateY}px) scale(${scale})`,
      );
    }
  }, [modalMinimized]);

  useEffect(() => {
    if (!stripe || !clientSecret) return;

    // Check payment status on mount (in case of page refresh or redirect return)
    // NOTE: We only check status for display purposes, not to trigger callbacks
    (async () => {
      try {
        const result = await stripe.retrievePaymentIntent(clientSecret);
        const { paymentIntent } = result as any;
        console.debug("Stripe retrievePaymentIntent:", paymentIntent);
        if (!paymentIntent) return;

        // Only show verifying modal if payment is in an active/completed state
        // This indicates a redirect return (e.g., Revolut Pay), not initial load
        const activeStatuses = [
          "succeeded",
          "processing",
          "requires_action",
          "requires_confirmation",
          "requires_capture",
        ];
        const isActivePayment = activeStatuses.includes(paymentIntent.status);

        if (!isActivePayment) {
          // Initial state, don't show modal - user is just viewing the payment form
          return;
        }

        // Show loading modal for active payment states (redirect returns)
        setShowModal(true);
        setModalStatus("verifying");
        setModalMessage("Verifying your payment");
        setModalDetail("Please wait while we confirm your payment status...");
        setIsProcessing(true);

        // Only show status messages, don't trigger success callbacks on refresh
        if (paymentIntent.status === "succeeded") {
          // Payment already completed - show success modal and trigger callbacks
          // This handles returns from redirect-based payments (Revolut Pay, 3DS, etc)
          console.log("✅ Payment succeeded on return from redirect:", {
            paymentIntentId: paymentIntent.id,
            isGuestBooking,
            hasOnPaymentSuccess: !!onPaymentSuccess,
            hasPaymentDocId: !!paymentDocId,
            hasOnSuccess: !!onSuccess,
          });

          setMessage("Payment succeeded!");
          setPaymentFailed(false);

          // Show success modal
          setShowModal(true);
          setModalMinimized(false);
          setModalStatus("success");
          setModalMessage("Payment successful!");
          setModalDetail(
            "Your reservation fee has been processed. Securing your spot...",
          );

          void finishPayment(paymentIntent.id);

          return;
        }

        if (paymentIntent.status === "processing") {
          setMessage("Your payment is processing.");
          setModalStatus("verifying");
          setModalMessage("Payment processing");
          setModalDetail("Your payment is being processed. Please wait...");
          setIsProcessing(false);
          return;
        }

        if (paymentIntent.status === "requires_payment_method") {
          setIsProcessing(false);
          if (paymentIntent.last_payment_error) {
            const errorMsg = getErrorMessage(paymentIntent.last_payment_error);
            setMessage(errorMsg);
            setPaymentFailed(true);
            setDeclineCode(
              paymentIntent.last_payment_error.decline_code || null,
            );

            // Show error modal for redirect-based payment methods (Revolut Pay, etc)
            setShowModal(true);
            setModalMinimized(false);
            setModalStatus("error");
            setModalMessage("Payment failed");
            setModalDetail(errorMsg);
            setCountdown(4);

            // Auto-hide modal after 4 seconds
            minimizeTimeoutRef.current = setTimeout(() => {
              setModalMinimized(true);
            }, 4000);
            // Close helper popup if open
            try {
              popupWindowRef.current?.close();
            } catch {}
          } else {
            // No error but requires payment method - hide modal
            setShowModal(false);
          }
          return;
        }

        if (paymentIntent.status === "requires_action") {
          setIsProcessing(false);
          // Show 3DS-style modal for redirect payments (e.g., Revolut Pay)
          setShowModal(true);
          setModalMinimized(false);
          setModalStatus("3ds");
          setModalMessage("Additional verification needed");
          setModalDetail(
            "Please complete the verification in the opened page to continue.",
          );
          // Close helper popup if open (we are already back)
          try {
            popupWindowRef.current?.close();
          } catch {}
          return;
        }

        // For any other status, clear stale UI state and hide modal
        setMessage(null);
        setPaymentFailed(false);
        setShowModal(false);
        setIsProcessing(false);
        setDeclineCode(null);
      } catch (err) {
        console.warn("retrievePaymentIntent error:", err);
      }
    })();
  }, [stripe, clientSecret]);

  const getErrorMessage = (error: any) => {
    // Handle empty or null errors
    if (!error) {
      return "Payment failed. Please try again with a different payment method.";
    }

    const code = error.decline_code || error.code;

    switch (code) {
      case "card_declined":
      case "generic_decline":
        return "Your card was declined. Please try a different payment method.";
      case "insufficient_funds":
        return "Insufficient funds. Please try a different payment method.";
      case "fraudulent":
        return "This transaction has been flagged as potentially fraudulent. Please contact your bank or try a different payment method.";
      case "lost_card":
      case "stolen_card":
        return "This card has been reported as lost or stolen. Please use a different payment method.";
      case "expired_card":
        return "Your card has expired. Please use a different card.";
      case "incorrect_cvc":
        return "Incorrect security code. Please check and try again.";
      case "processing_error":
        return "A processing error occurred. Please try again.";
      case "incorrect_number":
        return "Incorrect card number. Please check and try again.";
      case "revolut_pay_authentication_failed":
        return "Revolut Pay authentication failed. Please try again or use another payment method.";
      case "revolut_pay_not_available":
        return "Revolut Pay is not available. Please use another payment method.";
      default:
        return (
          error.message ||
          "Payment failed. Please try again with a different payment method."
        );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    onProcessingChange?.(true);
    setMessage(null);
    setPaymentFailed(false);
    setDeclineCode(null);

    // Show modal with processing state
    setShowModal(true);
    setModalMinimized(false);
    setModalStatus("processing");
    setModalMessage("Processing your payment...");
    setModalDetail("Please wait while we securely process your transaction.");

    if (onBeforeConfirm && !(await onBeforeConfirm())) {
      setIsProcessing(false);
      onProcessingChange?.(false);
      setShowModal(false);
      return;
    }

    // Get return URL for Revolut Pay and other redirect-based payment methods
    const returnUrl = `${window.location.origin}${window.location.pathname}`;

    // If Revolut Pay is selected, show a verifying popup before redirect
    if (selectedPaymentType === "revolut_pay") {
      setModalStatus("3ds");
      setModalMessage("Revolut Pay verification");
      setModalDetail(
        "Complete the Revolut Pay authentication in the opened page to continue.",
      );
    }
    // Note: We do not open a separate popup here; we'll open the Stripe redirect
    // in a new browser tab after client-side confirmation indicates a redirect is required.

    // Otherwise, use Elements client-side confirmation
    const redirectBehavior =
      selectedPaymentType === "revolut_pay" ? "always" : "if_required";

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: redirectBehavior as any,
      confirmParams: {
        return_url: returnUrl,
      },
    });

    // With redirect: 'always', Stripe redirects the page so this code may not execute
    // If we get an empty error object, it typically means:
    // - For Revolut Pay: redirect is in progress
    // - For Card: form validation failed (Stripe shows inline errors)
    // - For 3DS2: user cancelled or authentication failed (Stripe handles the UI)
    if (error) {
      // Check if this is a meaningful error with actual content
      const hasMessage =
        error.message &&
        typeof error.message === "string" &&
        error.message.trim().length > 0;
      const hasCode =
        error.code &&
        typeof error.code === "string" &&
        error.code.trim().length > 0;
      const hasDeclineCode =
        error.decline_code &&
        typeof error.decline_code === "string" &&
        error.decline_code.trim().length > 0;
      const isValidationError = error.type === "validation_error";

      // If there's no actual error details, it's likely a validation or 3DS cancellation
      // that Stripe Elements is already handling in its UI
      if (!hasMessage && !hasCode && !hasDeclineCode) {
        console.log("Stripe handling error in UI - no action needed");
        setIsProcessing(false);
        onProcessingChange?.(false);
        setShowModal(false);
        return;
      }

      // If it's just a validation error with inline messaging, let Stripe handle it
      if (isValidationError && !hasMessage) {
        console.log(
          "Stripe validation error - inline validation will handle this",
        );
        setIsProcessing(false);
        onProcessingChange?.(false);
        setShowModal(false);
        return;
      }

      // Log actual errors with meaningful details
      // console.error("Payment error:", error.message || error.code || "Unknown error");

      const errorMsg = getErrorMessage(error);
      setMessage(errorMsg);
      setPaymentFailed(true);
      setDeclineCode(error.decline_code || error.code || null);

      // Update modal with error state
      setModalStatus("error");
      setModalMessage("Payment failed");
      setModalDetail(errorMsg);
      setCountdown(4);

      // Auto-hide modal after 4 seconds (user can click message to re-open)
      minimizeTimeoutRef.current = setTimeout(() => {
        setModalMinimized(true);
      }, 4000);
      // Close helper popup if open
      try {
        popupWindowRef.current?.close();
      } catch {}

      onError(errorMsg);

      setIsProcessing(false);
      onProcessingChange?.(false);
    } else if (paymentIntent) {
      // If Revolut Pay and redirect is required, open Stripe page in a new tab
      if (
        selectedPaymentType === "revolut_pay" &&
        paymentIntent.status === "requires_action" &&
        (paymentIntent as any)?.next_action?.redirect_to_url?.url
      ) {
        const url = (paymentIntent as any).next_action.redirect_to_url.url;
        try {
          window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          // Fallback: navigate current window if tab opening blocked
          window.location.href = url;
        }

        // Show local modal while verification runs externally
        setModalStatus("3ds");
        setModalMessage("Revolut Pay verification");
        setModalDetail(
          "Complete the verification in the new tab, then return here.",
        );
        setIsProcessing(false);
        onProcessingChange?.(false);
        return;
      }
      // Handle all possible payment intent statuses
      switch (paymentIntent.status) {
        case "succeeded":
          setMessage("Payment succeeded!");
          setPaymentFailed(false);

          // Update modal with success state
          setModalStatus("success");
          setModalMessage("Payment successful!");
          setModalDetail(
            "Your reservation fee has been processed. Securing your spot...",
          );

          void finishPayment(paymentIntent.id);
          break;

        case "processing":
          // Payment is being processed asynchronously - keep user waiting
          const processingMsg =
            "Your payment is being processed. This may take a few moments...";
          setMessage(processingMsg);
          setPaymentFailed(false);

          // Update modal with verifying state
          setModalStatus("verifying");
          setModalMessage("Payment received");
          setModalDetail(
            "We're verifying your payment with your bank. This may take a few moments...",
          );

          // Don't call onError for processing state - it's not an error
          // Keep processing indicator active
          break;

        case "requires_payment_method":
          const requiresPaymentMsg =
            "Payment failed. Please try a different payment method.";
          setMessage(requiresPaymentMsg);
          setPaymentFailed(true);

          // Update modal with error state
          setModalStatus("error");
          setModalMessage("Payment declined");
          setModalDetail(requiresPaymentMsg);
          setCountdown(4);

          // Auto-hide modal after 4 seconds (user can click message to re-open)
          minimizeTimeoutRef.current = setTimeout(() => {
            setModalMinimized(true);
          }, 4000);

          onError(requiresPaymentMsg);

          setIsProcessing(false);
          onProcessingChange?.(false);
          break;

        case "requires_action":
          // Additional authentication needed (e.g., 3D Secure)
          const requiresActionMsg =
            "Additional verification required. Please complete the authentication.";
          setMessage(requiresActionMsg);
          setPaymentFailed(false);

          // Update modal with 3DS state
          setModalStatus("3ds");
          setModalMessage("Additional verification needed");
          setModalDetail(
            "Please complete the authentication in the popup window to proceed.",
          );

          // Don't call onError - this is a pending state that needs user action
          setIsProcessing(false);
          onProcessingChange?.(false);
          break;

        case "requires_confirmation":
          // Payment requires confirmation - keep processing
          const confirmationMsg =
            "Payment requires confirmation. Please complete the next step.";
          setMessage(confirmationMsg);
          setPaymentFailed(false);
          setModalStatus("processing");
          setModalMessage("Confirming payment");
          setModalDetail(
            "We're confirming your payment. This may take a few moments...",
          );
          // Don't close modal or call onError - this is a pending state
          break;

        case "requires_capture":
          // Payment was authorized but not captured - wait for settlement
          const captureMsg =
            "Your payment has been authorized and will be captured shortly.";
          setMessage(captureMsg);
          setPaymentFailed(false);
          setModalStatus("verifying");
          setModalMessage("Payment authorized");
          setModalDetail(
            "Your payment is being processed. This may take a few moments...",
          );
          setIsProcessing(false);
          onProcessingChange?.(false);
          break;

        case "canceled":
          // User or system canceled the payment
          const canceledMsg = "Payment was canceled. Please try again.";
          setMessage(canceledMsg);
          setPaymentFailed(true);
          setModalStatus("error");
          setModalMessage("Payment canceled");
          setModalDetail(canceledMsg);

          // Auto-close modal after 4 seconds
          setTimeout(() => {
            setShowModal(false);
            setMessage(null);
            onError(canceledMsg);
          }, 4000);

          setIsProcessing(false);
          onProcessingChange?.(false);
          break;

        default:
          const defaultMsg = `Payment incomplete (status: ${paymentIntent.status}). Please try again.`;
          setMessage(defaultMsg);
          setPaymentFailed(true);

          // Update modal with error state
          setModalStatus("error");
          setModalMessage("Payment incomplete");
          setModalDetail(defaultMsg);
          setCountdown(4);

          // Auto-hide modal after 4 seconds (user can click message to re-open)
          setTimeout(() => {
            setShowModal(false);
          }, 4000);

          onError(defaultMsg);

          setIsProcessing(false);
          onProcessingChange?.(false);
          break;
      }
    } else {
      // No error and no paymentIntent - something went wrong
      const unknownMsg =
        "Payment status unknown. Please verify your payment before continuing.";
      setMessage(unknownMsg);
      setPaymentFailed(true);

      // Update modal with error state
      setModalStatus("error");
      setModalMessage("Unknown error");
      setModalDetail(unknownMsg);
      setCountdown(4);

      // Auto-hide modal after 4 seconds (user can click message to re-open)
      setTimeout(() => {
        setModalMinimized(true);
      }, 4000);

      onError(unknownMsg);

      setIsProcessing(false);
      onProcessingChange?.(false);
    }
  };

  // Modal icon and color based on status
  const getModalIcon = () => {
    switch (modalStatus) {
      case "success":
        return (
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-500 mx-auto mb-4 animate-scale-in">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-500 mx-auto mb-4">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        );
      case "3ds":
        return (
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-blue-500 mx-auto mb-4">
            <svg
              className="h-8 w-8 text-white"
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
        );
      case "verifying":
        return (
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-yellow-500 mx-auto mb-4">
            <svg
              className="h-8 w-8 text-white animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        );
      case "processing":
      default:
        return (
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary mx-auto mb-4">
            <svg
              className="h-8 w-8 text-white animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        );
    }
  };

  return (
    <>
      {/* Payment Modal - Rendered via Portal to ensure proper positioning */}
      {showModal &&
        mounted &&
        createPortal(
          <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-700 ${
              modalMinimized ? "pointer-events-none" : "bg-black/70"
            } ${modalMinimized ? "animate-fade-out" : "animate-fade-in"}`}
          >
            <div
              className={`bg-card rounded-2xl shadow-2xl max-w-md w-full p-8 border border-border transition-all duration-700 origin-center ${
                !modalMinimized ? "animate-slide-up" : ""
              }`}
              style={{
                opacity: modalMinimized ? 0 : 1,
                transform: modalMinimized ? modalTransform : "scale(1)",
              }}
            >
              {getModalIcon()}
              <h3 className="text-2xl font-bold text-center text-foreground mb-2">
                {modalMessage}
              </h3>
              <p className="text-center text-muted-foreground mb-6">
                {modalDetail}
              </p>

              {(modalStatus === "processing" ||
                modalStatus === "success") && (
                <div className="flex items-center justify-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  ></div>
                  <div
                    className="h-2 w-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  ></div>
                  <div
                    className="h-2 w-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: "500ms" }}
                  ></div>
                </div>
              )}

              {(modalStatus === "error" || modalStatus === "3ds") && (
                <div className="w-full mt-4 space-y-2">
                  {countdown > 0 && modalStatus === "error" && (
                    <p className="text-xs text-muted-foreground text-center">
                      Closing in {countdown}s...
                    </p>
                  )}
                  <button
                    onClick={() => setModalMinimized(true)}
                    className="w-full px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <PaymentElement
          options={{
            layout: "tabs" as const,
            paymentMethodOrder: ["card", "apple_pay", "google_pay"],
          }}
          onChange={(event: any) => {
            try {
              const type = event?.value?.type ?? null;
              setSelectedPaymentType(type);
            } catch {}
          }}
          onLoadError={(error) => {
            // Ignore empty error objects (can occur on return from redirects like Revolut Pay)
            if (!error || Object.keys(error).length === 0) {
              console.warn(
                "Payment Element empty load error (likely redirect return), ignoring",
              );
              return;
            }

            // Only show error if payment hasn't already succeeded
            if (modalStatus !== "success") {
              // console.error("Payment Element load error:", error);
              setMessage(
                "Unable to load payment form. Please refresh the page and try again.",
              );
              onError("Payment form failed to load");
            }
          }}
        />

        <button
          type="submit"
          disabled={
            !stripe ||
            isProcessing ||
            message ===
              "Payment completed (pending verification). Please wait..." ||
            isPaymentSucceeded
          }
          className={`w-full px-6 py-3 rounded-md font-medium transition ${
            !stripe ||
            isProcessing ||
            message ===
              "Payment completed (pending verification). Please wait..." ||
            isPaymentSucceeded
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-crimson-red text-white hover:brightness-95"
          }`}
        >
          {isPaymentSucceeded
            ? "Redirecting...."
            : isProcessing
              ? "Processing..."
              : paymentFailed
                ? "Try again"
                : "Pay now"}
        </button>

        {message &&
          (!showModal || (showModal && modalMinimized)) &&
          (paymentFailed || modalStatus === "success") && (
            <div
              ref={errorMessageRef}
              onClick={() => {
                if (paymentFailed) {
                  setErrorExpanded(!errorExpanded);
                  setModalMinimized(false);
                }
              }}
              className={`text-sm p-3 rounded transition-all duration-500 ease-out overflow-hidden ${
                message.includes("succeeded")
                  ? "bg-spring-green/10 text-spring-green border border-spring-green/30"
                  : paymentFailed
                    ? "bg-destructive/10 text-destructive border border-destructive/30 cursor-pointer hover:bg-destructive/20 hover:shadow-lg"
                    : "bg-destructive/10 text-destructive border border-destructive/30"
              } ${
                modalMinimized && paymentFailed
                  ? "animate-slide-down opacity-100"
                  : ""
              }`}
              style={{
                animation:
                  modalMinimized && paymentFailed
                    ? "slideDown 0.5s ease-out forwards"
                    : undefined,
                maxHeight: errorExpanded ? "500px" : "80px",
              }}
            >
              <div className="flex items-start gap-2">
                {!message.includes("succeeded") && (
                  <svg
                    className="h-5 w-5 flex-shrink-0 mt-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <div className="flex-1">
                  <p className="font-medium">{message}</p>
                  {paymentFailed && declineCode === "fraudulent" && (
                    <p className="text-xs mt-1 opacity-90">
                      For your security, this transaction has been blocked.
                      Please contact your bank for more information or use a
                      different payment method.
                    </p>
                  )}
                  {paymentFailed && (
                    <p className="text-xs mt-2 opacity-70">
                      Click to view details and retry
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
      </form>
    </>
  );
}

interface StripePaymentProps {
  tourPackageId?: string;
  tourPackageName?: string;
  email?: string;
  amountGBP?: number;
  bookingId?: string;
  paymentDocId?: string | null;
  onSuccess?: (
    paymentIntentId?: string,
    paymentDocId?: string,
  ) => void | Promise<void>;
  onPaymentSuccess?: (paymentDocId: string) => void | Promise<void>;
  onPaymentDocIdCreated?: (paymentDocId: string) => void;
  onBack?: () => void;
  onError?: (message: string) => void;
  onProcessingChange?: (processing: boolean) => void;
  bookingType?: string;
  numberOfGuests?: number;
  /** Black Friday hold link param `<holdId>.<token>`; the server prices the fee from it. */
  saleHold?: string | null;
  onBeforeConfirm?: () => Promise<boolean>;

  // Guest booking specific props
  isGuestBooking?: boolean;
  parentBookingId?: string;
  guestEmail?: string;
  guestData?: {
    firstName: string;
    lastName: string;
    birthdate: string;
    nationality: string;
    phoneNumber: string;
    dietaryRestrictions?: string;
  };
}

export default function StripePayment({
  tourPackageId,
  tourPackageName,
  email,
  amountGBP,
  bookingId,
  paymentDocId: paymentDocIdProp,
  onSuccess,
  onPaymentSuccess,
  onError,
  onPaymentDocIdCreated,
  onBack,
  onProcessingChange,
  bookingType,
  numberOfGuests,
  saleHold,
  onBeforeConfirm,
  isGuestBooking = false,
  parentBookingId,
  guestEmail,
  guestData,
}: StripePaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentDocId, setPaymentDocId] = useState<string | null>(
    paymentDocIdProp ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const initializingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (paymentDocIdProp) setPaymentDocId(paymentDocIdProp);
  }, [paymentDocIdProp]);

  // Generate a consistent session key
  const getSessionKey = () => {
    if (isGuestBooking && parentBookingId && guestEmail) {
      return `stripe_payment_guest_${parentBookingId}_${guestEmail}`;
    }
    if (paymentDocId) {
      const holdPart = saleHold ? `_${saleHold.split(".")[0]}` : "";
      return `stripe_payment_${email}_${tourPackageId}_${paymentDocId}${holdPart}`;
    }
    return `stripe_payment_${email}_${tourPackageId}`;
  };

  const initializePayment = async () => {
    // Prevent concurrent initialization (React Strict Mode runs effects twice)
    if (initializingRef.current) {
      console.log("⏭️ Payment initialization already in progress, skipping...");
      return;
    }

    initializingRef.current = true;
    setLoading(true);
    setError(null);

    const sessionKey = getSessionKey();

    // Check if we already have a valid payment session
    const existingSession = sessionStorage.getItem(sessionKey);
    if (existingSession) {
      try {
        const { clientSecret: savedSecret, paymentDocId: savedDocId } =
          JSON.parse(existingSession);

        // Verify the client secret is still valid and not in terminal state
        if (savedSecret && savedSecret.startsWith("pi_")) {
          console.log("🔍 Checking existing payment session status for", email);

          // Extract payment intent ID from client secret
          const paymentIntentId = savedSecret.split("_secret_")[0];

          try {
            // Verify the payment intent status
            const verifyRes = await fetch(
              `/api/stripe-payments/verify-payment?paymentIntentId=${paymentIntentId}`,
              { method: "GET" },
            );

            if (verifyRes.ok) {
              const verifyData = await verifyRes.json();
              console.log("🔍 Payment intent status:", verifyData.status);

              // Only reuse if payment intent is in a non-terminal state
              if (
                verifyData.status === "requires_payment_method" ||
                verifyData.status === "requires_confirmation" ||
                verifyData.status === "requires_action"
              ) {
                console.log("♻️ Reusing existing payment session for", email);
                setClientSecret(savedSecret);
                setPaymentDocId(savedDocId);
                setLoading(false);
                initializingRef.current = false;
                return;
              } else if (verifyData.status === "succeeded") {
                // Payment already succeeded - reuse the session and let mount check handle success flow
                console.log("✅ Reusing succeeded payment session for", email);
                setClientSecret(savedSecret);
                setPaymentDocId(savedDocId);
                setLoading(false);
                initializingRef.current = false;
                return;
              } else {
                console.log(
                  "❌ Payment intent in terminal state:",
                  verifyData.status,
                  "- creating new session",
                );
                sessionStorage.removeItem(sessionKey);
              }
            } else {
              console.warn(
                "Failed to verify payment intent, creating new session",
              );
              sessionStorage.removeItem(sessionKey);
            }
          } catch (verifyErr) {
            console.warn(
              "Error verifying payment intent, creating new session:",
              verifyErr,
            );
            sessionStorage.removeItem(sessionKey);
          }
        } else {
          console.warn("Invalid client secret in session storage");
          sessionStorage.removeItem(sessionKey);
        }
      } catch (e) {
        console.warn("Failed to parse existing session, creating new one");
        sessionStorage.removeItem(sessionKey);
      }
    }

    console.log(
      "🆕 Creating new payment session for",
      isGuestBooking ? guestEmail : email,
    );

    // Prepare request body based on booking type
    const requestBody = isGuestBooking
      ? {
          email: guestEmail,
          tourPackage: tourPackageId,
          tourPackageName,
          amountGBP,
          paymentDocId,
          isGuestBooking: true,
          parentBookingId,
          guestData,
          meta: {
            source: "guest-reservation-form",
            retryAttempt: retryCount,
          },
        }
      : {
          email,
          tourPackage: tourPackageId,
          tourPackageName,
          amountGBP,
          paymentDocId,
          bookingType,
          numberOfGuests,
          ...(saleHold ? { saleHold } : {}),
          meta: {
            source: "reservation-form",
            retryAttempt: retryCount,
          },
        };

    fetch("/api/stripe-payments/init-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(
            errorData.error || `HTTP error! status: ${res.status}`,
          );
        }
        return res.json();
      })
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        } else {
          setClientSecret(data.clientSecret);
          setPaymentDocId(data.paymentDocId);

          // Notify parent component of the created payment doc ID
          if (onPaymentDocIdCreated && data.paymentDocId) {
            onPaymentDocIdCreated(data.paymentDocId);
          }

          // Save to session storage with consistent key
          sessionStorage.setItem(
            getSessionKey(),
            JSON.stringify({
              clientSecret: data.clientSecret,
              paymentDocId: data.paymentDocId,
            }),
          );

          setError(null);
          setLoading(false);
          initializingRef.current = false;
        }
      })
      .catch((err) => {
        console.error("Payment initialization error:", err);
        setError(err.message);
        setLoading(false);
        initializingRef.current = false;
      });
  };

  useEffect(() => {
    // Check if Stripe is configured
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      setError(
        "Stripe is not configured. Please add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to your .env.local file.",
      );
      setLoading(false);
      return;
    }

    // Only initialize if we have required data
    if (!email || !tourPackageId || !amountGBP || amountGBP <= 0) {
      console.warn("Payment initialization validation failed:", {
        email: email || "MISSING",
        tourPackageId: tourPackageId || "MISSING",
        amountGBP: amountGBP || "MISSING",
      });
      setError("Missing required payment information");
      setLoading(false);
      return;
    }

    initializePayment();
  }, [tourPackageId, email, amountGBP, paymentDocId, saleHold]);

  // Clean up session storage on unmount if payment is completed
  useEffect(() => {
    return () => {
      // Only clean up if we're moving away from payment step
      if (clientSecret) {
        const sessionKey = getSessionKey();
        try {
          sessionStorage.removeItem(sessionKey);
        } catch (e) {
          console.warn("Failed to clean up session storage:", e);
        }
      }
    };
  }, [clientSecret]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-sm text-muted-foreground">
          Loading payment form...
        </span>
      </div>
    );
  }

  if (error && !clientSecret) {
    return (
      <div className="space-y-3">
        <div className="bg-destructive/10 text-destructive border border-destructive/30 p-4 rounded-md">
          <div className="flex items-start gap-2">
            <svg
              className="h-5 w-5 flex-shrink-0 mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <p className="font-medium">Payment initialization failed</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setRetryCount(retryCount + 1);
            initializePayment();
          }}
          className="w-full px-6 py-3 rounded-md font-medium bg-crimson-red text-white hover:brightness-95 transition"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="bg-muted/10 text-muted-foreground border border-muted/30 p-4 rounded-md">
        <p>Unable to initialize payment. Please try again.</p>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="bg-destructive/10 text-destructive border border-destructive/30 p-4 rounded-md">
        <p className="font-medium">Stripe configuration error</p>
        <p className="text-sm mt-1">Please contact support.</p>
      </div>
    );
  }

  // Determine if dark mode is active
  const isDark = mounted && (resolvedTheme === "dark" || theme === "dark");

  const options = {
    clientSecret,
    appearance: {
      theme: (isDark ? "night" : "stripe") as "night" | "stripe",
      variables: {
        colorPrimary: "#FF385C",
        colorBackground: isDark ? "#2a2a2a" : "#ffffff",
        colorText: isDark ? "#f5f5f5" : "#1a1a1a",
        colorDanger: "#df1b41",
        fontFamily: "system-ui, sans-serif",
        borderRadius: "6px",
        colorTextSecondary: isDark ? "#b3b3b3" : "#6b7280",
        colorTextPlaceholder: isDark ? "#737373" : "#9ca3af",
      },
    },
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes scale-in {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-fade-out { animation: fade-out 0.5s ease-out; }
        .animate-slide-up { animation: slide-up 0.4s ease-out; }
        .animate-scale-in { animation: scale-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `,
        }}
      />
      <Elements stripe={stripePromise} options={options}>
        <PaymentForm
          clientSecret={clientSecret}
          paymentDocId={paymentDocId}
          onSuccess={onSuccess}
          onPaymentSuccess={onPaymentSuccess}
          onError={(err) => {
            setError(err);
            onError?.(err);
          }}
          onProcessingChange={onProcessingChange}
          isGuestBooking={isGuestBooking}
          onBeforeConfirm={onBeforeConfirm}
        />
      </Elements>
    </>
  );
}
