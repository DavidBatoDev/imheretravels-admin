import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Safe markdown renderer for user- and admin-authored review bodies.
 *
 * react-markdown does NOT render raw HTML unless you add rehype-raw — we don't,
 * so embedded HTML is inert (no XSS). We also restrict to a small, on-brand set
 * of elements and force external links to open safely.
 *
 * Server-compatible (no client hooks) — safe to render from server components.
 */

const ALLOWED = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "h3",
  "h4",
];

export default function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={[
        "font-body text-b2-mobile md:text-b2-desktop text-midnight",
        "[&_p]:my-0 [&_p+p]:mt-3",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:mt-1",
        "[&_a]:text-crimson-red [&_a]:underline",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-light-grey [&_blockquote]:pl-4 [&_blockquote]:text-grey",
        "[&_strong]:font-bold",
        "[&_h3]:font-sans [&_h3]:text-h6-desktop [&_h3]:font-bold [&_h3]:mt-3",
        "[&_h4]:font-sans [&_h4]:font-bold [&_h4]:mt-3",
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
            <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
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
