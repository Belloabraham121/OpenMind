import type { ObjectId } from "mongodb"
import {
  type ActivityKind,
  dashboardCollections,
  ensureDashboardIndexes,
} from "@/lib/dashboard-db"

export async function recordActivity(input: {
  userId: ObjectId
  kind: ActivityKind
  summary: string
  workspaceId?: ObjectId
  metadata?: Record<string, unknown>
}) {
  try {
    await ensureDashboardIndexes()
    const { activity } = await dashboardCollections()
    await activity.insertOne({
      userId: input.userId,
      kind: input.kind,
      summary: input.summary,
      workspaceId: input.workspaceId,
      metadata: input.metadata,
      createdAt: new Date(),
    })
  } catch (err) {
    console.error("[recordActivity]", input.kind, err)
  }
}
