"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Search, Upload, Check, ChevronLeft, ChevronRight,
  ImageIcon, Loader2, Folder, Home, Film, Play,
} from "lucide-react";
import storageService from "@/services/storage-service";
import type { ImageItem, StorageFolder } from "@/types/storage";
import ImageCropper from "./ImageCropper";

type ModalState = "browse" | "crop" | "bulk-crop";
type MediaTab = "images" | "videos";

const ROOT = "images";
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB

function pathToCrumbs(path: string): { label: string; path: string }[] {
  const segments = path.split("/");
  return segments.map((seg, i) => ({
    label: i === 0 ? "Storage" : seg,
    path: segments.slice(0, i + 1).join("/"),
  }));
}

interface ImagePickerModalProps {
  open: boolean;
  onClose: () => void;
  /** `kind` tells the caller whether an image or video was chosen (only "video" when `enableVideos`). */
  onConfirm: (urls: string[], kind?: "image" | "video") => void;
  aspectRatio: number;
  multiple?: boolean;
  initialImageUrl?: string;
  title?: string;
  /** Starting folder for browse + target folder for uploads */
  storageFolder?: string;
  /** Adds a "Videos" tab that lets the user pick/upload a video from the shared video library. */
  enableVideos?: boolean;
  /** Which tab to open on first render (only relevant when `enableVideos`). */
  initialTab?: MediaTab;
}

export default function ImagePickerModal({
  open,
  onClose,
  onConfirm,
  aspectRatio,
  multiple = false,
  initialImageUrl,
  title = "Select Image",
  storageFolder,
  enableVideos = false,
  initialTab = "images",
}: ImagePickerModalProps) {
  const [state, setState] = useState<ModalState>("browse");
  const [mediaTab, setMediaTab] = useState<MediaTab>("images");

  // ── Folder browse state ────────────────────────────────────────────────────
  const [browsePath, setBrowsePath] = useState<string>(ROOT);
  const [browseFolders, setBrowseFolders] = useState<StorageFolder[]>([]);
  const [browseFiles, setBrowseFiles] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Video tab state ──────────────────────────────────────────────────────────
  const [videos, setVideos] = useState<ImageItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const videoUploadInputRef = useRef<HTMLInputElement>(null);

  // ── Upload / crop state ────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ImageItem[]>([]);

  const [cropSrc, setCropSrc] = useState<string>("");
  const [cropItem, setCropItem] = useState<ImageItem | null>(null);
  const [cropReady, setCropReady] = useState(false);
  const [applyTrigger, setApplyTrigger] = useState(0);

  const [bulkQueue, setBulkQueue] = useState<ImageItem[]>([]);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkResults, setBulkResults] = useState<string[]>([]);
  const [bulkCropReady, setBulkCropReady] = useState(false);
  const [bulkApplyTrigger, setBulkApplyTrigger] = useState(0);

  const [isReplaceMode, setIsReplaceMode] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const pendingUrlRef = useRef<string>("");

  // ── Load folder contents ───────────────────────────────────────────────────

  async function loadContents(path: string) {
    setLoading(true);
    setSearch("");
    try {
      const [foldersData, filesData] = await Promise.all([
        storageService.getFolders(path),
        storageService.getFilesByFolder(path),
      ]);
      setBrowseFolders(foldersData);
      setBrowseFiles(filesData);
    } finally {
      setLoading(false);
    }
  }

  function navigateTo(path: string) {
    setBrowsePath(path);
    setSelected([]);
    loadContents(path);
  }

  async function loadVideos() {
    setVideosLoading(true);
    try {
      setVideos(await storageService.getVideos());
    } finally {
      setVideosLoading(false);
    }
  }

  function switchToVideos() {
    setMediaTab("videos");
    if (videos.length === 0) loadVideos();
  }

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) { alert("Please select a video file."); return; }
    if (file.size > MAX_VIDEO_BYTES) {
      alert(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB.`);
      return;
    }
    setVideoUploading(true);
    try {
      const uploaded = await storageService.uploadVideo(file);
      onConfirm([uploaded.url], "video");
      onClose();
    } catch { alert("Failed to upload video. Please try again."); }
    finally { setVideoUploading(false); }
  }

  // ── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      if (pendingUrlRef.current) { URL.revokeObjectURL(pendingUrlRef.current); pendingUrlRef.current = ""; }
      pendingFileRef.current = null;
      return;
    }
    const startPath = storageFolder ?? ROOT;
    const startTab: MediaTab = enableVideos ? initialTab : "images";
    setBrowsePath(startPath);
    setBrowseFolders([]);
    setBrowseFiles([]);
    setMediaTab(startTab);
    setVideos([]);
    if (startTab === "videos") loadVideos();
    setState(initialImageUrl ? "crop" : "browse");
    setCropSrc(initialImageUrl ?? "");
    setCropItem(null);
    setCropReady(false);
    setApplyTrigger(0);
    setSelected([]);
    setBulkQueue([]);
    setBulkIndex(0);
    setBulkResults([]);
    setBulkCropReady(false);
    setBulkApplyTrigger(0);
    setSearch("");
    setIsReplaceMode(false);
    if (!initialImageUrl) loadContents(startPath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialImageUrl, storageFolder, enableVideos, initialTab]);

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredFolders = browseFolders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredFiles = browseFiles.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredVideos = videos.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Selection ──────────────────────────────────────────────────────────────

  function toggleSelect(item: ImageItem) {
    if (!multiple) {
      setCropItem(item);
      setCropSrc(item.url);
      setCropReady(false);
      setApplyTrigger(0);
      setState("crop");
      return;
    }
    setSelected((prev) =>
      prev.some((s) => s.id === item.id)
        ? prev.filter((s) => s.id !== item.id)
        : [...prev, item]
    );
  }

  function confirmSelection() {
    if (selected.length === 0) return;
    if (selected.length === 1) {
      setCropItem(selected[0]);
      setCropSrc(selected[0]!.url);
      setCropReady(false);
      setApplyTrigger(0);
      setState("crop");
    } else {
      setBulkQueue(selected);
      setBulkIndex(0);
      setBulkResults([]);
      setBulkCropReady(false);
      setBulkApplyTrigger(0);
      setState("bulk-crop");
    }
  }

  // ── Upload new ─────────────────────────────────────────────────────────────

  function handleNewUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!file.type.startsWith("image/")) { alert("Please select an image file."); return; }
    // Use a local blob URL — avoids Firebase CORS entirely so canvas toBlob() works
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
    const localUrl = URL.createObjectURL(file);
    pendingFileRef.current = file;
    pendingUrlRef.current = localUrl;
    setCropItem(null);
    setCropSrc(localUrl);
    setCropReady(false);
    setApplyTrigger(0);
    setIsReplaceMode(false);
    setState("crop");
  }

  // ── Crop confirm (single) ──────────────────────────────────────────────────

  const handleCropDone = useCallback(
    async (blob: Blob | null, isFullCrop: boolean) => {
      // The crop covers the whole image → nothing was actually cropped.
      if (isFullCrop) {
        // Existing stored image: reuse its URL instead of uploading a duplicate.
        if (cropSrc && !cropSrc.startsWith("blob:")) {
          onConfirm([cropSrc]);
          onClose();
          return;
        }
        // Brand-new local file at full size: upload the original as-is (no re-encode).
        const original = pendingFileRef.current;
        if (!original) return;
        setUploading(true);
        try {
          const uploaded = await storageService.uploadImage(original, [], browsePath);
          if (pendingUrlRef.current) { URL.revokeObjectURL(pendingUrlRef.current); pendingUrlRef.current = ""; }
          pendingFileRef.current = null;
          onConfirm([uploaded.url]);
          onClose();
        } catch { alert("Failed to upload image. Please try again."); }
        finally { setUploading(false); }
        return;
      }

      if (!blob) return;
      setUploading(true);
      try {
        const ext = blob.type === "image/png" ? "png" : "jpg";
        const sourceName = pendingFileRef.current?.name ?? cropItem?.name ?? "image";
        const base = sourceName.replace(/\.[^.]+$/, "");
        const file = new File([blob], `${base}-cropped.${ext}`, { type: blob.type });
        const uploaded = await storageService.uploadImage(file, [], browsePath);
        if (pendingUrlRef.current) { URL.revokeObjectURL(pendingUrlRef.current); pendingUrlRef.current = ""; }
        pendingFileRef.current = null;
        onConfirm([uploaded.url]);
        onClose();
      } catch { alert("Failed to upload cropped image. Please try again."); }
      finally { setUploading(false); }
    },
    [cropItem, cropSrc, onConfirm, onClose, browsePath]
  );

  // ── Use original (no crop) ───────────────────────────────────────────────────
  // Skip cropping entirely. For an existing stored image this reuses its URL with
  // no upload (avoids duplicating the file in storage). For a brand-new local file
  // it uploads the original once, as-is.
  const handleUseOriginal = useCallback(async () => {
    if (cropSrc && !cropSrc.startsWith("blob:")) {
      onConfirm([cropSrc]);
      onClose();
      return;
    }
    const original = pendingFileRef.current;
    if (!original) return;
    setUploading(true);
    try {
      const uploaded = await storageService.uploadImage(original, [], browsePath);
      if (pendingUrlRef.current) { URL.revokeObjectURL(pendingUrlRef.current); pendingUrlRef.current = ""; }
      pendingFileRef.current = null;
      onConfirm([uploaded.url]);
      onClose();
    } catch { alert("Failed to use image. Please try again."); }
    finally { setUploading(false); }
  }, [cropSrc, onConfirm, onClose, browsePath]);

  // ── Bulk crop ──────────────────────────────────────────────────────────────

  async function handleBulkCropDone(blob: Blob | null, isFullCrop: boolean) {
    const item = bulkQueue[bulkIndex];
    // Whole-image crop on an existing gallery image → reuse its URL, no re-upload.
    if (isFullCrop && item?.url) {
      advanceBulk([...bulkResults, item.url]);
      return;
    }
    if (!blob) { handleBulkSkip(); return; }
    setUploading(true);
    try {
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const base = (item?.name ?? "image").replace(/\.[^.]+$/, "");
      const file = new File([blob], `${base}-cropped.${ext}`, { type: blob.type });
      const uploaded = await storageService.uploadImage(file, [], browsePath);
      advanceBulk([...bulkResults, uploaded.url]);
    } catch { alert("Failed to upload. Skipping."); handleBulkSkip(); }
    finally { setUploading(false); }
  }

  function handleBulkSkip() {
    const item = bulkQueue[bulkIndex];
    advanceBulk([...bulkResults, item?.url ?? ""]);
  }

  function advanceBulk(results: string[]) {
    const next = bulkIndex + 1;
    if (next >= bulkQueue.length) { onConfirm(results.filter(Boolean)); onClose(); }
    else { setBulkResults(results); setBulkIndex(next); setBulkCropReady(false); setBulkApplyTrigger(0); }
  }

  // ── Back / replace navigation ──────────────────────────────────────────────

  function handleBackToBrowse() {
    setState("browse");
    setCropSrc("");
    setCropItem(null);
    setIsReplaceMode(false);
  }

  function handleReplaceWithNew() {
    setIsReplaceMode(true);
    setState("browse");
    setCropSrc("");
    setCropItem(null);
    setSelected([]);
    // The modal opened straight into crop mode (an existing image was passed),
    // so the folder was never loaded — fetch it now that we're browsing.
    loadContents(browsePath);
  }

  if (!open) return null;

  const currentBulkItem = bulkQueue[bulkIndex];
  const crumbs = pathToCrumbs(browsePath);
  const isEmpty = !loading && filteredFolders.length === 0 && filteredFiles.length === 0;

  const headerTitle =
    state === "browse" ? title
    : state === "crop" ? (initialImageUrl && !isReplaceMode ? "Edit Image" : "Crop Image")
    : "Crop Images";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-light-grey px-6 py-4">
          <h2 className="text-base font-semibold text-midnight">{headerTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-gray-400 hover:bg-light-grey hover:text-midnight transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* BROWSE */}
          {state === "browse" && (
            <div className="flex flex-col gap-4">

              {enableVideos && (
                <div className="flex self-start gap-1 rounded-lg border border-light-grey p-1 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setMediaTab("images")}
                    className={`rounded-md px-3 py-1 transition-colors ${mediaTab === "images" ? "bg-crimson-red text-white" : "text-midnight hover:text-crimson-red"}`}
                  >
                    Gallery
                  </button>
                  <button
                    type="button"
                    onClick={switchToVideos}
                    className={`rounded-md px-3 py-1 transition-colors ${mediaTab === "videos" ? "bg-crimson-red text-white" : "text-midnight hover:text-crimson-red"}`}
                  >
                    Videos
                  </button>
                </div>
              )}

              {!enableVideos || mediaTab === "images" ? (
              <>
              {/* Breadcrumbs */}
              <nav className="flex flex-wrap items-center gap-1">
                {crumbs.map((crumb, i) => {
                  const isLast = i === crumbs.length - 1;
                  return (
                    <span key={crumb.path} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="size-3 text-gray-400 shrink-0" />}
                      {isLast ? (
                        <span className="flex items-center gap-1 text-sm font-semibold text-midnight">
                          {i === 0 ? <Home className="size-3.5" /> : <Folder className="size-3.5 text-crimson-red" />}
                          {crumb.label}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigateTo(crumb.path)}
                          className="flex items-center gap-1 text-sm text-gray-500 hover:text-crimson-red transition-colors"
                        >
                          {i === 0 ? <Home className="size-3.5" /> : <Folder className="size-3.5" />}
                          {crumb.label}
                        </button>
                      )}
                    </span>
                  );
                })}
              </nav>

              {/* Search + Upload */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-light-grey py-2 pl-9 pr-4 text-sm outline-none focus:border-crimson-red"
                  />
                </div>
                <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleNewUpload} />
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 rounded-lg border border-midnight px-4 py-2 text-sm font-medium text-midnight transition-colors hover:border-crimson-red hover:text-crimson-red disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Upload New
                </button>
              </div>

              {/* Content */}
              {loading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-gray-400" />
                </div>
              ) : isEmpty ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                  <ImageIcon className="size-10" />
                  <p className="text-sm">
                    {search ? "No results match your search." : "This folder is empty. Upload an image above."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-5">

                  {/* Folders */}
                  {filteredFolders.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {filteredFiles.length > 0 && (
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Folders</p>
                      )}
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                        {filteredFolders.map((folder) => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => navigateTo(folder.path)}
                            className="group flex flex-col items-center gap-2 rounded-xl border border-light-grey p-3 transition-all hover:border-crimson-red/30 hover:bg-crimson-red/5"
                          >
                            <Folder className="size-9 text-crimson-red" />
                            <span className="w-full truncate text-center text-xs font-medium text-midnight">
                              {folder.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Images */}
                  {filteredFiles.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {filteredFolders.length > 0 && (
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Images</p>
                      )}
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                        {filteredFiles.map((img) => {
                          const isSelected = selected.some((s) => s.id === img.id);
                          return (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => toggleSelect(img)}
                              className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-all ${
                                isSelected ? "border-crimson-red" : "border-transparent hover:border-gray-300"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                              {isSelected && (
                                <div className="absolute inset-0 flex items-center justify-center bg-crimson-red/30">
                                  <div className="flex size-6 items-center justify-center rounded-full bg-crimson-red">
                                    <Check className="size-3.5 text-white" strokeWidth={3} />
                                  </div>
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <p className="truncate text-xs text-white">{img.name}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}
              </>
              ) : (
              <>
                {/* Video search + upload */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search videos…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-lg border border-light-grey py-2 pl-9 pr-4 text-sm outline-none focus:border-crimson-red"
                    />
                  </div>
                  <input ref={videoUploadInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                  <button
                    type="button"
                    onClick={() => videoUploadInputRef.current?.click()}
                    disabled={videoUploading}
                    className="flex items-center gap-2 rounded-lg border border-midnight px-4 py-2 text-sm font-medium text-midnight transition-colors hover:border-crimson-red hover:text-crimson-red disabled:opacity-50"
                  >
                    {videoUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    Upload New
                  </button>
                </div>

                {/* Video content */}
                {videosLoading ? (
                  <div className="flex h-48 items-center justify-center">
                    <Loader2 className="size-6 animate-spin text-gray-400" />
                  </div>
                ) : filteredVideos.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                    <Film className="size-10" />
                    <p className="text-sm">
                      {search ? "No videos match your search." : "No videos yet. Upload a clip above (max 25 MB)."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {filteredVideos.map((video) => (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => { onConfirm([video.url], "video"); onClose(); }}
                        title={video.name}
                        className="group relative aspect-square overflow-hidden rounded-xl border-2 border-transparent bg-black transition-all hover:border-crimson-red"
                      >
                        <video src={video.url} autoPlay loop muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full bg-black/50 p-2 opacity-90 transition-opacity group-hover:opacity-100">
                            <Play className="size-4 fill-white text-white" />
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <p className="truncate text-xs text-white">{video.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
              )}
            </div>
          )}

          {/* CROP (single) */}
          {state === "crop" && cropSrc && (
            <ImageCropper
              src={cropSrc}
              aspectRatio={aspectRatio}
              onCrop={handleCropDone}
              isProcessing={uploading}
              triggerApply={applyTrigger}
              onReadyChange={setCropReady}
            />
          )}

          {/* BULK CROP */}
          {state === "bulk-crop" && currentBulkItem && (
            <ImageCropper
              src={currentBulkItem.url}
              aspectRatio={aspectRatio}
              onCrop={handleBulkCropDone}
              isProcessing={uploading}
              triggerApply={bulkApplyTrigger}
              onReadyChange={setBulkCropReady}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-light-grey px-6 py-4">

          {/* Left: contextual action */}
          <div>
            {state === "browse" && multiple && mediaTab === "images" && (
              <span className="text-sm text-gray-400">
                {selected.length > 0
                  ? `${selected.length} image${selected.length === 1 ? "" : "s"} selected`
                  : "Select images from the gallery"}
              </span>
            )}
            {state === "crop" && !initialImageUrl && (
              <button
                type="button"
                onClick={handleBackToBrowse}
                className="flex items-center gap-1.5 text-sm font-medium text-midnight hover:text-crimson-red transition-colors"
              >
                <ChevronLeft className="size-4" />
                Back to gallery
              </button>
            )}
            {state === "crop" && initialImageUrl && !isReplaceMode && (
              <button
                type="button"
                onClick={handleReplaceWithNew}
                className="flex items-center gap-1.5 text-sm font-medium text-midnight hover:text-crimson-red transition-colors"
              >
                <Upload className="size-4" />
                Replace with new image
              </button>
            )}
            {state === "bulk-crop" && (
              <button
                type="button"
                onClick={handleBulkSkip}
                disabled={uploading}
                className="text-sm font-medium text-gray-500 hover:text-midnight transition-colors disabled:opacity-40"
              >
                Skip this image
              </button>
            )}
          </div>

          {/* Right: primary actions */}
          <div className="flex items-center gap-2">
            {state === "bulk-crop" && (
              <span className="text-xs text-gray-400 mr-2">
                {bulkIndex + 1} / {bulkQueue.length}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-light-grey px-4 py-2 text-sm font-medium text-midnight hover:bg-light-grey transition-colors"
            >
              Cancel
            </button>
            {state === "browse" && multiple && mediaTab === "images" && (
              <button
                type="button"
                onClick={confirmSelection}
                disabled={selected.length === 0}
                className="rounded-lg bg-crimson-red px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Confirm Selection
              </button>
            )}
            {state === "crop" && (
              <>
                {/* Secondary: crop & upload a derived file */}
                <button
                  type="button"
                  onClick={() => setApplyTrigger((n) => n + 1)}
                  disabled={!cropReady || uploading}
                  className="rounded-lg border border-midnight px-4 py-2 text-sm font-medium text-midnight hover:border-crimson-red hover:text-crimson-red disabled:opacity-40 transition-colors flex items-center gap-2"
                >
                  Apply Crop
                </button>
                {/* Primary: reuse the original — no duplicate upload for existing images */}
                <button
                  type="button"
                  onClick={handleUseOriginal}
                  disabled={uploading}
                  className="rounded-lg bg-crimson-red px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
                >
                  {uploading && <Loader2 className="size-4 animate-spin" />}
                  Use original (no crop)
                </button>
              </>
            )}
            {state === "bulk-crop" && (
              <button
                type="button"
                onClick={() => setBulkApplyTrigger((n) => n + 1)}
                disabled={!bulkCropReady || uploading}
                className="rounded-lg bg-crimson-red px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
              >
                {uploading && <Loader2 className="size-4 animate-spin" />}
                {bulkIndex + 1 < bulkQueue.length ? "Next →" : "Done"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
