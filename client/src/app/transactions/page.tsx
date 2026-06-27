"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  Search,
  Download,
  Settings2,
  Filter,
  Plus,
  MoreHorizontal,
  Clock,
  AlertCircle,
  ExternalLink,
  LayoutGrid,
  CreditCard,
  Wallet,
  Hourglass,
  ArrowUpRight,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaymentDetailsDialog } from "@/components/transactions/PaymentDetailsDialog";
import { RefundDialogs } from "@/components/transactions/RefundDialogs";

import {
  TransactionFilterDialog,
  FilterConfig,
} from "@/components/transactions/TransactionFilterDialog";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import {
  toCsv,
  downloadCsv,
  formatCsvDate,
  csvDateStamp,
  type CsvColumn,
} from "@/lib/csv-export";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface Transaction {
  id: string;
  payment: {
    amount: number;
    currency: string;
    status: string;
    checkoutSessionId: string;
    type?: string;
    installmentTerm?: string;
    clientSecret?: string;
    paymentIntentId?: string;
    stripePaymentIntentId?: string;
    stripeIntentId?: string;
  };
  stripePaymentIntentId?: string;
  stripeIntentId?: string;
  customer?: {
    email: string;
    firstName: string;
    lastName: string;
    whatsAppNumber?: string;
  };
  booking?: {
    id: string; // Booking ID (e.g. SB-TXP...)
    documentId: string;
  };
  tour?: {
    packageName: string;
  };
  timestamps: {
    createdAt: { seconds: number; nanoseconds: number } | string;
    paidAt?: { seconds: number; nanoseconds: number } | string;
    updatedAt?: { seconds: number; nanoseconds: number } | string;
    confirmedAt?: { seconds: number; nanoseconds: number } | string;
  };
}

export default function TransactionsPage() {
  const [data, setData] = useState<Transaction[]>([]);
  const [stats, setStats] = useState({
    all: 0,
    reservationFee: 0,
    installment: 0,
    pending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const { toast } = useToast();
  const router = useRouter();

  // State for actions
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] =
    useState<Transaction | null>(null);
  const [transactionToRefund, setTransactionToRefund] =
    useState<Transaction | null>(null);
  const [refundedBookingId, setRefundedBookingId] = useState<string | null>(
    null,
  );
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);
  const [refundSuccessOpen, setRefundSuccessOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefunding, setIsRefunding] = useState<string | null>(null);

  // Filter State
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterConfig[]>([]);
  const [activeMethodFilter, setActiveMethodFilter] = useState<
    "all" | "stripe"
  >("all");
  const [hideCancelled, setHideCancelled] = useState(true);

  // CSV export filtered by selected payment status
  const [isExporting, setIsExporting] = useState(false);

  const PENDING_STATUSES = [
    "pending",
    "reserve_pending",
    "reservation_pending",
    "installment_pending",
  ];

  // Distinct payment statuses present in the loaded transactions.
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    data.forEach((t) => {
      if (t.payment?.status) set.add(t.payment.status);
    });
    return Array.from(set).sort();
  }, [data]);

  // Statuses selected in the export settings popover (defaults to pending).
  const [exportStatuses, setExportStatuses] = useState<string[]>([
    ...PENDING_STATUSES,
  ]);

  const formatStatusLabel = (status: string) =>
    status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const toggleExportStatus = (status: string) => {
    setExportStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

  const handleExportFiltered = async () => {
    setIsExporting(true);
    try {
      const selected = data.filter((t) =>
        exportStatuses.includes(t.payment?.status),
      );

      if (selected.length === 0) {
        toast({
          title: "Nothing to export",
          description: "No transactions match the selected status.",
        });
        return;
      }

      // WhatsApp number is stored on the payment document's customer object.
      // Installment payments may not carry it, so build a fallback map keyed
      // by booking id from any transaction that does have it.
      const whatsAppByBookingId = new Map<string, string>();
      data.forEach((t) => {
        const num = t.customer?.whatsAppNumber;
        const bookingId = t.booking?.id;
        if (num && bookingId && !whatsAppByBookingId.has(bookingId)) {
          whatsAppByBookingId.set(bookingId, num);
        }
      });

      const columns: CsvColumn<Transaction>[] = [
        { header: "Email Address", value: (t) => t.customer?.email || "" },
        {
          header: "Contact Number",
          value: (t) =>
            t.customer?.whatsAppNumber ||
            (t.booking?.id && whatsAppByBookingId.get(t.booking.id)) ||
            "",
        },
        {
          header: "Customer Name",
          value: (t) =>
            [t.customer?.firstName, t.customer?.lastName]
              .filter(Boolean)
              .join(" "),
        },
        { header: "Status", value: (t) => t.payment?.status || "" },
        { header: "Type", value: (t) => getTypeLabel(t) },
        {
          header: "Amount",
          value: (t) =>
            t.payment?.amount !== undefined ? t.payment.amount.toFixed(2) : "",
        },
        {
          header: "Currency",
          value: (t) => (t.payment?.currency || "").toUpperCase(),
        },
        { header: "Tour Package", value: (t) => t.tour?.packageName || "" },
        { header: "Booking ID", value: (t) => t.booking?.id || "" },
        { header: "Date", value: (t) => formatCsvDate(getDate(t)) },
        { header: "Transaction Doc ID", value: (t) => t.id },
      ];

      const csv = toCsv(selected, columns);
      downloadCsv(`transactions-${csvDateStamp()}.csv`, csv);

      toast({
        title: "Export complete",
        description: `Exported ${selected.length} transaction${
          selected.length === 1 ? "" : "s"
        }.`,
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "Export failed",
        description: "Could not export transactions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    // Set up realtime listener for transactions
    const paymentsRef = collection(db, "stripePayments");
    const q = query(paymentsRef, orderBy("timestamps.createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const payments = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Transaction[];

        setData(payments);

        // Calculate stats in realtime
        const calculatedStats = {
          all: payments.length,
          reservationFee: payments.filter(
            (p: any) => p.payment?.type === "reservationFee",
          ).length,
          installment: payments.filter(
            (p: any) => p.payment?.type === "installment",
          ).length,
          pending: payments.filter((p: any) =>
            [
              "pending",
              "reserve_pending",
              "reservation_pending",
              "installment_pending",
            ].includes(p.payment?.status),
          ).length,
        };

        setStats((prev) => ({ ...prev, ...calculatedStats }));
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to transactions:", error);
        toast({
          title: "Connection Error",
          description:
            "Failed to connect to realtime updates. Please refresh the page.",
          variant: "destructive",
        });
        setLoading(false);
      },
    );

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, [toast]);

  const handleDelete = async () => {
    if (!transactionToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/transactions/${transactionToDelete.id}`,
        {
          method: "DELETE",
        },
      );
      const result = await response.json();

      if (result.success) {
        // No need to manually update state - realtime listener will handle it
        setDeleteDialogOpen(false);
        setTransactionToDelete(null);
        toast({
          title: "Transaction Deleted",
          description: "The transaction has been successfully deleted.",
        });
      } else {
        console.error("Failed to delete:", result.error);
        toast({
          title: "Delete Failed",
          description: result.error || "Failed to delete transaction",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast({
        title: "Error",
        description: "Error deleting transaction",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRefund = async () => {
    if (!transactionToRefund) return;

    setRefundConfirmOpen(false);
    setIsRefunding(transactionToRefund.id);

    try {
      const response = await fetch("/api/stripe-payments/refund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentDocId: transactionToRefund.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process refund");
      }

      // Store booking ID and payment intent ID for success dialog
      setRefundedBookingId(transactionToRefund.booking?.documentId || null);
      setPaymentIntentId(data.paymentIntentId || null);

      // Show success dialog
      setRefundSuccessOpen(true);
    } catch (error: any) {
      console.error("Refund error:", error);
      toast({
        title: "❌ Refund Failed",
        description:
          error.message || "Failed to process the refund. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefunding(null);
    }
  };

  const handleNavigateToBooking = () => {
    if (refundedBookingId) {
      router.push(`/bookings?tab=bookings&bookingId=${refundedBookingId}`);
      setRefundSuccessOpen(false);
    }
  };

  const handleCloseRefundSuccess = () => {
    setRefundSuccessOpen(false);
    setTransactionToRefund(null);
    setRefundedBookingId(null);
    // Realtime listener will automatically update the data
  };

  const canRefund = (status: string) => {
    return [
      "succeeded",
      "reserve_paid",
      "reservation_paid",
      "terms_selected",
    ].includes(status);
  };

  const statusMap: Record<string, { label: string; color: string; icon: any }> =
    {
      succeeded: {
        label: "Succeeded",
        color: "bg-emerald-100 text-emerald-800",
        icon: CheckCircle2,
      },
      installment_paid: {
        label: "Paid",
        color: "bg-emerald-100 text-emerald-800",
        icon: CheckCircle2,
      },
      reserve_paid: {
        label: "Paid",
        color: "bg-emerald-100 text-emerald-800",
        icon: CheckCircle2,
      },
      reservation_paid: {
        label: "Paid",
        color: "bg-emerald-100 text-emerald-800",
        icon: CheckCircle2,
      },
      terms_selected: {
        label: "Paid",
        color: "bg-emerald-100 text-emerald-800",
        icon: CheckCircle2,
      },
      reservation_pending: {
        label: "Pending",
        color: "bg-amber-100 text-amber-800",
        icon: Clock,
      },
      failed: {
        label: "Failed",
        color: "bg-rose-100 text-rose-800",
        icon: AlertCircle,
      },
      pending: {
        label: "Pending",
        color: "bg-amber-100 text-amber-800",
        icon: Clock,
      },
      installment_pending: {
        label: "Pending",
        color: "bg-amber-100 text-amber-800",
        icon: Clock,
      },
      cancelled: {
        label: "Cancelled",
        color: "bg-red-100 text-red-800",
        icon: AlertCircle,
      },
      refunded: {
        label: "Refunded",
        color: "bg-muted text-muted-foreground",
        icon: RefreshCcw,
      },
      approved: {
        label: "Approved",
        color: "bg-emerald-100 text-emerald-800",
        icon: CheckCircle2,
      },
      rejected: {
        label: "Rejected",
        color: "bg-rose-100 text-rose-800",
        icon: XCircle,
      },
    };

  const getStatusBadge = (status: string) => {
    const config = statusMap[status] || statusMap["pending"];
    const Icon = config.icon;

    return (
      <Badge
        className={`${config.color} border-0 flex items-center gap-1 w-fit rounded-md px-2 py-0.5`}
      >
        {config.label} <Icon className="h-3 w-3" />
      </Badge>
    );
  };

  const getTypeLabel = (t: Transaction) => {
    if (t.payment.type === "reservationFee") {
      return "Reservation Fee";
    }
    if (t.payment.type === "installment" && t.payment.installmentTerm) {
      if (t.payment.installmentTerm === "full_payment") return "Full Payment";
      return `${t.payment.installmentTerm.toUpperCase()} - Installment`;
    }
    return t.payment.type || "Payment";
  };

  const getCurrencySymbol = (currency: string) => {
    const map: Record<string, string> = {
      gbp: "£",
      usd: "$",
      eur: "€",
      php: "₱",
    };
    return map[currency.toLowerCase()] || currency.toUpperCase();
  };

  const getDate = (t: Transaction) => {
    return (
      t.timestamps.updatedAt ||
      t.timestamps.confirmedAt ||
      t.timestamps.createdAt
    );
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "—";

    // Handle Firestore timestamp object
    if (timestamp.seconds) {
      // Use toDate() if available, otherwise construct Date from seconds
      const date =
        typeof timestamp.toDate === "function"
          ? timestamp.toDate()
          : new Date(timestamp.seconds * 1000);
      return format(date, "MMM dd, h:mm a");
    }

    // Handle string ISO date
    if (typeof timestamp === "string") {
      return format(new Date(timestamp), "MMM dd, h:mm a");
    }

    return "—";
  };

  const getNestedValue = (obj: any, path: string) => {
    return path.split(".").reduce((acc, part) => acc && acc[part], obj);
  };

  // Combine Stripe transactions for the table.
  const initialCombinedData = data.map((t) => ({
    type: "stripe" as const,
    data: t,
  }));

  const hasExplicitCancelledStatusFilter = activeFilters.some((filter) => {
    if (filter.field !== "payment.status") return false;
    const value = String(filter.value || "").toLowerCase();
    const value2 = String(filter.value2 || "").toLowerCase();
    return value === "cancelled" || value2 === "cancelled";
  });

  const processedData = initialCombinedData.filter((item) => {
    // 1. Tab Filter
    let tabMatch = true;
    const paymentStatus = item.data.payment.status;
    const paymentType = item.data.payment.type;

    if (activeTab === "Reservation Fee") {
      tabMatch = paymentType === "reservationFee";
    } else if (activeTab === "Installment") {
      tabMatch = paymentType === "installment";
    } else if (activeTab === "Pending") {
      tabMatch = [
        "pending",
        "reserve_pending",
        "reservation_pending",
        "installment_pending",
      ].includes(paymentStatus);
    }

    if (!tabMatch) return false;

    if (activeMethodFilter !== "all" && item.type !== activeMethodFilter) {
      return false;
    }

    // Hide cancelled transactions when toggle is enabled,
    // unless user explicitly asks for cancelled in advanced filters
    if (hideCancelled && !hasExplicitCancelledStatusFilter) {
      const normalizedStatus = String(paymentStatus || "").toLowerCase();
      if (normalizedStatus === "cancelled") {
        return false;
      }
    }

    // 2. Text Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      let match = false;

      const t = item.data;
      match = Boolean(
        t.customer?.email?.toLowerCase().includes(q) ||
        t.payment.amount.toString().includes(q) ||
        t.payment.currency.toLowerCase().includes(q) ||
        t.tour?.packageName?.toLowerCase().includes(q) ||
        t.payment.installmentTerm?.toLowerCase().includes(q),
      );

      if (!match) return false;
    }

    // 3. Advanced Filters
    if (activeFilters.length > 0) {
      const filterMatch = activeFilters.every((filter) => {
        let value: any;

        if (filter.field === "type") {
          value = item.type;
        } else {
          value = getNestedValue(item.data, filter.field);
        }

        // Handle Dates
        if (filter.field.includes("timestamps") && value) {
          if (typeof value === "object" && "seconds" in value) {
            value = new Date(value.seconds * 1000).getTime();
          } else if (typeof value === "string") {
            value = new Date(value).getTime();
          }

          const filterTime = filter.value
            ? new Date(filter.value).getTime()
            : 0;
          const filterTime2 = filter.value2
            ? new Date(filter.value2).getTime()
            : 0;

          switch (filter.operator) {
            case "eq":
              return (
                new Date(value).toDateString() ===
                new Date(filterTime).toDateString()
              );
            case "neq":
              return (
                new Date(value).toDateString() !==
                new Date(filterTime).toDateString()
              );
            case "gt":
              return value > filterTime;
            case "gte":
              return value >= filterTime;
            case "lt":
              return value < filterTime;
            case "lte":
              return value <= filterTime;
            case "between":
              return value >= filterTime && value <= filterTime2;
            default:
              return true;
          }
        }

        const filterValue = filter.value;
        const filterValue2 = filter.value2;

        switch (filter.operator) {
          case "eq":
            return (
              String(value).toLowerCase() === String(filterValue).toLowerCase()
            );
          case "neq":
            return (
              String(value).toLowerCase() !== String(filterValue).toLowerCase()
            );
          case "contains":
            if (!value) return false;
            return String(value)
              .toLowerCase()
              .includes(String(filterValue).toLowerCase());
          case "gt":
            return Number(value) > Number(filterValue);
          case "gte":
            return Number(value) >= Number(filterValue);
          case "lt":
            return Number(value) < Number(filterValue);
          case "lte":
            return Number(value) <= Number(filterValue);
          case "between":
            return (
              Number(value) >= Number(filterValue) &&
              Number(value) <= Number(filterValue2)
            );
          default:
            return true;
        }
      });
      if (!filterMatch) return false;
    }

    return true;
  });

  const combinedData = processedData.sort((a, b) => {
    const getTimestampValue = (timestamp: any): number => {
      if (!timestamp) return 0;
      if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
      if (timestamp.seconds) return timestamp.seconds * 1000;
      if (typeof timestamp === "string") return new Date(timestamp).getTime();
      if (timestamp instanceof Date) return timestamp.getTime();
      return 0;
    };

    const timeA = getTimestampValue(getDate(a.data as Transaction));
    const timeB = getTimestampValue(getDate(b.data as Transaction));

    return timeB - timeA; // Sort descending (newest first)
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-hk-grotesk">
              Transactions
            </h1>
            <p className="text-muted-foreground">
              View all Reservation and Installment transactions.
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="border-border">
                  <CardContent className="p-5 flex justify-between items-start">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                    <Skeleton className="h-12 w-12 rounded-xl" />
                  </CardContent>
                </Card>
              ))
            : [
                {
                  label: "All Transactions",
                  value: stats.all,
                  active: activeTab === "All",
                  onClick: () => setActiveTab("All"),
                  icon: LayoutGrid,
                  bgColor: "bg-blue-100",
                },
                {
                  label: "Reservation Fee",
                  value: stats.reservationFee,
                  active: activeTab === "Reservation Fee",
                  onClick: () => setActiveTab("Reservation Fee"),
                  icon: CreditCard,
                  bgColor: "bg-violet-100",
                },
                {
                  label: "Installment",
                  value: stats.installment,
                  active: activeTab === "Installment",
                  onClick: () => setActiveTab("Installment"),
                  icon: Wallet,
                  bgColor: "bg-emerald-100",
                },
                {
                  label: "Pending",
                  value: stats.pending,
                  active: activeTab === "Pending",
                  onClick: () => setActiveTab("Pending"),
                  icon: Hourglass,
                  bgColor: "bg-amber-100",
                },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card
                    key={stat.label}
                    className={`cursor-pointer transition-all duration-200 hover:shadow-md border-border overflow-hidden relative ${
                      stat.active
                        ? "ring-2 ring-primary ring-offset-1"
                        : "bg-card"
                    }`}
                    onClick={stat.onClick}
                  >
                    <CardContent className="p-5 flex justify-between items-start">
                      <div className="space-y-2 z-10">
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          {stat.label}
                        </p>
                        <div className="text-3xl font-bold font-hk-grotesk text-foreground">
                          {stat.value}
                        </div>
                      </div>
                      <div
                        className={`p-4 rounded-full rounded-br-none ${stat.bgColor}`}
                      >
                        <Icon className="h-6 w-6 text-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>

        {/* Filters Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden sm:flex items-center p-1 bg-muted rounded-lg border border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveMethodFilter("all")}
                className={`h-7 px-3 text-xs rounded-md font-medium transition-all ${
                  activeMethodFilter === "all"
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                }`}
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveMethodFilter("stripe")}
                className={`h-7 px-3 text-xs rounded-md font-medium transition-all ${
                  activeMethodFilter === "stripe"
                    ? "bg-background text-indigo-700 dark:text-indigo-300 shadow-sm border border-border"
                    : "text-muted-foreground hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-background/80"
                }`}
              >
                Stripe
              </Button>
            </div>

            <div className="flex items-center gap-3 bg-muted/50 px-4 py-2 rounded-lg border border-border">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <Label
                  htmlFor="hide-cancelled"
                  className="text-sm font-medium cursor-pointer whitespace-nowrap"
                >
                  Hide Cancelled
                </Label>
              </div>
              <Switch
                id="hide-cancelled"
                checked={hideCancelled}
                onCheckedChange={(checked) => setHideCancelled(checked)}
              />
            </div>

            <Button
              variant="outline"
              className={`bg-background gap-2 text-sm font-normal text-muted-foreground ${activeFilters.length > 0 ? "border-primary text-primary bg-primary/5" : ""}`}
              onClick={() => setFilterDialogOpen(true)}
            >
              <Filter className="h-3 w-3" />
              Filters
              {activeFilters.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1.5 bg-primary/10 text-primary hover:bg-primary/20"
                >
                  {activeFilters.length}
                </Badge>
              )}
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-background gap-2 text-sm font-normal text-muted-foreground hover:bg-amber-500/10 hover:border-amber-500 hover:text-amber-600"
                  disabled={loading}
                  title="Export transactions to CSV"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      Export settings
                    </p>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        setExportStatuses(
                          exportStatuses.length === availableStatuses.length
                            ? []
                            : [...availableStatuses],
                        )
                      }
                    >
                      {exportStatuses.length === availableStatuses.length
                        ? "Clear all"
                        : "Select all"}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Filter by status
                  </p>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {availableStatuses.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No transactions loaded.
                      </p>
                    ) : (
                      availableStatuses.map((status) => (
                        <label
                          key={status}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={exportStatuses.includes(status)}
                            onCheckedChange={() => toggleExportStatus(status)}
                          />
                          <span>{formatStatusLabel(status)}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={handleExportFiltered}
                    disabled={
                      isExporting || loading || exportStatuses.length === 0
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isExporting ? "Exporting..." : "Export CSV"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden flex flex-col">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pb-2">
            <Table className="min-w-[1100px]">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-6">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  {activeTab === "All" && <TableHead>Method</TableHead>}
                  <TableHead>Tour</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="min-w-[180px]">Booking ID</TableHead>
                  <TableHead className="w-16 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 15 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-6">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20 rounded-md" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8 rounded-md" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : combinedData.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={activeTab === "All" ? 9 : 8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  combinedData.map((item) => {
                    const t = item.data as Transaction;
                      return (
                        <TableRow
                          key={t.id}
                          className="hover:bg-muted/50 transition-colors"
                        >
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-1 font-medium font-hk-grotesk text-foreground">
                              <span className="text-muted-foreground">
                                {getCurrencySymbol(t.payment.currency || "GBP")}
                              </span>
                              <span>
                                {t.payment.amount !== undefined
                                  ? t.payment.amount.toFixed(2)
                                  : "—"}
                              </span>
                              <span className="text-xs text-muted-foreground uppercase ml-1">
                                {t.payment.currency || "GBP"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(t.payment.status)}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium text-foreground whitespace-nowrap">
                              {getTypeLabel(t)}
                            </span>
                          </TableCell>
                          {activeTab === "All" && (
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-xs font-medium border-blue-200 text-blue-700 bg-blue-50 whitespace-nowrap"
                              >
                                <CreditCard className="h-3 w-3 mr-1" />
                                Stripe
                              </Badge>
                            </TableCell>
                          )}
                          <TableCell>
                            <span className="text-sm text-foreground whitespace-nowrap">
                              {t.tour?.packageName || "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground hover:text-primary cursor-pointer hover:underline transition-colors whitespace-nowrap">
                              {t.customer?.email || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(getDate(t))}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">
                                {t.booking?.id || "—"}
                              </span>
                              {t.booking?.documentId && (
                                <Link
                                  href={`/bookings?tab=bookings&bookingId=${t.booking.documentId}`}
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                  title="View Booking"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Link>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedTransaction(t);
                                    setViewDialogOpen(true);
                                  }}
                                >
                                  View details
                                </DropdownMenuItem>
                                {canRefund(t.payment.status) && (
                                  <DropdownMenuItem
                                    className="text-orange-600 focus:text-orange-600 focus:bg-orange-50"
                                    onClick={() => {
                                      setTransactionToRefund(t);
                                      setRefundConfirmOpen(true);
                                    }}
                                    disabled={isRefunding === t.id}
                                  >
                                    {isRefunding === t.id
                                      ? "Processing..."
                                      : "Issue refund"}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                  onClick={() => {
                                    setTransactionToDelete(t);
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  Delete record
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-border px-4 py-3 bg-muted/50 flex items-center justify-between text-sm text-muted-foreground">
            <div>
              Viewing {combinedData.length > 0 ? 1 : 0}-{combinedData.length} of{" "}
              {data.length} items
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* View Details Dialog */}
      <PaymentDetailsDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        transaction={selectedTransaction}
      />

      {/* Filter Dialog */}
      <TransactionFilterDialog
        open={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
        onApplyFilters={setActiveFilters}
        activeFilters={activeFilters}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              transaction record for
              <span className="font-medium text-foreground">
                {" "}
                {transactionToDelete?.id}
              </span>
              .
            </AlertDialogDescription>
            {transactionToDelete && (
              <div className="mt-2 text-sm bg-muted p-2 rounded">
                <p>
                  <strong>Amount:</strong>{" "}
                  {getCurrencySymbol(transactionToDelete.payment.currency)}
                  {transactionToDelete.payment.amount}
                </p>
                <p>
                  <strong>Email:</strong> {transactionToDelete.customer?.email}
                </p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RefundDialogs
        transaction={transactionToRefund}
        confirmOpen={refundConfirmOpen}
        successOpen={refundSuccessOpen}
        onConfirmChange={setRefundConfirmOpen}
        onSuccessChange={setRefundSuccessOpen}
        onConfirm={handleRefund}
        onNavigateToBooking={handleNavigateToBooking}
        onClose={handleCloseRefundSuccess}
        paymentIntentId={paymentIntentId}
      />
    </DashboardLayout>
  );
}
