const API_BASE_URL = "https://cf-v2.uapis.cn";
const ACCOUNT_OAUTH_ISSUER = "https://account-api.qzhua.net";
const ACCOUNT_OAUTH_CLIENT_ID = "019d4334b34972ca9fd41513e5703dfd";
const ACCOUNT_OAUTH_CLIENT_SECRET = "";

export interface StoredUser {
  username: string;
  usergroup: string;
  userimg?: string | null;
  usertoken?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  tokenType?: string;
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
  node_ip: string;
  node_ipv6: string | null;
  server_port: number;
  node_token: string;
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

export interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
}

export interface DeviceTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

interface ApiResponse<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface RawHttpResponse {
  status: number;
  body: string;
}

const isBrowser = typeof window !== "undefined";
const NODE_UDP_CACHE_KEY = "node_udp_cache";
const NODE_UDP_CACHE_TTL = 5 * 60 * 1000;
const DEVICE_CODE_DEFAULT_SCOPE = "profile email offline_access chmlfrp_api";

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

function getRequestUrl(endpoint: string): string {
  return endpoint.startsWith("/")
    ? `${API_BASE_URL}${endpoint}`
    : `${API_BASE_URL}/${endpoint}`;
}

function getOAuthUrl(path: string): string {
  return new URL(path, ACCOUNT_OAUTH_ISSUER).toString();
}

function getOAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (ACCOUNT_OAUTH_CLIENT_SECRET.trim()) {
    headers.Authorization = `Basic ${btoa(
      `${ACCOUNT_OAUTH_CLIENT_ID}:${ACCOUNT_OAUTH_CLIENT_SECRET}`,
    )}`;
  }

  return headers;
}

function getOAuthErrorMessage(
  response: DeviceTokenResponse | undefined,
  fallback: string,
): string {
  if (!response) {
    return fallback;
  }

  return response.error_description || response.error || fallback;
}

function normalizeStoredUser(user: StoredUser | null): StoredUser | null {
  if (!user) {
    return null;
  }
  const normalized: StoredUser = { ...user };
  if (normalized.accessTokenExpiresAt != null) {
    const expiresAt = Number(normalized.accessTokenExpiresAt);
    normalized.accessTokenExpiresAt = Number.isFinite(expiresAt)
      ? expiresAt
      : undefined;
  }
  return normalized;
}

function getLegacyApiToken(user: StoredUser | null): string | undefined {
  if (!user?.usertoken) {
    return undefined;
  }
  if (user.accessToken && user.usertoken === user.accessToken) {
    return undefined;
  }
  return user.usertoken;
}

function getCurrentAccessToken(user: StoredUser | null): string | undefined {
  if (user?.accessToken?.trim()) {
    return user.accessToken.trim();
  }
  return undefined;
}

function isAccessTokenExpiring(user: StoredUser | null): boolean {
  const expiresAt = user?.accessTokenExpiresAt;
  if (!expiresAt) {
    return false;
  }
  return Date.now() >= expiresAt - 60_000;
}

function toBearerHeader(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

async function refreshAccessToken(refreshToken: string): Promise<DeviceTokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  if (!ACCOUNT_OAUTH_CLIENT_SECRET.trim()) {
    body.set("client_id", ACCOUNT_OAUTH_CLIENT_ID);
  }

  const response = await oauthRequest({
    path: "/oauth2/token",
    body,
  });

  return parseOAuthJson<DeviceTokenResponse>(
    response,
    "账户服务返回了无法解析的刷新响应",
  );
}

async function ensureAuthenticatedUser(
  explicitToken?: string,
): Promise<{
  storedUser: StoredUser | null;
  accessToken?: string;
  legacyToken?: string;
}> {
  if (explicitToken?.trim()) {
    return {
      storedUser: getStoredUser(),
      accessToken: explicitToken.trim(),
    };
  }

  const storedUser = getStoredUser();
  if (!storedUser) {
    throw new Error("登录信息已过期，请重新登录");
  }

  const currentAccessToken = getCurrentAccessToken(storedUser);
  if (currentAccessToken) {
    if (storedUser.refreshToken && isAccessTokenExpiring(storedUser)) {
      const refreshed = await refreshAccessToken(storedUser.refreshToken);
      if (!refreshed.access_token) {
        clearStoredUser();
        throw new Error(
          getOAuthErrorMessage(refreshed, "登录信息已过期，请重新登录"),
        );
      }
      const updatedUser: StoredUser = {
        ...storedUser,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || storedUser.refreshToken,
        accessTokenExpiresAt: refreshed.expires_in
          ? Date.now() + refreshed.expires_in * 1000
          : storedUser.accessTokenExpiresAt,
        tokenType: refreshed.token_type || storedUser.tokenType || "Bearer",
      };
      saveStoredUser(updatedUser);
      return {
        storedUser: updatedUser,
        accessToken: updatedUser.accessToken,
        legacyToken: getLegacyApiToken(updatedUser),
      };
    }

    return {
      storedUser,
      accessToken: currentAccessToken,
      legacyToken: getLegacyApiToken(storedUser),
    };
  }

  const legacyToken = getLegacyApiToken(storedUser);
  if (legacyToken) {
    return {
      storedUser,
      legacyToken,
    };
  }

  clearStoredUser();
  throw new Error("登录信息已过期，请重新登录");
}

async function oauthRequest(options: {
  path: string;
  body: URLSearchParams;
}): Promise<RawHttpResponse> {
  const response = await fetch(getOAuthUrl(options.path), {
    method: "POST",
    headers: getOAuthHeaders(),
    body: options.body.toString(),
    cache: "no-store",
    credentials: "omit",
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

function parseOAuthJson<T>(response: RawHttpResponse, fallback: string): T {
  try {
    return JSON.parse(response.body) as T;
  } catch {
    const content = response.body.trim().toLowerCase();
    if (content.startsWith("<!doctype html") || content.startsWith("<html")) {
      throw new Error(
        "账户中心返回了登录页而不是 OAuth 响应，请确认当前请求必须使用浏览器环境发起，且 client_id 已开启设备码授权。",
      );
    }

    if (response.status === 401) {
      throw new Error(
        "账户中心拒绝了当前客户端，请检查 client_id 或 client_secret 是否正确。",
      );
    }

    throw new Error(fallback);
  }
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
      const url = getRequestUrl(endpoint);

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
    return normalizeStoredUser(JSON.parse(saved) as StoredUser);
  } catch {
    return null;
  }
};

export const saveStoredUser = (user: StoredUser) => {
  if (!isBrowser) return;
  localStorage.setItem(
    "chmlfrp_user",
    JSON.stringify(normalizeStoredUser(user)),
  );
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

export async function createDeviceAuthorization(
  scope = DEVICE_CODE_DEFAULT_SCOPE,
): Promise<DeviceAuthorizationResponse> {
  const body = new URLSearchParams();
  body.set("client_id", ACCOUNT_OAUTH_CLIENT_ID);

  const normalizedScope = scope
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" ");

  if (normalizedScope) {
    body.set("scope", normalizedScope);
  }

  const response = await oauthRequest({
    path: "/oauth2/device_authorization",
    body,
  });

  const data = parseOAuthJson<
    DeviceAuthorizationResponse | DeviceTokenResponse
  >(response, "账户服务返回了无法解析的响应");

  if (
    response.status >= 200 &&
    response.status < 300 &&
    data &&
    "device_code" in data
  ) {
    return data;
  }

  throw new Error(getOAuthErrorMessage(data ?? undefined, "申请设备授权失败"));
}

export async function exchangeDeviceCodeForToken(
  deviceCode: string,
): Promise<DeviceTokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
  body.set("device_code", deviceCode);

  if (!ACCOUNT_OAUTH_CLIENT_SECRET.trim()) {
    body.set("client_id", ACCOUNT_OAUTH_CLIENT_ID);
  }

  const response = await oauthRequest({
    path: "/oauth2/token",
    body,
  });

  return parseOAuthJson<DeviceTokenResponse>(
    response,
    "账户服务返回了无法解析的令牌响应",
  );
}

export async function loginWithAccessToken(
  accessToken: string,
  tokenResponse?: Pick<
    DeviceTokenResponse,
    "refresh_token" | "expires_in" | "token_type"
  >,
): Promise<StoredUser> {
  const userInfo = await fetchUserInfo(accessToken);

  return {
    username: userInfo.username,
    usergroup: userInfo.usergroup,
    userimg: userInfo.userimg,
    usertoken: userInfo.usertoken,
    accessToken,
    refreshToken: tokenResponse?.refresh_token,
    accessTokenExpiresAt: tokenResponse?.expires_in
      ? Date.now() + tokenResponse.expires_in * 1000
      : undefined,
    tokenType: tokenResponse?.token_type || "Bearer",
    tunnelCount: userInfo.tunnelCount,
    tunnel: userInfo.tunnel,
  };
}

export async function fetchTunnels(token?: string): Promise<Tunnel[]> {
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  const data = await request<Tunnel[]>("/tunnel", {
    headers: { authorization },
  });

  if (Array.isArray(data)) return data;
  throw new Error("获取隧道列表失败");
}

export async function fetchFlowLast7Days(token?: string): Promise<FlowPoint[]> {
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  const data = await request<FlowPoint[]>("/flow_last_7_days", {
    headers: { authorization },
  });

  if (Array.isArray(data)) return data;
  throw new Error("获取近7日流量失败");
}

export async function fetchUserInfo(token?: string): Promise<UserInfo> {
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  const data = await request<UserInfo>("/userinfo", {
    headers: { authorization },
  });

  if (data) return data as UserInfo;
  throw new Error("获取用户信息失败");
}

export async function fetchSignInInfo(token?: string): Promise<SignInInfo> {
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  const data = await request<SignInInfo>("/qiandao_info", {
    headers: { authorization },
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
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  const formData = new URLSearchParams();
  formData.append("tunnel_name", tunnelName);

  const endpoint = "/offline_tunnel";
  const headersObj = {
    "Content-Type": "application/x-www-form-urlencoded",
    authorization,
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
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  await request<unknown>(`/delete_tunnel?tunnelid=${tunnelId}`, {
    headers: { authorization },
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

interface NodeUdpCache {
  updatedAt: number;
  nodes: Record<string, boolean>;
}

function readNodeUdpCache(): NodeUdpCache | null {
  if (!isBrowser) return null;
  const raw = localStorage.getItem(NODE_UDP_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as NodeUdpCache;
    if (!parsed || typeof parsed.updatedAt !== "number" || !parsed.nodes) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeNodeUdpCache(cache: NodeUdpCache) {
  if (!isBrowser) return;
  localStorage.setItem(NODE_UDP_CACHE_KEY, JSON.stringify(cache));
}

function isNodeUdpCacheExpired(cache: NodeUdpCache): boolean {
  return Date.now() - cache.updatedAt > NODE_UDP_CACHE_TTL;
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

export interface UpdateTunnelParams {
  tunnelid: number;
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
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  const data = await request<Node[]>("/node", {
    headers: { authorization },
  });

  if (Array.isArray(data)) return data;
  throw new Error("获取节点列表失败");
}

export async function getNodeUdpSupport(
  nodeName: string,
  token?: string,
): Promise<boolean | null> {
  const cache = readNodeUdpCache();
  if (cache && !isNodeUdpCacheExpired(cache) && nodeName in cache.nodes) {
    return cache.nodes[nodeName];
  }

  try {
    const nodes = await fetchNodes(token);
    const nodesMap: Record<string, boolean> = {};
    nodes.forEach((node) => {
      nodesMap[node.name] = node.udp === "true";
    });
    writeNodeUdpCache({ updatedAt: Date.now(), nodes: nodesMap });
    if (nodeName in nodesMap) {
      return nodesMap[nodeName];
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchNodeInfo(
  nodeName: string,
  token?: string,
): Promise<NodeInfo> {
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  const data = await request<NodeInfo>(
    `/nodeinfo?node=${encodeURIComponent(nodeName)}`,
    {
      headers: { authorization },
    },
  );

  if (data) return data;
  throw new Error("获取节点信息失败");
}

export async function createTunnel(
  params: CreateTunnelParams,
  token?: string,
): Promise<void> {
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  await request<unknown>("/create_tunnel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization,
    },
    body: JSON.stringify(params),
  });
}

export async function updateTunnel(
  params: UpdateTunnelParams,
  token?: string,
): Promise<void> {
  const { accessToken, legacyToken } = await ensureAuthenticatedUser(token);
  const authorization = accessToken
    ? toBearerHeader(accessToken)
    : toBearerHeader(legacyToken!);

  await request<unknown>("/update_tunnel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization,
    },
    body: JSON.stringify(params),
  });
}
