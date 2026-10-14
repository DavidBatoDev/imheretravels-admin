import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  Timestamp,
  Unsubscribe,
  DocumentData,
  serverTimestamp,
  getCountFromServer,
} from "firebase/firestore";
import {
  BookingVersionSnapshot,
  CreateVersionOptions,
  RestoreVersionOptions,
  RestoreResult,
  VersionHistoryFilters,
  VersionHistoryQueryOptions,
  FieldChange,
  BranchInfo,
  VersionComparison,
  BulkOperationOptions,
  BulkOperationMetadata,
} from "@/types/version-history";
import { SheetData } from "@/types/sheet-management";
import { bookingService } from "./booking-service";

// ============================================================================
// COLLECTION CONSTANTS
// ============================================================================

const VERSIONS_COLLECTION = "bookingVersions";
const BOOKINGS_COLLECTION = "bookings";

// ============================================================================
// VERSION HISTORY SERVICE INTERFACE
// ============================================================================

export interface BookingVersionHistoryService {
  // Version creation
  createVersionSnapshot(
    bookingId: string,
    documentSnapshot: SheetData,
    options: CreateVersionOptions,
    columns?: any[] // Optional column definitions for determining data types
  ): Promise<string>;

  // Version retrieval
  getVersion(versionId: string): Promise<BookingVersionSnapshot | null>;
  getVersionsForBooking(
    bookingId: string,
    options?: VersionHistoryQueryOptions
  ): Promise<BookingVersionSnapshot[]>;
  getAllVersions(
    options?: VersionHistoryQueryOptions
  ): Promise<BookingVersionSnapshot[]>;

  // Version comparison
  compareVersions(
    fromVersionId: string,
    toVersionId: string
  ): Promise<VersionComparison>;

  // Version restoration
  restoreVersion(
    bookingId: string | undefined,
    options: RestoreVersionOptions
  ): Promise<RestoreResult>;

  // Real-time listeners
  subscribeToBookingVersions(
    bookingId: string,
    callback: (versions: BookingVersionSnapshot[]) => void,
    options?: VersionHistoryQueryOptions
  ): Unsubscribe;

  subscribeToAllVersions(
    callback: (versions: BookingVersionSnapshot[]) => void,
    options?: VersionHistoryQueryOptions
  ): Unsubscribe;

  // Utility methods
  getLatestVersion(bookingId: string): Promise<BookingVersionSnapshot | null>;
  getVersionCount(bookingId: string): Promise<number>;
  detectFieldChanges(
    oldDocument: SheetData,
    newDocument: SheetData
  ): FieldChange[];

  // Grid state reconstruction
  getGridStateAtTimestamp(
    timestamp: Date | number,
    currentBookings: SheetData[],
    upToVersionId?: string
  ): Promise<SheetData[]>;

  // Bulk operations
  createBulkOperationSnapshot(options: BulkOperationOptions): Promise<string>;
}

// ============================================================================
// VERSION HISTORY SERVICE IMPLEMENTATION
// ============================================================================

class BookingVersionHistoryServiceImpl implements BookingVersionHistoryService {
  private normalizeTimestamp(value: any): number {
    if (!value) return 0;

    if (typeof value === "number") {
      return value;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "object") {
      if (typeof value.toMillis === "function") {
        return value.toMillis();
      }

      if (typeof value.toDate === "function") {
        try {
          return value.toDate().getTime();
        } catch (error) {
          return 0;
        }
      }

      if (typeof value.seconds === "number") {
        const nanos =
          typeof value.nanoseconds === "number" ? value.nanoseconds : 0;
        return value.seconds * 1000 + Math.floor(nanos / 1_000_000);
      }
    }

    return 0;
  }

  private getVersionTimestamp(version: BookingVersionSnapshot): number {
    return this.normalizeTimestamp(version.metadata?.createdAt);
  }

  private async reconstructBookingStateAtTimestamp(
    bookingId: string,
    targetTime: number,
    versionAtTarget?: BookingVersionSnapshot
  ): Promise<SheetData | null> {
    const versions = await this.getVersionsForBooking(bookingId);

    if (versions.length === 0) {
      return versionAtTarget?.documentSnapshot
        ? ({ ...versionAtTarget.documentSnapshot } as SheetData)
        : null;
    }

    versions.sort(
      (a, b) => this.getVersionTimestamp(a) - this.getVersionTimestamp(b)
    );

    const currentBookingDoc = await bookingService.getBooking(bookingId);
    const currentBooking = currentBookingDoc
      ? ({ ...currentBookingDoc } as SheetData)
      : null;

    const createVersion = versions.find(
      (v) => v.metadata.changeType === "create"
    );
    let createdTime = 0;

    if (createVersion) {
      createdTime = this.getVersionTimestamp(createVersion);
    } else if (currentBooking?.createdAt) {
      createdTime = this.normalizeTimestamp(currentBooking.createdAt);
    }

    if (createdTime > targetTime) {
      return null;
    }

    const deleteVersion = versions.find(
      (v) => v.metadata.changeType === "delete"
    );
    const deletionTime =
      deleteVersion !== undefined
        ? this.getVersionTimestamp(deleteVersion)
        : null;

    const baseSnapshot = () => {
      if (versionAtTarget?.metadata.changeType === "delete") {
        return { ...versionAtTarget.documentSnapshot } as Record<string, any>;
      }

      const versionsBeforeOrAtTarget = versions.filter((version) => {
        const versionTime = this.getVersionTimestamp(version);

        if (version.metadata.changeType === "delete") {
          return versionTime < targetTime;
        }

        return versionTime <= targetTime;
      });

      if (versionsBeforeOrAtTarget.length > 0) {
        const lastVersion =
          versionsBeforeOrAtTarget[versionsBeforeOrAtTarget.length - 1];
        return { ...lastVersion.documentSnapshot } as Record<string, any>;
      }

      if (currentBooking) {
        return { ...currentBooking } as Record<string, any>;
      }

      if (deleteVersion && deletionTime !== null && deletionTime > targetTime) {
        return { ...deleteVersion.documentSnapshot } as Record<string, any>;
      }

      return null;
    };

    const reconstructedState = baseSnapshot();

    if (!reconstructedState) {
      return null;
    }

    if (!reconstructedState.id) {
      reconstructedState.id = bookingId;
    }

    const versionsAfterTarget = versions.filter((version) => {
      const versionTime = this.getVersionTimestamp(version);
      return versionTime > targetTime;
    });

    const sortedVersionsAfterTarget = [...versionsAfterTarget].sort(
      (a, b) => this.getVersionTimestamp(b) - this.getVersionTimestamp(a)
    );

    for (const version of sortedVersionsAfterTarget) {
      if (version.metadata.changeType === "delete") {
        // Undo deletion: baseline already represents the state that existed before deletion
        continue;
      }

      for (const change of version.changes) {
        const fieldPath = change.fieldPath;

        if (fieldPath.startsWith("_")) {
          continue;
        }

        const oldValue = change.oldValue;

        if (oldValue === null || oldValue === undefined) {
          delete reconstructedState[fieldPath];
        } else {
          reconstructedState[fieldPath] = oldValue;
        }
      }
    }

    return reconstructedState as SheetData;
  }

  // ========================================================================
  // VERSION CREATION
  // ========================================================================

  async createVersionSnapshot(
    bookingId: string,
    documentSnapshot: SheetData,
    options: CreateVersionOptions,
    columns?: any[] // Optional column definitions for determining data types
  ): Promise<string> {
    try {
      // console.log("🔍 [VERSION SERVICE] Creating version snapshot:", {
      //   bookingId,
      //   changeType: options.changeType,
      //   description: options.changeDescription,
      // });
      // Use a simple counter approach for version numbers to avoid expensive queries
      // We'll use timestamp + random to ensure uniqueness instead of sequential numbers
      const versionNumber = Date.now() + Math.floor(Math.random() * 1000);
      // console.log(
      //   "🔍 [VERSION SERVICE] Generated version number:",
      //   versionNumber
      // );

      // For performance, skip change detection unless explicitly provided
      let changes = options.changedFields || [];

      // Special handling for "create" change type
      if (options.changeType === "create" && changes.length === 0) {
        // console.log(
        //   "🔍 [VERSION SERVICE] Creating 'Added new row' change for create operation"
        // );

        // Create a single descriptive change entry for row creation
        changes = [
          {
            fieldPath: "_row_created",
            fieldName: "Row Created",
            oldValue: null,
            newValue: "Added new row",
            dataType: "string",
          },
        ];
      }
      // Special handling for "delete" change type
      else if (options.changeType === "delete" && changes.length === 0) {
        // console.log(
        //   "🔍 [VERSION SERVICE] Creating 'Deleted row' change for delete operation"
        // );

        // Create a single descriptive change entry for row deletion
        changes = [
          {
            fieldPath: "_row_deleted",
            fieldName: "Row Deleted",
            oldValue: "Row existed",
            newValue: null,
            dataType: "string",
          },
        ];
      }
      // Special handling for "restore" change type (full replay restore)
      else if (options.changeType === "restore" && changes.length === 0) {
        // console.log(
        //   "🔍 [VERSION SERVICE] Creating 'Restored snapshot' change for restore operation"
        // );

        changes = [
          {
            fieldPath: "_restore_operation",
            fieldName: "Restore Operation",
            oldValue: null,
            newValue:
              options.changeDescription ||
              "Restored booking state from history",
            dataType: "string",
          },
        ];
      }
      // If we have changed field paths but no detailed changes, create basic field changes
      else if (
        changes.length === 0 &&
        options.changedFieldPaths &&
        options.changedFieldPaths.length > 0
      ) {
        // console.log(
        //   "🔍 [VERSION SERVICE] Creating field changes from provided paths:",
        //   options.changedFieldPaths
        // );

        changes = options.changedFieldPaths.map((fieldPath) => {
          const newValue = documentSnapshot[fieldPath as keyof SheetData];

          // Determine data type from column definition if available
          let dataType = "unknown";
          if (columns && columns.length > 0) {
            const column = columns.find((col) => col.id === fieldPath);
            if (column) {
              dataType = column.dataType || "string";
            }
          }

          // If still unknown, try to infer from value
          if (dataType === "unknown") {
            if (typeof newValue === "number") dataType = "number";
            else if (typeof newValue === "boolean") dataType = "boolean";
            else if (
              newValue instanceof Date ||
              (newValue && typeof newValue.toDate === "function")
            )
              dataType = "date";
            else if (typeof newValue === "string") dataType = "string";
          }

          return {
            fieldPath: fieldPath,
            fieldName: fieldPath, // Use fieldPath as fieldName for now
            oldValue: null, // We don't have old values from batched writer
            newValue,
            dataType,
          };
        });
      }

      // Sanitize changes to filter out meaningless changes (null → "", etc.)
      // This applies to all changes regardless of how they were created
      changes = this.sanitizeFieldChanges(changes);

      // Skip creating version snapshot for update operations with no actual changes
      // This prevents creating empty version entries when updates don't modify any fields
      if (options.changeType === "update" && changes.length === 0) {
        // console.log(
        //   `⏭️  [VERSION SERVICE] Skipping version snapshot for booking ${bookingId}: update operation with 0 fields modified (all changes filtered out by sanitizer)`
        // );
        // Return a special marker value to indicate the snapshot was skipped
        // This allows callers to distinguish between skipped and actual version IDs
        return "__SKIPPED__";
      }

      // console.log(
      //   "🔍 [VERSION SERVICE] Using changes:",
      //   changes.length,
      //   "fields:",
      //   changes.map((c) => `${c.fieldName} (${c.dataType})`)
      // );

      // Generate branch ID (always use main branch for performance)
      let branchId = `main-${bookingId}`;
      const parentVersionId: string | undefined = undefined;
      // console.log(
      //   "🔍 [VERSION SERVICE] Branch ID:",
      //   branchId,
      //   "Parent ID:",
      //   parentVersionId
      // );

      // If this is a restore point, create a new branch
      if (options.isRestorePoint) {
        branchId = `restore-${Date.now()}-${bookingId}`;
        // console.log("🔍 [VERSION SERVICE] Creating restore branch:", branchId);
      }

      // Create branch info
      const branchInfo: BranchInfo = {
        isMainBranch: !options.isRestorePoint,
        branchName: options.isRestorePoint ? "Restored Version" : undefined,
        branchStartVersionId: options.isRestorePoint
          ? parentVersionId
          : undefined,
        hasChildBranches: false,
        childBranchIds: [],
      };

      // Create version snapshot
      // console.log("🔍 [VERSION SERVICE] Creating version snapshot object");

      const cleanedSnapshot = this.sanitizeSheetDataForStorage(
        documentSnapshot as SheetData
      );
      const gridSnapshotForStorage = this.sanitizeGridSnapshotForStorage(
        options.gridSnapshot
      );
      const previousGridSnapshotForStorage =
        this.sanitizeGridSnapshotForStorage(options.previousGridSnapshot);

      // console.log("🔍 [VERSION SERVICE] Cleaned snapshot:", {
      //   originalKeys: Object.keys(documentSnapshot).length,
      //   cleanedKeys: Object.keys(cleanedSnapshot).length,
      //   sampleCleanedValues: {
      //     firstName: cleanedSnapshot.firstName,
      //     bookingType: cleanedSnapshot.bookingType,
      //     bookingCode: cleanedSnapshot.bookingCode,
      //   },
      //   gridSnapshotCount: gridSnapshotForStorage?.length || 0,
      //   previousGridSnapshotCount: previousGridSnapshotForStorage?.length || 0,
      // });

      // Create the base version snapshot object without undefined fields
      const versionSnapshot: any = {
        bookingId,
        versionNumber,
        branchId,
        documentSnapshot: cleanedSnapshot,
        metadata: {
          createdAt: Timestamp.now(),
          createdBy: options.userId,
          createdByName: options.userName,
          changeType: options.changeType,
          changeDescription: options.changeDescription,
          isRestorePoint: options.isRestorePoint || false,
        },
        changes,
        branchInfo: {
          isMainBranch: branchInfo.isMainBranch,
          hasChildBranches: branchInfo.hasChildBranches,
          childBranchIds: branchInfo.childBranchIds,
        },
      };

      if (gridSnapshotForStorage && gridSnapshotForStorage.length > 0) {
        versionSnapshot.gridSnapshot = gridSnapshotForStorage;
      }

      if (
        previousGridSnapshotForStorage &&
        previousGridSnapshotForStorage.length > 0
      ) {
        versionSnapshot.previousGridSnapshot = previousGridSnapshotForStorage;
      }

      // Only include optional fields if they have values (not undefined)
      if (parentVersionId !== undefined) {
        versionSnapshot.parentVersionId = parentVersionId;
      }

      if (options.restoredFromVersionId !== undefined) {
        versionSnapshot.metadata.restoredFromVersionId =
          options.restoredFromVersionId;
      }

      if (branchInfo.branchName !== undefined) {
        versionSnapshot.branchInfo.branchName = branchInfo.branchName;
      }

      if (branchInfo.branchStartVersionId !== undefined) {
        versionSnapshot.branchInfo.branchStartVersionId =
          branchInfo.branchStartVersionId;
      }
      // console.log("🔍 [VERSION SERVICE] Version snapshot object created:", {
      //   bookingId: versionSnapshot.bookingId,
      //   versionNumber: versionSnapshot.versionNumber,
      //   branchId: versionSnapshot.branchId,
      //   changesCount: versionSnapshot.changes.length,
      // });

      // Add to Firestore
      // console.log(
      //   "🔍 [VERSION SERVICE] Adding to Firestore collection:",
      //   VERSIONS_COLLECTION
      // );

      // Remove any undefined values recursively to prevent Firestore errors
      const cleanVersionSnapshot = this.removeUndefinedValues(versionSnapshot);

      // Log the complete object being sent to Firestore for debugging
      // console.log(
      //   "🔍 [VERSION SERVICE] Complete version snapshot being saved:",
      //   JSON.stringify(cleanVersionSnapshot, null, 2)
      // );

      const docRef = await addDoc(
        collection(db, VERSIONS_COLLECTION),
        cleanVersionSnapshot
      );
      // console.log("🔍 [VERSION SERVICE] Document added with ID:", docRef.id);

      // Update parent version to mark it has child branches (if this is a restore)
      if (options.isRestorePoint && parentVersionId) {
        await this.updateParentBranchInfo(parentVersionId, docRef.id);
      }

      // console.log(
      //   `✅ Created version snapshot ${docRef.id} for booking ${bookingId} (v${versionNumber})`
      // );
      return docRef.id;
    } catch (error) {
      console.error(
        `❌ Failed to create version snapshot for booking ${bookingId}:`,
        error
      );
      throw error;
    }
  }

  // ========================================================================
  // VERSION RETRIEVAL
  // ========================================================================

  async getVersion(versionId: string): Promise<BookingVersionSnapshot | null> {
    try {
      const docRef = doc(db, VERSIONS_COLLECTION, versionId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as BookingVersionSnapshot;
    } catch (error) {
      console.error(`❌ Failed to get version ${versionId}:`, error);
      throw error;
    }
  }

  async getVersionsForBooking(
    bookingId: string,
    options?: VersionHistoryQueryOptions
  ): Promise<BookingVersionSnapshot[]> {
    try {
      // Simple query without complex ordering to avoid index requirements
      let q = query(
        collection(db, VERSIONS_COLLECTION),
        where("bookingId", "==", bookingId)
      );

      // Apply limit if specified — newest first, so the limit keeps the
      // latest versions (uses the bookingId + metadata.createdAt index).
      if (options?.limit) {
        q = query(
          q,
          orderBy("metadata.createdAt", "desc"),
          firestoreLimit(options.limit)
        );
      }

      const querySnapshot = await getDocs(q);
      let versions = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        // Convert Firestore timestamp back to proper Timestamp object
        if (data.metadata?.createdAt && data.metadata.createdAt.seconds) {
          data.metadata.createdAt = new Timestamp(
            data.metadata.createdAt.seconds,
            data.metadata.createdAt.nanoseconds || 0
          );
        }
        return {
          id: doc.id,
          ...data,
        };
      }) as BookingVersionSnapshot[];

      // Apply client-side filtering and sorting to avoid Firestore index requirements
      if (options?.filters) {
        const filters = options.filters;

        if (filters.userId) {
          versions = versions.filter(
            (v) => v.metadata.createdBy === filters.userId
          );
        }

        if (filters.changeType) {
          versions = versions.filter(
            (v) => v.metadata.changeType === filters.changeType
          );
        }

        if (filters.branchId) {
          versions = versions.filter((v) => v.branchId === filters.branchId);
        }

        if (filters.isMainBranch !== undefined) {
          versions = versions.filter(
            (v) => v.branchInfo.isMainBranch === filters.isMainBranch
          );
        }
      }

      // Apply client-side sorting
      const orderByField: string = options?.orderBy || "versionNumber";
      const orderDirection = options?.orderDirection || "desc";

      versions.sort((a, b) => {
        let aValue, bValue;

        if (orderByField === "versionNumber") {
          aValue = a.versionNumber;
          bValue = b.versionNumber;
        } else if (
          orderByField === "createdAt" ||
          orderByField === "metadata.createdAt"
        ) {
          aValue = this.getVersionTimestamp(a);
          bValue = this.getVersionTimestamp(b);
        } else {
          aValue = 0;
          bValue = 0;
        }

        if (orderDirection === "desc") {
          return bValue - aValue;
        } else {
          return aValue - bValue;
        }
      });

      return versions;
    } catch (error) {
      console.error(
        `❌ Failed to get versions for booking ${bookingId}:`,
        error
      );
      throw error;
    }
  }

  async getAllVersions(
    options?: VersionHistoryQueryOptions
  ): Promise<BookingVersionSnapshot[]> {
    try {
      // console.log(
      //   "🔍 [VERSION SERVICE] Getting all versions from collection:",
      //   VERSIONS_COLLECTION
      // );

      let q = query(collection(db, VERSIONS_COLLECTION));

      // Apply limit if specified — newest first, so the limit keeps the
      // latest versions rather than an arbitrary set.
      if (options?.limit) {
        q = query(
          q,
          orderBy("metadata.createdAt", "desc"),
          firestoreLimit(options.limit)
        );
      }

      const querySnapshot = await getDocs(q);
      // console.log(
      //   "🔍 [VERSION SERVICE] Query returned",
      //   querySnapshot.docs.length,
      //   "documents"
      // );

      let versions = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        // Convert Firestore timestamp back to proper Timestamp object
        if (data.metadata?.createdAt && data.metadata.createdAt.seconds) {
          data.metadata.createdAt = new Timestamp(
            data.metadata.createdAt.seconds,
            data.metadata.createdAt.nanoseconds || 0
          );
        }
        return {
          id: doc.id,
          ...data,
        };
      }) as BookingVersionSnapshot[];

      // Apply client-side filtering to avoid Firestore index requirements
      if (options?.filters) {
        const filters = options.filters;

        if (filters.bookingId) {
          versions = versions.filter((v) => v.bookingId === filters.bookingId);
        }

        if (filters.userId) {
          versions = versions.filter(
            (v) => v.metadata.createdBy === filters.userId
          );
        }

        if (filters.changeType) {
          versions = versions.filter(
            (v) => v.metadata.changeType === filters.changeType
          );
        }

        if (filters.branchId) {
          versions = versions.filter((v) => v.branchId === filters.branchId);
        }

        if (filters.isMainBranch !== undefined) {
          versions = versions.filter(
            (v) => v.branchInfo.isMainBranch === filters.isMainBranch
          );
        }
      }

      // Apply client-side sorting
      const orderByField: string = options?.orderBy || "createdAt";
      const orderDirection = options?.orderDirection || "desc";

      versions.sort((a, b) => {
        let aValue, bValue;

        if (orderByField === "versionNumber") {
          aValue = a.versionNumber;
          bValue = b.versionNumber;
        } else if (
          orderByField === "createdAt" ||
          orderByField === "metadata.createdAt"
        ) {
          aValue = this.getVersionTimestamp(a);
          bValue = this.getVersionTimestamp(b);
        } else {
          aValue = 0;
          bValue = 0;
        }

        if (orderDirection === "desc") {
          return bValue - aValue;
        } else {
          return aValue - bValue;
        }
      });

      // console.log(
      //   "🔍 [VERSION SERVICE] Mapped and sorted versions:",
      //   versions.length
      // );
      return versions;
    } catch (error) {
      console.error("❌ Failed to get all versions:", error);
      throw error;
    }
  }

  // ========================================================================
  // VERSION COMPARISON
  // ========================================================================

  async compareVersions(
    fromVersionId: string,
    toVersionId: string
  ): Promise<VersionComparison> {
    try {
      const [fromVersion, toVersion] = await Promise.all([
        this.getVersion(fromVersionId),
        this.getVersion(toVersionId),
      ]);

      if (!fromVersion || !toVersion) {
        throw new Error("One or both versions not found");
      }

      const changedFields = this.detectFieldChanges(
        fromVersion.documentSnapshot,
        toVersion.documentSnapshot
      );

      const fromFields = Object.keys(fromVersion.documentSnapshot);
      const toFields = Object.keys(toVersion.documentSnapshot);

      const addedFields = toFields.filter(
        (field) => !fromFields.includes(field)
      );
      const removedFields = fromFields.filter(
        (field) => !toFields.includes(field)
      );

      return {
        fromVersion,
        toVersion,
        changedFields,
        addedFields,
        removedFields,
      };
    } catch (error) {
      console.error(
        `❌ Failed to compare versions ${fromVersionId} and ${toVersionId}:`,
        error
      );
      throw error;
    }
  }

  // ========================================================================
  // VERSION RESTORATION
  // ========================================================================

  async restoreVersion(
    bookingId: string | undefined,
    options: RestoreVersionOptions
  ): Promise<RestoreResult> {
    try {
      // Get the version to restore
      const versionToRestore = await this.getVersion(options.targetVersionId);
      if (!versionToRestore) {
        return {
          success: false,
          error: "Version to restore not found",
        };
      }

      // Determine which booking ID to restore
      const targetBookingId =
        versionToRestore.bookingId ||
        (typeof versionToRestore.documentSnapshot?.id === "string"
          ? versionToRestore.documentSnapshot.id
          : undefined) ||
        bookingId;

      if (!targetBookingId) {
        return {
          success: false,
          error: "No booking ID available for restoration",
        };
      }

      const targetTimestamp = this.getVersionTimestamp(versionToRestore);

      const currentBookings =
        (await bookingService.getAllBookings()) as SheetData[];
      const currentBookingsMap = new Map(
        currentBookings.map((booking) => [booking.id, booking])
      );

      const previousGridSnapshot = currentBookings.map((booking, index) => {
        const snapshot = this.removeUndefinedValues({
          ...booking,
        }) as SheetData;

        if ((snapshot as any)._versionInfo) {
          delete (snapshot as any)._versionInfo;
        }
        if ((snapshot as any)._originalRow) {
          delete (snapshot as any)._originalRow;
        }

        if (
          typeof snapshot.row !== "number" ||
          !Number.isFinite(snapshot.row)
        ) {
          snapshot.row = index + 1;
        }

        return snapshot;
      });

      let reconstructedGrid: SheetData[];

      // Use pre-reconstructed grid data if provided (from UI)
      if (
        options.reconstructedGridData &&
        options.reconstructedGridData.length > 0
      ) {
        // console.log(
        //   `✅ [RESTORE] Using pre-reconstructed grid data from UI (${options.reconstructedGridData.length} bookings)`
        // );
        reconstructedGrid = options.reconstructedGridData.map((row) => {
          const snapshot = this.removeUndefinedValues({
            ...(row as SheetData),
          }) as SheetData;

          if ((snapshot as any)._versionInfo) {
            delete (snapshot as any)._versionInfo;
          }
          if ((snapshot as any)._originalRow) {
            delete (snapshot as any)._originalRow;
          }

          return snapshot;
        });
      } else if (
        versionToRestore.metadata.changeType === "restore" &&
        Array.isArray(versionToRestore.gridSnapshot) &&
        versionToRestore.gridSnapshot.length > 0
      ) {
        reconstructedGrid = versionToRestore.gridSnapshot.map((row) => {
          const snapshot = this.removeUndefinedValues({
            ...(row as SheetData),
          }) as SheetData;

          if ((snapshot as any)._versionInfo) {
            delete (snapshot as any)._versionInfo;
          }
          if ((snapshot as any)._originalRow) {
            delete (snapshot as any)._originalRow;
          }

          return snapshot;
        });
      } else {
        reconstructedGrid = await this.getGridStateAtTimestamp(
          targetTimestamp,
          currentBookings
        );
      }

      if (reconstructedGrid.length === 0) {
        return {
          success: false,
          error: "No reconstructed grid state available for restoration",
        };
      }

      const sortedReconstructedGrid = [...reconstructedGrid].sort((a, b) => {
        const aRow =
          typeof a.row === "number" ? a.row : Number.MAX_SAFE_INTEGER;
        const bRow =
          typeof b.row === "number" ? b.row : Number.MAX_SAFE_INTEGER;
        return aRow - bRow;
      });

      // Build restore grid snapshot with sequential row numbers (no gaps)
      const restoreGridSnapshot = sortedReconstructedGrid.map(
        (booking, index) => {
          const snapshot = this.removeUndefinedValues({
            ...booking,
          }) as SheetData;

          if ((snapshot as any)._versionInfo) {
            delete (snapshot as any)._versionInfo;
          }
          if ((snapshot as any)._originalRow) {
            delete (snapshot as any)._originalRow;
          }

          // ALWAYS assign sequential row numbers to eliminate gaps
          snapshot.row = index + 1;

          return snapshot;
        }
      );

      const restoredBookings: Array<{
        id: string;
        data: SheetData;
        wasDeleted?: boolean;
      }> = [];

      const reconstructedIds = new Set(
        sortedReconstructedGrid
          .map((booking) => booking.id)
          .filter((id): id is string => typeof id === "string")
      );

      for (let index = 0; index < sortedReconstructedGrid.length; index++) {
        const reconstructedBooking = sortedReconstructedGrid[index];
        const bookingIdToRestore = reconstructedBooking.id;
        if (!bookingIdToRestore || typeof bookingIdToRestore !== "string") {
          continue;
        }

        // Always use sequential row numbers (index + 1) to eliminate gaps
        const desiredRowNumber = index + 1;

        const sanitizedState = this.removeUndefinedValues({
          ...reconstructedBooking,
        }) as SheetData;

        if ((sanitizedState as any)._versionInfo) {
          delete (sanitizedState as any)._versionInfo;
        }
        if ((sanitizedState as any)._originalRow) {
          delete (sanitizedState as any)._originalRow;
        }

        // Force sequential row number
        sanitizedState.row = desiredRowNumber;

        const existingBooking = currentBookingsMap.get(bookingIdToRestore);
        let shouldUpdate = bookingIdToRestore === targetBookingId;

        let sanitizedExisting: SheetData | undefined;

        if (!shouldUpdate) {
          if (!existingBooking) {
            shouldUpdate = true;
          } else {
            sanitizedExisting = this.removeUndefinedValues({
              ...existingBooking,
            }) as SheetData;
            if ((sanitizedExisting as any)._versionInfo) {
              delete (sanitizedExisting as any)._versionInfo;
            }
            if ((sanitizedExisting as any)._originalRow) {
              delete (sanitizedExisting as any)._originalRow;
            }
            if (
              typeof sanitizedExisting.row !== "number" ||
              !Number.isFinite(sanitizedExisting.row)
            ) {
              sanitizedExisting.row = desiredRowNumber;
            }
            shouldUpdate = !this.isEqual(sanitizedExisting, sanitizedState);
          }
        }

        if (!shouldUpdate) {
          if (!sanitizedState.createdAt) {
            sanitizedState.createdAt =
              sanitizedExisting?.createdAt ||
              versionToRestore.documentSnapshot?.createdAt ||
              new Date(targetTimestamp);
          }

          if (!sanitizedState.updatedAt && sanitizedExisting?.updatedAt) {
            sanitizedState.updatedAt = sanitizedExisting.updatedAt;
          }

          restoreGridSnapshot[index] = sanitizedState;
          continue;
        }

        const hasCreatedAt =
          sanitizedState.createdAt !== undefined &&
          sanitizedState.createdAt !== null;

        const stateToPersist = this.removeUndefinedValues({
          ...sanitizedState,
          id: bookingIdToRestore,
          createdAt: hasCreatedAt
            ? sanitizedState.createdAt
            : versionToRestore.documentSnapshot?.createdAt ||
              new Date(targetTimestamp),
          updatedAt: new Date(),
        }) as SheetData;

        if ((stateToPersist as any)._versionInfo) {
          delete (stateToPersist as any)._versionInfo;
        }
        if ((stateToPersist as any)._originalRow) {
          delete (stateToPersist as any)._originalRow;
        }

        await setDoc(
          doc(db, BOOKINGS_COLLECTION, bookingIdToRestore),
          stateToPersist,
          { merge: false }
        );

        restoreGridSnapshot[index] = stateToPersist;
        restoredBookings.push({ id: bookingIdToRestore, data: stateToPersist });
      }

      const bookingsToDelete = currentBookings.filter(
        (booking) => booking?.id && !reconstructedIds.has(booking.id)
      );

      for (const bookingToDelete of bookingsToDelete) {
        const bookingIdToDelete = bookingToDelete.id;
        if (!bookingIdToDelete) {
          continue;
        }

        const stateBeforeDelete = this.removeUndefinedValues({
          ...bookingToDelete,
          id: bookingIdToDelete,
        }) as SheetData;

        if ((stateBeforeDelete as any)._versionInfo) {
          delete (stateBeforeDelete as any)._versionInfo;
        }
        if ((stateBeforeDelete as any)._originalRow) {
          delete (stateBeforeDelete as any)._originalRow;
        }

        await deleteDoc(doc(db, BOOKINGS_COLLECTION, bookingIdToDelete));

        restoredBookings.push({
          id: bookingIdToDelete,
          data: stateBeforeDelete,
          wasDeleted: true,
        });
      }

      // Validate and fix row numbers: check for duplicates and gaps
      // console.log(
      //   "🔍 [RESTORE VALIDATION] Checking for duplicate or invalid row numbers"
      // );

      const rowNumbersUsed = new Set<number>();
      const duplicateRows: number[] = [];
      const invalidRows: string[] = [];

      restoreGridSnapshot.forEach((booking, index) => {
        const rowNum = booking.row;

        if (typeof rowNum !== "number" || !Number.isFinite(rowNum)) {
          invalidRows.push(booking.id || `unknown-${index}`);
        } else if (rowNumbersUsed.has(rowNum)) {
          duplicateRows.push(rowNum);
        } else {
          rowNumbersUsed.add(rowNum);
        }
      });

      if (duplicateRows.length > 0 || invalidRows.length > 0) {
        // console.warn(
        //   `⚠️  [RESTORE VALIDATION] Found issues - Duplicates: ${duplicateRows.length}, Invalid: ${invalidRows.length}`
        // );
        // console.log("🔧 [RESTORE VALIDATION] Reordering rows sequentially");

        // Reorder all rows sequentially
        restoreGridSnapshot.sort((a, b) => {
          const aRow =
            typeof a.row === "number" && Number.isFinite(a.row)
              ? a.row
              : Number.MAX_SAFE_INTEGER;
          const bRow =
            typeof b.row === "number" && Number.isFinite(b.row)
              ? b.row
              : Number.MAX_SAFE_INTEGER;
          return aRow - bRow;
        });

        // Reassign row numbers sequentially
        const reorderedBookings: Array<{
          id: string;
          oldRow: number;
          newRow: number;
        }> = [];

        for (let i = 0; i < restoreGridSnapshot.length; i++) {
          const booking = restoreGridSnapshot[i];
          const oldRow = booking.row;
          const newRow = i + 1;

          if (oldRow !== newRow) {
            reorderedBookings.push({
              id: booking.id || `row-${i}`,
              oldRow:
                typeof oldRow === "number" && Number.isFinite(oldRow)
                  ? oldRow
                  : -1,
              newRow,
            });
          }

          booking.row = newRow;

          // Update the booking in Firestore with the corrected row number
          if (booking.id && typeof booking.id === "string") {
            await setDoc(
              doc(db, BOOKINGS_COLLECTION, booking.id),
              { row: newRow },
              { merge: true }
            );
          }
        }

        if (reorderedBookings.length > 0) {
          console.log(
            `✅ [RESTORE VALIDATION] Reordered ${reorderedBookings.length} bookings:`,
            reorderedBookings.slice(0, 10)
          );
        }
      } else {
        console.log(
          "✅ [RESTORE VALIDATION] All row numbers are valid and sequential"
        );
      }

      if (restoredBookings.length === 0) {
        return {
          success: true,
        };
      }

      const targetRestoredBooking = restoredBookings.find(
        (booking) => booking.id === targetBookingId && !booking.wasDeleted
      );

      const targetSnapshotData = targetRestoredBooking
        ? targetRestoredBooking.data
        : (this.removeUndefinedValues({
            ...versionToRestore.documentSnapshot,
            id: targetBookingId,
          }) as SheetData);

      const updatedCount = restoredBookings.filter(
        (booking) => !booking.wasDeleted
      ).length;
      const deletedCount = restoredBookings.filter(
        (booking) => booking.wasDeleted
      ).length;

      const additionalUpdatedCount = Math.max(updatedCount - 1, 0);

      const descriptionParts = [
        `Restored grid state from version ${versionToRestore.versionNumber}`,
      ];

      if (additionalUpdatedCount > 0) {
        descriptionParts.push(
          `Also updated ${additionalUpdatedCount} other booking${
            additionalUpdatedCount === 1 ? "" : "s"
          } to the historical state`
        );
      }

      if (deletedCount > 0) {
        descriptionParts.push(
          `Removed ${deletedCount} booking${
            deletedCount === 1 ? "" : "s"
          } that did not exist at that time`
        );
      }

      const changeDescription = descriptionParts.join("; ");

      const newVersionId = await this.createVersionSnapshot(
        targetBookingId,
        targetSnapshotData,
        {
          changeType: "restore",
          changeDescription,
          userId: options.userId,
          userName: options.userName,
          isRestorePoint: true,
          restoredFromVersionId: options.targetVersionId,
          gridSnapshot: restoreGridSnapshot,
          previousGridSnapshot,
        }
      );

      const newVersion = await this.getVersion(newVersionId);

      return {
        success: true,
        newVersionId,
        newVersionNumber: newVersion?.versionNumber,
        branchId: newVersion?.branchId,
      };
    } catch (error) {
      console.error(
        `❌ Failed to restore version ${options.targetVersionId}:`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ========================================================================
  // REAL-TIME LISTENERS
  // ========================================================================

  subscribeToBookingVersions(
    bookingId: string,
    callback: (versions: BookingVersionSnapshot[]) => void,
    options?: VersionHistoryQueryOptions
  ): Unsubscribe {
    let q = query(
      collection(db, VERSIONS_COLLECTION),
      where("bookingId", "==", bookingId)
    );

    // Apply ordering
    const orderByOption = options?.orderBy || "versionNumber";
    const orderDirection = options?.orderDirection || "desc";
    const firestoreOrderField =
      orderByOption === "createdAt" ? "metadata.createdAt" : orderByOption;
    q = query(q, orderBy(firestoreOrderField, orderDirection));

    // Apply limit
    if (options?.limit) {
      q = query(q, firestoreLimit(options.limit));
    }

    return onSnapshot(
      q,
      (querySnapshot) => {
        const versions = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          // Convert Firestore timestamp back to proper Timestamp object
          if (data.metadata?.createdAt && data.metadata.createdAt.seconds) {
            data.metadata.createdAt = new Timestamp(
              data.metadata.createdAt.seconds,
              data.metadata.createdAt.nanoseconds || 0
            );
          }
          return {
            id: doc.id,
            ...data,
          };
        }) as BookingVersionSnapshot[];
        callback(versions);
      },
      (error) => {
        console.error(
          `❌ Error in booking versions subscription for ${bookingId}:`,
          error
        );
      }
    );
  }

  subscribeToAllVersions(
    callback: (versions: BookingVersionSnapshot[]) => void,
    options?: VersionHistoryQueryOptions
  ): Unsubscribe {
    let q = query(collection(db, VERSIONS_COLLECTION));

    // Apply ordering
    const orderByOption = options?.orderBy || "createdAt";
    const orderDirection = options?.orderDirection || "desc";
    const firestoreOrderField =
      orderByOption === "createdAt" ? "metadata.createdAt" : orderByOption;
    q = query(q, orderBy(firestoreOrderField, orderDirection));

    // Apply limit
    if (options?.limit) {
      q = query(q, firestoreLimit(options.limit));
    }

    return onSnapshot(
      q,
      (querySnapshot) => {
        const versions = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          // Convert Firestore timestamp back to proper Timestamp object
          if (data.metadata?.createdAt && data.metadata.createdAt.seconds) {
            data.metadata.createdAt = new Timestamp(
              data.metadata.createdAt.seconds,
              data.metadata.createdAt.nanoseconds || 0
            );
          }
          return {
            id: doc.id,
            ...data,
          };
        }) as BookingVersionSnapshot[];
        callback(versions);
      },
      (error) => {
        console.error("❌ Error in all versions subscription:", error);
      }
    );
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  async getLatestVersion(
    bookingId: string
  ): Promise<BookingVersionSnapshot | null> {
    try {
      // For now, just get all versions for this booking and find the latest one
      // This avoids the Firestore index requirement
      const q = query(
        collection(db, VERSIONS_COLLECTION),
        where("bookingId", "==", bookingId)
      );

      const querySnapshot = await getDocs(q);
      const versions = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        // Convert Firestore timestamp back to proper Timestamp object
        if (data.metadata?.createdAt && data.metadata.createdAt.seconds) {
          data.metadata.createdAt = new Timestamp(
            data.metadata.createdAt.seconds,
            data.metadata.createdAt.nanoseconds || 0
          );
        }
        return {
          id: doc.id,
          ...data,
        };
      }) as BookingVersionSnapshot[];

      if (versions.length === 0) {
        return null;
      }

      // Find the version with the highest version number
      return versions.reduce((latest, current) =>
        current.versionNumber > latest.versionNumber ? current : latest
      );
    } catch (error) {
      console.error(
        `❌ Failed to get latest version for booking ${bookingId}:`,
        error
      );
      throw error;
    }
  }

  async getVersionCount(bookingId: string): Promise<number> {
    try {
      const snapshot = await getCountFromServer(
        query(
          collection(db, VERSIONS_COLLECTION),
          where("bookingId", "==", bookingId)
        )
      );
      return snapshot.data().count;
    } catch (error) {
      console.error(
        `❌ Failed to get version count for booking ${bookingId}:`,
        error
      );
      throw error;
    }
  }

  detectFieldChanges(
    oldDocument: SheetData,
    newDocument: SheetData
  ): FieldChange[] {
    const changes: FieldChange[] = [];
    const allFields = new Set([
      ...Object.keys(oldDocument),
      ...Object.keys(newDocument),
    ]);

    for (const fieldPath of allFields) {
      const oldValue = oldDocument[fieldPath as keyof SheetData];
      const newValue = newDocument[fieldPath as keyof SheetData];

      // Skip if values are the same (deep comparison for objects)
      if (this.isEqual(oldValue, newValue)) {
        continue;
      }

      // Determine data type (simplified)
      let dataType = "string";
      if (typeof newValue === "number") dataType = "number";
      else if (typeof newValue === "boolean") dataType = "boolean";
      else if (
        newValue instanceof Date ||
        (newValue && typeof newValue.toDate === "function")
      )
        dataType = "date";

      changes.push({
        fieldPath,
        fieldName: fieldPath, // TODO: Map to human-readable name from column definitions
        oldValue,
        newValue,
        dataType,
      });
    }

    // Sanitize changes to filter out meaningless changes (null → "", etc.)
    return this.sanitizeFieldChanges(changes);
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  /**
   * Sanitize field changes by filtering out meaningless changes
   * Filters out changes where oldValue is null/undefined and newValue is empty string
   * This prevents counting null → "" transitions as actual changes
   *
   * Note: Synthetic change markers (starting with "_") are never filtered out
   */
  private sanitizeFieldChanges(changes: FieldChange[]): FieldChange[] {
    return changes.filter((change) => {
      const { fieldPath, oldValue, newValue, dataType } = change;

      // Never filter out synthetic change markers (e.g., _row_created, _row_deleted, _bulk_operation)
      if (fieldPath.startsWith("_")) {
        return true;
      }

      // Skip changes where oldValue is null/undefined and newValue is empty string
      // This is not a meaningful change (field didn't exist → field is empty)
      // Check the actual value type, not just dataType (computed/function fields may have dataType "function" but string values)
      if (
        (oldValue === null || oldValue === undefined) &&
        typeof newValue === "string" &&
        newValue === ""
      ) {
        // console.log(
        //   `🧹 [SANITIZER] Filtering out meaningless change: ${fieldPath} (${oldValue} → "${newValue}") [dataType: ${dataType}]`
        // );
        return false;
      }

      // Keep all other changes
      return true;
    });
  }

  /**
   * Remove undefined values from an object recursively
   */
  private removeUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeUndefinedValues(item));
    }

    if (typeof obj === "object") {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          cleaned[key] = this.removeUndefinedValues(value);
        }
      }
      return cleaned;
    }

    return obj;
  }

  private serializeValueForStorage(value: any): any {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (value instanceof Date) {
      return Timestamp.fromDate(value);
    }

    if (
      value &&
      typeof value === "object" &&
      (typeof value.toDate === "function" ||
        typeof value.toMillis === "function")
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.serializeValueForStorage(item))
        .filter((item) => item !== undefined);
    }

    if (typeof value === "object") {
      const serialized: Record<string, any> = {};
      Object.keys(value).forEach((key) => {
        const serializedValue = this.serializeValueForStorage(
          (value as any)[key]
        );
        if (serializedValue !== undefined) {
          serialized[key] = serializedValue;
        }
      });
      return serialized;
    }

    return value;
  }

  private sanitizeSheetDataForStorage(data: SheetData): Record<string, any> {
    const clone: Record<string, any> = { ...data };

    if (clone._versionInfo) {
      delete clone._versionInfo;
    }

    if (clone._originalRow) {
      delete clone._originalRow;
    }

    const cleaned: Record<string, any> = {};

    Object.keys(clone).forEach((key) => {
      const serializedValue = this.serializeValueForStorage(clone[key]);

      if (serializedValue !== undefined) {
        cleaned[key] = serializedValue;
      }
    });

    return cleaned;
  }

  private sanitizeGridSnapshotForStorage(
    rows?: SheetData[]
  ): SheetData[] | undefined {
    if (!rows) {
      return undefined;
    }

    return rows
      .map((row, index) => {
        const sanitized = this.sanitizeSheetDataForStorage(row);

        if (!sanitized.id) {
          sanitized.id = row.id || `grid-row-${index}`;
        }

        return sanitized as SheetData;
      })
      .filter((row) => !!row.id);
  }

  private async updateParentBranchInfo(
    parentVersionId: string,
    childVersionId: string
  ): Promise<void> {
    try {
      const parentVersion = await this.getVersion(parentVersionId);
      if (!parentVersion) return;

      // Update parent to indicate it has child branches
      const updatedBranchInfo: BranchInfo = {
        ...parentVersion.branchInfo,
        hasChildBranches: true,
        childBranchIds: [
          ...parentVersion.branchInfo.childBranchIds,
          childVersionId,
        ],
      };

      // Note: In a real implementation, you'd need to update the document
      // For now, we'll just log this operation
      // console.log(
      //   `📝 Updated parent version ${parentVersionId} to include child ${childVersionId}`
      // );
    } catch (error) {
      console.error(
        `❌ Failed to update parent branch info for ${parentVersionId}:`,
        error
      );
    }
  }

  private isEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.isEqual(a[i], b[i])) return false;
      }
      return true;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.isEqual(a[key], b[key])) return false;
    }

    return true;
  }

  // ========================================================================
  // GRID STATE RECONSTRUCTION - REPLAY-BASED APPROACH
  // ========================================================================

  /**
   * Reconstruct the complete grid state at a specific point in time
   * Uses replay-based reconstruction: starts from current state and replays changes backwards
   * This is more accurate than using stored snapshots
   */
  async getGridStateAtTimestamp(
    timestamp: Date | number,
    currentBookings: SheetData[],
    upToVersionId?: string
  ): Promise<SheetData[]> {
    try {
      // console.log(
      //   "🔄 [REPLAY RECONSTRUCTION] Starting replay-based reconstruction at timestamp:",
      //   timestamp,
      //   upToVersionId ? `up to version: ${upToVersionId}` : ""
      // );

      // Convert timestamp to comparable format
      let targetTime: number;
      if (timestamp instanceof Date) {
        targetTime = timestamp.getTime();
      } else if (typeof timestamp === "number") {
        targetTime = timestamp;
      } else {
        throw new Error("Invalid timestamp format");
      }

      // Query ALL versions to get complete change history
      const versionsRef = collection(db, VERSIONS_COLLECTION);
      const allVersionsQuery = query(
        versionsRef,
        orderBy("metadata.createdAt", "asc") // Ascending for forward replay
      );

      // console.log("� [REPLAY RECONSTRUCTION] Querying all versions...");
      const querySnapshot = await getDocs(allVersionsQuery);
      // console.log(
      //   "� [REPLAY RECONSTRUCTION] Found",
      //   querySnapshot.size,
      //   "total versions across all time"
      // );

      // Prepare baseline restore snapshot if available at/before the target time
      let latestRestoreBaseline:
        | {
            version: BookingVersionSnapshot;
            rows: Map<string, SheetData>;
          }
        | undefined;

      const restoreCandidates: Array<BookingVersionSnapshot> = [];

      querySnapshot.forEach((doc) => {
        const versionData = doc.data() as BookingVersionSnapshot;
        const hydratedVersion: BookingVersionSnapshot = {
          ...versionData,
          id: doc.id,
        };

        if (
          hydratedVersion.metadata?.changeType === "restore" &&
          Array.isArray(hydratedVersion.gridSnapshot) &&
          hydratedVersion.gridSnapshot.length > 0
        ) {
          restoreCandidates.push(hydratedVersion);
        }
      });

      restoreCandidates
        .sort(
          (a, b) => this.getVersionTimestamp(a) - this.getVersionTimestamp(b)
        )
        .forEach((candidate) => {
          const candidateTime = this.getVersionTimestamp(candidate);
          if (!Number.isFinite(candidateTime) || candidateTime > targetTime) {
            return;
          }

          const rows = new Map<string, SheetData>();
          candidate.gridSnapshot!.forEach((rawRow, index) => {
            const sanitizedRow = this.removeUndefinedValues({
              ...(rawRow as SheetData),
            }) as SheetData;

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

            if (!sanitizedRow.id || typeof sanitizedRow.id !== "string") {
              sanitizedRow.id = `${candidate.id}-row-${index + 1}`;
            }

            rows.set(sanitizedRow.id, sanitizedRow);
          });

          latestRestoreBaseline = {
            version: candidate,
            rows,
          };
        });

      // Group all versions by bookingId
      const allVersionsByBooking = new Map<string, BookingVersionSnapshot[]>();

      querySnapshot.forEach((doc) => {
        const versionData = doc.data() as BookingVersionSnapshot;
        const bookingId = versionData.bookingId;

        if (!allVersionsByBooking.has(bookingId)) {
          allVersionsByBooking.set(bookingId, []);
        }
        allVersionsByBooking.get(bookingId)!.push({
          ...versionData,
          id: doc.id,
        });
      });

      // Sort versions chronologically for each booking (ascending order - oldest first)
      allVersionsByBooking.forEach((versions) => {
        versions.sort(
          (a, b) => this.getVersionTimestamp(a) - this.getVersionTimestamp(b)
        );
      });

      // console.log(
      //   `🔄 [REPLAY RECONSTRUCTION] Found versions for ${allVersionsByBooking.size} bookings`
      // );

      // If we have a restore baseline, use a completely different reconstruction approach
      if (latestRestoreBaseline) {
        const restoreTime = this.getVersionTimestamp(
          latestRestoreBaseline.version
        );
        // console.log(
        //   `🧩 [RESTORE-BASED RECONSTRUCTION] Using restore baseline from version ${
        //     latestRestoreBaseline.version.id
        //   } at ${new Date(restoreTime).toISOString()}`
        // );

        // Start with the complete grid from the restore snapshot
        const gridState = new Map<string, SheetData>();
        latestRestoreBaseline.rows.forEach((row, bookingId) => {
          gridState.set(bookingId, { ...row });
        });

        // console.log(
        //   `🧩 [RESTORE-BASED RECONSTRUCTION] Starting with ${gridState.size} bookings from restore snapshot`
        // );

        // Get all versions that happened AFTER the restore and BEFORE/AT the target
        const versionsAfterRestore: BookingVersionSnapshot[] = [];

        // Chronological position of every version, computed once (was
        // re-sorted for every version inside the loop below).
        const chronologicalIndex = new Map<string, number>();
        if (upToVersionId) {
          Array.from(querySnapshot.docs)
            .map((d) => ({
              ...(d.data() as BookingVersionSnapshot),
              id: d.id,
            }))
            .sort(
              (a, b) =>
                this.getVersionTimestamp(a) - this.getVersionTimestamp(b)
            )
            .forEach((v, index) => {
              if (!chronologicalIndex.has(v.id)) {
                chronologicalIndex.set(v.id, index);
              }
            });
        }

        querySnapshot.forEach((doc) => {
          const versionData = doc.data() as BookingVersionSnapshot;
          const versionId = doc.id;
          const versionTime = this.getVersionTimestamp({
            ...versionData,
            id: doc.id,
          } as BookingVersionSnapshot);

          // If upToVersionId is specified, check if this version should be included
          if (upToVersionId) {
            const targetIndex = chronologicalIndex.get(upToVersionId) ?? -1;
            const currentIndex = chronologicalIndex.get(versionId) ?? -1;

            if (targetIndex >= 0 && currentIndex >= 0) {
              const baselineVersionId =
                latestRestoreBaseline?.version?.id ?? null;
              const baselineIndex = baselineVersionId
                ? chronologicalIndex.get(baselineVersionId) ?? -1
                : -1;

              // Include only if this version comes after restore but up to target version
              if (currentIndex > baselineIndex && currentIndex <= targetIndex) {
                versionsAfterRestore.push({
                  ...versionData,
                  id: doc.id,
                });
              }
            }
          } else if (
            Number.isFinite(versionTime) &&
            versionTime > restoreTime &&
            versionTime <= targetTime
          ) {
            versionsAfterRestore.push({
              ...versionData,
              id: doc.id,
            });
          }
        });

        // Sort versions chronologically (ascending - oldest first)
        versionsAfterRestore.sort(
          (a, b) => this.getVersionTimestamp(a) - this.getVersionTimestamp(b)
        );

        // console.log(
        //   `🧩 [RESTORE-BASED RECONSTRUCTION] Applying ${versionsAfterRestore.length} versions after restore`
        // );

        // Apply each version in chronological order
        versionsAfterRestore.forEach((version) => {
          const bookingId = version.bookingId;
          const versionTime = this.getVersionTimestamp(version);

          // console.log(
          //   `🧩 [RESTORE-BASED RECONSTRUCTION] Applying version ${
          //     version.id
          //   } (${
          //     version.metadata.changeType
          //   }) for booking ${bookingId} at ${new Date(
          //     versionTime
          //   ).toISOString()}`
          // );

          if (version.metadata.changeType === "create") {
            // Add new booking to grid
            gridState.set(bookingId, {
              ...version.documentSnapshot,
              id: bookingId,
            });
            // console.log(`  ✅ Created booking ${bookingId} in restored grid`);
          } else if (version.metadata.changeType === "delete") {
            // Remove booking from grid
            gridState.delete(bookingId);
            // console.log(`  ❌ Deleted booking ${bookingId} from restored grid`);
          } else if (version.metadata.changeType === "restore") {
            // Another restore happened - use its grid snapshot if available
            if (
              Array.isArray(version.gridSnapshot) &&
              version.gridSnapshot.length > 0
            ) {
              // console.log(
              //   `  🔄 Nested restore detected - replacing entire grid with ${version.gridSnapshot.length} bookings`
              // );
              gridState.clear();
              version.gridSnapshot.forEach((row, index) => {
                const sanitizedRow = this.removeUndefinedValues({
                  ...(row as SheetData),
                }) as SheetData;

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

                if (sanitizedRow.id && typeof sanitizedRow.id === "string") {
                  gridState.set(sanitizedRow.id, sanitizedRow);
                }
              });
            }
          } else {
            // Update existing booking
            const existingBooking = gridState.get(bookingId);
            if (existingBooking) {
              // Apply field changes
              const updatedBooking = { ...existingBooking };
              version.changes.forEach((change) => {
                if (!change.fieldPath.startsWith("_")) {
                  (updatedBooking as any)[change.fieldPath] = change.newValue;
                }
              });
              gridState.set(bookingId, updatedBooking);
              // console.log(
              //   `  📝 Updated booking ${bookingId} (${version.changes.length} fields changed)`
              // );
            } else {
              // Booking doesn't exist in restored grid, add it with the version's snapshot
              gridState.set(bookingId, {
                ...version.documentSnapshot,
                id: bookingId,
              });
              // console.log(
              //   `  ➕ Added missing booking ${bookingId} to restored grid`
              // );
            }
          }
        });

        const reconstructedGrid = Array.from(gridState.values());
        // console.log(
        //   `✅ [RESTORE-BASED RECONSTRUCTION] Reconstructed grid with ${reconstructedGrid.length} bookings`
        // );
        return reconstructedGrid;
      }

      // Use FORWARD REPLAY approach (not backward) to maintain grid consistency
      // console.log(`🔄 [FORWARD REPLAY] Starting forward replay reconstruction`);

      // Get all versions across all bookings and sort chronologically
      const allVersions: BookingVersionSnapshot[] = [];
      querySnapshot.forEach((doc) => {
        const versionData = doc.data() as BookingVersionSnapshot;
        allVersions.push({
          ...versionData,
          id: doc.id,
        });
      });

      // If there are NO versions at all, just return current bookings
      if (allVersions.length === 0) {
        // console.log(
        //   `📄 [FORWARD REPLAY] No version history found, using current bookings as baseline (${currentBookings.length} bookings)`
        // );
        return currentBookings;
      }

      // Sort all versions chronologically (ascending - oldest first)
      allVersions.sort(
        (a, b) => this.getVersionTimestamp(a) - this.getVersionTimestamp(b)
      );

      // Get the earliest version timestamp
      const earliestVersionTime = this.getVersionTimestamp(allVersions[0]);

      // console.log(
      //   `🔄 [FORWARD REPLAY] Earliest version at ${new Date(
      //     earliestVersionTime
      //   ).toISOString()}`
      // );

      // Index of the target version (looked up once, not per version)
      const targetVersionIndex = upToVersionId
        ? allVersions.findIndex((v) => v.id === upToVersionId)
        : -1;

      // Filter versions up to and including the target timestamp or specific version
      const versionsUpToTarget = allVersions.filter((version, index) => {
        const versionTime = this.getVersionTimestamp(version);

        // If upToVersionId is specified, include versions up to and including that specific version
        if (upToVersionId && targetVersionIndex >= 0) {
          return index <= targetVersionIndex;
        }

        // Otherwise use timestamp-based filtering
        return Number.isFinite(versionTime) && versionTime <= targetTime;
      });

      // console.log(
      //   `🔄 [FORWARD REPLAY] Filtered to ${
      //     versionsUpToTarget.length
      //   } versions (target: ${upToVersionId || "timestamp-based"})`
      // );

      // console.log(
      //   `🔄 [FORWARD REPLAY] Replaying ${versionsUpToTarget.length} versions chronologically up to target time`
      // );

      // Initialize grid state map
      const gridState = new Map<string, SheetData>();

      // Build a map of all booking IDs that have versions
      const bookingsWithVersions = new Set<string>();
      allVersions.forEach((version) => {
        if (version.bookingId) {
          bookingsWithVersions.add(version.bookingId);
        }
      });

      // Strategy: Use current bookings as baseline, but only for bookings WITHOUT version history
      // OR for bookings that were created BEFORE version tracking started
      currentBookings.forEach((booking) => {
        if (!booking.id) return;

        const hasVersionHistory = bookingsWithVersions.has(booking.id);

        if (!hasVersionHistory) {
          // Booking has no version history - use current state as baseline
          gridState.set(booking.id, { ...booking });
          console.log(
            `📄 [FORWARD REPLAY] Added booking ${booking.id} without version history`
          );
        } else {
          // Booking has version history - check if it was created before earliest version
          let bookingCreatedTime = 0;
          if (booking.createdAt) {
            const createdAt = booking.createdAt;
            if (typeof createdAt === "object" && "toDate" in createdAt) {
              bookingCreatedTime = (createdAt as any).toDate().getTime();
            } else if (
              typeof createdAt === "object" &&
              "seconds" in createdAt
            ) {
              bookingCreatedTime = (createdAt as any).seconds * 1000;
            } else if (createdAt instanceof Date) {
              bookingCreatedTime = createdAt.getTime();
            } else if (typeof createdAt === "number") {
              bookingCreatedTime = createdAt;
            }
          }

          // If booking was created before version tracking started, use it as baseline
          if (
            bookingCreatedTime > 0 &&
            bookingCreatedTime < earliestVersionTime
          ) {
            gridState.set(booking.id, { ...booking });
            console.log(
              `📄 [FORWARD REPLAY] Added booking ${
                booking.id
              } created before version tracking (${new Date(
                bookingCreatedTime
              ).toISOString()})`
            );
          }
        }
      });

      // Apply versions up to target chronologically
      versionsUpToTarget.forEach((version) => {
        const bookingId = version.bookingId;
        const versionTime = this.getVersionTimestamp(version);

        // console.log(
        //   `🔄 [FORWARD REPLAY] Applying version ${version.id} (${
        //     version.metadata.changeType
        //   }) for booking ${bookingId} at ${new Date(versionTime).toISOString()}`
        // );

        if (version.metadata.changeType === "create") {
          // Add new booking to grid
          const newBooking = {
            ...version.documentSnapshot,
            id: bookingId,
          } as SheetData;
          gridState.set(bookingId, newBooking);
          console.log(`  ✅ Created booking ${bookingId}`);
        } else if (version.metadata.changeType === "delete") {
          // Remove booking from grid
          gridState.delete(bookingId);
          console.log(`  ❌ Deleted booking ${bookingId}`);
        } else {
          // Update existing booking (create, update, or other change types)
          const existingBooking = gridState.get(bookingId);
          if (existingBooking) {
            // Apply field changes
            const updatedBooking = { ...existingBooking };
            version.changes.forEach((change) => {
              if (!change.fieldPath.startsWith("_")) {
                if (change.newValue === null || change.newValue === undefined) {
                  delete (updatedBooking as any)[change.fieldPath];
                } else {
                  (updatedBooking as any)[change.fieldPath] = change.newValue;
                }
              }
            });
            gridState.set(bookingId, updatedBooking);
            console.log(
              `  📝 Updated booking ${bookingId} (${version.changes.length} fields)`
            );
          } else {
            // Booking doesn't exist in grid yet, add it with the version's snapshot
            gridState.set(bookingId, {
              ...version.documentSnapshot,
              id: bookingId,
            } as SheetData);
            console.log(`  ➕ Added booking ${bookingId} from snapshot`);
          }
        }
      });

      const reconstructedGrid = Array.from(gridState.values());
      // console.log(
      //   `✅ [FORWARD REPLAY] Reconstructed grid with ${reconstructedGrid.length} bookings`
      // );
      return reconstructedGrid;
    } catch (error) {
      console.error(
        "❌ [REPLAY RECONSTRUCTION] Failed to reconstruct grid state:",
        error
      );
      throw error;
    }
  }

  // ========================================================================
  // RETENTION POLICY
  // ========================================================================

  /**
   * Clean up old version snapshots based on retention policy
   * Default: Keep last 30 days of versions, or minimum 10 versions per booking
   */
  async cleanupOldVersions(
    retentionDays: number = 30,
    minVersionsPerBooking: number = 10
  ): Promise<{ deleted: number; retained: number }> {
    try {
      // console.log("🧹 [RETENTION POLICY] Starting cleanup:", {
      //   retentionDays,
      //   minVersionsPerBooking,
      // });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      // Get all versions
      const versionsRef = collection(db, VERSIONS_COLLECTION);
      const allVersionsQuery = query(
        versionsRef,
        orderBy("metadata.createdAt", "desc")
      );
      const querySnapshot = await getDocs(allVersionsQuery);

      // console.log(
      //   `🧹 [RETENTION POLICY] Found ${querySnapshot.size} total versions`
      // );

      // Group by bookingId
      const versionsByBooking = new Map<string, BookingVersionSnapshot[]>();
      querySnapshot.forEach((doc) => {
        const versionData = doc.data() as BookingVersionSnapshot;
        const bookingId = versionData.bookingId;

        if (!versionsByBooking.has(bookingId)) {
          versionsByBooking.set(bookingId, []);
        }
        versionsByBooking.get(bookingId)!.push({
          ...versionData,
          id: doc.id,
        });
      });

      let deleted = 0;
      let retained = 0;

      // For each booking, apply retention policy
      for (const [bookingId, versions] of versionsByBooking.entries()) {
        // Sort by creation date (newest first)
        versions.sort((a, b) => {
          const aTime = a.metadata.createdAt;
          const bTime = b.metadata.createdAt;
          let aMs = 0;
          let bMs = 0;

          if (aTime && typeof aTime === "object" && "seconds" in aTime) {
            aMs = (aTime as any).seconds * 1000;
          } else if (aTime && typeof (aTime as any).getTime === "function") {
            // Handles Date or Timestamp-like objects with getTime()
            aMs = (aTime as any).getTime();
          } else if (typeof aTime === "number") {
            aMs = aTime;
          }

          if (bTime && typeof bTime === "object" && "seconds" in bTime) {
            bMs = (bTime as any).seconds * 1000;
          } else if (bTime && typeof (bTime as any).getTime === "function") {
            // Handles Date or Timestamp-like objects with getTime()
            bMs = (bTime as any).getTime();
          } else if (typeof bTime === "number") {
            bMs = bTime;
          }

          return bMs - aMs; // Descending (newest first)
        });

        // Keep minimum number of versions regardless of age
        const versionsToKeep = versions.slice(0, minVersionsPerBooking);
        const versionsToConsider = versions.slice(minVersionsPerBooking);

        retained += versionsToKeep.length;

        // For remaining versions, delete if older than retention period
        for (const version of versionsToConsider) {
          const vTime = version.metadata.createdAt;
          let shouldDelete = false;

          if (vTime && typeof vTime === "object" && "seconds" in vTime) {
            const vMs = (vTime as any).seconds * 1000;
            shouldDelete = vMs < cutoffDate.getTime();
          } else if (vTime && typeof (vTime as any).getTime === "function") {
            shouldDelete = (vTime as any).getTime() < cutoffDate.getTime();
          } else if (typeof vTime === "number") {
            shouldDelete = vTime < cutoffDate.getTime();
          }

          if (shouldDelete && !version.metadata.isRestorePoint) {
            // Don't delete restore points
            // In production, you would delete here:
            // await deleteDoc(doc(db, VERSIONS_COLLECTION, version.id));
            console.log(
              `🗑️  [RETENTION POLICY] Would delete version ${version.id} for booking ${bookingId}`
            );
            deleted++;
          } else {
            retained++;
          }
        }
      }

      // console.log(
      //   `✅ [RETENTION POLICY] Cleanup complete: ${deleted} versions marked for deletion, ${retained} retained`
      // );

      return { deleted, retained };
    } catch (error) {
      console.error("❌ [RETENTION POLICY] Cleanup failed:", error);
      throw error;
    }
  }

  // ========================================================================
  // BULK OPERATIONS
  // ========================================================================

  /**
   * Create a summary version snapshot for bulk operations
   * This creates a single version entry that represents a bulk operation affecting multiple bookings
   */
  async createBulkOperationSnapshot(
    options: BulkOperationOptions
  ): Promise<string> {
    try {
      console.log("🔍 [BULK VERSION] Creating bulk operation snapshot:", {
        operationType: options.operationType,
        totalCount: options.totalCount,
        affectedBookingIds: options.affectedBookingIds.slice(0, 5), // Log first 5 IDs
      });

      // Use a timestamp-based version number for bulk operations
      const versionNumber = Date.now() + Math.floor(Math.random() * 1000);

      // Create a synthetic booking ID for bulk operations
      const bulkBookingId = `bulk_${options.operationType}_${Date.now()}`;

      // Generate branch ID for bulk operations
      const branchId = `bulk-${options.operationType}-${Date.now()}`;

      // Create changes array for bulk operation
      const changes: FieldChange[] = [
        {
          fieldPath: "_bulk_operation",
          fieldName: "Bulk Operation",
          oldValue: null,
          newValue: `${options.operationType}: ${options.operationDescription}`,
          dataType: "string",
        },
      ];

      // Create synthetic document snapshot for bulk operation
      const documentSnapshot: SheetData = {
        id: bulkBookingId,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Add bulk operation metadata
        _bulkOperation: {
          type: options.operationType,
          description: options.operationDescription,
          totalCount: options.totalCount,
          successCount: options.successCount || 0,
          failureCount: options.failureCount || 0,
          affectedBookingIds: options.affectedBookingIds,
        },
      } as SheetData;

      // Create branch info for bulk operation
      const branchInfo: BranchInfo = {
        isMainBranch: true, // Bulk operations are part of main timeline
        branchName: `Bulk ${options.operationType}`,
        hasChildBranches: false,
        childBranchIds: [],
      };

      // Create the bulk operation metadata
      const bulkOperationMetadata: BulkOperationMetadata = {
        createdAt: Timestamp.now(),
        createdBy: options.userId,
        createdByName: options.userName,
        changeType:
          options.operationType === "delete"
            ? "bulk_delete"
            : options.operationType === "import"
            ? "bulk_import"
            : "bulk_update",
        changeDescription: options.operationDescription,
        isRestorePoint: false,
        bulkOperation: {
          operationType: options.operationType,
          totalCount: options.totalCount,
          successCount: options.successCount || 0,
          failureCount: options.failureCount || 0,
          affectedBookingIds: options.affectedBookingIds,
        },
      };

      // Create version snapshot for bulk operation
      const versionSnapshot: any = {
        bookingId: bulkBookingId,
        versionNumber,
        branchId,
        documentSnapshot,
        metadata: bulkOperationMetadata,
        changes,
        branchInfo,
      };

      // Remove any undefined values recursively
      const cleanVersionSnapshot = this.removeUndefinedValues(versionSnapshot);

      // console.log(
      //   "🔍 [BULK VERSION] Complete bulk operation snapshot:",
      //   JSON.stringify(cleanVersionSnapshot, null, 2)
      // );

      // Add to Firestore
      const docRef = await addDoc(
        collection(db, VERSIONS_COLLECTION),
        cleanVersionSnapshot
      );

      // console.log(
      //   `✅ Created bulk operation snapshot ${docRef.id} for ${options.operationType} operation affecting ${options.totalCount} bookings`
      // );
      return docRef.id;
    } catch (error) {
      console.error(
        `❌ Failed to create bulk operation snapshot for ${options.operationType}:`,
        error
      );
      throw error;
    }
  }
}

// ============================================================================
// SERVICE INSTANCE
// ============================================================================

export const bookingVersionHistoryService =
  new BookingVersionHistoryServiceImpl();
