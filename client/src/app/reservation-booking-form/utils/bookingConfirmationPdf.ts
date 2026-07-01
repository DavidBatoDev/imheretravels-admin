import jsPDF from "jspdf";

async function loadFont(
  pdf: jsPDF,
  url: string,
  vfsName: string,
  fontName: string,
  style: "normal" | "bold" | "italic" | "bolditalic" = "normal",
) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch font: ${url}`);
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++)
      binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    pdf.addFileToVFS(vfsName, base64);
    pdf.addFont(vfsName, fontName, style);
  } catch (e) {
    // silently fall back to built-in fonts
  }
}

async function rasterizeSvgToPngDataUrl(
  svgUrl: string,
  width: number,
  height: number,
  scale: number = 8,
): Promise<string | null> {
  try {
    const svgRes = await fetch(svgUrl);
    if (!svgRes.ok) throw new Error(`Failed to fetch SVG: ${svgUrl}`);
    const svgText = await svgRes.text();
    const svgBase64 = btoa(unescape(encodeURIComponent(svgText)));
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${svgBase64}`;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG load error"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function generateBookingConfirmationPDF(
  bookingId: string,
  tourName: string,
  tourDate: string,
  email: string,
  firstName: string,
  lastName: string,
  paymentPlan: string,
  reservationFee: number,
  totalAmount: number,
  remainingBalance: number,
  paymentDate: string,
  currency: string = "GBP",
  numberOfTravelers: number = 1,
  bookingType?: string,
) {
  const currencySymbol =
    currency === "GBP" ? "£" : currency === "EUR" ? "£" : "$";
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let yPosition = 20;

  // Load HKGrotesk (Regular/Bold/Black) from public and set default font
  await loadFont(
    pdf,
    "/fonts/HKGrotesk/TTF/HKGrotesk-Regular.ttf",
    "HKGrotesk-Regular.ttf",
    "HKGrotesk",
    "normal",
  );
  await loadFont(
    pdf,
    "/fonts/HKGrotesk/TTF/HKGrotesk-Bold.ttf",
    "HKGrotesk-Bold.ttf",
    "HKGrotesk",
    "bold",
  );
  await loadFont(
    pdf,
    "/fonts/HKGrotesk/TTF/HKGrotesk-Black.ttf",
    "HKGrotesk-Black.ttf",
    "HKGrotesk-Black",
    "normal",
  );
  pdf.setFont("HKGrotesk", "normal");

  // PAGE 1: RESERVATION CONFIRMATION
  // Header: Logo at top-right only
  {
    const logoWidth = 45;
    const logoHeight = 11;
    const logoX = pageWidth - 15 - logoWidth;
    const logoY = 12;
    const pngDataUrl = await rasterizeSvgToPngDataUrl(
      "/logos/Digital_Horizontal_Red.svg",
      logoWidth,
      logoHeight,
      8,
    );
    if (pngDataUrl) {
      pdf.addImage(pngDataUrl, "PNG", logoX, logoY, logoWidth, logoHeight);
    }
    yPosition = logoY + logoHeight + 6;
  }

  // Reservation ID and date - right aligned
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text(bookingId, pageWidth - 15, yPosition, { align: "right" });

  yPosition += 5;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(paymentDate, pageWidth - 15, yPosition, { align: "right" });

  // Divider line
  yPosition += 10;
  pdf.setDrawColor(229, 231, 235);
  pdf.line(15, yPosition, pageWidth - 15, yPosition);

  // Confirmation Message - using brand typography (Heading style)
  yPosition += 15;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(32);
  pdf.setTextColor(239, 51, 64);
  pdf.text("Reservation Confirmed!", 15, yPosition);

  yPosition += 12;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(14);
  pdf.setTextColor(51, 51, 51);
  pdf.text(`You're all set for ${tourName}`, 15, yPosition);

  // Customer Information Section - using brand typography
  yPosition += 18;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text("CUSTOMER INFORMATION", 15, yPosition);

  yPosition += 8;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Name:", 15, yPosition);
  pdf.setFont("HKGrotesk", "bold");
  pdf.setTextColor(0, 0, 0);
  pdf.text(`${firstName} ${lastName}`, 60, yPosition);

  yPosition += 7;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setTextColor(80, 80, 80);
  pdf.text("Email:", 15, yPosition);
  pdf.setFont("HKGrotesk", "bold");
  pdf.setTextColor(0, 0, 0);
  pdf.text(email, 60, yPosition);

  // Reservation Details Section
  yPosition += 18;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text("RESERVATION DETAILS", 15, yPosition);

  yPosition += 8;
  const details = [
    { label: "Reservation ID", value: bookingId },
    ...(bookingType
      ? [
          {
            label: "Booking Type",
            value:
              bookingType +
              (numberOfTravelers > 1
                ? ` (${numberOfTravelers} travelers)`
                : ""),
          },
        ]
      : []),
    { label: "Tour Name", value: tourName },
    { label: "Tour Date", value: tourDate },
    { label: "Payment Plan", value: paymentPlan },
  ];

  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(11);
  details.forEach((item) => {
    pdf.setTextColor(80, 80, 80);
    pdf.text(item.label + ":", 15, yPosition);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("HKGrotesk", "bold");
    pdf.text(item.value, 70, yPosition);
    pdf.setFont("HKGrotesk", "normal");
    yPosition += 7;
  });

  // Payment Summary Section
  yPosition += 12;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text("PAYMENT SUMMARY", 15, yPosition);

  yPosition += 8;
  const summary = [
    ...(numberOfTravelers > 1
      ? [{ label: "Number of Travelers", value: `${numberOfTravelers}` }]
      : []),
    { label: "Tour Cost", value: `${currencySymbol}${totalAmount.toFixed(2)}` },
    ...(numberOfTravelers > 1
      ? [
          {
            label: "  Per person",
            value: `${currencySymbol}${(totalAmount / numberOfTravelers).toFixed(2)}`,
          },
        ]
      : []),
    {
      label: "Reservation Fee Paid",
      value: `-${currencySymbol}${reservationFee.toFixed(2)}`,
    },
    ...(numberOfTravelers > 1
      ? [
          {
            label: "  Per person",
            value: `-${currencySymbol}${(reservationFee / numberOfTravelers).toFixed(2)}`,
          },
        ]
      : []),
  ];

  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(11);
  summary.forEach((item) => {
    pdf.setTextColor(80, 80, 80);
    pdf.text(item.label + ":", 15, yPosition);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("HKGrotesk", "bold");
    pdf.text(item.value, 70, yPosition);
    pdf.setFont("HKGrotesk", "normal");
    yPosition += 7;
  });

  yPosition += 5;
  pdf.setDrawColor(209, 213, 219);
  pdf.line(15, yPosition, pageWidth - 15, yPosition);

  yPosition += 10;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(239, 51, 64);
  pdf.text("Remaining Balance:", 15, yPosition);
  pdf.text(
    `${currencySymbol}${remainingBalance.toFixed(2)}`,
    pageWidth - 15,
    yPosition,
    {
      align: "right",
    },
  );

  // Footer
  yPosition = pageHeight - 20;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    "Thank you for choosing I'm Here Travels!",
    pageWidth / 2,
    yPosition,
    { align: "center" },
  );

  yPosition += 5;
  pdf.text(
    "Questions? Contact us at bella@imheretravels.com",
    pageWidth / 2,
    yPosition,
    { align: "center" },
  );

  // PAGE 2: RECEIPT
  pdf.addPage();
  yPosition = 20;

  // Header: Logo at top-right only
  {
    const logoWidth = 45;
    const logoHeight = 11;
    const logoX = pageWidth - 15 - logoWidth;
    const logoY = 12;
    const pngDataUrl = await rasterizeSvgToPngDataUrl(
      "/logos/Digital_Horizontal_Red.svg",
      logoWidth,
      logoHeight,
      8,
    );
    if (pngDataUrl) {
      pdf.addImage(pngDataUrl, "PNG", logoX, logoY, logoWidth, logoHeight);
    }
    yPosition = logoY + logoHeight + 6;
  }

  // Reservation ID and date - right aligned
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.text(bookingId, pageWidth - 15, yPosition, { align: "right" });

  yPosition += 5;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(paymentDate, pageWidth - 15, yPosition, { align: "right" });

  // Divider line
  yPosition += 10;
  pdf.setDrawColor(229, 231, 235);
  pdf.line(15, yPosition, pageWidth - 15, yPosition);

  // Receipt Banner - using brand typography (Subhead style)
  yPosition += 15;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(28);
  pdf.setTextColor(239, 51, 64);
  pdf.text("Payment Receipt", 15, yPosition);

  // Amount Paid Section
  yPosition += 20;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text("AMOUNT PAID", 15, yPosition);

  yPosition += 10;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(28);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`${currencySymbol}${reservationFee.toFixed(2)}`, 15, yPosition);

  yPosition += 12;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Date Paid:", 15, yPosition);
  pdf.setFont("HKGrotesk", "bold");
  pdf.setTextColor(0, 0, 0);
  pdf.text(paymentDate, 70, yPosition);

  // Summary Section
  yPosition += 18;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  const receiptSummary = [
    ...(numberOfTravelers > 1
      ? [{ label: "Number of Travelers", value: `${numberOfTravelers}` }]
      : []),
    {
      label: "Reservation Fee",
      value: `${currencySymbol}${reservationFee.toFixed(2)}`,
    },
    ...(numberOfTravelers > 1
      ? [
          {
            label: "  Per person",
            value: `${currencySymbol}${(reservationFee / numberOfTravelers).toFixed(2)}`,
          },
        ]
      : []),
  ];

  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(11);
  receiptSummary.forEach((item) => {
    pdf.setTextColor(80, 80, 80);
    pdf.text(item.label + ":", 15, yPosition);
    pdf.setFont("HKGrotesk", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text(item.value, 70, yPosition);
    pdf.setFont("HKGrotesk", "normal");
    yPosition += 7;
  });

  // Reservation Details Section
  yPosition += 18;
  pdf.setFont("HKGrotesk", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text("RESERVATION DETAILS", 15, yPosition);

  yPosition += 8;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(11);
  details.forEach((item) => {
    pdf.setTextColor(80, 80, 80);
    pdf.text(item.label + ":", 15, yPosition);
    pdf.setFont("HKGrotesk", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text(item.value, 70, yPosition);
    pdf.setFont("HKGrotesk", "normal");
    yPosition += 7;
  });

  // Footer
  yPosition = pageHeight - 20;
  pdf.setFont("HKGrotesk", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    "This receipt confirms your payment for the reservation fee.",
    pageWidth / 2,
    yPosition,
    { align: "center" },
  );

  yPosition += 4;
  pdf.text("Please keep this for your records.", pageWidth / 2, yPosition, {
    align: "center",
  });

  yPosition += 4;
  pdf.text(
    "Questions? Contact us at bella@imheretravels.com",
    pageWidth / 2,
    yPosition,
    {
      align: "center",
    },
  );

  return pdf;
}
