import { Network, Info } from "lucide-react";
import { useState } from "react";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProxyConfig } from "../hooks/useProxy";

interface NetworkSectionProps {
  bypassProxy: boolean;
  setBypassProxy: (value: boolean) => void;
  ipv6OnlyNetwork: boolean;
  setIpv6OnlyNetwork: (value: boolean) => void;
  proxyConfig: ProxyConfig;
  updateProxyConfig: (updates: Partial<ProxyConfig>) => void;
}

export function NetworkSection({
  bypassProxy,
  setBypassProxy,
  ipv6OnlyNetwork,
  setIpv6OnlyNetwork,
  proxyConfig,
  updateProxyConfig,
}: NetworkSectionProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Network className="w-4 h-4" />
        <span>网络</span>
      </div>
      <div className="rounded-lg bg-card overflow-hidden space-y-0">
        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>绕过代理</ItemTitle>
            <ItemDescription className="text-xs">
              网络请求绕过系统代理设置
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => setBypassProxy(!bypassProxy)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                bypassProxy ? "bg-foreground" : "bg-muted dark:bg-foreground/12"
              } cursor-pointer`}
              role="switch"
              aria-checked={bypassProxy}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                  bypassProxy ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        <ItemSeparator className="opacity-50" />

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>仅存在IPV6网络</ItemTitle>
            <ItemDescription className="text-xs">
              仅 IPV6 环境时启用，自动限制为支持 IPV6 的节点
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => setIpv6OnlyNetwork(!ipv6OnlyNetwork)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                ipv6OnlyNetwork
                  ? "bg-foreground"
                  : "bg-muted dark:bg-foreground/12"
              } cursor-pointer`}
              role="switch"
              aria-checked={ipv6OnlyNetwork}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                  ipv6OnlyNetwork ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        <ItemSeparator />

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>Frpc 代理</ItemTitle>
            <ItemDescription className="text-xs">
              让 frpc 通过代理连接 frps 服务器
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() =>
                updateProxyConfig({ enabled: !proxyConfig.enabled })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                proxyConfig.enabled
                  ? "bg-foreground"
                  : "bg-muted dark:bg-foreground/12"
              } cursor-pointer`}
              role="switch"
              aria-checked={proxyConfig.enabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                  proxyConfig.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        {proxyConfig.enabled && (
          <div className="px-4 pb-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="proxy-type" className="text-xs">
                代理类型
              </Label>
              <Select
                options={[
                  { value: "http", label: "HTTP" },
                  { value: "socks5", label: "SOCKS5" },
                ]}
                value={proxyConfig.type}
                onChange={(value: string | number) =>
                  updateProxyConfig({
                    type: String(value) as "http" | "socks5",
                  })
                }
                size="sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="proxy-host" className="text-xs">
                  主机地址
                </Label>
                <Input
                  id="proxy-host"
                  placeholder="127.0.0.1"
                  value={proxyConfig.host}
                  onChange={(e) => updateProxyConfig({ host: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proxy-port" className="text-xs">
                  端口
                </Label>
                <Input
                  id="proxy-port"
                  placeholder="7890"
                  value={proxyConfig.port}
                  onChange={(e) => updateProxyConfig({ port: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proxy-username" className="text-xs">
                用户名（可选）
              </Label>
              <Input
                id="proxy-username"
                placeholder="username"
                value={proxyConfig.username}
                onChange={(e) =>
                  updateProxyConfig({ username: e.target.value })
                }
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proxy-password" className="text-xs">
                密码（可选）
              </Label>
              <div className="relative">
                <Input
                  id="proxy-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="password"
                  value={proxyConfig.password}
                  onChange={(e) =>
                    updateProxyConfig({ password: e.target.value })
                  }
                  className="h-9 pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? "隐藏" : "显示"}
                </button>
              </div>
            </div>
          </div>
        )}

        <ItemSeparator />

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle className="flex items-center gap-1.5">
              强制 TLS
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-balance">
                  建议在频繁出现Frp连接被拦截的情况下开启
                </TooltipContent>
              </Tooltip>
            </ItemTitle>
            <ItemDescription className="text-xs">
              强制使用 TLS 加密与节点连接
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() =>
                updateProxyConfig({ forceTls: !proxyConfig.forceTls })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                proxyConfig.forceTls
                  ? "bg-foreground"
                  : "bg-muted dark:bg-foreground/12"
              } cursor-pointer`}
              role="switch"
              aria-checked={proxyConfig.forceTls}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                  proxyConfig.forceTls ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        <ItemSeparator />

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle className="flex items-center gap-1.5">
              连接优化
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-balance">
                  此功能通过浪费1.2~1.5倍带宽和系统占用的代价以降低延迟，仅建议游戏联机、因为网络问题出现严重丢包/卡顿的情况下开启。其余情况开启可能反而造成负面效果
                </TooltipContent>
              </Tooltip>
            </ItemTitle>
            <ItemDescription className="text-xs">
              使用 KCP 协议优化 TCP/UDP 隧道与节点的连接
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() =>
                updateProxyConfig({
                  kcpOptimization: !proxyConfig.kcpOptimization,
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                proxyConfig.kcpOptimization
                  ? "bg-foreground"
                  : "bg-muted dark:bg-foreground/12"
              } cursor-pointer`}
              role="switch"
              aria-checked={proxyConfig.kcpOptimization}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                  proxyConfig.kcpOptimization
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>
      </div>
    </div>
  );
}
