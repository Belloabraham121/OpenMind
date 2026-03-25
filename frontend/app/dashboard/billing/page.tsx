import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function BillingPage() {
  return (
    <>
      <DashboardPageIntro
        title="Billing & Plans"
        description="Usage-based metering for storage, query volume, and premium durability. Connect Stripe or subnet-native billing when you launch."
      />
      <Card className="border-foreground/10 shadow-none">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-xl">Pro · $199/mo (sample)</CardTitle>
            <CardDescription>
              500 GB storage · Premium RS · Shared spaces · Priority support
            </CardDescription>
          </div>
          <Button variant="outline" className="rounded-full border-foreground/15" disabled>
            Manage subscription
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Invoices and payment methods render here after checkout integration.
        </CardContent>
      </Card>
    </>
  )
}
