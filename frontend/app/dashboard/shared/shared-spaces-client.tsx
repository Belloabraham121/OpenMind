"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch, apiJson } from "@/lib/api-client"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

type SpaceRow = {
  id: string
  name: string
  slug: string
  isOwner: boolean
  memberCount: number
  walletCount: number
  updatedAt: string
}

export function SharedSpacesClient() {
  const [spaces, setSpaces] = useState<SpaceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [memberEmail, setMemberEmail] = useState<Record<string, string>>({})
  const [walletInput, setWalletInput] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await apiJson<{ spaces: SpaceRow[] }>("/api/dashboard/shared-spaces")
    if (ok && data.spaces) setSpaces(data.spaces)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createSpace() {
    const name = newName.trim()
    if (!name) {
      toast.error("Name is required.")
      return
    }
    const res = await apiFetch("/api/dashboard/shared-spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? "Could not create space.")
      return
    }
    toast.success("Space created.")
    setNewName("")
    void load()
  }

  async function patchMember(spaceId: string, body: Record<string, unknown>) {
    setBusy(spaceId)
    try {
      const res = await apiFetch(`/api/dashboard/shared-spaces/${spaceId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Update failed.")
        return
      }
      toast.success("Updated.")
      void load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <DashboardPageIntro
        title="Shared Spaces"
        description="Control-plane spaces in Mongo; miners still enforce wallet auth via gateway /v1/space/query with your allow-list."
      />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {spaces.map((s) => (
            <Card key={s.id} className="border-foreground/10 shadow-none">
              <CardHeader>
                <CardTitle className="font-display text-xl">{s.name}</CardTitle>
                <CardDescription className="font-mono text-xs">
                  {s.slug} · {s.memberCount} members · {s.walletCount} wallets ·{" "}
                  {s.isOwner ? "Owner" : "Member"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {s.isOwner && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        placeholder="Invite by email (registered user)"
                        value={memberEmail[s.id] ?? ""}
                        onChange={(e) =>
                          setMemberEmail((m) => ({ ...m, [s.id]: e.target.value }))
                        }
                        className="min-w-[200px] flex-1 rounded-lg border-foreground/15"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={busy === s.id}
                        onClick={() =>
                          void patchMember(s.id, {
                            action: "add_member_email",
                            email: memberEmail[s.id],
                          })
                        }
                      >
                        Add member
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        placeholder="Wallet / hotkey string"
                        value={walletInput[s.id] ?? ""}
                        onChange={(e) =>
                          setWalletInput((w) => ({ ...w, [s.id]: e.target.value }))
                        }
                        className="min-w-[200px] flex-1 rounded-lg border-foreground/15"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={busy === s.id}
                        onClick={() =>
                          void patchMember(s.id, {
                            action: "add_wallet",
                            wallet: walletInput[s.id],
                          })
                        }
                      >
                        Add wallet
                      </Button>
                    </div>
                  </>
                )}
                {!s.isOwner && (
                  <p className="text-muted-foreground">Only the owner can edit members.</p>
                )}
              </CardContent>
            </Card>
          ))}
          <Card className="border-foreground/10 shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-xl">New shared space</CardTitle>
              <CardDescription>Create a space; add registered users by email or wallet strings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="sp-name">Name</Label>
                <Input
                  id="sp-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="rounded-lg border-foreground/15"
                />
              </div>
              <Button
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                onClick={() => void createSpace()}
              >
                Create space
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
