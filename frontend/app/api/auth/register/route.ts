import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { MongoServerError, type ObjectId } from "mongodb"
import {
  authCollections,
  createSixDigitCode,
  ensureAuthIndexes,
  normalizeEmail,
  normalizePhone,
} from "@/lib/auth-db"
import {
  createSessionToken,
  hashToken,
  sessionExpiresAt,
  setSessionCookie,
} from "@/lib/auth-session"
import { ensureDashboardForUser } from "@/lib/dashboard-db"
import { recordActivity } from "@/lib/record-activity"

export const runtime = "nodejs"

type Body = {
  email?: string
  phone?: string
  password?: string
}

function logRegisterError(step: string, err: unknown) {
  if (err instanceof MongoServerError) {
    console.error("[api/auth/register]", step, {
      message: err.message,
      code: err.code,
      codeName: err.codeName,
      errorLabelSet: err.errorLabels,
    })
    return
  }
  if (err instanceof Error) {
    console.error("[api/auth/register]", step, {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    })
    return
  }
  console.error("[api/auth/register]", step, err)
}

export async function POST(request: Request) {
  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = normalizeEmail(body.email)
  const phone = normalizePhone(body.phone)
  const password = body.password ?? ""

  if (!email && !phone) {
    return NextResponse.json(
      { error: "Provide a valid email or phone number." },
      { status: 400 },
    )
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    )
  }

  try {
    await ensureAuthIndexes()
  } catch (e) {
    logRegisterError("ensureAuthIndexes", e)
    const message = e instanceof Error ? e.message : "Database setup failed."
    const hint =
      process.env.NODE_ENV !== "production"
        ? "Check MONGODB_URI in .env.local (must be mongodb:// or mongodb+srv:// with host and credentials)."
        : undefined
    return NextResponse.json(
      { error: message, ...(hint ? { hint } : {}) },
      { status: 503 },
    )
  }

  let users, sessions, codes
  try {
    ;({ users, sessions, codes } = await authCollections())
  } catch (e) {
    logRegisterError("authCollections", e)
    const message = e instanceof Error ? e.message : "Database unavailable."
    return NextResponse.json(
      {
        error: message,
        hint:
          process.env.NODE_ENV !== "production"
            ? "Verify MONGODB_URI, network access (Atlas IP allowlist), and database user password."
            : undefined,
      },
      { status: 503 },
    )
  }

  const existing = await users.findOne({
    $or: [{ email: email ?? "__none__" }, { phone: phone ?? "__none__" }],
  })
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email or phone already exists." },
      { status: 409 },
    )
  }

  const now = new Date()
  let insertedId: ObjectId
  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await users.insertOne({
      email,
      phone,
      passwordHash,
      emailVerified: false,
      phoneVerified: false,
      createdAt: now,
      updatedAt: now,
    })
    insertedId = result.insertedId
  } catch (e) {
    logRegisterError("insertUser", e)
    return NextResponse.json(
      { error: "Could not create account. Try again later." },
      { status: 500 },
    )
  }

  let sessionToken: string
  try {
    if (email) {
      await codes.insertOne({
        userId: insertedId,
        purpose: "verify_email",
        code: createSixDigitCode(),
        createdAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      })
    }
    if (phone) {
      await codes.insertOne({
        userId: insertedId,
        purpose: "verify_phone",
        code: createSixDigitCode(),
        createdAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      })
    }

    sessionToken = createSessionToken()
    await sessions.insertOne({
      userId: insertedId,
      tokenHash: hashToken(sessionToken),
      createdAt: now,
      expiresAt: sessionExpiresAt(),
    })
  } catch (e) {
    logRegisterError("codesOrSession", e)
    return NextResponse.json(
      { error: "Account created but follow-up setup failed. Try signing in." },
      { status: 500 },
    )
  }

  try {
    await setSessionCookie(sessionToken)
  } catch (e) {
    logRegisterError("setSessionCookie", e)
    return NextResponse.json(
      { error: "Account created but session could not be set." },
      { status: 500 },
    )
  }

  try {
    await ensureDashboardForUser(insertedId)
    await recordActivity({
      userId: insertedId,
      kind: "auth_register",
      summary: "Account created",
    })
  } catch (e) {
    logRegisterError("dashboardBootstrap", e)
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: String(insertedId),
      email: email ?? null,
      phone: phone ?? null,
      emailVerified: false,
      phoneVerified: false,
    },
  })
}
