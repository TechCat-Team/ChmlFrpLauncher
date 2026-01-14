const API_BASE_URL = "https://cf-v2.uapis.cn";

export interface StoredUser {
  username: string;
  usergroup: string;
  userimg?: string | null;
  usertoken?: string;
  tunnelCount?: number;
  tunnel?: number;
}

export interface UserInfo {
  id: number;
  username: string;
  password: string | null;
  userimg: string;
  qq: string;
  email: string;
  usertoken: string;
  usergroup: string;
  bandwidth: number;
  tunnel: number;
  realname: string;
  integral: number;
  term: string;
  scgm: string;
  regtime: string;
  realname_count: number | null;
  total_download: number | null;
  total_upload: number | null;
  tunnelCount: number;
  totalCurConns: number;
}

export interface Tunnel {
  id: number;
  name: string;
  localip: string;
  type: string;
  nport: number;
  dorp: string;
  node: string;
  ap: string;
  uptime: string | null;
  client_version: string | null;
  today_traffic_in: number | null;
  today_traffic_out: number | null;
  cur_conns: number | null;
  nodestate: string;
  ip: string;
}

export interface FlowPoint {
  traffic_in: number;
  traffic_out: number;
  time: string;
}

export interface SignInInfo {
  is_signed_in_today: boolean;
  total_points: number;
  count_of_matching_records: number;
  total_sign_ins: number;
  last_sign_in_time: string;
}

interface ApiResponse<T> {
  code: number;
  msg?: string;
  data?: T;
}

const isBrowser = typeof window !== "undefined";

// 简单的请求去重（针对短时间内重复发起相同请求的场景）
const pendingRequests = new Map<string, Promise<unknown>>();

function normalizeHeaders(h?: HeadersInit): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const obj: Record<string, string> = {};
    h.forEach((v, k) => (obj[k] = v));
    return obj;
  }
  if (Array.isArray(h)) {
    const obj: Record<string, string> = {};
    h.forEach(([k, v]) => (obj[k] = v));
    return obj;
  }
  return h as Record<string, string>;
}

function getBypassProxy(): boolean {
  if (!isBrowser) return true;
  const stored = localStorage.getItem("bypassProxy");
  return stored !== "false";
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headersObj = normalizeHeaders(options?.headers);
  const key = JSON.stringify({
    endpoint,
    method: options?.method ?? "GET",
    body: options?.body ?? null,
    headers: headersObj,
  });

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = (async () => {
    try {
      const url = endpoint.startsWith("/")
        ? `${API_BASE_URL}${endpoint}`
        : `${API_BASE_URL}/${endpoint}`;

      const bypassProxy = getBypassProxy();

      // 在 Tauri 环境中，如果启用绕过代理，使用 Tauri 命令
      if (
        typeof window !== "undefined" &&
        "__TAURI__" in window &&
        bypassProxy
      ) {
        const { invoke } = await import("@tauri-apps/api/core");
        const method = (options?.method ?? "GET").toUpperCase();
        const headers: Record<string, string> = {};

        if (headersObj) {
          Object.entries(headersObj).forEach(([k, v]) => {
            headers[k] = v;
          });
        }

        const body = options?.body ? String(options.body) : undefined;

        const responseText = await invoke<string>("http_request", {
          options: {
            url,
            method,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            body,
            bypass_proxy: true,
          },
        });

        const data = JSON.parse(responseText) as ApiResponse<T>;
        if (data?.code === 200) {
          return data.data as T;
        }
        throw new Error(data?.msg || "请求失败");
      } else {
        // 使用普通的 fetch
        const res = await fetch(url, options);
        const data = (await res.json()) as ApiResponse<T>;
        if (data?.code === 200) {
          return data.data as T;
        }
        throw new Error(data?.msg || "请求失败");
      }
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, promise);
  return promise;
}

export const getStoredUser = (): StoredUser | null => {
  if (!isBrowser) return null;
  const saved = localStorage.getItem("chmlfrp_user");
  if (!saved) return null;
  try {
    return JSON.parse(saved) as StoredUser;
  } catch {
    return null;
  }
};

export const saveStoredUser = (user: StoredUser) => {
  if (!isBrowser) return;
  localStorage.setItem("chmlfrp_user", JSON.stringify(user));
};

export const clearStoredUser = () => {
  if (!isBrowser) return;
  localStorage.removeItem("chmlfrp_user");
};

export async function login(
  username: string,
  password: string,
): Promise<StoredUser> {
  const data = await request<StoredUser>("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  return {
    username: data?.username ?? username,
    usergroup: data?.usergroup ?? "",
    userimg: data?.userimg ?? "",
    usertoken: data?.usertoken ?? "",
    tunnelCount: data?.tunnelCount ?? 0,
    tunnel: data?.tunnel ?? 0,
  };
}

export async function fetchTunnels(token?: string): Promise<Tunnel[]> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  const data = await request<Tunnel[]>("/tunnel", {
    headers: { authorization: `Bearer ${bearer}` },
  });

  if (Array.isArray(data)) return data;
  throw new Error("获取隧道列表失败");
}

export async function fetchFlowLast7Days(token?: string): Promise<FlowPoint[]> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  const data = await request<FlowPoint[]>("/flow_last_7_days", {
    headers: { authorization: `Bearer ${bearer}` },
  });

  if (Array.isArray(data)) return data;
  throw new Error("获取近7日流量失败");
}

export async function fetchUserInfo(token?: string): Promise<UserInfo> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  try {
    const data = await request<UserInfo>("/userinfo", {
      headers: { authorization: bearer },
    });

    if (data) return data as UserInfo;
    throw new Error("获取用户信息失败");
  } catch (err) {
    clearStoredUser();
    throw err;
  }
}

export async function fetchSignInInfo(token?: string): Promise<SignInInfo> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  const data = await request<SignInInfo>("/qiandao_info", {
    headers: { authorization: bearer },
  });

  if (data) return data;
  throw new Error("获取签到信息失败");
}

interface OfflineTunnelResponse {
  code: number;
  state: string;
  msg?: string;
}

export async function offlineTunnel(
  tunnelName: string,
  token?: string,
): Promise<void> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  const formData = new URLSearchParams();
  formData.append("tunnel_name", tunnelName);

  const endpoint = "/offline_tunnel";
  const headersObj = {
    "Content-Type": "application/x-www-form-urlencoded",
    authorization: bearer,
  };

  const bypassProxy = getBypassProxy();

  // 在 Tauri 环境中，如果启用绕过代理，使用 Tauri 命令
  if (typeof window !== "undefined" && "__TAURI__" in window && bypassProxy) {
    const { invoke } = await import("@tauri-apps/api/core");
    const url = endpoint.startsWith("/")
      ? `${API_BASE_URL}${endpoint}`
      : `${API_BASE_URL}/${endpoint}`;

    const responseText = await invoke<string>("http_request", {
      options: {
        url,
        method: "POST",
        headers: headersObj,
        body: formData.toString(),
        bypass_proxy: true,
      },
    });

    const data = JSON.parse(responseText) as OfflineTunnelResponse;
    if (data?.code === 200 && data?.state === "success") {
      return;
    }
    throw new Error(data?.msg || "下线隧道失败");
  } else {
    // 使用普通的 fetch
    const url = endpoint.startsWith("/")
      ? `${API_BASE_URL}${endpoint}`
      : `${API_BASE_URL}/${endpoint}`;

    const res = await fetch(url, {
      method: "POST",
      headers: headersObj,
      body: formData.toString(),
    });

    if (!res.ok) {
      throw new Error(`HTTP错误: ${res.status}`);
    }

    const data = (await res.json()) as OfflineTunnelResponse;
    if (data?.code === 200 && data?.state === "success") {
      return;
    }
    throw new Error(data?.msg || "下线隧道失败");
  }
}

export async function deleteTunnel(
  tunnelId: number,
  token?: string,
): Promise<void> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  await request<unknown>(`/delete_tunnel?tunnelid=${tunnelId}`, {
    headers: { authorization: bearer },
  });
}

export interface Node {
  id: number;
  name: string;
  area: string;
  nodegroup: string;
  china: string;
  web: string;
  udp: string;
  fangyu: string;
  notes: string;
}

export interface NodeInfo {
  id: number;
  name: string;
  area: string;
  nodegroup: string;
  china: string;
  web: string;
  udp: string;
  fangyu: string;
  notes: string;
  ip: string;
  port: number;
  adminPort: number;
  rport: string;
  state: string;
  auth: string;
  apitoken: string;
  nodetoken: string;
  real_IP: string;
  realIp: string;
  ipv6: string | null;
  coordinates: string;
  version: string;
  load1: number;
  load5: number;
  load15: number;
  bandwidth_usage_percent: number;
  totalTrafficIn: number;
  totalTrafficOut: number;
  uptime_seconds: number | null;
  cpu_info: string | null;
  num_cores: number | null;
  memory_total: number | null;
  storage_total: number | null;
  storage_used: number | null;
  toowhite: boolean;
}

export interface CreateTunnelParams {
  tunnelname: string;
  node: string;
  localip: string;
  porttype: string;
  localport: number;
  encryption: boolean;
  compression: boolean;
  extraparams: string;
  remoteport?: number;
  banddomain?: string;
}

export async function fetchNodes(token?: string): Promise<Node[]> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  const data = await request<Node[]>("/node", {
    headers: { authorization: `Bearer ${bearer}` },
  });

  if (Array.isArray(data)) return data;
  throw new Error("获取节点列表失败");
}

export async function fetchNodeInfo(
  nodeName: string,
  token?: string,
): Promise<NodeInfo> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  const data = await request<NodeInfo>(
    `/nodeinfo?node=${encodeURIComponent(nodeName)}`,
    {
      headers: { authorization: `Bearer ${bearer}` },
    },
  );

  if (data) return data;
  throw new Error("获取节点信息失败");
}

export async function createTunnel(
  params: CreateTunnelParams,
  token?: string,
): Promise<void> {
  const storedUser = getStoredUser();
  const bearer = token ?? storedUser?.usertoken;

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录");
  }

  await request<unknown>("/create_tunnel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: bearer,
    },
    body: JSON.stringify(params),
  });
}
