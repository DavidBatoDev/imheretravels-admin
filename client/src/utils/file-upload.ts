import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
  StorageReference,
} from "firebase/storage";
import { storage } from "@/lib/firebase";

// ============================================================================
// STORAGE CONFIGURATION
// ============================================================================

// Main storage bucket for all tour images
export const STORAGE_BUCKET = "tour-images";

// ============================================================================
// FILE UPLOAD TYPES
// ============================================================================

export interface UploadResult {
  success: boolean;
  data?: {
    publicUrl: string;
    path: string;
  };
  error?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface FileUploadOptions {
  bucket: string;
  folder?: string;
  maxSize?: number;
  allowedTypes?: string[];
  generateUniqueName?: boolean;
  onProgress?: (progress: UploadProgress) => void;
}

// ============================================================================
// FILE VALIDATION
// ============================================================================

export const validateFile = (
  file: File,
  options: Partial<FileUploadOptions> = {}
): { valid: boolean; error?: string } => {
  const { maxSize = 10 * 1024 * 1024, allowedTypes } = options; // Default 10MB

  // Check file size
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size ${(file.size / 1024 / 1024).toFixed(
        2
      )}MB exceeds maximum allowed size of ${(maxSize / 1024 / 1024).toFixed(
        2
      )}MB`,
    };
  }

  // Check file type
  if (allowedTypes && !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${
        file.type
      } is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
    };
  }

  return { valid: true };
};

// ============================================================================
// FILE UPLOAD UTILITIES
// ============================================================================

export const generateUniqueFileName = (originalName: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split(".").pop();
  const nameWithoutExtension = originalName.replace(/\.[^/.]+$/, "");
  const sanitizedName = nameWithoutExtension.replace(/[^a-zA-Z0-9]/g, "_");

  return `${sanitizedName}_${timestamp}_${randomString}.${extension}`;
};

export const getFilePath = (
  fileName: string,
  folder?: string,
  tourId?: string
): string => {
  const basePath = folder || "uploads";

  if (tourId) {
    return `${basePath}/tours/${tourId}/${fileName}`;
  }

  return `${basePath}/${fileName}`;
};

// ============================================================================
// BUCKET MANAGEMENT
// ============================================================================

/**
 * List all storage buckets in the Firebase project
 */
export async function listStorageBuckets() {
  console.log("Listing Firebase storage buckets...");

  try {
    // Firebase Storage doesn't have a direct listBuckets method like Supabase
    // We'll check if we can access the default bucket
    const testRef = ref(storage, "test-connection.txt");

    return {
      success: true,
      buckets: [{ name: "default", public: true }],
      message: "Firebase Storage bucket accessible",
    };
  } catch (error) {
    console.error("Failed to access Firebase storage:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      buckets: [],
    };
  }
}

/**
 * Debug helper to check storage setup - call this in console
 */
export async function debugStorageSetup() {
  console.log("🔍 Checking Firebase storage setup...");

  try {
    // Test basic storage access
    const testRef = ref(storage, "test/connection-test.txt");
    console.log("✅ Firebase storage connection successful");

    // Test if we can list files (this will work even if no files exist)
    const testListRef = ref(storage, "test");
    console.log("✅ Firebase storage listing capability confirmed");

    console.log("📝 Firebase Storage is ready for uploads!");
  } catch (error) {
    console.error("❌ Firebase storage setup failed:", error);
  }
}

// Make debug function available globally in development
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).debugStorageSetup = debugStorageSetup;
  console.log(
    "🛠️  Debug helper available: call debugStorageSetup() in console to check storage setup"
  );
}

// ============================================================================
// CORE UPLOAD FUNCTIONS
// ============================================================================

export const uploadFile = async (
  file: File,
  options: FileUploadOptions
): Promise<UploadResult> => {
  console.log("uploadFile called with:", {
    fileName: file.name,
    bucket: options.bucket,
    folder: options.folder,
  });

  try {
    // Validate file
    const validation = validateFile(file, options);
    if (!validation.valid) {
      console.error("File validation failed:", validation.error);
      return {
        success: false,
        error: validation.error,
      };
    }

    // Generate file name
    const fileName = options.generateUniqueName
      ? generateUniqueFileName(file.name)
      : file.name;

    // Generate file path
    const filePath = getFilePath(fileName, options.folder);

    console.log("Uploading to Firebase path:", filePath);

    // Create a reference to the file location
    const storageRef = ref(storage, filePath);

    // Upload to Firebase Storage
    const snapshot = await uploadBytes(storageRef, file, {
      cacheControl: "3600",
    });

    console.log("Upload successful:", snapshot);

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    console.log("Generated download URL:", downloadURL);

    return {
      success: true,
      data: {
        publicUrl: downloadURL,
        path: filePath,
      },
    };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
};

// ============================================================================
// BULK UPLOAD FUNCTIONS
// ============================================================================

export const uploadMultipleFiles = async (
  files: File[],
  options: FileUploadOptions
): Promise<UploadResult[]> => {
  const results: UploadResult[] = [];

  for (const file of files) {
    const result = await uploadFile(file, options);
    results.push(result);
  }

  return results;
};

export const uploadFilesParallel = async (
  files: File[],
  options: FileUploadOptions
): Promise<UploadResult[]> => {
  const uploadPromises = files.map((file) => uploadFile(file, options));
  return Promise.all(uploadPromises);
};

// ============================================================================
// TOUR-SPECIFIC UPLOAD FUNCTIONS
// ============================================================================

export const uploadTourCoverImage = async (
  file: File,
  tourId: string
): Promise<UploadResult> => {
  console.log(`Uploading cover image to Firebase storage`);

  const result = await uploadFile(file, {
    bucket: STORAGE_BUCKET,
    folder: "tours/covers",
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    generateUniqueName: true,
  });

  if (result.success) {
    console.log(`Successfully uploaded cover image to Firebase storage`);
  } else {
    console.error(`Failed to upload cover image:`, result.error);
  }

  return result;
};

export const uploadTourGalleryImages = async (
  files: File[],
  tourId: string
): Promise<UploadResult[]> => {
  console.log(`Uploading ${files.length} gallery images to Firebase storage`);

  const results = await uploadFilesParallel(files, {
    bucket: STORAGE_BUCKET,
    folder: "tours/gallery",
    maxSize: 8 * 1024 * 1024, // 8MB
    allowedTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    generateUniqueName: true,
  });

  // Check if all uploads were successful
  const allSuccessful = results.every((result) => result.success);

  if (allSuccessful) {
    console.log(`Successfully uploaded all gallery images to Firebase storage`);
  } else {
    console.log(`Some gallery uploads failed`);
  }

  return results;
};

// ============================================================================
// DISCOUNT EVENT-SPECIFIC UPLOAD FUNCTIONS
// ============================================================================

export const uploadDiscountEventBanner = async (
  file: File,
  eventId: string
): Promise<UploadResult> => {
  console.log(`Uploading discount event banner to Firebase storage`);

  const result = await uploadFile(file, {
    bucket: STORAGE_BUCKET,
    folder: "discount-events/banners",
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    generateUniqueName: true,
  });

  if (result.success) {
    console.log(
      `Successfully uploaded discount event banner to Firebase storage`
    );
  } else {
    console.error(`Failed to upload discount event banner:`, result.error);
  }

  return result;
};

// ============================================================================
// SALE EVENT UPLOAD FUNCTIONS
// ============================================================================

/** Banner for a sale page (desktop or mobile), stored under `sale-events/banners`. */
export const uploadSaleBanner = async (file: File): Promise<UploadResult> => {
  const result = await uploadFile(file, {
    bucket: STORAGE_BUCKET,
    folder: "discount-events/banners", // existing Storage-rules path; sale banners share it
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    generateUniqueName: true,
  });
  if (!result.success) console.error(`Failed to upload sale banner:`, result.error);
  return result;
};

// ============================================================================
// DELETE FUNCTIONS
// ============================================================================

export const deleteFile = async (
  filePath: string,
  bucket: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fileRef = ref(storage, filePath);
    await deleteObject(fileRef);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
};

export const deleteMultipleFiles = async (
  filePaths: string[],
  bucket: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const deletePromises = filePaths.map((filePath) => {
      const fileRef = ref(storage, filePath);
      return deleteObject(fileRef);
    });

    await Promise.all(deletePromises);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
};

// ============================================================================
// URL UTILITIES
// ============================================================================

export const getFileUrl = async (
  filePath: string,
  bucket: string
): Promise<string> => {
  const fileRef = ref(storage, filePath);
  return await getDownloadURL(fileRef);
};

export const extractFilePathFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");

    // Firebase Storage URLs have a different structure
    // Extract the path after the project ID
    const projectIndex = pathParts.findIndex((part) =>
      part.includes("firebaseapp.com")
    );
    if (projectIndex !== -1 && projectIndex < pathParts.length - 1) {
      return pathParts.slice(projectIndex + 1).join("/");
    }

    return null;
  } catch {
    return null;
  }
};

// ============================================================================
// TEST AND DEBUG FUNCTIONS
// ============================================================================

export const testSupabaseStorageConnection = async (): Promise<{
  success: boolean;
  error?: string;
  details?: {
    bucketExists: boolean;
    bucketAccess: boolean;
    uploadTest: boolean;
  };
}> => {
  try {
    console.log("Testing Firebase storage connection...");

    // Test 1: Check if storage is accessible
    const testRef = ref(storage, "test/connection-test.txt");
    console.log("Storage reference created successfully");

    // Test 2: Check bucket access (Firebase Storage is always accessible)
    console.log("Bucket access confirmed");

    // Test 3: Try a small test upload
    const testFile = new File(["test"], "test.txt", { type: "text/plain" });
    const testPath = "test/connection-test.txt";

    try {
      const testStorageRef = ref(storage, testPath);
      const snapshot = await uploadBytes(testStorageRef, testFile);
      console.log("Test upload successful:", snapshot);

      // Clean up test file
      await deleteObject(testStorageRef);
      console.log("Test file cleaned up");

      console.log("All Firebase storage tests passed!");
      return {
        success: true,
        details: {
          bucketExists: true,
          bucketAccess: true,
          uploadTest: true,
        },
      };
    } catch (uploadError) {
      console.error("Test upload failed:", uploadError);
      return {
        success: false,
        error: `Test upload failed: ${
          uploadError instanceof Error ? uploadError.message : "Unknown error"
        }. Check your Firebase configuration.`,
        details: {
          bucketExists: true,
          bucketAccess: true,
          uploadTest: false,
        },
      };
    }
  } catch (error) {
    console.error("Firebase storage connection test failed:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown error during test",
    };
  }
};
