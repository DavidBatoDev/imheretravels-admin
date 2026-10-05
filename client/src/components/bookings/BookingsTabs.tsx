"use client";

import { useEffect, useState } from "react";
import { asDate, parseTermDueDate } from "@/lib/late-fee-policy";
import { useSearchParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import BookingsSection from "./BookingsSection";
import BookingsSheet from "../sheet-management/BookingsSheet";
import PreDeparturePackSection from "@/app/(protected)/bookings/components/PreDeparturePackSection";
import ConfirmedBookingsSection from "@/app/(protected)/bookings/components/ConfirmedBookingsSection";
import GuestInvitationsSection from "@/app/(protected)/bookings/components/GuestInvitationsSection";
import LateFeesSection from "@/app/(protected)/bookings/components/LateFeesSection";
import { getUnsentConfirmedBookingsCount } from "@/services/confirmed-bookings-service";
import { getUnsentGuestInvitationsCount } from "@/services/guest-invitations-service";
import { db } from "@/lib/firebase";

// Tab mapping utilities
const urlToInternalTab = (urlTab: string | null): string => {
  switch (urlTab) {
    case "bookings":
      return "list";
    case "booking-list": // Backward compatibility
      return "list";
    case "confirmed-bookings":
      return "confirmed";
    case "guest-invitations":
      return "guest-invitations";
    case "bookings-sheet":
      return "sheet";
    case "late-fees":
      return "late-fees";
    case "sheet-management-tab": // Backward compatibility
      return "sheet";
    default:
      return "list"; // Default to booking list
  }
};

const internalTabToUrl = (internalTab: string): string => {
  switch (internalTab) {
    case "list":
      return "bookings";
    case "confirmed":
      return "confirmed-bookings";
    case "guest-invitations":
      return "guest-invitations";
    case "sheet":
      return "bookings-sheet";
    case "late-fees":
      return "late-fees";
    default:
      return "bookings";
  }
};

export default function BookingsTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("list");
  const [unsentCount, setUnsentCount] = useState<number>(0);
  const [unsentGuestInvitationsCount, setUnsentGuestInvitationsCount] =
    useState<number>(0);
  const [lateFeesPendingCount, setLateFeesPendingCount] = useState<number>(0);
  const [lateFeesEffectiveDate, setLateFeesEffectiveDate] = useState("");

  // Fetch unsent counts for tab badges
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [confirmedCount, guestCount] = await Promise.all([
          getUnsentConfirmedBookingsCount(),
          getUnsentGuestInvitationsCount(),
        ]);
        setUnsentCount(confirmedCount);
        setUnsentGuestInvitationsCount(guestCount);
      } catch (error) {
        console.error("Error fetching unsent counts:", error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to late-fees effective date from config
  useEffect(() => {
    const configRef = doc(db, "config", "late-fees");
    const unsubscribe = onSnapshot(
      configRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setLateFeesEffectiveDate("");
          return;
        }

        const config = snapshot.data();
        const parsedDate = asDate(config?.effectiveDate);
        setLateFeesEffectiveDate(
          parsedDate ? parsedDate.toISOString().slice(0, 10) : "",
        );
      },
      (error) => {
        console.error("Error fetching late-fees config:", error);
      },
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to bookings and compute overdue terms with no notice sent yet
  useEffect(() => {
    const bookingsRef = collection(db, "bookings");
    const bookingsQuery = lateFeesEffectiveDate
      ? query(
          bookingsRef,
          where(
            "reservationDate",
            ">=",
            Timestamp.fromDate(new Date(`${lateFeesEffectiveDate}T00:00:00`)),
          ),
        )
      : query(bookingsRef);

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const now = new Date();
        const effectiveDateStart = lateFeesEffectiveDate
          ? new Date(`${lateFeesEffectiveDate}T00:00:00`)
          : null;

        let count = 0;

        snapshot.docs.forEach((bookingDoc) => {
          const booking = bookingDoc.data() as Record<string, any>;
          const reservationDate = asDate(booking.reservationDate);
          if (
            effectiveDateStart &&
            (!reservationDate ||
              reservationDate.getTime() < effectiveDateStart.getTime())
          ) {
            return;
          }

          ["p1", "p2", "p3", "p4"].forEach((termKey, index) => {
            const dueDate = parseTermDueDate(
              booking[`${termKey}DueDate`],
              index,
            );
            const datePaid = asDate(booking[`${termKey}DatePaid`]);
            const noticeLink = String(
              booking[`${termKey}LateFeesNoticeLink`] || "",
            ).trim();

            const hasOverdueUnpaid =
              !!dueDate && !datePaid && dueDate.getTime() < now.getTime();

            if (hasOverdueUnpaid && !noticeLink) {
              count += 1;
            }
          });
        });

        setLateFeesPendingCount(count);
      },
      (error) => {
        console.error("Error fetching late-fees pending count:", error);
      },
    );

    return () => unsubscribe();
  }, [lateFeesEffectiveDate]);

  // Initialize tab from URL parameters
  useEffect(() => {
    const urlTab = searchParams?.get("tab") ?? null;
    const initialTab = urlToInternalTab(urlTab);
    setActiveTab(initialTab);

    // If no tab parameter or invalid tab, update URL to show default
    if (!urlTab || urlTab !== internalTabToUrl(initialTab)) {
      const newSearchParams = new URLSearchParams(
        searchParams?.toString() ?? "",
      );
      newSearchParams.set("tab", internalTabToUrl(initialTab));
      router.replace(`/bookings?${newSearchParams.toString()}`);
    }
  }, [searchParams, router]);

  // Handle tab changes
  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    const newSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
    newSearchParams.set("tab", internalTabToUrl(newTab));
    router.push(`/bookings?${newSearchParams.toString()}`);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground font-hk-grotesk">
            Bookings
          </h1>
          <p className="text-muted-foreground text-sm md:text-lg">
            Manage all bookings and reservations
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        {/* Mobile: Dropdown Select */}
        <div className="md:hidden">
          <Select value={activeTab} onValueChange={handleTabChange}>
            <SelectTrigger className="w-full h-12 bg-card/80 backdrop-blur-sm border-royal-purple/20 dark:border-border rounded-xl shadow-sm hover:shadow-md hover:border-royal-purple/40 transition-all duration-200 font-medium">
              <SelectValue>
                {activeTab === "list" && (
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    Bookings
                  </span>
                )}
                {activeTab === "guest-invitations" && (
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    Guest Invitations
                    {unsentGuestInvitationsCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 px-1.5 text-xs shadow-sm"
                      >
                        {unsentGuestInvitationsCount}
                      </Badge>
                    )}
                  </span>
                )}
                {activeTab === "confirmed" && (
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    Confirmed Bookings
                    {unsentCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 px-1.5 text-xs shadow-sm"
                      >
                        {unsentCount}
                      </Badge>
                    )}
                  </span>
                )}
                {activeTab === "late-fees" && (
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    Late Fees
                    {lateFeesPendingCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 px-1.5 text-xs shadow-sm"
                      >
                        {lateFeesPendingCount}
                      </Badge>
                    )}
                  </span>
                )}
                {activeTab === "sheet" && (
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    Bookings Sheet
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-royal-purple/20 dark:border-border shadow-lg">
              <SelectItem
                value="list"
                className="rounded-lg hover:bg-royal-purple/10 focus:bg-royal-purple/10 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {activeTab === "list" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  )}
                  Bookings
                </span>
              </SelectItem>
              <SelectItem
                value="guest-invitations"
                className="rounded-lg hover:bg-royal-purple/10 focus:bg-royal-purple/10 cursor-pointer"
              >
                <span className="flex items-center justify-between w-full gap-2">
                  <span className="flex items-center gap-2">
                    {activeTab === "guest-invitations" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    )}
                    Guest Invitations
                  </span>
                  {unsentGuestInvitationsCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-2 h-5 min-w-5 px-1.5 text-xs shadow-sm"
                    >
                      {unsentGuestInvitationsCount}
                    </Badge>
                  )}
                </span>
              </SelectItem>
              <SelectItem
                value="confirmed"
                className="rounded-lg hover:bg-royal-purple/10 focus:bg-royal-purple/10 cursor-pointer"
              >
                <span className="flex items-center justify-between w-full gap-2">
                  <span className="flex items-center gap-2">
                    {activeTab === "confirmed" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    )}
                    Confirmed Bookings
                  </span>
                  {unsentCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-2 h-5 min-w-5 px-1.5 text-xs shadow-sm"
                    >
                      {unsentCount}
                    </Badge>
                  )}
                </span>
              </SelectItem>
              <SelectItem
                value="late-fees"
                className="rounded-lg hover:bg-royal-purple/10 focus:bg-royal-purple/10 cursor-pointer"
              >
                <span className="flex items-center justify-between w-full gap-2">
                  <span className="flex items-center gap-2">
                    {activeTab === "late-fees" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    )}
                    Late Fees
                  </span>
                  {lateFeesPendingCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-2 h-5 min-w-5 px-1.5 text-xs shadow-sm"
                    >
                      {lateFeesPendingCount}
                    </Badge>
                  )}
                </span>
              </SelectItem>
              <SelectItem
                value="sheet"
                className="rounded-lg hover:bg-royal-purple/10 focus:bg-royal-purple/10 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {activeTab === "sheet" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  )}
                  Bookings Sheet
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: Horizontal Tabs */}
        <TabsList className="hidden md:grid w-full grid-cols-5 bg-muted border border-border">
          <TabsTrigger
            value="list"
            className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow transition-all duration-200"
          >
            Bookings
          </TabsTrigger>
          <TabsTrigger
            value="guest-invitations"
            className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow transition-all duration-200"
          >
            <span>Guest Invitations</span>
            {unsentGuestInvitationsCount > 0 && (
              <Badge
                variant="destructive"
                className="ml-2 h-5 min-w-5 px-1.5 text-xs"
              >
                {unsentGuestInvitationsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="confirmed"
            className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow transition-all duration-200"
          >
            <span>Confirmed Bookings</span>
            {unsentCount > 0 && (
              <Badge
                variant="destructive"
                className="ml-2 h-5 min-w-5 px-1.5 text-xs"
              >
                {unsentCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="late-fees"
            className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow transition-all duration-200"
          >
            <span>Late Fees</span>
            {lateFeesPendingCount > 0 && (
              <Badge
                variant="destructive"
                className="ml-2 h-5 min-w-5 px-1.5 text-xs"
              >
                {lateFeesPendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="sheet"
            className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow transition-all duration-200"
          >
            Bookings Sheet
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <BookingsSection />
        </TabsContent>

        <TabsContent value="confirmed" className="mt-6">
          <div className="space-y-6">
            <PreDeparturePackSection />
            <ConfirmedBookingsSection />
          </div>
        </TabsContent>

        <TabsContent value="guest-invitations" className="mt-6">
          <GuestInvitationsSection />
        </TabsContent>

        <TabsContent value="late-fees" className="mt-6">
          <LateFeesSection />
        </TabsContent>

        <TabsContent value="sheet" className="mt-6">
          <BookingsSheet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
