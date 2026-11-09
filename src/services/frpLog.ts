export function isFrpProxyReady(message: string): boolean {
  return message.endsWith(" start proxy success") || message.includes("映射启动成功");
}

export function isFrpLoggedIn(message: string): boolean {
  return message.includes("login to server success") || message.includes("成功登录至服务器");
}

export function isFrpStartError(message: string): boolean {
  return message.includes("] start error:") || message.includes("启动失败");
}

export function isFrpStarting(message: string): boolean {
  return (
    message.includes("[ChmlFrpLauncher] frpc 进程已启动") ||
    message.includes("[ChmlFrpLauncher] 隧道已启动，正在连接")
  );
}

export function classifyFrpLoginError(
  message: string,
): "tls-retry" | "other" | undefined {
  if (/请尝试将配置文件中\s*tls_enable.*改为\s*tls_enable\s*=\s*true/i.test(message)) {
    return "tls-retry";
  }

  // The final login error arrives on stderr on desktop. Android emits an
  // equivalent launcher log after the FRP service fails.
  const error =
    message.match(/login to (?:the )?server failed:\s*(.+)/i)?.[1] ??
    message.match(
      /\[E\] \[ChmlFrpLauncher\] (?:连接已中断|连接节点超时|TLS 握手失败|无法解析节点域名|节点拒绝连接|节点认证失败)[^：]*：(.+)/,
    )?.[1];
  if (!error) return;

  if (
    /\b(?:EOF|i\/o timeout|i\/o deadline reached|deadline exceeded|session shutdown|connection reset by peer|forcibly closed by the remote host|broken pipe|non-TLS connection received|TLS is required|server requires TLS)\b|\bTLS\b.*\bhandshake\b|远程主机(?:强迫|强制)关闭/i.test(error)
  ) {
    return "tls-retry";
  }
  return "other";
}
