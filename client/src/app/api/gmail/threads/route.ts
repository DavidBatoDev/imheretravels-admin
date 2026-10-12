import { NextRequest, NextResponse } from "next/server";
import GmailApiService from "@/lib/gmail/gmail-api-service";
import { requireStaff } from "@/lib/require-staff";

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json(
      { success: false, error: staff.error },
      { status: staff.status },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return NextResponse.json(
        {
          success: false,
          error: "Thread ID is required",
        },
        { status: 400 }
      );
    }

    console.log("Gmail thread API called for thread:", threadId);

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    // Get thread with all messages
    const thread = await gmailService.getThread(threadId);

    return NextResponse.json({
      success: true,
      data: thread,
    });
  } catch (error) {
    console.error("Error in Gmail thread API:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch thread",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
