'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getActiveOrganizationId } from '../../../lib/organization-context'
import { supabaseBrowser } from '../../../lib/supabase-browser'
import { Badge, PageHead } from '../../../components/ui'

export default function StaffActivityPage() {
  const organizationId = getActiveOrganizationId()
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [rows, setRows] = useState<any[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true); setError('')
    const { data, error: queryError } = await supabase.from('audit_logs').select('id,actor_user_id,action,entity_type,entity_id,details,created_at')
      .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(300)
    if (queryError) {
      setError(queryError.message); setRows([]); setLoading(false); return
    }
    const logs = data || []
    setRows(logs)
    const actorIds = Array.from(new Set(logs.map(row => row.actor_user_id).filter(Boolean)))
    if (actorIds.length) {
      const { data: members } = await supabase.from('organization_members').select('user_id,full_name,role').eq('organization_id', organizationId).in('user_id', actorIds)
      setNames(Object.fromEntries((members || []).map(member => [member.user_id, member.full_name || member.role])))
    } else setNames({})
    setLoading(false)
  }, [organizationId, supabase])

  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(row => `${row.action} ${row.entity_type || ''} ${row.entity_id || ''} ${names[row.actor_user_id] || ''} ${JSON.stringify(row.details || {})}`.toLowerCase().includes(term))
  }, [names, rows, search])

  return <>
    <PageHead title="Staff Activity" subtitle="Review recent actions recorded for this organization." actions={<button className="btn" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>} />
    <section className="card" style={{ marginTop: 18 }}>
      <input className="search-main" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search staff member, action or record…" />
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="tablewrap" style={{ marginTop: 14 }}><table><thead><tr><th>When</th><th>Staff member</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>
        {shown.map(row => <tr key={row.id}>
          <td>{new Date(row.created_at).toLocaleString('en-NG')}</td>
          <td>{names[row.actor_user_id] || (row.actor_user_id ? 'Former or unlisted member' : 'System')}</td>
          <td><Badge tone="neutral">{String(row.action || 'activity').replaceAll('_', ' ')}</Badge></td>
          <td>{row.entity_type || '—'}{row.entity_id ? ` · ${row.entity_id}` : ''}</td>
          <td><small>{JSON.stringify(row.details || {})}</small></td>
        </tr>)}
        {loading && <tr><td colSpan={5}>Loading activity…</td></tr>}
      </tbody></table></div>
      {!loading && !shown.length && <div className="empty-state">No activity records match this search.</div>}
      <p className="cell-sub" style={{ marginTop: 10 }}>Shows up to 300 recent audit events. The event history is limited to actions that the application records.</p>
    </section>
  </>
}
