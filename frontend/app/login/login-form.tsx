"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AUTH_WAITLIST_MESSAGE } from "@/lib/auth-access-message"
import { ArrowLeft, ArrowRight, Info, Wallet } from "lucide-react"
import { toast } from "sonner"

/** Must match server `AUTH_OPEN`; set `NEXT_PUBLIC_AUTH_OPEN=true` in .env for local auth. */
const AUTH_OPEN = process.env.NEXT_PUBLIC_AUTH_OPEN === "true"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get("from") ?? "/dashboard"

  const [identifier, setIdentifier] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [userId, setUserId] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationChannel, setVerificationChannel] = useState<"email" | "phone">(
    "email",
  )
  const [resetCode, setResetCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [forgotIdentifier, setForgotIdentifier] = useState("")
  const [showResetFlow, setShowResetFlow] = useState(false)
  const [devResetHint, setDevResetHint] = useState<string | null>(null)
  const [devVerifyHint, setDevVerifyHint] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown((v) => v - 1), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  async function submit(mode: "sign-in" | "register") {
    if (!AUTH_OPEN) {
      toast.error(AUTH_WAITLIST_MESSAGE)
      return
    }
    if (mode === "register" && !acceptedTerms) {
      toast.error("Accept the terms to create an account.")
      return
    }
    setLoading(true)
    try {
      const url = mode === "register" ? "/api/auth/register" : "/api/auth/login"
      const payload =
        mode === "register"
          ? { email, phone, password }
          : { identifier, password }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        user?: { id: string; email?: string | null; phone?: string | null }
      }
      if (!res.ok) {
        toast.error(data.error ?? "Authentication failed.")
        return
      }
      if (mode === "register") {
        setUserId(data.user?.id ?? "")
        setVerificationChannel(data.user?.email ? "email" : "phone")
        toast.success("Account created. Verify your email/phone to complete setup.")
        return
      }
      toast.success("Signed in successfully.")
      router.push(from.startsWith("/") ? from : "/dashboard")
      router.refresh()
    } catch {
      toast.error("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function requestVerificationCode() {
    if (!AUTH_OPEN) {
      toast.error(AUTH_WAITLIST_MESSAGE)
      return
    }
    if (!userId || resendCooldown > 0) return
    const res = await fetch("/api/auth/verify/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, channel: verificationChannel }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      devCode?: string
    }
    if (!res.ok) {
      toast.error(data.error ?? "Could not send verification code.")
      return
    }
    setResendCooldown(30)
    setDevVerifyHint(data.devCode ?? null)
    toast.success(`Verification code sent to your ${verificationChannel}.`)
  }

  async function confirmVerificationCode() {
    if (!AUTH_OPEN) {
      toast.error(AUTH_WAITLIST_MESSAGE)
      return
    }
    if (!userId || !verificationCode) return
    const res = await fetch("/api/auth/verify/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        channel: verificationChannel,
        code: verificationCode,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? "Verification failed.")
      return
    }
    toast.success("Verification successful. You can sign in now.")
    setVerificationCode("")
  }

  async function startPasswordReset() {
    if (!AUTH_OPEN) {
      toast.error(AUTH_WAITLIST_MESSAGE)
      return
    }
    const res = await fetch("/api/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: forgotIdentifier }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      devCode?: string
    }
    if (!res.ok) {
      toast.error(data.error ?? "Could not start password reset.")
      return
    }
    setShowResetFlow(true)
    setDevResetHint(data.devCode ?? null)
    toast.success("If this account exists, a reset code has been sent.")
  }

  async function finishPasswordReset() {
    if (!AUTH_OPEN) {
      toast.error(AUTH_WAITLIST_MESSAGE)
      return
    }
    if (!userId || !resetCode || !newPassword) return
    const res = await fetch("/api/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, code: resetCode, newPassword }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? "Could not reset password.")
      return
    }
    toast.success("Password reset successful. Sign in with your new password.")
    setResetCode("")
    setNewPassword("")
    setShowResetFlow(false)
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden noise-overlay">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        {[...Array(8)].map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute h-px bg-foreground/10"
            style={{
              top: `${12.5 * (i + 1)}%`,
              left: 0,
              right: 0,
            }}
          />
        ))}
        {[...Array(12)].map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute w-px bg-foreground/10"
            style={{
              left: `${8.33 * (i + 1)}%`,
              top: 0,
              bottom: 0,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col px-6 py-10 md:justify-center md:py-16">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-2 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to OpenMind
        </Link>

        <div className="mb-8">
          <span className="mb-4 inline-flex items-center gap-3 font-mono text-sm text-muted-foreground">
            <span className="h-px w-8 bg-foreground/30" />
            Authentication
          </span>
          <h1 className="mt-4 font-display text-4xl tracking-tight md:text-5xl">
            Sign in to your memory workspace
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            {AUTH_OPEN
              ? "Use your email or phone number and password to access your OpenMind dashboard."
              : "Dashboard access is limited to people on our waitlist or whitelist while we run closed testing."}
          </p>
        </div>

        {!AUTH_OPEN && (
          <Alert className="mb-6 border-foreground/20 bg-card/90">
            <Info className="size-4" />
            <AlertTitle>Tester access only</AlertTitle>
            <AlertDescription>{AUTH_WAITLIST_MESSAGE}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-2xl border border-foreground/10 bg-card/80 p-6 shadow-sm backdrop-blur-sm md:p-8">
          <Tabs defaultValue="sign-in" className="gap-6">
            <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted/80 p-1">
              <TabsTrigger
                value="sign-in"
                className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Sign in
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Create account
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sign-in" className="mt-0 flex flex-col gap-5">
              <div className="space-y-2">
                <Label htmlFor="identifier">Email or phone</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  placeholder="you@company.com or +1234567890"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-11 rounded-lg border-foreground/15"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-lg border-foreground/15"
                />
              </div>
              <Button
                type="button"
                disabled={loading}
                className="h-12 rounded-full bg-foreground text-background hover:bg-foreground/90"
                onClick={() => submit("sign-in")}
              >
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </TabsContent>

            <TabsContent value="register" className="mt-0 flex flex-col gap-5">
              <div className="space-y-2">
                <Label htmlFor="email-r">Email</Label>
                <Input
                  id="email-r"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-lg border-foreground/15"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-r">Phone number</Label>
                <Input
                  id="phone-r"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+1234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 rounded-lg border-foreground/15"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password-r">Password</Label>
                <Input
                  id="password-r"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-lg border-foreground/15"
                />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(v) => setAcceptedTerms(v === true)}
                  className="mt-1"
                />
                <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug">
                  I agree to the demo terms. Production will use your real policies and wallet
                  signatures for shared spaces.
                </label>
              </div>
              <Button
                type="button"
                disabled={loading}
                className="h-12 rounded-full bg-foreground text-background hover:bg-foreground/90"
                onClick={() => submit("register")}
              >
                Create account
                <ArrowRight className="size-4" />
              </Button>

              {userId && (
                <div className="rounded-xl border border-foreground/10 p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Verify your {verificationChannel} with a one-time code.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={verificationChannel === "email" ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setVerificationChannel("email")}
                    >
                      Email
                    </Button>
                    <Button
                      type="button"
                      variant={verificationChannel === "phone" ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setVerificationChannel("phone")}
                    >
                      Phone
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter 6-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                    />
                    <Button type="button" onClick={confirmVerificationCode} className="rounded-full">
                      Verify
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestVerificationCode}
                    disabled={resendCooldown > 0}
                    className="rounded-full"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </Button>
                  {devVerifyHint && (
                    <p className="font-mono text-xs text-muted-foreground">
                      Dev code: {devVerifyHint}
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="mt-8">
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-widest">
                <span className="bg-card px-3 font-mono text-muted-foreground">Or</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-12 w-full rounded-full border-foreground/20"
              onClick={() => setShowResetFlow((v) => !v)}
            >
              <Wallet className="size-4" />
              Forgot password
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                Reset
              </span>
            </Button>
          </div>

          {showResetFlow && (
            <div className="mt-6 rounded-2xl border border-foreground/10 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter your email or phone, then use the reset code to set a new password.
              </p>
              <Input
                placeholder="Email or phone"
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
              />
              <Button type="button" variant="outline" className="rounded-full" onClick={startPasswordReset}>
                Send reset code
              </Button>
              <Input
                placeholder="Your user id (from register response)"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
              <Input
                placeholder="Reset code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
              />
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button type="button" className="rounded-full" onClick={finishPasswordReset}>
                Complete reset
              </Button>
              {devResetHint && (
                <p className="font-mono text-xs text-muted-foreground">Dev reset code: {devResetHint}</p>
              )}
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Need the public site?{" "}
          <Link href="/" className="text-foreground underline-offset-4 hover:underline">
            Return home
          </Link>
        </p>
      </div>
    </div>
  )
}
