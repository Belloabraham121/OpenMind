import crypto from "node:crypto"
import { NextResponse } from "next/server"
import type { ObjectId } from "mongodb"
import { getDb } from "@/lib/mongo"

export type ApiKeyDoc = {
  _id?: ObjectId
  userId: ObjectId
  name: string
  /** First 8 chars of secret segment for UI (e.g. om_live_abcdefgh…) */
  displayHint: string
  keyHash: string
  createdAt: Date
  lastUsedAt?: Date
  revokedAt?: Date
  requestCountTotal?: number
  requestCountToday?: number
  /** UTC date YYYY-MM-DD for requestCountToday */
  usageDayUtc?: string
}

export function getApiKeyPepper(): string {
  return (process.env.API_KEY_HASH_PEPPER ?? "dev-change-API_KEY_HASH_PEPPER").trim()
}

/** Max gateway requests per key per UTC day; 0 = unlimited */
export function getApiKeyDailyQuota(): number {
  const n = Number(process.env.API_KEY_DAILY_QUOTA ?? "100000")
  if (!Number.isFinite(n) || n < 0) return 100000
  return n
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(`${getApiKeyPepper()}:${plaintext}`, "utf8").digest("hex")
}

export function apiKeysCollection() {
  return getDb().then((db) => db.collection<ApiKeyDoc>("api_keys"))
}

export async function ensureApiKeyIndexes() {
  const col = await apiKeysCollection()
  await Promise.all([
    col.createIndex({ keyHash: 1 }, { unique: true }),
    col.createIndex({ userId: 1, revokedAt: 1 }),
  ])
}

const KEY_PREFIX = "om_live_"

export function generateApiKeySecret(): {
  fullKey: string
  keyHash: string
  displayHint: string
} {
  const raw = crypto.randomBytes(32).toString("base64url")
  const fullKey = `${KEY_PREFIX}${raw}`
  return {
    fullKey,
    keyHash: hashApiKey(fullKey),
    displayHint: raw.slice(0, 8),
  }
}

export async function createApiKey(userId: ObjectId, name: string) {
  await ensureApiKeyIndexes()
  const col = await apiKeysCollection()
  const { fullKey, keyHash, displayHint } = generateApiKeySecret()
  const now = new Date()
  const res = await col.insertOne({
    userId,
    name: name.trim() || "API key",
    displayHint,
    keyHash,
    createdAt: now,
    requestCountTotal: 0,
    requestCountToday: 0,
    usageDayUtc: now.toISOString().slice(0, 10),
  })
  return { id: res.insertedId, fullKey, name: name.trim() || "API key" }
}

export async function listApiKeys(userId: ObjectId) {
  await ensureApiKeyIndexes()
  const col = await apiKeysCollection()
  return col
    .find({ userId, revokedAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .toArray()
}

export async function revokeApiKey(userId: ObjectId, keyId: ObjectId) {
  const col = await apiKeysCollection()
  const now = new Date()
  const res = await col.updateOne(
    { _id: keyId, userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: now } },
  )
  return res.matchedCount > 0
}

export type VerifiedApiKey = {
  userId: ObjectId
  keyId: ObjectId
}

/** Valid key → auth payload; invalid/missing → null; over daily quota → 429 Response */
export async function verifyApiKeyFromRequest(
  request: Request,
): Promise<VerifiedApiKey | NextResponse | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization")
  if (!header?.toLowerCase().startsWith("bearer ")) return null
  const token = header.slice(7).trim()
  if (!token.startsWith(KEY_PREFIX) || token.length < KEY_PREFIX.length + 16) return null

  const keyHash = hashApiKey(token)
  await ensureApiKeyIndexes()
  const col = await apiKeysCollection()
  const doc = await col.findOne({ keyHash, revokedAt: { $exists: false } })
  if (!doc?._id) return null

  const quota = getApiKeyDailyQuota()
  const day = new Date().toISOString().slice(0, 10)
  const todayCount =
    doc.usageDayUtc === day ? (doc.requestCountToday ?? 0) : 0
  if (quota > 0 && todayCount >= quota) {
    return NextResponse.json(
      { error: "API key daily quota exceeded.", quotaPerDay: quota },
      { status: 429 },
    )
  }

  const isNewDay = doc.usageDayUtc !== day
  const now = new Date()
  if (isNewDay) {
    await col.updateOne(
      { _id: doc._id },
      {
        $inc: { requestCountTotal: 1 },
        $set: {
          lastUsedAt: now,
          usageDayUtc: day,
          requestCountToday: 1,
        },
      },
    )
  } else {
    await col.updateOne(
      { _id: doc._id },
      {
        $inc: { requestCountTotal: 1, requestCountToday: 1 },
        $set: { lastUsedAt: now },
      },
    )
  }

  return { userId: doc.userId, keyId: doc._id }
}
