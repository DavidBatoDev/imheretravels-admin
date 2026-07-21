import { SheetColumn, SheetData } from "@/types/sheet-management";
import {
  auth,
  db,
  storage,
  firebaseUtils,
  functionsUtils,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "@/app/functions/firebase-utils";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { allBookingSheetColumns } from "@/app/functions/columns";
import { functionMap } from "@/app/functions/columns/functions-index";

type CompiledFn = (...args: any[]) => any;
type AsyncCompiledFn = (...args: any[]) => Promise<any>;

// Toggle to control error logging from executed functions.
// Set to true to re-enable detailed error logs for debugging.
const LOG_FUNCTION_ERRORS = false;
const logFunctionError = (...args: any[]) => {
  if (LOG_FUNCTION_ERRORS) {
    console.error(...args);
  }
};

class FunctionExecutionService {
  private cache: Map<string, CompiledFn> = new Map();
  private resultCache: Map<
    string,
    { result: any; timestamp: number; executionTime: number }
  > = new Map();
  private readonly RESULT_CACHE_TTL = 300000; // 5 minutes cache TTL for recompute operations
  private readonly ARGS_CACHE_TTL = 60000; // 1 minute cache TTL for argument-based caching
  private argsCache: Map<string, { args: any[]; timestamp: number }> =
    new Map();

  // Track which row+column combinations should skip cache (for dependency recomputation)
  private skipCacheKeys: Set<string> = new Set();

  // Mark a specific row+column combination to skip cache on next execution
  markForRecomputation(rowId: string, columnId: string): void {
    const key = `${rowId}:${columnId}`;
    this.skipCacheKeys.add(key);
  }

  // Clear the skip cache flag for a row+column combination
  clearRecomputationFlag(rowId: string, columnId: string): void {
    const key = `${rowId}:${columnId}`;
    this.skipCacheKeys.delete(key);
  }

  // Invalidate result cache for specific row+column (for dependency recomputation)
  invalidateForRowColumn(rowId: string, columnId: string): void {
    const prefix = `${rowId}:${columnId}:`;
    const keysToDelete = Array.from(this.resultCache.keys()).filter((key) =>
      key.includes(prefix),
    );
    keysToDelete.forEach((key) => this.resultCache.delete(key));

    const argsKeysToDelete = Array.from(this.argsCache.keys()).filter((key) =>
      key.startsWith(prefix),
    );
    argsKeysToDelete.forEach((key) => this.argsCache.delete(key));
  }

  // Invalidate a single compiled function by its ts_file id
  invalidate(fileId: string): void {
    this.cache.delete(fileId);
    this.clearResultCache(fileId);
    this.clearArgsCache(fileId);
  }

  // Invalidate multiple compiled functions at once
  invalidateMany(fileIds: string[]): void {
    for (const id of fileIds) {
      this.cache.delete(id);
      this.clearResultCache(id);
      this.clearArgsCache(id);
    }
  }

  // Clear all compiled function cache (use sparingly)
  clearAll(): void {
    this.cache.clear();
    this.resultCache.clear();
    this.argsCache.clear();
  }

  // Clear result cache for a specific function
  clearResultCache(fileId: string): void {
    const keysToDelete = Array.from(this.resultCache.keys()).filter((key) =>
      key.startsWith(`${fileId}:`),
    );
    keysToDelete.forEach((key) => this.resultCache.delete(key));
  }

  // Clear all result cache
  clearAllResultCache(): void {
    this.resultCache.clear();
  }

  // Clear argument cache for a specific function
  clearArgsCache(fileId: string): void {
    const keysToDelete = Array.from(this.argsCache.keys()).filter((key) =>
      key.startsWith(`${fileId}:`),
    );
    keysToDelete.forEach((key) => this.argsCache.delete(key));
  }

  // Clear all argument cache
  clearAllArgsCache(): void {
    this.argsCache.clear();
  }

  // Generate cache key for function execution
  private generateCacheKey(fileId: string, args: any[]): string {
    const argsString = JSON.stringify(args);
    return `${fileId}:${argsString}`;
  }

  // Check if cached result is still valid
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.RESULT_CACHE_TTL;
  }

  // Check if arguments have changed for a function call
  private haveArgsChanged(fileId: string, args: any[]): boolean {
    const argsKey = `${fileId}:args`;
    const cached = this.argsCache.get(argsKey);

    if (!cached) {
      this.argsCache.set(argsKey, { args: [...args], timestamp: Date.now() });
      return true;
    }

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.ARGS_CACHE_TTL) {
      this.argsCache.set(argsKey, { args: [...args], timestamp: Date.now() });
      return true;
    }

    // Check if arguments are different
    if (cached.args.length !== args.length) {
      this.argsCache.set(argsKey, { args: [...args], timestamp: Date.now() });
      return true;
    }

    for (let i = 0; i < args.length; i++) {
      if (cached.args[i] !== args[i]) {
        this.argsCache.set(argsKey, { args: [...args], timestamp: Date.now() });
        return true;
      }
    }

    return false;
  }

  // Execute a function with proper async handling and timeout
  async executeFunction(
    fileId: string,
    args: any[],
    timeoutMs: number = 10000,
    rowId?: string,
    columnId?: string,
  ): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    executionTime?: number;
  }> {
    const startTime = performance.now();

    // Check if this execution should skip cache (for dependency recomputation)
    const skipCacheKey = rowId && columnId ? `${rowId}:${columnId}` : null;
    const shouldSkipCache = skipCacheKey
      ? this.skipCacheKeys.has(skipCacheKey)
      : false;

    if (shouldSkipCache) {
      console.log(
        `🔄 [DEPENDENCY RECOMPUTE] Forcing recomputation for ${fileId} (row: ${rowId}, col: ${columnId})`,
      );
      // Clear the flag immediately after checking
      if (skipCacheKey) {
        this.skipCacheKeys.delete(skipCacheKey);
      }
    }

    // Check if arguments have changed - if not, skip execution entirely (unless forced)
    if (!shouldSkipCache && !this.haveArgsChanged(fileId, args)) {
      const cacheKey = this.generateCacheKey(fileId, args);
      const cachedResult = this.resultCache.get(cacheKey);

      if (cachedResult && this.isCacheValid(cachedResult.timestamp)) {
        console.log(
          `🚀 [SKIP EXECUTION] Function ${fileId} with unchanged args [${args.join(
            ", ",
          )}] - returning cached result`,
        );
        return {
          success: true,
          result: cachedResult.result,
          executionTime: 0, // No execution time for cached results
        };
      }
    }

    // Check result cache first (unless forced to skip)
    if (!shouldSkipCache) {
      const cacheKey = this.generateCacheKey(fileId, args);
      const cachedResult = this.resultCache.get(cacheKey);

      if (cachedResult && this.isCacheValid(cachedResult.timestamp)) {
        console.log(
          `🚀 [CACHE HIT] Function ${fileId} with args [${args.join(
            ", ",
          )}] executed in ${cachedResult.executionTime}ms (cached)`,
        );
        return {
          success: true,
          result: cachedResult.result,
          executionTime: cachedResult.executionTime,
        };
      }
    }

    // Optionally suppress console.error during user function execution
    const originalConsoleError = console.error;
    if (!LOG_FUNCTION_ERRORS) {
      (console as any).error = () => {};
    }

    // Generate cache key for storing result
    const cacheKey = this.generateCacheKey(fileId, args);

    try {
      const fn = await this.getCompiledFunction(fileId);

      // Check if function is async by trying to detect it
      const isAsync = this.isFunctionAsync(fn);

      let result: any;
      let executionTime: number;

      if (isAsync) {
        // Handle async function with timeout
        result = await this.executeWithTimeout(() => fn(...args), timeoutMs);
        executionTime = performance.now() - startTime;
      } else {
        // Handle sync function
        result = fn(...args);

        // Check if result is a Promise (function might return Promise without being async)
        if (result && typeof result.then === "function") {
          result = await this.executeWithTimeout(() => result, timeoutMs);
        }
        executionTime = performance.now() - startTime;
      }

      // Cache the successful result
      this.resultCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        executionTime,
      });

      console.log(
        `✅ [FUNCTION EXECUTED] Function ${fileId} with args [${args.join(
          ", ",
        )}] executed in ${executionTime}ms`,
      );

      return {
        success: true,
        result,
        executionTime,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      logFunctionError(
        `❌ [FUNCTION ERROR] Function ${fileId} with args [${args.join(
          ", ",
        )}] failed after ${executionTime}ms:`,
        error,
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime,
      };
    } finally {
      // Restore console.error regardless of outcome
      (console as any).error = originalConsoleError;
    }
  }

  // Execute function with timeout
  private async executeWithTimeout<T>(
    fn: () => T | Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      Promise.resolve(fn()),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`Function execution timeout after ${timeoutMs}ms`),
            ),
          timeoutMs,
        ),
      ),
    ]);
  }

  // Detect if a function is async (basic detection)
  private isFunctionAsync(fn: (...args: any[]) => any): boolean {
    // Check function string representation for async keyword
    const fnString = fn.toString();
    return fnString.includes("async") || fnString.includes("await");
  }

  // Helper to convert camelCase to kebab-case
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }

  // Fetch and cache the function by function name (string reference)
  // Uses static imports from functions-index for better performance
  async getCompiledFunction(functionRef: string): Promise<CompiledFn> {
    if (this.cache.has(functionRef)) return this.cache.get(functionRef)!;

    // Check if function exists in the static function map
    const fn = functionMap[functionRef];

    if (!fn) {
      throw new Error(
        `Function not found: ${functionRef} (not in function map)`,
      );
    }

    if (typeof fn !== "function") {
      throw new Error(`Invalid function: ${functionRef} is not a function`);
    }

    console.log(`✅ [CODED FUNCTION] Loaded ${functionRef} from static import`);

    // Cast to CompiledFn and cache the function
    const compiledFn = fn as CompiledFn;
    this.cache.set(functionRef, compiledFn);
    return compiledFn;
  }

  // Resolve argument list based on column argument mappings and row data
  buildArgs(
    column: SheetColumn,
    row: SheetData,
    allColumns: SheetColumn[],
  ): any[] {
    const argsMeta = column.arguments || [];
    // Pre-index columns by name to avoid repeated linear scans
    const columnsByName = new Map<string, SheetColumn>();
    for (const c of allColumns) {
      if (c.columnName) columnsByName.set(c.columnName, c);
    }

    const args = argsMeta.map((arg) => {
      const t = (arg.type || "").toLowerCase();

      // If multiple column references are supplied (array-like param)
      if (Array.isArray(arg.columnReferences) && arg.columnReferences.length) {
        const values = arg.columnReferences.map((refName) => {
          // Special case: "ID" refers to the document ID
          if (refName === "ID") {
            return row.id;
          }
          // Special case: "Row" refers to the row number
          if (refName === "Row") {
            return row.row;
          }
          const refCol = refName ? columnsByName.get(refName) : undefined;
          return refCol ? row[refCol.id] : undefined;
        });
        return values;
      }

      // Single column reference
      if (arg.columnReference !== undefined && arg.columnReference !== "") {
        // Special case: "ID" refers to the document ID
        if (arg.columnReference === "ID") {
          return row.id;
        }
        // Special case: "Row" refers to the row number
        if (arg.columnReference === "Row") {
          return row.row;
        }
        const refCol = columnsByName.get(arg.columnReference);
        const value = refCol ? row[refCol.id] : undefined;
        return value;
      }

      // Literal value provided
      if (arg.value !== undefined) {
        // If user passed array in UI it can already be string[]
        if (Array.isArray(arg.value)) return arg.value;

        // Comma-separated for array-like params
        if (
          t.includes("[]") ||
          t === "{}" ||
          t.includes("array") ||
          t.includes("string[]")
        ) {
          if (typeof arg.value === "string") {
            return arg.value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
          }
        }

        // Basic coercion based on declared arg.type
        if (t.includes("number")) return Number(arg.value);
        if (t.includes("boolean")) return String(arg.value) === "true";
        return arg.value as any;
      }

      // No mapping provided; pass undefined to allow default parameters
      return undefined;
    });

    // NEW: Add booking context for price-related columns
    // This enables locked pricing to return stored values instead of recalculating
    const priceColumns = [
      "originalTourCost",
      "discountedTourCost",
      "reservationFee",
    ];

    if (priceColumns.includes(column.id)) {
      const bookingContext = {
        originalTourCost: row.originalTourCost,
        discountedTourCost: row.discountedTourCost,
        reservationFee: row.reservationFee,
        lockPricing: row.lockPricing,
        priceSource: row.priceSource,
        tourPackagePricingVersion: row.tourPackagePricingVersion,
        priceSnapshotDate: row.priceSnapshotDate,
        // Identity keys so the price functions can resolve the tour without
        // relying on `tourPackageName`, which is a snapshot that goes stale the
        // moment a tour is renamed.
        tourId: row.tourId,
        tourCode: row.tourCode,
      };
      args.push(bookingContext);
    }

    return args;
  }
}

export const functionExecutionService = new FunctionExecutionService();
export default functionExecutionService;
