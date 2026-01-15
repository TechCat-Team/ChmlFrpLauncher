import { useState, useRef, useCallback } from "react";
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

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser());
  const appContainerRef = useRef<HTMLDivElement>(null);
  const isMacOS =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  // Hooks
  useAppTheme(); // Manages theme in DOM
  const { showCloseConfirmDialog, setShowCloseConfirmDialog } =
    useWindowEvents();
  const { showTitleBar } = useTitleBar();
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

  const backgroundStyle = useCallback(() => {
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
  }, [backgroundImage, backgroundType, getBackgroundColorWithOpacity]);

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
        className={`flex flex-col h-screen w-screen overflow-hidden text-foreground rounded-[12px] ${
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
          borderRadius: "12px",
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
        <div
          className="relative flex w-full flex-1 overflow-hidden rounded-b-[12px]"
          style={{ zIndex: 10 }}
        >
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
