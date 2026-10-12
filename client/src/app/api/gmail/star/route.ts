import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
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
    const body = await request.json();
    const { messageId, isStarred } = body;

    if (!messageId || isStarred === undefined) {
      return NextResponse.json(
        { error: "Message ID and starred status are required" },
        { status: 400 }
      );
    }

    // Initialize OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob"
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    if (isStarred) {
      // Remove star
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          removeLabelIds: ["STARRED"],
        },
      });

      return NextResponse.json({
        success: true,
        isStarred: false,
        message: "Email unstarred successfully",
      });
    } else {
      // Add star
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          addLabelIds: ["STARRED"],
        },
      });

      return NextResponse.json({
        success: true,
        isStarred: true,
        message: "Email starred successfully",
      });
    }
  } catch (error) {
    console.error("Error managing star status:", error);
    return NextResponse.json(
      { error: "Failed to manage star status" },
      { status: 500 }
    );
  }
}
