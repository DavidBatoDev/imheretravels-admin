import { useState, useCallback, useEffect } from "react";
import { SheetColumn, SheetData, SheetConfig } from "@/types/sheet-management";
import { defaultBookingColumns } from "@/lib/default-booking-columns";;
import { bookingService } from "@/services/booking-service";
import { useToast } from "@/hooks/use-toast";
import { useBookingsStore } from "@/hooks/use-bookings-store";
import { allBookingSheetColumns } from "@/app/functions/columns";
import { functionMap } from "@/app/functions/columns/functions-index";

export function useSheetManagement() {
  const { toast } = useToast();
  const [columns, setColumns] = useState<SheetColumn[]>([]);
  const [data, setData] = useState<SheetData[]>([]);
  const [config, setConfig] = useState<SheetConfig>({
    id: "bookings-sheet",
    name: "Bookings Sheet",
    columns: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // LOAD CODED COLUMNS (Replaces Firebase bookingSheetColumns)
  // ============================================================================

  useEffect(() => {
    console.log("🔍 [SHEET MANAGEMENT] Loading coded booking sheet columns...");

    // Convert BookingSheetColumn[] to SheetColumn[] and inject function implementations
    const codedColumns: SheetColumn[] = allBookingSheetColumns.map(
      (col): SheetColumn => {
        const columnData = col.data;

        // If this is a function column, inject the actual function implementation
        if (columnData.dataType === "function" && columnData.function) {
          const funcImpl = functionMap[columnData.function];
          if (funcImpl) {
            return {
              ...columnData,
              compiledFunction: funcImpl as (...args: any[]) => any, // Inject the actual function
            };
          } else {
            console.warn(
              `⚠️  Function ${columnData.function} not found in function map for column ${columnData.columnName}`
            );
          }
        }

        return columnData;
      }
    );

    console.log(
      `✅ [SHEET MANAGEMENT] Loaded ${codedColumns.length} coded columns:`,
      {
        functionColumns: codedColumns
          .filter((c) => c.dataType === "function")
          .map((c) => ({
            id: c.id,
            columnName: c.columnName,
            function: c.function,
            hasCompiledFunction: !!(c as any).compiledFunction,
          })),
        timestamp: new Date().toISOString(),
        source: "coded-columns",
      }
    );

    setColumns(codedColumns);
    setConfig((prev) => ({
      ...prev,
      columns: codedColumns,
      updatedAt: new Date(),
    }));
    setIsLoading(false);
    setError(null);
  }, []);

  // ============================================================================
  // REAL-TIME BOOKING DATA SUBSCRIPTION
  // ============================================================================

  // Bookings come from the shared realtime store (one listener app-wide).
  // Each new snapshot replaces local data, as the private listener did.
  const {
    bookings: storeBookings,
    isLoading: storeLoading,
    error: storeError,
  } = useBookingsStore();

  useEffect(() => {
    if (storeError) {
      setError(`Failed to fetch bookings: ${storeError.message}`);
      setIsLoading(false);
      return;
    }
    if (storeLoading) return;

    // Sort bookings numerically by ID to fix the "10" appearing after "1" issue
    const sortedBookings = ([...storeBookings] as unknown as SheetData[]).sort(
      (a, b) => {
        const aId = parseInt(a.id);
        const bId = parseInt(b.id);
        if (isNaN(aId) && isNaN(bId)) return 0;
        if (isNaN(aId)) return 1;
        if (isNaN(bId)) return -1;
        return aId - bId;
      }
    );

    setData(sortedBookings);
    setIsLoading(false);
    setError(null);
  }, [storeBookings, storeLoading, storeError]);

  // ============================================================================
  // DATA MANAGEMENT METHODS
  // ============================================================================

  const updateData = useCallback((newData: SheetData[]) => {
    setData(newData);
  }, []);

  const addRow = useCallback((rowData: Omit<SheetData, "id">) => {
    const newRow: SheetData = {
      ...rowData,
      id: `row_${Date.now()}`,
    };
    setData((prev) => [...prev, newRow]);
  }, []);

  const updateRow = useCallback(
    (rowId: string, updates: Partial<SheetData>) => {
      setData((prev) =>
        prev.map((row) => (row.id === rowId ? { ...row, ...updates } : row))
      );
    },
    []
  );

  const deleteRow = useCallback(
    async (rowId: string) => {
      try {
        console.log(`🗑️ Deleting row ${rowId} with row shifting...`);

        // Use the new delete function that removes document and shifts rows
        await bookingService.deleteBookingWithRowShift(rowId);

        // The real-time listener will automatically update the local state
        // when the Firestore changes are detected
        console.log(
          `✅ Successfully deleted row ${rowId} and shifted subsequent rows`
        );

        // Show success toast
        toast({
          title: "🗑️ Booking Deleted",
          description: "Booking deleted and subsequent rows shifted down",
          variant: "default",
        });
      } catch (error) {
        console.error(`❌ Failed to delete row ${rowId}:`, error);

        // Show error toast
        toast({
          title: "❌ Delete Failed",
          description: `Failed to delete booking: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          variant: "destructive",
        });

        throw error; // Re-throw so the UI can handle the error
      }
    },
    [toast]
  );

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================



  return {
    // State
    columns,
    data,
    config,
    isLoading,
    error,

    // Data management
    updateData,
    addRow,
    updateRow,
    deleteRow,
  };
}
