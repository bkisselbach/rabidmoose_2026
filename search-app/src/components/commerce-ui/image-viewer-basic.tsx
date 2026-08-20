import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "radix-ui/dialog";
import { X } from "lucide-react";

// Lazy: react-zoom-pan-pinch (103 kB) only loads on first dialog open, not every PDP view.
const ZoomableImage = lazy(() => import("@/components/commerce-ui/zoomable-image"));

const DEFAULT_PLACEHOLDER_URL =
  "https://raw.githubusercontent.com/stackzero-labs/ui/refs/heads/main/public/placeholders/headphone-2.jpg";

interface ImageViewerProps {
  className?: string;
  classNameImageViewer?: string;
  classNameThumbnailViewer?: string;
  imageTitle?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  placeholderUrl?: string;
  Placeholder?: React.ComponentType<{ className?: string }>;
  showControls?: boolean;
}

const ImageViewer_Basic = ({
  className,
  classNameImageViewer,
  classNameThumbnailViewer,
  imageTitle,
  imageUrl,
  placeholderUrl = DEFAULT_PLACEHOLDER_URL,
  showControls = true,
  thumbnailUrl,
}: ImageViewerProps) => {
  const handleImgError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    console.error("Image failed to load", event.currentTarget.src);
    event.currentTarget.src = placeholderUrl;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className={cn("cursor-pointer", className)}>
          <img
            src={thumbnailUrl || imageUrl}
            alt={`${imageTitle ?? "Image"} - Preview`}
            width="100%"
            className={cn(
              "h-auto w-full rounded-lg object-contain transition-opacity hover:opacity-90",
              classNameThumbnailViewer
            )}
            onError={handleImgError}
          />
        </div>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="modal-overlay" />
        <DialogContent className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-0">
          <DialogTitle className="sr-only">{imageTitle || "Image"}</DialogTitle>
          <DialogDescription className="sr-only">
            {imageTitle || "Image"}
          </DialogDescription>
          <div className="relative flex h-screen w-screen items-center justify-center">
            {/* Fallback: same full-size image, un-zoomable, shown while the pan/zoom chunk loads. */}
            <Suspense
              fallback={
                <img
                  src={imageUrl}
                  alt={`${imageTitle ?? "Image"} - Full`}
                  className={cn(
                    "max-h-[90vh] max-w-[90vw] object-contain",
                    classNameImageViewer
                  )}
                  onError={handleImgError}
                />
              }
            >
              <ZoomableImage
                imageUrl={imageUrl}
                imageAlt={`${imageTitle ?? "Image"} - Full`}
                className={classNameImageViewer}
                showControls={showControls}
                onImageError={handleImgError}
              />
            </Suspense>
            <DialogClose asChild>
              <button
                className="pressable photo-control absolute top-4 right-4 z-10 cursor-pointer"
                aria-label="Close"
              >
                <X className="size-6" />
              </button>
            </DialogClose>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default ImageViewer_Basic;
