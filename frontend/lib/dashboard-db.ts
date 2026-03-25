import type { ObjectId } from "mongodb"
import { getDb } from "@/lib/mongo"

export type WorkspaceDoc = {
  _id?: ObjectId
  userId: ObjectId
  name: string
  slug: string
  createdAt: Date
  updatedAt: Date
}

export type ActivityKind =
  | "ingest"
  | "query"
  | "checkpoint"
  | "share"
  | "provenance"
  | "auth_register"
  | "auth_login"
  | "auth_logout"
  | "password_change"

export type ActivityEventDoc = {
  _id?: ObjectId
  userId: ObjectId
  workspaceId?: ObjectId
  kind: ActivityKind
  summary: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

export type DashboardStatsDoc = {
  _id?: ObjectId
  userId: ObjectId
  storedChunks: number
  p95RetrievalMs: number
  successRate: number
  updatedAt: Date
}

export type WorkflowDoc = {
  _id?: ObjectId
  userId: ObjectId
  externalId: string
  label?: string
  lastStep?: number
  createdAt: Date
  updatedAt: Date
}

export async function dashboardCollections() {
  const db = await getDb()
  return {
    workspaces: db.collection<WorkspaceDoc>("workspaces"),
    activity: db.collection<ActivityEventDoc>("activity_events"),
    stats: db.collection<DashboardStatsDoc>("dashboard_stats"),
    workflows: db.collection<WorkflowDoc>("workflows"),
  }
}

export async function ensureDashboardIndexes() {
  const { workspaces, activity, stats, workflows } = await dashboardCollections()
  await Promise.all([
    workspaces.createIndex({ userId: 1 }),
    workspaces.createIndex({ userId: 1, slug: 1 }, { unique: true }),
    activity.createIndex({ userId: 1, createdAt: -1 }),
    activity.createIndex({ createdAt: -1 }),
    stats.createIndex({ userId: 1 }, { unique: true }),
    workflows.createIndex({ userId: 1, updatedAt: -1 }),
    workflows.createIndex({ userId: 1, externalId: 1 }, { unique: true }),
  ])
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "workspace"
  )
}

/**
 * Ensures each user has a default workspace and baseline dashboard stats.
 */
export async function ensureDashboardForUser(userId: ObjectId) {
  await ensureDashboardIndexes()
  const { workspaces, stats } = await dashboardCollections()
  const now = new Date()

  let ws = await workspaces.findOne({ userId })
  if (!ws) {
    const slug = `default-${userId.toHexString().slice(-8)}`
    const res = await workspaces.insertOne({
      userId,
      name: "Default workspace",
      slug,
      createdAt: now,
      updatedAt: now,
    })
    ws = { _id: res.insertedId, userId, name: "Default workspace", slug, createdAt: now, updatedAt: now }
  }

  const st = await stats.findOne({ userId })
  if (!st) {
    await stats.insertOne({
      userId,
      storedChunks: 0,
      p95RetrievalMs: 0,
      successRate: 0.94,
      updatedAt: now,
    })
  }

  return { workspace: ws }
}

export async function updateWorkspaceName(
  userId: ObjectId,
  workspaceId: ObjectId,
  name: string,
) {
  const { workspaces } = await dashboardCollections()
  const trimmed = name.trim()
  if (!trimmed) return { ok: false as const, error: "Name is required." }

  const slug = `${slugify(trimmed)}-${workspaceId.toHexString().slice(-6)}`
  const now = new Date()
  const res = await workspaces.updateOne(
    { _id: workspaceId, userId },
    { $set: { name: trimmed, slug, updatedAt: now } },
  )
  if (res.matchedCount === 0) return { ok: false as const, error: "Workspace not found." }
  return { ok: true as const }
}
