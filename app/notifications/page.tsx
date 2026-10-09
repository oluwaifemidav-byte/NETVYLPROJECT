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
  const [info, setInfo] = useState('')
  const [canSend, setCanSend] = useState(false)
  const [sending, setSending] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

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
    void (async () => {
      const { data: { user } } = await s.auth.getUser()
      if (!user) return
      const { data: membership } = await s
        .from('organization_members')
        .select('role,active')
        .eq('organization_id', org)
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle()
      setCanSend(Boolean(membership?.active && membership.role === 'administrator'))
    })()

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

  async function sendAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!org || !canSend || sending) return
    setSending(true)
    setError('')
    setInfo('')
    const { data, error: sendError } = await s.rpc('netvyl_send_staff_announcement', {
      p_org_id: org,
      p_title: title.trim(),
      p_body: body.trim(),
    })
    setSending(false)
    if (sendError) {
      setError(sendError.message.includes('netvyl_send_staff_announcement')
        ? 'Staff announcements need the database update first. Apply supabase/staff-announcements.sql, then try again.'
        : sendError.message)
      return
    }
    const count = Number(data || 0)
    setInfo(count
      ? `Announcement sent to ${count} staff member${count === 1 ? '' : 's'}.`
      : 'No active staff members were found in this organization.')
    setTitle('')
    setBody('')
    await load()
  }

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
        <PageHead title="Notifications" subtitle="Staff announcements and operational alerts." />
        <div className="card">
          <div className="notice">No active organization selected. Redirecting to login…</div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead title="Notifications" subtitle="Staff announcements and operational alerts." />
      <div className="card">
        {error && <div className="notice" style={{ marginBottom: 12 }}>{error}</div>}
        {info && <div className="notice" style={{ marginBottom: 12 }}>{info}</div>}
        {canSend && <form onSubmit={sendAnnouncement} style={{ display: 'grid', gap: 10, marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0 }}>Send an announcement to staff</h3>
          <input aria-label="Announcement title" placeholder="Announcement title" maxLength={120} required value={title} onChange={event => setTitle(event.target.value)} />
          <textarea aria-label="Announcement message" placeholder="Write your message for active staff…" maxLength={2000} rows={4} required value={body} onChange={event => setBody(event.target.value)} />
          <div><button className="btn primary" type="submit" disabled={sending || !title.trim() || !body.trim()}>{sending ? 'Sending…' : 'Send to staff'}</button><small style={{ marginLeft: 10 }}>Sent to active managers, staff, cashiers and production users in this organization.</small></div>
        </form>}
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
