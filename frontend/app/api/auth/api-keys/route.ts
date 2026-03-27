import { NextResponse } from "next/server"
import { createApiKey, getApiKeyDailyQuota, listApiKeys } from "@/lib/auth-api-keys"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await listApiKeys(session.user._id)
  const quotaPerDay = getApiKeyDailyQuota()
  const day = new Date().toISOString().slice(0, 10)
  return NextResponse.json({
    quotaPerDay: quotaPerDay === 0 ? null : quotaPerDay,
    keys: rows.map((k) => {
      const today =
        k.usageDayUtc === day ? (k.requestCountToday ?? 0) : 0
      return {
        id: String(k._id),
        name: k.name,
        hint: `om_live_${k.displayHint}…`,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        requestCountTotal: k.requestCountTotal ?? 0,
        requestCountToday: today,
      }
    }),
  })
}

type PostBody = { name?: string }

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: PostBody = {}
  try {
    body = (await request.json()) as PostBody
  } catch {
    body = {}
  }

  const existing = await listApiKeys(session.user._id)
  if (existing.length >= 25) {
    return NextResponse.json({ error: "Maximum number of API keys reached (25)." }, { status: 400 })
  }

  const { id, fullKey, name } = await createApiKey(session.user._id, body.name ?? "API key")

  return NextResponse.json({
    id: String(id),
    key: fullKey,
    name,
    message: "Copy this key now — it will not be shown again.",
  })
}
