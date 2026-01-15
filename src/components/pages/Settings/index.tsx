import { useState, useEffect, useCallback } from "react";
import { useTheme } from "./hooks/useTheme";
import { useBackgroundImage } from "./hooks/useBackgroundImage";
import { useAutostart } from "./hooks/useAutostart";
import { useUpdate } from "./hooks/useUpdate";
import { useFrpcDownload } from "./hooks/useFrpcDownload";
import { useCloseBehavior } from "./hooks/useCloseBehavior";
import { useProcessGuard } from "./hooks/useProcessGuard";
import {
  getInitialBypassProxy,
  getInitialShowTitleBar,
  getInitialEffectType,
  getInitialVideoStartSound,
  getInitialVideoVolume,
  type EffectType,
} from "./utils";
import { AppearanceSection } from "./components/AppearanceSection";
import { NetworkSection } from "./components/NetworkSection";
import { SystemSection } from "./components/SystemSection";
import { UpdateSection } from "./components/UpdateSection";
import { UpdateDialog } from "@/components/dialogs/UpdateDialog";
import { updateService } from "@/services/updateService";
import { toast } from "sonner";

export function Settings() {
  const isMacOS =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  const { followSystem, setFollowSystem, theme, setTheme, isViewTransitionRef } = useTheme();

  const {
    backgroundImage,
    isSelectingImage,
    overlayOpacity,
    setOverlayOpacity,
    blur,
    setBlur,
    handleSelectBackgroundImage,
    handleClearBackgroundImage,
  } = useBackgroundImage();

  const { autostartEnabled, autostartLoading, handleToggleAutostart } =
    useAutostart();

  const {
    autoCheckUpdate,
    checkingUpdate,
    currentVersion,
    updateInfo,
    setUpdateInfo,
    handleCheckUpdate,
    handleToggleAutoCheckUpdate,
  } = useUpdate();

  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const { isDownloading, handleRedownloadFrpc } = useFrpcDownload();

  const { closeToTrayEnabled, handleToggleCloseToTray } = useCloseBehavior();

  const { guardEnabled, guardLoading, handleToggleGuard } = useProcessGuard();

  const [bypassProxy, setBypassProxy] = useState<boolean>(() =>
    getInitialBypassProxy(),
  );
  const [showTitleBar, setShowTitleBar] = useState<boolean>(() =>
    getInitialShowTitleBar(),
  );
  const [effectType, setEffectType] = useState<EffectType>(() =>
    getInitialEffectType(),
  );
  const [videoStartSound, setVideoStartSound] = useState<boolean>(() =>
    getInitialVideoStartSound(),
  );
  const [videoVolume, setVideoVolume] = useState<number>(() =>
    getInitialVideoVolume(),
  );

  useEffect(() => {
    localStorage.setItem("bypassProxy", bypassProxy.toString());
  }, [bypassProxy]);

  useEffect(() => {
    localStorage.setItem("showTitleBar", showTitleBar.toString());
    window.dispatchEvent(new Event("titleBarVisibilityChanged"));
  }, [showTitleBar]);

  useEffect(() => {
    localStorage.setItem("effectType", effectType);
    window.dispatchEvent(new Event("effectTypeChanged"));
  }, [effectType]);

  useEffect(() => {
    localStorage.setItem("videoStartSound", videoStartSound.toString());
    window.dispatchEvent(new Event("videoStartSoundChanged"));
  }, [videoStartSound]);

  useEffect(() => {
    localStorage.setItem("videoVolume", videoVolume.toString());
    window.dispatchEvent(new Event("videoVolumeChanged"));
  }, [videoVolume]);

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
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-foreground">设置</h1>
      </div>

      <div className="flex-1 overflow-auto space-y-6">
        <AppearanceSection
          isMacOS={isMacOS}
          followSystem={followSystem}
          setFollowSystem={setFollowSystem}
          theme={theme}
          setTheme={setTheme}
          isViewTransitionRef={isViewTransitionRef}
          showTitleBar={showTitleBar}
          setShowTitleBar={setShowTitleBar}
          backgroundImage={backgroundImage}
          isSelectingImage={isSelectingImage}
          overlayOpacity={overlayOpacity}
          setOverlayOpacity={setOverlayOpacity}
          blur={blur}
          setBlur={setBlur}
          effectType={effectType}
          setEffectType={setEffectType}
          videoStartSound={videoStartSound}
          setVideoStartSound={setVideoStartSound}
          videoVolume={videoVolume}
          setVideoVolume={setVideoVolume}
          onSelectBackgroundImage={handleSelectBackgroundImage}
          onClearBackgroundImage={handleClearBackgroundImage}
        />

        <NetworkSection
          bypassProxy={bypassProxy}
          setBypassProxy={setBypassProxy}
        />

        <SystemSection
          autostartEnabled={autostartEnabled}
          autostartLoading={autostartLoading}
          onToggleAutostart={handleToggleAutostart}
          autoCheckUpdate={autoCheckUpdate}
          onToggleAutoCheckUpdate={handleToggleAutoCheckUpdate}
          closeToTrayEnabled={closeToTrayEnabled}
          onToggleCloseToTray={handleToggleCloseToTray}
          guardEnabled={guardEnabled}
          guardLoading={guardLoading}
          onToggleGuard={handleToggleGuard}
        />

        <UpdateSection
          checkingUpdate={checkingUpdate}
          currentVersion={currentVersion}
          onCheckUpdate={handleCheckUpdate}
          isDownloading={isDownloading}
          onRedownloadFrpc={handleRedownloadFrpc}
        />
      </div>

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
    </div>
  );
}
