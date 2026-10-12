import { NextRequest, NextResponse } from "next/server";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { requireStaff } from "@/lib/require-staff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string; attachmentId: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }

  try {
    const { messageId, attachmentId } = await params;
    const { searchParams } = new URL(request.url);
    const isPreview = searchParams.get("preview") === "true";

    console.log("Gmail attachment API called with:", {
      messageId,
      attachmentId,
      isPreview,
    });

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    // Fetch attachment data
    const attachmentData = await gmailService.downloadAttachment(
      messageId,
      attachmentId
    );

    if (isPreview) {
      // For preview mode, return the raw data (for images and PDFs)
      const base64Data = attachmentData.data
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const buffer = Buffer.from(base64Data, "base64");

      // Try to get attachment info, but use default if it fails
      let mimeType = "application/octet-stream";
      try {
        const attachmentInfo = await gmailService.getAttachmentInfo(
          messageId,
          attachmentId
        );
        mimeType = attachmentInfo.mimeType || mimeType;
      } catch (infoError) {
        console.warn(
          "Could not get attachment info, using default MIME type:",
          infoError
        );
        // Continue with default mimeType
      }

      // Heuristic: sniff content if mimeType is unknown (octet-stream)
      if (mimeType === "application/octet-stream") {
        const header4 = buffer.subarray(0, 4).toString("ascii");
        // %PDF
        if (header4 === "%PDF") {
          mimeType = "application/pdf";
        } else {
          // PNG
          const sigPng = buffer.subarray(0, 8);
          if (
            sigPng[0] === 0x89 &&
            sigPng[1] === 0x50 &&
            sigPng[2] === 0x4e &&
            sigPng[3] === 0x47 &&
            sigPng[4] === 0x0d &&
            sigPng[5] === 0x0a &&
            sigPng[6] === 0x1a &&
            sigPng[7] === 0x0a
          ) {
            mimeType = "image/png";
          } else {
            // JPEG
            const isJpeg =
              buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
            if (isJpeg) mimeType = "image/jpeg";
          }
        }
      }

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mimeType,
          // Force inline display for previews (prevents download prompts)
          "Content-Disposition": "inline",
          "Cache-Control": "public, max-age=31536000, immutable", // Cache for 1 year (immutable)
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: attachmentData,
    });
  } catch (error) {
    console.error("Error in Gmail attachment API:", error);
    const { searchParams } = new URL(request.url);
    const isPreview = searchParams.get("preview") === "true";
    const { messageId, attachmentId } = await params;
    console.error("Error details:", {
      messageId,
      attachmentId,
      isPreview,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to download attachment",
        details: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}
