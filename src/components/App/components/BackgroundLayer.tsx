import { useMemo, useEffect, useState } from "react";
import type { BackgroundType } from "@/components/App/hooks/useBackground";

interface BackgroundLayerProps {
  backgroundImage: string | null;
  imageSrc: string | null;
  backgroundType: BackgroundType;
  videoSrc: string | null;
  videoLoadError: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoStartSound: boolean;
  overlayOpacity: number;
  blur: number;
  getBackgroundColorWithOpacity: (opacity: number) => string;
  appContainerRef: React.RefObject<HTMLDivElement | null>;
  onVideoError: () => void;
  onVideoLoadedData: () => void;
}

/**
 * 背景层组件
 * 处理背景图片、视频和覆盖层的渲染
 */
export function BackgroundLayer({
  backgroundImage,
  imageSrc,
  backgroundType,
  videoSrc,
  videoLoadError,
  videoRef,
  videoStartSound,
  overlayOpacity,
  blur,
  getBackgroundColorWithOpacity,
  appContainerRef,
  onVideoError,
  onVideoLoadedData,
}: BackgroundLayerProps) {
  // 监听主题变化
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    // 监听主题变化事件
    const handleThemeChange = () => {
      updateTheme();
    };
    window.addEventListener("themeChanged", handleThemeChange);

    // 使用 MutationObserver 监听 DOM 类变化
    const observer = new MutationObserver(() => {
      updateTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.removeEventListener("themeChanged", handleThemeChange);
      observer.disconnect();
    };
  }, []);

  const overlayStyle = useMemo(() => {
    if (!backgroundImage) {
      return {};
    }
    return {
      backgroundColor: getBackgroundColorWithOpacity(overlayOpacity),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundImage, overlayOpacity, getBackgroundColorWithOpacity, isDark]);

  useEffect(() => {
    const updateBackgroundColors = () => {
      if (backgroundImage) {
        const overlayElement = document.querySelector(
          ".background-overlay",
        ) as HTMLElement;
        if (overlayElement) {
          overlayElement.style.backgroundColor =
            getBackgroundColorWithOpacity(overlayOpacity);
        }
      }

      if (!backgroundImage && appContainerRef.current) {
        appContainerRef.current.style.backgroundColor =
          getBackgroundColorWithOpacity(100);
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(updateBackgroundColors);
    });
  }, [
    overlayOpacity,
    backgroundImage,
    getBackgroundColorWithOpacity,
    appContainerRef,
    isDark,
  ]);

  const backgroundBlurStyle = useMemo(() => {
    if (!backgroundImage || blur === 0) {
      return {};
    }
    return {
      filter: `blur(${blur}px)`,
      WebkitFilter: `blur(${blur}px)`,
    };
  }, [backgroundImage, blur]);

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 0, pointerEvents: "none" }}
    >
      {backgroundType === "image" && imageSrc && (
        <div
          className="absolute inset-0 w-full h-full rounded-[12px]"
          style={{
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            ...backgroundBlurStyle,
            zIndex: 0,
            pointerEvents: "none",
          }}
        />
      )}
      {backgroundType === "video" && videoSrc && !videoLoadError && (
        <video
          ref={videoRef}
          autoPlay
          loop
          muted={!videoStartSound}
          playsInline
          preload="auto"
          onError={onVideoError}
          onLoadedData={onVideoLoadedData}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            ...backgroundBlurStyle,
            zIndex: 0,
            borderRadius: "12px",
            pointerEvents: "none",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            position: "absolute",
          }}
        >
          <source
            src={videoSrc}
            type={
              backgroundImage?.startsWith("file://") ||
              backgroundImage?.startsWith("app://")
                ? "video/mp4"
                : backgroundImage?.split(";")[0]?.split(":")[1] || "video/mp4"
            }
          />
        </video>
      )}
      <div
        className="absolute inset-0 background-overlay rounded-[12px]"
        style={{
          ...overlayStyle,
          borderRadius: "12px",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </div>
  );
}
