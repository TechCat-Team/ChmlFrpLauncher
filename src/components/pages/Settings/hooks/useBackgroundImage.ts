import { useState, useEffect } from "react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  getInitialBackgroundImage,
  getInitialBackgroundOverlayOpacity,
  getInitialBackgroundBlur,
  getMimeType,
} from "../utils";

export function useBackgroundImage() {
  const [backgroundImage, setBackgroundImage] = useState<string | null>(() =>
    getInitialBackgroundImage(),
  );
  const [isSelectingImage, setIsSelectingImage] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(() =>
    getInitialBackgroundOverlayOpacity(),
  );
  const [blur, setBlur] = useState<number>(() => getInitialBackgroundBlur());

  useEffect(() => {
    localStorage.setItem("backgroundImage", backgroundImage || "");
    window.dispatchEvent(new Event("backgroundImageChanged"));
  }, [backgroundImage]);

  useEffect(() => {
    localStorage.setItem("backgroundOverlayOpacity", overlayOpacity.toString());
    window.dispatchEvent(new Event("backgroundOverlayChanged"));
  }, [overlayOpacity]);

  useEffect(() => {
    localStorage.setItem("backgroundBlur", blur.toString());
    window.dispatchEvent(new Event("backgroundOverlayChanged"));
  }, [blur]);

  const handleSelectBackgroundImage = async () => {
    if (isSelectingImage) return;

    setIsSelectingImage(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "图片",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        const fileData = await readFile(selected);
        const uint8Array = new Uint8Array(fileData);

        let binaryString = "";
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }

        const base64 = btoa(binaryString);
        const mimeType = getMimeType(selected);
        const dataUrl = `data:${mimeType};base64,${base64}`;

        setBackgroundImage(dataUrl);
        toast.success("背景图设置成功", {
          duration: 2000,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`选择图片失败: ${errorMsg}`, {
        duration: 3000,
      });
    } finally {
      setIsSelectingImage(false);
    }
  };

  const handleClearBackgroundImage = () => {
    setBackgroundImage(null);
    toast.success("已清除背景图", {
      duration: 2000,
    });
  };

  return {
    backgroundImage,
    isSelectingImage,
    overlayOpacity,
    setOverlayOpacity,
    blur,
    setBlur,
    handleSelectBackgroundImage,
    handleClearBackgroundImage,
  };
}

