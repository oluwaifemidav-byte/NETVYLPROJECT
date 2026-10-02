'use client'

import { PageHead } from '../../../components/ui'

export default function BackupPage() {
  return (
    <>
      <PageHead
        title="Backup & Restore"
        subtitle="Operational backups and restore controls for this workspace."
      />

      <section className="card" style={{ marginTop: 20, padding: 24 }}>
        <p>Backup and restore tools are available from the admin workspace.</p>
        <p style={{ marginTop: 12, opacity: 0.8 }}>
          This page is kept as a valid route so the app can compile cleanly.
        </p>
      </section>
    </>
  )
}
