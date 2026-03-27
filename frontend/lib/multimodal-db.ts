import type { ObjectId } from "mongodb"
import { getDb } from "@/lib/mongo"

export type MultimodalIngestStatus = "queued" | "processing" | "indexed" | "failed"

export type MultimodalAssetDoc = {
  _id?: ObjectId
  userId: ObjectId
  filename: string
  mimeType: string
  byteSize: number
  status: MultimodalIngestStatus
  chunkCount?: number
  error?: string
  createdAt: Date
  updatedAt: Date
}

export async function multimodalCollection() {
  const db = await getDb()
  return db.collection<MultimodalAssetDoc>("multimodal_assets")
}

export async function ensureMultimodalIndexes() {
  const col = await multimodalCollection()
  await Promise.all([
    col.createIndex({ userId: 1, createdAt: -1 }),
    col.createIndex({ userId: 1, status: 1 }),
  ])
}

export async function listAssets(userId: ObjectId) {
  await ensureMultimodalIndexes()
  const col = await multimodalCollection()
  return col.find({ userId }).sort({ createdAt: -1 }).limit(100).toArray()
}

export async function insertAssetPlaceholder(input: {
  userId: ObjectId
  filename: string
  mimeType: string
  byteSize: number
}) {
  await ensureMultimodalIndexes()
  const col = await multimodalCollection()
  const now = new Date()
  const res = await col.insertOne({
    userId: input.userId,
    filename: input.filename,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  })
  return res.insertedId
}

export async function patchAssetStatus(
  id: ObjectId,
  userId: ObjectId,
  patch: Partial<Pick<MultimodalAssetDoc, "status" | "chunkCount" | "error">>,
) {
  const col = await multimodalCollection()
  const now = new Date()
  const res = await col.updateOne(
    { _id: id, userId },
    { $set: { ...patch, updatedAt: now } },
  )
  return res.matchedCount > 0
}
