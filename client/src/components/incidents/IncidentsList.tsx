"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Fuse from "fuse.js";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth-store";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  X,
  FileText,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import {
  Incident,
  IncidentStatus,
  INCIDENT_STATUS_LABELS,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
  INCIDENT_CATEGORIES,
} from "@/types/incidents";
import { deleteIncident } from "@/services/incidents-service";
import { STATUS_ICON } from "@/components/incidents/incidentMeta";

/** True when HTML has visible text (Tiptap emits "<p></p>" for empty). */
const hasHtml = (html?: string) =>
  !!html && html.replace(/<[^>]*>/g, "").trim().length > 0;

const statusBadge = (status: string) => {
  switch (status) {
    case "open":
      return "bg-crimson-red/15 text-crimson-red border border-crimson-red/30";
    case "monitoring":
      return "bg-sunglow-yellow/20 text-vivid-orange border border-sunglow-yellow/30";
    case "resolved":
      return "bg-spring-green/20 text-spring-green border border-spring-green/30";
    case "closed":
      return "bg-grey/20 text-grey border border-grey/30";
    default:
      return "bg-grey/20 text-grey border border-grey/30";
  }
};

const severityBadge = (severity: string) => {
  switch (severity) {
    case "critical":
      return "bg-crimson-red/15 text-crimson-red border border-crimson-red/30";
    case "high":
      return "bg-vivid-orange/15 text-vivid-orange border border-vivid-orange/30";
    case "medium":
      return "bg-sunglow-yellow/20 text-vivid-orange border border-sunglow-yellow/30";
    case "low":
      return "bg-grey/15 text-grey border border-grey/30";
    default:
      return "bg-grey/15 text-grey border border-grey/30";
  }
};

const createdMillis = (i: Incident) => {
  const c: any = i.metadata?.createdAt;
  return typeof c?.toMillis === "function" ? c.toMillis() : 0;
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

export default function IncidentsList() {
  const router = useRouter();
  const { toast } = useToast();
  const isAdmin = useAuthStore((s) => s.userProfile?.role === "admin");

  const [all, setAll] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [toDelete, setToDelete] = useState<Incident | null>(null);

  const loadIncidents = () => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, "incidents"),
      (snapshot) => {
        setAll(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Incident[],
        );
        setLoading(false);
      },
      (error) => {
        console.error("Error loading incidents:", error);
        toast({
          title: "Error",
          description: "Failed to load incidents.",
          variant: "destructive",
        });
        setLoading(false);
      },
    );
    return unsub;
  };

  useEffect(() => {
    const unsub = loadIncidents();
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fuse = useMemo(() => {
    if (all.length === 0) return null;
    return new Fuse(all, {
      keys: [
        { name: "title", weight: 0.4 },
        { name: "incidentCode", weight: 0.25 },
        { name: "summary", weight: 0.15 },
        { name: "relatedRef", weight: 0.1 },
        { name: "tags", weight: 0.1 },
      ],
      threshold: 0.4,
      minMatchCharLength: 2,
    });
  }, [all]);

  const filtered = useMemo(() => {
    let results = all;
    if (fuse && searchTerm) results = fuse.search(searchTerm).map((r) => r.item);
    if (statusFilter !== "all")
      results = results.filter((i) => i.status === statusFilter);
    if (severityFilter !== "all")
      results = results.filter((i) => i.severity === severityFilter);
    if (categoryFilter !== "all")
      results = results.filter((i) => i.category === categoryFilter);
    return [...results].sort((a, b) => createdMillis(b) - createdMillis(a));
  }, [all, fuse, searchTerm, statusFilter, severityFilter, categoryFilter]);

  const countBy = (status: IncidentStatus) =>
    all.filter((i) => i.status === status).length;
  const openish = all.filter(
    (i) => i.status === "open" || i.status === "monitoring",
  ).length;

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteIncident(toDelete.id);
      toast({ title: "Deleted", description: "Incident removed." });
      setToDelete(null);
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-crimson-red/30 rounded-full" />
            <div className="w-16 h-16 border-4 border-crimson-red border-t-transparent rounded-full animate-spin absolute inset-0" />
          </div>
          <p className="text-muted-foreground">Loading incidents…</p>
        </div>
      </div>
    );
  }

  const statCards: { label: string; value: number; className: string }[] = [
    { label: "Needs attention", value: openish, className: "text-crimson-red" },
    { label: "Monitoring", value: countBy("monitoring"), className: "text-vivid-orange" },
    { label: "Resolved", value: countBy("resolved"), className: "text-spring-green" },
    { label: "Total", value: all.length, className: "text-foreground" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card
            key={s.label}
            className="border border-border hover:border-crimson-red transition-all"
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                {s.label}
              </p>
              <p className={`text-2xl font-bold ${s.className}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + New */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search incidents…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INCIDENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {INCIDENT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {INCIDENT_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {INCIDENT_SEVERITY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {INCIDENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {INCIDENT_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <Button
                onClick={() => router.push("/incidents/new")}
                className="bg-crimson-red hover:bg-royal-purple text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="[&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle">
              <TableHeader>
                <TableRow>
                  <TableHead>Incident</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Owner</TableHead>
                  <TableHead className="hidden lg:table-cell">Occurred</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => (
                  <TableRow
                    key={i.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/incidents/${i.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium text-foreground">
                            <span className="truncate">{i.title}</span>
                            {i.attachment && (
                              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                          </div>
                          {i.incidentCode && (
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {i.incidentCode}
                            </p>
                          )}
                          {hasHtml(i.actionsNeeded) && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-vivid-orange">
                              <ShieldAlert className="h-3 w-3" />
                              Actions needed
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {INCIDENT_CATEGORY_LABELS[i.category] ?? i.category}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={severityBadge(i.severity)}>
                        {INCIDENT_SEVERITY_LABELS[i.severity] ?? i.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`gap-1 ${statusBadge(i.status)}`}>
                        {(() => {
                          const Icon = STATUS_ICON[i.status];
                          return Icon ? <Icon className="h-3 w-3" /> : null;
                        })()}
                        {INCIDENT_STATUS_LABELS[i.status] ?? i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {i.owner || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {fmtDate(i.dateOccurred)}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => router.push(`/incidents/${i.id}/edit`)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setToDelete(i)}
                              className="text-crimson-red focus:text-crimson-red"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filtered.length === 0 && (
            <div className="p-12 text-center">
              <div className="mx-auto w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                No incidents found
              </h3>
              <p className="text-muted-foreground">
                {searchTerm ||
                statusFilter !== "all" ||
                severityFilter !== "all" ||
                categoryFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : isAdmin
                    ? "Log the first incident to start the archive."
                    : "Nothing has been logged yet."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={loadIncidents}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this incident?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &quot;{toDelete?.title}&quot; and its
              attached PDF (if any). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-crimson-red hover:bg-crimson-red/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
