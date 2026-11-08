export function isFrpProxyReady(message: string): boolean {
  return message.endsWith(" start proxy success") || message.includes("映射启动成功");
}

export function isFrpLoggedIn(message: string): boolean {
  return message.includes("login to server success") || message.includes("成功登录至服务器");
}

export function isFrpStartError(message: string): boolean {
  return message.includes("] start error:") || message.includes("启动失败");
}
