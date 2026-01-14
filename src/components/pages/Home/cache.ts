import type { UserInfo, FlowPoint, SignInInfo } from "@/services/api";

// 模块级别的缓存，确保在组件卸载后数据仍然保留
export const homePageCache = {
  userInfo: null as UserInfo | null,
  flowData: [] as FlowPoint[],
  signInInfo: null as SignInInfo | null,
};
