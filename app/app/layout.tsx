// @ts-ignore - workspace path resolution can vary in this project structure
import '../globals.css'
// @ts-ignore - component path is resolved by the app project setup
import StaffSessionGuard from '../components/StaffSessionGuard'

export const metadata = {
  title: 'NETVYL Workspace',
  description: 'NETVYL Business Management Platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {

  return (
    <html lang="en">

      <body>

        <StaffSessionGuard />

        {children}

      </body>

    </html>
  )
}