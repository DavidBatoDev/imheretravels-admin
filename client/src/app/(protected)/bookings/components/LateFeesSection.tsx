"use client";

import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  getSchedulePolicy,
  type SchedulePolicy,
} from "@/lib/schedule-policy";
import type { Booking } from "@/types/bookings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Pencil, Save, X, Play } from "lucide-react";
import ScheduledEmailService from "@/services/scheduled-email-service";
import LateFeeNoticeComposerModal from "@/app/(protected)/bookings/components/LateFeeNoticeComposerModal";

type TermKey = "p1" | "p2" | "p3" | "p4";
type LateFeesSortKey =
  | "overdue-desc"
  | "overdue-asc"
  | "row-asc"
  | "row-desc"
  | "due-date-asc"
  | "due-date-desc"
  | "booking-asc"
  | "booking-desc";

interface LateFeeRow {
  rowId: string;
  rowNumber: number | string;
  bookingDocId: string;
  bookingCode: string;
  fullName: string;
  emailAddress: string;
  tourPackageName: string;
  term: string;
  termKey: TermKey;
  dueDate: Date | null;
  amount: number;
  penalty: number;
  remainingBalance: number;
  daysOverdue: number;
  hasOverdueUnpaid: boolean;
  isPaid: boolean;
  noticeStatus: "sent" | "none";
  noticeLink?: string;
  schedulePolicy: SchedulePolicy | null;
}

const TERM_KEYS: TermKey[] = ["p1", "p2", "p3", "p4"];

function asDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const parsed = value.toDate();
      return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : null;
    }

    if (typeof value.seconds === "number") {
      const parsed = new Date(value.seconds * 1000);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value._seconds === "number") {
      const parsed = new Date(value._seconds * 1000);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function parseTermDueDate(dueDateRaw: any, termIndex: number): Date | null {
  if (!dueDateRaw) return null;

  if (typeof dueDateRaw === "string" && dueDateRaw.includes(",")) {
    const parts = dueDateRaw.split(",").map((part) => part.trim());
    const partStart = termIndex * 2;
    const partEnd = partStart + 1;

    if (parts.length > partEnd) {
      return asDate(`${parts[partStart]}, ${parts[partEnd]}`);
    }
  }

  return asDate(dueDateRaw);
}

function formatGBP(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value || 0);
}

function formatDate(value: Date | null): string {
  if (!value) return "-";
  return value.toLocaleDateString("en-GB", { timeZone: "Asia/Manila" });
}

export default function LateFeesSection() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [quickSort, setQuickSort] = useState<LateFeesSortKey>("overdue-desc");
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [draftEffectiveDate, setDraftEffectiveDate] = useState("");
  const [isEditingEffectiveDate, setIsEditingEffectiveDate] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isProcessingNow, setIsProcessingNow] = useState(false);
  const [isProcessConfirmOpen, setIsProcessConfirmOpen] = useState(false);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [activeNoticeRow, setActiveNoticeRow] = useState<LateFeeRow | null>(
    null,
  );
  const [noticeRecipient, setNoticeRecipient] = useState("");
  const [noticeDraftSubject, setNoticeDraftSubject] = useState("");
  const [noticeDraftHtml, setNoticeDraftHtml] = useState("");
  const [isResendNoticeFlow, setIsResendNoticeFlow] = useState(false);
  const [isLoadingNoticePreview, setIsLoadingNoticePreview] = useState(false);
  const [isSendingNotice, setIsSendingNotice] = useState(false);
  const [waiveRow, setWaiveRow] = useState<LateFeeRow | null>(null);
  const [isWaiving, setIsWaiving] = useState(false);

  useEffect(() => {
    setQuickSort("overdue-desc");
  }, []);

  useEffect(() => {
    const lateFeesConfigRef = doc(db, "config", "late-fees");
    const unsubscribe = onSnapshot(
      lateFeesConfigRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const config = snapshot.data();
        const parsedDate = asDate(config.effectiveDate);
        if (parsedDate) {
          const isoDate = parsedDate.toISOString().slice(0, 10);
          setEffectiveDate(isoDate);
          if (!isEditingEffectiveDate) {
            setDraftEffectiveDate(isoDate);
          }
        }
      },
      (error) => {
        console.error("Failed to load late-fees config", error);
      },
    );

    return () => unsubscribe();
  }, [isEditingEffectiveDate]);

  useEffect(() => {
    const bookingsCollectionRef = collection(db, "bookings");
    const bookingsQuery = effectiveDate
      ? query(
          bookingsCollectionRef,
          where(
            "reservationDate",
            ">=",
            Timestamp.fromDate(new Date(`${effectiveDate}T00:00:00`)),
          ),
        )
      : query(bookingsCollectionRef);
    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const nextBookings = snapshot.docs.map((bookingDoc) => ({
          id: bookingDoc.id,
          ...bookingDoc.data(),
        })) as Booking[];
        nextBookings.sort((a, b) => {
          const aDate = asDate((a as any).reservationDate)?.getTime() || 0;
          const bDate = asDate((b as any).reservationDate)?.getTime() || 0;
          return bDate - aDate;
        });
        setBookings(nextBookings);
      },
      (error) => {
        console.error("Failed to load bookings for late fees tab", error);
        toast({
          title: "Error",
          description: "Failed to load bookings",
          variant: "destructive",
        });
      },
    );

    return () => unsubscribe();
  }, [effectiveDate]);

  const expandedRows = useMemo(() => {
    const now = new Date();
    const effectiveDateStart = effectiveDate
      ? new Date(`${effectiveDate}T00:00:00`)
      : null;
    const expandedRows: LateFeeRow[] = [];

    for (const booking of bookings) {
      const reservationDate = asDate((booking as any).reservationDate);
      if (
        effectiveDateStart &&
        (!reservationDate ||
          reservationDate.getTime() < effectiveDateStart.getTime())
      ) {
        continue;
      }

      for (let index = 0; index < TERM_KEYS.length; index++) {
        const termKey = TERM_KEYS[index];
        const termLabel = termKey.toUpperCase();
        const dueDate = parseTermDueDate(
          (booking as any)[`${termKey}DueDate`],
          index,
        );
        const amount = Number((booking as any)[`${termKey}Amount`] || 0);
        const datePaid = asDate((booking as any)[`${termKey}DatePaid`]);
        const isPaid = !!datePaid;
        const penalty = Number(
          (booking as any)[`${termKey}LateFeesPenalty`] || 0,
        );
        const noticeLink = String(
          (booking as any)[`${termKey}LateFeesNoticeLink`] || "",
        );

        const hasOverdueUnpaid =
          !!dueDate && !datePaid && dueDate.getTime() < now.getTime();

        const hasHistory = penalty > 0 || !!noticeLink;
        if (!hasOverdueUnpaid && !hasHistory) {
          continue;
        }

        const daysOverdue = dueDate
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
              ),
            )
          : 0;

        expandedRows.push({
          rowId: `${booking.id}-${termKey}`,
          rowNumber: Number((booking as any).row || 0),
          bookingDocId: booking.id,
          bookingCode: booking.bookingId || booking.bookingCode || booking.id,
          fullName: booking.fullName || "",
          emailAddress: booking.emailAddress || "",
          tourPackageName: booking.tourPackageName || "",
          term: termLabel,
          termKey,
          dueDate,
          amount,
          penalty,
          remainingBalance: Number(booking.remainingBalance || 0),
          daysOverdue,
          hasOverdueUnpaid,
          isPaid,
          noticeStatus: noticeLink ? "sent" : "none",
          noticeLink,
          schedulePolicy: getSchedulePolicy(reservationDate),
        });
      }
    }

    return expandedRows.sort((a, b) => {
      if (a.hasOverdueUnpaid !== b.hasOverdueUnpaid) {
        return a.hasOverdueUnpaid ? -1 : 1;
      }
      return b.daysOverdue - a.daysOverdue;
    });
  }, [bookings, effectiveDate]);

  const fuse = useMemo(() => {
    if (expandedRows.length === 0) return null;

    return new Fuse(expandedRows, {
      keys: [
        { name: "bookingCode", weight: 1.0 },
        { name: "fullName", weight: 0.9 },
        { name: "emailAddress", weight: 0.85 },
        { name: "tourPackageName", weight: 0.75 },
        { name: "term", weight: 0.7 },
      ],
      threshold: 0.3,
      includeScore: true,
      minMatchCharLength: 2,
    });
  }, [expandedRows]);

  const rows = useMemo(() => {
    let workingRows = expandedRows;

    if (searchTerm.trim()) {
      if (fuse) {
        workingRows = fuse.search(searchTerm).map((result) => result.item);
      } else {
        const lowered = searchTerm.toLowerCase();
        workingRows = expandedRows.filter((row) =>
          [
            row.bookingCode,
            row.fullName,
            row.emailAddress,
            row.tourPackageName,
            row.term,
          ]
            .join(" ")
            .toLowerCase()
            .includes(lowered),
        );
      }
    }

    const rowValue = (value: number | string): number => {
      if (typeof value === "number") return value;
      const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const sortedRows = [...workingRows];
    sortedRows.sort((a, b) => {
      switch (quickSort) {
        case "row-asc":
          return rowValue(a.rowNumber) - rowValue(b.rowNumber);
        case "row-desc":
          return rowValue(b.rowNumber) - rowValue(a.rowNumber);
        case "overdue-asc":
          return a.daysOverdue - b.daysOverdue;
        case "overdue-desc":
          return b.daysOverdue - a.daysOverdue;
        case "due-date-asc": {
          const aTime = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bTime = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        }
        case "due-date-desc": {
          const aTime = a.dueDate?.getTime() ?? 0;
          const bTime = b.dueDate?.getTime() ?? 0;
          return bTime - aTime;
        }
        case "booking-asc":
          return a.bookingCode.localeCompare(b.bookingCode);
        case "booking-desc":
          return b.bookingCode.localeCompare(a.bookingCode);
        default:
          return 0;
      }
    });

    return sortedRows;
  }, [expandedRows, searchTerm, fuse, quickSort]);

  const overdueWithoutNoticeCount = useMemo(
    () =>
      expandedRows.filter(
        (row) => row.hasOverdueUnpaid && row.noticeStatus === "none",
      ).length,
    [expandedRows],
  );

  const handleSaveEffectiveDate = async () => {
    if (!draftEffectiveDate) {
      toast({
        title: "Missing date",
        description: "Please select an effective date.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingConfig(true);
    try {
      const selectedDate = new Date(`${draftEffectiveDate}T00:00:00`);

      await setDoc(
        doc(db, "config", "late-fees"),
        {
          effectiveDate: Timestamp.fromDate(selectedDate),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

      toast({
        title: "Saved",
        description: "Late-fees effective date updated.",
      });
      setEffectiveDate(draftEffectiveDate);
      setIsEditingEffectiveDate(false);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to update late-fees effective date.",
        variant: "destructive",
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleStartEditEffectiveDate = () => {
    setDraftEffectiveDate(effectiveDate);
    setIsEditingEffectiveDate(true);
  };

  const handleCancelEditEffectiveDate = () => {
    setDraftEffectiveDate(effectiveDate);
    setIsEditingEffectiveDate(false);
  };

  const handleProcessNow = async () => {
    setIsProcessConfirmOpen(false);
    setIsProcessingNow(true);
    try {
      const result = await ScheduledEmailService.triggerLateFeesProcessing();
      toast({
        title: "Late Fees Processed",
        description: `${result.applied ?? 0} penalties applied, ${result.emailed ?? result.scheduled ?? 0} notices sent.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to process late fees now.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingNow(false);
    }
  };

  const handleOpenSendNoticeModal = async (
    row: LateFeeRow,
    options?: { resend?: boolean },
  ) => {
    const isResend = Boolean(options?.resend);

    if (row.isPaid && !isResend) {
      toast({
        title: "Already Paid",
        description: "This booker already paid this term.",
      });
      return;
    }

    setBusyRowId(row.rowId);
    setIsLoadingNoticePreview(true);
    try {
      const preview = await ScheduledEmailService.getLateFeeNoticePreview(
        row.bookingDocId,
        row.termKey,
        {
          resend: isResend,
        },
      );
      const fallbackHtml =
        "<p>Hi {{ fullName }}, a late fee has been applied to your payment term.</p>";
      setActiveNoticeRow(row);
      setIsResendNoticeFlow(isResend);
      setNoticeRecipient(preview.recipientEmail || row.emailAddress || "");
      setNoticeDraftSubject(preview.subject || "");
      setNoticeDraftHtml(
        typeof preview.htmlContent === "string" && preview.htmlContent.trim()
          ? preview.htmlContent
          : fallbackHtml
              .replace("{{ fullName }}", row.fullName || "Customer")
              .replace("payment term", row.term),
      );
      setIsNoticeModalOpen(true);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message.toLowerCase() : "";

      if (
        message.includes("not eligible") ||
        message.includes("already paid")
      ) {
        toast({
          title: "Already Paid",
          description: "This booker already paid this term.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to prepare late fee notice.",
          variant: "destructive",
        });
      }
    } finally {
      setBusyRowId(null);
      setIsLoadingNoticePreview(false);
    }
  };

  const handleSendNoticeFromModal = async (payload: {
    subject: string;
    htmlContent: string;
  }) => {
    if (!activeNoticeRow) return;

    setIsSendingNotice(true);
    try {
      const result = await ScheduledEmailService.sendLateFeeNotice(
        activeNoticeRow.bookingDocId,
        activeNoticeRow.termKey,
        {
          resend: isResendNoticeFlow,
          customSubject: payload.subject,
          customHtmlContent: payload.htmlContent,
        },
      );

      toast({
        title: "Notice Sent",
        description: result.appliedPenaltyNow
          ? `${activeNoticeRow.term} notice sent and penalty applied.`
          : `${activeNoticeRow.term} notice sent successfully.`,
      });

      setIsNoticeModalOpen(false);
      setActiveNoticeRow(null);
      setIsResendNoticeFlow(false);
      setNoticeRecipient("");
      setNoticeDraftSubject("");
      setNoticeDraftHtml("");
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to send late fee notice.",
        variant: "destructive",
      });
    } finally {
      setIsSendingNotice(false);
    }
  };

  const handleConfirmWaive = async () => {
    if (!waiveRow) return;

    setIsWaiving(true);
    try {
      await ScheduledEmailService.waiveLateFee(
        waiveRow.bookingDocId,
        waiveRow.termKey,
        { waivedBy: auth.currentUser?.email || undefined },
      );

      toast({
        title: "Late Fee Waived",
        description: `${waiveRow.term} late fee removed for ${waiveRow.bookingCode}.`,
      });
      setWaiveRow(null);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to waive late fee.",
        variant: "destructive",
      });
    } finally {
      setIsWaiving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Late Fees</h2>
          <Badge variant="destructive" className="h-6 px-2 text-xs">
            {overdueWithoutNoticeCount} overdue without notice
          </Badge>
        </div>
        <Button
          variant="destructive"
          onClick={() => setIsProcessConfirmOpen(true)}
          disabled={isProcessingNow}
          className="border-0"
        >
          <Play className="mr-2 h-4 w-4" />
          {isProcessingNow ? "Sending..." : "Send Notice to All Pending"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-md border bg-white p-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Late Fees Effective Date</p>
          <p className="text-xs text-muted-foreground">
            Late fee checks apply to bookings with reservation dates on or after
            this date.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          {isEditingEffectiveDate ? (
            <>
              <Button
                size="icon"
                onClick={handleSaveEffectiveDate}
                disabled={isSavingConfig}
                title="Save effective date"
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={handleCancelEditEffectiveDate}
                disabled={isSavingConfig}
                title="Cancel edit"
              >
                <X className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={draftEffectiveDate}
                onChange={(event) => setDraftEffectiveDate(event.target.value)}
                className="md:w-[220px]"
              />
            </>
          ) : (
            <>
              <div className="text-sm font-medium min-w-[160px]">
                {effectiveDate
                  ? formatDate(new Date(`${effectiveDate}T00:00:00`))
                  : "-"}
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={handleStartEditEffectiveDate}
                title="Edit effective date"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-md border bg-white p-3 md:flex-row md:items-end">
        <div className="flex-1">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search booking, customer, email, tour, or term..."
          />
        </div>
        <div className="w-full md:w-[280px] space-y-1">
          <label
            htmlFor="late-fees-sort"
            className="text-xs text-muted-foreground"
          >
            Sort by
          </label>
          <Select
            value={quickSort}
            onValueChange={(value) => setQuickSort(value as LateFeesSortKey)}
          >
            <SelectTrigger id="late-fees-sort">
              <SelectValue placeholder="Quick sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overdue-desc">
                Overdue Days (High to Low)
              </SelectItem>
              <SelectItem value="overdue-asc">
                Overdue Days (Low to High)
              </SelectItem>
              <SelectItem value="due-date-asc">Due Date (Earliest)</SelectItem>
              <SelectItem value="due-date-desc">Due Date (Latest)</SelectItem>
              <SelectItem value="row-asc">Row (Low to High)</SelectItem>
              <SelectItem value="row-desc">Row (High to Low)</SelectItem>
              <SelectItem value="booking-asc">Booking Code (A to Z)</SelectItem>
              <SelectItem value="booking-desc">
                Booking Code (Z to A)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border bg-white overflow-hidden flex flex-col">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pb-2">
          <Table className="min-w-[940px] text-sm">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-4 py-2 text-xs">Row</TableHead>
                <TableHead className="pl-4 py-2 text-xs">Booking</TableHead>
                <TableHead className="py-2 text-xs">Customer</TableHead>
                <TableHead className="py-2 text-xs">Term</TableHead>
                <TableHead className="py-2 text-xs">Due Date</TableHead>
                <TableHead className="py-2 text-xs">Amount</TableHead>
                <TableHead className="py-2 text-xs">Late Fee</TableHead>
                <TableHead className="py-2 text-xs">Overdue</TableHead>
                <TableHead className="py-2 text-xs">Notice</TableHead>
                <TableHead className="w-[260px] py-2 text-xs">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No late fee rows found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const isBusy = busyRowId === row.rowId;
                  return (
                    <TableRow
                      key={row.rowId}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="pl-4 py-2 font-medium">
                        {row.rowNumber || "-"}
                      </TableCell>
                      <TableCell className="pl-4 py-2 align-top">
                        <div className="font-medium">{row.bookingCode}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.tourPackageName}
                        </div>
                        {row.schedulePolicy && (
                          <Badge
                            variant="outline"
                            className={`mt-1 text-[10px] font-medium ${
                              row.schedulePolicy.key === "legacy"
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-gray-200 bg-gray-50 text-gray-600"
                            }`}
                            title={row.schedulePolicy.description}
                          >
                            {row.schedulePolicy.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2 align-top">
                        <div>{row.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.emailAddress}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 font-medium">
                        {row.term}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatDate(row.dueDate)}
                      </TableCell>
                      <TableCell className="py-2">
                        {formatGBP(row.amount)}
                      </TableCell>
                      <TableCell className="py-2">
                        {row.penalty > 0 ? (
                          formatGBP(row.penalty)
                        ) : (
                          <span className="font-medium text-amber-600">
                            {formatGBP(
                              Math.round(row.amount * 0.03 * 100) / 100,
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {row.hasOverdueUnpaid ? (
                          <Badge variant="destructive">
                            {row.daysOverdue} days
                          </Badge>
                        ) : row.isPaid ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border border-green-200">
                            Paid
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant={
                            row.noticeStatus === "sent"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {row.noticeStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {row.noticeStatus === "none" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3"
                              disabled={isBusy}
                              onClick={() => handleOpenSendNoticeModal(row)}
                            >
                              {isBusy && isLoadingNoticePreview
                                ? "Preparing..."
                                : "Send Notice"}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3"
                              disabled={isBusy}
                              onClick={() =>
                                handleOpenSendNoticeModal(row, {
                                  resend: true,
                                })
                              }
                            >
                              {isBusy && isLoadingNoticePreview
                                ? "Preparing..."
                                : "Resend Notice"}
                            </Button>
                          )}

                          {row.noticeLink ? (
                            <a
                              href={row.noticeLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              Open Notice
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              -
                            </span>
                          )}

                          {row.penalty > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 text-red-600 hover:text-red-700"
                              disabled={isBusy}
                              onClick={() => setWaiveRow(row)}
                            >
                              Waive
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog
        open={isProcessConfirmOpen}
        onOpenChange={setIsProcessConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send notices to all pending?</AlertDialogTitle>
            <AlertDialogDescription>
              This will process all eligible late fees and send notices for
              pending overdue terms based on the current late-fees rules and
              effective date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessingNow}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleProcessNow}
              disabled={isProcessingNow}
            >
              {isProcessingNow ? "Sending..." : "Send notice to all pending"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={waiveRow !== null}
        onOpenChange={(open) => {
          if (!open) setWaiveRow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Waive this late fee?</AlertDialogTitle>
            <AlertDialogDescription>
              {waiveRow
                ? `This removes the ${waiveRow.term} late fee (${formatGBP(
                    waiveRow.penalty,
                  )}) for ${waiveRow.bookingCode} — ${waiveRow.fullName}, restoring their balance. This action is logged.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWaiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmWaive} disabled={isWaiving}>
              {isWaiving ? "Waiving..." : "Waive late fee"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LateFeeNoticeComposerModal
        open={isNoticeModalOpen}
        onOpenChange={(open) => {
          setIsNoticeModalOpen(open);
          if (!open) {
            setActiveNoticeRow(null);
            setIsResendNoticeFlow(false);
            setNoticeRecipient("");
            setNoticeDraftSubject("");
            setNoticeDraftHtml("");
          }
        }}
        termLabel={activeNoticeRow?.term}
        recipient={noticeRecipient}
        initialSubject={noticeDraftSubject}
        initialHtmlContent={noticeDraftHtml}
        isSending={isSendingNotice}
        onSend={handleSendNoticeFromModal}
      />
    </div>
  );
}
