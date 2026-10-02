'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Badge } from '../../components/ui'

export default function Notifications() {
  const router = useRouter()
  const org = getActiveOrganizationId()
  const s = useMemo(() => supabaseBrowser(), [])
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')

  async function load() {
    if (!org) {
      setRows([])
      setError('No active organization selected.')
      return
    }

    const { data, error: queryError } = await s
      .from('notifications')
      .select('*')
      .eq('organization_id', org)
      .order('created_at', { ascending: false })
      .limit(100)

    if (queryError) {
      setError(queryError.message)
      setRows([])
      return
    }

    setRows(data || [])
    setError('')
  }

  useEffect(() => {
    if (!org) {
      router.replace('/login')
      return
    }

    load()

    const ch = s
      .channel(`netvyl-notifications-${org}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `organization_id=eq.${org}` },
        () => load()
      )
      .subscribe()

    return () => {
      s.removeChannel(ch)
    }
  }, [org, router, s])

  async function read(id: string) {
    if (!org) return

    const { error: updateError } = await s
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', org)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await load()
  }

  if (!org) {
    return (
      <>
        <PageHead title="Notifications" subtitle="Operational alerts, approvals and reminders." />
        <div className="card">
          <div className="notice">No active organization selected. Redirecting to login…</div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead title="Notifications" subtitle="Operational alerts, approvals and reminders." />
      <div className="card">
        {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
        {rows.map((x) => (
          <button
            key={x.id}
            className="order-line"
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer' }}
            onClick={() => read(x.id)}
          >
            <div className="order-line-main">
              <strong>{x.title}</strong>
              <small>{x.body} · {new Date(x.created_at).toLocaleString('en-NG')}</small>
            </div>
            <Badge tone={x.read_at ? 'neutral' : 'wine'}>{x.read_at ? 'Read' : 'New'}</Badge>
          </button>
        ))}
        {!rows.length && !error && <div className="empty-state">No notifications yet.</div>}
      </div>
    </>
  )
}
