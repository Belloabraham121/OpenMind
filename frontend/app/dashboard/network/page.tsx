import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function NetworkQualityPage() {
  return (
    <>
      <DashboardPageIntro
        title="Network Quality"
        description="Miner leaderboard and validator challenge outcomes. Emissions follow benchmark-beating utility on retrieval, fidelity, and reconstruction."
      />
      <Card className="border-foreground/10 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-xl">Miners (sample)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">UID</TableHead>
                <TableHead className="font-mono text-xs">Retrieval</TableHead>
                <TableHead className="font-mono text-xs">Fidelity</TableHead>
                <TableHead className="font-mono text-xs">p95 ms</TableHead>
                <TableHead className="font-mono text-xs">RS OK</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["42", "0.91", "0.98", "540", "100%"],
                ["17", "0.88", "0.97", "610", "99%"],
                ["23", "0.84", "0.95", "720", "97%"],
              ].map(([uid, r, f, lat, rs]) => (
                <TableRow key={uid}>
                  <TableCell className="font-mono text-sm">{uid}</TableCell>
                  <TableCell className="text-muted-foreground">{r}</TableCell>
                  <TableCell className="text-muted-foreground">{f}</TableCell>
                  <TableCell className="text-muted-foreground">{lat}</TableCell>
                  <TableCell className="text-muted-foreground">{rs}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
