import { useState } from "react";

export interface ProxyConfig {
  enabled: boolean;
  type: "http" | "socks5";
  host: string;
  port: string;
  username: string;
  password: string;
  forceTls: boolean;
}

const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  type: "socks5",
  host: "",
  port: "",
  username: "",
  password: "",
  forceTls: false,
};

// 已移除的 KCP 连接优化曾使用的节点 UDP 支持缓存
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("node_udp_cache");
  } catch {
    // 忽略存储不可用的情况
  }
}

export function useProxy() {
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_PROXY_CONFIG;
    const saved = localStorage.getItem("frpc_proxy_config");
    if (!saved) return DEFAULT_PROXY_CONFIG;
    try {
      // 丢弃已移除的旧字段（如 kcpOptimization），避免继续写回本地存储
      const config = JSON.parse(saved) as Record<string, unknown>;
      delete config.kcpOptimization;
      return {
        ...DEFAULT_PROXY_CONFIG,
        ...(config as Partial<ProxyConfig>),
      };
    } catch {
      return DEFAULT_PROXY_CONFIG;
    }
  });

  const saveProxyConfig = (config: ProxyConfig) => {
    setProxyConfig(config);
    localStorage.setItem("frpc_proxy_config", JSON.stringify(config));
  };

  const updateProxyConfig = (updates: Partial<ProxyConfig>) => {
    const newConfig = { ...proxyConfig, ...updates };
    saveProxyConfig(newConfig);
  };

  return {
    proxyConfig,
    updateProxyConfig,
  };
}
