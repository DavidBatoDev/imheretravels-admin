/**
 * Lightweight CSV export helpers (no external dependency).
 *
 * A "column" maps a human-readable header to a value extracted from a row.
 * Values are coerced to strings and properly escaped for CSV (RFC 4180).
 */

export interface CsvColumn<T> {
  header: string;
  /** Extract the cell value for this column from a row. */
  value: (row: T) => unknown;
}

/** Escape a single CSV field per RFC 4180 (quote if it contains , " or newline). */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = typeof value === "string" ? value : String(value);
  // Normalise line endings inside a field so they don't break rows.
  str = str.replace(/\r\n|\r/g, "\n");
  if (/[",\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from rows + column definitions. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCsvField(c.value(row))).join(","),
  );
  return [headerLine, ...dataLines].join("\r\n");
}

/** Trigger a browser download of CSV content. Prepends a BOM so Excel reads UTF-8. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Defer revocation so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Format a value that might be a Firestore Timestamp, a Date, an ISO string,
 * or a {seconds,nanoseconds} object into a readable date string for CSV.
 */
export function formatCsvDate(value: unknown): string {
  if (!value) return "";
  try {
    let date: Date | null = null;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "string") {
      const parsed = new Date(value);
      date = isNaN(parsed.getTime()) ? null : parsed;
    } else if (typeof value === "object") {
      const anyVal = value as any;
      if (typeof anyVal.toDate === "function") {
        date = anyVal.toDate();
      } else if (typeof anyVal.seconds === "number") {
        date = new Date(anyVal.seconds * 1000);
      }
    }
    if (!date || isNaN(date.getTime())) return "";
    // YYYY-MM-DD HH:mm — unambiguous and spreadsheet-friendly.
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  } catch {
    return "";
  }
}

/** Build a filename-safe date stamp (YYYY-MM-DD) for the current local time. */
export function csvDateStamp(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
