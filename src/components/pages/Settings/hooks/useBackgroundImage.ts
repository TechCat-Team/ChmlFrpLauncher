import { useState, useEffect } from "react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import {
  getInitialBackgroundImage,
  getInitialBackgroundOverlayOpacity,
  getInitialBackgroundBlur,
  isVideoFile,
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
            name: "图片和视频",
            extensions: [
              "png",
              "jpg",
              "jpeg",
              "gif",
              "webp",
              "bmp",
              "mp4",
              "webm",
              "ogv",
              "mov",
            ],
          },
          {
            name: "图片",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"],
          },
          {
            name: "视频",
            extensions: ["mp4", "webm", "ogv", "mov"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        const isVideo = isVideoFile(selected);

        if (isVideo) {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const copiedPath = await invoke<string>("copy_background_video", {
              sourcePath: selected,
            });
            const videoPath = `app://${copiedPath}`;
            setBackgroundImage(videoPath);
            toast.success("背景视频设置成功", {
              duration: 2000,
            });
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            toast.error(`复制视频文件失败: ${errorMsg}`, {
              duration: 3000,
            });
          }
        } else {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const copiedPath = await invoke<string>("copy_background_image", {
              sourcePath: selected,
            });
            const imagePath = `app://${copiedPath}`;
            setBackgroundImage(imagePath);
            toast.success("背景图设置成功", {
              duration: 2000,
            });
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            toast.error(`复制图片文件失败: ${errorMsg}`, {
              duration: 3000,
            });
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`选择文件失败: ${errorMsg}`, {
        duration: 3000,
      });
    } finally {
      setIsSelectingImage(false);
    }
  };

  const handleClearBackgroundImage = () => {
    setBackgroundImage(null);
    toast.success("已清除背景", {
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
