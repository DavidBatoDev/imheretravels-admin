"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Search,
  Send,
  Mail,
  CheckCircle,
  AlertCircle,
  Trash2,
  Eye,
  Clock,
  User,
  Calendar,
  FileText,
  MoreVertical,
  RotateCcw,
} from "lucide-react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import { httpsCallable } from "firebase/functions";
import { functions, functionsUsCentral } from "@/lib/firebase";

// Email Draft type
interface EmailDraft {
  id: string;
  to: string;
  subject: string;
  htmlContent: string;
  bcc: string[];
  from: string;
  emailType: "reservation" | "cancellation";
  bookingId: string;
  status: "draft" | "sent" | "failed";
  createdAt: any;
  updatedAt: any;
  deletedAt?: any;
  templateId?: string;
  templateVariables?: Record<string, any>;
  isCancellation?: boolean;
  fullName?: string;
  tourPackage?: string;
  errorMessage?: string;
  sentAt?: any;
  messageId?: string;
}

const draftStatuses = [
  {
    value: "draft",
    label: "Draft",
    color: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  },
  {
    value: "sent",
    label: "Sent",
    color: "bg-green-100 text-green-800 border border-green-200",
  },
  {
    value: "failed",
    label: "Failed",
    color: "bg-red-100 text-red-800 border border-red-200",
  },
];

export default function EmailDraftsTab() {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<EmailDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<EmailDraft | null>(null);

  // Load drafts on component mount
  useEffect(() => {
    console.log("🔍 Starting to fetch email drafts...");

    // Simple query without where clause to avoid index issues
    const q = query(collection(db, "emailDrafts"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log(
          `📄 Fetched ${snapshot.docs.length} documents from emailDrafts collection`
        );

        const allDrafts: EmailDraft[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as EmailDraft[];

        // Filter out deleted drafts on client side
        const activeDrafts = allDrafts.filter((draft) => !draft.deletedAt);
        console.log(`✅ Active drafts (not deleted): ${activeDrafts.length}`);

        // Sort by createdAt in descending order on client side
        const sortedDrafts = activeDrafts.sort((a, b) => {
          const aTime = a.createdAt?.toDate
            ? a.createdAt.toDate()
            : new Date(a.createdAt);
          const bTime = b.createdAt?.toDate
            ? b.createdAt.toDate()
            : new Date(b.createdAt);
          return bTime.getTime() - aTime.getTime();
        });

        console.log(`🎯 Setting ${sortedDrafts.length} drafts to state`);
        setDrafts(sortedDrafts);
        setError(null); // Clear any previous errors
      },
      (error) => {
        console.error("❌ Error loading drafts:", error);
        setError("Failed to load email drafts");
        toast({
          title: "Error",
          description: `Failed to load email drafts: ${error.message}`,
          variant: "destructive",
        });
      }
    );

    return () => {
      console.log("🔄 Unsubscribing from emailDrafts listener");
      unsubscribe();
    };
  }, []);

  const handleDeleteDraft = (draft: EmailDraft) => {
    setSelectedDraft(draft);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedDraft) return;

    try {
      setIsLoading(true);
      setError(null);

      // Soft delete by setting deletedAt timestamp
      await updateDoc(doc(db, "emailDrafts", selectedDraft.id), {
        deletedAt: new Date(),
        updatedAt: new Date(),
      });

      setIsDeleteDialogOpen(false);

      toast({
        title: "Success",
        description: "Email draft moved to recycle bin",
      });
    } catch (error) {
      console.error("Failed to delete draft:", error);
      setError("Failed to delete email draft");
      toast({
        title: "Error",
        description: "Failed to delete email draft",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmail = async (draft: EmailDraft) => {
    try {
      setIsLoading(true);

      // If retrying a failed email, clear the error message first
      if (draft.status === "failed") {
        await updateDoc(doc(db, "emailDrafts", draft.id), {
          status: "draft",
          updatedAt: new Date(),
          errorMessage: null,
        });
      }

      // Call the sendReservationEmail cloud function (deployed in asia-southeast1)
      const sendEmailFunction = httpsCallable(
        functions,
        "sendReservationEmail"
      );
      const result = await sendEmailFunction({ draftId: draft.id });

      console.log("Email sent successfully:", result.data);

      toast({
        title: "Success",
        description: "Email sent successfully!",
      });
    } catch (error) {
      console.error("Failed to send email:", error);

      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredDrafts = drafts.filter((draft) => {
    const matchesSearch =
      draft.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
      draft.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      draft.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      draft.tourPackage?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  // Group drafts by email type
  const groupedDrafts = filteredDrafts.reduce((groups, draft) => {
    const type = draft.emailType || "other";
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(draft);
    return groups;
  }, {} as Record<string, EmailDraft[]>);

  const getStatusColor = (status: string) => {
    const statusObj = draftStatuses.find((s) => s.value === status);
    return (
      statusObj?.color || "bg-gray-100 text-gray-800 border border-gray-200"
    );
  };

  const getEmailTypeColor = (emailType: string) => {
    switch (emailType) {
      case "reservation":
        return "bg-blue-100 text-blue-800 border border-blue-200";
      case "cancellation":
        return "bg-red-100 text-red-800 border border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200";
    }
  };

  const getEmailTypeDisplay = (emailType: string) => {
    switch (emailType) {
      case "reservation":
        return {
          title: "Reservation Emails",
          description: "Booking confirmations and reservation details",
          color: "text-blue-600",
          bgColor: "bg-blue-50 border-blue-200",
        };
      case "cancellation":
        return {
          title: "Cancellation Emails",
          description: "Booking cancellations and refund information",
          color: "text-red-600",
          bgColor: "bg-red-50 border-red-200",
        };
      default:
        return {
          title: "Other Emails",
          description: "Miscellaneous email communications",
          color: "text-gray-600",
          bgColor: "bg-gray-50 border-gray-200",
        };
    }
  };

  if (isLoading && drafts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading email drafts...</p>
        </div>
      </div>
    );
  }

  if (error && drafts.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">
          <AlertCircle className="mx-auto h-12 w-12" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          Error loading email drafts
        </h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          className="border-primary/20 text-primary hover:bg-primary/10 hover:border-primary"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Email Drafts</h2>
          <p className="text-muted-foreground mt-1">
            Manage and send email drafts generated from your templates
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-primary/60" />
          <Input
            placeholder="Search drafts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9 w-64 border-primary/20 focus:border-primary focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Grouped Drafts */}
      <div className="space-y-8">
        {Object.entries(groupedDrafts).map(([emailType, drafts]) => {
          const typeDisplay = getEmailTypeDisplay(emailType);

          return (
            <div key={emailType} className="space-y-4">
              {/* Section Header */}
              <div
                className={`w-full p-4 rounded-lg border ${typeDisplay.bgColor}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3
                      className={`text-xl font-semibold ${typeDisplay.color}`}
                    >
                      {typeDisplay.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {typeDisplay.description}
                    </p>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      typeDisplay.color
                    } ${typeDisplay.bgColor.replace("50", "100")}`}
                  >
                    {drafts.length} draft{drafts.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {/* Drafts Grid for this type */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {drafts.map((draft) => (
                  <Card
                    key={draft.id}
                    className="group hover:shadow-lg transition-all duration-200 border border-gray-200 shadow bg-white hover:border-gray-300"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="p-2 rounded-lg bg-gray-100">
                            <Mail className="h-4 w-4 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-base font-semibold text-foreground">
                              {draft.subject}
                            </CardTitle>
                            <CardDescription className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              To: {draft.to}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge
                          className={`${getStatusColor(draft.status)} text-xs`}
                        >
                          {draft.status}
                        </Badge>
                        <Badge
                          className={`${getEmailTypeColor(
                            draft.emailType
                          )} text-xs`}
                        >
                          {draft.emailType}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Booking ID
                          </span>
                          <span className="font-medium text-foreground">
                            {draft.bookingId}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Customer
                          </span>
                          <span className="font-medium text-foreground">
                            {draft.fullName || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Tour</span>
                          <span className="font-medium text-foreground">
                            {draft.tourPackage || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Created</span>
                          <span className="font-medium text-foreground">
                            {draft.createdAt
                              ?.toDate?.()
                              ?.toLocaleDateString?.() || "Today"}
                          </span>
                        </div>
                        {draft.status === "failed" && draft.errorMessage && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                            <span className="text-red-700 font-medium">
                              Error:
                            </span>
                            <span className="text-red-600 ml-1">
                              {draft.errorMessage}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewDraft(draft)}
                          className="flex-1 h-8 text-xs border-primary/20 text-primary hover:bg-primary/10 hover:border-primary transition-all duration-200"
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          Preview
                        </Button>
                        {draft.status === "draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendEmail(draft)}
                            disabled={isLoading}
                            className="flex-1 h-8 text-xs border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300 transition-all duration-200"
                          >
                            <Send className="mr-1 h-3 w-3" />
                            Send
                          </Button>
                        )}
                        {draft.status === "failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendEmail(draft)}
                            disabled={isLoading}
                            className="flex-1 h-8 text-xs border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300 transition-all duration-200"
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Retry
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteDraft(draft)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0 border-red-200 transition-all duration-200"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredDrafts.length === 0 && (
        <Card className="text-center py-8 border border-primary/20 shadow">
          <CardContent>
            <div className="p-3 bg-primary/20 rounded-xl inline-block mb-3">
              <Mail className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-2">
              No email drafts found
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm
                ? "Try adjusting your search terms."
                : "Email drafts will appear here when generated from your templates."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      {previewDraft && (
        <AlertDialog
          open={!!previewDraft}
          onOpenChange={() => setPreviewDraft(null)}
        >
          <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto border border-primary/20">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground">
                Email Preview: {previewDraft.subject}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                To: {previewDraft.to} | Type: {previewDraft.emailType} | Status:{" "}
                {previewDraft.status}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-4">
              <div className="border rounded-lg p-4 bg-muted/20">
                <div
                  className="email-preview"
                  dangerouslySetInnerHTML={{ __html: previewDraft.htmlContent }}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-primary/20 text-primary hover:bg-primary/10 hover:border-primary">
                Close
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="border border-primary/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Delete Email Draft
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete this email draft? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-primary/20 text-primary hover:bg-primary/10 hover:border-primary">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
