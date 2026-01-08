const API_BASE_URL = "https://cf-v2.uapis.cn"

export interface StoredUser {
  username: string
  usergroup: string
  userimg?: string | null
  usertoken?: string
  tunnelCount?: number
  tunnel?: number
}

export interface UserInfo {
  id: number
  username: string
  password: string | null
  userimg: string
  qq: string
  email: string
  usertoken: string
  usergroup: string
  bandwidth: number
  tunnel: number
  realname: string
  integral: number
  term: string
  scgm: string
  regtime: string
  realname_count: number | null
  total_download: number | null
  total_upload: number | null
  tunnelCount: number
  totalCurConns: number
}

export interface Tunnel {
  id: number
  name: string
  localip: string
  type: string
  nport: number
  dorp: string
  node: string
  ap: string
  uptime: string | null
  client_version: string | null
  today_traffic_in: number | null
  today_traffic_out: number | null
  cur_conns: number | null
  nodestate: string
  ip: string
}

export interface FlowPoint {
  traffic_in: number
  traffic_out: number
  time: string
}

export interface SignInInfo {
  is_signed_in_today: boolean
  total_points: number
  count_of_matching_records: number
  total_sign_ins: number
  last_sign_in_time: string
}

interface ApiResponse<T> {
  code: number
  msg?: string
  data?: T
}

const isBrowser = typeof window !== "undefined"

// 简单的请求去重（针对短时间内重复发起相同请求的场景）
const pendingRequests = new Map<string, Promise<any>>();

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

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headersObj = normalizeHeaders(options?.headers);
  const key = JSON.stringify({ endpoint, method: options?.method ?? "GET", body: options?.body ?? null, headers: headersObj });

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = (async () => {
    try {
      const url = endpoint.startsWith("/") ? `${API_BASE_URL}${endpoint}` : `${API_BASE_URL}/${endpoint}`;
      const res = await fetch(url, options);
      const data = (await res.json()) as ApiResponse<T>;
      if (data?.code === 200) {
        return data.data as T;
      }
      throw new Error(data?.msg || "请求失败");
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, promise);
  return promise;
}

export const getStoredUser = (): StoredUser | null => {
  if (!isBrowser) return null
  const saved = localStorage.getItem("chmlfrp_user")
  if (!saved) return null
  try {
    return JSON.parse(saved) as StoredUser
  } catch {
    return null
  }
}

export const saveStoredUser = (user: StoredUser) => {
  if (!isBrowser) return
  localStorage.setItem("chmlfrp_user", JSON.stringify(user))
}

export const clearStoredUser = () => {
  if (!isBrowser) return
  localStorage.removeItem("chmlfrp_user")
}

export async function login(username: string, password: string): Promise<StoredUser> {
  const data = await request<StoredUser>("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })

  return {
    username: data?.username ?? username,
    usergroup: data?.usergroup ?? "",
    userimg: data?.userimg ?? "",
    usertoken: data?.usertoken ?? "",
    tunnelCount: data?.tunnelCount ?? 0,
    tunnel: data?.tunnel ?? 0,
  }
}

export async function fetchTunnels(token?: string): Promise<Tunnel[]> {
  const storedUser = getStoredUser()
  const bearer = token ?? storedUser?.usertoken

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录")
  }

  const data = await request<Tunnel[]>("/tunnel", {
    headers: { authorization: `Bearer ${bearer}` },
  })

  if (Array.isArray(data)) return data
  throw new Error("获取隧道列表失败")
}

export async function fetchFlowLast7Days(token?: string): Promise<FlowPoint[]> {
  const storedUser = getStoredUser()
  const bearer = token ?? storedUser?.usertoken

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录")
  }

  const data = await request<FlowPoint[]>("/flow_last_7_days", {
    headers: { authorization: `Bearer ${bearer}` },
  })

  if (Array.isArray(data)) return data
  throw new Error("获取近7日流量失败")
}

export async function fetchUserInfo(token?: string): Promise<UserInfo> {
  const storedUser = getStoredUser()
  const bearer = token ?? storedUser?.usertoken

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录")
  }

  try {
    const data = await request<UserInfo>("/userinfo", {
      headers: { authorization: bearer },
    })

    if (data) return data as UserInfo
    throw new Error("获取用户信息失败")
  } catch (err) {
    clearStoredUser()
    throw err
  }
}

export async function fetchSignInInfo(token?: string): Promise<SignInInfo> {
  const storedUser = getStoredUser()
  const bearer = token ?? storedUser?.usertoken

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录")
  }

  const data = await request<SignInInfo>("/qiandao_info", {
    headers: { authorization: bearer },
  })

  if (data) return data
  throw new Error("获取签到信息失败")
}


