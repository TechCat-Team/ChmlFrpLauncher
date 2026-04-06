import { useState } from "react";

export interface ProxyConfig {
  enabled: boolean;
  type: "http" | "socks5";
  host: string;
  port: string;
  username: string;
  password: string;
  forceTls: boolean;
  kcpOptimization: boolean;
}

const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  type: "socks5",
  host: "",
  port: "",
  username: "",
  password: "",
  forceTls: false,
  kcpOptimization: false,
};

export function useProxy() {
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_PROXY_CONFIG;
    const saved = localStorage.getItem("frpc_proxy_config");
    if (!saved) return DEFAULT_PROXY_CONFIG;
    try {
      const config = JSON.parse(saved) as ProxyConfig;
      return {
        ...DEFAULT_PROXY_CONFIG,
        ...config,
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
