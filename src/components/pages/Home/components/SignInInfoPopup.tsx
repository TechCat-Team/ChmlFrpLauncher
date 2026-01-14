import type { SignInInfo } from "@/services/api";

interface SignInInfoPopupProps {
  visible: boolean;
  loading: boolean;
  error: string;
  signInInfo: SignInInfo | null;
  closing: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  signInInfoVisible: boolean;
  animatedTotalPoints: { displayValue: number; isAnimating: boolean };
  animatedTotalSignIns: { displayValue: number; isAnimating: boolean };
  animatedCountOfRecords: { displayValue: number; isAnimating: boolean };
}

export function SignInInfoPopup({
  visible,
  loading,
  error,
  signInInfo,
  closing,
  onMouseEnter,
  onMouseLeave,
  signInInfoVisible,
  animatedTotalPoints,
  animatedTotalSignIns,
  animatedCountOfRecords,
}: SignInInfoPopupProps) {
  if (!visible) return null;

  return (
    <div
      className={`absolute right-0 top-full mt-1 w-80 rounded-2xl bg-card/95 backdrop-blur-md border border-border/50 p-5 shadow-2xl z-[9999] ${
        closing
          ? "animate-fade-out"
          : "animate-slide-in-from-top-2 animate-scale-in"
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {loading ? (
        <div className="flex items-center justify-center py-8 animate-fade-in-up">
          <div className="h-6 w-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
          <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 animate-fade-in-up">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      ) : signInInfo ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-1">
              <p className="text-xs text-muted-foreground mb-1">
                今日是否已签到
              </p>
              <p
                className={`text-base font-semibold transition-colors ${signInInfo.is_signed_in_today ? "text-green-600 dark:text-green-500" : "text-orange-600 dark:text-orange-500"}`}
              >
                {signInInfo.is_signed_in_today ? "已签到" : "未签到"}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-2">
              <p className="text-xs text-muted-foreground mb-1">总签到积分</p>
              <p className="text-base font-semibold text-foreground animate-number-count">
                {signInInfoVisible && animatedTotalPoints.isAnimating
                  ? animatedTotalPoints.displayValue.toLocaleString()
                  : signInInfo.total_points.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-3">
              <p className="text-xs text-muted-foreground mb-1">
                用户总签到次数
              </p>
              <p className="text-base font-semibold text-foreground animate-number-count">
                {signInInfoVisible && animatedTotalSignIns.isAnimating
                  ? animatedTotalSignIns.displayValue
                  : signInInfo.total_sign_ins}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-4">
              <p className="text-xs text-muted-foreground mb-1">今日签到人数</p>
              <p className="text-base font-semibold text-foreground animate-number-count">
                {signInInfoVisible && animatedCountOfRecords.isAnimating
                  ? animatedCountOfRecords.displayValue
                  : signInInfo.count_of_matching_records}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-5">
            <p className="text-xs text-muted-foreground mb-1">上次签到时间</p>
            <p className="text-sm font-medium text-foreground">
              {signInInfo.last_sign_in_time || "暂无记录"}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-muted-foreground animate-fade-in-up">
          暂无数据
        </div>
      )}
    </div>
  );
}
