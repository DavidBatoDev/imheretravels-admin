"use client";

import React, { useState, useMemo, useCallback, useEffect, memo } from "react";
import { getBookingsOnce } from "@/hooks/use-bookings-store";
// Import react-data-grid components
// @ts-expect-error - react-data-grid v7 has incorrect type definitions
import { DataGrid } from "react-data-grid";
import "react-data-grid/lib/styles.css";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RotateCcw,
  Clock,
  User,
  GitBranch,
  Eye,
  ArrowRight,
  History,
  RefreshCw,
} from "lucide-react";

import {
  BookingVersionSnapshot,
  VersionHighlightedData,
  VersionComparison,
  VersionMetadata,
  BulkOperationMetadata,
} from "@/types/version-history";
import { SheetColumn, SheetData } from "@/types/sheet-management";
import { bookingVersionHistoryService } from "@/services/booking-version-history-service";

// Define types manually since the package types are not matching
type Column<TRow> = {
  key: string;
  name: string;
  width?: number | string;
  resizable?: boolean;
  sortable?: boolean;
  frozen?: boolean;
  renderCell?: (props: { row: TRow; column: any }) => React.ReactNode;
  renderHeaderCell?: (props: { column: any }) => React.ReactNode;
  [key: string]: any;
};

interface BookingVersionHistoryGridProps {
  columns: SheetColumn[];
  versions: BookingVersionSnapshot[];
  selectedVersionId?: string;
  comparisonVersionId?: string;
  onVersionSelect: (versionId: string) => void;
  onVersionRestore: (
    versionId: string,
    reconstructedData?: SheetData[]
  ) => void;
  onVersionCompare?: (versionId: string) => void;
  isRestoring?: boolean;
  className?: string;
  allBookingsData?: any[]; // All current bookings data to display
}

const isBulkOperationMetadata = (
  metadata: VersionMetadata
): metadata is BulkOperationMetadata =>
  metadata.changeType?.startsWith("bulk_") === true &&
  (metadata as BulkOperationMetadata).bulkOperation !== undefined;

export default function BookingVersionHistoryGrid({
  columns,
  versions,
  selectedVersionId,
  comparisonVersionId,
  onVersionSelect,
  onVersionRestore,
  onVersionCompare,
  isRestoring = false,
  className = "",
  allBookingsData = [],
}: BookingVersionHistoryGridProps) {
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const gridContainerRef = React.useRef<HTMLDivElement>(null);

  // State for reconstructed grid data
  const [isReconstructing, setIsReconstructing] = useState(false);
  const [reconstructedBookings, setReconstructedBookings] = useState<
    SheetData[]
  >([]);

  // Reconstruct grid state when version changes
  useEffect(() => {
    let isCancelled = false;

    const reconstructGrid = async () => {
      const selectedVersion = versions.find((v) => v.id === selectedVersionId);
      if (!selectedVersion) {
        setReconstructedBookings([]);
        setIsReconstructing(false);
        return;
      }

      if (
        selectedVersion.metadata.changeType === "restore" &&
        Array.isArray(selectedVersion.gridSnapshot) &&
        selectedVersion.gridSnapshot.length > 0
      ) {
        if (!isCancelled) {
          const snapshotRows = selectedVersion.gridSnapshot.map(
            (row, index) => {
              const sanitizedRow = { ...(row as SheetData) };

              if ((sanitizedRow as any)._versionInfo) {
                delete (sanitizedRow as any)._versionInfo;
              }
              if ((sanitizedRow as any)._originalRow) {
                delete (sanitizedRow as any)._originalRow;
              }

              if (
                typeof sanitizedRow.row !== "number" ||
                !Number.isFinite(sanitizedRow.row)
              ) {
                sanitizedRow.row = index + 1;
              }

              return sanitizedRow;
            }
          );

          setReconstructedBookings(snapshotRows as SheetData[]);
          setIsReconstructing(false);
        }
        return;
      }

      setIsReconstructing(true);
      try {
        // Get the timestamp from the selected version
        const versionTimestamp = selectedVersion.metadata.createdAt;
        let versionTime: number;

        if (versionTimestamp && typeof versionTimestamp === "object") {
          if (
            "toDate" in versionTimestamp &&
            typeof versionTimestamp.toDate === "function"
          ) {
            versionTime = versionTimestamp.toDate().getTime();
          } else if (
            "seconds" in versionTimestamp &&
            typeof versionTimestamp.seconds === "number"
          ) {
            versionTime = versionTimestamp.seconds * 1000;
          } else if (versionTimestamp instanceof Date) {
            versionTime = versionTimestamp.getTime();
          } else {
            versionTime = Date.now();
          }
        } else if (typeof versionTimestamp === "number") {
          versionTime = versionTimestamp;
        } else {
          versionTime = Date.now();
        }

        console.log(
          "🔍 [VERSION GRID] Reconstructing grid at timestamp:",
          new Date(versionTime),
          "for version ID:",
          selectedVersionId
        );

        // Latest bookings from the shared realtime store (avoids stale
        // snapshots after restores or new inserts without a full refetch)
        const latestBookings =
          (await getBookingsOnce()) as unknown as SheetData[];

        const mergedBookingsMap = new Map<string, SheetData>();
        const mergeSource = [...allBookingsData, ...latestBookings];

        mergeSource.forEach((booking: any) => {
          if (!booking || typeof booking !== "object") {
            return;
          }

          const bookingId =
            typeof booking.id === "string" ? booking.id : undefined;
          if (!bookingId) {
            return;
          }

          mergedBookingsMap.set(bookingId, booking as SheetData);
        });

        const mergedBookings = Array.from(mergedBookingsMap.values());

        // For delete versions, reconstruct up to (but NOT including) the delete itself
        // This allows the UI to show the deleted row with highlighting
        let reconstructUpToVersionId = selectedVersionId;
        if (selectedVersion.metadata.changeType === "delete") {
          // Find the version before this delete
          const sortedVersions = [...versions].sort((a, b) => {
            const aTime =
              a.metadata.createdAt &&
              typeof a.metadata.createdAt === "object" &&
              "toDate" in a.metadata.createdAt
                ? a.metadata.createdAt.toDate().getTime()
                : typeof a.metadata.createdAt === "number"
                ? a.metadata.createdAt
                : 0;
            const bTime =
              b.metadata.createdAt &&
              typeof b.metadata.createdAt === "object" &&
              "toDate" in b.metadata.createdAt
                ? b.metadata.createdAt.toDate().getTime()
                : typeof b.metadata.createdAt === "number"
                ? b.metadata.createdAt
                : 0;
            return aTime - bTime;
          });

          const currentIndex = sortedVersions.findIndex(
            (v) => v.id === selectedVersionId
          );
          if (currentIndex > 0) {
            reconstructUpToVersionId = sortedVersions[currentIndex - 1].id;
            console.log(
              `🔍 [VERSION GRID] Delete version detected - reconstructing up to previous version: ${reconstructUpToVersionId}`
            );
          } else {
            // This is the first version and it's a delete - reconstruct to empty state
            reconstructUpToVersionId = undefined as any;
            console.log(
              `🔍 [VERSION GRID] First version is delete - reconstructing to empty state`
            );
          }
        }

        // Use the service to reconstruct complete grid state at the version timestamp
        // Pass the version ID to ensure we stop at the exact version, not just timestamp
        const historicalGrid =
          await bookingVersionHistoryService.getGridStateAtTimestamp(
            versionTime,
            mergedBookings,
            reconstructUpToVersionId // For deletes, this is the version BEFORE the delete
          );

        if (!isCancelled) {
          setReconstructedBookings(historicalGrid);
        }
        console.log(
          "✅ [VERSION GRID] Reconstructed",
          historicalGrid.length,
          "bookings"
        );
      } catch (error) {
        console.error("❌ [VERSION GRID] Failed to reconstruct grid:", error);
        if (!isCancelled) {
          setReconstructedBookings([]);
        }
      } finally {
        if (!isCancelled) {
          setIsReconstructing(false);
        }
      }
    };

    reconstructGrid();
    return () => {
      isCancelled = true;
    };
  }, [selectedVersionId, versions, allBookingsData]);

  // Create version-highlighted data showing all bookings with historical state
  const versionData = useMemo<VersionHighlightedData[]>(() => {
    // Find the selected version
    const selectedVersion = versions.find((v) => v.id === selectedVersionId);

    if (!selectedVersion || reconstructedBookings.length === 0) {
      return [];
    }

    // Get the booking ID from the selected version
    const versionBookingId = selectedVersion.documentSnapshot.id;

    // Check if this is a bulk operation and extract metadata when available
    const bulkMetadata = isBulkOperationMetadata(selectedVersion.metadata)
      ? selectedVersion.metadata
      : undefined;
    const isBulkOperation = !!bulkMetadata;
    const isRestoreOperation =
      selectedVersion.metadata.changeType === "restore";
    const bulkAffectedIds =
      bulkMetadata?.bulkOperation?.affectedBookingIds ?? [];

    // Map reconstructed bookings and add version info to highlight changes
    let mappedData = reconstructedBookings.map(
      (booking): VersionHighlightedData => {
        const isVersionedBooking = booking.id === versionBookingId;
        const isBulkAffectedBooking =
          isBulkOperation && bulkAffectedIds.includes(booking.id);
        const isRestoreAffectedBooking = isRestoreOperation;

        const originalRowValue = (() => {
          if (typeof booking._originalRow === "number") {
            return booking._originalRow;
          }

          if (typeof booking.row === "number" && Number.isFinite(booking.row)) {
            return booking.row;
          }

          if (typeof booking.row === "string") {
            const parsed = Number(booking.row);
            return Number.isFinite(parsed) ? parsed : undefined;
          }

          return undefined;
        })();

        // Debug: Log the versioned booking data
        if (isVersionedBooking) {
          console.log(`🔍 [VERSION DATA] Versioned booking ${booking.id}:`, {
            bookingId: booking.id,
            changedFields: selectedVersion.changes.map((c) => c.fieldPath),
            changeValues: selectedVersion.changes.map((c) => ({
              field: c.fieldPath,
              oldValue: c.oldValue,
              newValue: c.newValue,
            })),
            bookingKeys: Object.keys(booking).slice(0, 30),
            sampleBookingValues: {
              firstName: booking.firstName,
              bookingType: booking.bookingType,
              bookingCode: booking.bookingCode,
              customerName: booking.customerName,
              email: booking.email,
              emailAddress: booking.emailAddress,
            },
            rawBookingObject: booking,
          });
        }

        return {
          ...booking,
          _originalRow: Number.isFinite(originalRowValue)
            ? Number(originalRowValue)
            : undefined,
          _versionInfo:
            isVersionedBooking ||
            isBulkAffectedBooking ||
            isRestoreAffectedBooking
              ? {
                  versionId: selectedVersion.id,
                  versionNumber: selectedVersion.versionNumber,
                  isRestorePoint: selectedVersion.metadata.isRestorePoint,
                  changedFields: isBulkOperation
                    ? ["_bulk_operation"]
                    : isRestoreOperation
                    ? ["_restore_operation"]
                    : selectedVersion.changes.map((change) => change.fieldPath),
                  metadata: selectedVersion.metadata,
                }
              : undefined,
        } as VersionHighlightedData;
      }
    );

    if (selectedVersion.metadata.changeType === "delete") {
      const deletedBookingId = selectedVersion.documentSnapshot.id;
      const existingIndex = mappedData.findIndex(
        (row) => row.id === deletedBookingId
      );

      if (existingIndex === -1) {
        const deletedSnapshot =
          selectedVersion.documentSnapshot as VersionHighlightedData;

        const deletedRow: VersionHighlightedData = {
          ...deletedSnapshot,
          _versionInfo: {
            versionId: selectedVersion.id,
            versionNumber: selectedVersion.versionNumber,
            isRestorePoint: selectedVersion.metadata.isRestorePoint,
            changedFields: ["_row_deleted"],
            metadata: selectedVersion.metadata,
          },
          _originalRow: (deletedSnapshot as Record<string, any>).row ?? null,
        };

        if (typeof deletedRow.row !== "number") {
          const snapshotRow = (deletedSnapshot as Record<string, any>).row;
          if (typeof snapshotRow === "number") {
            deletedRow.row = snapshotRow;
          } else if (typeof snapshotRow === "string") {
            const parsedRow = Number(snapshotRow);
            deletedRow.row = Number.isFinite(parsedRow) ? parsedRow : 0;
          } else {
            deletedRow.row = 0;
          }
        }

        mappedData = [...mappedData, deletedRow];
      }
    }

    const parseNumericRow = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      return undefined;
    };

    const getSortKey = (row: VersionHighlightedData): number => {
      const original = parseNumericRow(row._originalRow);
      if (original !== undefined) {
        return original;
      }

      const current = parseNumericRow(row.row);
      if (current !== undefined) {
        return current;
      }

      return Number.MAX_SAFE_INTEGER;
    };

    const sortedData = [...mappedData].sort(
      (a, b) => getSortKey(a) - getSortKey(b)
    );

    let nextRowNumber = 1;
    const reindexedData = sortedData.map((booking) => {
      const originalRow =
        parseNumericRow(booking._originalRow) ?? parseNumericRow(booking.row);

      const updatedBooking: VersionHighlightedData = {
        ...booking,
        row: nextRowNumber,
      };

      if (originalRow !== undefined) {
        updatedBooking._originalRow = originalRow;
      }

      nextRowNumber += 1;
      return updatedBooking;
    });

    return reindexedData;
  }, [versions, selectedVersionId, reconstructedBookings]);

  // Load comparison when comparison version changes
  useEffect(() => {
    if (
      selectedVersionId &&
      comparisonVersionId &&
      selectedVersionId !== comparisonVersionId
    ) {
      setIsLoadingComparison(true);
      bookingVersionHistoryService
        .compareVersions(comparisonVersionId, selectedVersionId)
        .then(setComparison)
        .catch((error) => {
          console.error("Failed to load version comparison:", error);
          setComparison(null);
        })
        .finally(() => setIsLoadingComparison(false));
    } else {
      setComparison(null);
    }
  }, [selectedVersionId, comparisonVersionId]);

  // Scroll to the changed row when version changes
  useEffect(() => {
    if (
      !selectedVersionId ||
      !gridContainerRef.current ||
      versionData.length === 0
    ) {
      return;
    }

    // Find the selected version to get the booking ID
    const selectedVersion = versions.find((v) => v.id === selectedVersionId);
    if (!selectedVersion) return;

    const versionBookingId = selectedVersion.documentSnapshot.id;

    // Find the index of the changed booking in the data
    const changedRowIndex = versionData.findIndex(
      (row) => row.id === versionBookingId
    );

    if (changedRowIndex === -1) return;

    // Scroll to the row and column (add small delay to ensure grid is rendered)
    setTimeout(() => {
      const grid = gridContainerRef.current?.querySelector(".rdg");
      if (!grid) return;

      // Calculate the vertical scroll position
      // Each row is 40px (rowHeight) + header is 80px
      const headerHeight = 80;
      const rowHeight = 40;
      const scrollTop = changedRowIndex * rowHeight;

      // Calculate horizontal scroll position to first changed column
      if (selectedVersion.changes && selectedVersion.changes.length > 0) {
        const firstChangedFieldPath = selectedVersion.changes[0].fieldPath;

        // Find the column index for the changed field
        const sortedColumns = columns
          .filter((col) => col && col.id && col.columnName)
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        const changedColumnIndex = sortedColumns.findIndex(
          (col) => col.id === firstChangedFieldPath
        );

        if (changedColumnIndex !== -1) {
          // Calculate horizontal scroll position
          // Account for columns before the changed one
          let scrollLeft = 0;
          for (let i = 0; i < changedColumnIndex; i++) {
            scrollLeft += sortedColumns[i].width || 150;
          }

          // Add buffer space to the left (show previous column for context)
          // Subtract one column width or 200px (whichever is smaller) to show space to the left
          const leftBuffer = Math.min(
            changedColumnIndex > 0
              ? sortedColumns[changedColumnIndex - 1].width || 150
              : 0,
            200
          );
          scrollLeft = Math.max(0, scrollLeft - leftBuffer);

          // Scroll both vertically and horizontally
          grid.scrollTo({
            top: scrollTop,
            left: scrollLeft,
            behavior: "smooth",
          });

          console.log("🔍 [VERSION GRID] Auto-scrolled to changed column:", {
            column: firstChangedFieldPath,
            columnIndex: changedColumnIndex,
            scrollLeft,
            scrollTop,
            leftBuffer,
          });
        } else {
          // If column not found, just scroll vertically
          grid.scrollTo({
            top: scrollTop,
            behavior: "smooth",
          });
        }
      } else {
        // No changes, just scroll vertically
        grid.scrollTo({
          top: scrollTop,
          behavior: "smooth",
        });
      }
    }, 100);
  }, [selectedVersionId, versionData, versions, columns]);

  // Helper function to get change type for a field
  const getFieldChangeType = useCallback(
    (
      fieldPath: string,
      versionInfo: VersionHighlightedData["_versionInfo"]
    ) => {
      if (!versionInfo) return null;

      if (versionInfo.metadata?.changeType === "restore") {
        return "changed";
      }

      // Debug logging for specific fields
      if (fieldPath === "customerName" || fieldPath === "email") {
        console.log(`🔍 [CHANGE TYPE DEBUG] Field: ${fieldPath}`, {
          changedFields: versionInfo.changedFields,
          isIncluded: versionInfo.changedFields.includes(fieldPath),
          versionId: versionInfo.versionId,
        });
      }

      // Check if field changed in this version
      if (versionInfo.changedFields.includes(fieldPath)) {
        return "changed";
      }

      // Check if field changed in comparison
      if (comparison) {
        const isChanged = comparison.changedFields.some(
          (change) => change.fieldPath === fieldPath
        );
        if (isChanged) return "comparison";
      }

      return null;
    },
    [comparison]
  );

  // Helper function to get change details for tooltip
  const getChangeDetails = useCallback(
    (
      fieldPath: string,
      versionInfo: VersionHighlightedData["_versionInfo"]
    ) => {
      if (!versionInfo) return null;

      const version = versions.find((v) => v.id === versionInfo.versionId);
      if (!version) return null;

      const change = version.changes.find((c) => c.fieldPath === fieldPath);
      if (!change) {
        if (version.metadata.changeType === "restore") {
          return {
            fieldName: fieldPath,
            oldValue: undefined,
            newValue: "Restored from historical snapshot",
            dataType: "string",
          };
        }
        return null;
      }

      return {
        fieldName: change.fieldName,
        oldValue: change.oldValue,
        newValue: change.newValue,
        dataType: change.dataType,
      };
    },
    [versions]
  );

  // Version info column is now removed since we have a sidebar for version selection

  // Row number column (similar to BookingsDataGrid)
  const rowNumberColumn: Column<VersionHighlightedData> = {
    key: "row",
    name: "Row #",
    width: 80,
    minWidth: 60,
    maxWidth: 100,
    resizable: true,
    sortable: false,
    frozen: true,
    renderCell: ({ row }) => {
      const rowNumber = row.row;
      const versionInfo = row._versionInfo;
      const hasVersionInfo = !!versionInfo;
      const isNewBooking = versionInfo?.metadata?.changeType === "create";
      const isDeletedBooking = versionInfo?.metadata?.changeType === "delete";
      const isBulkOperation =
        versionInfo?.metadata?.changeType?.startsWith("bulk_");
      const isRestoreOperation =
        versionInfo?.metadata?.changeType === "restore";

      return (
        <div
          className={`h-full w-full flex items-center justify-center text-xs font-mono px-2 bg-muted/50 border-r border-border relative ${
            hasVersionInfo
              ? isDeletedBooking
                ? "bg-red-200 border-2 border-red-500"
                : isNewBooking
                ? "bg-green-200"
                : isBulkOperation
                ? "bg-blue-200 border-2 border-blue-500"
                : isRestoreOperation
                ? "bg-blue-200 border-2 border-blue-400"
                : "bg-yellow-200"
              : "opacity-40"
          }`}
          title={`Row ${rowNumber} (Booking ID: ${row.id})${
            hasVersionInfo
              ? isDeletedBooking
                ? " - Deleted Booking"
                : isNewBooking
                ? " - New Booking"
                : isBulkOperation
                ? " - Bulk Operation"
                : isRestoreOperation
                ? " - Restored State"
                : " - Has Changes"
              : ""
          }`}
        >
          <span className="font-semibold text-royal-purple relative z-10">
            {typeof rowNumber === "number" ? rowNumber : "-"}
          </span>
        </div>
      );
    },
    renderHeaderCell: () => (
      <div className="h-full w-full flex items-center justify-center text-xs font-semibold bg-muted border-r border-border">
        Row #
      </div>
    ),
  };

  // Convert SheetColumn to react-data-grid Column format with change highlighting
  const gridColumns = useMemo<Column<VersionHighlightedData>[]>(() => {
    // Safety check for columns
    if (!columns || !Array.isArray(columns)) {
      return [rowNumberColumn];
    }

    const dataColumns = columns
      .filter(
        (col) => col && col.id && col.columnName
        // Note: We intentionally show ALL columns in version history, including hidden ones
        // This allows users to see changes in hidden columns
      )
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .map((col) => {
        const baseColumn: Column<VersionHighlightedData> = {
          key: col.id,
          name: col.columnName,
          width: col.width || 150,
          minWidth: 50,
          maxWidth: 3000,
          resizable: true,
          sortable: false,
        };

        // Add group-based background styling for cells
        const parentTab = col.parentTab || "General";
        const sortedColumns = columns
          .filter((c) => c && c.id && c.columnName)
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        const currentIndex = sortedColumns.findIndex((c) => c.id === col.id);
        const isFirstInGroup =
          currentIndex === 0 ||
          sortedColumns[currentIndex - 1].parentTab !== parentTab;
        const isLastInGroup =
          currentIndex === sortedColumns.length - 1 ||
          sortedColumns[currentIndex + 1].parentTab !== parentTab;

        // Apply group-based cell styling
        let cellClass = "";
        if (isFirstInGroup && isLastInGroup) {
          cellClass = "bg-gray-100 border-l border-r border-gray-300";
        } else if (isFirstInGroup) {
          cellClass = "bg-gray-100 border-l border-r border-gray-300";
        } else if (isLastInGroup) {
          cellClass = "bg-gray-100 border-l border-r border-gray-300";
        } else {
          cellClass = "bg-gray-100 border-l border-r border-gray-300";
        }

        // Override with individual column color if specified
        if (col.color && col.color !== "none") {
          const colorClasses = {
            purple:
              "bg-royal-purple/8 border-l border-r border-royal-purple/40",
            blue: "bg-blue-100 border-l border-r border-royal-purple/40",
            green: "bg-green-100 border-l border-r border-royal-purple/40",
            yellow: "bg-yellow-100 border-l border-r border-royal-purple/40",
            orange: "bg-orange-100 border-l border-r border-royal-purple/40",
            red: "bg-red-100 border-l border-r border-royal-purple/40",
            pink: "bg-pink-100 border-l border-r border-royal-purple/40",
            cyan: "bg-cyan-100 border-l border-r border-royal-purple/40",
            gray: "bg-gray-100 border-l border-r border-royal-purple/40",
          };
          cellClass = colorClasses[col.color] || cellClass;
        }

        // Apply cell styling with change highlighting
        (baseColumn as any).cellClass = (row: VersionHighlightedData) => {
          const versionInfo = row._versionInfo;
          const changeType = getFieldChangeType(col.id, versionInfo);
          const isNewBooking = versionInfo?.metadata?.changeType === "create";
          const isDeletedBooking =
            versionInfo?.metadata?.changeType === "delete";
          const isBulkOperation =
            versionInfo?.metadata?.changeType?.startsWith("bulk_");
          const isRestoreOperation =
            versionInfo?.metadata?.changeType === "restore";

          const classes = [cellClass];

          // If this is a deleted booking, highlight all cells in red
          if (isDeletedBooking) {
            classes.push("bg-red-200 border-2 border-red-500 relative");
          }
          // If this is a bulk operation, highlight all cells in blue
          else if (isBulkOperation) {
            classes.push("bg-blue-200 border-2 border-blue-500 relative");
          }
          // If this is a restore operation, highlight all cells in blue
          else if (isRestoreOperation) {
            classes.push("bg-blue-100 border-2 border-blue-500 relative");
          }
          // If this is a newly created booking, highlight all cells
          else if (isNewBooking) {
            classes.push("bg-green-200 border-2 border-green-500 relative");
          }
          // If this cell was changed in the selected version, highlight it brightly
          else if (changeType === "changed") {
            classes.push("bg-yellow-200 border-2 border-yellow-500 relative");
          } else if (changeType === "comparison") {
            classes.push("bg-orange-200 border-2 border-orange-500 relative");
          } else {
            // Dim all cells that were not changed (including all rows)
            classes.push("opacity-40 relative");
          }

          return classes.join(" ");
        };

        // Add custom header with parent tab
        baseColumn.renderHeaderCell = ({ column }) => {
          const parentTab = col.parentTab || "General";
          const sortedColumns = columns
            .filter((c) => c && c.id && c.columnName)
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
          const currentIndex = sortedColumns.findIndex((c) => c.id === col.id);
          const isFirstInGroup =
            currentIndex === 0 ||
            sortedColumns[currentIndex - 1].parentTab !== parentTab;
          const isLastInGroup =
            currentIndex === sortedColumns.length - 1 ||
            sortedColumns[currentIndex + 1].parentTab !== parentTab;

          let parentTabWidth = column.width || 150;
          if (isFirstInGroup && !isLastInGroup) {
            let groupWidth = 0;
            for (let i = currentIndex; i < sortedColumns.length; i++) {
              if (sortedColumns[i].parentTab === parentTab) {
                groupWidth += sortedColumns[i].width || 150;
              } else {
                break;
              }
            }
            parentTabWidth = groupWidth;
          }

          return (
            <div className="flex flex-col w-full h-full relative">
              {/* Parent Tab Row */}
              {isFirstInGroup && isLastInGroup && (
                <div
                  className="bg-gray-400 border-r border-l border-gray-900 px-2 py-1 text-xs font-semibold text-white uppercase tracking-wide absolute top-0 left-0 z-10 flex items-center"
                  style={{ height: "40px" }}
                >
                  <div className="z-[999999999] flex items-center justify-center w-full">
                    {parentTab}
                  </div>
                </div>
              )}
              {isFirstInGroup && !isLastInGroup && (
                <div
                  className="bg-gray-400 border-r border-gray-900 px-2 py-1 text-xs font-semibold text-white uppercase tracking-wide absolute top-0 left-0 z-10 flex items-center"
                  style={{
                    width: `${parentTabWidth}px`,
                    height: "40px",
                  }}
                >
                  <div className="z-[999999999] flex items-center justify-center">
                    {parentTab}
                  </div>
                </div>
              )}
              {!isFirstInGroup && (
                <div
                  className="bg-gray-400 absolute top-0 left-0 z-5 w-full"
                  style={{ height: "40px" }}
                />
              )}
              {isLastInGroup && (
                <div
                  className="bg-gray-400 border-r border-gray-900 absolute top-0 left-0 z-5 w-full"
                  style={{ height: "40px" }}
                />
              )}

              {/* Column Name Row */}
              <div className="flex items-center justify-center flex-1 px-2 mt-10 bg-black text-white gap-1">
                <span className="font-medium text-xs">{column.name}</span>
                {col.showColumn === false && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Eye className="h-3 w-3 text-gray-400 opacity-60" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          This column is hidden in the main grid
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          );
        };

        // Add header height styling
        (baseColumn as any).headerCellClass = "bg-black h-20 !p-0 text-xs";

        // Render cell with change highlighting and tooltips
        baseColumn.renderCell = ({ row, column }) => {
          const cellValue = row[column.key as keyof VersionHighlightedData];
          const versionInfo = row._versionInfo;
          const changeType = getFieldChangeType(col.id, versionInfo);
          const changeDetails = getChangeDetails(col.id, versionInfo);

          // Debug logging for specific fields like firstName
          if (
            col.id === "firstName" ||
            col.id === "bookingType" ||
            col.id === "bookingCode"
          ) {
            console.log(`🔍 [CELL RENDER] ${col.id} - BookingId: ${row.id}`, {
              columnKey: column.key,
              colId: col.id,
              cellValue,
              cellValueType: typeof cellValue,
              changeType,
              hasVersionInfo: !!versionInfo,
              changedFields: versionInfo?.changedFields,
              isInChangedFields: versionInfo?.changedFields?.includes(col.id),
              rowKeys: Object.keys(row).slice(0, 20),
              directAccess: row[col.id as keyof VersionHighlightedData],
              hasChangeDetails: !!changeDetails,
              changeDetailsNewValue: changeDetails?.newValue,
            });
          }

          let displayValue = "";
          if (cellValue !== null && cellValue !== undefined) {
            if (col.dataType === "date" && cellValue) {
              try {
                let date: Date | null = null;
                if (
                  cellValue &&
                  typeof cellValue === "object" &&
                  "toDate" in cellValue &&
                  typeof (cellValue as any).toDate === "function"
                ) {
                  date = (cellValue as any).toDate();
                } else if (
                  cellValue &&
                  typeof cellValue === "object" &&
                  "seconds" in cellValue &&
                  typeof (cellValue as any).seconds === "number"
                ) {
                  date = new Date((cellValue as any).seconds * 1000);
                } else if (typeof cellValue === "number") {
                  if (cellValue > 1000000000000) {
                    date = new Date(cellValue);
                  } else {
                    date = new Date(cellValue * 1000);
                  }
                } else if (typeof cellValue === "string") {
                  const numericValue = parseFloat(cellValue);
                  if (!isNaN(numericValue)) {
                    if (numericValue > 1000000000000) {
                      date = new Date(numericValue);
                    } else {
                      date = new Date(numericValue * 1000);
                    }
                  } else {
                    date = new Date(cellValue);
                  }
                } else if (cellValue instanceof Date) {
                  date = cellValue;
                }
                if (date && !isNaN(date.getTime())) {
                  displayValue = date.toLocaleDateString();
                }
              } catch {
                displayValue = cellValue.toString();
              }
            } else if (col.dataType === "boolean") {
              displayValue = cellValue ? "✓" : "✗";
            } else if (col.dataType === "currency") {
              const numValue =
                typeof cellValue === "number"
                  ? cellValue
                  : parseFloat(cellValue?.toString() || "0");
              displayValue = isNaN(numValue) ? "0" : numValue.toFixed(2);
            } else {
              displayValue = cellValue.toString();
            }
          }

          const cellContent = (
            <div className="h-8 w-full flex items-center px-2 text-xs relative">
              {changeType && (
                <div className="absolute top-0 right-0 w-0 h-0 border-l-[8px] border-l-transparent border-t-[8px] border-t-current z-10" />
              )}
              <span className="truncate">{displayValue}</span>
            </div>
          );

          if (changeDetails) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1">
                      <div className="font-semibold">
                        {changeDetails.fieldName}
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-red-600">Old:</span>
                          <span>
                            {changeDetails.oldValue?.toString() || "(empty)"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowRight className="h-3 w-3" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">New:</span>
                          <span>
                            {changeDetails.newValue?.toString() || "(empty)"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return cellContent;
        };

        return baseColumn;
      });

    return [rowNumberColumn, ...dataColumns];
  }, [
    columns,
    rowNumberColumn,
    selectedVersionId,
    comparisonVersionId,
    onVersionSelect,
    onVersionRestore,
    onVersionCompare,
    isRestoring,
    getFieldChangeType,
    getChangeDetails,
  ]);

  // Get the version info to show which booking has changes
  // Must be before early returns to maintain hook order
  const selectedVersion = useMemo(() => {
    return versions.find((v) => v.id === selectedVersionId);
  }, [versions, selectedVersionId]);

  const selectedBulkMetadata =
    selectedVersion && isBulkOperationMetadata(selectedVersion.metadata)
      ? selectedVersion.metadata
      : undefined;
  const selectedBulkOperation = selectedBulkMetadata?.bulkOperation;

  // Show message if no version is selected
  if (!selectedVersionId) {
    return (
      <div className={`version-history-grid ${className}`}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <History className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">No Version Selected</p>
          <p className="text-sm mt-2">
            Select a version from the sidebar to view its data
          </p>
        </div>
      </div>
    );
  }

  // Show loading indicator while reconstructing grid state
  if (isReconstructing) {
    return (
      <div className={`version-history-grid ${className}`}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <RefreshCw className="h-16 w-16 mb-4 opacity-50 animate-spin" />
          <p className="text-lg font-medium">Loading Historical State...</p>
          <p className="text-sm mt-2">
            Reconstructing grid data at selected timestamp
          </p>
        </div>
      </div>
    );
  }

  // Show message if we have no bookings data
  if (versionData.length === 0) {
    return (
      <div className={`version-history-grid ${className}`}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <History className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">No Bookings Data Available</p>
          <p className="text-sm mt-2">
            There are no bookings to display for this version
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`version-history-grid ${className}`}>
      {/* Version Info Banner */}
      {selectedVersion && (
        <div
          className={`mb-4 p-3 rounded-md border ${
            selectedVersion.metadata.changeType === "delete"
              ? "bg-red-50 border-red-200"
              : selectedVersion.metadata.changeType === "create"
              ? "bg-green-50 border-green-200"
              : selectedVersion.metadata.changeType === "restore"
              ? "bg-blue-50 border-blue-200"
              : selectedVersion.metadata.changeType?.startsWith("bulk_")
              ? "bg-blue-50 border-blue-200"
              : "bg-yellow-50 border-yellow-200"
          }`}
        >
          <div
            className={`text-sm ${
              selectedVersion.metadata.changeType === "delete"
                ? "text-red-800"
                : selectedVersion.metadata.changeType === "create"
                ? "text-green-800"
                : selectedVersion.metadata.changeType === "restore"
                ? "text-blue-800"
                : selectedVersion.metadata.changeType?.startsWith("bulk_")
                ? "text-blue-800"
                : "text-yellow-800"
            }`}
          >
            <strong>Viewing complete grid state at:</strong>{" "}
            {new Date(
              selectedVersion.metadata.createdAt?.seconds
                ? selectedVersion.metadata.createdAt.seconds * 1000
                : Date.now()
            ).toLocaleString()}
            <div className="mt-1">
              {selectedVersion.metadata.changeType?.startsWith("bulk_") ? (
                <>
                  <strong>Bulk Operation:</strong>{" "}
                  <span className="font-semibold">
                    {selectedVersion.metadata.changeDescription}
                  </span>
                  {selectedBulkOperation && (
                    <>
                      {" • "}
                      <span className="font-semibold">
                        {selectedBulkOperation.totalCount} booking
                        {selectedBulkOperation.totalCount !== 1 ? "s" : ""}{" "}
                        affected
                      </span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <strong>
                    {selectedVersion.metadata.changeType === "delete"
                      ? "Deleted"
                      : selectedVersion.metadata.changeType === "create"
                      ? "Created"
                      : selectedVersion.metadata.changeType === "restore"
                      ? "Restored"
                      : "Changed"}{" "}
                    booking:
                  </strong>{" "}
                  {selectedVersion.metadata.changeType === "restore" ? (
                    <>
                      <span className="font-semibold">
                        Grid restored to historical state
                      </span>
                      {" • "}
                      <span className="text-xs">
                        {versionData.length} booking
                        {versionData.length !== 1 ? "s" : ""} restored
                      </span>
                    </>
                  ) : (
                    <>
                      ID{" "}
                      <span className="font-mono">
                        {selectedVersion.documentSnapshot.id}
                      </span>
                      {" • "}
                      <span className="font-semibold">
                        {selectedVersion.metadata.changeType === "create" ? (
                          "New booking created"
                        ) : (
                          <>
                            {selectedVersion.changes.length} field
                            {selectedVersion.changes.length !== 1
                              ? "s"
                              : ""}{" "}
                            {selectedVersion.metadata.changeType === "delete"
                              ? "before deletion"
                              : "modified"}
                          </>
                        )}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
            <div
              className={`text-xs mt-2 ${
                selectedVersion.metadata.changeType === "delete"
                  ? "text-red-700"
                  : selectedVersion.metadata.changeType === "create"
                  ? "text-green-700"
                  : selectedVersion.metadata.changeType === "restore"
                  ? "text-blue-700"
                  : selectedVersion.metadata.changeType?.startsWith("bulk_")
                  ? "text-blue-700"
                  : "text-yellow-700"
              }`}
            >
              ✨ Showing {versionData.length} booking
              {versionData.length !== 1 ? "s" : ""} as they existed at this
              moment in time.{" "}
              {selectedVersion.metadata.changeType === "delete"
                ? "Deleted booking is highlighted in red."
                : selectedVersion.metadata.changeType === "create"
                ? "New booking is highlighted in green."
                : selectedVersion.metadata.changeType === "restore"
                ? "All restored bookings are highlighted in blue."
                : selectedVersion.metadata.changeType?.startsWith("bulk_")
                ? "Bulk operation affected bookings are highlighted in blue."
                : "Changed cells are highlighted in yellow."}
            </div>
          </div>
        </div>
      )}

      {/* Comparison Status */}
      {isLoadingComparison && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center gap-2">
            <Progress value={undefined} className="flex-1" />
            <span className="text-sm text-blue-700">Loading comparison...</span>
          </div>
        </div>
      )}

      {comparison && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="text-sm text-yellow-800">
            <strong>Comparing:</strong> v{comparison.fromVersion.versionNumber}{" "}
            → v{comparison.toVersion.versionNumber}
            {comparison.changedFields.length > 0 && (
              <span className="ml-2">
                ({comparison.changedFields.length} field
                {comparison.changedFields.length !== 1 ? "s" : ""} changed)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Data Grid */}
      <div
        ref={gridContainerRef}
        className="border border-royal-purple/20 rounded-md shadow-lg overflow-hidden"
      >
        <TooltipProvider>
          <DataGrid
            columns={gridColumns}
            rows={versionData}
            headerRowHeight={80}
            rowHeight={40}
            className="rdg-light custom-grid version-history-grid"
            style={
              {
                height: 600,
                "--rdg-border-color": "hsl(var(--border))",
                "--rdg-header-background-color": "hsl(var(--muted))",
                "--rdg-row-hover-background-color": "hsl(var(--muted) / 0.5)",
                "--rdg-cell-frozen-background-color": "hsl(var(--background))",
                "--rdg-row-border-color": "hsl(var(--border))",
                "--rdg-background-color": "hsl(var(--background))",
                "--rdg-text-color": "hsl(var(--foreground))",
                "--rdg-header-text-color": "hsl(var(--foreground))",
              } as React.CSSProperties
            }
            renderers={{
              noRowsFallback: (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <p>No version history available</p>
                </div>
              ),
            }}
          />
        </TooltipProvider>
      </div>
    </div>
  );
}
