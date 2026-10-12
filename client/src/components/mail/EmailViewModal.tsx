"use client";

import React, { useState, useEffect, useRef } from "react";
import { staffFetch, fetchAttachmentObjectUrl } from "@/lib/staff-fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { PDFPreviewModal } from "./PDFPreviewModal";
import { AttachmentThumbnail } from "./AttachmentThumbnail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmailAutocomplete } from "@/components/ui/email-autocomplete";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmailAvatar } from "@/components/ui/email-avatar";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import DOMPurify from "dompurify";
import {
  Mail,
  Calendar,
  Star,
  StarOff,
  MoreVertical,
  Reply,
  Forward,
  Archive,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Download,
  X,
  Eye,
  Copy,
  Send,
} from "lucide-react";
import {
  MdFormatBold,
  MdFormatItalic,
  MdFormatUnderlined,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdUndo,
  MdRedo,
  MdFormatAlignLeft,
  MdFormatAlignCenter,
  MdFormatAlignRight,
  MdFormatAlignJustify,
  MdExpandMore,
  MdPalette,
  MdTextFields,
  MdFormatIndentDecrease,
  MdFormatIndentIncrease,
  MdMoreVert,
  MdStrikethroughS,
  MdFormatLineSpacing,
  MdTitle,
} from "react-icons/md";

// Gmail Email signature HTML
const EMAIL_SIGNATURE = `<div><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature"><div dir="ltr"><div style="color:rgb(34,34,34)">Kind regards,&nbsp;</div><div style="color:rgb(34,34,34)"><br><div dir="ltr"><div dir="ltr"><span style="color:rgb(0,0,0)"><div dir="ltr" align="left" style="margin-left:0pt"><div align="left" style="margin-left:0pt"><div dir="ltr" align="left" style="margin-left:0pt"><table style="border:medium;border-collapse:collapse"><tbody><tr style="height:0pt"><td style="vertical-align:top;overflow:hidden"><span style="border:medium;display:inline-block;overflow:hidden;width:174px;height:174px"><img src="https://lh7-us.googleusercontent.com/W6PhRjN5UgrDp-2PibTWmAYHg_SMqQaitD63npeRzqu7Iy1QmjB1VgUSpwaWvQhYnFlJqgYh9t22O5zPUO3Rgf5oDc2urjsnba2jg8npqDf9GZGwL5hctWavIuDW95fdPYncuhBpvnRI8TZmjKhc5LM" width="167" height="167" style="margin-left: 0px; margin-top: 0px; margin-right: 0px;"></span><br></td><td style="vertical-align:top;overflow:hidden"><span style="font-family:&quot;DM Sans&quot;,sans-serif;font-size:12pt;font-weight:700">Bella Millan</span><p dir="ltr" style="line-height:1.2;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline">Outreach Manager</span></p><p dir="ltr" style="line-height:1.2;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline"><br></span></p><p dir="ltr" style="line-height:1;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline">&nbsp;&nbsp;<img src="https://ci3.googleusercontent.com/mail-sig/AIorK4xZqel1TeaN_XwhPphMi6LJk9bDE5tvQjKoqr8WZjpwZLfrkzJuGw9keRgg_Q6x7brg_L9A2pU" width="17" height="17" style="margin-right:0px">&nbsp;&nbsp;</span><a href="tel:639163041767" style="color:rgb(17,85,204)" target="_blank"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline;color:rgb(0,0,0)">+63 (916) 304 1767</span></a></p><p dir="ltr" style="line-height:1;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline">&nbsp;&nbsp;<img src="https://ci3.googleusercontent.com/mail-sig/AIorK4y5FclvwPG32SXqPSvbPd3beA1UB8Wx1dgwaJEcdWLwxjh1yRwhc2_GSpCg0zBpgiWvz9eb4eo">&nbsp; bella</span><a href="mailto:amer@imheretravels.com" style="color:rgb(17,85,204)" target="_blank"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline;color:rgb(0,0,0)">@imheretravels.com</span></a></p><p dir="ltr" style="line-height:1;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline">&nbsp;<a href="https://imheretravels.com/" style="color:rgb(17,85,204)" target="_blank">&nbsp;</a></span><img src="https://ci3.googleusercontent.com/mail-sig/AIorK4w81hW7M7z1ED8dHl5gyqSEylE_boBaxtpdxOxm_eOviPDAVjKkznVaFTCzCV8t_YYy7A_2sns"><a href="https://imheretravels.com/" style="color:rgb(17,85,204)" target="_blank"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline;color:rgb(0,0,0)">&nbsp; www.imheretravels.com</span></a></p><p dir="ltr" style="line-height:0.9;margin-top:0pt;margin-bottom:0pt"><br></p>&nbsp;&nbsp;<a href="https://www.instagram.com/imheretravels/" style="color:rgb(17,85,204)" target="_blank"><img src="https://ci3.googleusercontent.com/mail-sig/AIorK4xLX1jMZKunN4wNGSCmIVUjCQgc1_FpjHTBZnn_GD9YIv0Q-aBxP4Iy7Rh_a7iBZeNGFqJnSUI" width="26" height="26" style="margin-right:0px"></a>&nbsp;&nbsp;<a href="https://www.tiktok.com/@imheretravels" style="color:rgb(17,85,204)" target="_blank"><img alt="https://www.tiktok.com/@imheretravels" src="https://ci3.googleusercontent.com/mail-sig/AIorK4yNZvr_t6SSKB69FIelx0LaypIom57zAMKJhGe2q8iNg3WK5gP2cxCXL_mtZOoe5gXiq2hG97g" width="25" height="25" style="margin-right:0px"></a>&nbsp;&nbsp;<a href="https://www.facebook.com/profile.php?id=100089932897402" style="color:rgb(17,85,204)" target="_blank"><img alt="https://www.facebook.com/profile.php?id=100089932897402" src="https://ci3.googleusercontent.com/mail-sig/AIorK4wOueqr6zk98SKG_4lWhrPrRcAuBBs2oDMmoGQbRH0ZhSmkhOaIOHB0oXXMYRky6QC2bA6dNQA" width="27" height="27" style="margin-right:0px"></a>&nbsp;&nbsp;<a href="http://www.imheretravels.com/" style="color:rgb(17,85,204)" target="_blank"><img alt="www.imheretravels.com" src="https://ci3.googleusercontent.com/mail-sig/AIorK4yYRJk1jr5S9TPJLoy2n2NotCbk7ihIfpokipZTmDFVi1R9s1wE3ykm_O4djLbzMvl9b99idZY" width="27" height="27" style="margin-right:0px"></a></td></tr></tbody></table></div></div></div></span></div></div></div></div></div></div>`;

// Gmail Email type
interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string; // For inline attachments
}

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
  isDraft?: boolean; // Whether this is a draft email
}

interface EmailViewModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEmail: GmailEmail | null;
  isLoadingFullContent: boolean;
  onReply?: (email: GmailEmail) => void;
  onForward?: (email: GmailEmail) => void;
  onGmailOpen?: () => void;
  openDraftInEditor?: {
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
  } | null;
  onDraftSaved?: () => void;
}

// Global flag to track if we should prevent modal close
const shouldPreventClose = false;

// Helper function to get avatar initials
function getAvatarInitials(email: string): string {
  const name = email?.match(/^([^<]+)/)?.[1]?.trim() || email;
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Helper function to format sender name with email
function formatSenderWithEmail(fromString: string): React.ReactNode {
  if (!fromString) return "Unknown";

  // Handle format "Name <email@domain.com>"
  const match = fromString.match(/^(.+?)\s*<(.+@.+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, ""); // Remove quotes if present
    const email = match[2].trim();
    return (
      <>
        <span className="text-sm font-medium text-gray-900">{name}</span>
        <span className="text-xs text-gray-500 ml-1">&lt;{email}&gt;</span>
      </>
    );
  }

  // Handle format "email@domain.com" (just email, no name)
  if (fromString.includes("@")) {
    const emailPart = fromString.split("@")[0];
    const name = emailPart
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
    return (
      <>
        <span className="text-sm font-medium text-gray-900">{name}</span>
        <span className="text-xs text-gray-500 ml-1">&lt;{fromString}&gt;</span>
      </>
    );
  }

  // Return as-is if no email format detected
  return (
    <span className="text-sm font-medium text-gray-900">{fromString}</span>
  );
}

export function EmailViewModal({
  isOpen,
  onOpenChange,
  selectedEmail,
  isLoadingFullContent,
  onReply,
  onForward,
  onGmailOpen,
  openDraftInEditor,
  onDraftSaved,
}: EmailViewModalProps) {
  const { toast } = useToast();
  const [threadEmails, setThreadEmails] = useState<GmailEmail[]>([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());
  const [showAllEmails, setShowAllEmails] = useState(false); // New state for collapsing middle emails

  // State for attachment preview modal
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string;
    mimeType: string;
    filename: string;
  } | null>(null);

  // State for PDF preview modal
  const [previewPDF, setPreviewPDF] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  // State for inline reply/forward
  const [replyMode, setReplyMode] = useState<
    "reply" | "replyAll" | "forward" | null
  >(null);
  const [replyTo, setReplyTo] = useState("");
  const [replyToEmails, setReplyToEmails] = useState<string[]>([]);
  const [replyCc, setReplyCc] = useState("");
  const [replyCcEmails, setReplyCcEmails] = useState<string[]>([]);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [showReplyCc, setShowReplyCc] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [showReplyQuote, setShowReplyQuote] = useState(true); // Toggle for quoted content
  const replyEditorRef = useRef<HTMLDivElement>(null);

  // Attachments state
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);

  // Draft management
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "saved" | "saving" | "error" | null
  >(null);
  const [isOpeningDraft, setIsOpeningDraft] = useState(false);
  const [hasOpenedDraft, setHasOpenedDraft] = useState(false);

  // Rich text editor state
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLineHeightMenu, setShowLineHeightMenu] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState("Normal");
  const [currentFontFamily, setCurrentFontFamily] = useState("Sans Serif");
  const [currentLineHeight, setCurrentLineHeight] = useState("Normal");

  // Font and style options
  const fontFamilies = [
    { label: "Sans Serif", value: "sans-serif" },
    { label: "Serif", value: "serif" },
    { label: "Arial", value: "Arial, sans-serif" },
    { label: "Times New Roman", value: "Times New Roman, serif" },
    { label: "Helvetica", value: "Helvetica, sans-serif" },
    { label: "Georgia", value: "Georgia, serif" },
    { label: "Courier New", value: "Courier New, monospace" },
    { label: "Verdana", value: "Verdana, sans-serif" },
  ];

  const fontSizes = [
    { label: "Small", value: "1" },
    { label: "Normal", value: "3" },
    { label: "Large", value: "4" },
    { label: "Huge", value: "6" },
  ];

  const lineHeights = [
    { label: "Single", value: "1" },
    { label: "Normal", value: "1.15" },
    { label: "Relaxed", value: "1.5" },
    { label: "Double", value: "2" },
  ];

  const textColors = [
    "#000000",
    "#333333",
    "#666666",
    "#999999",
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#FFFF00",
    "#FF00FF",
    "#00FFFF",
    "#FFA500",
    "#800080",
  ];

  const highlightColors = [
    "#FFFF00",
    "#00FF00",
    "#00FFFF",
    "#FF00FF",
    "#FFA500",
    "#FF0000",
    "#0000FF",
    "#800080",
  ];

  // Fetch thread emails when selectedEmail changes
  useEffect(() => {
    if (selectedEmail?.threadId && isOpen) {
      fetchThreadEmails(selectedEmail.threadId);
    }
  }, [selectedEmail?.threadId, isOpen]);

  // Initialize editor content when replyBody changes (but not when user is typing)
  useEffect(() => {
    // Only update editor when mode changes or when opening a draft
    // Don't update when user is typing (which would cause cursor to jump)
    if (replyEditorRef.current && replyBody && replyMode && !hasOpenedDraft) {
      // Only set if the content is significantly different
      const currentContent = replyEditorRef.current.innerHTML.trim();
      const newContent = replyBody.trim();

      if (currentContent !== newContent && !currentContent) {
        // Only update if editor is empty (initial setup)
        replyEditorRef.current.innerHTML = replyBody;
      }
    } else if (
      replyEditorRef.current &&
      replyBody &&
      replyMode &&
      hasOpenedDraft
    ) {
      // When opening a draft, update the content once
      if (replyEditorRef.current.innerHTML !== replyBody) {
        replyEditorRef.current.innerHTML = replyBody;
      }
    }
  }, [replyMode]); // Only when reply mode changes, not on every replyBody change

  // Auto-save draft when body content changes (with debounce)
  useEffect(() => {
    if (!replyMode || isOpeningDraft || hasOpenedDraft || isSendingReply) {
      return;
    }

    const timer = setTimeout(() => {
      saveDraft();
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [replyBody, replyToEmails, replyCcEmails, replySubject, isSendingReply]);

  // Open draft in editor when openDraftInEditor prop is provided
  useEffect(() => {
    if (openDraftInEditor && !hasOpenedDraft && isOpen) {
      setIsOpeningDraft(true);
      setHasOpenedDraft(true);

      // Set draft ID
      setDraftId(openDraftInEditor.draftId);

      // Parse recipient emails
      const toEmails = openDraftInEditor.to
        ? openDraftInEditor.to.split(",").map((e) => e.trim())
        : [];
      const ccEmails = openDraftInEditor.cc
        ? openDraftInEditor.cc.split(",").map((e) => e.trim())
        : [];

      // Set reply mode based on mailType header or whether it's a reply or forward
      // mailType can be 'reply', 'replyAll', or 'forward'
      if (openDraftInEditor.mailType) {
        // Use mailType if available
        if (openDraftInEditor.mailType === "replyAll") {
          setReplyMode("replyAll");
        } else if (openDraftInEditor.mailType === "forward") {
          setReplyMode("forward");
        } else {
          setReplyMode("reply");
        }
      } else {
        // Fallback to checking inReplyTo
        const isReply = openDraftInEditor.inReplyTo !== undefined;
        if (isReply) {
          setReplyMode("reply");
        } else {
          setReplyMode("forward");
        }
      }

      // Set form fields
      setReplyToEmails(toEmails);
      setReplyCcEmails(ccEmails);
      setReplyCc(openDraftInEditor.cc || "");
      setReplySubject(openDraftInEditor.subject || "");
      setReplyBody(openDraftInEditor.body || EMAIL_SIGNATURE);

      // Show CC field if there are CC recipients
      if (ccEmails.length > 0) {
        setShowReplyCc(true);
      }

      setIsOpeningDraft(false);

      // Auto-scroll to the reply container
      setTimeout(() => {
        document.querySelector(".reply-container")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 300);
    }
  }, [openDraftInEditor, hasOpenedDraft, isOpen]);

  // Reset hasOpenedDraft when reply mode is cleared or when openDraftInEditor changes
  useEffect(() => {
    if (!replyMode) {
      setHasOpenedDraft(false);
    }
  }, [replyMode]);

  // Reset hasOpenedDraft when openDraftInEditor becomes null (draft closed)
  useEffect(() => {
    if (!openDraftInEditor) {
      setHasOpenedDraft(false);
    }
  }, [openDraftInEditor]);

  // Image resize and drag functionality for reply editor
  useEffect(() => {
    const editor = replyEditorRef.current;
    if (!editor) return;

    let isResizing = false;
    let currentImg: HTMLImageElement | null = null;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG") {
        const img = target as HTMLImageElement;
        const rect = img.getBoundingClientRect();

        // Check if click is on the border (for resizing)
        const borderWidth = 4;
        const clickX = e.clientX;
        const clickY = e.clientY;
        const isOnBorder =
          (clickX <= rect.left + borderWidth ||
            clickX >= rect.right - borderWidth ||
            clickY <= rect.top + borderWidth ||
            clickY >= rect.bottom - borderWidth) &&
          clickX >= rect.left &&
          clickX <= rect.right &&
          clickY >= rect.top &&
          clickY <= rect.bottom;

        if (isOnBorder) {
          e.preventDefault();
          e.stopPropagation();
          isResizing = true;
          currentImg = img;
          currentImg.style.userSelect = "none";
          currentImg.style.cursor = "se-resize";
          startX = e.clientX;
          startY = e.clientY;
          startWidth = currentImg.offsetWidth;
          startHeight = currentImg.offsetHeight;
          document.body.style.cursor = "se-resize";
        } else {
          // Just select the image
          e.stopPropagation();
          // Remove selected class from all images
          editor.querySelectorAll("img").forEach((i) => {
            i.classList.remove("selected");
          });
          // Add selected class to this image
          img.classList.add("selected");
        }
      } else {
        // Click outside of an image - deselect all images
        editor.querySelectorAll("img").forEach((i) => {
          i.classList.remove("selected");
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Handle resizing
      if (isResizing && currentImg) {
        e.preventDefault();
        const diffX = e.clientX - startX;
        const diffY = e.clientY - startY;
        const newWidth = startWidth + diffX;
        const newHeight = startHeight + diffY;

        currentImg.style.width = Math.max(50, newWidth) + "px";
        currentImg.style.height = "auto";
        currentImg.removeAttribute("width");
        currentImg.removeAttribute("height");
      }

      // Handle cursor change when hovering over images
      if (!isResizing && target.tagName === "IMG") {
        const img = target as HTMLImageElement;
        const rect = img.getBoundingClientRect();
        const borderWidth = 4;
        const clickX = e.clientX;
        const clickY = e.clientY;
        const isOnBorder =
          (clickX <= rect.left + borderWidth ||
            clickX >= rect.right - borderWidth ||
            clickY <= rect.top + borderWidth ||
            clickY >= rect.bottom - borderWidth) &&
          clickX >= rect.left &&
          clickX <= rect.right &&
          clickY >= rect.top &&
          clickY <= rect.bottom;

        // Change cursor to resize when hovering over border
        if (isOnBorder) {
          img.style.cursor = "se-resize";
        } else {
          img.style.cursor = "move";
        }
      }
    };

    const handleMouseUp = () => {
      if (isResizing && currentImg) {
        // Restore image interaction
        currentImg.style.userSelect = "";
        currentImg.style.pointerEvents = "auto";
        isResizing = false;
        currentImg = null;
        document.body.style.cursor = "default";
        handleReplyInput(); // Update reply body state
      }
    };

    editor.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      editor.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [replyMode]);

  // Fetch all emails in the thread
  const fetchThreadEmails = async (threadId: string) => {
    setIsLoadingThread(true);
    try {
      const response = await staffFetch(`/api/gmail/threads/${threadId}`, {
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
        const emails = result.data.emails.map((email: any) => ({
          ...email,
          date: new Date(email.date),
        }));

        // Check if the latest email is a draft
        const nonDraftEmails = emails.filter((email: any) => !email.isDraft);
        const draftEmails = emails.filter((email: any) => email.isDraft);

        // If there's a draft, it means we should open it in the inline editor
        if (draftEmails.length > 0 && !hasOpenedDraft) {
          const latestDraft = draftEmails[draftEmails.length - 1];

          // Extract the mailType from the draft's X-MailType header or labels
          const mailType =
            latestDraft.mailType ||
            (latestDraft.labels?.includes("DRAFT") ? "reply" : undefined);

          // Parse recipient emails
          const toEmails = latestDraft.to
            ? latestDraft.to.split(",").map((e: string) => e.trim())
            : [];
          const ccEmails = latestDraft.cc
            ? latestDraft.cc.split(",").map((e: string) => e.trim())
            : [];

          // Set reply mode based on mailType
          if (mailType === "replyAll") {
            setReplyMode("replyAll");
          } else if (mailType === "forward") {
            setReplyMode("forward");
          } else if (mailType === "reply") {
            setReplyMode("reply");
          }

          // Set form fields with draft content
          setReplyToEmails(toEmails);
          setReplyCcEmails(ccEmails);
          setReplyCc(latestDraft.cc || "");
          // Remove "(no subject)" from the subject line
          const cleanDraftSubject = (latestDraft.subject || "")
            .replace(/\(no subject\)/gi, "")
            .trim();
          setReplySubject(cleanDraftSubject);
          setReplyBody(
            latestDraft.htmlContent ||
              latestDraft.textContent ||
              EMAIL_SIGNATURE
          );

          // Set draft ID for saving
          setDraftId(latestDraft.messageId || latestDraft.id);

          // Show CC field if there are CC recipients
          if (ccEmails.length > 0) {
            setShowReplyCc(true);
          }

          // Mark that we've opened the draft
          setHasOpenedDraft(true);

          // Scroll to the reply container after a brief delay
          setTimeout(() => {
            document.querySelector(".reply-container")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 300);
        }

        setThreadEmails(nonDraftEmails.length > 0 ? nonDraftEmails : emails);

        // Auto-expand the latest non-draft email
        if (nonDraftEmails.length > 0) {
          const latestEmail = nonDraftEmails[nonDraftEmails.length - 1];
          setExpandedEmails(new Set([latestEmail.id]));
        }
      } else {
        throw new Error(result.error || "Failed to fetch thread emails");
      }
    } catch (error) {
      console.error("Error fetching thread emails:", error);
      // Fallback to single email if thread fetch fails
      if (selectedEmail) {
        setThreadEmails([selectedEmail]);
        setExpandedEmails(new Set([selectedEmail.id]));
      }
    } finally {
      setIsLoadingThread(false);
    }
  };

  // Toggle email expansion
  const toggleEmailExpansion = (emailId: string) => {
    const newExpanded = new Set(expandedEmails);
    if (newExpanded.has(emailId)) {
      newExpanded.delete(emailId);
    } else {
      newExpanded.add(emailId);
    }
    setExpandedEmails(newExpanded);
  };

  // Toggle quote expansion for specific email
  const toggleQuoteExpansion = (emailId: string) => {
    console.log("toggleQuoteExpansion called for email:", emailId);
    const newExpandedQuotes = new Set(expandedQuotes);
    if (newExpandedQuotes.has(emailId)) {
      console.log("Removing email from expanded quotes");
      newExpandedQuotes.delete(emailId);
    } else {
      console.log("Adding email to expanded quotes");
      newExpandedQuotes.add(emailId);
    }
    console.log("New expanded quotes set:", newExpandedQuotes);
    setExpandedQuotes(newExpandedQuotes);
  };

  // Helper to extract email address from "Name <email@domain.com>" format
  const extractEmailAddress = (emailString: string): string => {
    const match = emailString.match(/<(.+?)>/);
    return match ? match[1] : emailString;
  };

  // Handle reply - open inline reply interface
  const handleReply = (email: GmailEmail) => {
    const senderEmail = extractEmailAddress(email.from);
    const bellaEmail = "bella@imheretravels.com";

    // Determine the reply recipient based on whether it's a sent or received email
    let replyToEmail: string;

    if (email.isSent) {
      // If we sent this email, reply to the recipient(s) instead of ourselves
      // Extract first recipient from "to" field, or use the first email found in the thread
      if (email.to) {
        const recipients = email.to
          .split(",")
          .map((e) => extractEmailAddress(e.trim()))
          .filter((e) => e && e !== bellaEmail);

        if (recipients.length > 0) {
          replyToEmail = recipients[0];
        } else {
          // Fallback: find another participant in the thread
          replyToEmail = findOtherParticipant(email);
        }
      } else {
        replyToEmail = findOtherParticipant(email);
      }
    } else {
      // Received email - reply to sender
      replyToEmail = senderEmail;
    }

    setReplyMode("reply");
    setReplyToEmails([replyToEmail]);
    setReplyCcEmails([]);
    setShowReplyCc(false);
    // Remove "(no subject)" from the subject line
    const cleanSubject = email.subject.replace(/\(no subject\)/gi, "").trim();
    setReplySubject(
      cleanSubject.startsWith("Re:") ? cleanSubject : `Re: ${cleanSubject}`
    );
    setReplyBody(EMAIL_SIGNATURE);
    setShowReplyQuote(true);

    // Scroll to reply container after a brief delay
    setTimeout(() => {
      document
        .querySelector(".reply-container")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Helper function to find other participant in thread when replying to our own sent email
  const findOtherParticipant = (email: GmailEmail): string => {
    const bellaEmail = "bella@imheretravels.com";
    const senderEmail = extractEmailAddress(email.from);

    // Collect all emails in the thread (excluding our own)
    const allEmails = new Set<string>();

    if (email.to) {
      email.to.split(",").forEach((e) => {
        const addr = extractEmailAddress(e.trim());
        if (addr && addr !== bellaEmail) allEmails.add(addr);
      });
    }

    if (email.cc) {
      email.cc.split(",").forEach((e) => {
        const addr = extractEmailAddress(e.trim());
        if (addr && addr !== bellaEmail) allEmails.add(addr);
      });
    }

    // Also check the thread for other participants
    threadEmails.forEach((threadEmail) => {
      if (!threadEmail.isSent) {
        const fromAddr = extractEmailAddress(threadEmail.from);
        if (fromAddr && fromAddr !== bellaEmail) {
          allEmails.add(fromAddr);
        }
      } else {
        // For sent emails in thread, check recipients
        if (threadEmail.to) {
          threadEmail.to.split(",").forEach((e) => {
            const addr = extractEmailAddress(e.trim());
            if (addr && addr !== bellaEmail) allEmails.add(addr);
          });
        }
      }
    });

    // Return first email found, or fallback to the original sender
    if (allEmails.size > 0) {
      return Array.from(allEmails)[0];
    }

    // Last resort: extract from the current email's "to" field (without our email)
    if (email.to) {
      const recipients = email.to
        .split(",")
        .map((e) => extractEmailAddress(e.trim()))
        .filter((e) => e && e !== bellaEmail);
      return recipients[0] || senderEmail;
    }

    return senderEmail;
  };

  // Handle reply all
  const handleReplyAll = (email: GmailEmail) => {
    const senderEmail = extractEmailAddress(email.from);

    // Get all recipients from to, cc, excluding ourselves
    const allRecipients = [
      ...(email.to ? email.to.split(",").map((e) => e.trim()) : []),
      ...(email.cc ? email.cc.split(",").map((e) => e.trim()) : []),
    ];

    // Filter out the sender and add them to To
    const ccRecipients = allRecipients.filter(
      (recipient) => recipient !== senderEmail
    );

    setReplyMode("replyAll");
    setReplyToEmails([senderEmail]);
    setReplyCcEmails(ccRecipients);
    setShowReplyCc(ccRecipients.length > 0);
    // Remove "(no subject)" from the subject line
    const cleanSubject = email.subject.replace(/\(no subject\)/gi, "").trim();
    setReplySubject(
      cleanSubject.startsWith("Re:") ? cleanSubject : `Re: ${cleanSubject}`
    );
    setReplyBody(EMAIL_SIGNATURE);
    setShowReplyQuote(true);

    setTimeout(() => {
      document
        .querySelector(".reply-container")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Handle forward - open inline forward interface
  const handleForward = (email: GmailEmail) => {
    setReplyMode("forward");
    setReplyToEmails([]);
    setReplyCcEmails([]);
    setShowReplyCc(false);
    // Remove "(no subject)" from the subject line
    const cleanSubject = email.subject.replace(/\(no subject\)/gi, "").trim();
    setReplySubject(
      cleanSubject.startsWith("Fwd:") ? cleanSubject : `Fwd: ${cleanSubject}`
    );
    setReplyBody(EMAIL_SIGNATURE);
    setShowReplyQuote(true);

    setTimeout(() => {
      document
        .querySelector(".reply-container")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Close inline reply/forward
  const handleCloseReply = () => {
    setReplyMode(null);
    setReplyTo("");
    setReplyToEmails([]);
    setReplyCc("");
    setReplyCcEmails([]);
    setReplySubject("");
    setReplyBody("");
    setShowReplyCc(false);
    setReplyAttachments([]);
    setDraftId(null);
    setDraftStatus(null);
    setHasOpenedDraft(false);
  };

  // Handle file attachment
  const handleReplyAttachment = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (files) {
      setReplyAttachments((prev) => [...prev, ...Array.from(files)]);
    }
  };

  // Remove attachment
  const handleRemoveAttachment = (index: number) => {
    setReplyAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Rich text editor functions
  const execCommand = (cmd: string, value?: string) => {
    if (cmd === "indent" || cmd === "outdent") {
      // Use a custom implementation for indent/outdent to avoid browser default styling
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const block =
          range.commonAncestorContainer.nodeType === 3
            ? range.commonAncestorContainer.parentElement
            : range.commonAncestorContainer;

        if (block && block instanceof HTMLElement) {
          if (cmd === "indent") {
            const currentMarginLeft =
              parseInt(window.getComputedStyle(block).marginLeft) || 0;
            block.style.marginLeft = `${currentMarginLeft + 40}px`;
          } else {
            const currentMarginLeft =
              parseInt(window.getComputedStyle(block).marginLeft) || 0;
            block.style.marginLeft = `${Math.max(0, currentMarginLeft - 40)}px`;
          }
        }
      }
    } else if (cmd === "lineHeight") {
      // Apply line height to the selected text
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && value) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;

        if (container.nodeType === 3) {
          // Text node, apply to parent element
          const parent = container.parentElement;
          if (parent) {
            parent.style.lineHeight = value;
          }
        } else if (container instanceof HTMLElement) {
          container.style.lineHeight = value;
        }
      }
    } else {
      document.execCommand(cmd, false, value);
    }
    handleReplyInput();
  };

  const handleReplyInput = () => {
    if (replyEditorRef.current) {
      const html = replyEditorRef.current.innerHTML;
      setReplyBody(html);
    }
  };

  const handleReplyPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text/html");
    if (paste) {
      const clean = DOMPurify.sanitize(paste, {
        ALLOWED_TAGS: [
          "div",
          "span",
          "p",
          "b",
          "i",
          "u",
          "br",
          "strong",
          "em",
          "a",
          "img",
          "table",
          "tr",
          "td",
          "tbody",
          "thead",
          "tfoot",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "ul",
          "ol",
          "li",
        ],
        ALLOWED_ATTR: [
          "style",
          "class",
          "dir",
          "align",
          "href",
          "src",
          "alt",
          "width",
          "height",
          "data-smartmail",
        ],
        ALLOW_DATA_ATTR: true,
      });
      document.execCommand("insertHTML", false, clean);
    } else {
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    }
  };

  // Delete draft function
  const handleDeleteDraft = async () => {
    if (!draftId) {
      // No draft to delete, just close
      handleCloseReply();
      return;
    }

    try {
      const response = await staffFetch(
        `/api/gmail/drafts?draftId=${encodeURIComponent(draftId)}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Draft Deleted",
          description: "Draft has been deleted.",
        });

        // Close the reply interface
        handleCloseReply();

        // Notify parent to refresh drafts
        if (onDraftSaved) {
          onDraftSaved();
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to delete draft.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting draft:", error);
      toast({
        title: "Error",
        description: "An error occurred while deleting the draft.",
        variant: "destructive",
      });
    }
  };

  // Auto-save draft function
  const saveDraft = async () => {
    // Don't auto-save if we're opening an existing draft
    if (isOpeningDraft) {
      console.log("Auto-save blocked: Opening draft");
      return;
    }

    // Don't auto-save if we just opened a draft (additional safety check)
    if (hasOpenedDraft && !isOpeningDraft) {
      console.log(
        "Auto-save blocked: Just opened draft, waiting for user interaction"
      );
      return;
    }

    // For forward mode, only require body content (no recipients needed yet)
    // For reply/replyAll, require both recipients and body content
    const hasMinimumContent = replyBody.trim() && replyBody !== EMAIL_SIGNATURE;
    const hasRequiredRecipients =
      replyMode === "forward" || replyToEmails.length > 0;

    if (!hasMinimumContent || !hasRequiredRecipients) {
      console.log("Auto-save skipped: Missing required content or recipients", {
        hasMinimumContent,
        hasRequiredRecipients,
        replyMode,
      });
      return;
    }

    console.log("Auto-save triggered for draft:", draftId);

    setIsDraftSaving(true);
    setDraftStatus("saving");

    try {
      const latestEmail = threadEmails[threadEmails.length - 1];

      const response = await staffFetch("/api/gmail/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: replyToEmails,
          cc: replyCcEmails,
          subject: replySubject || "",
          content: replyBody,
          draftId: draftId,
          // For forwards, use the original email's threadId to maintain threading in Gmail
          threadId: latestEmail?.threadId || undefined,
          inReplyTo:
            replyMode !== "forward" ? latestEmail?.messageId : undefined,
          references:
            replyMode !== "forward" ? latestEmail?.references : undefined,
          mailType: replyMode || "new", // 'reply', 'replyAll', 'forward', or 'new'
        }),
      });

      const result = await response.json();

      if (result.success) {
        setDraftId(result.draftId);
        setDraftStatus("saved");
        console.log("Draft saved successfully:", result.draftId);

        // Notify parent component to refresh drafts list
        if (onDraftSaved) {
          onDraftSaved();
        }
      } else {
        setDraftStatus("error");
        console.error("Failed to save draft:", result.error);
      }
    } catch (error) {
      setDraftStatus("error");
      console.error("Error saving draft:", error);
    } finally {
      setIsDraftSaving(false);
    }
  };

  // Convert HTML to plain text
  const htmlToPlainText = (html: string): string => {
    // Create a temporary div to parse HTML
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Replace <br>, <div>, <p> with newlines
    temp.querySelectorAll("br, div, p").forEach((el) => {
      el.insertAdjacentText("afterend", "\n");
    });

    // Get text content and clean up
    let text = temp.textContent || temp.innerText || "";

    // Remove extra whitespace while preserving line breaks
    text = text.replace(/[ \t]+/g, " "); // Multiple spaces to single
    text = text.replace(/\n\s*\n\s*\n/g, "\n\n"); // Multiple newlines to double
    text = text.trim();

    return text;
  };

  // Format quoted content helper - returns plain text
  const formatQuotedContent = (email: GmailEmail): string => {
    const quoteHeader = `On ${email.date.toLocaleString()}, ${
      email.from
    } wrote:`;

    // Convert HTML to plain text
    const plainTextContent = email.htmlContent
      ? htmlToPlainText(email.htmlContent)
      : email.textContent || "";

    const quotedText = `${quoteHeader}\n\n${plainTextContent}`;

    // Wrap in a styled div for display (as plain text)
    return quotedText;
  };

  // Send reply/forward email
  const handleSendReply = async () => {
    if (replyToEmails.length === 0 || !replySubject.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in the recipient and subject fields.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingReply(true);
    try {
      const latestEmail = threadEmails[threadEmails.length - 1];

      // Determine which API endpoint to use based on reply mode
      let apiEndpoint = "/api/gmail/send";
      if (replyMode === "reply" || replyMode === "replyAll") {
        apiEndpoint = "/api/gmail/reply";
      } else if (replyMode === "forward") {
        apiEndpoint = "/api/gmail/forward";
      }

      // Convert File objects to base64 for API
      const attachmentData = await Promise.all(
        replyAttachments.map(async (file) => {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // Remove the data URL prefix (e.g., "data:image/png;base64,")
              const base64Data = result.split(",")[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          return {
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64,
          };
        })
      );

      const response = await staffFetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: replyToEmails.join(", "),
          cc: replyCcEmails.length > 0 ? replyCcEmails.join(", ") : undefined,
          subject: replySubject.trim(),
          body: replyBody,
          threadId: latestEmail?.threadId,
          inReplyTo:
            replyMode !== "forward" ? latestEmail?.messageId : undefined,
          references:
            replyMode !== "forward" ? latestEmail?.references : undefined,
          attachments: attachmentData,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Email Sent Successfully",
          description: "Your email has been sent successfully.",
        });

        // If there's a saved draft for this compose, delete it now to avoid stale drafts
        try {
          if (draftId) {
            await staffFetch(
              `/api/gmail/drafts?draftId=${encodeURIComponent(draftId)}`,
              {
                method: "DELETE",
              }
            );
          }
        } catch (e) {
          console.warn("Failed to delete draft after send (non-blocking)", e);
        }

        // Close reply interface
        handleCloseReply();

        // Refresh the thread to show the new email
        if (selectedEmail?.threadId) {
          await fetchThreadEmails(selectedEmail.threadId);
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error sending email:", error);
      toast({
        title: "Failed to Send Email",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  // Handle attachment click - show modal for images, open PDF in new tab
  const handleAttachmentClick = async (
    messageId: string,
    attachment: GmailAttachment
  ) => {
    try {
      console.log(
        "Handling attachment:",
        attachment.filename,
        attachment.mimeType
      );

      // If it's a PDF, show in modal. The preview is fetched with the staff
      // token and shown from a blob: URL (revoked when the modal closes).
      if (attachment.mimeType === "application/pdf") {
        const url = await fetchAttachmentObjectUrl(
          messageId,
          attachment.attachmentId
        );
        setPreviewPDF({
          url,
          filename: attachment.filename,
        });
        return;
      }

      // If it's an image, load it first then show in modal
      if (attachment.mimeType?.startsWith("image/")) {
        const url = await fetchAttachmentObjectUrl(
          messageId,
          attachment.attachmentId
        );
        setPreviewAttachment({
          url,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
        });
        return;
      }

      // For other files, download them
      const response = await staffFetch(
        `/api/gmail/attachments/${messageId}/${attachment.attachmentId}`
      );

      if (!response.ok) {
        throw new Error("Failed to download attachment");
      }

      const data = await response.json();

      if (data.success) {
        // Convert base64 to blob and download
        const base64Data = data.data.data.replace(/-/g, "+").replace(/_/g, "/");
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: attachment.mimeType });
        const blobUrl = URL.createObjectURL(blob);

        // Create download link
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = attachment.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        console.log("Download completed:", attachment.filename);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Error handling attachment:", error);
      // You could add a toast notification here
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Get file icon/preview based on MIME type
  const getFileIcon = (
    mimeType: string,
    filename: string,
    messageId: string,
    attachmentId: string
  ) => {
    const extension = filename.split(".").pop()?.toLowerCase() || "";

    // Image files - show actual preview
    if (mimeType.startsWith("image/")) {
      return (
        <div className="w-full h-full rounded-lg overflow-hidden bg-gray-100">
          <AttachmentThumbnail
            messageId={messageId}
            attachmentId={attachmentId}
            alt={filename}
            className="w-full h-full object-cover"
            fallback={
              // Generic icon if the image fails to load
              <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-lg flex items-center justify-center">
                <div className="text-green-700 font-bold text-xs">IMG</div>
              </div>
            }
          />
        </div>
      );
    }

    // PDF files
    if (mimeType === "application/pdf" || extension === "pdf") {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-red-100 to-red-200 rounded-lg flex items-center justify-center relative">
          <div className="text-red-700 font-bold text-xs">PDF</div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs leading-none">📄</span>
          </div>
        </div>
      );
    }

    // Word documents
    if (mimeType.includes("word") || ["doc", "docx"].includes(extension)) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center relative">
          <div className="text-blue-700 font-bold text-xs">DOC</div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs leading-none">📝</span>
          </div>
        </div>
      );
    }

    // Excel files
    if (mimeType.includes("sheet") || ["xls", "xlsx"].includes(extension)) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-lg flex items-center justify-center relative">
          <div className="text-green-700 font-bold text-xs">XLS</div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs leading-none">📊</span>
          </div>
        </div>
      );
    }

    // PowerPoint files
    if (
      mimeType.includes("presentation") ||
      ["ppt", "pptx"].includes(extension)
    ) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 rounded-lg flex items-center justify-center relative">
          <div className="text-orange-700 font-bold text-xs">PPT</div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs leading-none">📊</span>
          </div>
        </div>
      );
    }

    // ZIP/Archive files
    if (
      mimeType.includes("zip") ||
      mimeType.includes("archive") ||
      ["zip", "rar", "7z"].includes(extension)
    ) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg flex items-center justify-center relative">
          <div className="text-purple-700 font-bold text-xs">ZIP</div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs leading-none">🗜️</span>
          </div>
        </div>
      );
    }

    // Text files
    if (mimeType.startsWith("text/") || ["txt", "csv"].includes(extension)) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center relative">
          <div className="text-gray-700 font-bold text-xs">TXT</div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-gray-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs leading-none">📄</span>
          </div>
        </div>
      );
    }

    // Video files
    if (mimeType.startsWith("video/")) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-lg flex items-center justify-center relative">
          <div className="text-indigo-700 font-bold text-xs">VID</div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs leading-none">🎥</span>
          </div>
        </div>
      );
    }

    // Audio files
    if (mimeType.startsWith("audio/")) {
      return (
        <div className="w-12 h-12 bg-gradient-to-br from-pink-100 to-pink-200 rounded-lg flex items-center justify-center relative">
          <div className="text-pink-700 font-bold text-xs">AUD</div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-pink-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs leading-none">🎵</span>
          </div>
        </div>
      );
    }

    // Default file icon
    return (
      <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
        <Paperclip className="w-6 h-6 text-gray-600" />
      </div>
    );
  };

  // Get human-readable file type
  const getFileTypeDisplay = (mimeType: string): string => {
    const typeMap: Record<string, string> = {
      "application/pdf": "PDF Document",
      "application/msword": "Word Document",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "Word Document",
      "application/vnd.ms-excel": "Excel Spreadsheet",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "Excel Spreadsheet",
      "application/vnd.ms-powerpoint": "PowerPoint Presentation",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "PowerPoint Presentation",
      "application/zip": "ZIP Archive",
      "text/plain": "Text File",
      "text/csv": "CSV File",
    };

    if (typeMap[mimeType]) {
      return typeMap[mimeType];
    }

    if (mimeType.startsWith("image/")) return "Image";
    if (mimeType.startsWith("video/")) return "Video";
    if (mimeType.startsWith("audio/")) return "Audio";
    if (mimeType.startsWith("text/")) return "Text File";

    return "File";
  };

  // Process HTML content to handle gmail_quote expansion
  const processEmailContent = (htmlContent: string, emailId: string) => {
    const isQuoteExpanded = expandedQuotes.has(emailId);

    // Debug: Log the content to see what we're working with
    console.log("Processing email content for ID:", emailId);
    console.log("Is quote expanded:", isQuoteExpanded);

    // Client-side fallback: Replace any remaining cid: references to prevent broken images
    let safeHtml = htmlContent;
    const cidMatches = safeHtml.match(/cid:[^"'\s>]+/g);
    if (cidMatches && cidMatches.length > 0) {
      console.log(
        "WARNING: Found cid: references that weren't replaced:",
        cidMatches
      );
      // Replace with a placeholder to prevent browser errors
      cidMatches.forEach((cidRef) => {
        safeHtml = safeHtml.replace(new RegExp(cidRef, "g"), "");
      });
    }

    // Note: cid: references are normally processed on the server side
    // to data URLs during email fetch. If they still exist, we remove them here to prevent errors.

    // Check if content has various quote patterns
    const hasGmailQuote =
      safeHtml.includes("gmail_quote") ||
      /class[^>]*=["'][^"']*gmail_quote[^"']*["']/i.test(safeHtml) ||
      /<div[^>]*class[^>]*gmail_quote[^>]*>/i.test(safeHtml);

    const hasZmailQuote =
      safeHtml.includes("blockquote_zmail") ||
      safeHtml.includes("zmail_extra") ||
      safeHtml.includes('id="blockquote_zmail"');

    const hasGenericBlockquote = safeHtml.includes("<blockquote");

    console.log("Gmail quote found:", hasGmailQuote);
    console.log("Zmail quote found:", hasZmailQuote);
    console.log("Generic blockquote found:", hasGenericBlockquote);

    // Additional debug for Gmail quote patterns
    if (hasGmailQuote) {
      const gmailQuoteMatch = safeHtml.match(
        /<div[^>]*class[^>]*gmail_quote[^>]*>/i
      );
      if (gmailQuoteMatch) {
        console.log("Gmail quote element found:", gmailQuoteMatch[0]);
      }
    }

    if (!hasGmailQuote && !hasZmailQuote && !hasGenericBlockquote) {
      console.log("No quote patterns found in content");
      return safeHtml;
    }

    // Try different splitting patterns based on what we found
    // Priority: Gmail first, then Zmail, then generic blockquotes
    let parts: string[] = [];
    let splitPattern = "";
    let quoteMark = "";

    if (hasGmailQuote) {
      // Handle Gmail quotes first (highest priority)
      // Try to find the exact Gmail quote div with flexible class matching
      const gmailQuoteMatch = safeHtml.match(
        /<div[^>]*class[^>]*gmail_quote[^>]*>/i
      );

      if (gmailQuoteMatch) {
        parts = safeHtml.split(gmailQuoteMatch[0]);
        splitPattern = gmailQuoteMatch[0];
        quoteMark = "gmail";
        console.log("Found Gmail quote with pattern:", gmailQuoteMatch[0]);
      } else if (safeHtml.includes('<div class="gmail_quote">')) {
        parts = safeHtml.split('<div class="gmail_quote">');
        splitPattern = '<div class="gmail_quote">';
        quoteMark = "gmail";
      } else if (safeHtml.includes("<div class='gmail_quote'>")) {
        parts = safeHtml.split("<div class='gmail_quote'>");
        splitPattern = "<div class='gmail_quote'>";
        quoteMark = "gmail";
      }
    } else if (hasZmailQuote) {
      // Handle Zoho Mail quotes (zmail_extra is usually the separator)
      if (safeHtml.includes('class="zmail_extra"')) {
        parts = safeHtml.split('<div class="zmail_extra"');
        splitPattern = '<div class="zmail_extra"';
        quoteMark = "zmail";
      } else if (safeHtml.includes('id="blockquote_zmail"')) {
        parts = safeHtml.split('<blockquote id="blockquote_zmail"');
        splitPattern = '<blockquote id="blockquote_zmail"';
        quoteMark = "zmail";
      }
    } else if (hasGenericBlockquote) {
      // Handle generic blockquotes (fallback)
      const blockquoteMatch = safeHtml.match(/<blockquote[^>]*>/);
      if (blockquoteMatch) {
        parts = safeHtml.split(blockquoteMatch[0]);
        splitPattern = blockquoteMatch[0];
        quoteMark = "generic";
      }
    }

    if (parts.length <= 1) {
      console.log("Could not split content into parts with any pattern");
      return safeHtml;
    }

    console.log(
      "Successfully split content into",
      parts.length,
      "parts using",
      quoteMark,
      "pattern"
    );

    const beforeQuote = parts[0];
    const afterQuote = splitPattern + parts.slice(1).join(splitPattern);

    if (isQuoteExpanded) {
      // Show full content with hide button in the same position
      return `
        ${beforeQuote}
        <div class="gmail-quote-toggle-container" style="margin: 16px 0;">
          <button 
            class="gmail-quote-toggle-btn" 
            data-email-id="${emailId}"
            style="
              background: none;
              border: none;
              color: #1a73e8;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
              font-size: 12px;
              padding: 4px 0;
              font-family: Arial, sans-serif;
            "
          >
            <span style="display: inline-block; width: 16px; text-align: center;">⋯</span>
            Hide expanded content
          </button>
        </div>
        ${afterQuote}
      `;
    } else {
      // Show only content before quotes + show button
      return (
        beforeQuote +
        `
        <div class="gmail-quote-toggle-container" style="margin: 16px 0;">
          <button 
            class="gmail-quote-toggle-btn" 
            data-email-id="${emailId}"
            style="
              background: none;
              border: none;
              color: #1a73e8;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
              font-size: 12px;
              padding: 4px 0;
              font-family: Arial, sans-serif;
            "
          >
            <span style="display: inline-block; width: 16px; text-align: center;">⋯</span>
            Show trimmed content
          </button>
        </div>
        <div class="gmail-quote-hidden" style="display: none;">
          ${afterQuote}
        </div>
      `
      );
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setThreadEmails([]);
      setExpandedEmails(new Set());
      setExpandedQuotes(new Set());
      setShowAllEmails(false);
      // Reset reply state
      setReplyMode(null);
      setReplyTo("");
      setReplyToEmails([]);
      setReplyCc("");
      setReplyCcEmails([]);
      setReplySubject("");
      setReplyBody("");
      setShowReplyCc(false);
      // Reset draft state
      setDraftId(null);
      setDraftStatus(null);
      setHasOpenedDraft(false);
      setIsOpeningDraft(false);
      setReplyAttachments([]);
    }
  }, [isOpen]);

  // Handle clicks outside dropdowns to close them
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".relative")) {
        setShowFontMenu(false);
        setShowSizeMenu(false);
        setShowColorMenu(false);
        setShowAlignMenu(false);
        setShowMoreMenu(false);
        setShowLineHeightMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Constants for email collapsing logic
  const COLLAPSE_THRESHOLD = 5; // Start collapsing when more than 5 emails
  const SHOW_FROM_START = 2; // Always show first 2 emails
  const SHOW_FROM_END = 2; // Always show last 2 emails

  // Calculate which emails to display (excluding drafts)
  const getVisibleEmails = () => {
    // Filter out draft emails
    const nonDraftEmails = threadEmails.filter((email) => !email.isDraft);

    if (nonDraftEmails.length <= COLLAPSE_THRESHOLD || showAllEmails) {
      return nonDraftEmails;
    }

    const startEmails = nonDraftEmails.slice(0, SHOW_FROM_START);
    const endEmails = nonDraftEmails.slice(-SHOW_FROM_END);
    const collapsedCount =
      nonDraftEmails.length - SHOW_FROM_START - SHOW_FROM_END;

    return { startEmails, endEmails, collapsedCount };
  };

  const toggleShowAllEmails = () => {
    setShowAllEmails(!showAllEmails);
  };

  // Function to render individual email item
  const renderEmailItem = (
    email: GmailEmail,
    index: number,
    isExpanded: boolean,
    isLatest: boolean
  ) => {
    return (
      <div
        key={email.id}
        className={`w-full ${isLatest ? "bg-blue-50/30" : ""}`}
      >
        {/* Email Header - Always Visible */}
        <div
          className={`py-3 cursor-pointer hover:bg-gray-50 ${
            isExpanded ? "border-b border-gray-200 pb-4" : ""
          }`}
          onClick={() => toggleEmailExpansion(email.id)}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <EmailAvatar
                email={email.from}
                name={email.from}
                size="md"
                className="flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate">
                    {formatSenderWithEmail(email.from)}
                  </div>
                  {email.hasAttachments && (
                    <Paperclip className="w-3 h-3 text-gray-500 flex-shrink-0" />
                  )}
                  {!email.isRead && (
                    <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                  )}
                </div>
                <div className="text-xs text-gray-600 truncate">
                  to {email.to}
                  {email.cc && <span>, cc: {email.cc}</span>}
                </div>
                {!isExpanded && (
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {email.snippet}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-right min-w-0">
                <div className="text-xs text-gray-500 whitespace-nowrap">
                  {email.date?.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year:
                      email.date.getFullYear() !== new Date().getFullYear()
                        ? "numeric"
                        : undefined,
                  })}{" "}
                  {email.date?.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              {/* Actions for expanded emails */}
              {isExpanded && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem>
                      <Reply className="w-3 h-3 mr-2" />
                      Reply
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Forward className="w-3 h-3 mr-2" />
                      Forward
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Archive className="w-3 h-3 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Labels for expanded emails */}
          {isExpanded && (
            <div className="flex items-center gap-2 mt-3">
              {email.isImportant && (
                <Badge
                  variant="outline"
                  className="text-yellow-600 border-yellow-600 text-xs"
                >
                  Important
                </Badge>
              )}
              {email.labels
                ?.filter(
                  (label) => !["INBOX", "SENT", "UNREAD"].includes(label)
                )
                .map((label) => (
                  <Badge key={label} variant="outline" className="text-xs">
                    {label.toLowerCase()}
                  </Badge>
                ))}
            </div>
          )}
        </div>

        {/* Email Content - Only Visible When Expanded */}
        {isExpanded && (
          <div className="p-4 pt-0 max-w-full">
            <div className="mt-4 max-w-full">
              {email.htmlContent ? (
                <div
                  key={`${email.id}-${expandedQuotes.has(email.id)}`}
                  className="gmail-email-content prose-sm max-w-full text-sm overflow-hidden"
                  dangerouslySetInnerHTML={{
                    __html: processEmailContent(email.htmlContent, email.id),
                  }}
                  style={{
                    // Gmail-specific styles for proper quote rendering
                    lineHeight: "1.5",
                    fontFamily: "Arial, sans-serif",
                    fontSize: "13px",
                    color: "#222",
                  }}
                  onClick={(e) => {
                    // Handle quote toggle button clicks
                    const target = e.target as HTMLElement;
                    if (
                      target.classList.contains("gmail-quote-toggle-btn") ||
                      target.closest(".gmail-quote-toggle-btn")
                    ) {
                      e.preventDefault();
                      e.stopPropagation();
                      const btn = target.closest(
                        ".gmail-quote-toggle-btn"
                      ) as HTMLElement;
                      const emailId = btn?.getAttribute("data-email-id");
                      if (emailId) {
                        console.log(
                          "Toggling quote expansion for email:",
                          emailId
                        );
                        toggleQuoteExpansion(emailId);
                      }
                    }
                  }}
                />
              ) : email.textContent ? (
                <div className="gmail-email-content max-w-full">
                  <div className="whitespace-pre-wrap text-gray-800 leading-relaxed text-sm overflow-hidden break-words">
                    {email.textContent}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs">No content available</p>
                </div>
              )}
            </div>

            {/* Attachments Section */}
            {email.attachments && email.attachments.length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {email.attachments.length} attachment
                    {email.attachments.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {email.attachments.map((attachment, index) => (
                    <div
                      key={`${email.id}-attachment-${index}`}
                      className="gmail-attachment-card group relative w-32 h-32 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm cursor-pointer"
                      onClick={() =>
                        handleAttachmentClick(email.id, attachment)
                      }
                    >
                      {/* Preview/Icon Area */}
                      <div className="w-full h-20 flex items-center justify-center bg-gray-50 group-hover:bg-gray-100 transition-colors">
                        <div className="file-type-icon">
                          {getFileIcon(
                            attachment.mimeType,
                            attachment.filename,
                            email.id,
                            attachment.attachmentId
                          )}
                        </div>
                      </div>

                      {/* File Info */}
                      <div className="p-2 h-12 flex flex-col justify-center bg-white">
                        <div className="text-xs text-gray-900 font-medium truncate leading-tight">
                          {attachment.filename}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {formatFileSize(attachment.size)}
                        </div>
                      </div>

                      {/* Hover Overlay */}
                      <div className="attachment-overlay absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white rounded-full p-2 shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-200 border border-gray-200">
                          <Download className="w-4 h-4 text-gray-700" />
                        </div>
                      </div>

                      {/* Tooltip on Hover */}
                      <div className="gmail-attachment-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                        <div className="font-medium">{attachment.filename}</div>
                        <div className="text-gray-300 mt-0.5">
                          {formatFileSize(attachment.size)} •{" "}
                          {getFileTypeDisplay(attachment.mimeType)}
                        </div>
                        <div className="text-gray-400 text-xs mt-1">
                          Click to download
                        </div>
                        {/* Tooltip Arrow */}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reply/Forward Buttons for Latest Email - Hide when inline editor is open */}
            {isLatest && !replyMode && (
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-100">
                <Button
                  variant="outline"
                  onClick={() => handleReply(email)}
                  className="rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-1 text-xs"
                >
                  <Reply className="w-3 h-3 mr-1" />
                  Reply
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleReplyAll(email)}
                  className="rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-1 text-xs"
                >
                  <Reply className="w-3 h-3 mr-1" />
                  Reply All
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleForward(email)}
                  className="rounded-full border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-1 text-xs"
                >
                  <Forward className="w-3 h-3 mr-1" />
                  Forward
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  return (
    <>
      {/* Add styles for rich text editor - matching ComposeEmail */}
      <style>{`
        /* Disable default browser reset for contenteditable */
        [contenteditable="true"] * {
          box-sizing: border-box !important;
        }

        /* Tables in signature */
        [contenteditable="true"] table {
          border-collapse: collapse !important;
          border-spacing: 0 !important;
        }

        [contenteditable="true"] table td {
          padding: 0 !important;
          vertical-align: top !important;
        }

        [contenteditable="true"] span[style*="display:inline-block"] {
          display: inline-block !important;
          border: medium !important;
          overflow: hidden !important;
        }

        /* Images inline for icon rows like Gmail */
        [contenteditable="true"] img {
          display: inline-block !important;
          max-width: 100% !important;
          height: auto !important;
          border: 2px solid transparent !important;
          position: relative !important;
        }

        /* Selected image with border */
        [contenteditable="true"] img.selected {
          border: 2px solid #4285f4 !important;
        }
        /* Ensure social icons sit on a single row */
        [contenteditable="true"] a img {
          vertical-align: middle !important;
          margin-right: 8px !important;
        }

        /* Remove default underline from links to match Gmail compose */
        [contenteditable="true"] a {
          text-decoration: none !important;
        }
        [contenteditable="true"] a:hover {
          text-decoration: underline !important;
        }

        [contenteditable="true"] a {
          color: rgb(17, 85, 204) !important;
          text-decoration: none !important;
        }

        [contenteditable="true"] a:hover {
          text-decoration: underline !important;
        }

        [contenteditable="true"] p {
          line-height: 1.2 !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* Specific height for contact info paragraphs */
        [contenteditable="true"] p[style*="line-height:1"] {
          height: 25px !important;
          line-height: 1 !important;
          display: flex !important;
          align-items: center !important;
        }

        /* Empty paragraphs should be 17px */
        [contenteditable="true"] p:empty {
          height: 17px !important;
        }

        /* Handle font size attributes properly - Gmail style (1=smallest, 7=largest) */
        [contenteditable="true"] font[size="1"] {
          font-size: 8pt !important;
        }
        [contenteditable="true"] font[size="2"] {
          font-size: 10pt !important;
        }
        [contenteditable="true"] font[size="3"] {
          font-size: 12pt !important;
        }
        [contenteditable="true"] font[size="4"] {
          font-size: 14pt !important;
        }
        [contenteditable="true"] font[size="5"] {
          font-size: 18pt !important;
        }
        [contenteditable="true"] font[size="6"] {
          font-size: 24pt !important;
        }
        [contenteditable="true"] font[size="7"] {
          font-size: 36pt !important;
        }

        [contenteditable="true"] span {
          display: inline !important;
        }

        [contenteditable="true"] div {
          display: block !important;
        }

        /* Preserve original font families from inline styles */
        [contenteditable="true"] span[style*="font-family"] {
          font-family: inherit !important;
        }

        [contenteditable="true"] p[style*="font-family"] {
          font-family: inherit !important;
        }

        /* Fix border styles that get normalized by browser */
        [contenteditable="true"] table[style*="border-width: medium"] {
          border: medium !important;
        }

        [contenteditable="true"] span[style*="border-width: medium"] {
          border: medium !important;
        }

        /* Ensure proper spacing and alignment */
        [contenteditable="true"] [dir="ltr"] {
          direction: ltr !important;
          text-align: left !important;
        }

        [contenteditable="true"] [align="left"] {
          text-align: left !important;
        }

        /* Override browser normalization of border styles */
        [contenteditable="true"] *[style*="border-width: medium"] {
          border: medium !important;
        }

        [contenteditable="true"] *[style*="border-style: initial"] {
          border-style: solid !important;
        }

        [contenteditable="true"] *[style*="border-color: initial"] {
          border-color: initial !important;
        }
      `}</style>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          // Don't close if image or PDF preview modal is open
          if (!open && (previewAttachment || previewPDF)) {
            console.log("Preventing dialog close - preview modal is open");
            return;
          }

          // Check if we should prevent closing due to Gmail/Theme button click
          const windowFlag = (window as any).shouldPreventCloseGmail;
          if (!open && windowFlag) {
            console.log("Preventing dialog close due to Gmail button click");
            return; // Don't close
          }

          onOpenChange(open);
        }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-white">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {selectedEmail?.subject || "(no subject)"}
            </DialogTitle>
          </DialogHeader>

          {/* Simplified Header with Actions and Subject Only */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
            {/* Top action bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" title="Mark as unread">
                  <Mail className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" title="Add to Tasks">
                  <Calendar className="w-3 h-3" />
                </Button>
                <Separator orientation="vertical" className="mx-2 h-6" />
                <Button variant="ghost" size="sm" title="Star">
                  {selectedEmail?.isStarred ? (
                    <Star className="w-3 h-3 fill-current text-yellow-500" />
                  ) : (
                    <StarOff className="w-3 h-3" />
                  )}
                </Button>

                {/* Gmail button inside modal header */}
                <Button
                  variant="outline"
                  size="sm"
                  title="Open Gmail in new tab"
                  onClick={() => {
                    if (onGmailOpen) {
                      onGmailOpen();
                    } else {
                      window.open("https://mail.google.com", "_blank");
                    }
                  }}
                  className="ml-2"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path
                      fill="currentColor"
                      d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
                    />
                  </svg>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem
                      onClick={() =>
                        selectedEmail && handleReply(selectedEmail)
                      }
                    >
                      <Reply className="w-3 h-3 mr-2" />
                      Reply
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        selectedEmail && handleReplyAll(selectedEmail)
                      }
                    >
                      <Reply className="w-3 h-3 mr-2" />
                      Reply All
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        selectedEmail && handleForward(selectedEmail)
                      }
                    >
                      <Forward className="w-3 h-3 mr-2" />
                      Forward
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Archive className="w-3 h-3 mr-2" />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600">
                      <Trash2 className="w-3 h-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Subject */}
              <h1 className="text-lg font-medium text-gray-900 leading-tight">
                {selectedEmail?.subject || "(no subject)"}
              </h1>
            </div>
          </div>

          {/* Thread Conversation View */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {isLoadingThread ? (
              <div className="flex items-center justify-center flex-1 min-h-0">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="text-gray-600 text-sm">
                    Loading conversation...
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto overflow-x-hidden h-full w-full">
                <div className="px-6 py-4 space-y-6 w-full">
                  {(() => {
                    const visibleEmails = getVisibleEmails();

                    // If emails should be collapsed
                    if (
                      typeof visibleEmails === "object" &&
                      "startEmails" in visibleEmails
                    ) {
                      const { startEmails, endEmails, collapsedCount } =
                        visibleEmails;

                      return (
                        <>
                          {/* First batch of emails */}
                          {startEmails.map((email, index) => {
                            const isExpanded = expandedEmails.has(email.id);
                            const isLatest = false; // None of the start emails are latest
                            return renderEmailItem(
                              email,
                              index,
                              isExpanded,
                              isLatest
                            );
                          })}

                          {/* Collapsed emails indicator */}
                          <div className="flex items-center justify-center py-4">
                            <Button
                              variant="ghost"
                              onClick={toggleShowAllEmails}
                              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm"
                            >
                              <ChevronDown className="w-4 h-4" />
                              <span>
                                Show {collapsedCount} hidden{" "}
                                {collapsedCount === 1 ? "message" : "messages"}
                              </span>
                            </Button>
                          </div>

                          {/* Last batch of emails */}
                          {endEmails.map((email, index) => {
                            const isExpanded = expandedEmails.has(email.id);
                            const isLatest = index === endEmails.length - 1; // Last email in endEmails is the latest
                            const actualIndex =
                              threadEmails.length - endEmails.length + index;
                            return renderEmailItem(
                              email,
                              actualIndex,
                              isExpanded,
                              isLatest
                            );
                          })}
                        </>
                      );
                    }

                    // Show all emails (either small thread or expanded view)
                    return (visibleEmails as GmailEmail[]).map(
                      (email, index) => {
                        const isExpanded = expandedEmails.has(email.id);
                        const isLatest = index === threadEmails.length - 1;
                        return renderEmailItem(
                          email,
                          index,
                          isExpanded,
                          isLatest
                        );
                      }
                    );
                  })()}

                  {/* Show collapse button when all emails are visible and thread is large */}
                  {showAllEmails &&
                    threadEmails.length > COLLAPSE_THRESHOLD && (
                      <div className="flex items-center justify-center py-4">
                        <Button
                          variant="ghost"
                          onClick={toggleShowAllEmails}
                          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm"
                        >
                          <ChevronUp className="w-4 h-4" />
                          <span>Hide messages</span>
                        </Button>
                      </div>
                    )}

                  {threadEmails.length === 0 && !isLoadingThread && (
                    <div className="text-center py-12 text-gray-500">
                      <Mail className="w-8 h-8 text-gray-300 mx-auto mb-4" />
                      <p className="text-xs">No emails in this conversation</p>
                    </div>
                  )}

                  {/* Inline Reply/Forward Container */}
                  {replyMode && selectedEmail && (
                    <div className="reply-container mt-6 border-t border-gray-200 pt-4">
                      <div className="bg-white border border-gray-300 rounded-lg shadow-sm">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">
                              {replyMode === "reply"
                                ? "Reply"
                                : replyMode === "replyAll"
                                ? "Reply All"
                                : "Forward"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Draft status indicator */}
                            {draftStatus && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                {draftStatus === "saving" && (
                                  <>
                                    <div className="w-2 h-2 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                                    Saving...
                                  </>
                                )}
                                {draftStatus === "saved" && (
                                  <>
                                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    Saved
                                  </>
                                )}
                                {draftStatus === "error" && (
                                  <>
                                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                                    Error
                                  </>
                                )}
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleDeleteDraft}
                              className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                              title="Delete draft"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Recipients and Subject */}
                        <div className="px-4 py-3 space-y-2">
                          {/* To field */}
                          <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
                            <label className="text-sm text-gray-600 w-12 flex-shrink-0">
                              To
                            </label>
                            <EmailAutocomplete
                              value={replyTo}
                              onChange={setReplyTo}
                              selectedEmails={replyToEmails}
                              onSelectedEmailsChange={setReplyToEmails}
                              placeholder="Recipients"
                              className="flex-1"
                            />
                            {!showReplyCc && (
                              <button
                                onClick={() => setShowReplyCc(true)}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Cc
                              </button>
                            )}
                          </div>

                          {/* CC field */}
                          {showReplyCc && (
                            <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
                              <label className="text-sm text-gray-600 w-12 flex-shrink-0">
                                Cc
                              </label>
                              <EmailAutocomplete
                                value={replyCc}
                                onChange={setReplyCc}
                                selectedEmails={replyCcEmails}
                                onSelectedEmailsChange={setReplyCcEmails}
                                placeholder="Carbon copy"
                                className="flex-1"
                              />
                            </div>
                          )}

                          {/* Subject */}
                          <div className="flex items-center gap-2 border-b pb-2">
                            <Input
                              value={replySubject}
                              onChange={(e) => setReplySubject(e.target.value)}
                              placeholder="Subject"
                              className="flex-1 border-none shadow-none focus:ring-0 px-0 font-medium bg-transparent h-6 text-sm"
                            />
                          </div>
                        </div>

                        {/* Rich Text Editor */}
                        <div className="px-4 pb-4">
                          {/* Enhanced Formatting Toolbar */}
                          <div className="mb-2 flex items-center gap-[1px] p-1 bg-gray-50 flex-wrap rounded-lg">
                            {/* Undo/Redo */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => execCommand("undo")}
                            >
                              <MdUndo className="w-5 h-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => execCommand("redo")}
                            >
                              <MdRedo className="w-5 h-5" />
                            </Button>
                            <div className="w-px h-6 bg-gray-300 mx-1"></div>

                            {/* Font Family Dropdown */}
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 flex items-center gap-1"
                                onClick={() => setShowFontMenu(!showFontMenu)}
                              >
                                <span className="text-xs">
                                  {currentFontFamily}
                                </span>
                                <MdExpandMore className="w-4 h-4" />
                              </Button>
                              {showFontMenu && (
                                <div className="absolute bottom-9 left-0 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[160px]">
                                  {fontFamilies.map((font) => (
                                    <button
                                      key={font.value}
                                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                                      style={{ fontFamily: font.value }}
                                      onClick={() => {
                                        execCommand("fontName", font.value);
                                        setCurrentFontFamily(font.label);
                                        setShowFontMenu(false);
                                      }}
                                    >
                                      {font.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Font Size Dropdown */}
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setShowSizeMenu(!showSizeMenu)}
                                title="Font Size"
                              >
                                <MdTitle className="w-5 h-5" />
                              </Button>
                              {showSizeMenu && (
                                <div className="absolute bottom-9 left-0 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[80px]">
                                  {fontSizes.map((size) => (
                                    <button
                                      key={size.value}
                                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                                      onClick={() => {
                                        execCommand("fontSize", size.value);
                                        setCurrentFontSize(size.label);
                                        setShowSizeMenu(false);
                                      }}
                                    >
                                      {size.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Line Height Dropdown */}
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() =>
                                  setShowLineHeightMenu(!showLineHeightMenu)
                                }
                                title="Line Height"
                              >
                                <MdFormatLineSpacing className="w-5 h-5" />
                              </Button>
                              {showLineHeightMenu && (
                                <div className="absolute bottom-9 left-0 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[100px]">
                                  {lineHeights.map((lh) => (
                                    <button
                                      key={lh.value}
                                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                                      onClick={() => {
                                        execCommand("lineHeight", lh.value);
                                        setCurrentLineHeight(lh.label);
                                        setShowLineHeightMenu(false);
                                      }}
                                    >
                                      {lh.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="w-px h-6 bg-gray-300 mx-1"></div>

                            {/* Bold, Italic, Underline */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => execCommand("bold")}
                            >
                              <MdFormatBold className="w-5 h-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => execCommand("italic")}
                            >
                              <MdFormatItalic className="w-5 h-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => execCommand("underline")}
                            >
                              <MdFormatUnderlined className="w-5 h-5" />
                            </Button>

                            <div className="w-px h-6 bg-gray-300 mx-1"></div>

                            {/* Color Picker */}
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 flex items-center gap-1"
                                onClick={() => setShowColorMenu(!showColorMenu)}
                              >
                                <MdPalette className="w-5 h-5" />
                                <MdExpandMore className="w-4 h-4" />
                              </Button>
                              {showColorMenu && (
                                <div className="absolute bottom-9 left-0 bg-white border border-gray-200 rounded shadow-lg z-50 p-3 min-w-[220px]">
                                  <div className="mb-3">
                                    <div className="text-xs font-medium text-gray-600 mb-2">
                                      Text Color
                                    </div>
                                    <div className="grid grid-cols-8 gap-1">
                                      {textColors.map((color) => (
                                        <button
                                          key={color}
                                          className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                                          style={{ backgroundColor: color }}
                                          onClick={() => {
                                            execCommand("foreColor", color);
                                            setShowColorMenu(false);
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-gray-600 mb-2">
                                      Background Color
                                    </div>
                                    <div className="grid grid-cols-8 gap-1">
                                      {highlightColors.map((color) => (
                                        <button
                                          key={color}
                                          className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                                          style={{ backgroundColor: color }}
                                          onClick={() => {
                                            execCommand("backColor", color);
                                            setShowColorMenu(false);
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Alignment Dropdown */}
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 flex items-center gap-1"
                                onClick={() => setShowAlignMenu(!showAlignMenu)}
                              >
                                <MdFormatAlignLeft className="w-5 h-5" />
                                <MdExpandMore className="w-4 h-4" />
                              </Button>
                              {showAlignMenu && (
                                <div className="absolute bottom-9 left-0 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[130px]">
                                  <button
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm flex items-center gap-2"
                                    onClick={() => {
                                      execCommand("justifyLeft");
                                      setShowAlignMenu(false);
                                    }}
                                  >
                                    <MdFormatAlignLeft className="w-5 h-5" />
                                    Left
                                  </button>
                                  <button
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm flex items-center gap-2"
                                    onClick={() => {
                                      execCommand("justifyCenter");
                                      setShowAlignMenu(false);
                                    }}
                                  >
                                    <MdFormatAlignCenter className="w-5 h-5" />
                                    Center
                                  </button>
                                  <button
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm flex items-center gap-2"
                                    onClick={() => {
                                      execCommand("justifyRight");
                                      setShowAlignMenu(false);
                                    }}
                                  >
                                    <MdFormatAlignRight className="w-5 h-5" />
                                    Right
                                  </button>
                                  <button
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm flex items-center gap-2"
                                    onClick={() => {
                                      execCommand("justifyFull");
                                      setShowAlignMenu(false);
                                    }}
                                  >
                                    <MdFormatAlignJustify className="w-5 h-5" />
                                    Justify
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="w-px h-6 bg-gray-300 mx-1"></div>

                            {/* Lists */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => execCommand("insertUnorderedList")}
                            >
                              <MdFormatListBulleted className="w-5 h-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => execCommand("insertOrderedList")}
                            >
                              <MdFormatListNumbered className="w-5 h-5" />
                            </Button>
                            <div className="w-px h-6 bg-gray-300 mx-1"></div>

                            {/* More Menu Dropdown */}
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                              >
                                <MdMoreVert className="w-5 h-5" />
                              </Button>
                              {showMoreMenu && (
                                <div className="absolute bottom-9 left-0 bg-white border border-gray-200 rounded shadow-lg z-50">
                                  <button
                                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100"
                                    onClick={() => {
                                      execCommand("indent");
                                    }}
                                    title="Indent More"
                                  >
                                    <MdFormatIndentIncrease className="w-5 h-5" />
                                  </button>
                                  <button
                                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100"
                                    onClick={() => {
                                      execCommand("outdent");
                                    }}
                                    title="Indent Less"
                                  >
                                    <MdFormatIndentDecrease className="w-5 h-5" />
                                  </button>
                                  <button
                                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100"
                                    onClick={() => {
                                      execCommand("strikeThrough");
                                    }}
                                    title="Strikethrough"
                                  >
                                    <MdStrikethroughS className="w-5 h-5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Editor */}
                          <div
                            ref={replyEditorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={handleReplyInput}
                            onPaste={handleReplyPaste}
                            className="min-h-[200px] p-3 text-sm"
                            style={{
                              fontFamily:
                                "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                              fontSize: "14px",
                              whiteSpace: "pre-wrap",
                              outline: "none",
                              border: "none",
                            }}
                          />

                          {/* Quoted Content Toggle */}
                          {replyMode !== "forward" &&
                            threadEmails.length > 0 && (
                              <div className="mt-3">
                                <button
                                  onClick={() =>
                                    setShowReplyQuote(!showReplyQuote)
                                  }
                                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-xs"
                                >
                                  {showReplyQuote ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronUp className="w-4 h-4" />
                                  )}
                                  {showReplyQuote
                                    ? "Hide quoted text"
                                    : "Show quoted text"}
                                </button>
                                {showReplyQuote && (
                                  <div
                                    className="mt-2 border-l-4 border-gray-300 pl-4 text-sm max-w-full"
                                    style={{
                                      lineHeight: "1.5",
                                      fontFamily: "Arial, sans-serif",
                                      fontSize: "13px",
                                      color: "#666",
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {formatQuotedContent(
                                      threadEmails[threadEmails.length - 1]
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                        </div>

                        {/* Attachments Display */}
                        {replyAttachments.length > 0 && (
                          <div className="px-4 py-2 border-t border-gray-200">
                            <div className="flex flex-wrap gap-2">
                              {replyAttachments.map((file, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-md border border-gray-300"
                                >
                                  <Paperclip className="w-4 h-4 text-gray-600" />
                                  <span className="text-sm text-gray-700 truncate max-w-[200px]">
                                    {file.name}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    (
                                    {file.size > 1024 * 1024
                                      ? `${(file.size / (1024 * 1024)).toFixed(
                                          2
                                        )} MB`
                                      : `${(file.size / 1024).toFixed(2)} KB`}
                                    )
                                  </span>
                                  <button
                                    onClick={() =>
                                      handleRemoveAttachment(index)
                                    }
                                    className="ml-1 hover:text-red-600"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Send Button */}
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 rounded-b-lg">
                          {/* Attachment Button */}
                          <div className="relative">
                            <input
                              type="file"
                              multiple
                              onChange={handleReplyAttachment}
                              className="hidden"
                              id="reply-attachment-input"
                            />
                            <label
                              htmlFor="reply-attachment-input"
                              className="cursor-pointer"
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-gray-600 hover:text-gray-900"
                              >
                                <Paperclip className="w-4 h-4 mr-2" />
                                Attach
                              </Button>
                            </label>
                          </div>

                          <Button
                            onClick={handleSendReply}
                            disabled={
                              isSendingReply ||
                              replyToEmails.length === 0 ||
                              !replySubject.trim()
                            }
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                          >
                            {isSendingReply ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Sending...
                              </div>
                            ) : (
                              <>
                                <Send className="w-4 h-4 mr-2" />
                                Send
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={!!previewAttachment}
        onClose={() => {
          if (previewAttachment) URL.revokeObjectURL(previewAttachment.url);
          setPreviewAttachment(null);
        }}
        imageUrl={previewAttachment?.url || ""}
        filename={previewAttachment?.filename || ""}
        mimeType={previewAttachment?.mimeType || ""}
      />

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={!!previewPDF}
        onClose={() => {
          if (previewPDF) URL.revokeObjectURL(previewPDF.url);
          setPreviewPDF(null);
        }}
        pdfUrl={previewPDF?.url || ""}
        filename={previewPDF?.filename || ""}
      />
    </>
  );
}
