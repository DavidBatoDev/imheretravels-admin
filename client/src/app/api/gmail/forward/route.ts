import { NextRequest, NextResponse } from "next/server";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { requireStaff } from "@/lib/require-staff";

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }

  try {
    console.log("=== Gmail Forward API Called ===");

    const body = await request.json();
    const { to, cc, bcc, subject, body: emailBody, attachments, threadId } = body;

    console.log("Gmail forward API called with:", {
      to,
      cc,
      bcc,
      subject,
      threadId,
      bodyLength: emailBody?.length || 0,
      attachmentCount: attachments?.length || 0,
    });

    // Validate required fields
    if (!to || !subject || !emailBody) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: to, subject, body",
        },
        { status: 400 }
      );
    }

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    // Send forward email via Gmail API
    // For forwards, we maintain threadId if provided but don't use In-Reply-To or References
    const result = await gmailService.sendEmail({
      to,
      cc: cc ? [cc] : undefined,
      bcc: bcc ? [bcc] : undefined,
      subject,
      htmlContent: emailBody,
      attachments: attachments || [],
      threadId, // Include threadId to maintain conversation grouping in Gmail
      // No inReplyTo or references for forwards
    });

    console.log("Forward sent successfully via Gmail API:", result);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("=== ERROR in Gmail forward API ===");
    console.error("Error details:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send forward",
      },
      { status: 500 }
    );
  }
}
