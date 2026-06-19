import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  X,
  Filter,
  Trash2,
  Calendar as CalendarIcon,
  Hash,
  Type,
  CreditCard,
  User,
  MapPin,
  Clock,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "contains";

export interface FilterConfig {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any;
  value2?: any; // For 'between'
}

interface TransactionFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFilters: (filters: FilterConfig[]) => void;
  activeFilters: FilterConfig[];
}

const AVAILABLE_FIELDS = [
  { id: "payment.amount", label: "Amount", type: "number", icon: Hash },
  {
    id: "payment.currency",
    label: "Currency",
    type: "select",
    options: ["GBP", "USD", "EUR"],
    icon: CreditCard,
  },
  {
    id: "payment.status",
    label: "Status",
    type: "select",
    options: [
      "succeeded",
      "pending",
      "failed",
      "refunded",
      "reservation_pending",
      "installment_pending",
      "installment_paid",
      "reserve_paid",
      "cancelled",
    ],
    icon: Clock,
  },
  {
    id: "payment.type",
    label: "Type",
    type: "select",
    options: ["reservationFee", "installment", "full_payment"],
    icon: CreditCard,
  },
  {
    id: "payment.installmentTerm",
    label: "Installment Term",
    type: "string",
    icon: Hash,
  },
  {
    id: "tour.packageName",
    label: "Tour Package",
    type: "string",
    icon: MapPin,
  },
  { id: "customer.email", label: "Email", type: "string", icon: User },
  { id: "booking.id", label: "Booking ID", type: "string", icon: Hash },
  {
    id: "timestamps.createdAt",
    label: "Date",
    type: "date",
    icon: CalendarIcon,
  },
];

export function TransactionFilterDialog({
  open,
  onOpenChange,
  onApplyFilters,
  activeFilters,
}: TransactionFilterDialogProps) {
  const [filters, setFilters] = useState<FilterConfig[]>([]);

  useEffect(() => {
    if (open) {
      setFilters(activeFilters); // Reset to active on open
    }
  }, [open, activeFilters]);

  const addFilter = () => {
    setFilters([
      ...filters,
      {
        id: crypto.randomUUID(),
        field: "payment.amount",
        operator: "eq",
        value: "",
      },
    ]);
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter((f) => f.id !== id));
  };

  const updateFilter = (id: string, updates: Partial<FilterConfig>) => {
    setFilters(
      filters.map((f) => {
        if (f.id === id) {
          const updated = { ...f, ...updates };
          // Reset values if field changes, as type might change
          if (updates.field) {
            const fieldType = AVAILABLE_FIELDS.find(
              (field) => field.id === updates.field,
            )?.type;
            updated.value = "";
            updated.value2 = undefined;
            updated.operator = fieldType === "string" ? "contains" : "eq";
          }
          return updated;
        }
        return f;
      }),
    );
  };

  const handleApply = () => {
    onApplyFilters(filters);
    onOpenChange(false);
  };

  const clearAll = () => {
    setFilters([]);
  };

  const getFieldType = (fieldId: string) => {
    return AVAILABLE_FIELDS.find((f) => f.id === fieldId)?.type || "string";
  };

  const getFieldOptions = (fieldId: string) => {
    return AVAILABLE_FIELDS.find((f) => f.id === fieldId)?.options || [];
  };

  const getOperators = (type: string) => {
    switch (type) {
      case "number":
      case "date":
        return [
          { value: "eq", label: "Equals (=)" },
          { value: "neq", label: "Not Equals (!=)" },
          { value: "gt", label: "Greater Than (>)" },
          { value: "gte", label: "Greater/Equal (>=)" },
          { value: "lt", label: "Less Than (<)" },
          { value: "lte", label: "Less/Equal (<=)" },
          { value: "between", label: "Between" },
        ];
      case "string":
        return [
          { value: "contains", label: "Contains" },
          { value: "eq", label: "Equals" },
        ];
      case "select":
        return [
          { value: "eq", label: "is" },
          { value: "neq", label: "is not" },
        ];
      default:
        return [{ value: "eq", label: "Equals" }];
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between mr-8">
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Advanced Filters
            </DialogTitle>
            {filters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10 h-8 px-2 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" /> Clear All
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-1 space-y-4">
          {filters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg bg-muted/20">
              <div className="bg-muted p-4 rounded-full mb-4">
                <Filter className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No filters applied</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
                Add filters to narrow down your transaction list by amount,
                status, date, and more.
              </p>
              <Button onClick={addFilter} variant="default">
                <Plus className="h-4 w-4 mr-2" /> Add Filter
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filters.map((filter, index) => {
                const fieldConfig = AVAILABLE_FIELDS.find(
                  (f) => f.id === filter.field,
                );
                const Icon = fieldConfig?.icon || Filter;

                return (
                  <Card key={filter.id} className="relative group">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeFilter(filter.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <CardContent className="p-4 grid gap-4 items-end sm:grid-cols-[1.5fr_1fr_1.5fr] grid-cols-1">
                      {/* Field Selector */}
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Field
                        </Label>
                        <Select
                          value={filter.field}
                          onValueChange={(val) =>
                            updateFilter(filter.id, { field: val })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_FIELDS.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Operator Selector */}
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Condition
                        </Label>
                        <Select
                          value={filter.operator}
                          onValueChange={(val) =>
                            updateFilter(filter.id, {
                              operator: val as FilterOperator,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getOperators(fieldConfig?.type || "string").map(
                              (op) => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Value Input */}
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Value
                        </Label>

                        {filter.operator === "between" ? (
                          <div className="flex gap-2 items-center">
                            <Input
                              type={
                                fieldConfig?.type === "date" ? "date" : "number"
                              }
                              value={filter.value}
                              onChange={(e) =>
                                updateFilter(filter.id, {
                                  value: e.target.value,
                                })
                              }
                              placeholder="Min"
                              className="min-w-0"
                            />
                            <span className="text-muted-foreground text-xs">
                              to
                            </span>
                            <Input
                              type={
                                fieldConfig?.type === "date" ? "date" : "number"
                              }
                              value={filter.value2 || ""}
                              onChange={(e) =>
                                updateFilter(filter.id, {
                                  value2: e.target.value,
                                })
                              }
                              placeholder="Max"
                              className="min-w-0"
                            />
                          </div>
                        ) : fieldConfig?.type === "select" ? (
                          <Select
                            value={filter.value}
                            onValueChange={(val) =>
                              updateFilter(filter.id, { value: val })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {getFieldOptions(filter.field).map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={
                              fieldConfig?.type === "date"
                                ? "date"
                                : fieldConfig?.type === "number"
                                  ? "number"
                                  : "text"
                            }
                            value={filter.value}
                            onChange={(e) =>
                              updateFilter(filter.id, { value: e.target.value })
                            }
                            placeholder="Enter value..."
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={addFilter}
                className="w-full border-dashed"
              >
                <Plus className="h-4 w-4 mr-2" /> Add another condition
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply Filters {filters.length > 0 && `(${filters.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
