'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { getActiveOrganizationId } from '../../../lib/organization-context'
import { supabaseBrowser } from '../../../lib/supabase-browser'
import { PageHead } from '../../../components/ui'

const BACKUP_TABLES = [
  'customers', 'materials', 'business_services', 'inventory_items', 'suppliers',
  'production_workflows', 'jobs', 'job_orders', 'service_variants',
  'inventory_variants', 'inventory_unit_conversions', 'pricing_rules',
  'production_workflow_steps', 'service_recipes', 'quotes', 'purchase_orders',
  'job_lines', 'quote_lines', 'purchase_order_lines', 'service_recipe_components',
  'job_line_costs', 'job_waste', 'payments', 'inventory_transactions',
  'v36_inventory_transactions', 'print_queue', 'v36_job_line_progress', 'audit_logs',
]

type BackupData = {
  format: string
  organization_id: string
  organization_name: string
  created_at: string
  tables: Record<string, any[]>
}

export default function BackupPage() {
  const organizationId = getActiveOrganizationId()
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [organizationName, setOrganizationName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [backup, setBackup] = useState<BackupData | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      if (!organizationId) return
      const [{ data: { user } }, { data: organization }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
      ])
      if (!active || !user) return
      const { data: member } = await supabase.from('organization_members')
        .select('role').eq('organization_id', organizationId).eq('user_id', user.id).eq('active', true).maybeSingle()
      if (!active) return
      setOrganizationName(organization?.name || 'Organization')
      setIsAdmin(member?.role === 'administrator')
    })()
    return () => { active = false }
  }, [organizationId, supabase])

  async function readTable(table: string) {
    const rows: any[] = []
    if (table === 'service_recipe_components') {
      const recipes = await readTable('service_recipes')
      const recipeIds = recipes.map(recipe => recipe.id)
      if (!recipeIds.length) return rows
      for (let offset = 0; ; offset += 1000) {
        const { data, error: queryError } = await supabase.from(table).select('*').in('recipe_id', recipeIds).order('id', { ascending: true }).range(offset, offset + 999)
        if (queryError) throw new Error(`${table}: ${queryError.message}`)
        rows.push(...(data || []))
        if (!data || data.length < 1000) return rows
      }
    }
    for (let offset = 0; ; offset += 1000) {
      const { data, error: queryError } = await supabase.from(table).select('*')
        .eq('organization_id', organizationId).order('id', { ascending: true }).range(offset, offset + 999)
      if (queryError) throw new Error(`${table}: ${queryError.message}`)
      rows.push(...(data || []))
      if (!data || data.length < 1000) return rows
    }
  }

  async function createBackup() {
    if (!organizationId || !isAdmin || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const tables: Record<string, any[]> = {}
      for (const table of BACKUP_TABLES) tables[table] = await readTable(table)
      const snapshot: BackupData = {
        format: 'netvyl-organization-backup-v1',
        organization_id: organizationId,
        organization_name: organizationName,
        created_at: new Date().toISOString(),
        tables,
      }
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `NETVYL-backup-${organizationId}-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage(`Backup downloaded with ${Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)} records across ${BACKUP_TABLES.length} tables.`)
    } catch (caught: any) {
      setError(caught?.message || 'Unable to create a complete backup.')
    } finally { setBusy(false) }
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setBackup(null); setError(''); setMessage('')
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as BackupData
      if (parsed.format !== 'netvyl-organization-backup-v1' || parsed.organization_id !== organizationId || !parsed.tables) {
        throw new Error('This backup is invalid or belongs to a different organization.')
      }
      for (const [table, rows] of Object.entries(parsed.tables)) {
        if (!Array.isArray(rows)) throw new Error(`The backup contains invalid data (${table}).`)
        const recipeIds = new Set((parsed.tables.service_recipes || []).map(recipe => recipe.id))
        const rowsMatchOrg = table === 'service_recipe_components'
          ? rows.every(row => recipeIds.has(row.recipe_id))
          : rows.every(row => row.organization_id === organizationId)
        if (!BACKUP_TABLES.includes(table) || !rowsMatchOrg) {
          throw new Error(`The backup contains invalid or cross-organization data (${table}).`)
        }
      }
      setBackup(parsed)
    } catch (caught: any) {
      setError(caught?.message || 'Could not read that backup file.')
    }
    event.target.value = ''
  }

  async function restoreBackup() {
    if (!backup || !isAdmin || busy || !window.confirm('Restore these records into this organization? Matching IDs will be overwritten; records absent from the backup will not be deleted.')) return
    setBusy(true); setError(''); setMessage('')
    let restored = 0
    try {
      for (const table of BACKUP_TABLES) {
        const rows = backup.tables[table] || []
        for (let offset = 0; offset < rows.length; offset += 100) {
          const batch = rows.slice(offset, offset + 100)
          const { error: restoreError } = await supabase.from(table).upsert(batch, { onConflict: 'id' })
          if (restoreError) throw new Error(`Restored ${restored} records, then ${table} failed: ${restoreError.message}. You can safely retry this backup.`)
          const ids = batch.map(row => row.id)
          const verify = table === 'service_recipe_components'
            ? await supabase.from(table).select('id').in('id', ids)
            : await supabase.from(table).select('id').eq('organization_id', organizationId).in('id', ids)
          if (verify.error || (verify.data || []).length !== batch.length) throw new Error(`${table} restore verification failed after ${restored} records. You can safely retry this backup.`)
          restored += batch.length
        }
      }
      setMessage(`Restore complete: ${restored} records merged into ${organizationName}. Records created after the backup were kept.`)
      setBackup(null)
    } catch (caught: any) {
      setError(caught?.message || 'Restore did not complete. The backup can be retried.')
    } finally { setBusy(false) }
  }

  return <>
    <PageHead title="Backup & Restore" subtitle="Download a tenant-scoped copy of business records and safely merge it back when needed." />
    {!isAdmin && <div className="notice" style={{ marginTop: 16 }}>Administrator access is required to create or restore backups.</div>}
    {error && <div className="notice error" style={{ marginTop: 16 }}>{error}</div>}
    {message && <div className="notice" style={{ marginTop: 16 }}>{message}</div>}
    <section className="card" style={{ marginTop: 18 }}>
      <div className="section-head"><div><h3>Create a backup</h3><span>Includes customers, jobs, payments, inventory, orders, quotes, expenses and activity records.</span></div></div>
      <p>Keep the downloaded JSON file somewhere separate from this computer. Staff accounts, licenses, platform configuration and uploaded attachment files are excluded.</p>
      <button className="btn primary" onClick={createBackup} disabled={!isAdmin || busy}>{busy ? 'Working…' : 'Download organization backup'}</button>
    </section>
    <section className="card" style={{ marginTop: 16 }}>
      <div className="section-head"><div><h3>Restore or verify a backup</h3><span>Choose a NETVYL backup to validate it before merging its records.</span></div></div>
      <label>Backup JSON file<input type="file" accept="application/json,.json" onChange={selectBackup} disabled={!isAdmin || busy} /></label>
      {backup && <div className="notice" style={{ marginTop: 12 }}>
        Valid backup for <strong>{backup.organization_name}</strong>, created {new Date(backup.created_at).toLocaleString('en-NG')}. It contains {Object.values(backup.tables).reduce((sum, rows) => sum + rows.length, 0)} records across {Object.keys(backup.tables).length} tables.
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn primary" onClick={restoreBackup} disabled={!isAdmin || busy}>{busy ? 'Restoring…' : 'Restore backup'}</button>
          <button className="btn" onClick={() => setBackup(null)} disabled={busy}>Cancel</button>
        </div>
      </div>}
      <p style={{ marginTop: 12 }}>Restore merges by record ID. It updates matching rows, adds missing rows and does not delete records that are absent from the backup.</p>
    </section>
  </>
}
