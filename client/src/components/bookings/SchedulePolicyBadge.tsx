"use client";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getSchedulePolicy, type SchedulePolicy } from "@/lib/schedule-policy";

interface SchedulePolicyBadgeProps {
  /** Raw reservation date; the policy is derived from it. */
  reservationDate?: unknown;
  /** Pre-computed policy (takes precedence over reservationDate when provided). */
  policy?: SchedulePolicy | null;
  /** Extra classes applied to the clickable trigger (e.g. layout/margins). */
  className?: string;
}

/**
 * Clickable badge showing a booking's payment-scheduling policy. Clicking opens
 * a small popover explaining what the policy means — so staff understand, e.g.,
 * that a "Legacy" booking's schedule legitimately runs past the 2-month mark.
 */
export default function SchedulePolicyBadge({
  reservationDate,
  policy: policyProp,
  className,
}: SchedulePolicyBadgeProps) {
  const policy =
    policyProp !== undefined ? policyProp : getSchedulePolicy(reservationDate);
  if (!policy) return null;

  const isLegacy = policy.key === "legacy";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex focus:outline-none ${className ?? ""}`}
        >
          <Badge
            variant="outline"
            className={`cursor-pointer text-[11px] font-medium transition-colors ${
              isLegacy
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {policy.label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onClick={(e) => e.stopPropagation()}
        className="w-72"
      >
        <p
          className={`mb-1 text-sm font-semibold ${
            isLegacy ? "text-amber-700" : "text-gray-700"
          }`}
        >
          {policy.label}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {policy.description}
        </p>
      </PopoverContent>
    </Popover>
  );
}
