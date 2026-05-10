import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import defaultCrosshair from "../../assets/crosshair.png";

function mimeTypeForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "ico") return "image/x-icon";
  if (ext === "bmp") return "image/bmp";
  return "image/png";
}

export function useCrosshairPreview(customImage: string | null) {
  const [previewImageSrc, setPreviewImageSrc] = useState<string>(defaultCrosshair);

  useEffect(() => {
    if (!customImage) {
      setPreviewImageSrc(defaultCrosshair);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    invoke<number[]>("read_custom_image", { path: customImage })
      .then((bytes) => {
        if (!active) return;

        const blob = new Blob([new Uint8Array(bytes)], { type: mimeTypeForPath(customImage) });
        objectUrl = URL.createObjectURL(blob);
        setPreviewImageSrc(objectUrl);
      })
      .catch((err) => {
        console.error("Failed to load custom crosshair:", err);
        if (active) setPreviewImageSrc(defaultCrosshair);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [customImage]);

  return previewImageSrc;
}
