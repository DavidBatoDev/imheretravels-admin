"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  ReadonlyURLSearchParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Fuse from "fuse.js";
import type { Booking } from "@/types/bookings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  MapPin,
  Clock,
  Banknote,
  Users,
  Star,
  Archive,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  Calendar,
  TrendingUp,
  X,
  Copy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TourPackage,
} from "@/types/tours";
import {
  deleteTour,
  archiveTour,
  duplicateTour,
} from "@/services/tours-service";
import TourDetails from "./TourDetails";

/**
 * Which slice of `tourPackages` this list renders. Hosted tours are flagged on
 * the tour itself (`isHosted`), independent of resident-host attachment.
 */
export type ToursListView = "all" | "regular" | "hosted";

interface ToursListProps {
  view?: ToursListView;
}

export default function ToursList({ view = "all" }: ToursListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [allTours, setAllTours] = useState<TourPackage[]>([]); // Full list for client-side search
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTour, setSelectedTour] = useState<TourPackage | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [tourToDelete, setTourToDelete] = useState<TourPackage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const { toast } = useToast();
  const nameCollator = useMemo(
    () => new Intl.Collator(undefined, { sensitivity: "base" }),
    [],
  );

  // Create Fuse instance for fuzzy search
  const fuse = useMemo(() => {
    if (allTours.length === 0) return null;

    return new Fuse(allTours, {
      keys: [
        { name: "name", weight: 0.5 },
        { name: "description", weight: 0.3 },
        { name: "destinations", weight: 0.2 },
        { name: "tourCode", weight: 0.7 },
      ],
      threshold: 0.4, // 0 = exact match, 1 = match anything
      includeScore: true,
      minMatchCharLength: 2,
    });
  }, [allTours]);

  /**
   * Booking counts keyed by tourPackages document id.
   *
   * Bookings used to be matched by `tourPackageName`, but that string is a
   * snapshot taken at booking time — renaming a tour silently orphaned its
   * history (in prod that hid 101 of 211 bookings, and every hosted tour
   * reported zero). `tourId` is stable; `tourCode` is the fallback for any
   * booking predating the backfill, and the name is the last resort.
   */
  const tourBookingCounts = useMemo(() => {
    const byId: Record<string, number> = {};
    const idByCode: Record<string, string> = {};
    const idByName: Record<string, string> = {};
    allTours.forEach((tour) => {
      if (tour.tourCode) idByCode[tour.tourCode.trim().toLowerCase()] = tour.id;
      if (tour.name) idByName[tour.name.trim().toLowerCase()] = tour.id;
    });

    bookings.forEach((booking) => {
      const code = booking.tourCode?.trim?.().toLowerCase();
      const name = (
        booking.tourPackageName ||
        booking.tourPackage ||
        booking.tourName ||
        booking.tour ||
        booking.package
      )
        ?.trim?.()
        .toLowerCase();

      const tourId =
        booking.tourId ||
        (code ? idByCode[code] : undefined) ||
        (name ? idByName[name] : undefined);

      if (tourId) byId[tourId] = (byId[tourId] || 0) + 1;
    });
    return byId;
  }, [bookings, allTours]);

  // Hosted vs. regular split — drives the scorecards. Counts always cover the
  // whole collection so they stay stable no matter which tab is open.
  const tourStats = useMemo(() => {
    const tally = (list: TourPackage[]) => ({
      total: list.length,
      active: list.filter((tour) => tour.status === "active").length,
      draft: list.filter((tour) => tour.status === "draft").length,
      archived: list.filter((tour) => tour.status === "archived").length,
    });

    return {
      hosted: tally(allTours.filter((tour) => tour.isHosted === true)),
      regular: tally(allTours.filter((tour) => tour.isHosted !== true)),
      all: tally(allTours),
    };
  }, [allTours]);

  // Filter tours based on search and filters
  const filteredTours = useMemo(() => {
    let results = allTours;

    // Apply Fuse.js fuzzy search
    if (fuse && searchTerm) {
      const fuseResults = fuse.search(searchTerm);
      results = fuseResults.map((result) => result.item);
    }

    // Apply hosted/regular view
    if (view === "hosted") {
      results = results.filter((tour) => tour.isHosted === true);
    } else if (view === "regular") {
      results = results.filter((tour) => tour.isHosted !== true);
    }

    // Apply status filter
    if (statusFilter !== "all") {
      results = results.filter((tour) => tour.status === statusFilter);
    }

    return [...results].sort((a, b) => {
      const aName = (a?.name || "").trim();
      const bName = (b?.name || "").trim();

      // Keep unnamed tours at the end while preserving deterministic ordering.
      if (!aName && !bName) return 0;
      if (!aName) return 1;
      if (!bName) return -1;

      return nameCollator.compare(aName, bName);
    });
  }, [fuse, searchTerm, statusFilter, view, allTours, nameCollator]);

  // Load bookings data
  const loadBookings = () => {
    try {
      const bookingsQuery = query(collection(db, "bookings"));

      const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
        const bookingData = snapshot.docs.map((doc) => {
          const data = doc.data();
          // Convert Firebase Timestamps to JavaScript Date objects
          return {
            id: doc.id,
            ...data,
            reservationDate: data.reservationDate?.toDate
              ? data.reservationDate.toDate()
              : new Date(data.reservationDate),
            tourDate: data.tourDate?.toDate
              ? data.tourDate.toDate()
              : new Date(data.tourDate),
            returnDate: data.returnDate?.toDate
              ? data.returnDate.toDate()
              : data.returnDate
                ? new Date(data.returnDate)
                : null,
          };
        }) as Booking[];

        setBookings(bookingData);
        console.log("Loaded bookings:", bookingData.length, bookingData);
      });

      return unsubscribe;
    } catch (error) {
      console.error("Error loading bookings:", error);
      return () => {}; // Return empty function as fallback
    }
  };

  // Load tours with real-time updates
  const loadTours = () => {
    try {
      setLoading(true);

      const toursQuery = query(collection(db, "tourPackages"));

      const unsubscribe = onSnapshot(
        toursQuery,
        (snapshot) => {
          const tourData = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              ...data,
              id: doc.id,
              // Convert Firestore Timestamps to Date objects if needed
              createdAt: data.createdAt?.toDate
                ? data.createdAt.toDate()
                : data.createdAt,
              updatedAt: data.updatedAt?.toDate
                ? data.updatedAt.toDate()
                : data.updatedAt,
            } as unknown as TourPackage;
          });

          console.log("Real-time tours update:", tourData.length);
          setAllTours(tourData);
          setLoading(false);
        },
        (error) => {
          console.error("Error loading tours:", error);
          toast({
            title: "Error",
            description: "Failed to load tours. Please try again.",
            variant: "destructive",
          });
          setLoading(false);
        },
      );

      return unsubscribe;
    } catch (error) {
      console.error("Error setting up tours listener:", error);
      toast({
        title: "Error",
        description: "Failed to load tours. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
      return () => {}; // Return empty function as fallback
    }
  };

  useEffect(() => {
    const unsubscribeTours = loadTours();
    const unsubscribeBookings = loadBookings();

    return () => {
      if (unsubscribeTours) {
        unsubscribeTours();
      }
      if (unsubscribeBookings) {
        unsubscribeBookings();
      }
    };
  }, []); // Only load on mount, filtering is now client-side

  // Handle query parameters for opening details view
  useEffect(() => {
    const tourId = searchParams?.get("tourId");

    if (tourId && allTours.length > 0) {
      const tour = allTours.find((t) => t.id === tourId);
      if (tour) {
        setSelectedTour(tour);
        setIsDetailsOpen(true);
      }
    }
  }, [searchParams, allTours]);

  // Archive tour
  const handleArchiveTour = async (tour: TourPackage) => {
    try {
      await archiveTour(tour.id);

      toast({
        title: "Success",
        description: "Tour archived successfully!",
      });

      setIsDetailsOpen(false);

      // Clear URL parameters after archive
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("tourId");
      params.delete("action");
      params.delete("mode");
      router.push(`/tours?${params.toString()}`, { scroll: false });
    } catch (error) {
      console.error("Error archiving tour:", error);
      toast({
        title: "Error",
        description: "Failed to archive tour. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Duplicate tour → creates a fresh DRAFT copy; the onSnapshot list refreshes
  // itself, so no manual refetch is needed.
  const handleDuplicateTour = async (tour: TourPackage) => {
    if (duplicatingId) return; // guard against double-clicks
    setDuplicatingId(tour.id);
    try {
      await duplicateTour(tour.id);
      toast({
        title: "Success",
        description: `Duplicated "${tour.name}" as a draft.`,
      });
    } catch (error) {
      console.error("Error duplicating tour:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to duplicate tour. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDuplicatingId(null);
    }
  };

  // Delete tour
  const handleDeleteTour = async () => {
    if (!tourToDelete) return;

    try {
      await deleteTour(tourToDelete.id);

      toast({
        title: "Success",
        description: "Tour deleted successfully!",
      });

      setIsDeleteDialogOpen(false);
      setTourToDelete(null);
      setIsDetailsOpen(false);

      // Clear URL parameters after delete
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("tourId");
      params.delete("action");
      params.delete("mode");
      router.push(`/tours?${params.toString()}`, { scroll: false });
    } catch (error) {
      console.error("Error deleting tour:", error);
      toast({
        title: "Error",
        description: "Failed to delete tour. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Open create form (full page)
  const openCreateForm = () => {
    router.push("/tours/new");
  };

  // Open edit form (full page)
  const openEditForm = (tour: TourPackage) => {
    router.push(`/tours/${tour.id}/edit`);
  };

  // Open tour details
  const openTourDetails = (tour: TourPackage) => {
    setSelectedTour(tour);
    setIsDetailsOpen(true);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tourId", tour.id);
    router.push(`/tours?${params.toString()}`, { scroll: false });
  };

  // Confirm delete
  const confirmDelete = (tour: TourPackage) => {
    setTourToDelete(tour);
    setIsDeleteDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-spring-green/20 text-spring-green border border-spring-green/30";
      case "draft":
        return "bg-sunglow-yellow/20 text-vivid-orange border border-sunglow-yellow/30";
      case "archived":
        return "bg-grey/20 text-grey border border-grey/30";
      default:
        return "bg-grey/20 text-grey border border-grey/30";
    }
  };

  const toDate = (value: any) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "number" || typeof value === "string") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value?.toDate === "function") {
      return value.toDate();
    }
    if (typeof value?.seconds === "number") {
      return new Date(value.seconds * 1000);
    }
    if (typeof value?._seconds === "number") {
      return new Date(value._seconds * 1000);
    }
    return null;
  };

  const formatDateValue = (value?: any) => {
    const date = toDate(value);
    if (!date) return "Date TBD";
    return date.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case "USD":
        return "$";
      case "EUR":
        return "£";
      case "GBP":
        return "£";
      default:
        return currency;
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return `${getCurrencySymbol(currency)}${price.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-crimson-red/30 rounded-full"></div>
            <div className="w-20 h-20 border-4 border-crimson-red border-t-transparent rounded-full animate-spin absolute inset-0"></div>
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold text-foreground">
              Loading Tour Packages...
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Fetching your tour collection
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tour count scorecards — tours, hosted tours, and both combined */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(
          [
            {
              key: "regular",
              label: "Tours",
              stats: tourStats.regular,
              icon: MapPin,
              accent: "text-blue-500",
              iconBg: "from-blue-500/20 to-blue-500/10",
              highlighted: view === "regular",
            },
            {
              key: "hosted",
              label: "Hosted Tours",
              stats: tourStats.hosted,
              icon: Users,
              accent: "text-crimson-red",
              iconBg: "from-crimson-red/20 to-crimson-red/10",
              highlighted: view === "hosted",
            },
            {
              key: "all",
              label: "All Tours",
              stats: tourStats.all,
              icon: TrendingUp,
              accent: "text-royal-purple",
              iconBg: "from-royal-purple/20 to-royal-purple/10",
              highlighted: view === "all",
            },
          ] as const
        ).map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.key}
              className={`border transition-all duration-300 hover:shadow-md ${
                card.highlighted
                  ? "border-crimson-red shadow-md"
                  : "border-border hover:border-crimson-red"
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                      {card.label}
                    </p>
                    <p className={`text-3xl font-bold ${card.accent}`}>
                      {card.stats.total}
                    </p>
                    {/* Breakdown */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {card.stats.active > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-spring-green"></div>
                          <p className="text-xs text-muted-foreground">
                            Active:{" "}
                            <span className="text-spring-green font-bold">
                              {card.stats.active}
                            </span>
                          </p>
                        </div>
                      )}
                      {card.stats.draft > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-vivid-orange"></div>
                          <p className="text-xs text-muted-foreground">
                            Draft:{" "}
                            <span className="text-vivid-orange font-bold">
                              {card.stats.draft}
                            </span>
                          </p>
                        </div>
                      )}
                      {card.stats.archived > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          <p className="text-xs text-muted-foreground">
                            Archived:{" "}
                            <span className="text-blue-500 font-bold">
                              {card.stats.archived}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className={`p-4 bg-gradient-to-br ${card.iconBg} rounded-full rounded-br-none`}
                  >
                    <Icon className="h-6 w-6 text-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Statistics Cards with Add Button */}
      <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_auto] gap-4">
        {/* Average Cost */}
        <Card className="border border-border hover:border-crimson-red transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                  Total Bookings
                </p>
                <p className="text-2xl font-bold text-vivid-orange">
                  {bookings.length}
                </p>
                {bookings.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-2 h-2 rounded-full bg-vivid-orange"></div>
                    <p className="text-xs text-muted-foreground">
                      From all tours
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 bg-gradient-to-br from-vivid-orange/20 to-vivid-orange/10 rounded-full rounded-br-none">
                <Banknote className="h-6 w-6 text-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Most Selected Tour */}
        <Card className="col-span-2 md:col-span-1 border border-border hover:border-crimson-red transition-all duration-300 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                  Most Selected Tour
                </p>
                {(() => {
                  // Use memoized booking counts map to determine top tours
                  const sortedTours = [...allTours]
                    .map((t) => ({
                      ...t,
                      actualBookingsCount: tourBookingCounts[t.id] || 0,
                    }))
                    .sort(
                      (a, b) => b.actualBookingsCount - a.actualBookingsCount,
                    )
                    .slice(0, 3);

                  const mostSelectedTour = sortedTours[0] || {
                    name: "No tours",
                    actualBookingsCount: 0,
                  };

                  return (
                    <>
                      <p
                        className="text-lg font-bold text-royal-purple truncate"
                        title={mostSelectedTour.name}
                      >
                        {mostSelectedTour.name}
                      </p>
                      {allTours.length > 0 &&
                        mostSelectedTour.actualBookingsCount > 0 && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <div className="w-2 h-2 rounded-full bg-royal-purple"></div>
                            <p className="text-xs text-muted-foreground">
                              {mostSelectedTour.actualBookingsCount} bookings
                            </p>
                          </div>
                        )}

                      {/* Show 2nd and 3rd place */}
                      {sortedTours.length > 1 && (
                        <div className="mt-3 space-y-1">
                          {sortedTours.slice(1).map((tour, index) => (
                            <div
                              key={tour.id || index}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                  #{index + 2}
                                </span>
                                <p
                                  className="text-xs text-muted-foreground truncate flex-1"
                                  title={tour.name}
                                >
                                  {tour.name}
                                </p>
                              </div>
                              <span className="text-xs font-medium text-royal-purple">
                                {tour.actualBookingsCount}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="p-4 bg-gradient-to-br from-royal-purple/20 to-royal-purple/10 rounded-full rounded-br-none">
                <Star className="h-6 w-6 text-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Add Tour Button */}
        <div className="col-span-2 md:col-span-1 flex items-center justify-center">
          <Button
            onClick={openCreateForm}
            className="group h-20 w-20 rounded-full rounded-br-none bg-crimson-red hover:bg-royal-purple text-white transition-all duration-300 hover:scale-105 shadow-lg relative"
            title="Add New Tour"
          >
            <Plus className="h-10 w-10 absolute group-hover:opacity-0 group-hover:scale-0 transition-all duration-300" />
            <span className="text-[9px] font-medium opacity-0 scale-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 whitespace-nowrap font-hk-grotesk">
              ADD TOUR
            </span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border border-royal-purple/20 dark:border-border shadow">
        <CardContent className="p-6">
          <div className="flex flex-col gap-2 md:flex-row md:gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-royal-purple/60 h-4 w-4" />
                <Input
                  placeholder="Search across all fields ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10 border-royal-purple/20 focus:border-royal-purple focus:ring-royal-purple/20"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1 md:w-48 border-royal-purple/20 focus:border-royal-purple focus:ring-royal-purple/20">
                  <Filter className="mr-2 h-4 w-4 text-royal-purple" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={loadTours}
                disabled={loading}
                className="shrink-0 border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10 hover:border-royal-purple transition-all duration-200"
              >
                <RefreshCw
                  className={`h-4 w-4 md:mr-2 ${loading ? "animate-spin" : ""}`}
                />
                <span className="hidden md:inline">Refresh</span>
                <span className="sr-only md:hidden">Refresh</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tours List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTours.map((tour) => {
          const baseOriginal = tour.pricing.original || 0;
          const basePrice =
            typeof tour.pricing.discounted === "number" &&
            tour.pricing.discounted > 0
              ? tour.pricing.discounted
              : baseOriginal;
          const baseDeposit = tour.pricing.deposit ?? 0;
          const dateRows = (tour.travelDates || []).map((date) => {
            const hasCustomPrice =
              (typeof date.customDiscounted === "number" &&
                date.customDiscounted > 0) ||
              (typeof date.customOriginal === "number" &&
                date.customOriginal > 0);
            const hasCustomFee =
              typeof date.customDeposit === "number" && date.customDeposit > 0;
            return {
              date: date.startDate,
              hasCustomPrice,
              hasCustomFee,
              price:
                typeof date.customDiscounted === "number" &&
                date.customDiscounted > 0
                  ? date.customDiscounted
                  : typeof date.customOriginal === "number" &&
                      date.customOriginal > 0
                    ? date.customOriginal
                    : basePrice,
              deposit:
                typeof date.customDeposit === "number" && date.customDeposit > 0
                  ? date.customDeposit
                  : baseDeposit,
            };
          });

          return (
            <Card
              key={tour.id}
              className="hover:shadow-lg transition-all duration-200 overflow-hidden border border-royal-purple/20 dark:border-border shadow hover:border-royal-purple/40 dark:hover:border-border flex flex-col h-full"
            >
              {/* Cover Image */}
              <div className="relative w-full h-36 md:h-48 bg-muted">
                {tour.media?.coverImage ? (
                  <Image
                    src={tour.media.coverImage}
                    alt={tour.name}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/50">
                    <div className="text-center text-muted-foreground">
                      <MapPin className="h-8 w-8 mx-auto mb-2 text-royal-purple/60" />
                      <p className="text-sm">No image</p>
                    </div>
                  </div>
                )}
                {/* Status Badge Overlay */}
                <div className="absolute top-3 right-3">
                  <Badge className={getStatusColor(tour.status)}>
                    {tour.status.charAt(0).toUpperCase() + tour.status.slice(1)}
                  </Badge>
                </div>
                {/* Hosted Badge Overlay */}
                {tour.isHosted && (
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-crimson-red/90 text-white border border-crimson-red">
                      Hosted
                    </Badge>
                  </div>
                )}
              </div>

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1 text-foreground">
                      {tour.name}
                    </CardTitle>
                    <div className="flex items-center text-sm text-muted-foreground mb-2">
                      <MapPin className="h-4 w-4 mr-1 text-royal-purple" />
                      {tour.destinations?.[0] ?? "—"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-royal-purple hover:bg-royal-purple/10 hover:text-royal-purple"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openTourDetails(tour)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditForm(tour)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicateTour(tour)}
                          disabled={duplicatingId === tour.id}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {duplicatingId === tour.id
                            ? "Duplicating…"
                            : "Duplicate"}
                        </DropdownMenuItem>
                        {tour.status !== "archived" && (
                          <DropdownMenuItem
                            onClick={() => handleArchiveTour(tour)}
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => confirmDelete(tour)}
                          className="text-crimson-red focus:text-crimson-red"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <CardDescription className="line-clamp-2 text-muted-foreground">
                  {tour.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0 flex-1 flex flex-col">
                <div className="space-y-3 flex-1">
                  {/* Tour Details */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-1 text-royal-purple" />
                        <span className="text-foreground">{tour.duration}</span>
                      </div>
                      <div className="flex items-center">
                        <Users className="h-4 w-4 mr-1 text-royal-purple" />
                        <span className="text-foreground">
                          {tourBookingCounts[tour.id] || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing by Date */}
                  <div className="pt-1">
                    {dateRows.length > 0 ? (
                      <div className="space-y-1">
                        {dateRows.map((date, index) => (
                          <div
                            key={`${tour.id}-date-${index}`}
                            className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                          >
                            <span className="flex min-w-0 items-center gap-1">
                              <span className="line-clamp-1">
                                {formatDateValue(date.date)}
                              </span>
                              {date.hasCustomPrice && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 h-4 px-1 py-0 text-[9px] font-medium bg-royal-purple/10 text-royal-purple border-royal-purple/30"
                                  title="This date has a custom tour price"
                                >
                                  Custom price
                                </Badge>
                              )}
                              {date.hasCustomFee && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 h-4 px-1 py-0 text-[9px] font-medium bg-amber-500/10 text-amber-600 border-amber-500/30"
                                  title="This date has a custom reservation fee"
                                >
                                  Custom fee
                                </Badge>
                              )}
                            </span>
                            <span className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-sm font-bold text-foreground">
                                {formatPrice(date.price, tour.pricing.currency)}
                              </span>
                              <span className="text-sm font-bold text-muted-foreground">
                                ResFee{" "}
                                {formatPrice(
                                  date.deposit,
                                  tour.pricing.currency,
                                )}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No dates available
                      </p>
                    )}
                  </div>
                </div>

                {/* Highlights Preview */}
                <div className="pt-2">
                  <div className="flex flex-wrap gap-1">
                    {tour.details.highlights
                      .slice(0, 3)
                      .map((highlight, index) => {
                        // Handle both string and object formats
                        const highlightText =
                          typeof highlight === "string"
                            ? highlight
                            : (highlight as any)?.text || String(highlight);

                        return (
                          <Badge
                            key={index}
                            variant="outline"
                            className="text-xs border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10"
                          >
                            {highlightText.length > 15
                              ? `${highlightText.slice(0, 15)}...`
                              : highlightText}
                          </Badge>
                        );
                      })}
                    {tour.details.highlights.length > 3 && (
                      <Badge
                        variant="outline"
                        className="text-xs border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10"
                      >
                        +{tour.details.highlights.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Action Buttons - Fixed at bottom */}
                <div className="flex gap-2 pt-4 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openTourDetails(tour)}
                    className="flex-1 border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10 hover:border-royal-purple transition-all duration-200"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditForm(tour)}
                    className="flex-1 border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10 hover:border-royal-purple transition-all duration-200"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredTours.length === 0 && !loading && (
        <Card className="border border-royal-purple/20 dark:border-border shadow">
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-4 border border-royal-purple/20 dark:border-border">
              <MapPin className="h-12 w-12 text-royal-purple/60" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {view === "hosted" ? "No hosted tours found" : "No tours found"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || statusFilter !== "all"
                ? "Try adjusting your search or filters"
                : view === "hosted"
                  ? 'Mark a tour as "Hosted" in its settings to see it here'
                  : "Get started by creating your first tour package"}
            </p>
            <Button
              onClick={openCreateForm}
              className="bg-primary hover:bg-primary/90 text-white shadow shadow-primary/25 transition-all duration-200"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add New Tour
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tour Details Dialog */}
      <TourDetails
        tour={selectedTour}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedTour(null);

          // Remove URL parameters
          const params = new URLSearchParams(searchParams?.toString() ?? "");
          params.delete("tourId");
          params.delete("action");
          params.delete("mode");
          router.push(`/tours?${params.toString()}`, { scroll: false });
        }}
        onEdit={(tour) => {
          setIsDetailsOpen(false);
          openEditForm(tour);
        }}
        onArchive={handleArchiveTour}
        onDelete={confirmDelete}
        router={router}
        searchParams={
          searchParams ??
          (new URLSearchParams() as unknown as ReadonlyURLSearchParams)
        }
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="border border-royal-purple/20 dark:border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action cannot be undone. This will permanently delete the
              tour "{tourToDelete?.name}" and remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10 hover:border-royal-purple">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTour}
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
