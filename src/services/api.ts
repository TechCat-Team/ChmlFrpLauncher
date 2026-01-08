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

interface ApiResponse<T> {
  code: number
  msg?: string
  data?: T
}

const isBrowser = typeof window !== "undefined"

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
  const res = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })

  const data = (await res.json()) as ApiResponse<StoredUser>

  if (data?.code === 200) {
    return {
      username: data.data?.username ?? username,
      usergroup: data.data?.usergroup ?? "",
      userimg: data.data?.userimg ?? "",
      usertoken: data.data?.usertoken ?? "",
      tunnelCount: data.data?.tunnelCount ?? 0,
      tunnel: data.data?.tunnel ?? 0,
    }
  }

  throw new Error(data?.msg || "登录失败")
}

export async function fetchTunnels(token?: string): Promise<Tunnel[]> {
  const storedUser = getStoredUser()
  const bearer = token ?? storedUser?.usertoken

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录")
  }

  const res = await fetch(`${API_BASE_URL}/tunnel`, {
    headers: { authorization: `Bearer ${bearer}` },
  })

  const data = (await res.json()) as ApiResponse<Tunnel[]>

  if (data?.code === 200 && Array.isArray(data.data)) {
    return data.data
  }

  throw new Error(data?.msg || "获取隧道列表失败")
}

export async function fetchFlowLast7Days(token?: string): Promise<FlowPoint[]> {
  const storedUser = getStoredUser()
  const bearer = token ?? storedUser?.usertoken

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录")
  }

  const res = await fetch(`${API_BASE_URL}/flow_last_7_days`, {
    headers: { authorization: `Bearer ${bearer}` },
  })

  const data = (await res.json()) as ApiResponse<FlowPoint[]>

  if (data?.code === 200 && Array.isArray(data.data)) {
    return data.data
  }

  throw new Error(data?.msg || "获取近7日流量失败")
}

export async function fetchUserInfo(token?: string): Promise<UserInfo> {
  const storedUser = getStoredUser()
  const bearer = token ?? storedUser?.usertoken

  if (!bearer) {
    throw new Error("登录信息已过期，请重新登录")
  }

  const res = await fetch(`${API_BASE_URL}/userinfo`, {
    headers: { authorization: bearer },
  })

  const data = (await res.json()) as ApiResponse<UserInfo>

  if (data?.code === 200 && data.data) {
    return data.data
  }

  // 如果 token 无效，清除本地信息
  if (data?.code !== 200) {
    clearStoredUser()
    throw new Error(data?.msg || "获取用户信息失败，请重新登录")
  }

  throw new Error(data?.msg || "获取用户信息失败")
}


