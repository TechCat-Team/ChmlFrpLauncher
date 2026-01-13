import type { UserInfo } from "@/services/api";
import { SignInInfoPopup } from "./SignInInfoPopup";
import type { SignInInfo } from "@/services/api";

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
    <div className="border border-border/60 rounded-lg p-6 bg-card">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">ChmlFrp Launcher</p>
          <h1 className="text-2xl font-semibold text-foreground mt-1">
            欢迎回来{userInfo?.username ? `，${userInfo.username}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 relative">
          <div
            className="relative"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <button
              className="px-3 py-2 text-xs rounded border border-border/60 text-foreground hover:bg-foreground/[0.03] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!userInfo}
            >
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

