import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ApiPage() {
  return (
    <>
      <DashboardPageIntro
        title="API & MCP"
        description="The marketing app never calls the validator directly from the browser. Use session-authenticated Next routes like /api/gateway/memory/query; set SUBNET_GATEWAY_URL on the server to forward to the FastAPI gateway."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">Endpoint</CardTitle>
            <CardDescription>Production keys stay on the server; this UI is illustrative.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wide">Base URL</Label>
              <Input
                readOnly
                value="Same origin · /api/gateway/memory/query, /store, /checkpoint/*, /health"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wide">API key</Label>
              <Input readOnly value="om_live_••••••••••••••••" className="font-mono text-sm" />
            </div>
            <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90" disabled>
              Roll key
            </Button>
          </CardContent>
        </Card>
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">MCP quickstart</CardTitle>
            <CardDescription>Paste into Claude Desktop, Cursor, or LangGraph</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-foreground/10 bg-muted/30 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
              {`{
  "mcpServers": {
    "openmind": {
      "url": "https://gateway.openmind.example/mcp"
    }
  }
}`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
