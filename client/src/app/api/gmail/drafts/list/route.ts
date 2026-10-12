import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { simplifyGmailHtml } from "@/utils/html-parser";
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

    // Fetch drafts
    const response = await gmail.users.drafts.list({
      userId: "me",
      maxResults: 50, // Limit to 50 drafts
    });

    const drafts = response.data.drafts || [];
    console.log(`Found ${drafts.length} drafts from Gmail API`);

    // Fetch full details for each draft
    const draftDetails = await Promise.all(
      drafts.map(async (draft) => {
        try {
          const draftResponse = await gmail.users.drafts.get({
            userId: "me",
            id: draft.id!,
            format: "full",
          });

          const message = draftResponse.data.message;
          const headers = message?.payload?.headers || [];

          // Extract headers
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
              ?.value || "";

          const from = getHeader("From");
          const to = getHeader("To");
          const cc = getHeader("Cc");
          const bcc = getHeader("Bcc");
          const subject = getHeader("Subject");
          const date = getHeader("Date");

          // Extract reply/forward headers
          const inReplyTo = getHeader("In-Reply-To");
          const references = getHeader("References");
          const mailType = getHeader("X-MailType"); // 'reply', 'forward', 'new'

          // Extract body content
          let htmlContent = "";
          let textContent = "";
          let snippet = "";
          let hasAttachments = false;

          const extractBody = (part: any): { html: string; text: string } => {
            const result = { html: "", text: "" };

            // Handle direct body data
            if (part.body?.data) {
              const content = Buffer.from(part.body.data, "base64").toString();
              if (part.mimeType === "text/html") {
                result.html = content;
              } else if (part.mimeType === "text/plain") {
                result.text = content;
              }
              return result;
            }

            // Handle nested parts (for multipart messages with attachments)
            if (part.parts) {
              for (const subPart of part.parts) {
                // Check for attachments
                if (
                  subPart.filename ||
                  subPart.mimeType?.startsWith("application/") ||
                  subPart.mimeType?.startsWith("image/") ||
                  subPart.mimeType?.startsWith("video/") ||
                  subPart.mimeType?.startsWith("audio/")
                ) {
                  hasAttachments = true;
                  continue; // Skip attachment parts
                }

                // Recursively extract content
                const subResult = extractBody(subPart);
                result.html += subResult.html;
                result.text += subResult.text;
              }
            }

            return result;
          };

          if (message?.payload?.parts) {
            // Handle multipart messages (including those with attachments)
            for (const part of message.payload.parts) {
              const extracted = extractBody(part);
              htmlContent += extracted.html;
              textContent += extracted.text;
            }
          } else if (message?.payload?.body?.data) {
            // Handle simple messages without parts
            const content = Buffer.from(
              message.payload.body.data,
              "base64"
            ).toString();
            if (message.payload.mimeType === "text/html") {
              htmlContent = content;
            } else {
              textContent = content;
            }
          }

          // Prefer HTML content over plain text for drafts
          // If we have both, use HTML; if only text, convert to HTML-like format
          if (htmlContent && textContent) {
            // If we have both, use HTML and ignore the duplicate text
            textContent = "";
          } else if (textContent && !htmlContent) {
            // If we only have text, convert line breaks to HTML
            htmlContent = textContent.replace(/\n/g, "<br>");
            textContent = "";
          }

          // Parse and simplify HTML content for rich text editor compatibility
          if (htmlContent) {
            try {
              htmlContent = simplifyGmailHtml(htmlContent);
            } catch (error) {
              console.error(`Error parsing HTML for draft ${draft.id}:`, error);
              // Keep original HTML if parsing fails
            }
          }

          // Create snippet from the content
          snippet = htmlContent
            ? htmlContent.replace(/<[^>]*>/g, "").substring(0, 100)
            : textContent.substring(0, 100);

          return {
            id: draft.id!,
            threadId: message?.threadId || "",
            from: from || "Unknown",
            to: to || "",
            cc: cc || "",
            bcc: bcc || "",
            subject: subject || "(no subject)",
            date: date ? new Date(date) : new Date(),
            htmlContent,
            textContent,
            snippet,
            labels: ["DRAFT"],
            isRead: true,
            isSent: false,
            isReceived: false,
            messageId: message?.id || "",
            isDraft: true,
            isStarred: false,
            hasAttachments: hasAttachments,
            isImportant: false,
            threadMessageCount: 1,
            // Include reply/forward headers if present
            inReplyTo: inReplyTo || undefined,
            references: references || undefined,
            mailType: mailType || undefined,
          };
        } catch (error) {
          console.error(`Error fetching draft ${draft.id}:`, error);
          return null;
        }
      })
    );

    // Filter out null results
    const validDrafts = draftDetails.filter((draft) => draft !== null);

    console.log(
      `Fetched ${validDrafts.length} valid drafts out of ${drafts.length} total`
    );

    return NextResponse.json({
      success: true,
      drafts: validDrafts,
    });
  } catch (error) {
    console.error("Error fetching drafts:", error);
    return NextResponse.json(
      { error: "Failed to fetch drafts" },
      { status: 500 }
    );
  }
}
