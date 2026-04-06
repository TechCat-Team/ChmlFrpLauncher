import { useUserInfo } from "./hooks/useUserInfo";
import { useFlowData } from "./hooks/useFlowData";
import { useSignInInfo } from "./hooks/useSignInInfo";
import { useAnimatedNumber } from "./hooks/useAnimatedNumber";
import { WelcomeHeader } from "./components/WelcomeHeader";
import { UserInfoCard } from "./components/UserInfoCard";
import { FlowDataCard } from "./components/FlowDataCard";
import { FAQSection } from "./components/FAQSection";
import { FeedbackCard } from "./components/FeedbackCard";
import { CommunityGroups } from "./components/CommunityGroups";
import type { HomeProps } from "./types";

export function Home({ user, onUserChange }: HomeProps) {
  const { userInfo } = useUserInfo(user, onUserChange);
  const { flowData, flowLoading, flowError } = useFlowData(userInfo);
  const {
    signInInfo,
    signInInfoHover,
    signInInfoLoading,
    signInInfoError,
    signInInfoVisible,
    signInInfoClosing,
    handleMouseEnter,
    handleMouseLeave,
  } = useSignInInfo(userInfo);

  // 数字计数动画 - 只在菜单可见时触发动画
  const animatedTotalPoints = useAnimatedNumber(
    signInInfo?.total_points || 0,
    800,
    signInInfoVisible && !!signInInfo,
  );
  const animatedTotalSignIns = useAnimatedNumber(
    signInInfo?.total_sign_ins || 0,
    600,
    signInInfoVisible && !!signInInfo,
  );
  const animatedCountOfRecords = useAnimatedNumber(
    signInInfo?.count_of_matching_records || 0,
    600,
    signInInfoVisible && !!signInInfo,
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      <WelcomeHeader
        userInfo={userInfo}
        signInInfo={signInInfo}
        signInInfoHover={signInInfoHover}
        signInInfoLoading={signInInfoLoading}
        signInInfoError={signInInfoError}
        signInInfoVisible={signInInfoVisible}
        signInInfoClosing={signInInfoClosing}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        animatedTotalPoints={animatedTotalPoints}
        animatedTotalSignIns={animatedTotalSignIns}
        animatedCountOfRecords={animatedCountOfRecords}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
        <UserInfoCard userInfo={userInfo} />
        <FAQSection />
        <FlowDataCard
          flowData={flowData}
          flowLoading={flowLoading}
          flowError={flowError}
        />
        <FeedbackCard />
      </div>

      <CommunityGroups />
    </div>
  );
}
