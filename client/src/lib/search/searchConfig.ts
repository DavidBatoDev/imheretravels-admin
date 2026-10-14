import {
  Calendar,
  MapPin,
  CreditCard,
  Mail,
  User,
  HardDrive,
  Tag,
  Bell,
} from "lucide-react";
import { CategoryConfig, SearchResult } from "@/types/search";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getTours } from "@/services/tours-service";
import { PaymentTermsService } from "@/services/payment-terms-service";
import { getAllBCCUsers } from "@/services/bcc-users-service";
import { EmailTemplateService } from "@/services/email-template-service";
import { DiscountEventsService } from "@/services/discount-events-service";
import firebaseStorageService from "@/services/firebase-storage-service";

// Helper to format dates
const formatDate = (date: any): string => {
  if (!date) return "";
  if (date.toDate && typeof date.toDate === "function") {
    return date.toDate().toLocaleDateString();
  }
  if (date instanceof Date) {
    return date.toLocaleDateString();
  }
  return new Date(date).toLocaleDateString();
};

// Helper to get status badge color
const getStatusBadgeColor = (status: string): string => {
  const statusLower = status?.toLowerCase() || "";
  if (statusLower.includes("confirmed") || statusLower === "active")
    return "spring-green";
  if (
    statusLower.includes("pending") ||
    statusLower === "draft" ||
    statusLower.includes("installment")
  )
    return "sunglow-yellow";
  if (statusLower.includes("cancelled") || statusLower === "archived")
    return "crimson-red";
  if (statusLower.includes("completed")) return "royal-purple";
  return "grey";
};

export const searchCategories: CategoryConfig[] = [
  // ============================================================================
  // BOOKINGS CATEGORY
  // ============================================================================
  {
    key: "bookings",
    label: "Bookings",
    icon: Calendar,
    useRealtimeListener: true, // Special flag for real-time updates
    fetchData: async () => {
      const q = query(collection(db, "bookings"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    searchKeys: [
      { name: "bookingCode", weight: 0.8 },
      { name: "fullName", weight: 0.7 },
      { name: "emailAddress", weight: 0.6 },
      { name: "tourPackageName", weight: 0.5 },
      { name: "contactNumber", weight: 0.4 },
    ],
    threshold: 0.4,
    formatResult: (booking: any): SearchResult => ({
      id: booking.id,
      title: `${booking.bookingCode || booking.id} - ${
        booking.fullName || "Unknown"
      }`,
      subtitle: `${booking.tourPackageName || "No tour"} • ${formatDate(
        booking.tourDate
      )}`,
      category: "bookings",
      icon: Calendar,
      url: `/bookings?bookingId=${booking.id}`,
      metadata: {
        status: booking.bookingStatus,
        badge: booking.bookingStatus,
        badgeColor: getStatusBadgeColor(booking.bookingStatus),
        date: formatDate(booking.tourDate),
      },
    }),
  },

  // ============================================================================
  // TOUR PACKAGES CATEGORY
  // ============================================================================
  {
    key: "tours",
    label: "Tour Packages",
    icon: MapPin,
    fetchData: async () => {
      const { tours } = await getTours({}, "createdAt", "desc", 100);
      return tours;
    },
    searchKeys: [
      { name: "tourCode", weight: 0.8 },
      { name: "name", weight: 0.7 },
      { name: "destinations", weight: 0.5 },
      { name: "description", weight: 0.3 },
    ],
    threshold: 0.4,
    formatResult: (tour: any): SearchResult => ({
      id: tour.id,
      title: `${tour.tourCode} - ${tour.name}`,
      subtitle: `${tour.destinations?.[0] ?? "—"} • ${tour.pricing?.currency || "EUR"} ${
        tour.pricing?.original || 0
      }`,
      category: "tours",
      icon: MapPin,
      url: `/tours?tab=packages&tourId=${tour.id}`,
      metadata: {
        status: tour.status,
        badge: tour.status,
        badgeColor: getStatusBadgeColor(tour.status),
      },
    }),
  },

  // ============================================================================
  // DISCOUNT EVENTS CATEGORY
  // ============================================================================
  {
    key: "discount-events",
    label: "Discount Events",
    icon: Tag,
    fetchData: async () => {
      return await DiscountEventsService.list();
    },
    searchKeys: [
      { name: "name", weight: 0.8 },
      { name: "items.tourPackageName", weight: 0.6 },
    ],
    threshold: 0.4,
    formatResult: (event: any): SearchResult => ({
      id: event.id,
      title: event.name,
      subtitle: `${event.items?.length || 0} tour packages • ${
        event.active ? "Active" : "Inactive"
      }`,
      category: "discount-events",
      icon: Tag,
      url: `/tours?tab=discounted`,
      metadata: {
        status: event.active ? "active" : "inactive",
        badge: event.active ? "Active" : "Inactive",
        badgeColor: event.active ? "spring-green" : "grey",
      },
    }),
  },

  // ============================================================================
  // PAYMENT TERMS CATEGORY
  // ============================================================================
  {
    key: "payment-terms",
    label: "Payment Terms",
    icon: CreditCard,
    fetchData: async () => {
      return await PaymentTermsService.getAllPaymentTerms();
    },
    searchKeys: [
      { name: "name", weight: 0.8 },
      { name: "paymentPlanType", weight: 0.6 },
      { name: "description", weight: 0.5 },
    ],
    threshold: 0.4,
    formatResult: (term: any): SearchResult => ({
      id: term.id,
      title: term.name,
      subtitle: `${term.paymentPlanType} • ${
        term.description || "No description"
      }`,
      category: "payment-terms",
      icon: CreditCard,
      url: `/payment-terms?termId=${term.id}&mode=edit`,
      metadata: {
        status: term.isActive ? "active" : "inactive",
        badge: term.isActive ? "Active" : "Inactive",
        badgeColor: term.isActive ? "spring-green" : "grey",
      },
    }),
  },

  // ============================================================================
  // EMAIL TEMPLATES CATEGORY
  // ============================================================================
  {
    key: "email-templates",
    label: "Email Templates",
    icon: Mail,
    fetchData: async () => {
      const result = await EmailTemplateService.getTemplates({});
      return result.templates;
    },
    searchKeys: [
      { name: "name", weight: 0.8 },
      { name: "subject", weight: 0.7 },
      { name: "content", weight: 0.3 },
    ],
    threshold: 0.4,
    formatResult: (template: any): SearchResult => ({
      id: template.id,
      title: template.name,
      subtitle: template.subject || "No subject",
      category: "email-templates",
      icon: Mail,
      url: `/mail/email-templates`,
      metadata: {
        status: template.status,
        badge: template.status,
        badgeColor: getStatusBadgeColor(template.status),
      },
    }),
  },

  // ============================================================================
  // SCHEDULED EMAILS CATEGORY
  // ============================================================================
  {
    key: "scheduled-emails",
    label: "Scheduled Emails",
    icon: Bell,
    fetchData: async () => {
      const q = query(
        collection(db, "scheduledEmails"),
        orderBy("scheduledFor", "desc"),
        limit(200)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    searchKeys: [
      { name: "subject", weight: 0.8 },
      { name: "to", weight: 0.7 },
      { name: "emailType", weight: 0.5 },
    ],
    threshold: 0.4,
    formatResult: (email: any): SearchResult => ({
      id: email.id,
      title: email.subject || "No subject",
      subtitle: `To: ${email.to} • ${email.status || "pending"}`,
      category: "scheduled-emails",
      icon: Bell,
      url: `/mail/payment-reminders`,
      metadata: {
        status: email.status,
        badge: email.status,
        badgeColor: getStatusBadgeColor(email.status),
        date: formatDate(email.scheduledFor),
      },
    }),
  },

  // ============================================================================
  // BCC USERS CATEGORY
  // ============================================================================
  {
    key: "bcc-users",
    label: "BCC Users",
    icon: User,
    fetchData: async () => {
      return await getAllBCCUsers();
    },
    searchKeys: [
      { name: "email", weight: 0.8 },
      { name: "firstName", weight: 0.7 },
      { name: "lastName", weight: 0.7 },
    ],
    threshold: 0.4,
    formatResult: (user: any): SearchResult => ({
      id: user.id,
      title: `${user.firstName} ${user.lastName}`,
      subtitle: user.email,
      category: "bcc-users",
      icon: User,
      url: `/bcc-users`,
      metadata: {
        status: user.isActive ? "active" : "inactive",
        badge: user.isActive ? "Active" : "Inactive",
        badgeColor: user.isActive ? "spring-green" : "grey",
      },
    }),
  },

  // ============================================================================
  // STORAGE CATEGORY
  // ============================================================================
  {
    key: "storage",
    label: "Storage",
    icon: HardDrive,
    fetchData: async () => {
      return await firebaseStorageService.getFiles();
    },
    searchKeys: [
      { name: "name", weight: 0.8 },
      { name: "tags", weight: 0.6 },
      { name: "metadata.description", weight: 0.5 },
    ],
    threshold: 0.4,
    formatResult: (file: any): SearchResult => ({
      id: file.id,
      title: file.name,
      subtitle: `${file.contentType || "Unknown type"} • ${
        file.size ? `${(file.size / 1024).toFixed(2)} KB` : "Unknown size"
      }`,
      category: "storage",
      icon: HardDrive,
      url: `/storage`,
      metadata: {
        badge: file.tags?.[0] || "File",
        badgeColor: "royal-purple",
      },
    }),
  },
];

// Export helper to get category config by key
export const getCategoryConfig = (key: string): CategoryConfig | undefined => {
  return searchCategories.find((cat) => cat.key === key);
};

// Export category keys for type checking
export const categoryKeys = searchCategories.map((cat) => cat.key);
