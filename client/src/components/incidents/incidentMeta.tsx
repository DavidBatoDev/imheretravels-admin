import { CircleDot, Eye, CheckCircle2, Archive, type LucideIcon } from "lucide-react";
import {
  IncidentSeverity,
  IncidentStatus,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
} from "@/types/incidents";

/** Colored dot per severity + icon per status — shared by form, list, detail. */

export const SEVERITY_DOT: Record<IncidentSeverity, string> = {
  low: "bg-grey",
  medium: "bg-sunglow-yellow",
  high: "bg-vivid-orange",
  critical: "bg-crimson-red",
};

export const STATUS_ICON: Record<IncidentStatus, LucideIcon> = {
  open: CircleDot,
  monitoring: Eye,
  resolved: CheckCircle2,
  closed: Archive,
};

export function SeverityOption({ value }: { value: IncidentSeverity }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[value]}`} />
      {INCIDENT_SEVERITY_LABELS[value]}
    </span>
  );
}

export function StatusOption({ value }: { value: IncidentStatus }) {
  const Icon = STATUS_ICON[value];
  return (
    <span className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5" />
      {INCIDENT_STATUS_LABELS[value]}
    </span>
  );
}
