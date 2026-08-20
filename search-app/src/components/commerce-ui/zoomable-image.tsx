import { cn } from "@/lib/utils";
import { MinusCircle, PlusCircle } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

// Split from image-viewer-basic.tsx so react-zoom-pan-pinch (103 kB) can be lazy-loaded.
// Zoom buttons live here because they need zoomIn/zoomOut from TransformWrapper's render prop.

interface ZoomableImageProps {
  imageUrl: string;
  imageAlt: string;
  className?: string;
  showControls?: boolean;
  onImageError: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}

const ZoomableImage = ({
  className,
  imageAlt,
  imageUrl,
  onImageError,
  showControls = true,
}: ZoomableImageProps) => {
  return (
    <TransformWrapper initialScale={1} initialPositionX={0} initialPositionY={0}>
      {({ zoomIn, zoomOut }) => (
        <>
          <TransformComponent>
            <img
              src={imageUrl}
              alt={imageAlt}
              className={cn("max-h-[90vh] max-w-[90vw] object-contain", className)}
              onError={onImageError}
            />
          </TransformComponent>
          {showControls && (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
              <button
                onClick={() => zoomOut()}
                className="pressable photo-control cursor-pointer"
                aria-label="Zoom out"
              >
                <MinusCircle className="size-6" />
              </button>
              <button
                onClick={() => zoomIn()}
                className="pressable photo-control cursor-pointer"
                aria-label="Zoom in"
              >
                <PlusCircle className="size-6" />
              </button>
            </div>
          )}
        </>
      )}
    </TransformWrapper>
  );
};

export default ZoomableImage;
