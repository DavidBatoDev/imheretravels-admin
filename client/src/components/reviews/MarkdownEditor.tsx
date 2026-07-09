"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, List, ListOrdered, Link2, Smile } from "lucide-react";

/**
 * Live WYSIWYG review composer, ported from the public site's
 * `www/app/components/global/MarkdownEditor.tsx`: a contentEditable surface
 * that shows bold, italic, and list formatting as the admin types
 * (Slack/ClickUp-style), with no separate write/preview toggle. Formatting is
 * applied via document.execCommand and the DOM is serialized to a Markdown
 * string on every change, so the stored value stays in sync with what the
 * editor shows.
 */

const URL_REGEX = /^(https?:\/\/|www\.)\S+$/i;

const EMOJIS = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🙂", "😉", "😍", "🥰", "🤩", "😎",
  "🙌", "👍", "👏", "🤝", "❤️", "🔥", "✨", "🎉", "🥳", "😴", "🤔", "😊",
  "✈️", "🧳", "🗺️", "🏝️", "🏖️", "🌴", "🌊", "☀️", "🌅", "⛰️", "🚤", "📸",
  "🍹", "🍽️", "🐠", "🐬", "🦋", "🌺",
];

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ZWSP = String.fromCharCode(0x200b);

function serializeInline(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").split(ZWSP).join("");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(serializeInline).join("");
  switch (el.tagName) {
    case "B":
    case "STRONG":
      return inner.trim() ? `**${inner}**` : inner;
    case "I":
    case "EM":
      return inner.trim() ? `_${inner}_` : inner;
    case "A": {
      const href = el.getAttribute("href") || "";
      return inner.trim() ? `[${inner}](${href})` : inner;
    }
    case "BR":
      return "\n";
    default:
      return inner;
  }
}

function serializeBlock(el: HTMLElement): string {
  if (el.tagName === "UL" || el.tagName === "OL") {
    const items = Array.from(el.children).filter((c) => c.tagName === "LI");
    return items
      .map((li, i) => {
        const prefix = el.tagName === "OL" ? `${i + 1}. ` : "- ";
        const text = Array.from(li.childNodes).map(serializeInline).join("").trim();
        return prefix + text;
      })
      .join("\n");
  }
  return Array.from(el.childNodes).map(serializeInline).join("");
}

function serializeRoot(root: HTMLElement): string {
  const blocks: string[] = [];
  let loose: string[] = [];

  const flushLoose = () => {
    if (loose.length) {
      blocks.push(loose.join(""));
      loose = [];
    }
  };

  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (["P", "DIV", "UL", "OL"].includes(el.tagName)) {
        flushLoose();
        blocks.push(serializeBlock(el));
      } else {
        loose.push(serializeInline(node));
      }
    } else {
      loose.push(serializeInline(node));
    }
  });
  flushLoose();

  return blocks.join("\n\n").trim();
}

type ActiveFormats = { bold: boolean; italic: boolean; ul: boolean; ol: boolean };

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  maxLength = 5000,
  id,
  highlighted = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  /** Tints the border crimson-red to flag this as the primary/required field. */
  highlighted?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const emojiWrapperRef = useRef<HTMLDivElement | null>(null);
  const linkWrapperRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const hasSelectionRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("https://");
  const [active, setActive] = useState<ActiveFormats>({
    bold: false,
    italic: false,
    ul: false,
    ol: false,
  });

  useEffect(() => {
    if (!emojiOpen) return;
    function onOutside(e: MouseEvent) {
      if (!emojiWrapperRef.current?.contains(e.target as Node)) setEmojiOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setEmojiOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [emojiOpen]);

  useEffect(() => {
    if (!linkOpen) return;
    linkInputRef.current?.focus();
    linkInputRef.current?.select();
    function onOutside(e: MouseEvent) {
      if (!linkWrapperRef.current?.contains(e.target as Node)) setLinkOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setLinkOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [linkOpen]);

  useEffect(() => {
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      // execCommand is best-effort; unsupported browsers just fall back to native Enter behavior.
    }
  }, []);

  useEffect(() => {
    function updateActive() {
      const el = ref.current;
      if (!el || document.activeElement !== el) return;
      try {
        setActive({
          bold: document.queryCommandState("bold"),
          italic: document.queryCommandState("italic"),
          ul: document.queryCommandState("insertUnorderedList"),
          ol: document.queryCommandState("insertOrderedList"),
        });
      } catch {
        // queryCommandState can throw outside an editable selection context.
      }
    }
    document.addEventListener("selectionchange", updateActive);
    return () => document.removeEventListener("selectionchange", updateActive);
  }, []);

  function handleInput(opts?: { skipEmptyWipe?: boolean }) {
    const el = ref.current;
    if (!el) return;
    // Zero-width markers aren't whitespace to .trim(), so check visible text only.
    const empty = !(el.textContent ?? "").split(ZWSP).join("").trim();
    if (empty && !opts?.skipEmptyWipe) {
      // Fully clearing visible text can still leave an empty <b>/<i> marker
      // behind, which would silently carry its formatting into the next
      // keystroke. Wipe the DOM outright once nothing real remains — except
      // right after we ourselves planted a fresh sticky marker on purpose,
      // which also looks "empty" until the traveler types into it.
      if (el.innerHTML !== "") el.innerHTML = "";
      // Chrome also keeps its own internal "pending typing style" alive
      // across a delete-to-empty, independent of the DOM — cancel it too,
      // or the very next keystroke resurrects the old formatting.
      try {
        if (document.queryCommandState("bold")) document.execCommand("bold");
        if (document.queryCommandState("italic")) document.execCommand("italic");
      } catch {
        // best-effort
      }
    }
    setIsEmpty(empty);
    onChange(serializeRoot(el).slice(0, maxLength));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const el = ref.current;
    const sel = window.getSelection();
    const hasSelection = !!sel && !sel.isCollapsed && !!el && el.contains(sel.anchorNode);
    const trimmed = text.trim();
    if (hasSelection && URL_REGEX.test(trimmed)) {
      const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
      document.execCommand("createLink", false, href);
    } else {
      document.execCommand("insertText", false, text);
    }
    handleInput();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      toggleInline("b");
    } else if (key === "i") {
      e.preventDefault();
      toggleInline("i");
    }
  }

  // Re-focusing an already-focused contentEditable can collapse the caret
  // (notably in Firefox), and a never-clicked or just-emptied editor has no
  // caret at all. Make sure there's always a valid, in-bounds selection
  // before handing off to execCommand.
  function ensureCaret(el: HTMLDivElement): Selection | null {
    if (document.activeElement !== el) el.focus();
    const sel = window.getSelection();
    if (!sel) return null;
    if (sel.rangeCount === 0 || !el.contains(sel.getRangeAt(0).startContainer)) {
      const fresh = document.createRange();
      fresh.selectNodeContents(el);
      fresh.collapse(false);
      sel.removeAllRanges();
      sel.addRange(fresh);
    }
    return sel;
  }

  function format(command: "insertUnorderedList" | "insertOrderedList") {
    const el = ref.current;
    if (!el) return;
    ensureCaret(el);

    // execCommand's list commands don't just no-op on a genuinely empty
    // editor (no <p>/<br> at all) — they can delete the (empty) block
    // outright instead of converting it. Build the list ourselves in that
    // case rather than relying on the native behavior.
    const empty = !(el.textContent ?? "").split(ZWSP).join("").trim();
    if (empty) {
      const tag = command === "insertUnorderedList" ? "ul" : "ol";
      el.innerHTML = `<${tag}><li><br></li></${tag}>`;
      const li = el.querySelector("li");
      const sel = window.getSelection();
      if (li && sel) {
        const range = document.createRange();
        range.setStart(li, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      handleInput({ skipEmptyWipe: true });
      return;
    }

    document.execCommand(command);
    handleInput();
  }

  // execCommand's "sticky" typing state for bold/italic on a collapsed
  // selection (toggle on, type, toggle off) is unreliable across browsers.
  // For a collapsed caret we manage it ourselves: drop an invisible marker
  // inside (or move the caret past) a <b>/<i> element so native typing that
  // follows lands where it should.
  function toggleInline(tag: "b" | "i") {
    const el = ref.current;
    if (!el) return;
    const sel = ensureCaret(el);
    if (!sel) return;
    const range = sel.getRangeAt(0);

    if (!range.collapsed) {
      document.execCommand(tag === "b" ? "bold" : "italic");
      handleInput();
      return;
    }

    let node: Node | null = range.startContainer;
    let existing: HTMLElement | null = null;
    while (node && node !== el) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === tag) {
        existing = node as HTMLElement;
        break;
      }
      node = node.parentNode;
    }

    if (existing) {
      // Just moving the caret to the boundary right after the element isn't
      // enough — browsers tend to keep extending the adjacent inline format
      // for a caret that merely abuts it. Give typing an actual plain text
      // node to land in instead.
      const zwsp = document.createTextNode(ZWSP);
      existing.parentNode?.insertBefore(zwsp, existing.nextSibling);
      const after = document.createRange();
      after.setStart(zwsp, 1);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      handleInput();
    } else {
      const wrap = document.createElement(tag);
      const zwsp = document.createTextNode(ZWSP);
      wrap.appendChild(zwsp);
      range.insertNode(wrap);
      const inner = document.createRange();
      inner.setStart(zwsp, 1);
      inner.collapse(true);
      sel.removeAllRanges();
      sel.addRange(inner);
      handleInput({ skipEmptyWipe: true });
    }
  }

  function insertEmoji(emoji: string) {
    ref.current?.focus();
    document.execCommand("insertText", false, emoji);
    handleInput();
    setEmojiOpen(false);
  }

  // Opening a custom popover moves focus off the editor, which would lose
  // the admin's text selection — capture it up front (the toolbar button's
  // onMouseDown already prevented that focus loss up to this click) so we
  // can restore it once they confirm a URL.
  function openLinkPopover() {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    hasSelectionRef.current = !!sel && !sel.isCollapsed && el.contains(sel.anchorNode);
    savedRangeRef.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    setLinkValue("https://");
    setLinkOpen(true);
  }

  function confirmLink() {
    const el = ref.current;
    const url = linkValue.trim();
    if (!el || !url) {
      setLinkOpen(false);
      return;
    }
    el.focus();
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
    if (hasSelectionRef.current) {
      document.execCommand("createLink", false, url);
    } else {
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    }
    handleInput();
    setLinkOpen(false);
  }

  const btn = (isActive: boolean) =>
    `flex size-8 items-center justify-center rounded-sm transition-colors ${
      isActive ? "bg-light-grey text-crimson-red" : "text-dark-gray hover:bg-light-grey"
    }`;

  const stopFocusLoss = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className={`rounded-md border bg-white transition-colors focus-within:border-crimson-red ${
        highlighted ? "border-crimson-red/50" : "border-light-grey"
      }`}
    >
      <div className="flex items-center gap-1 border-b border-light-grey px-2 py-1.5">
        <button
          type="button"
          className={btn(active.bold)}
          aria-label="Bold"
          aria-pressed={active.bold}
          onMouseDown={stopFocusLoss}
          onClick={() => toggleInline("b")}
        >
          <Bold className="size-4" />
        </button>
        <button
          type="button"
          className={btn(active.italic)}
          aria-label="Italic"
          aria-pressed={active.italic}
          onMouseDown={stopFocusLoss}
          onClick={() => toggleInline("i")}
        >
          <Italic className="size-4" />
        </button>
        <button
          type="button"
          className={btn(active.ul)}
          aria-label="Bulleted list"
          aria-pressed={active.ul}
          onMouseDown={stopFocusLoss}
          onClick={() => format("insertUnorderedList")}
        >
          <List className="size-4" />
        </button>
        <button
          type="button"
          className={btn(active.ol)}
          aria-label="Numbered list"
          aria-pressed={active.ol}
          onMouseDown={stopFocusLoss}
          onClick={() => format("insertOrderedList")}
        >
          <ListOrdered className="size-4" />
        </button>
        <div className="relative" ref={linkWrapperRef}>
          <button
            type="button"
            className={btn(linkOpen)}
            aria-label="Link"
            aria-pressed={linkOpen}
            onMouseDown={stopFocusLoss}
            onClick={openLinkPopover}
          >
            <Link2 className="size-4" />
          </button>
          {linkOpen && (
            // A plain div, not a <form> — this popover renders inside the
            // review composer's own outer <form>, and nested forms are
            // invalid HTML and unreliable for submit/Enter handling.
            <div
              role="dialog"
              aria-label="Add link"
              className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-light-grey bg-white p-3 shadow-medium"
            >
              <label htmlFor="markdown-editor-link-url" className="mb-1 block font-body text-b4-desktop text-dark-gray">
                Link URL
              </label>
              <input
                id="markdown-editor-link-url"
                ref={linkInputRef}
                type="text"
                inputMode="url"
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmLink();
                  }
                }}
                placeholder="https://"
                className="w-full rounded-sm border border-light-grey px-2.5 py-1.5 font-body text-b4-desktop text-midnight outline-none focus:border-crimson-red"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onMouseDown={stopFocusLoss}
                  onClick={() => setLinkOpen(false)}
                  className="rounded-sm px-3 py-1.5 font-body text-b4-desktop text-dark-gray hover:bg-light-grey"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onMouseDown={stopFocusLoss}
                  onClick={confirmLink}
                  className="rounded-sm bg-crimson-red px-3 py-1.5 font-body text-b4-desktop font-medium text-white hover:bg-light-red"
                >
                  Add link
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="relative" ref={emojiWrapperRef}>
          <button
            type="button"
            className={btn(emojiOpen)}
            aria-label="Insert emoji"
            aria-pressed={emojiOpen}
            onMouseDown={stopFocusLoss}
            onClick={() => setEmojiOpen((o) => !o)}
          >
            <Smile className="size-4" />
          </button>
          {emojiOpen && (
            <div
              role="dialog"
              aria-label="Emoji picker"
              className="absolute left-0 top-full z-10 mt-1 grid w-64 grid-cols-8 gap-0.5 rounded-md border border-light-grey bg-white p-2 shadow-medium"
            >
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex size-7 items-center justify-center rounded-sm text-base hover:bg-light-grey"
                  onMouseDown={stopFocusLoss}
                  onClick={() => insertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        {isEmpty && (
          <span className="pointer-events-none absolute left-4 top-3 font-body text-b2-desktop text-grey">
            {placeholder}
          </span>
        )}
        <div
          id={id}
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline="true"
          suppressContentEditableWarning
          onInput={() => handleInput()}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className={[
            "min-h-36 rounded-b-md bg-white px-4 py-3 font-body text-b2-desktop text-midnight outline-none",
            "[&_p]:my-0 [&_p+p]:mt-3",
            "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
            "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_li]:mt-1",
            "[&_a]:text-crimson-red [&_a]:underline",
            "[&_strong]:font-bold [&_b]:font-bold",
            "[&_em]:italic [&_i]:italic",
          ].join(" ")}
        />
      </div>

      <div className="flex justify-end px-3 pb-2 pt-1">
        <span className="font-body text-b4-desktop text-grey">
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
