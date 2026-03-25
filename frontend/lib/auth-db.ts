import { ObjectId } from "mongodb"
import { getDb } from "@/lib/mongo"

export type UserDoc = {
  _id?: ObjectId
  email?: string
  phone?: string
  passwordHash: string
  emailVerified: boolean
  phoneVerified: boolean
  createdAt: Date
  updatedAt: Date
}

export type SessionDoc = {
  _id?: ObjectId
  userId: ObjectId
  tokenHash: string
  createdAt: Date
  expiresAt: Date
}

type CodePurpose = "verify_email" | "verify_phone" | "password_reset"

export type CodeDoc = {
  _id?: ObjectId
  userId: ObjectId
  purpose: CodePurpose
  code: string
  expiresAt: Date
  createdAt: Date
}

export async function authCollections() {
  const db = await getDb()
  return {
    users: db.collection<UserDoc>("users"),
    sessions: db.collection<SessionDoc>("sessions"),
    codes: db.collection<CodeDoc>("auth_codes"),
  }
}

export function normalizeEmail(email?: string): string | undefined {
  if (!email) return undefined
  const value = email.trim().toLowerCase()
  if (!value || !value.includes("@")) return undefined
  return value
}

export function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined
  const stripped = phone.replace(/[^\d+]/g, "")
  if (stripped.length < 8) return undefined
  return stripped
}

export function createSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function ensureAuthIndexes() {
  const { users, sessions, codes } = await authCollections()
  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true, sparse: true }),
    users.createIndex({ phone: 1 }, { unique: true, sparse: true }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    codes.createIndex({ userId: 1, purpose: 1 }),
    codes.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
}
