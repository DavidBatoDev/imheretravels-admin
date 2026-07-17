"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Link2,
  Table as TableIcon,
  Undo2,
  Redo2,
} from "lucide-react";

/**
 * WYSIWYG rich-text editor (Tiptap) that stores HTML. Used for the incident
 * Summary / Actions-needed fields and the policy body — what you type is what
 * you get, no separate preview tab. Supports bold/italic/underline, H2/H3,
 * lists, blockquote, links (via an in-app popover), and tables.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = "10rem",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("https://");
  const linkWrapRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Disable StarterKit's bundled link/underline (if present in this
      // version) so our explicitly-configured ones don't duplicate.
      StarterKit.configure({ link: false, underline: false } as any),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder || "Write here…" }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: [
          "outline-none px-4 py-3 text-sm leading-relaxed text-foreground",
          "[&_p]:my-2 [&_p:first-child]:mt-0",
          "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-1",
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-crimson-red",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_li]:mt-1",
          "[&_a]:text-crimson-red [&_a]:underline",
          "[&_strong]:font-semibold",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-crimson-red/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:my-2",
          // Tables
          "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:table-fixed",
          "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:align-top",
          "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
          "[&_.selectedCell]:bg-crimson-red/10",
          // Placeholder
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.is-editor-empty:first-child::before]:float-left",
          "[&_.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.is-editor-empty:first-child::before]:h-0",
        ].join(" "),
        style: `min-height:${minHeight}`,
      },
    },
  });

  useEffect(() => {
    if (!linkOpen) return;
    const t = setTimeout(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    }, 0);
    const onOutside = (e: MouseEvent) => {
      if (!linkWrapRef.current?.contains(e.target as Node)) setLinkOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLinkOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [linkOpen]);

  if (!editor) {
    return (
      <div
        className="rounded-md border border-border bg-muted/30"
        style={{ minHeight }}
      />
    );
  }

  const Btn = ({
    active,
    onClick,
    label,
    children,
  }: {
    active?: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-sm transition-colors ${
        active ? "bg-muted text-crimson-red" : "text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );

  const TextBtn = ({
    onClick,
    children,
  }: {
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded-sm px-2 h-8 text-xs font-medium text-foreground hover:bg-muted"
    >
      {children}
    </button>
  );

  const openLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    setLinkValue(prev || "https://");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = linkValue.trim();
    if (!url || url === "https://") {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: url,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  const inTable = editor.isActive("table");

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
        <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold">
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic">
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} label="Underline">
          <UnderlineIcon className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Heading 2">
          <Heading2 className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="Heading 3">
          <Heading3 className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bulleted list">
          <List className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Quote">
          <Quote className="h-4 w-4" />
        </Btn>

        {/* Link — custom in-app popover (not the native browser prompt) */}
        <div className="relative" ref={linkWrapRef}>
          <Btn active={editor.isActive("link") || linkOpen} onClick={openLink} label="Link">
            <Link2 className="h-4 w-4" />
          </Btn>
          {linkOpen && (
            <div
              role="dialog"
              aria-label="Add link"
              className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-3rem)] rounded-md border border-border bg-popover p-3 shadow-md"
            >
              <label htmlFor="rte-link-url" className="mb-1 block text-xs font-medium text-muted-foreground">
                Link URL
              </label>
              <input
                id="rte-link-url"
                ref={linkInputRef}
                type="text"
                inputMode="url"
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                }}
                placeholder="https://"
                className="w-full rounded-sm border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-crimson-red"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setLinkOpen(false)} className="rounded-sm px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                  Cancel
                </button>
                {editor.isActive("link") && (
                  <button type="button" onClick={removeLink} className="rounded-sm px-3 py-1.5 text-sm text-crimson-red hover:bg-muted">
                    Remove
                  </button>
                )}
                <button type="button" onClick={applyLink} className="rounded-sm bg-crimson-red px-3 py-1.5 text-sm font-medium text-white hover:bg-royal-purple">
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <Btn
          active={inTable}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          label="Insert table"
        >
          <TableIcon className="h-4 w-4" />
        </Btn>

        {/* Table controls appear when the cursor is inside a table. */}
        {inTable && (
          <>
            <span className="mx-1 h-5 w-px bg-border" />
            <TextBtn onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</TextBtn>
            <TextBtn onClick={() => editor.chain().focus().deleteRow().run()}>− Row</TextBtn>
            <TextBtn onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Col</TextBtn>
            <TextBtn onClick={() => editor.chain().focus().deleteColumn().run()}>− Col</TextBtn>
            <TextBtn onClick={() => editor.chain().focus().deleteTable().run()}>✕ Table</TextBtn>
          </>
        )}

        <span className="mx-1 h-5 w-px bg-border" />
        <Btn onClick={() => editor.chain().focus().undo().run()} label="Undo">
          <Undo2 className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} label="Redo">
          <Redo2 className="h-4 w-4" />
        </Btn>
      </div>
      <div className="overflow-x-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
