import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Sidebar } from "@/components/Sidebar";
import { TitleBar } from "@/components/TitleBar";
import { Home } from "@/components/pages/Home";
import { TunnelList } from "@/components/pages/TunnelList";
import { Logs } from "@/components/pages/Logs";
import { Settings } from "@/components/pages/Settings";
import { getStoredUser, type StoredUser, fetchTunnels, fetchUserInfo, saveStoredUser } from "@/services/api";
import { frpcDownloader } from "@/services/frpcDownloader.ts";
import { updateService } from "@/services/updateService";
import { Progress } from "@/components/ui/progress";
import { logStore } from "@/services/logStore";
import { AntivirusWarningDialog } from "@/components/dialogs/AntivirusWarningDialog";
import { CloseConfirmDialog } from "@/components/dialogs/CloseConfirmDialog";
import { deepLinkService, type DeepLinkData } from "@/services/deepLinkService";
import { frpcManager } from "@/services/frpcManager";

let globalDownloadFlag = false;

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser());
  const downloadToastRef = useRef<string | number | null>(null);
  const isDownloadingRef = useRef(false);
  const appContainerRef = useRef<HTMLDivElement>(null);
  const isMacOS = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const [showAntivirusWarning, setShowAntivirusWarning] = useState(false);
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false);
  const [showTitleBar, setShowTitleBar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("showTitleBar");
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
  const [frostedGlassEnabled, setFrostedGlassEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("frostedGlassEnabled");
    return stored === "true";
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
  
  const pendingDeepLinkRef = useRef<DeepLinkData | null>(null);
  const isAppReadyRef = useRef(false);

  useEffect(() => {
    logStore.startListening();
    
    const initProcessGuard = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const guardEnabled = localStorage.getItem("processGuardEnabled") === "true";
        await invoke("set_process_guard_enabled", { enabled: guardEnabled });
        console.log(`[守护进程] 初始化状态: ${guardEnabled ? "启用" : "禁用"}`);
      } catch (error) {
        console.error("Failed to initialize process guard:", error);
      }
    };
    
    initProcessGuard();
  }, []);

  useEffect(() => {
    const handleShowCloseConfirmDialog = () => {
      setShowCloseConfirmDialog(true);
    };

    const handleMinimizeToTray = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("hide_window");
      } catch (error) {
        console.error("Failed to minimize to tray:", error);
      }
    };

    const handleCloseApp = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("quit_app");
      } catch (error) {
        console.error("Failed to close app:", error);
      }
    };

    window.addEventListener("showCloseConfirmDialog", handleShowCloseConfirmDialog);
    window.addEventListener("minimizeToTray", handleMinimizeToTray);
    window.addEventListener("closeApp", handleCloseApp);

    return () => {
      window.removeEventListener("showCloseConfirmDialog", handleShowCloseConfirmDialog);
      window.removeEventListener("minimizeToTray", handleMinimizeToTray);
      window.removeEventListener("closeApp", handleCloseApp);
    };
  }, []);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupWindowCloseListener = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { invoke } = await import("@tauri-apps/api/core");
        const appWindow = getCurrentWindow();

        const unlisten = await appWindow.listen("window-close-requested", async () => {
          const closeBehavior = localStorage.getItem("closeBehavior") || "ask";
          
          if (closeBehavior === "ask") {
            setShowCloseConfirmDialog(true);
          } else if (closeBehavior === "minimize_to_tray") {
            try {
              await invoke("hide_window");
            } catch (error) {
              console.error("Failed to hide window:", error);
            }
          } else {
            try {
              await invoke("quit_app");
            } catch (error) {
              console.error("Failed to quit app:", error);
            }
          }
        });

        unlistenFn = unlisten;
      } catch (error) {
        console.error("Failed to setup window close listener:", error);
      }
    };

    setupWindowCloseListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
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
      } else if (e.key === "frostedGlassEnabled") {
        setFrostedGlassEnabled(e.newValue === "true");
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

    const handleFrostedGlassChange = () => {
      const enabled = localStorage.getItem("frostedGlassEnabled") === "true";
      setFrostedGlassEnabled(enabled);
    };
    window.addEventListener(
      "frostedGlassChanged",
      handleFrostedGlassChange,
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
      window.removeEventListener(
        "frostedGlassChanged",
        handleFrostedGlassChange,
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
          
          const isWindows = typeof navigator !== "undefined" && 
            navigator.userAgent.toLowerCase().includes("windows");
          const isPossibleAntivirusBlock = 
            errorMsg.includes("写入文件失败") ||
            errorMsg.includes("无法打开文件") ||
            errorMsg.includes("permission denied") ||
            errorMsg.includes("access denied") ||
            errorMsg.includes("Permission denied") ||
            errorMsg.includes("Access denied");

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

          if (isWindows && isPossibleAntivirusBlock) {
            setTimeout(() => {
              setShowAntivirusWarning(true);
            }, 500);
          }
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

  const handleDeepLinkInternal = useCallback(async (data: DeepLinkData) => {
    try {
      const currentUser = getStoredUser();
      let tokenToUse = data.usertoken || currentUser?.usertoken;

      if (data.usertoken && !currentUser?.usertoken) {
          toast.loading("正在使用 token 登录...", {
            duration: Infinity,
          });

          try {
            const userInfo = await fetchUserInfo(data.usertoken);
            
            const newUser: StoredUser = {
              username: userInfo.username,
              usergroup: userInfo.usergroup,
              userimg: userInfo.userimg || null,
              usertoken: data.usertoken,
              tunnelCount: userInfo.tunnelCount,
              tunnel: userInfo.tunnel,
            };

            saveStoredUser(newUser);
            setUser(newUser);
            tokenToUse = data.usertoken;

            toast.dismiss();
            toast.success("登录成功");
            
            await new Promise(resolve => setTimeout(resolve, 300));
          } catch (error) {
            toast.dismiss();
            const errorMsg =
              error instanceof Error ? error.message : "登录失败";
            toast.error(`使用 token 登录失败: ${errorMsg}`);
            console.error("Deep-link 登录失败:", error);
            return;
          }
        }

        if (!tokenToUse) {
          toast.error("请先登录账户");
          return;
        }

        const tunnels = await fetchTunnels(tokenToUse);
        const tunnel = tunnels.find((t) => t.id === data.tunnelId);

        if (!tunnel) {
          toast.error(`未找到 ID 为 ${data.tunnelId} 的隧道，或该隧道不属于当前用户`);
          return;
        }

        const isRunning = await frpcManager.isTunnelRunning(data.tunnelId);
        if (isRunning) {
          toast.info(`隧道 ${tunnel.name} 已在运行中`);
          return;
        }

        toast.loading(`正在启动隧道 ${tunnel.name}...`, {
          duration: Infinity,
        });

        await frpcManager.startTunnel(data.tunnelId, tokenToUse);

        const isHttpType =
          tunnel.type.toUpperCase() === "HTTP" ||
          tunnel.type.toUpperCase() === "HTTPS";
        const linkAddress = isHttpType
          ? tunnel.dorp
          : `${tunnel.ip}:${tunnel.dorp}`;

        let hasHandledSuccess = false;
        const unsubscribe = logStore.subscribe((logs) => {
          if (hasHandledSuccess) {
            return;
          }

          const successLog = logs.find(
            (log) =>
              log.tunnel_id === data.tunnelId &&
              log.message.includes("映射启动成功")
          );

          if (successLog) {
            hasHandledSuccess = true;

            toast.dismiss();
            toast.success(
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  隧道 {tunnel.name} 启动成功，点击复制链接地址
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">
                    {linkAddress}
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(linkAddress);
                        toast.success("链接地址已复制到剪贴板");
                      } catch {
                        toast.error("复制失败");
                      }
                    }}
                    className="text-xs px-2 py-1 bg-foreground/10 hover:bg-foreground/20 rounded transition-colors"
                  >
                    复制
                  </button>
                </div>
              </div>,
              {
                duration: 10000,
              }
            );

            unsubscribe();
          }
        });

        setTimeout(() => {
          if (!hasHandledSuccess) {
            unsubscribe();
            toast.dismiss();
            toast.error(`隧道 ${tunnel.name} 启动超时，请检查日志`);
          }
        }, 30000);
      } catch (error) {
        toast.dismiss();
        const errorMsg =
          error instanceof Error ? error.message : "启动隧道失败";
        toast.error(errorMsg);
        console.error("Deep-link 启动隧道失败:", error);
      }
  }, []);

  useEffect(() => {
    const wrappedHandler = async (data: DeepLinkData) => {
      if (!isAppReadyRef.current) {
        console.log("应用未准备好，缓存 deep-link 事件:", data);
        pendingDeepLinkRef.current = data;
        return;
      }
      
      await handleDeepLinkInternal(data);
    };

    deepLinkService.startListening(wrappedHandler);

    return () => {
      deepLinkService.stopListening();
    };
  }, [handleDeepLinkInternal]);
  
  useEffect(() => {
    if (isAppReadyRef.current && pendingDeepLinkRef.current && user?.usertoken) {
      const pendingData = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null;
      setTimeout(() => {
        handleDeepLinkInternal(pendingData);
      }, 500);
    }
  }, [user?.usertoken, handleDeepLinkInternal]);

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

  const backgroundType = useMemo(() => {
    if (!backgroundImage) return null;
    if (backgroundImage.startsWith("data:video/")) return "video";
    if (backgroundImage.startsWith("data:image/")) return "image";
    // 向后兼容：如果没有明确的类型，假设是图片
    return "image";
  }, [backgroundImage]);

  const backgroundStyle = useMemo(() => {
    if (backgroundImage && backgroundType === "image") {
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
  }, [backgroundImage, backgroundType, theme]);

  const overlayStyle = useMemo(() => {
    if (!backgroundImage) {
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
  }, [theme, overlayOpacity, backgroundImage]);

  return (
    <>
      <div
        ref={appContainerRef}
        className={`flex flex-col h-screen w-screen overflow-hidden text-foreground rounded-[12px] ${
          backgroundImage && frostedGlassEnabled ? "frosted-glass-enabled" : ""
        }`}
        style={{
          ...backgroundStyle,
          borderRadius: '12px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {backgroundType === "video" && backgroundImage && (
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              zIndex: 0,
              borderRadius: '12px',
            }}
          >
            <source src={backgroundImage} type={backgroundImage.split(';')[0].split(':')[1]} />
          </video>
        )}
        <div
          className="absolute inset-0 background-overlay rounded-[12px]"
          style={{
            ...overlayStyle,
            borderRadius: '12px',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
        {(!isMacOS || showTitleBar) && (
          <div className="relative z-50">
            <TitleBar />
          </div>
        )}
        <div className="relative flex w-full flex-1 overflow-hidden rounded-b-[12px]" style={{ zIndex: 10 }}>
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
              className="absolute top-0 left-0 right-0 h-8 z-10"
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

      <AntivirusWarningDialog
        isOpen={showAntivirusWarning}
        onClose={() => setShowAntivirusWarning(false)}
        onConfirm={() => setActiveTab("settings")}
      />

      <CloseConfirmDialog
        isOpen={showCloseConfirmDialog}
        onClose={() => setShowCloseConfirmDialog(false)}
        onMinimizeToTray={() => {
          localStorage.setItem("closeBehavior", "minimize_to_tray");
          setShowCloseConfirmDialog(false);
          window.dispatchEvent(new CustomEvent("minimizeToTray"));
        }}
        onCloseApp={() => {
          localStorage.setItem("closeBehavior", "close_app");
          setShowCloseConfirmDialog(false);
          window.dispatchEvent(new CustomEvent("closeApp"));
        }}
      />
    </>
  );
}

export default App;
