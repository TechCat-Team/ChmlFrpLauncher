import type { UserInfo } from "@/services/api";
import { SignInInfoPopup } from "./SignInInfoPopup";
import type { SignInInfo } from "@/services/api";
import { CalendarCheck } from "lucide-react";

interface WelcomeHeaderProps {
  userInfo: UserInfo | null;
  signInInfo: SignInInfo | null;
  signInInfoHover: boolean;
  signInInfoLoading: boolean;
  signInInfoError: string;
  signInInfoVisible: boolean;
  signInInfoClosing: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  animatedTotalPoints: { displayValue: number; isAnimating: boolean };
  animatedTotalSignIns: { displayValue: number; isAnimating: boolean };
  animatedCountOfRecords: { displayValue: number; isAnimating: boolean };
}

export function WelcomeHeader({
  userInfo,
  signInInfo,
  signInInfoHover,
  signInInfoLoading,
  signInInfoError,
  signInInfoVisible,
  signInInfoClosing,
  onMouseEnter,
  onMouseLeave,
  animatedTotalPoints,
  animatedTotalSignIns,
  animatedCountOfRecords,
}: WelcomeHeaderProps) {
  return (
    <div className="rounded-lg p-6 bg-card relative z-10">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            ChmlFrp Launcher
          </p>
          <h1 className="text-2xl font-medium text-foreground tracking-tight">
            欢迎回来{userInfo?.username ? `，${userInfo.username}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 relative z-[9999]">
          <div
            className="relative z-[9999]"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <button
              className="group flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md border border-border/60 text-foreground hover:bg-foreground/[0.03] hover:border-foreground/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!userInfo}
            >
              <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              签到信息
            </button>

            <SignInInfoPopup
              visible={signInInfoHover && !!userInfo}
              loading={signInInfoLoading}
              error={signInInfoError}
              signInInfo={signInInfo}
              closing={signInInfoClosing}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              signInInfoVisible={signInInfoVisible}
              animatedTotalPoints={animatedTotalPoints}
              animatedTotalSignIns={animatedTotalSignIns}
              animatedCountOfRecords={animatedCountOfRecords}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
