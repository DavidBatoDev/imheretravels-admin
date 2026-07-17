import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Safe, full-featured markdown renderer for Incidents & Policies content.
 *
 * Unlike the reviews `Markdown` renderer (which restricts to a tiny inline set
 * and drops tables/headings), this allows the elements technical reference
 * content needs — headings, tables, code blocks, blockquotes, hr — while
 * remaining XSS-safe: react-markdown does NOT render raw HTML unless you add
 * rehype-raw, which we deliberately don't. Server-component compatible.
 */

const ALLOWED = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "strong",
  "em",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
];

export default function RichMarkdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={[
        "text-sm leading-relaxed text-foreground",
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:first:mt-0",
        "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-border",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-crimson-red",
        "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1",
        "[&_p]:my-2",
        "[&_a]:text-crimson-red [&_a]:underline [&_a]:break-words",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:mt-1 [&_li]:marker:text-muted-foreground",
        "[&_hr]:my-6 [&_hr]:border-border",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-crimson-red/40 [&_blockquote]:bg-muted/40 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:rounded-r",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono",
        "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-border",
        // Tables scroll horizontally on their own so the page never does.
        "[&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs",
        "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:align-top",
        "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
