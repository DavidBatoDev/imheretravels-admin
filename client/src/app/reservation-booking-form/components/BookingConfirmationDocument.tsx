"use client";

import React from "react";

interface BookingConfirmationDocumentProps {
  bookingId: string;
  tourName: string;
  tourDate: string;
  email: string;
  firstName: string;
  lastName: string;
  paymentPlan: string;
  reservationFee: number;
  totalAmount: number;
  remainingBalance: number;
  paymentDate: string;
  currency?: string;
}

export default function BookingConfirmationDocument({
  bookingId,
  tourName,
  tourDate,
  email,
  firstName,
  lastName,
  paymentPlan,
  reservationFee,
  totalAmount,
  remainingBalance,
  paymentDate,
  currency = "GBP",
}: BookingConfirmationDocumentProps) {
  const currencySymbol = currency === "GBP" ? "£" : currency === "EUR" ? "£" : "$";

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#000",
        backgroundColor: "#fff",
        padding: "40px",
        lineHeight: "1.6",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      {/* Page 1: Booking Confirmation */}
      <div style={{ pageBreakAfter: "always", minHeight: "100vh", paddingBottom: "20px" }}>
        {/* Header with Logo */}
        <div
          style={{
            borderBottom: "2px solid #e5e7eb",
            paddingBottom: "24px",
            marginBottom: "32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ef3340" }}>
            ❤️ I&apos;m Here Travels
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "12px",
                color: "#666",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              Booking Confirmation
            </div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "#000",
                fontFamily: "monospace",
              }}
            >
              {bookingId}
            </div>
            <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
              {paymentDate}
            </div>
          </div>
        </div>

        {/* Confirmation Message */}
        <div
          style={{
            backgroundColor: "#f0fdf4",
            border: "2px solid #4ade80",
            borderRadius: "8px",
            padding: "32px",
            marginBottom: "32px",
          }}
        >
          <div style={{ display: "flex", gap: "16px" }}>
            <div style={{ flexShrink: 0, fontSize: "48px" }}>✅</div>
            <div>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: "bold",
                  marginBottom: "8px",
                  color: "#000",
                  margin: "0 0 8px 0",
                }}
              >
                Reservation Confirmed!
              </h1>
              <p style={{ fontSize: "16px", color: "#333", margin: "0" }}>
                You&apos;re all set for {tourName}
              </p>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              color: "#666",
              textTransform: "uppercase",
              marginBottom: "16px",
              paddingBottom: "8px",
              borderBottom: "1px solid #e5e7eb",
              margin: "0 0 16px 0",
            }}
          >
            Customer Information
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                Name
              </div>
              <div style={{ fontSize: "14px", fontWeight: "500", color: "#000" }}>
                {firstName} {lastName}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                Email
              </div>
              <div style={{ fontSize: "14px", fontWeight: "500", color: "#000" }}>
                {email}
              </div>
            </div>
          </div>
        </div>

        {/* Reservation Details */}
        <div style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              color: "#666",
              textTransform: "uppercase",
              marginBottom: "16px",
              paddingBottom: "8px",
              borderBottom: "1px solid #e5e7eb",
              margin: "0 0 16px 0",
            }}
          >
            Reservation Details
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: "12px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <span style={{ fontSize: "12px", color: "#666" }}>Reservation ID</span>
              <span
                style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  fontWeight: "bold",
                  color: "#000",
                }}
              >
                {bookingId}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: "12px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <span style={{ fontSize: "12px", color: "#666" }}>Tour Name</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#000" }}>
                {tourName}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: "12px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <span style={{ fontSize: "12px", color: "#666" }}>Tour Date</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#000" }}>
                {tourDate}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "#666" }}>Payment Plan</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#000" }}>
                {paymentPlan}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div
          style={{
            backgroundColor: "#f3f4f6",
            borderRadius: "8px",
            padding: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              color: "#000",
              textTransform: "uppercase",
              marginBottom: "16px",
              margin: "0 0 16px 0",
            }}
          >
            Payment Summary
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "#333" }}>Tour Cost</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#000" }}>
                {currencySymbol}
                {totalAmount.toFixed(2)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "#333" }}>
                Reservation Fee Paid
              </span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#16a34a" }}>
                -{currencySymbol}
                {reservationFee.toFixed(2)}
              </span>
            </div>
            <div style={{ borderTop: "2px solid #d1d5db", paddingTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", color: "#000" }}>
                  Remaining Balance
                </span>
                <span style={{ fontSize: "18px", fontWeight: "bold", color: "#ef3340" }}>
                  {currencySymbol}
                  {remainingBalance.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "48px",
            paddingTop: "24px",
            borderTop: "1px solid #e5e7eb",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
            Thank you for choosing I&apos;m Here Travels for your adventure!
          </p>
          <p style={{ fontSize: "12px", color: "#666" }}>
            Questions? Contact us at support@imheretravels.com
          </p>
        </div>
      </div>

      {/* Page 2: Receipt */}
      <div style={{ pageBreakBefore: "always", minHeight: "100vh", paddingBottom: "20px" }}>
        {/* Header with Logo */}
        <div
          style={{
            borderBottom: "2px solid #e5e7eb",
            paddingBottom: "24px",
            marginBottom: "32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ef3340" }}>
            ❤️ I&apos;m Here Travels
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "12px",
                color: "#666",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              Payment Receipt
            </div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "#000",
                fontFamily: "monospace",
              }}
            >
              {bookingId}
            </div>
            <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
              {paymentDate}
            </div>
          </div>
        </div>

        {/* Receipt Header Banner */}
        <div
          style={{
            background: "linear-gradient(to right, #ef3340, #dc2626)",
            color: "#fff",
            borderRadius: "8px",
            padding: "24px",
            marginBottom: "32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: "bold", margin: "0 0 4px 0" }}>
              Receipt
            </h2>
            <p style={{ fontSize: "12px", color: "#fca5a5", margin: "0" }}>
              from I&apos;m Here Travels
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "12px", color: "#fca5a5", marginBottom: "4px" }}>
              RECEIPT
            </p>
            <p style={{ fontSize: "14px", fontWeight: "bold", fontFamily: "monospace", margin: "0" }}>
              #{bookingId}
            </p>
          </div>
        </div>

        {/* Amount Paid Section */}
        <div
          style={{
            backgroundColor: "#f3f4f6",
            borderRadius: "8px",
            padding: "24px",
            marginBottom: "32px",
          }}
        >
          <h3
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              color: "#666",
              marginBottom: "16px",
              textTransform: "uppercase",
              margin: "0 0 16px 0",
            }}
          >
            Amount Paid
          </h3>
          <div>
            <div style={{ fontSize: "32px", fontWeight: "bold", color: "#000", margin: "0 0 8px 0" }}>
              {currencySymbol}
              {reservationFee.toFixed(2)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#666" }}>Date Paid</span>
              <span style={{ fontWeight: "500", color: "#000" }}>
                {paymentDate}
              </span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div style={{ marginBottom: "32px" }}>
          <h3
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              color: "#666",
              marginBottom: "16px",
              paddingBottom: "8px",
              borderBottom: "1px solid #e5e7eb",
              margin: "0 0 16px 0",
              textTransform: "uppercase",
            }}
          >
            Summary
          </h3>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "#666" }}>
              Pay Balance Instalment
            </span>
            <span style={{ fontSize: "12px", fontWeight: "bold", color: "#000" }}>
              {currencySymbol}
              {reservationFee.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Reservation Details on Receipt */}
        <div style={{ marginBottom: "32px" }}>
          <h3
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              color: "#666",
              marginBottom: "16px",
              paddingBottom: "8px",
              borderBottom: "1px solid #e5e7eb",
              margin: "0 0 16px 0",
              textTransform: "uppercase",
            }}
          >
            Reservation Details
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: "12px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <span style={{ fontSize: "12px", color: "#666" }}>Reservation ID</span>
              <span
                style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  fontWeight: "bold",
                  color: "#000",
                }}
              >
                {bookingId}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: "12px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <span style={{ fontSize: "12px", color: "#666" }}>Tour Name</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#000" }}>
                {tourName}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: "12px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <span style={{ fontSize: "12px", color: "#666" }}>Tour Date</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#000" }}>
                {tourDate}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "#666" }}>Email</span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: "#000" }}>
                {email}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "48px",
            paddingTop: "24px",
            borderTop: "1px solid #e5e7eb",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
            This receipt confirms your payment for the reservation fee.
          </p>
          <p style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
            Please keep this for your records.
          </p>
          <p style={{ fontSize: "12px", color: "#666" }}>
            Questions? Contact us at support@imheretravels.com
          </p>
        </div>
      </div>
    </div>
  );
}
