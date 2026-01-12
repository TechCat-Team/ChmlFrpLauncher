import { useState, useEffect } from "react";
import { useTheme } from "./hooks/useTheme";
import { useBackgroundImage } from "./hooks/useBackgroundImage";
import { useAutostart } from "./hooks/useAutostart";
import { useUpdate } from "./hooks/useUpdate";
import { useFrpcDownload } from "./hooks/useFrpcDownload";
import { getInitialBypassProxy, getInitialShowTitleBar } from "./utils";
import { AppearanceSection } from "./components/AppearanceSection";
import { NetworkSection } from "./components/NetworkSection";
import { SystemSection } from "./components/SystemSection";
import { UpdateSection } from "./components/UpdateSection";

export function Settings() {
  const isMacOS =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  const {
    followSystem,
    setFollowSystem,
    theme,
    setTheme,
  } = useTheme();

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

  const {
    autostartEnabled,
    autostartLoading,
    handleToggleAutostart,
  } = useAutostart();

  const {
    autoCheckUpdate,
    checkingUpdate,
    currentVersion,
    handleCheckUpdate,
    handleToggleAutoCheckUpdate,
  } = useUpdate();

  const { isDownloading, handleRedownloadFrpc } = useFrpcDownload();

  const [bypassProxy, setBypassProxy] = useState<boolean>(() =>
    getInitialBypassProxy(),
  );
  const [showTitleBar, setShowTitleBar] = useState<boolean>(() =>
    getInitialShowTitleBar(),
  );

  useEffect(() => {
    localStorage.setItem("bypassProxy", bypassProxy.toString());
  }, [bypassProxy]);

  useEffect(() => {
    localStorage.setItem("showTitleBar", showTitleBar.toString());
    window.dispatchEvent(new Event("titleBarVisibilityChanged"));
  }, [showTitleBar]);

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
          showTitleBar={showTitleBar}
          setShowTitleBar={setShowTitleBar}
          backgroundImage={backgroundImage}
          isSelectingImage={isSelectingImage}
          overlayOpacity={overlayOpacity}
          setOverlayOpacity={setOverlayOpacity}
          blur={blur}
          setBlur={setBlur}
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
        />

        <UpdateSection
          checkingUpdate={checkingUpdate}
          currentVersion={currentVersion}
          onCheckUpdate={handleCheckUpdate}
          isDownloading={isDownloading}
          onRedownloadFrpc={handleRedownloadFrpc}
        />
      </div>
    </div>
  );
}

