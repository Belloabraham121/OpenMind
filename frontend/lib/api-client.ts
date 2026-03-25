export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const merged: RequestInit = {
    credentials: "include",
    ...init,
  }
  const response = await fetch(input, merged)
  if (response.status !== 401) return response

  const refresh = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
  if (!refresh.ok) {
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
    return response
  }

  return fetch(input, merged)
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await apiFetch(input, init)
  const data = (await res.json().catch(() => ({}))) as T
  return { ok: res.ok, status: res.status, data }
}
