import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function SharedSpacesPage() {
  return (
    <>
      <DashboardPageIntro
        title="Shared Spaces"
        description="Team and multi-agent memory with wallet-signature access control. Miners enforce permissions before returning shared shards."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">space / eng-memory</CardTitle>
            <CardDescription>3 members · 2 agents · Premium durability</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-full border-foreground/15">
              Manage allow-list
            </Button>
            <Button size="sm" className="rounded-full bg-foreground text-background hover:bg-foreground/90">
              Open activity
            </Button>
          </CardContent>
        </Card>
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">New shared space</CardTitle>
            <CardDescription>Create a workspace and invite wallet addresses</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="rounded-full border-foreground/15" disabled>
              Create (wire API)
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
