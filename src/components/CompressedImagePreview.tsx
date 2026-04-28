import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compressImage, createPreviewUrl, formatFileSize, isImageFile } from "@/utils/imageCompression";

interface CompressedImagePreviewProps {
  file: File | null;
  onConfirm: (compressedFile: File) => void;
  onCancel: () => void;
  /** Auto-confirm without showing preview UI (still compresses). Default false. */
  autoConfirm?: boolean;
}

/**
 * Compresses an image to ≤200KB and shows a preview before the user confirms.
 * Non-image files are passed through unchanged via auto-confirm.
 */
export const CompressedImagePreview = ({ file, onConfirm, onCancel, autoConfirm }: CompressedImagePreviewProps) => {
  const [compressed, setCompressed] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let url: string | null = null;
    setLoading(true);

    compressImage(file)
      .then((out) => {
        if (cancelled) return;
        setCompressed(out);
        if (isImageFile(out)) {
          url = createPreviewUrl(out);
          setPreviewUrl(url);
        }
        if (autoConfirm || !isImageFile(out)) {
          onConfirm(out);
        }
      })
      .catch(() => {
        if (!cancelled) onConfirm(file);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (!file || autoConfirm) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Optimizing image…
        </div>
      )}
      {!loading && previewUrl && compressed && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate">
              {compressed.name} • {formatFileSize(compressed.size)}
              {file.size !== compressed.size && (
                <span className="ml-1 opacity-70">(was {formatFileSize(file.size)})</span>
              )}
            </p>
            <Button type="button" size="icon" variant="ghost" onClick={onCancel} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <img
            src={previewUrl}
            alt="Upload preview"
            className="max-h-48 w-full rounded-md object-contain bg-muted"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => onConfirm(compressed)} className="flex-1">
              Confirm Upload
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
