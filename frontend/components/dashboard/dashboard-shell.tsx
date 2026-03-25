"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="noise-overlay min-h-svh">
        <div className="relative z-10 flex min-h-svh flex-col">
          <DashboardHeader pathname={pathname} />
          <div className="flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
