"use client"

import { useEffect, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { apiFetch, apiJson } from "@/lib/api-client"
import type { MeResponse } from "@/lib/types/dashboard"
import { toast } from "sonner"

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState("")
  const [wsLoading, setWsLoading] = useState(false)
  const [meLoading, setMeLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { ok, data } = await apiJson<MeResponse>("/api/me")
      if (cancelled || !ok || !data?.workspaces?.length) {
        setMeLoading(false)
        return
      }
      const primary =
        data.workspaces.find((w) => w.id === data.primaryWorkspaceId) ?? data.workspaces[0]
      setWorkspaceId(primary.id)
      setWorkspaceName(primary.name)
      setMeLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveWorkspace() {
    if (!workspaceId) return
    setWsLoading(true)
    try {
      const res = await apiFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, workspaceName }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Could not save workspace.")
        return
      }
      toast.success("Workspace updated.")
    } catch {
      toast.error("Network error.")
    } finally {
      setWsLoading(false)
    }
  }

  async function changePassword() {
    setLoading(true)
    try {
      const res = await apiFetch("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Could not change password.")
        return
      }
      toast.success("Password updated successfully.")
      setCurrentPassword("")
      setNewPassword("")
    } catch {
      toast.error("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <DashboardPageIntro
        title="Settings"
        description="Workspace profile, authentication controls, notifications, and data retention."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">Workspace</CardTitle>
            <CardDescription>Display name and default environment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws">Name</Label>
              <Input
                id="ws"
                value={meLoading ? "" : workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                disabled={meLoading || !workspaceId}
                placeholder={meLoading ? "Loading…" : "Workspace name"}
                className="rounded-lg border-foreground/15"
              />
            </div>
            <Button
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={() => void saveWorkspace()}
              disabled={wsLoading || meLoading || !workspaceId}
            >
              {wsLoading ? "Saving…" : "Save changes"}
            </Button>
          </CardContent>
        </Card>
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">Notifications</CardTitle>
            <CardDescription>Alerts for repair queue, auth failures, and quota</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">Email digest</span>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">Webhook failures</span>
              <Switch />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-foreground/10 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-xl">Change password</CardTitle>
          <CardDescription>Update your account password using your current credentials.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-lg border-foreground/15"
            />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-lg border-foreground/15"
            />
          </div>
          <div className="flex items-end md:col-span-1">
            <Button
              className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={changePassword}
              disabled={loading}
            >
              {loading ? "Updating..." : "Update password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
