import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import type { EffectType } from "@/components/pages/Settings/utils";
import {
  getInitialVideoStartSound,
  getInitialVideoVolume,
  getBackgroundType,
  getMimeType,
} from "@/components/pages/Settings/utils";

export type BackgroundType = "image" | "video" | null;

export interface UseBackgroundReturn {
  backgroundImage: string | null;
  imageSrc: string | null;
  overlayOpacity: number;
  blur: number;
  effectType: EffectType;
  videoLoadError: boolean;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  videoStartSound: boolean;
  videoVolume: number;
  videoSrc: string | null;
  backgroundType: BackgroundType;
  getBackgroundColorWithOpacity: (opacity: number) => string;
}

/**
 * 背景管理 hook
 * 处理背景图片、视频、覆盖层、模糊等效果
 */
export function useBackground(): UseBackgroundReturn {
  const [backgroundImage, setBackgroundImage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("backgroundImage");
  });
  const [overlayOpacity, setOverlayOpacity] = useState<number>(() => {
    if (typeof window === "undefined") return 80;
    const stored = localStorage.getItem("backgroundOverlayOpacity");
    return stored ? parseInt(stored, 10) : 80;
  });
  const [blur, setBlur] = useState<number>(() => {
    if (typeof window === "undefined") return 4;
    const stored = localStorage.getItem("backgroundBlur");
    return stored ? parseInt(stored, 10) : 4;
  });
  const [effectType, setEffectType] = useState<EffectType>(() => {
    if (typeof window === "undefined") return "none";
    const stored = localStorage.getItem("effectType");
    if (stored === "frosted" || stored === "translucent" || stored === "none") {
      return stored;
    }
    const frostedEnabled =
      localStorage.getItem("frostedGlassEnabled") === "true";
    const translucentEnabled =
      localStorage.getItem("translucentEnabled") === "true";
    if (frostedEnabled) return "frosted";
    if (translucentEnabled) return "translucent";
    return "none";
  });
  const [videoLoadError, setVideoLoadError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoStartSound, setVideoStartSound] = useState<boolean>(() =>
    getInitialVideoStartSound(),
  );
  const [videoVolume, setVideoVolume] = useState<number>(() =>
    getInitialVideoVolume(),
  );
  const hasPlayedFirstLoopRef = useRef(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const backgroundType = useMemo(() => {
    return getBackgroundType(backgroundImage);
  }, [backgroundImage]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "backgroundImage") {
        setBackgroundImage(e.newValue);
        hasPlayedFirstLoopRef.current = false;
      } else if (e.key === "backgroundOverlayOpacity") {
        const value = e.newValue ? parseInt(e.newValue, 10) : 80;
        setOverlayOpacity(value);
      } else if (e.key === "backgroundBlur") {
        const value = e.newValue ? parseInt(e.newValue, 10) : 4;
        setBlur(value);
      } else if (e.key === "effectType") {
        const value = e.newValue;
        if (
          value === "frosted" ||
          value === "translucent" ||
          value === "none"
        ) {
          setEffectType(value);
        }
      } else if (e.key === "videoStartSound") {
        const value = e.newValue === "true";
        setVideoStartSound(value);
        hasPlayedFirstLoopRef.current = false;
      } else if (e.key === "videoVolume") {
        const value = e.newValue ? parseInt(e.newValue, 10) : 50;
        setVideoVolume(value);
      }
    };
    window.addEventListener("storage", handleStorageChange);

    const handleBackgroundImageChange = () => {
      const bg = localStorage.getItem("backgroundImage");
      setBackgroundImage(bg);
    };
    window.addEventListener(
      "backgroundImageChanged",
      handleBackgroundImageChange,
    );

    const handleBackgroundOverlayChange = () => {
      const opacity = localStorage.getItem("backgroundOverlayOpacity");
      const blurValue = localStorage.getItem("backgroundBlur");
      if (opacity) {
        setOverlayOpacity(parseInt(opacity, 10));
      }
      if (blurValue) {
        setBlur(parseInt(blurValue, 10));
      }
    };
    window.addEventListener(
      "backgroundOverlayChanged",
      handleBackgroundOverlayChange,
    );

    const handleEffectTypeChange = () => {
      const stored = localStorage.getItem("effectType");
      if (
        stored === "frosted" ||
        stored === "translucent" ||
        stored === "none"
      ) {
        setEffectType(stored);
      }
    };
    window.addEventListener("effectTypeChanged", handleEffectTypeChange);

    const handleVideoStartSoundChange = () => {
      const stored = localStorage.getItem("videoStartSound");
      const value = stored === "true";
      setVideoStartSound(value);
      hasPlayedFirstLoopRef.current = false;
    };
    window.addEventListener(
      "videoStartSoundChanged",
      handleVideoStartSoundChange,
    );

    const handleVideoVolumeChange = () => {
      const stored = localStorage.getItem("videoVolume");
      const value = stored ? parseInt(stored, 10) : 50;
      setVideoVolume(value);
    };
    window.addEventListener("videoVolumeChanged", handleVideoVolumeChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        "backgroundImageChanged",
        handleBackgroundImageChange,
      );
      window.removeEventListener(
        "backgroundOverlayChanged",
        handleBackgroundOverlayChange,
      );
      window.removeEventListener("effectTypeChanged", handleEffectTypeChange);
      window.removeEventListener(
        "videoStartSoundChanged",
        handleVideoStartSoundChange,
      );
      window.removeEventListener("videoVolumeChanged", handleVideoVolumeChange);
    };
  }, []);

  useEffect(() => {
    let currentBlobUrl: string | null = null;
    let isMounted = true;

    const loadVideo = async (retryCount = 0) => {
      if (backgroundType === "video" && backgroundImage) {
        if (backgroundImage.startsWith("app://")) {
          const filePath = backgroundImage.replace("app://", "");
          try {
            const fileData = await readFile(filePath);
            if (!fileData || fileData.length === 0) {
              throw new Error("File is empty");
            }
            if (!isMounted) return;

            const blob = new Blob([fileData], { type: getMimeType(filePath) });
            const blobUrl = URL.createObjectURL(blob);
            if (currentBlobUrl) {
              URL.revokeObjectURL(currentBlobUrl);
            }
            currentBlobUrl = blobUrl;
            setVideoSrc(blobUrl);
            setVideoLoadError(false);
          } catch {
            if (!isMounted) return;

            if (retryCount < 2) {
              setTimeout(() => {
                if (isMounted) {
                  loadVideo(retryCount + 1);
                }
              }, 1000);
              return;
            }

            if (currentBlobUrl) {
              URL.revokeObjectURL(currentBlobUrl);
              currentBlobUrl = null;
            }
            setVideoSrc(null);
            setVideoLoadError(true);
          }
        } else if (backgroundImage.startsWith("file://")) {
          const filePath = backgroundImage.replace("file://", "");
          try {
            const fileData = await readFile(filePath);
            if (!fileData || fileData.length === 0) {
              throw new Error("File is empty");
            }
            if (!isMounted) return;

            const blob = new Blob([fileData], { type: getMimeType(filePath) });
            const blobUrl = URL.createObjectURL(blob);
            if (currentBlobUrl) {
              URL.revokeObjectURL(currentBlobUrl);
            }
            currentBlobUrl = blobUrl;
            setVideoSrc(blobUrl);
            setVideoLoadError(false);
          } catch {
            if (!isMounted) return;

            if (retryCount < 2) {
              setTimeout(() => {
                if (isMounted) {
                  loadVideo(retryCount + 1);
                }
              }, 1000);
              return;
            }

            if (currentBlobUrl) {
              URL.revokeObjectURL(currentBlobUrl);
              currentBlobUrl = null;
            }
            setVideoSrc(null);
            setVideoLoadError(true);
          }
        } else {
          setVideoSrc(backgroundImage);
          setVideoLoadError(false);
        }
      } else {
        setVideoSrc(null);
      }
    };

    loadVideo();

    return () => {
      isMounted = false;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [backgroundType, backgroundImage]);

  useEffect(() => {
    let currentBlobUrl: string | null = null;
    let isMounted = true;

    const loadImage = async () => {
      if (backgroundType === "image" && backgroundImage) {
        if (
          backgroundImage.startsWith("app://") ||
          backgroundImage.startsWith("file://")
        ) {
          const filePath = backgroundImage
            .replace("app://", "")
            .replace("file://", "");
          try {
            const fileData = await readFile(filePath);
            if (!fileData || fileData.length === 0) {
              throw new Error("File is empty");
            }
            if (!isMounted) return;

            const blob = new Blob([fileData], { type: getMimeType(filePath) });
            const blobUrl = URL.createObjectURL(blob);
            if (currentBlobUrl) {
              URL.revokeObjectURL(currentBlobUrl);
            }
            currentBlobUrl = blobUrl;
            setImageSrc(blobUrl);
          } catch {
            if (!isMounted) return;

            if (currentBlobUrl) {
              URL.revokeObjectURL(currentBlobUrl);
              currentBlobUrl = null;
            }
            setImageSrc(null);
          }
        } else {
          setImageSrc(backgroundImage);
        }
      } else {
        setImageSrc(null);
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [backgroundType, backgroundImage]);

  useEffect(() => {
    if (backgroundType === "video") {
      setVideoLoadError(false);
      hasPlayedFirstLoopRef.current = false;
    }
  }, [backgroundImage, backgroundType]);

  useEffect(() => {
    if (backgroundType !== "video" || !videoRef.current) return;

    const video = videoRef.current;

    video.volume = videoVolume / 100;
    video.muted = !videoStartSound || hasPlayedFirstLoopRef.current;

    if (videoStartSound && !hasPlayedFirstLoopRef.current && video.paused) {
      video.play().catch(() => {});
    }
  }, [backgroundType, videoStartSound, videoVolume]);

  useEffect(() => {
    if (
      backgroundType !== "video" ||
      !videoRef.current ||
      !videoStartSound ||
      hasPlayedFirstLoopRef.current
    ) {
      return;
    }

    const video = videoRef.current;
    let lastTime = video.currentTime || 0;
    let hasReachedNearEnd = false;

    const handleTimeUpdate = () => {
      if (hasPlayedFirstLoopRef.current) {
        return;
      }

      const currentTime = video.currentTime || 0;
      const duration = video.duration;

      if (!duration || duration === 0) {
        return;
      }

      if (currentTime >= duration - 0.5) {
        hasReachedNearEnd = true;
      }

      if (hasReachedNearEnd && currentTime < 0.5 && lastTime > duration - 0.3) {
        hasPlayedFirstLoopRef.current = true;
        video.muted = true;
        hasReachedNearEnd = false;
      }

      lastTime = currentTime;
    };

    const handleSeeking = () => {
      if (hasPlayedFirstLoopRef.current && video.currentTime < 0.5) {
        video.muted = true;
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("seeking", handleSeeking);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("seeking", handleSeeking);
    };
  }, [backgroundType, videoStartSound, videoSrc]);

  const handleVideoError = useCallback(() => {
    if (videoLoadError) return;
    setVideoLoadError(true);
  }, [videoLoadError]);

  useEffect(() => {
    if (
      backgroundType !== "video" ||
      !backgroundImage ||
      videoLoadError ||
      !videoRef.current
    ) {
      return;
    }

    const video = videoRef.current;
    let timeoutId: number | null = null;

    const handleCanPlay = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      setVideoLoadError(false);
    };

    const startTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        if (video.readyState < 1) {
          handleVideoError();
        }
      }, 8000);
    };

    if (video.readyState >= 1) {
      setVideoLoadError(false);
    } else {
      startTimeout();
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("loadedmetadata", handleCanPlay);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("loadedmetadata", handleCanPlay);
    };
  }, [backgroundType, backgroundImage, videoLoadError, handleVideoError]);

  const getBackgroundColorWithOpacity = useCallback(
    (opacity: number): string => {
      if (typeof window === "undefined")
        return `rgba(246, 247, 249, ${opacity / 100})`;
      const root = document.documentElement;
      const bgColor = getComputedStyle(root)
        .getPropertyValue("--background")
        .trim();

      if (bgColor.startsWith("#")) {
        const hex = bgColor.slice(1);
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
      }

      const rgbMatch = bgColor.match(/\d+/g);
      if (rgbMatch && rgbMatch.length >= 3) {
        return `rgba(${rgbMatch[0]}, ${rgbMatch[1]}, ${rgbMatch[2]}, ${opacity / 100})`;
      }

      return `rgba(246, 247, 249, ${opacity / 100})`;
    },
    [],
  );

  return {
    backgroundImage,
    imageSrc,
    overlayOpacity,
    blur,
    effectType,
    videoLoadError,
    videoRef,
    videoStartSound,
    videoVolume,
    videoSrc,
    backgroundType,
    getBackgroundColorWithOpacity,
  };
}
