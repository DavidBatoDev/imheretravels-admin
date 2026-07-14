/** Static 5-point star display (crimson filled), used across review UIs. */
export default function Stars({
  count,
  size = "md",
}: {
  count: number;
  /** "md" (default, size-4) or "sm" (size-3.5) for compact panels. */
  size?: "sm" | "md";
}) {
  const rounded = Math.max(0, Math.min(5, Math.round(count)));
  const starSize = size === "sm" ? "size-3.5" : "size-4";
  return (
    <div
      className="flex gap-0.5 text-crimson-red"
      aria-label={`${rounded} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={`${starSize} ${i < rounded ? "fill-current" : "fill-light-grey"}`}
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </div>
  );
}
