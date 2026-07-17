"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth-store";
import { ArrowLeft, Save, FileText, Upload, X } from "lucide-react";
import RichTextEditor from "@/components/common/RichTextEditor";
import TagInput from "@/components/common/TagInput";
import BookingSearchField from "@/components/common/BookingSearchField";
import { SeverityOption, StatusOption } from "@/components/incidents/incidentMeta";
import {
  Incident,
  IncidentFormData,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  RelatedBooking,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABELS,
} from "@/types/incidents";
import { createIncident, updateIncident } from "@/services/incidents-service";

export default function IncidentForm({ incident }: { incident?: Incident }) {
  const router = useRouter();
  const { toast } = useToast();
  const { userProfile } = useAuthStore();
  const isEdit = !!incident;

  const [title, setTitle] = useState(incident?.title ?? "");
  // System-generated on the server; shown read-only here (empty until created).
  const incidentCode = incident?.incidentCode ?? "";
  const [category, setCategory] = useState<IncidentCategory>(
    incident?.category ?? "other",
  );
  const [severity, setSeverity] = useState<IncidentSeverity>(
    incident?.severity ?? "medium",
  );
  const [status, setStatus] = useState<IncidentStatus>(
    incident?.status ?? "open",
  );
  const [owner, setOwner] = useState(incident?.owner ?? "");
  const [relatedBooking, setRelatedBooking] = useState<RelatedBooking | null>(
    incident?.relatedBooking ?? null,
  );
  const [dateOccurred, setDateOccurred] = useState(incident?.dateOccurred ?? "");
  const [dateReported, setDateReported] = useState(incident?.dateReported ?? "");
  const [tags, setTags] = useState<string[]>(incident?.tags ?? []);
  const [summary, setSummary] = useState(incident?.summary ?? "");
  const [actionsNeeded, setActionsNeeded] = useState(
    incident?.actionsNeeded ?? "",
  );

  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pre-fill owner with the current user's name when creating a new incident.
  useEffect(() => {
    if (isEdit || owner || !userProfile) return;
    const name =
      `${userProfile.profile?.firstName ?? ""} ${
        userProfile.profile?.lastName ?? ""
      }`.trim() || userProfile.email;
    if (name) setOwner(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  const existingAttachment =
    incident?.attachment && !removeAttachment && !file
      ? incident.attachment
      : null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast({
        title: "PDF only",
        description: "Only PDF reports can be attached.",
        variant: "destructive",
      });
      return;
    }
    setFile(f);
    setRemoveAttachment(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Give the incident a title.",
        variant: "destructive",
      });
      return;
    }

    const data: IncidentFormData = {
      title: title.trim(),
      incidentCode: incidentCode.trim(),
      category,
      severity,
      status,
      owner: owner.trim(),
      relatedRef: relatedBooking?.bookingId ?? "",
      relatedBooking,
      dateOccurred,
      dateReported,
      tags,
      summary,
      actionsNeeded,
    };

    setSaving(true);
    try {
      if (isEdit && incident) {
        await updateIncident(incident.id, data, file, removeAttachment);
        toast({ title: "Saved", description: "Incident updated." });
        router.push(`/incidents/${incident.id}`);
      } else {
        const id = await createIncident(data, file);
        toast({ title: "Created", description: "Incident logged." });
        router.push(`/incidents/${id}`);
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save.",
        variant: "destructive",
      });
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-4 md:pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/incidents")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? "Edit incident" : "New incident"}
          </h1>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full sm:w-auto bg-crimson-red hover:bg-royal-purple text-white"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <Card className="border border-border">
        <CardContent className="p-6 space-y-5">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Disputed booking — 'I never made this booking'"
              className="mt-1"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="code">Incident code</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Assigned automatically by the system.
              </p>
              <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
                {incidentCode || "Auto-generated on save (INC-YYYY-NNN)"}
              </div>
            </div>
            <div>
              <Label>Related booking</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Search and link the booking this incident concerns.
              </p>
              <BookingSearchField
                value={relatedBooking}
                onChange={setRelatedBooking}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as IncidentCategory)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {INCIDENT_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as IncidentSeverity)}
              >
                <SelectTrigger className="mt-1 [&>span]:!flex [&>span]:!items-center">
                  <SeverityOption value={severity} />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_SEVERITIES.map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      className="pl-2 [&>span:first-child]:hidden"
                    >
                      <SeverityOption value={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as IncidentStatus)}
              >
                <SelectTrigger className="mt-1 [&>span]:!flex [&>span]:!items-center">
                  <StatusOption value={status} />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_STATUSES.map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      className="pl-2 [&>span:first-child]:hidden"
                    >
                      <StatusOption value={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Who owns follow-up"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="occurred">Date occurred</Label>
              <Input
                id="occurred"
                type="date"
                value={dateOccurred}
                onChange={(e) => setDateOccurred(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="reported">Date reported</Label>
              <Input
                id="reported"
                type="date"
                value={dateReported}
                onChange={(e) => setDateReported(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Tags</Label>
            <div className="mt-1">
              <TagInput
                value={tags}
                onChange={setTags}
                placeholder="Type a tag and press Enter…"
              />
            </div>
          </div>

          <div>
            <Label>Summary</Label>
            <p className="text-xs text-muted-foreground mb-1">
              A plain-language summary of what happened and the outcome.
            </p>
            <RichTextEditor
              value={summary}
              onChange={setSummary}
              placeholder="What happened, what the evidence shows, current status…"
            />
          </div>

          <div>
            <Label>Actions needed</Label>
            <p className="text-xs text-muted-foreground mb-1">
              What the team / dev needs to do next (surfaced on the list).
            </p>
            <RichTextEditor
              value={actionsNeeded}
              onChange={setActionsNeeded}
              placeholder="What still needs to happen…"
              minHeight="8rem"
            />
          </div>

          {/* PDF attachment */}
          <div>
            <Label>PDF report (optional)</Label>
            <div className="mt-1 rounded-md border border-dashed border-border p-4">
              {file ? (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <FileText className="h-4 w-4 text-crimson-red" />
                    {file.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : existingAttachment ? (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <FileText className="h-4 w-4 text-crimson-red" />
                    {existingAttachment.originalName}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveAttachment(true)}
                    className="text-crimson-red"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Upload className="h-4 w-4" />
                  <span>
                    {removeAttachment ? "PDF will be removed on save. " : ""}
                    Click to attach a PDF report
                  </span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFile}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
