"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DiscountEventsService,
  type DiscountEvent,
  type DiscountEventItem,
  type DateDiscount,
} from "@/services/discount-events-service";
import CreateDiscountEventModal from "@/components/discounts/CreateDiscountEventModal";
import EditDiscountEventModal from "@/components/discounts/EditDiscountEventModal";
import { getAllTours } from "@/services/tours-service";
import type { TourPackage } from "@/types/tours";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import SaleEventsSection from "@/components/sales/SaleEventsSection";

export default function DiscountedToursTab() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<DiscountEvent[]>([]);
  const [tours, setTours] = useState<TourPackage[]>([]);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<DiscountEvent | null>(null);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [eventToDeleteName, setEventToDeleteName] = useState<string>("");

  // View event details dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<DiscountEvent | null>(null);

  // Legacy discount events are kept (the booking sheet looks them up by name)
  // but tucked away below the sale events.
  const [legacyOpen, setLegacyOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [evt, allTours] = await Promise.all([
          DiscountEventsService.list(),
          getAllTours(),
        ]);
        if (!mounted) return;
        setEvents(evt);
        setTours(allTours);
      } catch (e: any) {
        toast({
          title: "Failed to load",
          description: e?.message || "Could not load discounts/tours",
          variant: "destructive",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [toast]);

  function openCreateModal() {
    setIsCreateModalOpen(true);
  }

  function openEditModal(evt: DiscountEvent) {
    setEditingEvent(evt);
    setIsEditModalOpen(true);
  }

  async function handleSave() {
    const updated = await DiscountEventsService.list();
    setEvents(updated);
  }

  function confirmDelete(id: string, name: string) {
    setEventToDelete(id);
    setEventToDeleteName(name);
    setDeleteDialogOpen(true);
  }

  async function deleteEvent() {
    if (!eventToDelete) return;
    try {
      await DiscountEventsService.remove(eventToDelete);
      toast({ title: "Event deleted successfully" });
      const updated = await DiscountEventsService.list();
      setEvents(updated);
      setDeleteDialogOpen(false);
      setEventToDelete(null);

      // If we were editing this event, close the modal
      if (editingEvent?.id === eventToDelete) {
        setEditingEvent(null);
        setIsEditModalOpen(false);
      }
    } catch (e: any) {
      toast({
        title: "Failed to delete",
        description: e?.message,
        variant: "destructive",
      });
    }
  }

  async function toggleEventActive(id: string, active: boolean) {
    try {
      await DiscountEventsService.setActive(id, active);
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, active } : e))
      );
    } catch (e: any) {
      toast({
        title: "Failed to update",
        description: e?.message,
        variant: "destructive",
      });
    }
  }

  function viewEventDetails(evt: DiscountEvent) {
    setViewingEvent(evt);
    setViewDialogOpen(true);
  }

  function resolveEventActive(evt: DiscountEvent) {
    const mode = evt.activationMode || "manual";
    if (mode === "scheduled") {
      const now = new Date();
      const startsOk = evt.scheduledStart
        ? now >= new Date(evt.scheduledStart)
        : true;
      const endsOk = evt.scheduledEnd
        ? now <= new Date(evt.scheduledEnd)
        : true;
      return startsOk && endsOk;
    }
    return evt.active;
  }

  return (
    <div className="space-y-8">
      <SaleEventsSection />

      <Collapsible open={legacyOpen} onOpenChange={setLegacyOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              <span className="font-semibold">Legacy discount events</span>
              <span className="ml-2 text-sm text-muted-foreground">
                {events.length} event{events.length !== 1 ? "s" : ""} · date-based
                discounts used by older bookings
              </span>
            </span>
            {legacyOpen ? (
              <ChevronUp className="h-5 w-5" aria-hidden />
            ) : (
              <ChevronDown className="h-5 w-5" aria-hidden />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Discount Events</CardTitle>
              <CardDescription>
                Manage discount events with selected tour packages, dates, and
                discount rates.
              </CardDescription>
            </div>
            <Button onClick={openCreateModal} size="lg">
              <Plus className="mr-2 h-5 w-5" /> Create Event
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium mb-2">No discount events yet</p>
              <p className="text-sm">
                Create your first discount event to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-stretch rounded-lg border overflow-hidden transition-all hover:shadow-sm"
                >
                  {/* Banner Image - Left Side */}
                  {evt.bannerCover ? (
                    <div className="w-32 h-32 flex-shrink-0">
                      <img
                        src={evt.bannerCover}
                        alt={evt.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-32 h-32 flex-shrink-0 bg-muted flex items-center justify-center">
                      <span className="text-muted-foreground text-xs">
                        No Image
                      </span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 flex items-center justify-between p-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-lg">
                          {evt.name}
                        </span>
                        {resolveEventActive(evt) ? (
                          <Badge variant="default" className="px-2.5 py-0.5">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="px-2.5 py-0.5">
                            Inactive
                          </Badge>
                        )}
                        {evt.activationMode === "scheduled" && (
                          <Badge variant="outline" className="px-2.5 py-0.5">
                            Scheduled
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex flex-wrap gap-1">
                        <span>
                          {evt.items.length} tour package
                          {evt.items.length !== 1 ? "s" : ""} •{" "}
                          {evt.items.reduce(
                            (acc, it) => acc + (it.dateDiscounts?.length || 0),
                            0
                          )}{" "}
                          date
                          {evt.items.reduce(
                            (acc, it) => acc + (it.dateDiscounts?.length || 0),
                            0
                          ) !== 1
                            ? "s"
                            : ""}
                        </span>
                        {evt.activationMode === "scheduled" && (
                          <span>
                            • {evt.scheduledStart
                              ? new Date(evt.scheduledStart).toLocaleString()
                              : "No start"}
                            {" to "}
                            {evt.scheduledEnd
                              ? new Date(evt.scheduledEnd).toLocaleString()
                              : "No end"}
                          </span>
                        )}
                      </div>

                      {/* Show tour packages */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {evt.items.map((item, idx) => {
                          let displayValue;
                          if (evt.discountType === "amount") {
                            // Calculate actual flat amount for each date, then average
                            const avgAmount = item.dateDiscounts && item.dateDiscounts.length > 0
                              ? (
                                  item.dateDiscounts.reduce(
                                    (sum, dd) => sum + Math.round((item.originalCost * dd.discountRate) / 100),
                                    0
                                  ) / item.dateDiscounts.length
                                ).toFixed(2)
                              : "0.00";
                            displayValue = `£${avgAmount}`;
                          } else {
                            // Calculate average percentage with 2 decimal places
                            const avgDiscount = item.dateDiscounts && item.dateDiscounts.length > 0
                              ? (
                                  item.dateDiscounts.reduce(
                                    (sum, dd) => sum + dd.discountRate,
                                    0
                                  ) / item.dateDiscounts.length
                                ).toFixed(2)
                              : "0.00";
                            displayValue = `${avgDiscount}%`;
                          }
                          return (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-xs"
                            >
                              {item.tourPackageName} -{" "}
                              {item.dateDiscounts?.length || 0} dates (avg{" "}
                              {displayValue} off)
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-4">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background">
                        <Switch
                          checked={resolveEventActive(evt)}
                          disabled={evt.activationMode === "scheduled"}
                          onCheckedChange={(v) => toggleEventActive(evt.id, v)}
                        />
                        <span className="text-sm font-medium whitespace-nowrap">
                          {resolveEventActive(evt) ? "Active" : "Inactive"}
                          {evt.activationMode === "scheduled" ? " (by schedule)" : ""}
                        </span>
                      </div>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => viewEventDetails(evt)}
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openEditModal(evt)}
                        title="Edit event"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => confirmDelete(evt.id, evt.name)}
                        className="text-destructive hover:text-destructive"
                        title="Delete event"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Create Event Modal */}
      <CreateDiscountEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        tours={tours}
        onSave={handleSave}
      />

      {/* Edit Event Modal */}
      <EditDiscountEventModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingEvent(null);
        }}
        tours={tours}
        event={editingEvent}
        onSave={handleSave}
      />

      {/* View Event Details Dialog */}
      <AlertDialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl flex items-center gap-3">
              {viewingEvent?.name}
              {viewingEvent && resolveEventActive(viewingEvent) ? (
                <Badge variant="default">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
              {viewingEvent?.activationMode === "scheduled" && (
                <Badge variant="outline">Scheduled</Badge>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Detailed view of all tour packages and discounted dates in this
              event
              {viewingEvent?.activationMode === "scheduled" && (
                <>
                  <br />
                  Active window: {viewingEvent.scheduledStart
                    ? new Date(viewingEvent.scheduledStart).toLocaleString()
                    : "No start"}
                  {" to "}
                  {viewingEvent.scheduledEnd
                    ? new Date(viewingEvent.scheduledEnd).toLocaleString()
                    : "No end"}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {viewingEvent && (
            <div className="space-y-6 py-4">
              {viewingEvent.items.map((item, itemIdx) => (
                <Card key={itemIdx}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {item.tourPackageName}
                        </CardTitle>
                        <CardDescription>
                          Original Price: £{item.originalCost} •{" "}
                          {item.dateDiscounts?.length || 0} discounted date
                          {(item.dateDiscounts?.length || 0) !== 1 ? "s" : ""}
                        </CardDescription>
                      </div>
                      {item.dateDiscounts && item.dateDiscounts.length > 0 && (
                        <Badge variant="outline" className="ml-2">
                          Avg{" "}
                          {viewingEvent.discountType === "amount" 
                            ? `£${(
                                item.dateDiscounts.reduce(
                                  (sum, dd) => sum + Math.round((item.originalCost * dd.discountRate) / 100),
                                  0
                                ) / item.dateDiscounts.length
                              ).toFixed(2)}`
                            : `${(
                                item.dateDiscounts.reduce(
                                  (sum, dd) => sum + dd.discountRate,
                                  0
                                ) / item.dateDiscounts.length
                              ).toFixed(2)}%`}{" "}
                          off
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!item.dateDiscounts || item.dateDiscounts.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic">
                        No discounted dates configured
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {item.dateDiscounts
                          .sort(
                            (a, b) =>
                              new Date(a.date).getTime() -
                              new Date(b.date).getTime()
                          )
                          .map((dd, dateIdx) => (
                            <div
                              key={dateIdx}
                              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {new Date(dd.date).toLocaleDateString(
                                    "en-US",
                                    {
                                      weekday: "short",
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    }
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  <span className="line-through">
                                    £{item.originalCost}
                                  </span>
                                  {" → "}
                                  <span className="font-semibold text-green-600">
                                    £{dd.discountedCost}
                                  </span>
                                </div>
                              </div>
                              <Badge variant="secondary" className="ml-2">
                                {viewingEvent.discountType === "amount" 
                                  ? `£${Math.round((item.originalCost * dd.discountRate) / 100)} off`
                                  : `${dd.discountRate.toFixed(2)}% off`}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Event Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Discount Event?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">"{eventToDeleteName}"</span>? This
              action cannot be undone and will permanently remove this discount
              event and all its associated tour packages and dates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteEvent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
