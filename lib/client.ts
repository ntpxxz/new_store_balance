"use client";

// Thin browser API client. JWT lives in localStorage and is sent as Bearer.
// ponytail: localStorage token, not httpOnly cookie — fine for an internal LAN tool.

const TOKEN_KEY = "receive_token";
const USER_KEY = "receive_user";

export type AuthUser = { id: string; username: string; role: string; section?: string };

export type Task = {
  id: string;
  status: string;
  invoiceNo: string;
  poNo?: string | null;
  vendor: string;
  partNo: string;
  partName?: string | null;
  planQty: number;
  actualQty?: number | null;
  invoiceDate?: string | null;
  createdAt: string;
  receivedAt?: string | null;
  receivedBy?: string | null;
  targetLocation?: string | null;
  isUrgent?: boolean;
  lotNo?: string | null;
  passedQty?: number | null;
  failedQty?: number | null;
  judgment?: string | null;       // PASS | FAIL (from inspection_results)
  defectReason?: string | null;
};

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem(USER_KEY);
  return s ? JSON.parse(s) : null;
}
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  location.href = "/login";
}

async function req(path: string, init: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) logout();
    throw new Error(json.message || json.error || "Unauthorized");
  }
  if (!res.ok || json.success === false) {
    throw new Error(json.message || json.error || `Request failed (${res.status})`);
  }
  return json.data ?? json;
}

export async function login(username: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(json.error || json.message || "Login failed");
  const data = json.data ?? json;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user as AuthUser;
}

export type Part = {
  id: string;
  partNo: string;
  name: string;
  unit?: string | null;
  safetyStock: number;
  divisionName?: string | null;
  qty: number;
  locations: string[];
};

export type StockRow = {
  id: string;
  location: string;
  wh?: string | null;
  as400Location?: string | null;
  stcl?: string | null;
  matlot?: string | null;
  vendorCode?: string | null;
  vendorName?: string | null;
  maker?: string | null;
  stdPrice?: number | null;
  actPrice?: number | null;
  quantity: number;
  lastStockIn?: string | null;
  lastIssued?: string | null;
  latestUpdateDate?: string | null;
};

export type PartDetail = {
  id: string;
  partNo: string;
  name?: string | null;
  spec?: string | null;
  drawingNo?: string | null;
  unit: string;
  safetyStock: number;
  plac?: string | null;
  division?: string | null;
  divisionName?: string | null;
  itemType?: string | null;
  dept?: string | null;
  acCode?: string | null;
  totalQty: number;
  stocks: StockRow[];
  inboundTasks: {
    id: string;
    invoiceNo: string;
    vendor: string;
    planQty: number;
    actualQty?: number | null;
    status: string;
    invoiceDate?: string | null;
    receivedAt?: string | null;
    lotNo?: string | null;
  }[];
  movements: {
    id: string;
    type: string;
    qty: number;
    docRef?: string | null;
    location?: string | null;
    createdAt: string;
  }[];
};

export const api = {
  sync: (opts?: { dateFrom?: string; dateTo?: string; signal?: AbortSignal }) => {
    const { signal, ...body } = opts ?? {};
    return req(`/api/inbound-tasks/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }) as Promise<{ fetched: number; upserted: number; skipped: number; sourceDuplicates: number; dbCount: number }>;
  },
  listTasks: (status: string, search?: string) =>
    req(`/api/inbound-tasks?status=${status}${search ? `&search=${encodeURIComponent(search)}` : ""}`) as Promise<Task[]>,
  getTask: (id: string) => req(`/api/inbound-tasks/${id}`) as Promise<Task>,
  getCounts: () => req(`/api/inbound-tasks/counts`) as Promise<Record<string, number>>,
  syncStock: () => req(`/api/parts/sync`, { method: "POST" }) as Promise<{ fetched: number; upsertedParts: number; upsertedStocks: number; errors: string[] }>,
  getPart: (id: string) => req(`/api/parts/${id}`) as Promise<PartDetail>,
  listParts: (search?: string) =>
    req(`/api/parts${search ? `?search=${encodeURIComponent(search)}` : ""}`) as Promise<Part[]>,
  receive: (id: string, body: { receivedQty: number; isUrgent?: boolean; note?: string; bin?: string; lotNo?: string }) =>
    req(`/api/inbound-tasks/${id}/receive`, { method: "POST", body: JSON.stringify(body) }),
  listAs400Queue: () => req(`/api/as400/queue`) as Promise<{
    id: number; vendorCode?: string | null; vendorName?: string | null;
    matLot?: string | null; itemNo?: string | null; stockQty?: number | null;
    screenshot?: string | null; createdAt: string; status: string;
  }[]>,
  confirmAs400: (id: number) => req(`/api/as400/queue/${id}/confirm`, { method: "POST" }),
  rejectAs400: (id: number) => req(`/api/as400/queue/${id}/reject`, { method: "POST" }),
  iqcPass: (id: string, body: { passedQty: number; failedQty?: number; inspector?: string; defectReason?: string; remark?: string }) =>
    req(`/api/inbound-tasks/${id}/iqc-pass`, { method: "POST", body: JSON.stringify(body) }),
  iqcFail: (id: string, body: { passedQty?: number; failedQty?: number; defectReason: string; inspector?: string; remark?: string }) =>
    req(`/api/inbound-tasks/${id}/iqc-fail`, { method: "POST", body: JSON.stringify(body) }),
};
