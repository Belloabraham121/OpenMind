export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init)
  if (response.status !== 401) return response

  const refresh = await fetch("/api/auth/refresh", { method: "POST" })
  if (!refresh.ok) {
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
    return response
  }

  return fetch(input, init)
}
