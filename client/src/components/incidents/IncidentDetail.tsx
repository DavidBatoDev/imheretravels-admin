"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Edit,
  FileText,
  ShieldAlert,
  Tag,
  User,
  Calendar,
  Link2,
} from "lucide-react";
import RichHtml from "@/components/common/RichHtml";
import { PDFPreviewModal } from "@/components/mail/PDFPreviewModal";
import { STATUS_ICON } from "@/components/incidents/incidentMeta";
import { useAuthStore } from "@/store/auth-store";
import {
  Incident,
  INCIDENT_STATUS_LABELS,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_CATEGORY_LABELS,
} from "@/types/incidents";
import { getIncidentById } from "@/services/incidents-service";

const statusBadge = (status: string) => {
  switch (status) {
    case "open":
      return "bg-crimson-red/15 text-crimson-red border border-crimson-red/30";
    case "monitoring":
      return "bg-sunglow-yellow/20 text-vivid-orange border border-sunglow-yellow/30";
    case "resolved":
      return "bg-spring-green/20 text-spring-green border border-spring-green/30";
    default:
      return "bg-grey/20 text-grey border border-grey/30";
  }
};

const severityBadge = (severity: string) => {
  switch (severity) {
    case "critical":
    case "high":
      return "bg-crimson-red/15 text-crimson-red border border-crimson-red/30";
    case "medium":
      return "bg-sunglow-yellow/20 text-vivid-orange border border-sunglow-yellow/30";
    default:
      return "bg-grey/15 text-grey border border-grey/30";
  }
};

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

/** True when HTML has visible text (Tiptap emits "<p></p>" for empty). */
const hasHtml = (html?: string) =>
  !!html && html.replace(/<[^>]*>/g, "").trim().length > 0;

export default function IncidentDetail({ id }: { id: string }) {
  const router = useRouter();
  const isAdmin = useAuthStore((s) => s.userProfile?.role === "admin");

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getIncidentById(id);
        if (!active) return;
        if (!data) setNotFound(true);
        else setIncident(data);
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-crimson-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !incident) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Incident not found
        </h1>
        <p className="text-muted-foreground mb-6">
          It may have been deleted.
        </p>
        <Button onClick={() => router.push("/incidents")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to incidents
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/incidents")}
            className="mb-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Incidents
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            {incident.title}
          </h1>
          {incident.incidentCode && (
            <p className="text-sm text-muted-foreground font-mono mt-1">
              {incident.incidentCode}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge className={`gap-1 ${statusBadge(incident.status)}`}>
              {(() => {
                const Icon = STATUS_ICON[incident.status];
                return Icon ? <Icon className="h-3 w-3" /> : null;
              })()}
              {INCIDENT_STATUS_LABELS[incident.status] ?? incident.status}
            </Badge>
            <Badge className={severityBadge(incident.severity)}>
              {INCIDENT_SEVERITY_LABELS[incident.severity] ?? incident.severity}
            </Badge>
            <Badge variant="secondary">
              {INCIDENT_CATEGORY_LABELS[incident.category] ?? incident.category}
            </Badge>
          </div>
        </div>
        {isAdmin && (
          <Button
            onClick={() => router.push(`/incidents/${incident.id}/edit`)}
            className="w-full sm:w-auto bg-crimson-red hover:bg-royal-purple text-white shrink-0"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {/* Meta */}
      <Card className="border border-border">
        <CardContent className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <User className="h-3 w-3" /> Owner
            </p>
            <p className="text-foreground mt-1">{incident.owner || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Occurred
            </p>
            <p className="text-foreground mt-1">{fmtDate(incident.dateOccurred)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Reported
            </p>
            <p className="text-foreground mt-1">{fmtDate(incident.dateReported)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Related booking
            </p>
            <p className="text-foreground mt-1 font-mono text-xs break-all">
              {incident.relatedBooking?.bookingId || incident.relatedRef || "—"}
            </p>
          </div>
          {incident.tags && incident.tags.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
                <Tag className="h-3 w-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {incident.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related booking */}
      {incident.relatedBooking && (
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-crimson-red" />
                  Related booking
                </h2>
                <p className="font-mono text-sm text-foreground">
                  {incident.relatedBooking.bookingId}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[
                    incident.relatedBooking.fullName,
                    incident.relatedBooking.emailAddress,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[
                    incident.relatedBooking.tourPackageName,
                    incident.relatedBooking.tourDate,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <a href={`/bookings?search=${encodeURIComponent(incident.relatedBooking.bookingId)}`}>
                <Button variant="outline" size="sm">
                  View in Bookings
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions needed */}
      {hasHtml(incident.actionsNeeded) && (
        <Card className="border border-vivid-orange/30 bg-vivid-orange/5">
          <CardContent className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-3">
              <ShieldAlert className="h-5 w-5 text-vivid-orange" />
              Actions needed
            </h2>
            <RichHtml html={incident.actionsNeeded!} />
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card className="border border-border">
        <CardContent className="p-5">
          <h2 className="text-lg font-semibold text-foreground mb-3">Summary</h2>
          {hasHtml(incident.summary) ? (
            <RichHtml html={incident.summary} />
          ) : (
            <p className="text-muted-foreground text-sm">No summary provided.</p>
          )}
        </CardContent>
      </Card>

      {/* PDF report */}
      {incident.attachment && (
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <FileText className="h-5 w-5 text-crimson-red" />
                Full report
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
                  Open
                </Button>
                <a href={incident.attachment.fileDownloadURL} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    Download
                  </Button>
                </a>
              </div>
            </div>
            <div className="h-[70vh] rounded-lg border border-border overflow-hidden bg-muted">
              <iframe
                src={incident.attachment.fileDownloadURL}
                className="w-full h-full border-0"
                title={incident.attachment.originalName}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {incident.attachment && (
        <PDFPreviewModal
          isOpen={pdfOpen}
          onClose={() => setPdfOpen(false)}
          pdfUrl={incident.attachment.fileDownloadURL}
          filename={incident.attachment.originalName}
        />
      )}
    </div>
  );
}
