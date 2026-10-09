'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Badge, Money } from '../../components/ui'
import { whatsappLink } from '../../lib/whatsapp'

export default function Delivery() {
  const org = getActiveOrganizationId()
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [rows, setRows] = useState<any[]>([])
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const [orders, customers] = await Promise.all([
      supabase.from('job_orders').select('id,order_no,customer_id,customer_name_snapshot,grand_total,amount_paid,delivery_status,delivery_address,delivery_date,status').eq('organization_id', org).in('delivery_status', ['ready', 'out_for_delivery', 'delivered']).order('delivery_date', { ascending: true, nullsFirst: false }),
      supabase.from('customers').select('id,phone').eq('organization_id', org),
    ])
    if (orders.error) setMessage(orders.error.message)
    else setMessage('')
    setRows(orders.data || [])
    setPhones(Object.fromEntries((customers.data || []).map((customer: any) => [customer.id, customer.phone || ''])))
  }, [org, supabase])

  useEffect(() => { void load() }, [load])

  async function setStatus(id: string, status: string) {
    setBusy(id)
    const { error } = await supabase.rpc('netvyl_update_order_lifecycle', { p_order_id: id, p_delivery_status: status })
    setMessage(error ? error.message : `Delivery status updated to ${status.replaceAll('_', ' ')}.`)
    setBusy('')
    if (!error) await load()
  }

  function customerMessage(order: any) {
    const status = order.delivery_status === 'ready' ? 'ready for collection' : order.delivery_status === 'out_for_delivery' ? 'out for delivery' : 'delivered'
    return `Hello ${order.customer_name_snapshot || 'there'}, your order ${order.order_no} is ${status}. Please contact us if you need any assistance.`
  }

  return <>
    <PageHead title="Delivery" subtitle="Track completed orders and send customers delivery updates on WhatsApp." actions={<button className="btn" onClick={() => void load()}>↻ Refresh</button>} />
    {message && <div className="notice" style={{ marginBottom: 14 }}>{message}</div>}
    <div className="card"><div className="tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Balance</th><th>Delivery</th><th>Address</th><th>Action</th></tr></thead><tbody>
      {rows.map(order => {
        const link = whatsappLink(phones[order.customer_id], customerMessage(order))
        return <tr key={order.id}>
          <td><strong>{order.order_no}</strong></td><td>{order.customer_name_snapshot}</td><td><Money value={order.grand_total} /></td><td><Money value={Number(order.grand_total) - Number(order.amount_paid || 0)} /></td>
          <td><Badge tone={order.delivery_status === 'delivered' ? 'success' : 'warning'}>{order.delivery_status?.replaceAll('_', ' ')}</Badge><small style={{ display: 'block' }}>{order.delivery_date || '—'}</small></td>
          <td>{order.delivery_address || '—'}</td><td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {order.delivery_status === 'ready' && <button className="btn small" disabled={busy === order.id} onClick={() => void setStatus(order.id, 'out_for_delivery')}>Out for delivery</button>}
            {order.delivery_status === 'out_for_delivery' && <button className="btn small" disabled={busy === order.id} onClick={() => void setStatus(order.id, 'delivered')}>Mark delivered</button>}
            {link && <a className="btn small" href={link} target="_blank" rel="noreferrer">WhatsApp customer</a>}
          </td>
        </tr>
      })}
    </tbody></table></div>{!rows.length && <div className="empty-state">No delivery-ready orders yet.</div>}</div>
    <p className="cell-sub" style={{ marginTop: 10 }}>WhatsApp opens with a prepared message. A staff member reviews and sends it from WhatsApp.</p>
  </>
}
