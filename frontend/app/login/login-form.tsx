"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, ArrowRight, Wallet } from "lucide-react"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get("from") ?? "/dashboard"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  async function submit(mode: "sign-in" | "register") {
    setError(null)
    if (mode === "register" && !acceptedTerms) {
      setError("Accept the terms to create an account (demo).")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? "Could not sign in.")
        return
      }
      router.push(from.startsWith("/") ? from : "/dashboard")
      router.refresh()
    } finally {
      setLoading(false)
    }
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
            Demo gate only — use any real email and an 8+ character password. Wallet-native
            login can ship alongside your subnet identity layer.
          </p>
        </div>

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
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
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
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="button"
                disabled={loading}
                className="h-12 rounded-full bg-foreground text-background hover:bg-foreground/90"
                onClick={() => submit("register")}
              >
                Create account
                <ArrowRight className="size-4" />
              </Button>
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
              disabled
            >
              <Wallet className="size-4" />
              Continue with wallet
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                Soon
              </span>
            </Button>
          </div>
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
