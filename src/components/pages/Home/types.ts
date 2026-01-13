import type {
  UserInfo,
  FlowPoint,
  SignInInfo,
  StoredUser,
} from "@/services/api";

export interface HomeProps {
  user?: StoredUser | null;
  onUserChange?: (user: StoredUser | null) => void;
}

export type { UserInfo, FlowPoint, SignInInfo, StoredUser };

