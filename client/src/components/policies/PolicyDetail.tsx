"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Edit } from "lucide-react";
import RichHtml from "@/components/common/RichHtml";
import { useAuthStore } from "@/store/auth-store";
import {
  Policy,
  POLICY_STATUS_LABELS,
  POLICY_CATEGORY_LABELS,
} from "@/types/policies";
import { getPolicyById } from "@/services/policies-service";

const statusBadge = (status: string) => {
  switch (status) {
    case "published":
      return "bg-spring-green/20 text-spring-green border border-spring-green/30";
    case "draft":
      return "bg-sunglow-yellow/20 text-vivid-orange border border-sunglow-yellow/30";
    default:
      return "bg-grey/20 text-grey border border-grey/30";
  }
};

const fmtDate = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

export default function PolicyDetail({ id }: { id: string }) {
  const router = useRouter();
  const isAdmin = useAuthStore((s) => s.userProfile?.role === "admin");

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getPolicyById(id);
        if (!active) return;
        if (!data) setNotFound(true);
        else setPolicy(data);
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

  if (notFound || !policy) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Policy not found
        </h1>
        <p className="text-muted-foreground mb-6">It may have been deleted.</p>
        <Button onClick={() => router.push("/policies")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to policies
        </Button>
      </div>
    );
  }

  const effective = fmtDate(policy.effectiveDate);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/policies")}
            className="mb-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Policies
          </Button>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="secondary">
              {POLICY_CATEGORY_LABELS[policy.category] ?? policy.category}
            </Badge>
            <Badge className={statusBadge(policy.status)}>
              {POLICY_STATUS_LABELS[policy.status] ?? policy.status}
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            {policy.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            {policy.version && <span>Version {policy.version}</span>}
            {effective && <span>· Effective {effective}</span>}
            {policy.owner && <span>· Owner: {policy.owner}</span>}
          </div>
        </div>
        {isAdmin && (
          <Button
            onClick={() => router.push(`/policies/${policy.id}/edit`)}
            className="w-full sm:w-auto bg-crimson-red hover:bg-royal-purple text-white shrink-0"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      <Card className="border border-border">
        <CardContent className="p-6">
          {policy.body?.trim() ? (
            <RichHtml html={policy.body} />
          ) : (
            <p className="text-muted-foreground text-sm">
              This policy has no content yet.
            </p>
          )}
        </CardContent>
      </Card>

      {policy.tags && policy.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {policy.tags.map((t) => (
            <Badge key={t} variant="outline" className="text-xs">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
