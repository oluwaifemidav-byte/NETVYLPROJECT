import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '../components/app-shell'

export const metadata: Metadata = {
  title: 'NETVYL Business Management Platform',
  description: 'Professional print-shop and business management platform by NETVYL Digital Resources Global Ltd.',
  metadataBase: new URL('https://netvyl.online'),
  openGraph: {
    type: 'website',
    url: 'https://netvyl.online/',
    siteName: 'NETVYL',
    title: 'NETVYL Business Management Platform',
    description: 'Run your business with one connected platform. Sales, jobs, payments, inventory and team operations by NETVYL.',
    locale: 'en_NG',
    images: [{
      url: '/opengraph-image',
      width: 1200,
      height: 630,
      alt: 'NETVYL Business Management Platform',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NETVYL Business Management Platform',
    description: 'Run your business with one connected platform.',
    images: ['/opengraph-image'],
  },
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
