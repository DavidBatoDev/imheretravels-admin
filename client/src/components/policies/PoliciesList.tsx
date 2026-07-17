"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Fuse from "fuse.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  X,
  BookOpen,
} from "lucide-react";
import {
  Policy,
  POLICY_STATUSES,
  POLICY_CATEGORIES,
  POLICY_STATUS_LABELS,
  POLICY_CATEGORY_LABELS,
} from "@/types/policies";
import { deletePolicy } from "@/services/policies-service";

const statusBadge = (status: string) => {
  switch (status) {
    case "published":
      return "bg-spring-green/20 text-spring-green border border-spring-green/30";
    case "draft":
      return "bg-sunglow-yellow/20 text-vivid-orange border border-sunglow-yellow/30";
    case "archived":
      return "bg-grey/20 text-grey border border-grey/30";
    default:
      return "bg-grey/20 text-grey border border-grey/30";
  }
};

export default function PoliciesList() {
  const router = useRouter();
  const { toast } = useToast();
  const isAdmin = useAuthStore((s) => s.userProfile?.role === "admin");

  const [all, setAll] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [toDelete, setToDelete] = useState<Policy | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "policies"),
      (snapshot) => {
        setAll(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Policy[],
        );
        setLoading(false);
      },
      (error) => {
        console.error("Error loading policies:", error);
        toast({
          title: "Error",
          description: "Failed to load policies.",
          variant: "destructive",
        });
        setLoading(false);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fuse = useMemo(() => {
    if (all.length === 0) return null;
    return new Fuse(all, {
      keys: [
        { name: "title", weight: 0.5 },
        { name: "summary", weight: 0.2 },
        { name: "body", weight: 0.15 },
        { name: "tags", weight: 0.15 },
      ],
      threshold: 0.4,
      minMatchCharLength: 2,
    });
  }, [all]);

  const filtered = useMemo(() => {
    let results = all;
    if (fuse && searchTerm) results = fuse.search(searchTerm).map((r) => r.item);
    if (statusFilter !== "all")
      results = results.filter((p) => p.status === statusFilter);
    if (categoryFilter !== "all")
      results = results.filter((p) => p.category === categoryFilter);
    return [...results].sort((a, b) => a.title.localeCompare(b.title));
  }, [all, fuse, searchTerm, statusFilter, categoryFilter]);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deletePolicy(toDelete.id);
      toast({ title: "Deleted", description: "Policy removed." });
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
        <div className="w-16 h-16 border-4 border-crimson-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters + New */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search policies…"
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
                {POLICY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {POLICY_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {POLICY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {POLICY_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <Button
                onClick={() => router.push("/policies/new")}
                className="bg-crimson-red hover:bg-royal-purple text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <Card
            key={p.id}
            className="border border-border hover:border-crimson-red/40 hover:shadow-md transition-all cursor-pointer flex flex-col"
            onClick={() => router.push(`/policies/${p.id}`)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">
                      {POLICY_CATEGORY_LABELS[p.category] ?? p.category}
                    </Badge>
                    <Badge className={statusBadge(p.status)}>
                      {POLICY_STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <CardTitle className="text-base text-foreground line-clamp-2">
                    {p.title}
                  </CardTitle>
                </div>
                {isAdmin && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/policies/${p.id}/edit`)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setToDelete(p)}
                          className="text-crimson-red focus:text-crimson-red"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex-1 flex flex-col">
              <CardDescription className="line-clamp-3 flex-1">
                {p.summary || "—"}
              </CardDescription>
              {(p.version || p.owner) && (
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  {p.version && <span>v{p.version}</span>}
                  {p.owner && <span>· {p.owner}</span>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No policies found
            </h3>
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== "all" || categoryFilter !== "all"
                ? "Try adjusting your search or filters."
                : isAdmin
                  ? "Create the first policy to start the reference library."
                  : "Nothing has been published yet."}
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this policy?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &quot;{toDelete?.title}&quot;. This cannot
              be undone.
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
