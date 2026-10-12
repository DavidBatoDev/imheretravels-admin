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

    // Parse query parameters
    const maxResults = parseInt(searchParams.get("maxResults") || "25");
    const query = searchParams.get("query") || "in:sent OR in:inbox";
    const pageToken = searchParams.get("pageToken") || undefined;
    const searchQuery = searchParams.get("searchQuery") || undefined;
    const labelIds = searchParams.get("labelIds")?.split(",") || undefined;

    console.log("Gmail emails API called with params:", {
      maxResults,
      query,
      pageToken,
      searchQuery,
      labelIds,
    });

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    let result;

    if (searchQuery) {
      // Use search functionality if search query is provided
      result = await gmailService.searchEmails(searchQuery, maxResults);
    } else {
      // Fetch emails with the provided options
      result = await gmailService.fetchEmails({
        maxResults,
        query,
        labelIds,
        pageToken,
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in Gmail emails API:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch emails",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

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
    const {
      maxResults = 25,
      query = "in:sent OR in:inbox",
      labelIds,
      pageToken,
      searchQuery,
    } = body;

    console.log("Gmail emails API (POST) called with data:", body);

    // Initialize Gmail API service
    const gmailService = new GmailApiService();

    let result;

    if (searchQuery) {
      // Use search functionality if search query is provided
      result = await gmailService.searchEmails(searchQuery, maxResults);
    } else {
      // Fetch emails with the provided options
      result = await gmailService.fetchEmails({
        maxResults,
        query,
        labelIds,
        pageToken,
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in Gmail emails API (POST):", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch emails",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
