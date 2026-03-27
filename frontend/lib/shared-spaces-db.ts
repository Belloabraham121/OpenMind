import type { ObjectId } from "mongodb"
import { getDb } from "@/lib/mongo"

export type SharedSpaceDoc = {
  _id?: ObjectId
  ownerId: ObjectId
  name: string
  slug: string
  /** Invited users (by user ObjectId) */
  memberUserIds: ObjectId[]
  /** Placeholder wallet allow-list strings for subnet/auth_metadata */
  memberWallets: string[]
  createdAt: Date
  updatedAt: Date
}

export async function sharedSpacesCollection() {
  const db = await getDb()
  return db.collection<SharedSpaceDoc>("shared_spaces")
}

export async function ensureSharedSpaceIndexes() {
  const col = await sharedSpacesCollection()
  await Promise.all([
    col.createIndex({ ownerId: 1 }),
    col.createIndex({ ownerId: 1, slug: 1 }, { unique: true }),
    col.createIndex({ memberUserIds: 1 }),
  ])
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "space"
  )
}

export async function listSharedSpacesForUser(userId: ObjectId) {
  await ensureSharedSpaceIndexes()
  const col = await sharedSpacesCollection()
  return col
    .find({
      $or: [{ ownerId: userId }, { memberUserIds: userId }],
    })
    .sort({ updatedAt: -1 })
    .toArray()
}

export async function createSharedSpace(input: {
  ownerId: ObjectId
  name: string
  memberWallets?: string[]
}) {
  await ensureSharedSpaceIndexes()
  const col = await sharedSpacesCollection()
  const now = new Date()
  const base = slugify(input.name)
  const slug = `${base}-${now.getTime().toString(36)}`
  const res = await col.insertOne({
    ownerId: input.ownerId,
    name: input.name.trim() || "Shared space",
    slug,
    memberUserIds: [],
    memberWallets: (input.memberWallets ?? []).map((w) => w.trim()).filter(Boolean),
    createdAt: now,
    updatedAt: now,
  })
  return res.insertedId
}

export async function addSpaceMember(params: {
  spaceId: ObjectId
  ownerId: ObjectId
  memberUserId: ObjectId
}) {
  const col = await sharedSpacesCollection()
  const now = new Date()
  const res = await col.updateOne(
    { _id: params.spaceId, ownerId: params.ownerId },
    { $addToSet: { memberUserIds: params.memberUserId }, $set: { updatedAt: now } },
  )
  return res.matchedCount > 0
}

export async function removeSpaceMember(params: {
  spaceId: ObjectId
  ownerId: ObjectId
  memberUserId: ObjectId
}) {
  const col = await sharedSpacesCollection()
  const now = new Date()
  const res = await col.updateOne(
    { _id: params.spaceId, ownerId: params.ownerId },
    { $pull: { memberUserIds: params.memberUserId }, $set: { updatedAt: now } },
  )
  return res.matchedCount > 0
}

export async function addSpaceWallet(params: {
  spaceId: ObjectId
  ownerId: ObjectId
  wallet: string
}) {
  const w = params.wallet.trim()
  if (!w) return false
  const col = await sharedSpacesCollection()
  const now = new Date()
  const res = await col.updateOne(
    { _id: params.spaceId, ownerId: params.ownerId },
    { $addToSet: { memberWallets: w }, $set: { updatedAt: now } },
  )
  return res.matchedCount > 0
}

export async function removeSpaceWallet(params: {
  spaceId: ObjectId
  ownerId: ObjectId
  wallet: string
}) {
  const col = await sharedSpacesCollection()
  const now = new Date()
  const res = await col.updateOne(
    { _id: params.spaceId, ownerId: params.ownerId },
    { $pull: { memberWallets: params.wallet.trim() }, $set: { updatedAt: now } },
  )
  return res.matchedCount > 0
}

export async function getSharedSpaceIfAllowed(spaceId: ObjectId, userId: ObjectId) {
  const col = await sharedSpacesCollection()
  return col.findOne({
    _id: spaceId,
    $or: [{ ownerId: userId }, { memberUserIds: userId }],
  })
}

export async function deleteSharedSpace(params: { spaceId: ObjectId; ownerId: ObjectId }) {
  const col = await sharedSpacesCollection()
  const res = await col.deleteOne({ _id: params.spaceId, ownerId: params.ownerId })
  return res.deletedCount > 0
}
