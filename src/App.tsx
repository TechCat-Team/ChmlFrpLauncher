import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Sidebar } from "@/components/Sidebar";
import { TitleBar } from "@/components/TitleBar";
import { Home } from "@/components/pages/Home";
import { TunnelList } from "@/components/pages/TunnelList";
import { Logs } from "@/components/pages/Logs";
import { Settings } from "@/components/pages/Settings";
import { getStoredUser, type StoredUser } from "@/services/api";
import { frpcDownloader } from "@/services/frpcDownloader.ts";
import { updateService } from "@/services/updateService";
import { Progress } from "@/components/ui/progress";
import { logStore } from "@/services/logStore";

let globalDownloadFlag = false;

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser());
  const downloadToastRef = useRef<string | number | null>(null);
  const isDownloadingRef = useRef(false);
  const appContainerRef = useRef<HTMLDivElement>(null);
  const isMacOS = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const [showTitleBar, setShowTitleBar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("showTitleBar");
    // 如果从未设置过，默认返回 false（关闭）
    if (stored === null) return false;
    return stored === "true";
  });
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

  const getInitialTheme = (): string => {
    if (typeof window === "undefined") return "light";
    const followSystem = localStorage.getItem("themeFollowSystem") !== "false";
    let initialTheme: string;
    if (followSystem) {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      initialTheme = prefersDark ? "dark" : "light";
    } else {
      initialTheme = localStorage.getItem("theme") || "light";
    }

    const root = document.documentElement;
    if (initialTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    return initialTheme;
  };

  const [theme, setTheme] = useState<string>(() => getInitialTheme());

  useEffect(() => {
    logStore.startListening();
  }, []);

  useEffect(() => {
    const handleTitleBarVisibilityChange = () => {
      const stored = localStorage.getItem("showTitleBar");
      setShowTitleBar(stored !== "false");
    };

    window.addEventListener("titleBarVisibilityChanged", handleTitleBarVisibilityChange);
    return () => {
      window.removeEventListener("titleBarVisibilityChanged", handleTitleBarVisibilityChange);
    };
  }, []);

  useEffect(() => {
    // 禁用右键菜单
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  useEffect(() => {
    const applyThemeToDOM = (themeValue: string) => {
      const root = document.documentElement;
      if (themeValue === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    applyThemeToDOM(theme);
  }, [theme]);

  useEffect(() => {
    const handleThemeChange = () => {
      const followSystem =
        localStorage.getItem("themeFollowSystem") !== "false";
      if (followSystem) {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        setTheme(prefersDark ? "dark" : "light");
      } else {
        const currentTheme = localStorage.getItem("theme") || "light";
        setTheme(currentTheme);
      }
    };

    window.addEventListener("storage", (e) => {
      if (e.key === "theme" || e.key === "themeFollowSystem") {
        handleThemeChange();
      }
    });

    const handleThemeChanged = () => {
      handleThemeChange();
    };
    window.addEventListener("themeChanged", handleThemeChanged);

    const followSystem = localStorage.getItem("themeFollowSystem") !== "false";
    if (followSystem) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleSystemThemeChange);

      return () => {
        window.removeEventListener("themeChanged", handleThemeChanged);
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
    }

    return () => {
      window.removeEventListener("themeChanged", handleThemeChanged);
    };
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "backgroundImage") {
        setBackgroundImage(e.newValue);
      } else if (e.key === "backgroundOverlayOpacity") {
        const value = e.newValue ? parseInt(e.newValue, 10) : 80;
        setOverlayOpacity(value);
      } else if (e.key === "backgroundBlur") {
        const value = e.newValue ? parseInt(e.newValue, 10) : 4;
        setBlur(value);
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
    };
  }, []);

  useEffect(() => {
    const checkUpdateOnStart = async () => {
      if (!updateService.getAutoCheckEnabled()) {
        return;
      }

      try {
        const result = await updateService.checkUpdate();
        if (result.available) {
          toast.info(
            <div className="space-y-2">
              <div className="text-sm font-medium">
                发现新版本: {result.version}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                更新将在后台下载，完成后会提示您安装
              </div>
            </div>,
            { duration: 8000 },
          );

          try {
            await updateService.installUpdate();
            toast.success("更新已下载完成，应用将在重启后更新", {
              duration: 5000,
            });
          } catch (installError) {
            console.error("自动下载更新失败:", installError);
          }
        }
      } catch (error) {
        console.error("自动检测更新失败:", error);
      }
    };

    const timer = setTimeout(() => {
      checkUpdateOnStart();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const checkAndDownloadFrpc = async () => {
      if (globalDownloadFlag || isDownloadingRef.current) {
        return;
      }

      globalDownloadFlag = true;
      isDownloadingRef.current = true;

      try {
        const exists = await frpcDownloader.checkFrpcExists();

        if (exists) {
          globalDownloadFlag = false;
          isDownloadingRef.current = false;
          return;
        }
        downloadToastRef.current = toast.loading(
          <div className="space-y-2">
            <div className="text-sm font-medium">正在下载 frpc 客户端...</div>
            <Progress value={0} />
            <div className="text-xs text-muted-foreground">0.0%</div>
          </div>,
          {
            duration: Infinity,
          },
        );

        await frpcDownloader.downloadFrpc((progress) => {
          if (downloadToastRef.current !== null) {
            toast.loading(
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  正在下载 frpc 客户端...
                </div>
                <Progress value={progress.percentage} />
                <div className="text-xs text-muted-foreground">
                  {progress.percentage.toFixed(1)}% (
                  {(progress.downloaded / 1024 / 1024).toFixed(2)} MB /{" "}
                  {(progress.total / 1024 / 1024).toFixed(2)} MB)
                </div>
              </div>,
              {
                id: downloadToastRef.current,
                duration: Infinity,
              },
            );
          }
        });

        if (downloadToastRef.current !== null) {
          toast.success("frpc 客户端下载成功", {
            id: downloadToastRef.current,
            duration: 3000,
          });
          downloadToastRef.current = null;
        }
        globalDownloadFlag = false;
        isDownloadingRef.current = false;
      } catch (error) {
        if (downloadToastRef.current !== null) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          toast.error(
            <div className="space-y-2">
              <div className="text-sm font-medium">frpc 客户端下载失败</div>
              <div className="text-xs text-muted-foreground">{errorMsg}</div>
              <div className="text-xs">请前往设置页面重新下载</div>
            </div>,
            {
              id: downloadToastRef.current,
              duration: 10000,
            },
          );
          downloadToastRef.current = null;
        }

        globalDownloadFlag = false;
        isDownloadingRef.current = false;
      }
    };

    checkAndDownloadFrpc();

    return () => {
      frpcDownloader.cleanup();
      if (downloadToastRef.current !== null) {
        toast.dismiss(downloadToastRef.current);
        downloadToastRef.current = null;
      }
    };
  }, []);

  const handleTabChange = (tab: string) => {
    if (tab === "tunnels" && !user) return;
    setActiveTab(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Home user={user} onUserChange={setUser} />;
      case "tunnels":
        return <TunnelList />;
      case "logs":
        return <Logs />;
      case "settings":
        return <Settings />;
      default:
        return <Home user={user} onUserChange={setUser} />;
    }
  };

  const getBackgroundColorWithOpacity = (opacity: number): string => {
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
  };

  const backgroundStyle = useMemo(() => {
    if (backgroundImage) {
      return {
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      };
    }
    return {
      backgroundColor: getBackgroundColorWithOpacity(100),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundImage, theme]);

  const overlayStyle = useMemo(() => {
    if (!backgroundImage) {
      // 没有背景图片时，不显示覆盖层
      return {};
    }
    return {
      backgroundColor: getBackgroundColorWithOpacity(overlayOpacity),
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundImage, overlayOpacity, blur, theme]);

  useEffect(() => {
    // 当主题变化时，延迟更新背景色以确保 CSS 变量已更新
    const updateBackgroundColors = () => {
      // 更新覆盖层颜色（如果有背景图）
      if (backgroundImage) {
        const overlayElement = document.querySelector(
          ".background-overlay",
        ) as HTMLElement;
        if (overlayElement) {
          overlayElement.style.backgroundColor =
            getBackgroundColorWithOpacity(overlayOpacity);
        }
      }
      
      // 更新主背景色（如果没有背景图）
      if (!backgroundImage && appContainerRef.current) {
        appContainerRef.current.style.backgroundColor =
          getBackgroundColorWithOpacity(100);
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(updateBackgroundColors);
    });
  }, [theme, overlayOpacity, backgroundImage]);

  return (
    <div
      ref={appContainerRef}
      className="flex flex-col h-screen overflow-hidden text-foreground rounded-[12px]"
      style={{
        ...backgroundStyle,
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <div
        className="absolute inset-0 background-overlay rounded-[12px]"
        style={{
          ...overlayStyle,
          borderRadius: '12px',
        }}
      />
      {(!isMacOS || showTitleBar) && (
        <div className="relative z-50">
          <TitleBar />
        </div>
      )}
      <div className="relative flex w-full flex-1 overflow-hidden rounded-b-[12px]">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          user={user}
          onUserChange={setUser}
        />

        <div className="flex-1 flex flex-col overflow-hidden relative">
          {isMacOS && !showTitleBar ? (
            <div
              data-tauri-drag-region
              className="absolute top-0 left-0 right-0 h-12 z-10"
            />
          ) : null}
          <div className="flex-1 overflow-auto p-6 md:p-8">
            <div className="max-w-6xl mx-auto w-full h-full">
              <div className="h-full flex flex-col">{renderContent()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
