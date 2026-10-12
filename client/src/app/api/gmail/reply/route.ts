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
    console.log("=== Gmail Reply API Called ===");

    const body = await request.json();
    const { to, cc, bcc, subject, body: emailBody, attachments, threadId, inReplyTo, references } = body;

    console.log("Gmail reply API called with:", {
      to,
      cc,
      bcc,
      subject,
      threadId,
      inReplyTo,
      references,
      bodyLength: emailBody?.length || 0,
      attachmentCount: attachments?.length || 0,
    });

    // Validate required fields
    if (!to || !subject || !emailBody || !threadId || !inReplyTo) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: to, subject, body, threadId, inReplyTo",
        },
        { status: 400 }
      );
    }

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    // Send reply email via Gmail API with proper threading
    const result = await gmailService.sendEmail({
      to,
      cc: cc ? [cc] : undefined,
      bcc: bcc ? [bcc] : undefined,
      subject,
      htmlContent: emailBody,
      attachments: attachments || [],
      threadId,
      inReplyTo,
      references,
    });

    console.log("Reply sent successfully via Gmail API:", result);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("=== ERROR in Gmail reply API ===");
    console.error("Error details:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send reply",
      },
      { status: 500 }
    );
  }
}
