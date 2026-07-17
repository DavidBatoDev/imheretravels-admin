"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save } from "lucide-react";
import RichTextEditor from "@/components/common/RichTextEditor";
import TagInput from "@/components/common/TagInput";
import {
  Policy,
  PolicyFormData,
  PolicyCategory,
  PolicyStatus,
  POLICY_STATUSES,
  POLICY_CATEGORIES,
  POLICY_STATUS_LABELS,
  POLICY_CATEGORY_LABELS,
} from "@/types/policies";
import { createPolicy, updatePolicy } from "@/services/policies-service";

export default function PolicyForm({ policy }: { policy?: Policy }) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!policy;

  const [title, setTitle] = useState(policy?.title ?? "");
  const [category, setCategory] = useState<PolicyCategory>(
    policy?.category ?? "process",
  );
  const [status, setStatus] = useState<PolicyStatus>(policy?.status ?? "draft");
  const [summary, setSummary] = useState(policy?.summary ?? "");
  const [version, setVersion] = useState(policy?.version ?? "");
  const [effectiveDate, setEffectiveDate] = useState(policy?.effectiveDate ?? "");
  const [owner, setOwner] = useState(policy?.owner ?? "");
  const [tags, setTags] = useState<string[]>(policy?.tags ?? []);
  const [body, setBody] = useState(policy?.body ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Give the policy a title.",
        variant: "destructive",
      });
      return;
    }

    const data: PolicyFormData = {
      title: title.trim(),
      category,
      status,
      summary: summary.trim(),
      version: version.trim(),
      effectiveDate,
      owner: owner.trim(),
      tags,
      body,
    };

    setSaving(true);
    try {
      if (isEdit && policy) {
        await updatePolicy(policy.id, data);
        toast({ title: "Saved", description: "Policy updated." });
        router.push(`/policies/${policy.id}`);
      } else {
        const id = await createPolicy(data);
        toast({ title: "Created", description: "Policy created." });
        router.push(`/policies/${id}`);
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
            onClick={() => router.push("/policies")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? "Edit policy" : "New policy"}
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
              placeholder="e.g. Customer Data Disclosure Policy"
              className="mt-1"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as PolicyCategory)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {POLICY_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as PolicyStatus)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {POLICY_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One or two lines shown in the list."
              rows={2}
              className="mt-1"
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 1.0"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="effective">Effective date</Label>
              <Input
                id="effective"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Team / person"
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
            <Label>Policy content</Label>
            <p className="text-xs text-muted-foreground mb-1">
              Format as you type — headings, tables, lists, and links.
            </p>
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Write the policy here…"
              minHeight="20rem"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
