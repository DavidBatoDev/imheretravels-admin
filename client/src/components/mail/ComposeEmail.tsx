"use client";

import { useState, useRef, useEffect } from "react";
import { staffFetch, fetchAttachmentDataUrl } from "@/lib/staff-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailAutocomplete } from "@/components/ui/email-autocomplete";
import { useToast } from "@/hooks/use-toast";
import DOMPurify from "dompurify";
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Paperclip,
  Send,
  MoreHorizontal,
} from "lucide-react";

// Email signature HTML - Updated to match Gmail exactly
const EMAIL_SIGNATURE = `<div><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature"><div dir="ltr"><div style="color:rgb(34,34,34)">Kind regards,&nbsp;</div><div style="color:rgb(34,34,34)"><br><div dir="ltr"><div dir="ltr"><span style="color:rgb(0,0,0)"><div dir="ltr" align="left" style="margin-left:0pt"><div align="left" style="margin-left:0pt"><div dir="ltr" align="left" style="margin-left:0pt"><table style="border:medium;border-collapse:collapse"><tbody><tr style="height:0pt"><td style="vertical-align:top;overflow:hidden"><span style="border:medium;display:inline-block;overflow:hidden;width:174px;height:174px"><img src="https://lh7-us.googleusercontent.com/W6PhRjN5UgrDp-2PibTWmAYHg_SMqQaitD63npeRzqu7Iy1QmjB1VgUSpwaWvQhYnFlJqgYh9t22O5zPUO3Rgf5oDc2urjsnba2jg8npqDf9GZGwL5hctWavIuDW95fdPYncuhBpvnRI8TZmjKhc5LM" width="167" height="167" style="margin-left: 0px; margin-top: 0px; margin-right: 0px;"></span><br></td><td style="vertical-align:top;overflow:hidden"><span style="font-family:&quot;DM Sans&quot;,sans-serif;font-size:12pt;font-weight:700">Bella Millan</span><p dir="ltr" style="line-height:1.2;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline">Outreach Manager</span></p><p dir="ltr" style="line-height:1.2;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline"><br></span></p><p dir="ltr" style="line-height:1;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline">&nbsp;&nbsp;<img src="https://ci3.googleusercontent.com/mail-sig/AIorK4xZqel1TeaN_XwhPphMi6LJk9bDE5tvQjKoqr8WZjpwZLfrkzJuGw9keRgg_Q6x7brg_L9A2pU" width="17" height="17" style="margin-right:0px">&nbsp;&nbsp;</span><a href="tel:639163041767" style="color:rgb(17,85,204)" target="_blank"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline;color:rgb(0,0,0)">+63 (916) 304 1767</span></a></p><p dir="ltr" style="line-height:1;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline">&nbsp;&nbsp;<img src="https://ci3.googleusercontent.com/mail-sig/AIorK4y5FclvwPG32SXqPSvbPd3beA1UB8Wx1dgwaJEcdWLwxjh1yRwhc2_GSpCg0zBpgiWvz9eb4eo">&nbsp; bella</span><a href="mailto:amer@imheretravels.com" style="color:rgb(17,85,204)" target="_blank"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline;color:rgb(0,0,0)">@imheretravels.com</span></a></p><p dir="ltr" style="line-height:1;margin-top:0pt;margin-bottom:0pt"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline">&nbsp;<a href="https://imheretravels.com/" style="color:rgb(17,85,204)" target="_blank">&nbsp;</a></span><img src="https://ci3.googleusercontent.com/mail-sig/AIorK4w81hW7M7z1ED8dHl5gyqSEylE_boBaxtpdxOxm_eOviPDAVjKkznVaFTCzCV8t_YYy7A_2sns"><a href="https://imheretravels.com/" style="color:rgb(17,85,204)" target="_blank"><span style="font-size:11pt;font-family:Arial,sans-serif;vertical-align:baseline;color:rgb(0,0,0)">&nbsp; www.imheretravels.com</span></a></p><p dir="ltr" style="line-height:0.9;margin-top:0pt;margin-bottom:0pt"><br></p>&nbsp;&nbsp;<a href="https://www.instagram.com/imheretravels/" style="color:rgb(17,85,204)" target="_blank"><img src="https://ci3.googleusercontent.com/mail-sig/AIorK4xLX1jMZKunN4wNGSCmIVUjCQgc1_FpjHTBZnn_GD9YIv0Q-aBxP4Iy7Rh_a7iBZeNGFqJnSUI" width="26" height="26" style="margin-right:0px"></a>&nbsp;&nbsp;<a href="https://www.tiktok.com/@imheretravels" style="color:rgb(17,85,204)" target="_blank"><img alt="https://www.tiktok.com/@imheretravels" src="https://ci3.googleusercontent.com/mail-sig/AIorK4yNZvr_t6SSKB69FIelx0LaypIom57zAMKJhGe2q8iNg3WK5gP2cxCXL_mtZOoe5gXiq2hG97g" width="25" height="25" style="margin-right:0px"></a>&nbsp;&nbsp;<a href="https://www.facebook.com/profile.php?id=100089932897402" style="color:rgb(17,85,204)" target="_blank"><img alt="https://www.facebook.com/profile.php?id=100089932897402" src="https://ci3.googleusercontent.com/mail-sig/AIorK4wOueqr6zk98SKG_4lWhrPrRcAuBBs2oDMmoGQbRH0ZhSmkhOaIOHB0oXXMYRky6QC2bA6dNQA" width="27" height="27" style="margin-right:0px"></a>&nbsp;&nbsp;<a href="http://www.imheretravels.com/" style="color:rgb(17,85,204)" target="_blank"><img alt="www.imheretravels.com" src="https://ci3.googleusercontent.com/mail-sig/AIorK4yYRJk1jr5S9TPJLoy2n2NotCbk7ihIfpokipZTmDFVi1R9s1wE3ykm_O4djLbzMvl9b99idZY" width="27" height="27" style="margin-right:0px"></a></td></tr></tbody></table></div></div></div></span></div></div></div></div></div></div>`;
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

interface ComposeEmailProps {
  isOpen: boolean;
  onClose: () => void;
  initialTo?: string;
  initialCc?: string;
  initialBcc?: string;
  initialSubject?: string;
  initialBody?: string;
  replyToEmail?: any; // For reply/forward functionality
  onDraftSaved?: () => void; // Callback when draft is saved
}

export function ComposeEmail({
  isOpen,
  onClose,
  initialTo = "",
  initialCc = "",
  initialBcc = "",
  initialSubject = "",
  initialBody = "",
  replyToEmail,
  onDraftSaved,
}: ComposeEmailProps) {
  const { toast } = useToast();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [to, setTo] = useState("");
  const [toEmails, setToEmails] = useState<string[]>(
    initialTo ? initialTo.split(",").map((email) => email.trim()) : []
  );
  const [cc, setCc] = useState("");
  const [ccEmails, setCcEmails] = useState<string[]>(
    initialCc ? initialCc.split(",").map((email) => email.trim()) : []
  );
  const [bcc, setBcc] = useState("");
  const [bccEmails, setBccEmails] = useState<string[]>(
    initialBcc ? initialBcc.split(",").map((email) => email.trim()) : []
  );
  // Remove "(no subject)" from the initial subject
  const [subject, setSubject] = useState(
    initialSubject ? initialSubject.replace(/\(no subject\)/gi, "").trim() : ""
  );
  const [body, setBody] = useState(initialBody);
  const [showCc, setShowCc] = useState(!!initialCc);
  const [showBcc, setShowBcc] = useState(!!initialBcc);
  const [isSending, setIsSending] = useState(false);

  // Draft management
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "saved" | "saving" | "error" | null
  >(null);
  const [isOpeningDraft, setIsOpeningDraft] = useState(false);
  const [hasOpenedDraft, setHasOpenedDraft] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loadedAttachments, setLoadedAttachments] = useState<any[] | null>(
    null
  );

  // Ref to track if we've already set the server-processed HTML
  const hasProcessedServerHTML = useRef(false);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLineHeightMenu, setShowLineHeightMenu] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState("Normal");
  const [currentFontFamily, setCurrentFontFamily] = useState("Sans Serif");
  const [currentLineHeight, setCurrentLineHeight] = useState("Normal");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const draftTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Gmail-like execCommand functions
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
    handleInput();
  };

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setBody(html);
      // Reset the hasOpenedDraft flag when user starts typing
      if (hasOpenedDraft) {
        setHasOpenedDraft(false);
        console.log("User started typing, enabling auto-save");
      }
    }
  };

  // Add resize functionality to images
  useEffect(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
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
        handleInput(); // Update body state
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
  }, []);

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text/html");
    if (paste) {
      // Sanitize but preserve all style attributes including line-height
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
      // Fallback to plain text
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    }
  };

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

  // Helper function to check if signature is already present
  const hasSignature = (content: string): boolean => {
    if (!content) return false;

    // Check for our specific signature indicators
    const signatureIndicators = [
      "gmail_signature",
      'data-smartmail="gmail_signature"',
      "Kind regards",
      "Bella Millan", // Our specific signature name
      "Outreach Manager", // Our specific signature title
      "imheretravels.com", // Our website
    ];

    // Check if any signature indicator is present
    const hasSignatureIndicator = signatureIndicators.some((indicator) =>
      content.toLowerCase().includes(indicator.toLowerCase())
    );

    // Also check if the content is exactly our signature (for edge cases)
    const isOnlySignature = content.trim() === EMAIL_SIGNATURE.trim();

    return hasSignatureIndicator || isOnlySignature;
  };

  // Set initial content with signature
  useEffect(() => {
    if (editorRef.current) {
      let content = "";

      // Check if we're opening an existing draft
      const isExistingDraft = initialBody && initialBody !== EMAIL_SIGNATURE;
      if (isExistingDraft) {
        setIsOpeningDraft(true);
        setHasOpenedDraft(true);
        // Set the draft ID if we're opening an existing draft
        if (replyToEmail?.isDraft && replyToEmail?.id) {
          setDraftId(replyToEmail.id);

          // Fetch full draft content with attachments if not present
          if (replyToEmail.id && !loadedAttachments) {
            // Use messageId if available, otherwise use id
            const messageIdToFetch = replyToEmail.messageId || replyToEmail.id;
            staffFetch(`/api/gmail/emails/${messageIdToFetch}`)
              .then((res) => res.json())
              .then((data) => {
                if (data.success && data.data) {
                  // Update replyToEmail with attachments
                  Object.assign(replyToEmail, {
                    attachments: data.data.attachments || [],
                  });
                  // Also store in state to trigger re-render
                  setLoadedAttachments(data.data.attachments || []);

                  // Use the server-processed HTML (with cid: already converted to data URLs)
                  if (data.data.htmlContent && editorRef.current) {
                    const serverProcessedHTML = data.data.htmlContent;
                    // Force contentEditable to re-process the content by setting to empty first
                    editorRef.current.innerHTML = "";
                    // Use setTimeout to ensure the DOM is updated before setting new content
                    setTimeout(() => {
                      if (editorRef.current) {
                        editorRef.current.innerHTML = serverProcessedHTML;
                        setBody(serverProcessedHTML);
                        hasProcessedServerHTML.current = true;
                      }
                    }, 0);
                  }
                }
              })
              .catch((err) =>
                console.error("Error fetching draft attachments:", err)
              );
          }
        }
        // Clear input fields when opening existing draft to avoid duplicates
        setTo("");
        setCc("");
        setBcc("");
        // Clear the flag after a longer delay to ensure all initial content is loaded
        setTimeout(() => {
          setIsOpeningDraft(false);
          console.log("Draft opening complete, auto-save enabled");
        }, 2000);
      }

      if (initialBody) {
        // Check if signature is already present
        if (hasSignature(initialBody)) {
          content = initialBody; // Use content as-is if signature exists
        } else {
          content = initialBody + EMAIL_SIGNATURE; // Add signature if not present
        }
      } else {
        content = EMAIL_SIGNATURE; // Add signature for new emails
      }

      // Preprocess HTML with DOMPurify to allow inline styles
      const cleanHTML = DOMPurify.sanitize(content, {
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

      // Replace cid: references in img tags
      // For compose/reply: if we have replyToEmail context with attachments, convert cid: to API URLs
      let sanitizedHTML = cleanHTML;

      // Use the loaded attachments state if available
      const attachmentsToUse = loadedAttachments || replyToEmail?.attachments;

      // If we've already processed server HTML, skip this entire sanitization
      if (hasProcessedServerHTML.current) {
        return;
      }

      // If HTML already has data URLs (from server processing), skip cid: replacement
      if (cleanHTML.includes("data:image") && !cleanHTML.includes("cid:")) {
        editorRef.current.innerHTML = "";
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.innerHTML = cleanHTML;
            setBody(cleanHTML);
          }
        }, 0);
        return;
      }

      // Wait a bit for attachments to load if they're being fetched
      if (
        replyToEmail?.isDraft &&
        !loadedAttachments &&
        !replyToEmail?.attachments
      ) {
        // Remove cid: references temporarily to prevent browser errors
        const tempHTML = cleanHTML.replace(
          /<img([^>]*)src="cid:[^"]+"/gi,
          "<div style='width:100%;min-height:200px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;'><div style='text-align:center;'><div style='width:40px;height:40px;margin:0 auto 12px;border:4px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;'></div><p style='color:#6b7280;font-size:14px;margin:0;'>Loading image...</p></div></div><style>@keyframes spin{to{transform:rotate(360deg);}}</style>"
        );
        editorRef.current.innerHTML = "";
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.innerHTML = tempHTML;
            setBody(tempHTML);
          }
        }, 0);
        return; // Exit early, will re-run when attachments are available
      }

      // First, handle cid: references in img src attributes
      sanitizedHTML = sanitizedHTML.replace(
        /<img([^>]*)src="cid:([^"]+)"([^>]*)>/gi,
        (match, beforeSrc, cidValue, afterSrc) => {
          // Placeholder shown until the image loads, or when it can't be found
          const placeholderSrc =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='12'%3EImage%3C/text%3E%3C/svg%3E";

          // For reply emails, try to find the attachment
          if (replyToEmail?.id && attachmentsToUse) {
            const cleanCid = cidValue.replace(/[<>]/g, "");

            const attachment = attachmentsToUse.find((att: any) => {
              return (
                att.contentId === cidValue ||
                att.contentId === `<${cidValue}>` ||
                att.contentId?.includes(cleanCid) ||
                att.contentId?.replace(/[<>]/g, "") === cleanCid
              );
            });

            if (attachment) {
              // The attachment API needs a staff token, which an <img src>
              // can't send. Mark the image; hydrateAttachmentImages swaps in a
              // data URL once the editor holds the HTML.
              const emailIdForAttachment =
                replyToEmail.messageId || replyToEmail.id;
              return match.replace(
                /src="cid:[^"]+"/gi,
                `src="${placeholderSrc}" data-gmail-attachment="${emailIdForAttachment}/${attachment.attachmentId}"`
              );
            }
          }

          return match.replace(/src="cid:[^"]+"/gi, `src="${placeholderSrc}"`);
        }
      );

      // Second, remove any remaining cid: references in other attributes
      sanitizedHTML = sanitizedHTML.replace(/cid:[^"'\s>]+/gi, "");

      // Force contentEditable to re-process by clearing first
      editorRef.current.innerHTML = "";
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = sanitizedHTML;
          setBody(sanitizedHTML);
          void hydrateAttachmentImages(editorRef.current);
        }
      }, 0);
    }
  }, [initialBody, replyToEmail, loadedAttachments]);

  // Replace each marked inline image with its data URL, then sync the body.
  const hydrateAttachmentImages = async (editor: HTMLDivElement) => {
    const images = Array.from(
      editor.querySelectorAll<HTMLImageElement>("img[data-gmail-attachment]")
    );
    if (images.length === 0) return;

    await Promise.all(
      images.map(async (img) => {
        const [messageId, attachmentId] = (
          img.dataset.gmailAttachment || ""
        ).split("/");
        try {
          img.src = await fetchAttachmentDataUrl(messageId, attachmentId);
        } catch (error) {
          console.warn("Could not load inline image", error);
        }
        img.removeAttribute("data-gmail-attachment");
      })
    );

    if (editorRef.current === editor) {
      setBody(editor.innerHTML);
    }
  };

  // Manual save draft function (for explicit saves)
  const saveDraftManually = async () => {
    // Only save if there are recipients and body content
    if (toEmails.length === 0 || !body.trim() || body === EMAIL_SIGNATURE) {
      return;
    }

    setIsDraftSaving(true);
    setDraftStatus("saving");

    try {
      const response = await staffFetch("/api/gmail/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: toEmails,
          cc: ccEmails,
          bcc: bccEmails,
          subject: subject || "",
          content: body,
          draftId: draftId,
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

    // Only save if there are recipients and body content
    if (toEmails.length === 0 || !body.trim() || body === EMAIL_SIGNATURE) {
      console.log("Auto-save skipped: No recipients or empty body");
      return;
    }

    console.log("Auto-save triggered for draft:", draftId);

    setIsDraftSaving(true);
    setDraftStatus("saving");

    try {
      const response = await staffFetch("/api/gmail/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: toEmails,
          cc: ccEmails,
          bcc: bccEmails,
          subject: subject || "",
          content: body,
          draftId: draftId,
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

  // Debounced auto-save
  const debouncedSaveDraft = () => {
    if (draftTimeoutRef.current) {
      clearTimeout(draftTimeoutRef.current);
    }

    draftTimeoutRef.current = setTimeout(() => {
      saveDraft();
    }, 2000); // 2 second delay
  };

  // Auto-save when recipients or body changes
  useEffect(() => {
    // Don't auto-save if we're opening an existing draft
    if (isOpeningDraft) {
      return;
    }

    debouncedSaveDraft();

    return () => {
      if (draftTimeoutRef.current) {
        clearTimeout(draftTimeoutRef.current);
      }
    };
  }, [toEmails, ccEmails, bccEmails, subject, body, isOpeningDraft]);

  // Note: We don't cleanup drafts on window close so users can continue working on them later

  // Handle clicks outside dropdowns to close them
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".relative")) {
        setShowFontMenu(false);
        setShowSizeMenu(false);
        setShowColorMenu(false);
        setShowAlignMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+S or Cmd+S to save draft
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        saveDraftManually();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toEmails, ccEmails, bccEmails, subject, body, draftId]);

  // Clean up draft
  const cleanupDraft = async () => {
    if (draftId) {
      try {
        await staffFetch(`/api/gmail/drafts?draftId=${draftId}`, {
          method: "DELETE",
        });
        console.log("Draft cleaned up:", draftId);
      } catch (error) {
        console.error("Error cleaning up draft:", error);
      }
    }
  };

  // Handle send email
  const handleSend = async () => {
    if (toEmails.length === 0 || !subject.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in the recipient and subject fields.",
        variant: "destructive",
      });
      return;
    }

    // Check if body has meaningful content (not just signature)
    const bodyWithoutSignature = body.replace(EMAIL_SIGNATURE, "").trim();
    if (!bodyWithoutSignature) {
      toast({
        title: "Empty Email Body",
        description: "Please add some content to your email body.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      console.log("Sending email:", {
        to: toEmails,
        cc: ccEmails,
        bcc: bccEmails,
        subject,
        bodyLength: body?.length || 0,
        bodyPreview: body?.substring(0, 200) + "...",
        body: body,
      });

      // Convert attachments to base64
      const attachmentData = await Promise.all(
        attachments.map(async (file) => {
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

      const response = await staffFetch("/api/gmail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: toEmails.join(", "),
          cc: ccEmails.length > 0 ? ccEmails.join(", ") : undefined,
          bcc: bccEmails.length > 0 ? bccEmails.join(", ") : undefined,
          subject: subject.trim(),
          body: body,
          attachments: attachmentData,
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log("Email sent successfully:", result.data);

        // Clean up draft after successful send
        await cleanupDraft();

        // Close compose window after sending
        onClose();

        // Reset form
        setTo("");
        setToEmails([]);
        setCc("");
        setCcEmails([]);
        setBcc("");
        setBccEmails([]);
        setSubject("");
        setBody(EMAIL_SIGNATURE);
        setAttachments([]);
        setShowCc(false);
        setShowBcc(false);

        // Show success toast
        toast({
          title: "Email Sent Successfully",
          description: "Your email has been sent successfully.",
        });
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
      setIsSending(false);
    }
  };

  // Handle file attachment
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className={`fixed z-50 bg-white border border-gray-300 shadow-2xl rounded-t-lg transition-all duration-500 ease-out ${
          isMaximized
            ? "top-12 left-20 right-20 bottom-12"
            : isMinimized
            ? "bottom-0 right-12 w-80 h-12"
            : "bottom-0 right-12 w-[620px] h-[700px]"
        } ${isMinimized ? "overflow-hidden" : ""}`}
        style={{
          transitionProperty:
            "top, left, right, bottom, width, height, opacity",
          transitionDuration: "500ms",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b rounded-t-lg border-gray-200">
          <div className="flex items-center gap-2 ">
            <span className="text-sm font-medium text-[#041e49]">
              {isMinimized
                ? `New Message - ${
                    toEmails.length > 0 ? toEmails.join(", ") : "Compose"
                  }`
                : "New Message"}
            </span>

            {/* Draft Status Indicator */}
            {draftStatus && (
              <div className="flex items-center gap-1 text-xs">
                {draftStatus === "saving" && (
                  <>
                    <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-blue-600">Saving draft...</span>
                  </>
                )}
                {draftStatus === "saved" && (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-green-600">Draft saved</span>
                  </>
                )}
                {draftStatus === "error" && (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-red-600">Save failed</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Minimize */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-8 w-8 p-0 hover:bg-gray-200"
            >
              <Minus className="w-4 h-4" />
            </Button>

            {/* Maximize/Restore */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMaximized(!isMaximized)}
              className="h-8 w-8 p-0 hover:bg-gray-200"
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>

            {/* Close */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content - Hidden when minimized */}
        <div
          className={`flex flex-col transition-all duration-500 ease-out ${
            isMinimized ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          style={{
            height: isMinimized ? "0px" : "calc(100%)",
            overflow: isMinimized ? "hidden" : "visible",
            transitionProperty: "height, opacity",
            transitionDuration: "500ms",
            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Recipients */}
          <div className="px-4 py-2 space-y-1 flex-shrink-0">
            {/* To field */}
            <div className="flex items-center gap-2 border-b border-gray-200 pb-1 group">
              <label className="text-sm text-gray-600 w-4 flex-shrink-0 hidden group-focus-within:block">
                To
              </label>
              <EmailAutocomplete
                value={to}
                onChange={(value) => {
                  setTo(value);
                  // Reset the hasOpenedDraft flag when user starts typing
                  if (hasOpenedDraft) {
                    setHasOpenedDraft(false);
                    console.log(
                      "User started typing in To field, enabling auto-save"
                    );
                  }
                }}
                selectedEmails={toEmails}
                onSelectedEmailsChange={(emails) => {
                  setToEmails(emails);
                  // Reset the hasOpenedDraft flag when user changes recipients
                  if (hasOpenedDraft) {
                    setHasOpenedDraft(false);
                    console.log("User changed recipients, enabling auto-save");
                  }
                }}
                placeholder="Recipients"
                className="flex-1"
                style={{ outline: "none", boxShadow: "none" }}
              />
              <div className="flex items-center gap-2">
                {!showCc && (
                  <button
                    onClick={() => setShowCc(true)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    onClick={() => setShowBcc(true)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>

            {/* CC field */}
            {showCc && (
              <div className="flex items-center gap-2 border-b border-gray-200 pb-1 group">
                <label className="text-xs text-gray-600 w-8 flex-shrink-0 hidden group-focus-within:block">
                  Cc
                </label>
                <EmailAutocomplete
                  value={cc}
                  onChange={setCc}
                  selectedEmails={ccEmails}
                  onSelectedEmailsChange={setCcEmails}
                  placeholder="Carbon copy"
                  className="flex-1"
                  style={{ outline: "none", boxShadow: "none" }}
                />
              </div>
            )}

            {/* BCC field */}
            {showBcc && (
              <div className="flex items-center gap-2 border-b border-gray-200 pb-1 group">
                <label className="text-xs text-gray-600 w-8 flex-shrink-0 hidden group-focus-within:block">
                  Bcc
                </label>
                <EmailAutocomplete
                  value={bcc}
                  onChange={setBcc}
                  selectedEmails={bccEmails}
                  onSelectedEmailsChange={setBccEmails}
                  placeholder="Blind carbon copy"
                  className="flex-1"
                  style={{ outline: "none", boxShadow: "none" }}
                />
              </div>
            )}

            {/* Subject */}
            <div className="flex items-center gap-2 border-b py-2 border-gray-200 pb-1">
              <Input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  // Reset the hasOpenedDraft flag when user starts typing
                  if (hasOpenedDraft) {
                    setHasOpenedDraft(false);
                    console.log(
                      "User started typing in Subject field, enabling auto-save"
                    );
                  }
                }}
                placeholder="Subject"
                className="flex-1 border-none shadow-none focus:ring-0 px-0 font-medium bg-transparent outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 h-6 text-sm"
                style={{ outline: "none", boxShadow: "none" }}
              />
            </div>
          </div>

          {/* Rich Text Editor Container */}
          <div
            className="flex-1 mb-2 overflow-y-auto bg-white flex flex-col rounded-lg"
            style={{ height: "180px" }}
          >
            {/* Message Body */}
            <div className="flex-1 min-h-0">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onPaste={handlePaste}
                className="h-full w-full p-4 text-sm leading-relaxed focus:outline-none gmail-email-content"
                style={{
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  fontSize: "12px",
                  minHeight: "150px",
                }}
              />
            </div>
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 py-2 flex-shrink-0">
              <div className="text-xs text-gray-600 mb-2">Attachments:</div>
              <div className="space-y-1">
                {attachments.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Paperclip className="w-3 h-3 text-gray-500" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-gray-500">
                      {formatFileSize(file.size)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(index)}
                      className="h-6 w-6 p-0 hover:bg-red-50"
                    >
                      <X className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enhanced Formatting Toolbar */}
          <div className="mb-2 flex items-center gap-[1px] p-1 bg-slate-100 flex-wrap rounded-3xl">
            {/* Undo/Redo */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand("undo")}
            >
              <MdUndo className="w-5 h-5 font-bold" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand("redo")}
            >
              <MdRedo className="w-5 h-5 font-bold" />
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
                <span className="text-xs">{currentFontFamily}</span>
                <MdExpandMore className="w-4 h-4 font-bold" />
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
                <MdTitle className="w-5 h-5 font-bold" />
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
                onClick={() => setShowLineHeightMenu(!showLineHeightMenu)}
                title="Line Height"
              >
                <MdFormatLineSpacing className="w-5 h-5 font-bold" />
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
              <MdFormatBold className="w-5 h-5 font-bold" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand("italic")}
            >
              <MdFormatItalic className="w-5 h-5 font-bold" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand("underline")}
            >
              <MdFormatUnderlined className="w-5 h-5 font-bold" />
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
                <MdPalette className="w-5 h-5 font-bold" />
                <MdExpandMore className="w-4 h-4 font-bold" />
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
                <MdFormatAlignLeft className="w-5 h-5 font-bold" />
                <MdExpandMore className="w-4 h-4 font-bold" />
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
                    <MdFormatAlignLeft className="w-5 h-5 font-bold" />
                    Left
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm flex items-center gap-2"
                    onClick={() => {
                      execCommand("justifyCenter");
                      setShowAlignMenu(false);
                    }}
                  >
                    <MdFormatAlignCenter className="w-5 h-5 font-bold" />
                    Center
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm flex items-center gap-2"
                    onClick={() => {
                      execCommand("justifyRight");
                      setShowAlignMenu(false);
                    }}
                  >
                    <MdFormatAlignRight className="w-5 h-5 font-bold" />
                    Right
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm flex items-center gap-2"
                    onClick={() => {
                      execCommand("justifyFull");
                      setShowAlignMenu(false);
                    }}
                  >
                    <MdFormatAlignJustify className="w-5 h-5 font-bold" />
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
              <MdFormatListBulleted className="w-5 h-5 font-bold" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => execCommand("insertOrderedList")}
            >
              <MdFormatListNumbered className="w-5 h-5 font-bold" />
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
                <MdMoreVert className="w-5 h-5 font-bold" />
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
                    <MdFormatIndentIncrease className="w-5 h-5 font-bold" />
                  </button>
                  <button
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100"
                    onClick={() => {
                      execCommand("outdent");
                    }}
                    title="Indent Less"
                  >
                    <MdFormatIndentDecrease className="w-5 h-5 font-bold" />
                  </button>
                  <button
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100"
                    onClick={() => {
                      execCommand("strikeThrough");
                    }}
                    title="Strikethrough"
                  >
                    <MdStrikethroughS className="w-5 h-5 font-bold" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mb-16 px-4 py-1 border-t border-gray-200 bg-gray-50 flex-shrink-0 mt-auto">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSend}
                disabled={isSending || toEmails.length === 0 || !subject.trim()}
                className="bg-[#0b57d0] rounded-3xl  hover:bg-blue-700 text-white px-6"
              >
                {isSending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </div>
                ) : (
                  <div className="flex items-centergap-2">Send</div>
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="text-gray-600"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="w-4 h-4 mr-1" />
                Attach
              </Button>
            </div>

            <Button variant="ghost" size="sm" className="text-gray-600">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </>
  );
}
