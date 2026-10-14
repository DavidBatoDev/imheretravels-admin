import { db } from "@/lib/firebase";
import { doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { bookingVersionHistoryService } from "./booking-version-history-service";
import { useAuthStore } from "@/store/auth-store";
import { SheetData } from "@/types/sheet-management";
import { normalizeBookingFieldValue } from "@/lib/email-normalize";

type PendingDocUpdates = Record<string, any>; // fieldPath -> value

// Configuration for version tracking in batched writes
const BATCHED_VERSION_TRACKING_CONFIG = {
  enabled: true, // Set to false to disable version tracking for batched writes
};

class BatchedWriter {
  private queue: Map<string, PendingDocUpdates> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private readonly debounceMs = 100; // Reduced from 200ms
  private readonly maxDocsPerFlush = 400; // Increased from 50 to handle more docs per batch
  private readonly maxBatchSize = 500; // Firestore batch limit
  private columns: any[] = []; // Store column definitions for data type detection

  setColumns(columns: any[]) {
    this.columns = columns;
  }

  queueFieldUpdate(docId: string, fieldPath: string, value: any) {
    const existing = this.queue.get(docId) || {};
    // Every sheet and edit-modal write lands here, so trim pasted emails once
    // instead of in each input.
    existing[fieldPath] = normalizeBookingFieldValue(fieldPath, value);
    this.queue.set(docId, existing);

    // Flush if queue is big
    if (this.queue.size >= this.maxDocsPerFlush) {
      this.flush();
      return;
    }

    // Debounce flush
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.size === 0) return;

    const entries = Array.from(this.queue.entries());
    this.queue.clear();

    // Process in chunks to respect Firestore batch limits
    const chunkSize = this.maxBatchSize;
    // entries is Array<[string, PendingDocUpdates]>, so chunks is an array of those slices
    const chunks: Array<Array<[string, PendingDocUpdates]>> = [];
    for (let i = 0; i < entries.length; i += chunkSize) {
      chunks.push(entries.slice(i, i + chunkSize));
    }

    console.log(
      `📦 [BATCHED WRITER] Flushing ${entries.length} documents in ${chunks.length} chunks`
    );

    // Process chunks in parallel for better performance
    const chunkPromises = chunks.map(async (chunk, chunkIndex) => {
      const batch = writeBatch(db);

      // Pre-fetch all documents in this chunk to avoid individual getDoc calls
      const docRefs = chunk.map(([docId]) => doc(db, "bookings", docId));
      const docSnaps = await Promise.all(
        docRefs.map((ref) => getDoc(ref).catch(() => null))
      );

      for (let i = 0; i < chunk.length; i++) {
        const [docId, updates] = chunk[i];
        const ref = docRefs[i];
        const snap = docSnaps[i];

        // Ensure updatedAt is set once for the update
        const payload: Record<string, any> = {
          ...updates,
          updatedAt: serverTimestamp(),
        };

        if (snap && snap.exists()) {
          batch.update(ref, payload);
        } else {
          // Create minimal doc
          batch.set(ref, {
            id: docId,
            createdAt: serverTimestamp(),
            ...payload,
          });
        }
      }

      try {
        await batch.commit();
        console.log(
          `✅ [BATCHED WRITER] Chunk ${chunkIndex + 1}/${
            chunks.length
          } committed successfully`
        );
      } catch (err) {
        console.error(
          `❌ [BATCHED WRITER] Chunk ${chunkIndex + 1}/${
            chunks.length
          } failed:`,
          err
        );
        throw err;
      }
    });

    try {
      await Promise.all(chunkPromises);
      console.log(
        `✅ [BATCHED WRITER] All ${chunks.length} chunks committed successfully`
      );

      // Create version snapshots asynchronously for all updated documents
      if (BATCHED_VERSION_TRACKING_CONFIG.enabled) {
        this.createVersionSnapshotsAsync(entries);
      }
    } catch (err) {
      console.error("❌ [BATCHED WRITER] One or more chunks failed:", err);
    }
  }

  /**
   * Create version snapshots asynchronously for batch-updated documents
   * This runs in the background and doesn't affect batched write performance
   */
  private createVersionSnapshotsAsync(
    entries: [string, PendingDocUpdates][]
  ): void {
    // Fire-and-forget async operation
    (async () => {
      try {
        console.log(
          `📝 [BATCHED WRITER] Creating version snapshots for ${entries.length} documents`
        );

        // Get current user info from auth store
        const { user, userProfile } = useAuthStore.getState();
        const currentUserId = user?.uid || "system";
        const currentUserName =
          userProfile?.profile?.firstName && userProfile?.profile?.lastName
            ? `${userProfile.profile.firstName} ${userProfile.profile.lastName}`
            : userProfile?.email || user?.email || "System";

        // Process version snapshots in parallel for better performance
        const versionPromises = entries.map(async ([docId, updates]) => {
          try {
            // Get the updated document data
            const docRef = doc(db, "bookings", docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
              const bookingData = {
                id: docSnap.id,
                ...docSnap.data(),
              } as SheetData;

              // Create field changes from the updates object
              // Note: We don't have the old values here, so we'll let the service detect changes
              const changedFieldPaths = Object.keys(updates).filter(
                (key) => key !== "updatedAt" // Exclude automatic timestamp updates
              );

              console.log(
                `🔍 [BATCHED WRITER] Detected changed fields for ${docId}:`,
                changedFieldPaths
              );
              console.log(
                `🔍 [BATCHED WRITER] Booking data snapshot for ${docId}:`,
                {
                  bookingDataKeys: Object.keys(bookingData),
                  changedFieldValues: changedFieldPaths.reduce((acc, field) => {
                    acc[field] = bookingData[field as keyof SheetData];
                    return acc;
                  }, {} as Record<string, any>),
                }
              );

              // Create version snapshot with changed fields information
              await bookingVersionHistoryService.createVersionSnapshot(
                docId,
                bookingData,
                {
                  changeType: "update",
                  changeDescription: `Updated ${changedFieldPaths.join(", ")}`,
                  userId: currentUserId,
                  userName: currentUserName,
                  // Provide the changed field paths so the service can detect changes
                  changedFieldPaths,
                },
                this.columns // Pass column definitions for data type detection
              );
              console.log(
                `✅ [BATCHED WRITER] Version snapshot created for ${docId}`
              );
            }
          } catch (versionError) {
            // Log error but don't throw - this is fire-and-forget
            // Version tracking failures should not affect the main batched write operation
            console.error(
              `❌ [BATCHED WRITER] Failed to create version snapshot for ${docId}:`,
              versionError instanceof Error
                ? versionError.message
                : "Unknown error"
            );

            // Optionally, we could implement a retry mechanism here
            // or queue failed version snapshots for later processing
          }
        });

        // Wait for all version snapshots to complete (or fail)
        await Promise.allSettled(versionPromises);
        console.log(
          `✅ [BATCHED WRITER] Version snapshot processing completed`
        );
      } catch (error) {
        console.error(
          "❌ [BATCHED WRITER] Version snapshot processing failed:",
          error
        );
      }
    })();
  }
}

export const batchedWriter = new BatchedWriter();
export default batchedWriter;
