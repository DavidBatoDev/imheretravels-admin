import { NextRequest, NextResponse } from "next/server";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { requireStaff } from "@/lib/require-staff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }

  try {
    const { threadId } = await params;

    console.log("Gmail thread API called with threadId:", threadId);

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    // Fetch all emails in the thread
    const threadEmails = await gmailService.fetchThreadEmails(threadId);

    return NextResponse.json({
      success: true,
      data: {
        emails: threadEmails,
        threadId,
      },
    });
  } catch (error) {
    console.error("Error in Gmail thread API:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch thread emails",
      },
      { status: 500 }
    );
  }
}
