import { useState, useRef, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TitleBar } from "@/components/TitleBar";
import { Home } from "@/components/pages/Home";
import { TunnelList } from "@/components/pages/TunnelList";
import { Logs } from "@/components/pages/Logs";
import { Settings } from "@/components/pages/Settings";
import { getStoredUser, type StoredUser } from "@/services/api";
import { AntivirusWarningDialog } from "@/components/dialogs/AntivirusWarningDialog";
import { CloseConfirmDialog } from "@/components/dialogs/CloseConfirmDialog";
import { UpdateDialog } from "@/components/dialogs/UpdateDialog";
import { useAppTheme } from "@/components/App/hooks/useAppTheme";
import { useWindowEvents } from "@/components/App/hooks/useWindowEvents";
import { useAppInitialization } from "@/components/App/hooks/useAppInitialization";
import { useTitleBar } from "@/components/App/hooks/useTitleBar";
import { useBackground } from "@/components/App/hooks/useBackground";
import { useDeepLink } from "@/components/App/hooks/useDeepLink";
import { useFrpcDownload } from "@/components/App/hooks/useFrpcDownload";
import { useUpdateCheck } from "@/components/App/hooks/useUpdateCheck";
import { updateService } from "@/services/updateService";
import { toast } from "sonner";
import { BackgroundLayer } from "@/components/App/components/BackgroundLayer";
import { getInitialSidebarMode } from "@/components/pages/Settings/utils";
import type { SidebarMode } from "@/components/pages/Settings/types";

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser());
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => true);
  const isMacOS =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  // Hooks
  useAppTheme(); // Manages theme in DOM
  const { showCloseConfirmDialog, setShowCloseConfirmDialog } =
    useWindowEvents();
  const { showTitleBar } = useTitleBar();

  const SIDEBAR_LEFT = isMacOS && !showTitleBar ? 10 : 15; // px
  const SIDEBAR_COLLAPSED_WIDTH = Math.round(((20 * 5) / 3) * 2); // ~66 px (double the previous collapsed width)
  const appContainerRef = useRef<HTMLDivElement>(null);
  const {
    backgroundImage,
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
  } = useBackground();

  useAppInitialization();
  useDeepLink(user, setUser);
  const { updateInfo, setUpdateInfo } = useUpdateCheck();
  const { showAntivirusWarning, setShowAntivirusWarning } = useFrpcDownload();
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() =>
    getInitialSidebarMode(),
  );

  useEffect(() => {
    const handleSidebarModeChange = () => {
      setSidebarMode(getInitialSidebarMode());
    };
    window.addEventListener("sidebarModeChanged", handleSidebarModeChange);
    return () =>
      window.removeEventListener("sidebarModeChanged", handleSidebarModeChange);
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Home user={user} onUserChange={setUser} />;
      case "tunnels":
        return <TunnelList user={user} />;
      case "logs":
        return <Logs />;
      case "settings":
        return <Settings />;
      default:
        return <Home user={user} onUserChange={setUser} />;
    }
  };

  const backgroundStyle = useCallback(() => {
    if (!backgroundImage) {
      return {
        backgroundColor: getBackgroundColorWithOpacity(100),
      };
    }
    return {};
  }, [backgroundImage, getBackgroundColorWithOpacity]);

  const handleVideoError = useCallback(() => {
    // Video error is handled in useBackground hook
  }, []);

  const handleVideoLoadedData = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.volume = videoVolume / 100;
      videoRef.current.play().catch(() => {});
    }
  }, [videoRef, videoVolume]);

  const handleUpdate = useCallback(async () => {
    if (!updateInfo) return;

    setIsDownloadingUpdate(true);
    setDownloadProgress(0);

    try {
      await updateService.installUpdate((progress) => {
        setDownloadProgress(progress);
      });
      toast.success("更新已下载完成，应用将在重启后更新", {
        duration: 5000,
      });
      setUpdateInfo(null);
      setIsDownloadingUpdate(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`下载更新失败: ${errorMsg}`, {
        duration: 5000,
      });
      setIsDownloadingUpdate(false);
    }
  }, [updateInfo, setUpdateInfo]);

  const handleCloseUpdateDialog = useCallback(() => {
    if (!isDownloadingUpdate) {
      setUpdateInfo(null);
    }
  }, [isDownloadingUpdate, setUpdateInfo]);

  return (
    <>
      <div
        ref={appContainerRef}
        className={`flex flex-col h-screen w-screen overflow-hidden text-foreground ${
          backgroundImage && effectType === "frosted"
            ? "frosted-glass-enabled"
            : ""
        } ${
          backgroundImage && effectType === "translucent"
            ? "translucent-enabled"
            : ""
        }`}
        style={{
          ...backgroundStyle(),
          borderRadius: "0",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <BackgroundLayer
          backgroundImage={backgroundImage}
          backgroundType={backgroundType as "image" | "video" | null}
          videoSrc={videoSrc}
          videoLoadError={videoLoadError}
          videoRef={videoRef}
          videoStartSound={videoStartSound}
          overlayOpacity={overlayOpacity}
          blur={blur}
          getBackgroundColorWithOpacity={getBackgroundColorWithOpacity}
          appContainerRef={appContainerRef}
          onVideoError={handleVideoError}
          onVideoLoadedData={handleVideoLoadedData}
        />
        {(!isMacOS || showTitleBar) && (
          <div className="relative z-50">
            <TitleBar />
          </div>
        )}
        {sidebarMode === "floating" ? (
          <>
            {/* 悬浮侧边栏 - 绝对定位，占满窗口高度 */}
            <div
              className="absolute z-50"
              style={{
                left: `${SIDEBAR_LEFT}px`,
                top:
                  isMacOS && !showTitleBar
                    ? "10px"
                    : !isMacOS || showTitleBar
                      ? "48px"
                      : "12px",
                bottom: "12px",
              }}
            >
              <Sidebar
                activeTab={activeTab}
                onTabChange={handleTabChange}
                user={user}
                onUserChange={setUser}
                collapsed={sidebarCollapsed}
                onCollapseChange={setSidebarCollapsed}
                collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
                mode="floating"
              />
            </div>

            {/* 主内容区域 - 绝对定位，从顶部开始 */}
            <div
              className="absolute z-40 overflow-hidden rounded-b-[12px]"
              style={{
                left: `${SIDEBAR_LEFT + SIDEBAR_COLLAPSED_WIDTH}px`,
                right: "0",
                top: !isMacOS || showTitleBar ? "36px" : "0",
                bottom: "0",
              }}
            >
              {isMacOS && !showTitleBar ? (
                <div
                  data-tauri-drag-region
                  className="absolute top-0 left-0 right-0 h-8 z-10"
                />
              ) : null}
              <div className="h-full overflow-auto px-6 pt-4 pb-6 md:px-8 md:pt-6 md:pb-8">
                <div className="max-w-6xl mx-auto w-full h-full">
                  <div className="h-full flex flex-col">{renderContent()}</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* 经典侧边栏布局 */
          <div className="relative flex flex-1 overflow-hidden">
            <Sidebar
              activeTab={activeTab}
              onTabChange={handleTabChange}
              user={user}
              onUserChange={setUser}
              mode="classic"
            />
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {isMacOS && !showTitleBar ? (
                <div
                  data-tauri-drag-region
                  className="h-8 flex-shrink-0 w-full"
                />
              ) : null}
              <div
                className={`flex-1 overflow-auto px-6 pb-6 md:px-8 md:pb-8 ${!isMacOS || showTitleBar ? "pt-4 md:pt-6" : "pt-0"}`}
              >
                <div className="max-w-6xl mx-auto w-full h-full">
                  <div className="h-full flex flex-col">{renderContent()}</div>
                </div>
              </div>
            </div>
          </div>
        )}
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

      {updateInfo && (
        <UpdateDialog
          isOpen={!!updateInfo}
          onClose={handleCloseUpdateDialog}
          onUpdate={handleUpdate}
          version={updateInfo.version}
          date={updateInfo.date}
          body={updateInfo.body}
          isDownloading={isDownloadingUpdate}
          downloadProgress={downloadProgress}
        />
      )}
    </>
  );
}

export default App;
