import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import type { PublishIssue } from "@/lib/tour-publish-validation";

interface PublishBlockedModalProps {
  open: boolean;
  issues: PublishIssue[];
  /** True while the blocked publish is still pending a decision. */
  isSubmitting?: boolean;
  /** Dismiss and return to the editor. */
  onClose: () => void;
  /** Jump to a field: opens the Settings panel when needed and highlights it. */
  onFix: (field: string) => void;
  /** Only offered when every issue is a warning. */
  onPublishAnyway: () => void;
}

const KIND_LABEL: Record<PublishIssue["kind"], string> = {
  copy: "Leftover copy",
  duplicate: "Already in use",
  similar: "Looks similar",
};

/**
 * Blocks a publish that would put duplicate-artifact values ("(Copy)", "-COPY")
 * or non-unique identity fields on a live tour page. Each row links straight to
 * the offending field in the editor.
 */
export default function PublishBlockedModal({
  open,
  issues,
  isSubmitting = false,
  onClose,
  onFix,
  onPublishAnyway,
}: PublishBlockedModalProps) {
  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  const canPublishAnyway = blocking.length === 0 && warnings.length > 0;

  const renderIssue = (issue: PublishIssue, index: number) => {
    const isBlocking = issue.severity === "blocking";
    return (
      <li
        key={`${issue.field}-${issue.value}-${index}`}
        className={`rounded-lg border p-3 ${
          isBlocking
            ? "border-crimson-red/30 bg-crimson-red/5"
            : "border-vivid-orange/30 bg-vivid-orange/5"
        }`}
      >
        <div className="flex items-start gap-2.5">
          {isBlocking ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-crimson-red" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-vivid-orange" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-midnight">
                {issue.label}
              </span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isBlocking
                    ? "bg-crimson-red/10 text-crimson-red"
                    : "bg-vivid-orange/10 text-vivid-orange"
                }`}
              >
                {KIND_LABEL[issue.kind]}
              </span>
            </div>

            <p className="mt-1 break-all font-mono text-xs text-dark-gray">
              {issue.value || "—"}
            </p>

            <p className="mt-1.5 text-xs leading-relaxed text-dark-gray">
              {issue.message}
              {issue.conflictsWith && (
                <>
                  {" "}
                  Conflicts with{" "}
                  <span className="font-semibold text-midnight">
                    {issue.conflictsWith}
                  </span>
                  .
                </>
              )}
            </p>

            {issue.suggestion && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-dark-gray">
                <span className="shrink-0">Suggested:</span>
                <span className="min-w-0 truncate rounded bg-white px-1.5 py-0.5 font-mono text-midnight">
                  {issue.suggestion}
                </span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onFix(issue.field)}
            className="flex shrink-0 items-center gap-1 self-start rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-midnight transition-colors hover:border-crimson-red hover:text-crimson-red"
          >
            Fix
            <ArrowRight className="size-3" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-crimson-red" />
            <DialogTitle className="text-lg font-semibold">
              {blocking.length
                ? "This tour can't go live yet"
                : "Check these before publishing"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            {blocking.length
              ? "A published tour's name, code and URLs must be final and unique across all tours. Fix the items below, then publish again."
              : "Nothing is blocking the publish, but these values look close to another tour's. Confirm they're intentional."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] space-y-4 overflow-y-auto py-1 pr-0.5">
          {blocking.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-crimson-red">
                Must fix ({blocking.length})
              </p>
              <ul className="space-y-2">{blocking.map(renderIssue)}</ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-vivid-orange">
                Worth checking ({warnings.length})
              </p>
              <ul className="space-y-2">{warnings.map(renderIssue)}</ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Back to editing
          </Button>
          {canPublishAnyway && (
            <Button
              onClick={onPublishAnyway}
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? "Publishing…" : "Publish anyway"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
