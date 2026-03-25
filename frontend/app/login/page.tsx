import { Suspense } from "react"
import { LoginForm } from "./login-form"

function LoginFallback() {
  return (
    <div className="noise-overlay flex min-h-screen items-center justify-center px-6">
      <p className="font-mono text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  )
}
