import { NextRequest, NextResponse } from "next/server";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { requireStaff } from "@/lib/require-staff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }

  try {
    const { id: messageId } = await params;

    if (!messageId) {
      return NextResponse.json(
        {
          success: false,
          error: "Message ID is required",
        },
        { status: 400 }
      );
    }

    console.log("Gmail email content API called for message:", messageId);

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    // Get full email content
    const email = await gmailService.getEmailContent(messageId);

    return NextResponse.json({
      success: true,
      data: email,
    });
  } catch (error) {
    console.error("Error in Gmail email content API:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch email content",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }

  try {
    const { id: messageId } = await params;
    const body = await request.json();
    const { action } = body;

    if (!messageId) {
      return NextResponse.json(
        {
          success: false,
          error: "Message ID is required",
        },
        { status: 400 }
      );
    }

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    if (action === "markAsRead") {
      await gmailService.markAsRead(messageId);
      return NextResponse.json({
        success: true,
        message: "Email marked as read",
      });
    }

    if (action === "markAsUnread") {
      await gmailService.markAsUnread(messageId);
      return NextResponse.json({
        success: true,
        message: "Email marked as unread",
      });
    }

    if (action === "archive") {
      await gmailService.archiveEmail(messageId);
      return NextResponse.json({
        success: true,
        message: "Email archived",
      });
    }

    if (action === "trash") {
      await gmailService.trashEmail(messageId);
      return NextResponse.json({
        success: true,
        message: "Email moved to trash",
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Invalid action",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in Gmail email update API:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update email",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
