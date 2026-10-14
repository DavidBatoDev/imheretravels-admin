import "server-only";

import { randomUUID } from "node:crypto";

import { adminBucket } from "@/lib/firebase-admin-db";
import {
  generateUniqueFileName,
  getFilePath,
  validateFile,
  type FileUploadOptions,
  type UploadResult,
} from "@/utils/file-upload";

/**
 * Server-side twin of `uploadFile` / `deleteFile` in `@/utils/file-upload`,
 * on firebase-admin so API routes keep working once Storage rules deny
 * unauthenticated clients. Same signatures and result shape: routes only swap
 * the import.
 *
 * Download URLs use the same token format the browser SDK's getDownloadURL
 * returns, so stored `fileDownloadURL`s look the same as before and keep
 * working whatever the rules say.
 */
export { STORAGE_BUCKET } from "@/utils/file-upload";

export function downloadUrl(bucketName: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

export async function uploadFile(file: File, options: FileUploadOptions): Promise<UploadResult> {
  const validation = validateFile(file, options);
  if (!validation.valid) return { success: false, error: validation.error };

  const fileName = options.generateUniqueName ? generateUniqueFileName(file.name) : file.name;
  const path = getFilePath(fileName, options.folder);

  try {
    const bucket = adminBucket();
    const token = randomUUID();
    await bucket.file(path).save(Buffer.from(await file.arrayBuffer()), {
      resumable: false,
      metadata: {
        contentType: file.type || undefined,
        cacheControl: "3600",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    return { success: true, data: { publicUrl: downloadUrl(bucket.name, path, token), path } };
  } catch (error) {
    console.error("server-storage: upload failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Upload failed" };
  }
}

export async function deleteFile(
  filePath: string,
  _bucket?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminBucket().file(filePath).delete();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Delete failed" };
  }
}
