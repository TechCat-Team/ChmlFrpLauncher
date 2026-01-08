import { useEffect, useState } from "react";
import { toast } from "sonner";
import { frpcDownloader } from "../../services/frpcDownloader";
import { autostartService } from "../../services/autostartService";
import { updateService } from "../../services/updateService";
import { Progress } from "../ui/progress";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "../ui/item";

type ThemeMode = "light" | "dark";

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme") as ThemeMode | null;
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
};

export function Settings() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [isDownloading, setIsDownloading] = useState(false);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(false);
  const [autoCheckUpdate, setAutoCheckUpdate] = useState(() =>
    updateService.getAutoCheckEnabled(),
  );
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>("");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const checkAutostart = async () => {
      try {
        const enabled = await autostartService.isEnabled();
        setAutostartEnabled(enabled);
      } catch (error) {
        console.error("检查开机自启状态失败:", error);
      }
    };
    checkAutostart();
  }, []);

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const version = await updateService.getCurrentVersion();
        setCurrentVersion(version);
      } catch (error) {
        console.error("获取版本失败:", error);
      }
    };
    loadVersion();
  }, []);

  const handleRedownloadFrpc = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    const toastId = toast.loading(
      <div className="space-y-2">
        <div className="text-sm font-medium">正在下载 frpc 客户端...</div>
        <Progress value={0} />
        <div className="text-xs text-muted-foreground">0.0%</div>
      </div>,
      { duration: Infinity },
    );

    try {
      await frpcDownloader.downloadFrpc((progress) => {
        toast.loading(
          <div className="space-y-2">
            <div className="text-sm font-medium">正在下载 frpc 客户端...</div>
            <Progress value={progress.percentage} />
            <div className="text-xs text-muted-foreground">
              {progress.percentage.toFixed(1)}% (
              {(progress.downloaded / 1024 / 1024).toFixed(2)} MB /{" "}
              {(progress.total / 1024 / 1024).toFixed(2)} MB)
            </div>
          </div>,
          { id: toastId, duration: Infinity },
        );
      });

      toast.success("frpc 客户端下载成功", {
        id: toastId,
        duration: 3000,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(
        <div className="space-y-2">
          <div className="text-sm font-medium">下载失败</div>
          <div className="text-xs text-muted-foreground">{errorMsg}</div>
        </div>,
        { id: toastId, duration: 8000 },
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleToggleAutostart = async (enabled: boolean) => {
    if (autostartLoading) return;

    setAutostartLoading(true);
    try {
      await autostartService.setEnabled(enabled);
      setAutostartEnabled(enabled);
      toast.success(enabled ? "已启用开机自启" : "已禁用开机自启", {
        duration: 2000,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`设置失败: ${errorMsg}`, {
        duration: 3000,
      });
    } finally {
      setAutostartLoading(false);
    }
  };

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;

    setCheckingUpdate(true);
    const toastId = toast.loading("正在检查更新...", { duration: Infinity });

    try {
      const result = await updateService.checkUpdate();

      if (result.available) {
        toast.success(
          <div className="space-y-2">
            <div className="text-sm font-medium">
              发现新版本: {result.version}
            </div>
            {result.body && (
              <div className="text-xs text-muted-foreground max-w-md whitespace-pre-wrap">
                {result.body}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              更新将在后台下载，完成后会提示您安装
            </div>
          </div>,
          { id: toastId, duration: 8000 },
        );

        try {
          await updateService.installUpdate();
          toast.success("更新已下载完成，应用将在重启后更新", {
            duration: 5000,
          });
        } catch (installError) {
          const errorMsg =
            installError instanceof Error
              ? installError.message
              : String(installError);
          toast.error(`下载更新失败: ${errorMsg}`, {
            duration: 5000,
          });
        }
      } else {
        toast.success("当前已是最新版本", {
          id: toastId,
          duration: 3000,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`检查更新失败: ${errorMsg}`, {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleToggleAutoCheckUpdate = (enabled: boolean) => {
    updateService.setAutoCheckEnabled(enabled);
    setAutoCheckUpdate(enabled);
    toast.success(
      enabled ? "已启用启动时自动检测更新" : "已禁用启动时自动检测更新",
      {
        duration: 2000,
      },
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-foreground">设置</h1>

      <Item
        variant="outline"
        className="border border-border/60 rounded-lg bg-card"
      >
        <ItemContent>
          <ItemTitle>主题</ItemTitle>
          <ItemDescription className="text-xs">
            选择界面配色方案
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme("light")}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                theme === "light"
                  ? "bg-foreground text-background"
                  : "border border-border/60 hover:bg-muted/40"
              }`}
            >
              浅色
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                theme === "dark"
                  ? "bg-foreground text-background"
                  : "border border-border/60 hover:bg-muted/40"
              }`}
            >
              深色
            </button>
          </div>
        </ItemActions>
      </Item>

      <Item
        variant="outline"
        className="border border-border/60 rounded-lg bg-card"
      >
        <ItemContent>
          <ItemTitle>开机自启</ItemTitle>
          <ItemDescription className="text-xs">
            系统启动时自动运行应用
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <button
            onClick={() => handleToggleAutostart(!autostartEnabled)}
            disabled={autostartLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              autostartEnabled ? "bg-foreground" : "bg-muted"
            } ${autostartLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            role="switch"
            aria-checked={autostartEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                autostartEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </ItemActions>
      </Item>

      <Item
        variant="outline"
        className="border border-border/60 rounded-lg bg-card"
      >
        <ItemContent>
          <ItemTitle>应用更新</ItemTitle>
          <ItemDescription className="text-xs">
            检查并安装应用更新
            {currentVersion && (
              <span className="ml-1">当前版本: v{currentVersion}</span>
            )}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              checkingUpdate
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {checkingUpdate ? "检查中..." : "检测更新"}
          </button>
        </ItemActions>
      </Item>

      <Item
        variant="outline"
        className="border border-border/60 rounded-lg bg-card"
      >
        <ItemContent>
          <ItemTitle>启动时自动检测更新</ItemTitle>
          <ItemDescription className="text-xs">
            应用启动时自动检查是否有可用更新
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <button
            onClick={() => handleToggleAutoCheckUpdate(!autoCheckUpdate)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              autoCheckUpdate ? "bg-foreground" : "bg-muted"
            } cursor-pointer`}
            role="switch"
            aria-checked={autoCheckUpdate}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                autoCheckUpdate ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </ItemActions>
      </Item>

      <Item
        variant="outline"
        className="border border-border/60 rounded-lg bg-card"
      >
        <ItemContent>
          <ItemTitle>frpc 客户端</ItemTitle>
          <ItemDescription className="text-xs">
            重新下载 frpc 客户端程序
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <button
            onClick={handleRedownloadFrpc}
            disabled={isDownloading}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              isDownloading
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {isDownloading ? "下载中..." : "重新下载"}
          </button>
        </ItemActions>
      </Item>
    </div>
  );
}
