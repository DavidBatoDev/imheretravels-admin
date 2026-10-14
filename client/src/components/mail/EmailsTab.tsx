"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { staffFetch } from "@/lib/staff-fetch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmailViewModal } from "./EmailViewModal";
import { ComposeEmail } from "./ComposeEmail";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Search,
  Mail,
  CheckCircle,
  AlertCircle,
  Eye,
  Calendar,
  User,
  FileText,
  MoreVertical,
  RotateCcw,
  Inbox,
  Send as SendIcon,
  Archive,
  Star,
  StarOff,
  Trash2,
  Edit,
  Reply,
  Forward,
  ChevronDown,
  Filter,
  SortAsc,
  SortDesc,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Separator } from "../ui/separator";

// Gmail Attachment type
interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string; // For inline attachments (cid: references)
}

// Gmail Email type
interface GmailEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: Date;
  htmlContent: string;
  textContent: string;
  labels: string[];
  snippet: string;
  isRead: boolean;
  isSent: boolean;
  isReceived: boolean;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  mailType?: string; // 'reply', 'replyAll', 'forward', 'new'
  bcc?: string;
  cc?: string;
  isStarred?: boolean;
  hasAttachments?: boolean;
  attachments?: GmailAttachment[];
  isImportant?: boolean;
  threadMessageCount?: number; // Number of messages in this conversation thread
  fromAvatarUrl?: string; // Avatar URL for sender
  toAvatarUrl?: string; // Avatar URL for recipient
  isDraft?: boolean; // Whether this is a draft email
}

// Gmail Label type
interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messagesTotal?: number;
  messagesUnread?: number;
}

const gmailCategories = [
  {
    id: "inbox",
    label: "Inbox",
    icon: Inbox,
    query: "in:inbox",
    count: 0,
    unreadCount: 0,
  },
  {
    id: "sent",
    label: "Sent",
    icon: SendIcon,
    query: "in:sent",
    count: 0,
    unreadCount: 0,
  },
  {
    id: "drafts",
    label: "Drafts",
    icon: Edit,
    query: "in:drafts",
    count: 0,
    unreadCount: 0,
  },
  {
    id: "starred",
    label: "Starred",
    icon: Star,
    query: "is:starred",
    count: 0,
    unreadCount: 0,
  },
  {
    id: "important",
    label: "Important",
    icon: AlertCircle,
    query: "is:important",
    count: 0,
    unreadCount: 0,
  },
  {
    id: "all",
    label: "All Mail",
    icon: Mail,
    query: "in:sent OR in:inbox",
    count: 0,
    unreadCount: 0,
  },
  {
    id: "spam",
    label: "Spam",
    icon: AlertCircle,
    query: "in:spam",
    count: 0,
    unreadCount: 0,
  },
  {
    id: "trash",
    label: "Trash",
    icon: Trash2,
    query: "in:trash",
    count: 0,
    unreadCount: 0,
  },
];

// Shared cache that persists across component unmounts
const emailCacheRef = { categoryEmails: new Map<string, GmailEmail[]>() };

export default function EmailsTab() {
  const [emails, setEmails] = useState<GmailEmail[]>([]);
  const [emailCache, setEmailCache] = useState<Map<string, GmailEmail>>(
    new Map()
  );
  const emailCacheRefLocal = useRef(emailCache); // Ref for background refresh
  const skipHashCloseRef = useRef(false); // Ref to track if we should skip closing on hash change

  // Keep ref in sync with state
  useEffect(() => {
    emailCacheRefLocal.current = emailCache;
  }, [emailCache]);

  const [categoryEmails, setCategoryEmailsState] = useState<
    Map<string, GmailEmail[]>
  >(() => emailCacheRef.categoryEmails); // Initialize from persistent cache

  // Initialize activeCategory from URL hash
  const getInitialCategory = () => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.slice(1); // Remove '#'
      // Extract query string first, then category (before any '/')
      const [hashWithoutQuery] = hash.split("?");
      const categoryPart = hashWithoutQuery.split("/")[0];
      if (
        categoryPart &&
        gmailCategories.some((cat) => cat.id === categoryPart)
      ) {
        return categoryPart;
      }
    }
    return "inbox";
  };

  // Wrapper to keep ref in sync with state
  const setCategoryEmails = (
    updater: (prev: Map<string, GmailEmail[]>) => Map<string, GmailEmail[]>
  ) => {
    setCategoryEmailsState((prev) => {
      const newMap = updater(prev);
      // Update persistent cache
      emailCacheRef.categoryEmails = newMap;
      return newMap;
    });
  };

  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<GmailEmail | null>(null);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingFullContent, setIsLoadingFullContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(getInitialCategory);
  const [isCategoryChanging, setIsCategoryChanging] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "sender" | "subject">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [lastFetchTime, setLastFetchTime] = useState<Map<string, number>>(
    new Map()
  );
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // Compose email state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeType, setComposeType] = useState<"new" | "reply" | "forward">(
    "new"
  );
  const [composeData, setComposeData] = useState<{
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    body?: string;
    replyToEmail?: GmailEmail;
  }>({});

  // Draft to open in EmailViewModal
  const [draftToOpenInViewer, setDraftToOpenInViewer] = useState<{
    draftId: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    mailType?: string;
  } | null>(null);

  // Check if we should use cached data
  const shouldUseCachedData = (cacheKey: string) => {
    const lastFetch = lastFetchTime.get(cacheKey);
    if (!lastFetch) return false;

    // Use cache for 30 seconds to avoid unnecessary API calls
    const cacheTimeout = 30 * 1000;
    const isCacheValid = Date.now() - lastFetch < cacheTimeout;

    // Check if we have emails for the current category in our category cache
    const categoryKey = activeCategory;
    const hasEmailsForCategory =
      categoryEmails.has(categoryKey) &&
      (categoryEmails.get(categoryKey)?.length || 0) > 0;

    return isCacheValid && hasEmailsForCategory;
  };

  // Refresh drafts list (called when a new draft is saved)
  const refreshDrafts = () => {
    if (activeCategory === "drafts") {
      // Clear category cache for drafts to force fresh fetch
      setCategoryEmails((prev) => {
        const newMap = new Map(prev);
        newMap.delete("drafts");
        return newMap;
      });
      fetchEmails(undefined, undefined, true); // Force refresh
    }
  };

  // Fetch emails from Gmail (optimized with caching)
  const fetchEmails = async (
    searchQuery?: string,
    pageToken?: string,
    forceRefresh = false
  ): Promise<GmailEmail[] | undefined> => {
    // Cancel any ongoing request
    if (abortController) {
      abortController.abort();
    }

    // Create new abort controller for this request
    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    const cacheKey = `${activeCategory}-${searchQuery || ""}-${
      pageToken || ""
    }`;

    // Check cache first (unless force refresh)
    if (!forceRefresh && shouldUseCachedData(cacheKey)) {
      console.log("Using cached data for", cacheKey);
      // Restore emails for this category from cache
      const categoryKey = activeCategory;
      const cachedEmails = categoryEmails.get(categoryKey) || [];
      setEmails(cachedEmails);
      return cachedEmails;
    }

    setIsLoading(true);
    setError(null);

    try {
      let fetchedEmails: GmailEmail[] = [];

      // Handle drafts separately
      if (activeCategory === "drafts") {
        const response = await staffFetch("/api/gmail/drafts/list", {
          signal: newAbortController.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result?.success) {
          fetchedEmails = result.drafts.map((draft: any) => ({
            ...draft,
            date: new Date(draft.date),
          }));
        } else {
          throw new Error(result.error || "Failed to fetch drafts");
        }
      } else {
        // Get query for active category
        const category = gmailCategories.find(
          (cat) => cat.id === activeCategory
        );
        let query = category?.query || "in:sent OR in:inbox";

        if (searchQuery) {
          query = `${query} ${searchQuery}`;
        }

        // Call Next.js API route instead of Firebase Functions
        const response = await staffFetch("/api/gmail/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxResults: 25, // Reduced for faster loading
            query,
            pageToken,
            searchQuery: searchQuery || undefined,
          }),
          signal: newAbortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result?.success) {
          fetchedEmails = result.data.emails.map((email: any) => {
            return {
              ...email,
              // Convert ISO string back to Date object
              date: new Date(email.date),
            };
          });
          setNextPageToken(result.data.nextPageToken || null);
        } else {
          throw new Error(result.error || "Failed to fetch emails");
        }
      }

      // Check if request was aborted before updating state
      if (newAbortController.signal.aborted) {
        console.log("Request aborted, not updating state");
        return undefined;
      }

      // Update cache
      const newCache = new Map(emailCache);
      fetchedEmails.forEach((email: GmailEmail) => {
        newCache.set(email.id, email);
      });
      setEmailCache(newCache);

      if (pageToken) {
        // Append to existing emails for pagination
        // Remove duplicates by threadId to avoid showing same thread multiple times
        const seenThreadIds = new Set(emails.map((e) => e.threadId));
        const uniqueNewEmails = fetchedEmails.filter(
          (e) => !seenThreadIds.has(e.threadId)
        );
        const newEmails = [...emails, ...uniqueNewEmails];
        setEmails(newEmails);
        // Update category cache
        setCategoryEmails((prev) =>
          new Map(prev).set(activeCategory, newEmails)
        );
      } else {
        // Replace emails for new search/filter
        // Remove duplicates by threadId
        const uniqueEmails = fetchedEmails.filter(
          (email, index, self) =>
            index === self.findIndex((e) => e.threadId === email.threadId)
        );
        setEmails(uniqueEmails);
        // Update category cache
        setCategoryEmails((prev) =>
          new Map(prev).set(activeCategory, uniqueEmails)
        );
      }

      // Update last fetch time
      const newFetchTimes = new Map(lastFetchTime);
      newFetchTimes.set(cacheKey, Date.now());
      setLastFetchTime(newFetchTimes);

      // Show success toast for manual refreshes
      if (forceRefresh && !pageToken && !searchQuery) {
        toast({
          title: "Success",
          description: `Loaded ${fetchedEmails.length} ${
            activeCategory === "drafts" ? "drafts" : "emails"
          }`,
          variant: "default",
        });
      }

      return fetchedEmails;
    } catch (error: any) {
      // Don't show error if request was aborted (user switched categories)
      if (error.name === "AbortError") {
        console.log("Request aborted for category switch");
        return undefined;
      }

      console.error("Error fetching emails:", error);
      setError(error.message || "Failed to fetch emails");
      toast({
        title: "Error",
        description: "Failed to fetch emails from Gmail",
        variant: "destructive",
      });
      return undefined;
    } finally {
      setIsLoading(false);
    }
  };

  // Sanitize Gmail HTML content
  const sanitizeGmailHtml = (
    html: string,
    email?: GmailEmail,
    messageId?: string
  ): string => {
    if (!html) return html;

    // Remove Gmail-specific interactive elements and buttons
    let sanitized = html;

    // Note: cid: references are already processed on the server side
    // to base64 data URLs during email fetch, so no need to handle them here

    // Remove Gmail download buttons and overlays
    sanitized = sanitized.replace(/<div class="a6S"[^>]*>.*?<\/div>/gs, "");

    // Remove Gmail button elements
    sanitized = sanitized.replace(
      /<button[^>]*class="[^"]*VYBDae[^"]*"[^>]*>.*?<\/button>/gs,
      ""
    );

    // Remove tooltip elements
    sanitized = sanitized.replace(
      /<div[^>]*id="tt-c[^"]*"[^>]*>.*?<\/div>/gs,
      ""
    );

    // Remove SVG icons from Gmail UI
    sanitized = sanitized.replace(
      /<svg[^>]*class="[^"]*aoH[^"]*"[^>]*>.*?<\/svg>/gs,
      ""
    );

    // Remove span elements with Gmail UI classes
    sanitized = sanitized.replace(
      /<span[^>]*class="[^"]*(?:OiePBf-zPjgPe|bHC-Q|VYBDae-JX-ank-Rtc0Jf)[^"]*"[^>]*>.*?<\/span>/gs,
      ""
    );

    // Clean up empty elements
    sanitized = sanitized.replace(/<([^>]+)>\s*<\/\1>/g, "");

    // Remove data attributes that are Gmail-specific
    sanitized = sanitized.replace(/\s+data-[^=]*="[^"]*"/g, "");

    // Remove jsaction and jscontroller attributes
    sanitized = sanitized.replace(
      /\s+js(?:action|controller|name|log)="[^"]*"/g,
      ""
    );

    // Remove tabindex from images (Gmail adds these)
    sanitized = sanitized.replace(/\s+tabindex="[^"]*"/g, "");

    return sanitized;
  };

  // Helper function to escape regex special characters
  const escapeRegExp = (string: string): string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  // Fetch full email content on demand
  const fetchFullEmailContent = async (messageId: string) => {
    // Check cache first
    const cachedEmail = emailCache.get(messageId);
    if (cachedEmail?.htmlContent || cachedEmail?.textContent) {
      return cachedEmail;
    }

    setIsLoadingFullContent(true);
    try {
      // Call Next.js API route instead of Firebase Functions
      const response = await staffFetch(`/api/gmail/emails/${messageId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result?.success) {
        const fullEmail = {
          ...result.data,
          // Convert ISO string back to Date object
          date: new Date(result.data.date),
          // Sanitize HTML content with cid: replacements
          htmlContent: result.data.htmlContent
            ? sanitizeGmailHtml(result.data.htmlContent, result.data, messageId)
            : result.data.htmlContent,
        };

        // Update cache with full content
        const newCache = new Map(emailCache);
        newCache.set(messageId, fullEmail);
        setEmailCache(newCache);

        return fullEmail;
      } else {
        throw new Error(result.error || "Failed to fetch full email content");
      }
    } catch (error: any) {
      console.error("Error fetching full email content:", error);
      toast({
        title: "Error",
        description: "Failed to load email content",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoadingFullContent(false);
    }
  };

  // Fetch Gmail labels
  const fetchLabels = async () => {
    try {
      // Call Next.js API route instead of Firebase Functions
      const response = await staffFetch("/api/gmail/labels", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result?.success) {
        setLabels(result.data);
      } else {
        throw new Error(result.error || "Failed to fetch labels");
      }
    } catch (error: any) {
      console.error("Error fetching labels:", error);
    }
  };

  // Search emails
  const handleSearch = () => {
    if (searchTerm.trim()) {
      fetchEmails(searchTerm.trim());
    } else {
      fetchEmails();
    }
  };

  // Track pending category change when loading
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  // Handle category change
  const handleCategoryChange = (categoryId: string) => {
    // If currently loading, queue the category change
    if (isLoading) {
      setPendingCategory(categoryId);
      return;
    }

    // Only show loading if changing to a different category
    if (categoryId !== activeCategory) {
      setIsCategoryChanging(true);
    }
    setActiveCategory(categoryId);
    // Update URL hash, preserving compose parameter if it exists
    if (typeof window !== "undefined") {
      const currentHash = window.location.hash.slice(1);
      const [currentCategoryPath, queryString] = currentHash.split("?");

      // Preserve the compose query parameter
      const newHash = queryString ? `${categoryId}?${queryString}` : categoryId;
      window.location.hash = newHash;
    }
    // Don't clear emails immediately - let useEffect load cached data
    // setEmails([]); // Clear current emails
    setNextPageToken(null); // Reset pagination
    setSelectedEmails(new Set()); // Clear selections
  };

  // Load more emails (pagination)
  const loadMoreEmails = async () => {
    if (nextPageToken && !isLoadingMore) {
      setIsLoadingMore(true);
      try {
        await fetchEmails(searchTerm || undefined, nextPageToken);
      } finally {
        setIsLoadingMore(false);
      }
    }
  };

  // View email details (with on-demand content loading)
  const viewEmail = useCallback(
    async (email: GmailEmail, updateHash = true) => {
      setSelectedEmail(email);
      setIsViewDialogOpen(true);

      // Update URL hash with email ID for deep linking (unless explicitly disabled)
      if (updateHash && typeof window !== "undefined") {
        // Use threadId for better compatibility with Gmail's URL structure
        const deepLinkId = email.threadId || email.id;
        const expectedHash = `${activeCategory}/${deepLinkId}`;
        const currentHash = window.location.hash.slice(1);

        if (currentHash !== expectedHash) {
          window.location.hash = expectedHash;
        }
      }

      // Mark email as read if it's unread
      if (!email.isRead) {
        try {
          const response = await staffFetch(`/api/gmail/emails/${email.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "markAsRead" }),
          });

          if (response.ok) {
            // Update local state to mark as read
            setSelectedEmail({ ...email, isRead: true });
            setEmailCache((prev) => {
              const newCache = new Map(prev);
              const cachedEmail = newCache.get(email.id);
              if (cachedEmail) {
                newCache.set(email.id, { ...cachedEmail, isRead: true });
              }
              return newCache;
            });

            // Update in emails list
            setEmails((prevEmails) =>
              prevEmails.map((e) =>
                e.id === email.id ? { ...e, isRead: true } : e
              )
            );

            // Update in category emails cache
            setCategoryEmails((prev) => {
              const newMap = new Map(prev);
              const categoryEmailsList = newMap.get(activeCategory);
              if (categoryEmailsList) {
                const updatedList = categoryEmailsList.map((e) =>
                  e.id === email.id ? { ...e, isRead: true } : e
                );
                newMap.set(activeCategory, updatedList);

                // Update persistent cache
                emailCacheRef.categoryEmails.set(activeCategory, updatedList);
              }
              return newMap;
            });
          }
        } catch (error) {
          console.error("Error marking email as read:", error);
        }
      }

      // Load full content if not already cached
      if (!email.htmlContent && !email.textContent) {
        const fullEmail = await fetchFullEmailContent(email.id);
        if (fullEmail) {
          setSelectedEmail(fullEmail);
        }
      }
    },
    [activeCategory, setEmailCache, setCategoryEmails]
  );

  // Handle email modal close - update URL hash
  const handleCloseEmail = useCallback(() => {
    setIsViewDialogOpen(false);
    setSelectedEmail(null);

    // Remove email ID from hash, keep category
    if (typeof window !== "undefined") {
      window.location.hash = activeCategory;
    }
  }, [activeCategory]);

  // Function to get Gmail URL with current params
  const getGmailUrl = useCallback(() => {
    if (typeof window !== "undefined") {
      const pathname = window.location.pathname; // e.g., /mail/u/0
      const hash = window.location.hash; // e.g., #inbox/19a1c05bb56b9a65
      return `https://mail.google.com${pathname}${hash}`;
    }
    return "https://mail.google.com";
  }, []);

  // Memoized callbacks for EmailViewModal
  const handleEmailViewModalOpenChange = useCallback(
    (open: boolean) => {
      console.log(
        "EmailViewModal onOpenChange called, open:",
        open,
        "skipHashCloseRef:",
        skipHashCloseRef.current
      );
      if (!open) {
        handleCloseEmail();
        // Reset draft when closing modal
        setDraftToOpenInViewer(null);
      }
    },
    [handleCloseEmail]
  );

  const handleGmailOpen = useCallback(() => {
    window.open(getGmailUrl(), "_blank");
  }, [getGmailUrl]);

  // Get email type badge
  const getEmailTypeBadge = (email: GmailEmail) => {
    if (email.isDraft) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-200">
          Draft
        </Badge>
      );
    }
    if (email.isSent) {
      return (
        <Badge className="bg-green-100 text-green-800 border border-green-200">
          Sent
        </Badge>
      );
    }
    if (email.isReceived && !email.isRead) {
      return (
        <Badge className="bg-orange-100 text-orange-800 border border-orange-200">
          Unread
        </Badge>
      );
    }
    if (email.isReceived) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border border-blue-200">
          Received
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-100 text-gray-800 border border-gray-200">
        Unknown
      </Badge>
    );
  };

  // Extract name from email string (removes email address part)
  const extractNameFromEmail = (emailString: string) => {
    if (!emailString) return "Unknown";

    // Handle format "Name <email@domain.com>"
    const match = emailString.match(/^(.+?)\s*<.+@.+>$/);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, ""); // Remove quotes if present
    }

    // Handle format "email@domain.com" (just email, no name)
    if (emailString.includes("@")) {
      const emailPart = emailString.split("@")[0];
      return emailPart
        .replace(/[._]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
    }

    // Return as-is if no email format detected
    return emailString;
  };

  // Get sender/recipient display
  const getCorrespondent = (email: GmailEmail) => {
    if (email.isSent) {
      // For sent emails, show "To: <email>, <number of other emails and bcc>"
      const toEmails = email.to ? email.to.split(",").map((e) => e.trim()) : [];
      const ccEmails = email.cc ? email.cc.split(",").map((e) => e.trim()) : [];
      const bccEmails = email.bcc
        ? email.bcc.split(",").map((e) => e.trim())
        : [];

      const totalOtherEmails = ccEmails.length + bccEmails.length;

      if (toEmails.length === 0) {
        return "To: (no recipients)";
      }

      const firstEmail = toEmails[0];
      const otherCount = toEmails.length - 1 + totalOtherEmails;

      if (otherCount === 0) {
        return `To: ${firstEmail}`;
      } else {
        return `To: ${firstEmail}, +${otherCount}`;
      }
    } else {
      // For received emails, show sender name
      return extractNameFromEmail(email.from);
    }
  };

  // Format date
  const formatDate = (date: Date) => {
    // Check if date is valid
    if (!date || isNaN(date.getTime())) {
      return "Unknown";
    }

    try {
      const now = new Date();
      const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 24 && diffInHours >= 0) {
        return date.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: diffInHours > 8760 ? "numeric" : undefined,
      });
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Unknown";
    }
  };

  // Toggle email selection
  const toggleEmailSelection = (emailId: string) => {
    const newSelection = new Set(selectedEmails);
    if (newSelection.has(emailId)) {
      newSelection.delete(emailId);
    } else {
      newSelection.add(emailId);
    }
    setSelectedEmails(newSelection);
  };

  // Toggle star status
    const toggleStar = async (emailId: string, isStarred?: boolean) => {
      try {
        // Coerce undefined to a boolean to satisfy the API
        const starState = !!isStarred;
  
        const response = await staffFetch("/api/gmail/star", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messageId: emailId,
            isStarred: starState,
          }),
        });
  
        const result = await response.json();
  
        if (result.success) {
          // Update the email in the emails array
          setEmails((prevEmails) =>
            prevEmails.map((email) =>
              email.id === emailId
                ? { ...email, isStarred: result.isStarred }
                : email
            )
          );
  
          // Update category cache
          setCategoryEmails((prev) => {
            const newMap = new Map(prev);
            const categoryEmails = newMap.get(activeCategory) || [];
            const updatedEmails = categoryEmails.map((email) =>
              email.id === emailId
                ? { ...email, isStarred: result.isStarred }
                : email
            );
            newMap.set(activeCategory, updatedEmails);
            return newMap;
          });
  
          // Trigger background refresh after a delay to get updated data
          setTimeout(() => {
            handleManualRefresh();
          }, 500);
        }
      } catch (error) {
        console.error("Error toggling star:", error);
        toast({
          title: "Error",
          description: "Failed to update star status",
          variant: "destructive",
        });
      }
    };

  // Archive email
  const handleArchiveEmail = async (email: GmailEmail) => {
    try {
      // For drafts, we can't archive them
      // Draft IDs start with 'r' followed by digits (e.g., r7824841817848189022)
      const isDraftId = /^r\d/.test(email.id);
      if (email.isDraft || isDraftId) {
        toast({
          title: "Info",
          description: "Drafts cannot be archived. Please delete instead.",
          variant: "default",
        });
        return;
      }

      // For regular emails, use the Gmail API message ID
      const response = await staffFetch("/api/gmail/emails/" + email.id, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "archive" }),
      });

      const result = await response.json();

      if (result.success) {
        // Remove email from current list
        setEmails((prevEmails) => prevEmails.filter((e) => e.id !== email.id));
        setCategoryEmails((prev) => {
          const newMap = new Map(prev);
          const categoryEmails = newMap.get(activeCategory) || [];
          const filteredEmails = categoryEmails.filter(
            (e) => e.id !== email.id
          );
          newMap.set(activeCategory, filteredEmails);
          return newMap;
        });

        toast({
          title: "Success",
          description: "Email archived",
        });
      }
    } catch (error) {
      console.error("Error archiving email:", error);
      toast({
        title: "Error",
        description: "Failed to archive email",
        variant: "destructive",
      });
    }
  };

  // Delete email
  const handleDeleteEmail = async (email: GmailEmail) => {
    try {
      // For drafts, use draft deletion endpoint
      const isDraftIdPattern = /^r\d/.test(email.id);
      if (email.isDraft || isDraftIdPattern) {
        const draftResponse = await staffFetch(
          "/api/gmail/drafts?draftId=" + email.id,
          {
            method: "DELETE",
          }
        );

        const draftResult = await draftResponse.json();

        if (draftResult.success) {
          setEmails((prevEmails) =>
            prevEmails.filter((e) => e.id !== email.id)
          );
          setCategoryEmails((prev) => {
            const newMap = new Map(prev);
            const categoryEmails = newMap.get(activeCategory) || [];
            const filteredEmails = categoryEmails.filter(
              (e) => e.id !== email.id
            );
            newMap.set(activeCategory, filteredEmails);
            return newMap;
          });

          toast({
            title: "Success",
            description: "Draft deleted",
          });
        }
        return;
      }

      // For regular emails, use the Gmail API message ID
      const response = await staffFetch("/api/gmail/emails/" + email.id, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "trash" }),
      });

      const result = await response.json();

      if (result.success) {
        // Remove email from current list
        setEmails((prevEmails) => prevEmails.filter((e) => e.id !== email.id));
        setCategoryEmails((prev) => {
          const newMap = new Map(prev);
          const categoryEmails = newMap.get(activeCategory) || [];
          const filteredEmails = categoryEmails.filter(
            (e) => e.id !== email.id
          );
          newMap.set(activeCategory, filteredEmails);
          return newMap;
        });

        toast({
          title: "Success",
          description: "Email moved to trash",
        });
      }
    } catch (error) {
      console.error("Error deleting email:", error);
      toast({
        title: "Error",
        description: "Failed to delete email",
        variant: "destructive",
      });
    }
  };

  // Toggle read status
  const handleToggleReadStatus = async (email: GmailEmail) => {
    try {
      // For drafts, we can't mark them as read/unread
      const isDraftId = /^r\d/.test(email.id);
      if (email.isDraft || isDraftId) {
        toast({
          title: "Info",
          description: "Cannot change read status for drafts.",
          variant: "default",
        });
        return;
      }

      const action = email.isRead ? "markAsUnread" : "markAsRead";

      // For regular emails, use the Gmail API message ID
      const response = await staffFetch("/api/gmail/emails/" + email.id, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const result = await response.json();

      if (result.success) {
        const newReadStatus = !email.isRead;

        // Update email cache
        setEmailCache((prev) => {
          const newCache = new Map(prev);
          const cachedEmail = newCache.get(email.id);
          if (cachedEmail) {
            newCache.set(email.id, { ...cachedEmail, isRead: newReadStatus });
          }
          return newCache;
        });

        // Update in emails list
        setEmails((prevEmails) =>
          prevEmails.map((e) =>
            e.id === email.id ? { ...e, isRead: newReadStatus } : e
          )
        );

        // Update in category emails cache
        setCategoryEmails((prev) => {
          const newMap = new Map(prev);
          const categoryEmails = newMap.get(activeCategory) || [];
          const updatedList = categoryEmails.map((e) =>
            e.id === email.id ? { ...e, isRead: newReadStatus } : e
          );
          newMap.set(activeCategory, updatedList);
          emailCacheRef.categoryEmails.set(activeCategory, updatedList);
          return newMap;
        });

        toast({
          title: "Success",
          description: email.isRead
            ? "Email marked as unread"
            : "Email marked as read",
        });
      }
    } catch (error) {
      console.error("Error toggling read status:", error);
      toast({
        title: "Error",
        description: "Failed to update read status",
        variant: "destructive",
      });
    }
  };

  // Select all emails
  const selectAllEmails = () => {
    if (selectedEmails.size === filteredEmails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(filteredEmails.map((email) => email.id)));
    }
  };

  // Get avatar initials
  const getAvatarInitials = (email: string) => {
    const name = email.split("@")[0];
    return name.charAt(0).toUpperCase();
  };

  // Get conversation count for a thread
  const getConversationCount = (email: GmailEmail) => {
    // Use the thread message count from Gmail API if available
    return email.threadMessageCount || 1;
  };

  // Get draft type label
  const getDraftTypeLabel = (
    email: GmailEmail
  ): { name: string; type: string } | null => {
    if (!email.isDraft) return null;

    // Determine draft type
    const typeMap: Record<string, string> = {
      reply: "Reply Draft",
      replyAll: "Reply All Draft",
      forward: "Forward Draft",
      new: "Draft",
    };
    const draftType = email.mailType
      ? typeMap[email.mailType] || "Draft"
      : "Draft";

    // Determine name based on mail type
    let name = "Unknown";

    // For forward drafts, show "To" recipient name (we are the sender)
    if (email.mailType === "forward") {
      name = email.to ? extractNameFromEmail(email.to) : "Unknown";
    }
    // For reply/replyAll, show sender name (from)
    else if (email.mailType === "reply" || email.mailType === "replyAll") {
      name = email.from ? extractNameFromEmail(email.from) : "Unknown";
    }
    // For new drafts, try to get name from "to" field
    else if (email.mailType === "new") {
      name = email.to ? extractNameFromEmail(email.to) : "Unknown";
    }

    return { name, type: draftType };
  };

  // Compose functions
  const handleCompose = () => {
    setIsComposeOpen(true);
    setComposeType("new");
    setComposeData({});

    // Update URL hash to include compose query parameter
    if (typeof window !== "undefined") {
      const currentHash = window.location.hash.slice(1);
      const hashWithoutQuery = currentHash.split("?")[0];
      const newHash = `${hashWithoutQuery || activeCategory}?compose=new`;
      window.location.hash = newHash;
    }
  };

  const handleReply = useCallback(
    (email: GmailEmail) => {
      setIsComposeOpen(true);
      setComposeType("reply");
      setComposeData({
        to: email.from,
        subject: email.subject.startsWith("Re:")
          ? email.subject
          : `Re: ${email.subject}`,
        replyToEmail: email,
      });

      // Update URL hash to include compose query parameter
      if (typeof window !== "undefined") {
        const currentHash = window.location.hash.slice(1);
        const hashWithoutQuery = currentHash.split("?")[0];
        const newHash = `${hashWithoutQuery || activeCategory}?compose=new`;
        window.location.hash = newHash;
      }
    },
    [activeCategory]
  );

  const handleForward = useCallback(
    (email: GmailEmail) => {
      setIsComposeOpen(true);
      setComposeType("forward");
      setComposeData({
        subject: email.subject.startsWith("Fwd:")
          ? email.subject
          : `Fwd: ${email.subject}`,
        body: `\n\n---------- Forwarded message ---------\nFrom: ${
          email.from
        }\nDate: ${new Date(email.date).toLocaleString()}\nSubject: ${
          email.subject
        }\nTo: ${email.to}\n\n${email.snippet}`,
        replyToEmail: email,
      });

      // Update URL hash to include compose query parameter
      if (typeof window !== "undefined") {
        const currentHash = window.location.hash.slice(1);
        const hashWithoutQuery = currentHash.split("?")[0];
        const newHash = `${hashWithoutQuery || activeCategory}?compose=new`;
        window.location.hash = newHash;
      }
    },
    [activeCategory]
  );

  const handleOpenDraft = (email: GmailEmail) => {
    // Open in EmailViewModal if it's a reply/replyAll/forward draft (has mailType and threadId)
    // New drafts without mailType or threadId open in ComposeEmail
    if (email.mailType && email.threadId && email.threadId.trim() !== "") {
      // Open in EmailViewModal with the reply/forward editor
      const draftId = email.messageId || email.id;
      setDraftToOpenInViewer({
        draftId: draftId,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        body: email.htmlContent || email.textContent,
        threadId: email.threadId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        mailType: email.mailType,
      });
      // Set selectedEmail to open the modal (we need at least one email to display)
      setSelectedEmail(email);
      setIsViewDialogOpen(true);
    } else {
      // Open in ComposeEmail for new drafts without mailType or threadId
      setIsComposeOpen(true);
      setComposeType("new");
      setComposeData({
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        body: email.htmlContent || email.textContent,
        replyToEmail: email,
      });
    }

    // Update URL hash to include compose query parameter with draft ID
    if (typeof window !== "undefined") {
      const currentHash = window.location.hash.slice(1);
      const hashWithoutQuery = currentHash.split("?")[0];
      // Use the messageId for Gmail URL format compatibility
      const draftId = email.messageId || email.id;
      const newHash = `${hashWithoutQuery || "drafts"}?compose=${draftId}`;
      window.location.hash = newHash;
    }
  };

  const handleCloseCompose = () => {
    setIsComposeOpen(false);
    setComposeType("new");
    setComposeData({});

    // Remove compose query parameter from URL
    if (typeof window !== "undefined") {
      const currentHash = window.location.hash.slice(1);
      const hashWithoutQuery = currentHash.split("?")[0];
      window.location.hash = hashWithoutQuery || activeCategory;
    }
  };

  // Helper function to check if emails are different
  const areEmailsDifferent = (emails1: GmailEmail[], emails2: GmailEmail[]) => {
    if (emails1.length !== emails2.length) return true;

    // Compare IDs and dates
    for (let i = 0; i < emails1.length; i++) {
      if (
        emails1[i].id !== emails2[i].id ||
        emails1[i].date.getTime() !== emails2[i].date.getTime()
      ) {
        return true;
      }
    }
    return false;
  };

  useEffect(() => {
    // Check both state and persistent ref for cached emails
    const cachedEmailsFromState = categoryEmails.get(activeCategory) || [];
    const cachedEmailsFromRef =
      emailCacheRef.categoryEmails.get(activeCategory) || [];

    // Use whichever has the data
    const hasCachedEmails =
      cachedEmailsFromState.length > 0 || cachedEmailsFromRef.length > 0;
    const cachedEmails =
      cachedEmailsFromState.length > 0
        ? cachedEmailsFromState
        : cachedEmailsFromRef;

    if (!hasCachedEmails) {
      console.log("No cached data, fetching emails for:", activeCategory);
      // Clear previous category emails to avoid showing stale inbox while loading drafts
      setEmails([]);
      // Show loading indicator for category switch initiated via URL
      setIsCategoryChanging(true);
      fetchEmails();
    } else {
      // Use cached emails immediately without loading state
      console.log("Using cached emails for category:", activeCategory);
      setIsLoading(false); // Ensure loading state is cleared
      setEmails(cachedEmails);

      // Hide category changing indicator when using cached data
      if (isCategoryChanging) {
        setTimeout(() => setIsCategoryChanging(false), 150);
      }

      // Also restore to state if we got it from ref
      if (
        cachedEmailsFromState.length === 0 &&
        cachedEmailsFromRef.length > 0
      ) {
        setCategoryEmailsState(new Map(emailCacheRef.categoryEmails));
      }

      // Always fetch fresh data in background when switching categories
      console.log("Fetching fresh data in background for:", activeCategory);

      // Fetch in background silently (without loading indicator)
      const fetchFreshData = async () => {
        try {
          // Cancel any ongoing request
          if (abortController) {
            abortController.abort();
          }

          const newAbortController = new AbortController();
          setAbortController(newAbortController);

          let fetchedEmails: GmailEmail[] = [];

          // Handle drafts separately
          if (activeCategory === "drafts") {
            const response = await staffFetch("/api/gmail/drafts/list", {
              signal: newAbortController.signal,
            });
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (result?.success) {
              fetchedEmails = result.drafts.map((draft: any) => ({
                ...draft,
                date: new Date(draft.date),
              }));
            } else {
              throw new Error(result.error || "Failed to fetch drafts");
            }
          } else {
            // Get query for active category
            const category = gmailCategories.find(
              (cat) => cat.id === activeCategory
            );
            const query = category?.query || "in:sent OR in:inbox";

            const response = await staffFetch("/api/gmail/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                maxResults: 25,
                query,
                searchQuery: undefined,
              }),
              signal: newAbortController.signal,
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result?.success) {
              fetchedEmails = result.data.emails.map((email: any) => ({
                ...email,
                date: new Date(email.date),
              }));
            } else {
              throw new Error(result.error || "Failed to fetch emails");
            }
          }

          // Check if request was aborted
          if (newAbortController.signal.aborted) {
            return;
          }

          // Update email cache
          const newCache = new Map(emailCache);
          fetchedEmails.forEach((email: GmailEmail) => {
            newCache.set(email.id, email);
          });
          setEmailCache(newCache);

          // Compare new data with cached data
          // If different, update the display and cache
          if (areEmailsDifferent(cachedEmails, fetchedEmails)) {
            console.log(
              "Background refresh: Fresh data differs from cache, updating"
            );
            // Remove duplicates by threadId
            const uniqueEmails = fetchedEmails.filter(
              (email, index, self) =>
                index === self.findIndex((e) => e.threadId === email.threadId)
            );
            setEmails(uniqueEmails);
            setCategoryEmails((prev) =>
              new Map(prev).set(activeCategory, uniqueEmails)
            );
            // Update persistent cache
            emailCacheRef.categoryEmails.set(activeCategory, uniqueEmails);
          } else {
            console.log(
              "Background refresh: Fresh data matches cache, no update needed"
            );
          }
        } catch (error: any) {
          if (error.name !== "AbortError") {
            console.error("Error fetching fresh data in background:", error);
          }
        }
      };

      // Run in background without blocking UI
      fetchFreshData();
    }

    // Only fetch labels once
    if (labels.length === 0) {
      fetchLabels();
    }
  }, [activeCategory]);

  // Hide category changing indicator when loading completes
  useEffect(() => {
    if (!isLoading && isCategoryChanging) {
      const timer = setTimeout(() => {
        setIsCategoryChanging(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isCategoryChanging]);

  // Execute pending category change when loading completes
  useEffect(() => {
    if (!isLoading && pendingCategory && pendingCategory !== activeCategory) {
      console.log("Executing pending category change:", pendingCategory);
      // Only show loading if changing to a different category
      setIsCategoryChanging(true);
      setActiveCategory(pendingCategory);
      // Update URL hash, preserving compose parameter if it exists
      if (typeof window !== "undefined") {
        const currentHash = window.location.hash.slice(1);
        const [currentCategoryPath, queryString] = currentHash.split("?");

        // Preserve the compose query parameter
        const newHash = queryString
          ? `${pendingCategory}?${queryString}`
          : pendingCategory;
        window.location.hash = newHash;
      }
      setNextPageToken(null);
      setSelectedEmails(new Set());
      setPendingCategory(null);
    }
  }, [isLoading, pendingCategory, activeCategory]);

  // Cleanup effect to abort ongoing requests
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [abortController]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual refresh function with visual feedback
  const handleManualRefresh = async () => {
    setIsRefreshing(true);

    try {
      setIsLoading(true);
      setError(null);
      await fetchEmails(searchTerm || undefined, undefined, true);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        setIsLoading(false);
      }, 300);
    }
  };

  // Initialize hash on mount if not present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.slice(1);
      // Extract just the category part (before the /)
      const categoryPart = hash.split("/")[0];
      // Extract query string if it exists
      const [categoryWithoutQuery, queryString] = categoryPart.split("?");

      // If no hash or invalid hash category, set to current category
      if (
        !categoryWithoutQuery ||
        !gmailCategories.some((cat) => cat.id === categoryWithoutQuery)
      ) {
        // Preserve query string if it exists
        const newHash = queryString
          ? `${activeCategory}?${queryString}`
          : activeCategory;
        window.location.hash = newHash;
      }
    }
  }, []);

  // Add global click listener to detect Gmail button clicks
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.closest("[data-gmail-button]") ||
        target?.closest("[data-theme-toggle]")
      ) {
        console.log("Gmail/Theme button clicked, setting skip flag");
        skipHashCloseRef.current = true;
        // Reset after a short delay
        setTimeout(() => {
          console.log("Resetting skip flag");
          skipHashCloseRef.current = false;
        }, 300);
      }
    };

    window.addEventListener("click", handleGlobalClick, true); // Capture phase
    return () => window.removeEventListener("click", handleGlobalClick, true);
  }, []);

  // Listen for hash changes and handle deep linking to emails
  useEffect(() => {
    const handleHashChange = async () => {
      if (typeof window !== "undefined") {
        const hash = window.location.hash.slice(1);

        // Extract query string from hash first (before splitting by /)
        const [hashWithoutQuery, queryString] = hash.split("?");

        // Now split the hash without query by /
        const parts = hashWithoutQuery.split("/");
        const category = parts[0];
        const emailId = parts[1];

        // Update category if it's a valid category and different from current
        if (
          category &&
          gmailCategories.some((cat) => cat.id === category) &&
          category !== activeCategory
        ) {
          setActiveCategory(category);

          // Preserve query string if it exists
          if (queryString && typeof window !== "undefined") {
            const newHash = `${category}?${queryString}`;
            window.location.hash = newHash;
          }
        }

        // Check if hash has compose query parameter (don't process as email ID)
        // queryString was already extracted above
        const hasComposeQuery =
          queryString && queryString.startsWith("compose=");

        // Open email if email ID is present (but not if it's a compose query)
        if (emailId && !hasComposeQuery) {
          // Prevent infinite loop - if modal is already open with this email, don't reopen
          if (
            isViewDialogOpen &&
            selectedEmail &&
            (selectedEmail.threadId === emailId || selectedEmail.id === emailId)
          ) {
            return;
          }

          // Find email in current list - search by threadId first, then by id
          const email = emails.find(
            (e) => e.threadId === emailId || e.id === emailId
          );
          if (email) {
            setSelectedEmail(email);
            setIsViewDialogOpen(true);

            // Load full content if not already cached
            if (!email.htmlContent && !email.textContent) {
              const fullEmail = await fetchFullEmailContent(email.id);
              if (fullEmail) {
                setSelectedEmail(fullEmail);
              }
            }
          } else {
            // Email not in current list, check cache
            // First try by ID, then search by threadId
            let cachedEmail = emailCache.get(emailId);

            if (!cachedEmail) {
              // Search cache for matching threadId
              const cacheArray = Array.from(emailCache.values());
              cachedEmail = cacheArray.find(
                (e) => e.threadId === emailId || e.id === emailId
              );
            }

            if (cachedEmail) {
              setSelectedEmail(cachedEmail);
              setIsViewDialogOpen(true);

              // Load full content if not already cached
              if (!cachedEmail.htmlContent && !cachedEmail.textContent) {
                const fullEmail = await fetchFullEmailContent(cachedEmail.id);
                if (fullEmail) {
                  setSelectedEmail(fullEmail);
                }
              }
            }
          }
        } else if (isViewDialogOpen && !hasComposeQuery) {
          // If hash changed and no email ID (and no compose query), close the modal
          // But don't close if we just clicked the Gmail button or theme toggle
          console.log(
            "Hash changed without email ID, skipHashCloseRef:",
            skipHashCloseRef.current
          );
          if (!skipHashCloseRef.current) {
            console.log("Closing modal due to hash change");
            handleCloseEmail();
          } else {
            console.log("Skipping modal close due to button click");
          }
        }
      }
    };

    // Initial check on mount (don't await - run in background)
    handleHashChange();

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [
    emails,
    emailCache,
    isViewDialogOpen,
    selectedEmail,
    handleCloseEmail,
    activeCategory,
  ]);

  // Handle deep linking when emails finish loading (for initial page load with email ID)
  useEffect(() => {
    const tryOpenEmailFromHash = async () => {
      if (typeof window === "undefined" || isViewDialogOpen) return;

      const hash = window.location.hash.slice(1);

      // Extract query string from hash first (before splitting by /)
      const [hashWithoutQuery, queryString] = hash.split("?");

      // Now split the hash without query by /
      const parts = hashWithoutQuery.split("/");
      const emailId = parts[1];

      // Check if hash has compose query parameter (don't process as email ID)
      const hasComposeQuery = queryString && queryString.startsWith("compose=");

      // Only try to open if we have an email ID and emails are loaded
      if (emailId && !hasComposeQuery && emails.length > 0) {
        // Find email in current list - search by threadId first, then by id
        const email = emails.find(
          (e) => e.threadId === emailId || e.id === emailId
        );

        if (email) {
          setSelectedEmail(email);
          setIsViewDialogOpen(true);

          // Load full content if not already cached
          if (!email.htmlContent && !email.textContent) {
            const fullEmail = await fetchFullEmailContent(email.id);
            if (fullEmail) {
              setSelectedEmail(fullEmail);
            }
          }
        }
      }
    };

    // Try to open email from hash after emails load
    if (!isLoading && emails.length > 0) {
      tryOpenEmailFromHash();
    }
  }, [isLoading, emails, isViewDialogOpen]);

  // Handle compose from URL after emails finish loading (for initial page load with compose param)
  useEffect(() => {
    const tryOpenComposeFromHash = async () => {
      if (typeof window === "undefined" || isComposeOpen || isViewDialogOpen)
        return;

      const hash = window.location.hash.slice(1);
      // Extract query string from hash first (before splitting by /)
      const [hashWithoutQuery, queryString] = hash.split("?");

      // Now split the hash without query by / to get category
      const categoryPath = hashWithoutQuery.split("/")[0];

      if (queryString) {
        const params = new URLSearchParams(queryString);
        const composeParam = params.get("compose");

        // Only try to open compose if we have emails loaded and a compose parameter
        // Also ensure the drafts category is active for draft composes
        if (
          composeParam &&
          !isLoading &&
          emails.length > 0 &&
          (composeParam === "new" || activeCategory === "drafts")
        ) {
          console.log("Trying to open compose:", {
            composeParam,
            activeCategory,
            categoryPath,
            emailsCount: emails.length,
          });

          // If we're trying to open a draft (not "new"), make sure we're on the drafts category
          // This ensures we have the draft data loaded
          // At this point: either compose=new, or drafts have been loaded under drafts category
          // Check if this is a reply/forward draft (should open in EmailViewModal)
          if (composeParam !== "new") {
            let draftEmail = emailCache.get(composeParam);

            // If not found, search through cache values by messageId
            if (!draftEmail) {
              const cacheArray = Array.from(emailCache.values());
              draftEmail = cacheArray.find((e) => e.messageId === composeParam);
            }

            // If still not found, search through current emails
            if (!draftEmail) {
              draftEmail = emails.find(
                (e) =>
                  e.messageId === composeParam ||
                  e.id === composeParam ||
                  e.threadId === composeParam
              );
            }

            // If this is a reply/forward draft (has mailType and threadId), don't open ComposeEmail
            if (draftEmail?.mailType && draftEmail?.threadId) {
              return; // Skip opening ComposeEmail, let EmailViewModal handle it
            }
          }

          setIsComposeOpen(true);

          if (composeParam === "new") {
            // New compose
            setComposeType("new");
            setComposeData({});
          } else {
            // Open draft by ID - search by messageId first (for Gmail compatibility), then by id
            let draftEmail = emailCache.get(composeParam);

            // If not found, search through cache values by messageId
            if (!draftEmail) {
              const cacheArray = Array.from(emailCache.values());
              draftEmail = cacheArray.find((e) => e.messageId === composeParam);
            }

            // If still not found, search through current emails
            if (!draftEmail) {
              draftEmail = emails.find(
                (e) =>
                  e.messageId === composeParam ||
                  e.id === composeParam ||
                  e.threadId === composeParam
              );
            }

            if (draftEmail) {
              setComposeType("new");
              setComposeData({
                to: draftEmail.to,
                cc: draftEmail.cc,
                bcc: draftEmail.bcc,
                subject: draftEmail.subject,
                body: draftEmail.htmlContent || draftEmail.textContent,
                replyToEmail: draftEmail,
              });
            }
          }
        }
      }
    };

    // Try to open compose from hash after emails load. For drafts, ensure category is drafts
    if (
      !isLoading &&
      emails.length > 0 &&
      (activeCategory === "drafts" ||
        !window.location.hash.includes("#drafts?compose="))
    ) {
      tryOpenComposeFromHash();
    }
  }, [
    isLoading,
    emails,
    emailCache,
    isComposeOpen,
    isViewDialogOpen,
    activeCategory,
  ]);

  // Listen for compose=new in URL hash (only opens immediately for brand new compose)
  // For drafts, we defer opening to the loader that waits for data
  useEffect(() => {
    const handleComposeFromUrl = () => {
      if (typeof window !== "undefined") {
        const hash = window.location.hash.slice(1);
        const [_, queryString] = hash.split("?");

        if (!queryString) return;
        const params = new URLSearchParams(queryString);
        const composeParam = params.get("compose");

        if (!composeParam || isComposeOpen || isViewDialogOpen) return;

        // Only auto-open immediately for new compose
        if (composeParam === "new") {
          setIsComposeOpen(true);
          setComposeType("new");
          setComposeData({});
        }
        // For drafts, do nothing here – the other effect will open it once data is ready
      }
    };

    // Check on mount and on hash changes
    handleComposeFromUrl();

    window.addEventListener("hashchange", handleComposeFromUrl);
    return () => window.removeEventListener("hashchange", handleComposeFromUrl);
  }, [isComposeOpen, isViewDialogOpen]);

  // Filter emails based on search term
  const filteredEmails = emails.filter((email) => {
    const matchesSearch =
      searchTerm === "" ||
      email.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.snippet.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  return (
    <div
      className="flex bg-background overflow-hidden"
      style={{ height: "calc(100vh - 25vh)", minHeight: "600px" }}
    >
      {/* Gmail-style Loading Indicator for Category Changes and Email Loading */}
      {(isCategoryChanging || isLoading) && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="bg-primary text-white px-4 py-2 rounded-b-lg shadow-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            <span className="text-sm font-medium">Loading...</span>
          </div>
        </div>
      )}

      {/* Gmail Sidebar */}
      <div
        className="w-64 border-r border-border flex-shrink-0 overflow-y-auto h-full"
        style={{ backgroundColor: "hsl(var(--card-surface))" }}
      >
        <div className="p-4">
          <h2 className="text-xl font-semibold text-foreground mb-4">Gmail</h2>

          {/* Compose Button */}
          <Button
            onClick={handleCompose}
            className="w-full mb-6 bg-background border-border hover:bg-muted text-foreground rounded-xl"
          >
            <Edit className="w-4 h-4 mr-2" />
            Compose
          </Button>

          {/* Categories */}
          <nav className="space-y-1">
            {gmailCategories.map((category) => {
              const Icon = category.icon;
              const isActive = activeCategory === category.id;

              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary border-r-4 border-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <div className="flex items-center">
                    <Icon className="w-5 h-5 mr-3" />
                    {category.label}
                  </div>
                  {category.unreadCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-red-500 text-white text-xs"
                    >
                      {category.unreadCount}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0"
        style={{ backgroundColor: "hsl(var(--card-surface))" }}
      >
        {/* Top Toolbar */}
        <div className="border-b border-border bg-card">
          {/* Search Bar */}
          <div className="p-4 border-b border-border/50">
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                placeholder="Search mail"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-12 h-12 text-base border-border rounded-full"
              />
            </div>
          </div>

          {/* Email Actions Toolbar */}
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={
                  selectedEmails.size === filteredEmails.length &&
                  filteredEmails.length > 0
                }
                onCheckedChange={selectAllEmails}
                className="mr-2"
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Filter className="w-4 h-4 mr-1" />
                    Filter
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>All</DropdownMenuItem>
                  <DropdownMenuItem>Unread</DropdownMenuItem>
                  <DropdownMenuItem>Read</DropdownMenuItem>
                  <DropdownMenuItem>Starred</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {sortOrder === "desc" ? (
                      <SortDesc className="w-4 h-4 mr-1" />
                    ) : (
                      <SortAsc className="w-4 h-4 mr-1" />
                    )}
                    Sort
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortBy("date");
                      setSortOrder("desc");
                    }}
                  >
                    Newest first
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortBy("date");
                      setSortOrder("asc");
                    }}
                  >
                    Oldest first
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("sender")}>
                    By sender
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("subject")}>
                    By subject
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {selectedEmails.size > 0 && (
                <>
                  <Separator orientation="vertical" className="mx-2 h-6" />
                  <Button variant="ghost" size="sm">
                    <Archive className="w-4 h-4 mr-1" />
                    Archive
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Star className="w-4 h-4 mr-1" />
                    Star
                  </Button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {isLoading
                  ? `Loading...`
                  : `${filteredEmails.length} of ${emails.length} emails`}
              </span>
              <Button
                onClick={handleManualRefresh}
                disabled={isLoading || isRefreshing}
                variant="ghost"
                size="sm"
                title="Refresh emails"
              >
                <RotateCcw
                  className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
        </div>

        {/* Email List */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Error Display */}
          {error && (
            <div className="mx-4 mt-4 flex-shrink-0">
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Emails List Container with Fixed Height and Scroll */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-muted border-t border-border/50 email-list-container min-h-0 min-w-0">
            {filteredEmails.map((email, index) => {
              const isSelected = selectedEmails.has(email.id);

              return (
                <div
                  key={email.id}
                  className={cn(
                    "email-list-item group border-b border-border/50 cursor-pointer",
                    !email.isRead && "bg-card font-medium",
                    email.isRead && "bg-muted/30",
                    isSelected && "bg-primary/5 border-primary/20"
                  )}
                  onClick={() => {
                    // Handle draft emails differently - open in compose
                    if (email.isDraft) {
                      handleOpenDraft(email);
                    } else {
                      // Use cached version if available for instant loading
                      const cachedEmail = emailCache.get(email.id);
                      viewEmail(cachedEmail || email);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 px-4 py-1 email-list-item-content">
                    {/* Checkbox */}
                    <div className="flex-shrink-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleEmailSelection(email.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    {/* Star */}
                    <div className="flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(email.id, email.isStarred);
                        }}
                        className="p-0.5 hover:bg-muted rounded transition-colors"
                        title={email.isStarred ? "Unstar" : "Star"}
                      >
                        {email.isStarred ? (
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        ) : (
                          <Star className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>

                    {/* Sender */}
                    <div
                      className="flex items-center min-w-0 flex-shrink-0"
                      style={{ width: "180px" }}
                    >
                      {email.isDraft ? (
                        (() => {
                          const draftLabel = getDraftTypeLabel(email);
                          return draftLabel ? (
                            <span className="text-sm truncate">
                              {draftLabel.type === "Draft" ? (
                                // Normal draft - just show "Draft" in red
                                <span className="text-red-600 dark:text-red-400">
                                  {draftLabel.type}
                                </span>
                              ) : (
                                // Reply/Forward drafts - show name in black and type in red
                                <>
                                  <span className="text-foreground">
                                    {draftLabel.name}
                                  </span>
                                  <span className="text-red-600 dark:text-red-400">
                                    {" "}
                                    {draftLabel.type}
                                  </span>
                                </>
                              )}
                            </span>
                          ) : null;
                        })()
                      ) : (
                        <span
                          className={cn(
                            "truncate text-xs min-w-0 text-foreground",
                            !email.isRead ? "font-semibold" : "font-normal"
                          )}
                        >
                          {getCorrespondent(email)}
                        </span>
                      )}
                    </div>

                    {/* Subject and Snippet */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                        <span
                          className={cn(
                            "text-xs flex-shrink-0 truncate whitespace-nowrap text-foreground",
                            !email.isRead ? "font-semibold" : "font-normal"
                          )}
                          style={{ maxWidth: "250px" }}
                        >
                          {email.subject || "(no subject)"}
                        </span>
                        <span className="text-muted-foreground font-normal truncate min-w-0 text-xs">
                          — {email.snippet}
                        </span>
                      </div>
                    </div>

                    {/* Labels/Badges */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {email.hasAttachments && (
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      )}
                      {getConversationCount(email) > 1 && (
                        <Badge
                          variant="outline"
                          className="text-xs text-foreground border-border bg-muted"
                        >
                          {getConversationCount(email)}
                        </Badge>
                      )}
                      {!email.isRead && (
                        <div className="w-2 h-2 bg-primary rounded-full"></div>
                      )}
                    </div>

                    {/* Date */}
                    <div
                      className="flex-shrink-0 text-muted-foreground text-right"
                      style={{ fontSize: "14px", width: "80px" }}
                    >
                      {formatDate(email.date)}
                    </div>

                    {/* Actions Menu */}
                    <div className="flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="email-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchiveEmail(email);
                            }}
                          >
                            <Archive className="w-4 h-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 dark:text-red-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEmail(email);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleReadStatus(email);
                            }}
                          >
                            {email.isRead ? (
                              <>
                                <Eye className="w-4 h-4 mr-2" />
                                Mark as unread
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Mark as read
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load More Button */}
            {nextPageToken && (
              <div className="p-4 text-center border-t border-border/50">
                {isLoadingMore ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span className="text-sm text-muted-foreground">
                      Loading more emails...
                    </span>
                  </div>
                ) : (
                  <Button
                    onClick={loadMoreEmails}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    Load More Emails
                  </Button>
                )}
              </div>
            )}

            {/* No Emails State - Display nothing instead of "No emails found" */}
            {!isLoading && filteredEmails.length === 0 && null}
          </div>
        </div>
      </div>

      {/* Floating Gmail Button - only when modal is closed */}
      {!isViewDialogOpen && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => window.open(getGmailUrl(), "_blank")}
          className="fixed top-4 right-14 z-[200] bg-background border-border hover:bg-muted shadow-lg h-10 w-10"
          title="Open Gmail in new tab"
        >
          <div className="w-5 h-5">
            <svg viewBox="0 0 24 24" className="w-full h-full">
              <path
                fill="currentColor"
                d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
              />
            </svg>
          </div>
        </Button>
      )}

      {/* Email View Modal */}
      <EmailViewModal
        isOpen={isViewDialogOpen}
        onOpenChange={handleEmailViewModalOpenChange}
        selectedEmail={selectedEmail}
        isLoadingFullContent={isLoadingFullContent}
        onReply={handleReply}
        onForward={handleForward}
        onGmailOpen={handleGmailOpen}
        openDraftInEditor={draftToOpenInViewer}
        onDraftSaved={refreshDrafts}
      />

      {/* Compose Email Component */}
      {isComposeOpen && (
        <ComposeEmail
          isOpen={isComposeOpen}
          onClose={handleCloseCompose}
          initialTo={composeData.to || ""}
          initialCc={composeData.cc || ""}
          initialBcc={composeData.bcc || ""}
          initialSubject={composeData.subject || ""}
          initialBody={composeData.body || ""}
          replyToEmail={composeData.replyToEmail}
          onDraftSaved={refreshDrafts}
        />
      )}
    </div>
  );
}
