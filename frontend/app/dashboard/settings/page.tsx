import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export default function SettingsPage() {
  return (
    <>
      <DashboardPageIntro
        title="Settings"
        description="Workspace profile, wallet auth, notifications, and data retention. Values are local UI state until backed by your API."
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
              <Input id="ws" defaultValue="OpenMind Labs" className="rounded-lg border-foreground/15" />
            </div>
            <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90" disabled>
              Save changes
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
    </>
  )
}
