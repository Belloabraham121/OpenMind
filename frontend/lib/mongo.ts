import dns from "node:dns"
import { MongoClient, type MongoClientOptions } from "mongodb"

/**
 * Node may try IPv6 first for SRV lookups; some networks stall and hit querySrv ETIMEOUT.
 * Prefer IPv4 before connecting (helps with mongodb+srv on flaky IPv6 paths).
 */
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first")
}

const dbName = process.env.MONGODB_DB_NAME ?? "openmind"

/**
 * Slow DNS (SRV can take 2s+ on some networks) causes querySrv ETIMEOUT with driver defaults.
 * These values give SRV + server selection more time before failing.
 */
const clientOptions: MongoClientOptions = {
  serverSelectionTimeoutMS: 60_000,
  connectTimeoutMS: 30_000,
  socketTimeoutMS: 45_000,
}

const globalForMongo = globalThis as unknown as {
  mongoClient?: MongoClient
}

/** Normalize env value: trim and strip wrapping quotes. */
function readMongoUri(): string {
  const raw = process.env.MONGODB_URI ?? ""
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim()
}

/** Atlas / standard connection strings only. */
function isValidMongoUri(uri: string): boolean {
  return /^mongodb(\+srv)?:\/\//i.test(uri)
}

async function getClient(): Promise<MongoClient> {
  if (globalForMongo.mongoClient) return globalForMongo.mongoClient

  const uri = readMongoUri()
  if (!uri || !isValidMongoUri(uri)) {
    throw new Error(
      "Invalid MONGODB_URI. Use a full string like mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/ or mongodb://...",
    )
  }

  const client = await new MongoClient(uri, clientOptions).connect()
  if (process.env.NODE_ENV !== "production") {
    globalForMongo.mongoClient = client
  }
  return client
}

export async function getDb() {
  const client = await getClient()
  return client.db(dbName)
}
