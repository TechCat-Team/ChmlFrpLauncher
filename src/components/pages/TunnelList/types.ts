export interface TunnelProgress {
  progress: number; // 0-100
  isError: boolean; // 是否错误状态（红色）
  isSuccess: boolean; // 是否成功状态（绿色）
  startTime?: number; // 启动时间戳
}

