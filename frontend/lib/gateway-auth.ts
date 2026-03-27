import type { ObjectId } from "mongodb"
import { NextResponse } from "next/server"
import { verifyApiKeyFromRequest } from "@/lib/auth-api-keys"
import { getSessionUser } from "@/lib/require-session"

export type GatewayAuth =
  | {
      kind: "session"
      userId: ObjectId
    }
  | {
      kind: "api_key"
      userId: ObjectId
      apiKeyId: ObjectId
    }

/** Cookie session or `Authorization: Bearer om_live_…` API key. */
export async function getGatewayAuth(
  request: Request,
): Promise<GatewayAuth | NextResponse | null> {
  const session = await getSessionUser()
  if (session) {
    return { kind: "session", userId: session.user._id }
  }

  const outcome = await verifyApiKeyFromRequest(request)
  if (outcome === null) return null
  if (outcome instanceof NextResponse) return outcome

  return { kind: "api_key", userId: outcome.userId, apiKeyId: outcome.keyId }
}

/** Use this when `getGatewayAuth` returned `null` so clients see actionable hints for `om_live_…` keys. */
export function gatewayUnauthorized(request: Request) {
  const raw =
    request.headers.get("authorization") ?? request.headers.get("Authorization") ?? ""
  const hasOmLiveBearer = /^Bearer\s+om_live_/i.test(raw.trim())
  return NextResponse.json(
    {
      error: "Unauthorized",
      ...(hasOmLiveBearer
        ? {
            hint:
              "This route accepts a dashboard API key (Bearer om_live_…), not OpenAI. Rejected: wrong or revoked key, key missing from MongoDB used by the app, or API_KEY_HASH_PEPPER changed since the key was created. Fix: set OPENMIND_API_KEY in MCP to a key from Dashboard → API & MCP; keep the same pepper across restarts; create a new key if you rotated pepper.",
          }
        : {}),
    },
    { status: 401 },
  )
}

/** Generic 401 when no request context is available. */
export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
