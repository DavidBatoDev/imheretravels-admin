"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Public unsubscribe confirmation page for marketing/follow-up emails.
 *
 * Button-first by design: the emailed link lands here without side effects
 * (so link prefetching can't unsubscribe anyone) and the contact is only
 * flipped when the reader confirms.
 */
function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const alreadyDone = searchParams.get("done") === "1";

  const [state, setState] = useState<
    "idle" | "submitting" | "done" | "error"
  >(alreadyDone ? "done" : "idle");

  const handleUnsubscribe = async () => {
    setState("submitting");
    try {
      const response = await fetch("/api/marketing/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(response.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-gray-800 mb-3">
          ImHereTravels
        </h1>

        {state === "done" ? (
          <>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              You&apos;ve been unsubscribed
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              You won&apos;t receive any more marketing or follow-up emails
              from us.
            </p>
            <p className="text-sm text-gray-600">
              Changed your mind? Email us at{" "}
              <a
                href="mailto:bella@imheretravels.com"
                className="text-red-500 hover:underline"
              >
                bella@imheretravels.com
              </a>{" "}
              and we&apos;ll add you back.
            </p>
          </>
        ) : !token ? (
          <>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Invalid unsubscribe link
            </h2>
            <p className="text-sm text-gray-600">
              This link is missing or incomplete. Please use the unsubscribe
              link from one of our emails, or contact{" "}
              <a
                href="mailto:bella@imheretravels.com"
                className="text-red-500 hover:underline"
              >
                bella@imheretravels.com
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Unsubscribe from our emails?
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              You&apos;ll stop receiving booking follow-ups, offers and tour
              updates from ImHereTravels.
            </p>
            {state === "error" && (
              <p className="text-sm text-red-500 mb-4">
                Something went wrong — please try again.
              </p>
            )}
            <button
              onClick={handleUnsubscribe}
              disabled={state === "submitting"}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-full transition-colors"
            >
              {state === "submitting" ? "Unsubscribing…" : "Confirm unsubscribe"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeContent />
    </Suspense>
  );
}
