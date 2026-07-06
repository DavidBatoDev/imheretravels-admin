import { google } from "googleapis";
import { logger } from "firebase-functions";

// Gmail API service class
export class GmailApiService {
  private gmail: any;
  private oauth2Client: any;

  constructor() {
    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob" // For server-side apps
    );

    // Set refresh token credentials
    this.oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    // Initialize Gmail API client
    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  /**
   * Fetch emails from Gmail account (optimized for performance)
   * @param options - Filtering options for emails
   * @returns Array of email messages
   */
  async fetchEmails(
    options: {
      maxResults?: number;
      query?: string;
      labelIds?: string[];
      pageToken?: string;
    } = {}
  ) {
    try {
      const {
        maxResults = 50,
        query = "in:sent OR in:inbox",
        labelIds,
        pageToken,
      } = options;

      logger.info("Fetching emails with options:", options);

      // List messages
      const listResponse = await this.gmail.users.messages.list({
        userId: "me",
        maxResults,
        q: query,
        labelIds,
        pageToken,
      });

      const messageIds = listResponse.data.messages || [];

      if (messageIds.length === 0) {
        return {
          emails: [],
          nextPageToken: listResponse.data.nextPageToken,
          resultSizeEstimate: listResponse.data.resultSizeEstimate || 0,
        };
      }

      // Batch fetch with metadata format for faster loading
      const emails = await this.batchFetchEmails(messageIds);

      return {
        emails,
        nextPageToken: listResponse.data.nextPageToken,
        resultSizeEstimate: listResponse.data.resultSizeEstimate,
      };
    } catch (error) {
      logger.error("Error fetching emails:", error);
      throw new Error(`Failed to fetch emails: ${error}`);
    }
  }

  /**
   * Batch fetch emails with concurrent requests for better performance
   * @param messageIds - Array of message IDs to fetch
   * @returns Array of parsed email messages
   */
  private async batchFetchEmails(messageIds: any[]) {
    const batchSize = 10; // Process 10 emails concurrently
    const emails: any[] = [];

    // Process messages in batches for better performance
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);

      // Fetch messages concurrently within each batch
      const batchPromises = batch.map(async (message) => {
        try {
          // Use 'metadata' format for faster fetching (headers only, no body)
          const messageResponse = await this.gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "metadata",
            metadataHeaders: [
              "From",
              "To",
              "Subject",
              "Date",
              "Message-ID",
              "In-Reply-To",
              "References",
            ],
          });

          return this.parseEmailMessageMetadata(messageResponse.data);
        } catch (error) {
          logger.error(`Error fetching message ${message.id}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      emails.push(...batchResults.filter((email: any) => email !== null));
    }

    return emails;
  }

  /**
   * Send an email using Gmail API
   * @param emailData - Email data including to, subject, content, etc.
   * @returns Message ID and status
   */
  async sendEmail(emailData: {
    to: string;
    subject: string;
    htmlContent: string;
    bcc?: string[];
    cc?: string[];
    from?: string;
    replyTo?: string;
    headers?: Record<string, string>; // Extra headers, e.g. List-Unsubscribe
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
      cid?: string; // Content-ID for inline images
    }>;
  }) {
    try {
      const {
        to,
        subject,
        htmlContent,
        bcc = [],
        cc = [],
        from = "Bella | ImHereTravels <bella@imheretravels.com>",
        replyTo,
        headers = {},
        attachments = [],
      } = emailData;

      // Create email message
      const message = this.createEmailMessage({
        to,
        subject,
        htmlContent,
        bcc,
        cc,
        from,
        replyTo,
        headers,
        attachments,
      });

      // Send the email
      const response = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: message,
        },
      });

      logger.info("Email sent successfully:", response.data.id);

      return {
        messageId: response.data.id,
        threadId: response.data.threadId,
        status: "sent",
      };
    } catch (error) {
      logger.error("Error sending email:", error);
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  /**
   * Parse Gmail message data into a standardized format
   * @param message - Raw Gmail message data
   * @returns Parsed email object
   */
  /**
   * Parse email metadata for fast list display (headers only, no body content)
   * @param message - Gmail message with metadata format
   * @returns Parsed email object optimized for list display
   */
  private parseEmailMessageMetadata(message: any) {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
        ?.value || "";

    // Determine if email was sent or received
    const sentLabels = message.labelIds?.includes("SENT") || false;
    const inboxLabels = message.labelIds?.includes("INBOX") || false;
    const isUnread = message.labelIds?.includes("UNREAD") || false;
    const isStarred = message.labelIds?.includes("STARRED") || false;
    const isImportant = message.labelIds?.includes("IMPORTANT") || false;

    // Check for attachments
    const hasAttachments =
      message.payload?.parts?.some(
        (part: any) => part.filename && part.filename.length > 0
      ) || false;

    // Parse date safely - Gmail internalDate is a string timestamp in milliseconds
    let emailDate = new Date(0); // Use epoch as default instead of current time

    if (message.internalDate) {
      const timestamp = parseInt(message.internalDate);
      if (!isNaN(timestamp)) {
        emailDate = new Date(timestamp);
      }
    }

    // Fallback to Date header if internalDate is not available
    if (isNaN(emailDate.getTime()) || emailDate.getTime() === 0) {
      const dateHeader = getHeader("Date");
      if (dateHeader) {
        const parsedDate = new Date(dateHeader);
        if (!isNaN(parsedDate.getTime())) {
          emailDate = parsedDate;
        }
      }
    }

    return {
      id: message.id,
      threadId: message.threadId,
      from: getHeader("From"),
      to: getHeader("To"),
      subject: getHeader("Subject") || "(no subject)",
      date: emailDate.toISOString(), // Convert to ISO string for proper JSON serialization
      htmlContent: "", // Will be loaded on demand when email is opened
      textContent: "", // Will be loaded on demand when email is opened
      labels: message.labelIds || [],
      snippet: message.snippet || "",
      isRead: !isUnread,
      isSent: sentLabels,
      isReceived: inboxLabels,
      messageId: getHeader("Message-ID"),
      inReplyTo: getHeader("In-Reply-To"),
      references: getHeader("References"),
      isStarred,
      isImportant,
      hasAttachments,
    };
  }

  private async parseEmailMessage(message: any) {
    const headers = message.payload.headers;
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
        ?.value || "";

    // Enhanced email body extraction
    let htmlContent = "";
    let textContent = "";
    const inlineAttachments: Record<
      string,
      { base64: string; mimeType: string }
    > = {};
    const attachmentPromises: Promise<void>[] = [];
    const attachmentCache = new Map<string, Promise<Buffer>>();

    const extractBody = (payload: any, depth: number = 0) => {
      logger.info(
        `Extracting body at depth ${depth}, mimeType: ${payload.mimeType}`
      );

      // Handle direct content (no parts)
      if (payload.body?.data) {
        try {
          const content = Buffer.from(payload.body.data, "base64url").toString(
            "utf-8"
          );

          if (payload.mimeType === "text/html") {
            // Clean up Gmail-specific elements from HTML content
            const cleanedContent = this.cleanGmailHtml(content);
            if (!htmlContent || cleanedContent.length > htmlContent.length) {
              htmlContent = cleanedContent;
              logger.info(
                `Found HTML content: ${cleanedContent.substring(0, 100)}...`
              );
            }
          } else if (payload.mimeType === "text/plain") {
            if (!textContent || content.length > textContent.length) {
              textContent = content;
              logger.info(
                `Found text content: ${content.substring(0, 100)}...`
              );
            }
          }
        } catch (error) {
          logger.error(`Error decoding direct body content: ${error}`);
        }
      }

      // Handle body stored as attachment (common for HTML with inline styles)
      if (payload.body?.attachmentId) {
        const attachmentId = payload.body.attachmentId;
        if (!attachmentCache.has(attachmentId)) {
          attachmentCache.set(
            attachmentId,
            this.fetchAttachmentBuffer(message.id, attachmentId)
          );
        }

        const attachmentPromise = attachmentCache
          .get(attachmentId)!
          .then((buffer) => {
            if (!buffer || buffer.length === 0) {
              return;
            }

            if (payload.mimeType === "text/html") {
              const content = buffer.toString("utf-8");
              const cleanedContent = this.cleanGmailHtml(content);
              if (!htmlContent || cleanedContent.length > htmlContent.length) {
                htmlContent = cleanedContent;
                logger.info(
                  `Updated HTML content from attachment: ${cleanedContent.substring(
                    0,
                    100
                  )}...`
                );
              }
            } else if (payload.mimeType === "text/plain") {
              const content = buffer.toString("utf-8");
              if (!textContent || content.length > textContent.length) {
                textContent = content;
                logger.info(
                  `Updated text content from attachment: ${content.substring(
                    0,
                    100
                  )}...`
                );
              }
            } else {
              const contentIdHeader = payload.headers?.find(
                (h: any) => h.name.toLowerCase() === "content-id"
              )?.value;
              const contentDisposition = payload.headers?.find(
                (h: any) => h.name.toLowerCase() === "content-disposition"
              )?.value;

              const normalizedContentId = contentIdHeader
                ? this.normalizeContentId(contentIdHeader)
                : "";
              const isInline =
                !!normalizedContentId ||
                (contentDisposition && /inline/i.test(contentDisposition));

              if (isInline && normalizedContentId) {
                inlineAttachments[normalizedContentId] = {
                  base64: buffer.toString("base64"),
                  mimeType: payload.mimeType,
                };
                logger.info(
                  `Cached inline attachment ${normalizedContentId} (${payload.mimeType})`
                );
              }
            }
          })
          .catch((error) =>
            logger.error(
              `Error fetching attachment ${attachmentId} for message ${message.id}:`,
              error
            )
          );

        attachmentPromises.push(attachmentPromise);
      }

      // Handle multipart content
      if (payload.parts && payload.parts.length > 0) {
        logger.info(`Processing ${payload.parts.length} parts`);

        for (const part of payload.parts) {
          logger.info(
            `Part mimeType: ${part.mimeType}, hasData: ${!!part.body
              ?.data}, size: ${part.body?.size || 0}, attachmentId: ${
              part.body?.attachmentId || "none"
            }`
          );

          extractBody(part, depth + 1);
        }
      }
    };

    logger.info(`Starting email body extraction for message ${message.id}`);
    extractBody(message.payload);
    await Promise.all(attachmentPromises);

    if (htmlContent && Object.keys(inlineAttachments).length > 0) {
      htmlContent = this.inlineCidAttachments(htmlContent, inlineAttachments);
    }

    logger.info(
      `Extraction complete. HTML length: ${htmlContent.length}, Text length: ${textContent.length}`
    );

    // Determine if email was sent or received
    const sentLabels = message.labelIds?.includes("SENT") || false;
    const inboxLabels = message.labelIds?.includes("INBOX") || false;
    const isUnread = message.labelIds?.includes("UNREAD") || false;
    const isStarred = message.labelIds?.includes("STARRED") || false;
    const isImportant = message.labelIds?.includes("IMPORTANT") || false;

    // Check for attachments
    const hasAttachments =
      message.payload?.parts?.some(
        (part: any) => part.filename && part.filename.length > 0
      ) || false;

    // Parse date safely - Gmail internalDate is a string timestamp in milliseconds
    let emailDate = new Date(0); // Use epoch as default instead of current time
    if (message.internalDate) {
      const timestamp = parseInt(message.internalDate);
      if (!isNaN(timestamp)) {
        emailDate = new Date(timestamp);
      }
    }
    // Fallback to Date header if internalDate is not available
    if (isNaN(emailDate.getTime()) || emailDate.getTime() === 0) {
      const dateHeader = getHeader("Date");
      if (dateHeader) {
        const parsedDate = new Date(dateHeader);
        if (!isNaN(parsedDate.getTime())) {
          emailDate = parsedDate;
        }
      }
    }

    return {
      id: message.id,
      threadId: message.threadId,
      from: getHeader("From"),
      to: getHeader("To"),
      subject: getHeader("Subject") || "(no subject)",
      date: emailDate.toISOString(), // Convert to ISO string for proper JSON serialization
      htmlContent: htmlContent, // Keep HTML content separate from text content
      textContent,
      labels: message.labelIds || [],
      snippet: message.snippet || "",
      isRead: !isUnread,
      isSent: sentLabels,
      isReceived: inboxLabels,
      messageId: getHeader("Message-ID"),
      inReplyTo: getHeader("In-Reply-To"),
      references: getHeader("References"),
      bcc: getHeader("Bcc"),
      cc: getHeader("Cc"),
      isStarred,
      isImportant,
      hasAttachments,
    };
  }

  /**
   * Fetch full email content on demand (for when user opens an email)
   * @param messageId - Gmail message ID
   * @returns Full email content including body
   */
  async fetchFullEmailContent(messageId: string) {
    try {
      logger.info(`Fetching full content for message ${messageId}`);

      const messageResponse = await this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full", // Use 'full' format to get complete message including body
      });

      logger.info(`Message response received for ${messageId}:`, {
        id: messageResponse.data.id,
        threadId: messageResponse.data.threadId,
        labelIds: messageResponse.data.labelIds,
        snippet: messageResponse.data.snippet,
        payloadMimeType: messageResponse.data.payload?.mimeType,
        hasPayloadParts: !!messageResponse.data.payload?.parts,
        partsCount: messageResponse.data.payload?.parts?.length || 0,
        hasDirectBody: !!messageResponse.data.payload?.body?.data,
        directBodySize: messageResponse.data.payload?.body?.size || 0,
      });

      const parsedMessage = await this.parseEmailMessage(messageResponse.data);

      logger.info(`Parsed message ${messageId}:`, {
        id: parsedMessage.id,
        subject: parsedMessage.subject,
        htmlContentLength: parsedMessage.htmlContent?.length || 0,
        textContentLength: parsedMessage.textContent?.length || 0,
        hasHtmlContent: !!parsedMessage.htmlContent,
        hasTextContent: !!parsedMessage.textContent,
      });

      return parsedMessage;
    } catch (error) {
      logger.error(
        `Error fetching full email content for ${messageId}:`,
        error
      );
      throw new Error(`Failed to fetch email content: ${error}`);
    }
  }

  /**
   * Create a raw email message for Gmail API
   * @param emailData - Email data
   * @returns Base64 encoded email message
   */
  private createEmailMessage(emailData: {
    to: string;
    subject: string;
    htmlContent: string;
    bcc?: string[];
    cc?: string[];
    from?: string;
    replyTo?: string;
    headers?: Record<string, string>; // Extra headers, e.g. List-Unsubscribe
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
      cid?: string; // Content-ID for inline images
    }>;
  }): string {
    const {
      to,
      subject,
      htmlContent,
      bcc = [],
      cc = [],
      from,
      replyTo,
      headers = {},
      attachments = [],
    } = emailData;

    // Separate inline and regular attachments
    const inlineAttachments = attachments.filter((att) => att.cid);
    const regularAttachments = attachments.filter((att) => !att.cid);

    // If no attachments, use simple format
    if (attachments.length === 0) {
      const lines = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
      ];

      if (cc.length > 0) {
        lines.push(`Cc: ${cc.join(", ")}`);
      }

      if (bcc.length > 0) {
        lines.push(`Bcc: ${bcc.join(", ")}`);
      }

      if (replyTo) {
        lines.push(`Reply-To: ${replyTo}`);
      }

      for (const [headerName, headerValue] of Object.entries(headers)) {
        lines.push(`${headerName}: ${headerValue}`);
      }

      lines.push("");
      lines.push(htmlContent);

      const message = lines.join("\r\n");
      return Buffer.from(message).toString("base64url");
    }

    // With attachments, use multipart format
    const boundary = `----=_Part_${Date.now()}`;
    const relatedBoundary = `----=_Related_${Date.now()}`;

    const lines = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      "Content-Type: multipart/mixed; boundary=" + boundary,
      "MIME-Version: 1.0",
    ];

    if (cc.length > 0) {
      lines.push(`Cc: ${cc.join(", ")}`);
    }

    if (bcc.length > 0) {
      lines.push(`Bcc: ${bcc.join(", ")}`);
    }

    if (replyTo) {
      lines.push(`Reply-To: ${replyTo}`);
    }

    for (const [headerName, headerValue] of Object.entries(headers)) {
      lines.push(`${headerName}: ${headerValue}`);
    }

    lines.push("");

    // If we have inline attachments, use multipart/related
    if (inlineAttachments.length > 0) {
      lines.push(`--${boundary}`);
      lines.push(
        "Content-Type: multipart/related; boundary=" + relatedBoundary
      );
      lines.push("");

      // HTML content part
      lines.push(`--${relatedBoundary}`);
      lines.push("Content-Type: text/html; charset=utf-8");
      lines.push("");
      lines.push(htmlContent);
      lines.push("");

      // Inline attachment parts
      for (const attachment of inlineAttachments) {
        lines.push(`--${relatedBoundary}`);
        lines.push(`Content-Type: ${attachment.contentType}`);
        lines.push(`Content-ID: <${attachment.cid}>`);
        lines.push("Content-Transfer-Encoding: base64");
        lines.push("");
        lines.push(attachment.content.toString("base64"));
        lines.push("");
      }

      lines.push(`--${relatedBoundary}--`);
      lines.push("");
    } else {
      // HTML content part without inline attachments
      lines.push(`--${boundary}`);
      lines.push("Content-Type: text/html; charset=utf-8");
      lines.push("");
      lines.push(htmlContent);
      lines.push("");
    }

    // Regular attachment parts
    for (const attachment of regularAttachments) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${attachment.contentType}`);
      lines.push(
        `Content-Disposition: attachment; filename="${attachment.filename}"`
      );
      lines.push("Content-Transfer-Encoding: base64");
      lines.push("");
      lines.push(attachment.content.toString("base64"));
      lines.push("");
    }

    lines.push(`--${boundary}--`);

    const message = lines.join("\r\n");
    return Buffer.from(message).toString("base64url");
  }

  /**
   * Get user's Gmail labels
   * @returns Array of Gmail labels
   */
  async getLabels() {
    try {
      const response = await this.gmail.users.labels.list({
        userId: "me",
      });

      return response.data.labels || [];
    } catch (error) {
      logger.error("Error fetching labels:", error);
      throw new Error(`Failed to fetch labels: ${error}`);
    }
  }

  /**
   * Search emails with specific query
   * @param searchQuery - Gmail search query
   * @param maxResults - Maximum number of results
   * @returns Search results
   */
  async searchEmails(searchQuery: string, maxResults: number = 20) {
    return this.fetchEmails({
      query: searchQuery,
      maxResults,
    });
  }

  /**
   * Create a draft email in Gmail
   * @param draftData - Draft email data
   * @returns Draft ID and details
   */
  async createDraft(draftData: {
    to: string;
    subject: string;
    htmlContent: string;
    bcc?: string[];
    cc?: string[];
    from?: string;
    replyTo?: string;
  }) {
    try {
      const {
        to,
        subject,
        htmlContent,
        bcc = [],
        cc = [],
        from = "Bella | ImHereTravels <bella@imheretravels.com>",
        replyTo,
      } = draftData;

      // Create email message
      const message = this.createEmailMessage({
        to,
        subject,
        htmlContent,
        bcc,
        cc,
        from,
        replyTo,
      });

      // Create the draft
      const response = await this.gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw: message,
          },
        },
      });

      logger.info("Draft created successfully:", response.data.id);

      return {
        draftId: response.data.id,
        messageId: response.data.message.id,
        threadId: response.data.message.threadId,
        status: "draft",
      };
    } catch (error) {
      logger.error("Error creating draft:", error);
      throw new Error(`Failed to create draft: ${error}`);
    }
  }

  /**
   * Update an existing draft
   * @param draftId - ID of the draft to update
   * @param draftData - Updated draft data
   * @returns Updated draft details
   */
  async updateDraft(
    draftId: string,
    draftData: {
      to: string;
      subject: string;
      htmlContent: string;
      bcc?: string[];
      cc?: string[];
      from?: string;
      replyTo?: string;
    }
  ) {
    try {
      const {
        to,
        subject,
        htmlContent,
        bcc = [],
        cc = [],
        from = "Bella | ImHereTravels <bella@imheretravels.com>",
        replyTo,
      } = draftData;

      // Create email message
      const message = this.createEmailMessage({
        to,
        subject,
        htmlContent,
        bcc,
        cc,
        from,
        replyTo,
      });

      // Update the draft
      const response = await this.gmail.users.drafts.update({
        userId: "me",
        id: draftId,
        requestBody: {
          message: {
            raw: message,
          },
        },
      });

      logger.info("Draft updated successfully:", response.data.id);

      return {
        draftId: response.data.id,
        messageId: response.data.message.id,
        threadId: response.data.message.threadId,
        status: "draft",
      };
    } catch (error) {
      logger.error("Error updating draft:", error);
      throw new Error(`Failed to update draft: ${error}`);
    }
  }

  /**
   * Delete a draft
   * @param draftId - ID of the draft to delete
   * @returns Success status
   */
  async deleteDraft(draftId: string) {
    try {
      await this.gmail.users.drafts.delete({
        userId: "me",
        id: draftId,
      });

      logger.info("Draft deleted successfully:", draftId);

      return {
        success: true,
        draftId,
        status: "deleted",
      };
    } catch (error) {
      logger.error("Error deleting draft:", error);
      throw new Error(`Failed to delete draft: ${error}`);
    }
  }

  /**
   * Find draft ID by message ID
   * @param messageId - Message ID from the draft URL
   * @returns Draft ID if found, null otherwise
   */
  async findDraftIdByMessageId(messageId: string): Promise<string | null> {
    try {
      logger.info(`Searching for draft with message ID: ${messageId}`);

      // List all drafts
      const listResponse = await this.gmail.users.drafts.list({
        userId: "me",
        maxResults: 500, // Increase to search more drafts
      });

      const drafts = listResponse.data.drafts || [];

      // Search through drafts to find matching message ID
      for (const draft of drafts) {
        try {
          const draftResponse = await this.gmail.users.drafts.get({
            userId: "me",
            id: draft.id,
            format: "metadata",
          });

          // Check if this draft's message ID matches
          if (draftResponse.data.message?.id === messageId) {
            logger.info(
              `Found draft ID ${draft.id} for message ID ${messageId}`
            );
            return draft.id;
          }
        } catch (error) {
          logger.warn(`Error checking draft ${draft.id}:`, error);
          continue;
        }
      }

      logger.warn(`No draft found with message ID: ${messageId}`);
      return null;
    } catch (error) {
      logger.error("Error finding draft by message ID:", error);
      throw new Error(`Failed to find draft: ${error}`);
    }
  }

  /**
   * Get all drafts from Gmail
   * @param maxResults - Maximum number of drafts to fetch
   * @returns Array of draft objects
   */
  async fetchDrafts(maxResults: number = 50) {
    try {
      // List drafts
      const listResponse = await this.gmail.users.drafts.list({
        userId: "me",
        maxResults,
      });

      const draftIds = listResponse.data.drafts || [];
      const drafts = [];

      // Fetch full draft details for each draft
      for (const draft of draftIds) {
        try {
          const draftResponse = await this.gmail.users.drafts.get({
            userId: "me",
            id: draft.id,
            format: "full",
          });

          const parsedDraft = this.parseDraftMessage(draftResponse.data);
          drafts.push(parsedDraft);
        } catch (error) {
          logger.error(`Error fetching draft ${draft.id}:`, error);
        }
      }

      return {
        drafts,
        totalDrafts: listResponse.data.resultSizeEstimate || 0,
      };
    } catch (error) {
      logger.error("Error fetching drafts:", error);
      throw new Error(`Failed to fetch drafts: ${error}`);
    }
  }

  /**
   * Send a draft as an email
   * @param draftId - ID of the draft to send
   * @returns Sent message details
   */
  async sendDraft(draftId: string) {
    try {
      const response = await this.gmail.users.drafts.send({
        userId: "me",
        requestBody: {
          id: draftId,
        },
      });

      logger.info("Draft sent successfully:", response.data.id);

      return {
        messageId: response.data.id,
        threadId: response.data.threadId,
        status: "sent",
      };
    } catch (error) {
      logger.error("Error sending draft:", error);
      throw new Error(`Failed to send draft: ${error}`);
    }
  }

  /**
   * Parse Gmail draft data into a standardized format
   * @param draft - Raw Gmail draft data
   * @returns Parsed draft object
   */
  private parseDraftMessage(draft: any) {
    const message = draft.message;
    const headers = message.payload.headers;
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
        ?.value || "";

    // Get email body (similar to parseEmailMessage)
    let htmlContent = "";
    let textContent = "";

    const extractBody = (payload: any) => {
      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === "text/html" && part.body.data) {
            htmlContent = Buffer.from(part.body.data, "base64").toString();
          } else if (part.mimeType === "text/plain" && part.body.data) {
            textContent = Buffer.from(part.body.data, "base64").toString();
          } else if (part.parts) {
            extractBody(part);
          }
        }
      } else if (payload.body.data) {
        if (payload.mimeType === "text/html") {
          htmlContent = Buffer.from(payload.body.data, "base64").toString();
        } else if (payload.mimeType === "text/plain") {
          textContent = Buffer.from(payload.body.data, "base64").toString();
        }
      }
    };

    extractBody(message.payload);

    return {
      id: draft.id,
      messageId: message.id,
      threadId: message.threadId,
      from: getHeader("From"),
      to: getHeader("To"),
      subject: getHeader("Subject"),
      htmlContent: htmlContent || textContent,
      textContent,
      snippet: message.snippet,
      bcc: getHeader("Bcc"),
      cc: getHeader("Cc"),
      createdAt: new Date(parseInt(message.internalDate) || Date.now()),
      status: "draft",
    };
  }

  /**
   * Get a specific email thread with all messages
   * @param threadId - The thread ID to fetch
   * @returns Thread with all messages
   */
  async getEmailThread(threadId: string) {
    try {
      logger.info("Fetching email thread:", threadId);

      const response = await this.gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const thread = response.data;
      const messages = [];

      // Parse each message in the thread
      for (const message of thread.messages || []) {
        const parsedMessage = await this.parseEmailMessage(message);
        messages.push(parsedMessage);
      }

      return {
        id: thread.id,
        historyId: thread.historyId,
        messages: messages.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        ), // Sort by date
        snippet: thread.snippet,
        messageCount: messages.length,
      };
    } catch (error) {
      logger.error("Error fetching email thread:", error);
      throw new Error(`Failed to fetch email thread: ${error}`);
    }
  }

  /**
   * Reply to an email (adds to existing thread)
   * @param replyData - Reply email data including threadId and original message details
   * @returns Sent reply details
   */
  async replyToEmail(replyData: {
    threadId: string;
    originalMessageId: string;
    to: string;
    subject: string;
    htmlContent: string;
    bcc?: string[];
    cc?: string[];
    from?: string;
    inReplyTo?: string;
    references?: string;
  }) {
    try {
      const {
        threadId,
        originalMessageId,
        to,
        subject,
        htmlContent,
        bcc = [],
        cc = [],
        from = "Bella | ImHereTravels <bella@imheretravels.com>",
        inReplyTo,
        references,
      } = replyData;

      // Create reply message with thread headers
      const message = this.createReplyMessage({
        to,
        subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
        htmlContent,
        bcc,
        cc,
        from,
        inReplyTo: inReplyTo || originalMessageId,
        references: references || originalMessageId,
      });

      // Send the reply
      const response = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: message,
          threadId: threadId,
        },
      });

      logger.info("Reply sent successfully:", response.data.id);

      return {
        messageId: response.data.id,
        threadId: response.data.threadId,
        status: "sent",
      };
    } catch (error) {
      logger.error("Error sending reply:", error);
      throw new Error(`Failed to send reply: ${error}`);
    }
  }

  /**
   * Get all threads (conversations) from Gmail
   * @param options - Filtering options for threads
   * @returns Array of thread objects
   */
  async fetchThreads(
    options: {
      maxResults?: number;
      query?: string;
      labelIds?: string[];
      pageToken?: string;
    } = {}
  ) {
    try {
      const {
        maxResults = 50,
        query = "in:sent OR in:inbox",
        labelIds,
        pageToken,
      } = options;

      logger.info("Fetching email threads with options:", options);

      // List threads
      const listResponse = await this.gmail.users.threads.list({
        userId: "me",
        maxResults,
        q: query,
        labelIds,
        pageToken,
      });

      const threadIds = listResponse.data.threads || [];
      const threads = [];

      // Fetch basic info for each thread (without full message content for performance)
      for (const threadInfo of threadIds) {
        try {
          const threadResponse = await this.gmail.users.threads.get({
            userId: "me",
            id: threadInfo.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });

          const thread = this.parseThreadMetadata(threadResponse.data);
          threads.push(thread);
        } catch (error) {
          logger.error(`Error fetching thread ${threadInfo.id}:`, error);
        }
      }

      return {
        threads,
        nextPageToken: listResponse.data.nextPageToken,
        resultSizeEstimate: listResponse.data.resultSizeEstimate,
      };
    } catch (error) {
      logger.error("Error fetching threads:", error);
      throw new Error(`Failed to fetch threads: ${error}`);
    }
  }

  /**
   * Forward an email to new recipients
   * @param forwardData - Forward email data
   * @returns Forwarded message details
   */
  async forwardEmail(forwardData: {
    originalMessageId: string;
    to: string;
    subject: string;
    htmlContent: string;
    forwardedContent: string;
    bcc?: string[];
    cc?: string[];
    from?: string;
  }) {
    try {
      const {
        to,
        subject,
        htmlContent,
        forwardedContent,
        bcc = [],
        cc = [],
        from = "Bella | ImHereTravels <bella@imheretravels.com>",
      } = forwardData;

      const fullContent = `
        ${htmlContent}
        <br><br>
        ---------- Forwarded message ----------<br>
        ${forwardedContent}
      `;

      // Create forward message
      const message = this.createEmailMessage({
        to,
        subject: subject.startsWith("Fwd: ") ? subject : `Fwd: ${subject}`,
        htmlContent: fullContent,
        bcc,
        cc,
        from,
      });

      // Send the forwarded email
      const response = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: message,
        },
      });

      logger.info("Email forwarded successfully:", response.data.id);

      return {
        messageId: response.data.id,
        threadId: response.data.threadId,
        status: "sent",
      };
    } catch (error) {
      logger.error("Error forwarding email:", error);
      throw new Error(`Failed to forward email: ${error}`);
    }
  }

  /**
   * Parse thread metadata for thread list view
   * @param thread - Raw Gmail thread data with metadata
   * @returns Parsed thread object
   */
  private parseThreadMetadata(thread: any) {
    const messages = thread.messages || [];
    const latestMessage = messages[messages.length - 1];
    const firstMessage = messages[0];

    const getHeader = (message: any, name: string) => {
      const headers = message.payload.headers;
      return (
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
          ?.value || ""
      );
    };

    // Determine participants
    const participants = new Set<string>();
    messages.forEach((msg: any) => {
      const from = getHeader(msg, "From");
      const to = getHeader(msg, "To");
      if (from) participants.add(from);
      if (to) participants.add(to);
    });

    return {
      id: thread.id,
      historyId: thread.historyId,
      snippet: thread.snippet,
      messageCount: messages.length,
      subject: getHeader(firstMessage, "Subject"),
      participants: Array.from(participants),
      latestFrom: getHeader(latestMessage, "From"),
      latestDate: new Date(parseInt(latestMessage.internalDate)),
      firstDate: new Date(parseInt(firstMessage.internalDate)),
      labels: latestMessage.labelIds || [],
      isUnread: latestMessage.labelIds?.includes("UNREAD") || false,
      hasAttachments: this.checkForAttachments(latestMessage),
    };
  }

  /**
   * Check if a message has attachments
   * @param message - Gmail message object
   * @returns Boolean indicating if message has attachments
   */
  private checkForAttachments(message: any): boolean {
    const checkParts = (parts: any[]): boolean => {
      if (!parts) return false;

      for (const part of parts) {
        if (part.filename && part.filename.length > 0) {
          return true;
        }
        if (part.parts && checkParts(part.parts)) {
          return true;
        }
      }
      return false;
    };

    return checkParts(message.payload.parts || []);
  }

  /**
   * Fetch attachment data buffer using Gmail API
   * @param messageId - Gmail message ID
   * @param attachmentId - Attachment ID
   * @returns Buffer containing attachment data
   */
  private async fetchAttachmentBuffer(
    messageId: string,
    attachmentId: string
  ): Promise<Buffer> {
    try {
      const attachmentResponse =
        await this.gmail.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: attachmentId,
        });

      const attachmentData = attachmentResponse.data?.data;
      if (!attachmentData) {
        logger.warn(
          `No data returned for attachment ${attachmentId} on message ${messageId}`
        );
        return Buffer.alloc(0);
      }

      return Buffer.from(attachmentData, "base64url");
    } catch (error) {
      logger.error(
        `Failed to fetch attachment ${attachmentId} for message ${messageId}:`,
        error
      );
      return Buffer.alloc(0);
    }
  }

  /**
   * Normalize a Content-ID header value
   * @param contentId - Content-ID header raw value
   * @returns Normalized content ID without angle brackets
   */
  private normalizeContentId(contentId: string): string {
    return contentId.replace(/[<>]/g, "").trim().toLowerCase();
  }

  /**
   * Clean Gmail-specific HTML elements and attributes
   * @param html - Raw HTML content from Gmail
   * @returns Cleaned HTML suitable for display
   */
  private cleanGmailHtml(html: string): string {
    if (!html) return html;

    let cleaned = html;

    // Remove Gmail UI overlay elements
    cleaned = cleaned.replace(/<div class="a6S"[^>]*>.*?<\/div>/gs, "");

    // Remove Gmail button elements and their containers
    cleaned = cleaned.replace(
      /<button[^>]*class="[^"]*VYBDae[^"]*"[^>]*>.*?<\/button>/gs,
      ""
    );
    cleaned = cleaned.replace(
      /<span[^>]*class="[^"]*VYBDae[^"]*"[^>]*>.*?<\/span>/gs,
      ""
    );

    // Remove tooltip elements
    cleaned = cleaned.replace(/<div[^>]*id="tt-c[^"]*"[^>]*>.*?<\/div>/gs, "");

    // Remove SVG icons and UI elements
    cleaned = cleaned.replace(/<svg[^>]*>.*?<\/svg>/gs, "");

    // Remove Gmail-specific span elements with UI classes
    cleaned = cleaned.replace(
      /<span[^>]*class="[^"]*(?:OiePBf-zPjgPe|bHC-Q|VYBDae-JX-ank-Rtc0Jf|notranslate|bzc-ank)[^"]*"[^>]*>.*?<\/span>/gs,
      ""
    );

    // Clean up Gmail data attributes
    cleaned = cleaned.replace(
      /\s+data-(?:idom-class|use-native-focus-logic|tooltip-[^=]*|is-tooltip-wrapper)="[^"]*"/gi,
      ""
    );

    // Remove js attributes
    cleaned = cleaned.replace(
      /\s+js(?:action|controller|name|log)="[^"]*"/gi,
      ""
    );

    // Remove aria attributes from interactive elements we're removing
    cleaned = cleaned.replace(/\s+aria-(?:label|hidden)="[^"]*"/gi, "");

    // Remove tabindex from images
    cleaned = cleaned.replace(/(<img[^>]*)\s+tabindex="[^"]*"/gi, "$1");

    // Remove crossorigin attributes from images
    cleaned = cleaned.replace(/(<img[^>]*)\s+crossorigin="[^"]*"/gi, "$1");

    // Clean up empty elements that might be left behind
    cleaned = cleaned.replace(/<([^>\/]+)>\s*<\/\1>/gi, "");

    // Remove multiple consecutive spaces
    cleaned = cleaned.replace(/\s{2,}/g, " ");

    return cleaned;
  }

  /**
   * Inline CID-referenced attachments into HTML content
   * @param html - HTML content string
   * @param attachments - Map of normalized content IDs to attachment data
   * @returns HTML with CID references replaced with data URIs
   */
  private inlineCidAttachments(
    html: string,
    attachments: Record<string, { base64: string; mimeType: string }>
  ): string {
    const cidRegex = /cid:([^"'<>\s]+)/gi;

    return html.replace(cidRegex, (match, cid) => {
      const normalizedCid = this.normalizeContentId(cid);
      const attachment = attachments[normalizedCid];

      if (!attachment) {
        return match;
      }

      return `data:${attachment.mimeType};base64,${attachment.base64}`;
    });
  }

  /**
   * Create a reply message with proper threading headers
   * @param replyData - Reply email data
   * @returns Base64 encoded reply message
   */
  private createReplyMessage(replyData: {
    to: string;
    subject: string;
    htmlContent: string;
    bcc?: string[];
    cc?: string[];
    from?: string;
    inReplyTo?: string;
    references?: string;
  }): string {
    const {
      to,
      subject,
      htmlContent,
      bcc = [],
      cc = [],
      from,
      inReplyTo,
      references,
    } = replyData;

    const lines = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
    ];

    if (cc.length > 0) {
      lines.push(`Cc: ${cc.join(", ")}`);
    }

    if (bcc.length > 0) {
      lines.push(`Bcc: ${bcc.join(", ")}`);
    }

    if (inReplyTo) {
      lines.push(`In-Reply-To: ${inReplyTo}`);
    }

    if (references) {
      lines.push(`References: ${references}`);
    }

    lines.push("");
    lines.push(htmlContent);

    const message = lines.join("\r\n");
    return Buffer.from(message).toString("base64url");
  }

  /**
   * Star an email (add the STARRED label)
   * @param messageId - Gmail message ID
   * @returns Promise with success status
   */
  async starEmail(messageId: string) {
    try {
      await this.gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          addLabelIds: ["STARRED"],
        },
      });

      logger.info("Email starred successfully:", messageId);
      return { success: true };
    } catch (error) {
      logger.error("Error starring email:", error);
      throw new Error(`Failed to star email: ${error}`);
    }
  }

  /**
   * Unstar an email (remove the STARRED label)
   * @param messageId - Gmail message ID
   * @returns Promise with success status
   */
  async unstarEmail(messageId: string) {
    try {
      await this.gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          removeLabelIds: ["STARRED"],
        },
      });

      logger.info("Email unstarred successfully:", messageId);
      return { success: true };
    } catch (error) {
      logger.error("Error unstarring email:", error);
      throw new Error(`Failed to unstar email: ${error}`);
    }
  }

  /**
   * Toggle star status of an email
   * @param messageId - Gmail message ID
   * @param isStarred - Current starred status
   * @returns Promise with success status and new starred status
   */
  async toggleStarEmail(messageId: string, isStarred: boolean) {
    try {
      if (isStarred) {
        await this.unstarEmail(messageId);
        return { success: true, isStarred: false };
      } else {
        await this.starEmail(messageId);
        return { success: true, isStarred: true };
      }
    } catch (error) {
      logger.error("Error toggling star status:", error);
      throw new Error(`Failed to toggle star status: ${error}`);
    }
  }

  /**
   * Get the subject line of a Gmail draft by message ID
   * @param messageId - Gmail message ID (extracted from the compose URL)
   * @returns Subject line of the draft
   */
  async getDraftSubject(messageId: string): Promise<string> {
    try {
      logger.info(`Fetching subject for message/draft: ${messageId}`);

      // Get the message
      const response = await this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "metadata",
        metadataHeaders: ["Subject"],
      });

      const headers = response.data.payload?.headers || [];
      const subjectHeader = headers.find(
        (h: any) => h.name.toLowerCase() === "subject"
      );

      const subject = subjectHeader?.value || "(no subject)";
      logger.info(`Subject for message ${messageId}: ${subject}`);

      return subject;
    } catch (error) {
      logger.error(`Error fetching subject for message ${messageId}:`, error);
      throw new Error(
        `Failed to fetch draft subject: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

export default GmailApiService;
