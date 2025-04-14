import { useState } from 'react';
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ImageViewerProps {
  src: string;
  alt?: string;
  className?: string;
}

export function ImageViewer({ src, alt = "Image", className }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90));
  };

  return (
    <div className={cn("relative w-full h-full", className)}>
      <div className="absolute top-2 right-2 z-10 flex space-x-2 bg-background/80 p-1 rounded-md backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRotate} title="Rotate">
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="h-svh relative">
        <div className="flex items-center justify-center min-h-full p-4">
          <img 
            src={src} 
            alt={alt}
            style={{ 
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease-in-out'
            }}
            className="max-w-full max-h-full object-contain transition-transform"
          />
        </div>
      </ScrollArea>
    </div>
  );
} 