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
    console.log("=== Gmail Send API Called ===");

    const body = await request.json();
    const { to, cc, bcc, subject, body: emailBody, attachments, threadId, inReplyTo, references } = body;

    console.log("Gmail send API called with:", {
      to,
      subject,
      bodyLength: emailBody?.length || 0,
      bodyPreview: emailBody?.substring(0, 200) + "...",
      body: emailBody,
      threadId,
      inReplyTo,
      references,
    });

    // Initialize Gmail API service
    console.log("Initializing Gmail API service...");
    const gmailService = new GmailApiService();

    // Send email via Gmail API
    console.log("Calling gmailService.sendEmail...");
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

    console.log("Email sent successfully via Gmail API:", result);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("=== ERROR in Gmail send API ===");
    console.error("Error details:", error);
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack"
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send email",
      },
      { status: 500 }
    );
  }
}
