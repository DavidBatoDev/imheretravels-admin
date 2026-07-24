"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FaUsers } from "react-icons/fa";
import { ExternalLink } from "lucide-react";
import type { Booking } from "@/types/bookings";
import { bookingService } from "@/services/booking-service";

const GROUP_BOOKING_TYPES = ["Duo Booking", "Group Booking"];

export function isPartyBooking(bookingType: unknown): boolean {
  return GROUP_BOOKING_TYPES.includes(String(bookingType));
}

interface PartyMember {
  id: string;
  fullName?: string;
  emailAddress?: string;
  bookingId?: string;
  isMainBooker?: boolean;
  paymentPlan?: string;
  availablePaymentTerms?: string;
  bookingStatus?: string;
  reservationFee?: number;
  paid?: number;
  originalTourCost?: number;
  discountedTourCost?: number;
  [key: string]: any;
}

function formatCurrency(amount: number | undefined): string {
  return `£${(Number(amount) || 0).toFixed(2)}`;
}

function memberTotalCost(member: PartyMember): number {
  return Number(member.discountedTourCost || member.originalTourCost || 0);
}

/**
 * Who else is on this booking, and who paid for it.
 *
 * On a Duo/Group booking the primary booker normally pays one reservation fee
 * covering everyone, so a guest's own booking shows a fee with no matching
 * transaction under their name. Without this card that has to be reconstructed
 * by hand from the transactions details modal.
 */
export default function TravelPartyCard({ booking }: { booking: Booking }) {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const groupId = booking?.groupId || "";

  useEffect(() => {
    let cancelled = false;

    if (!groupId) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    bookingService
      .getGroupMembers(groupId)
      .then((docs) => {
        if (!cancelled) setMembers(docs as PartyMember[]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (!isPartyBooking(booking?.bookingType)) return null;

  const mainBooker = members.find((m) => m.isMainBooker === true);
  const paidByName =
    booking.mainBookerName || mainBooker?.fullName || "the main booker";
  const reservationFeeTotal =
    mainBooker?.reservationFeePaidTotal ??
    booking.reservationFeePaidTotal ??
    // Fall back to summing the party's per-person split for bookings created
    // before the total was recorded.
    (members.length
      ? members.reduce((sum, m) => sum + (Number(m.reservationFee) || 0), 0)
      : undefined);
  const paymentDocId =
    booking.reservationPaymentDocId || mainBooker?.reservationPaymentDocId || "";
  const partySize = members.length || Number(booking.groupSize) || 0;

  return (
    <Card
      id="tab-Travel Party"
      className="bg-background shadow-sm border border-field-border scroll-mt-4"
    >
      <CardHeader className="py-2 sm:py-3 px-3 sm:px-4 bg-crimson-red/10 border-b border-crimson-red/20">
        <CardTitle className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5 sm:gap-2">
          <div className="p-0.5 sm:p-1 bg-crimson-red/10 rounded-full rounded-br-none">
            <FaUsers className="h-3 w-3 sm:h-4 sm:w-4 text-crimson-red" />
          </div>
          <span>Travel Party</span>
          {partySize > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] font-medium border-0 bg-crimson-red/10 text-foreground px-1.5 py-0 rounded-full"
            >
              {partySize} travellers
            </Badge>
          )}
          {groupId && (
            <span className="ml-auto text-[10px] sm:text-xs font-mono font-normal text-muted-foreground">
              {groupId}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 space-y-3">
        {/* Who paid the reservation fee — the question that started all this. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-sm bg-muted/40 rounded-md px-2.5 py-2">
          <span className="text-muted-foreground">Reservation fee</span>
          <span className="font-bold text-spring-green">
            {formatCurrency(reservationFeeTotal)}
          </span>
          <span className="text-muted-foreground">
            {booking.isMainBooker
              ? "paid by this traveller for the whole party"
              : booking.reservationFeePaidByMainBooker === false
                ? "paid by this traveller"
                : `paid by ${paidByName}`}
          </span>
          {paymentDocId && (
            <Link
              href={`/transactions?paymentId=${paymentDocId}`}
              className="ml-auto text-[10px] sm:text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              View transaction <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          )}
        </div>

        {!groupId ? (
          <p className="text-[11px] sm:text-sm text-muted-foreground">
            This booking has no Group ID, so its travel party cannot be
            resolved. Set the Group ID to the main booker&apos;s to link them.
          </p>
        ) : isLoading ? (
          <p className="text-[11px] sm:text-sm text-muted-foreground">
            Loading travel party…
          </p>
        ) : members.length === 0 ? (
          <p className="text-[11px] sm:text-sm text-muted-foreground">
            No other bookings share Group ID{" "}
            <span className="font-mono">{groupId}</span>.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {members.map((member) => {
              const total = memberTotalCost(member);
              const paid = Number(member.paid) || 0;
              const isCurrent = member.id === booking.id;

              return (
                <Link
                  key={member.id}
                  href={`/bookings?tab=bookings&bookingId=${member.id}`}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-1 rounded-sm transition-colors hover:bg-muted/50 ${
                    isCurrent ? "bg-crimson-red/5" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] sm:text-sm font-bold text-foreground truncate">
                        {member.fullName || "—"}
                      </span>
                      {member.isMainBooker && (
                        <Badge
                          variant="outline"
                          className="text-[9px] font-medium border-0 bg-amber-100 text-amber-800 px-1.5 py-0 rounded-full"
                        >
                          Main booker
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge
                          variant="outline"
                          className="text-[9px] font-medium border-0 bg-crimson-red/15 text-foreground px-1.5 py-0 rounded-full"
                        >
                          Viewing
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                      {member.emailAddress}
                      {member.bookingId ? ` · ${member.bookingId}` : ""}
                    </p>
                  </div>

                  <div className="text-right text-[10px] sm:text-xs">
                    <p className="text-muted-foreground">
                      {member.paymentPlan ||
                        member.availablePaymentTerms ||
                        "No plan"}
                    </p>
                    <p>
                      <span className="text-spring-green font-bold">
                        {formatCurrency(paid)}
                      </span>
                      <span className="text-muted-foreground"> paid · </span>
                      <span className="text-crimson-red font-bold">
                        {formatCurrency(total - paid)}
                      </span>
                      <span className="text-muted-foreground"> due</span>
                    </p>
                  </div>

                  <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
