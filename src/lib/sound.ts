export const playTunnelSound = (
  type: "success" | "error",
  enabled: boolean,
): void => {
  if (!enabled) return;

  try {
    const audio = new Audio(
      type === "success" ? "/run_tunnel.mp3" : "/stop_tunnel.mp3",
    );
    audio.volume = 0.3;
    audio.play().catch((err) => {
      console.error("播放音效失败:", err);
    });
  } catch (err) {
    console.error("创建音效失败:", err);
  }
};
