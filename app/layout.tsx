import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '../components/app-shell'

export const metadata: Metadata = {
  title: 'NETVYL Business Management Platform',
  description: 'Professional print-shop and business management platform by NETVYL Digital Resources Global Ltd.',
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
