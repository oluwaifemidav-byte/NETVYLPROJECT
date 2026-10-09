'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { PageHead, Money } from '../../components/ui'
import { downloadTextPdf, money } from '../../lib/pdf-report'

function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function methodLabel(value: unknown) {
  const raw = String(value || '').trim()
  const normalized = raw.toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ')
  if (normalized === 'cash') return 'Cash'
  if (['transfer', 'bank', 'bank transfer', 'online transfer'].includes(normalized)) return 'Transfer'
  if (['pos', 'point of sale'].includes(normalized)) return 'POS'
  if (['card', 'debit card', 'credit card'].includes(normalized)) return 'Card'
  if (['online', 'online payment'].includes(normalized)) return 'Online'
  if (['—', '-', '–', 'other', 'other / unclassified'].includes(normalized)) return 'Unspecified'
  return raw || 'Unspecified'
}

export default function CashUpPage() {
  const organizationId = getActiveOrganizationId()
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [date, setDate] = useState(localDate())
  const [payments, setPayments] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [opening, setOpening] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!organizationId || !date) return
    setLoading(true); setError(''); setMessage('')
    const [paymentResult, expenseResult] = await Promise.all([
      supabase.from('payments').select('amount,method,payment_date').eq('organization_id', organizationId).eq('payment_date', date),
      supabase.from('expenses').select('amount,payment_method,category,expense_date').eq('organization_id', organizationId).eq('expense_date', date),
    ])
    const loadError = paymentResult.error || expenseResult.error
    if (loadError) setError(loadError.message)
    setPayments(paymentResult.data || [])
    setExpenses(expenseResult.data || [])
    setCounted({})
    setOpening({})
    setLoading(false)
  }, [date, organizationId, supabase])

  useEffect(() => { void load() }, [load])

  const methods = useMemo(() => Array.from(new Set([
    'Cash', 'Transfer', 'POS', 'Card', 'Online', 'Unspecified',
    ...payments.map(row => methodLabel(row.method)),
    ...expenses.map(row => methodLabel(row.payment_method)),
  ])).sort((a, b) => a.localeCompare(b)), [payments, expenses])
  const reconciliation = methods.map(method => {
    const received = payments.filter(row => methodLabel(row.method) === method).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const spent = expenses.filter(row => methodLabel(row.payment_method) === method).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const open = Number(opening[method] || 0)
    const expected = open + received - spent
    const actual = Number(counted[method] || 0)
    return { method, opening: open, received, spent, expected, actual, variance: actual - expected }
  })
  const receivedTotal = reconciliation.reduce((sum, row) => sum + row.received, 0)
  const expenseTotal = reconciliation.reduce((sum, row) => sum + row.spent, 0)
  const openingTotal = reconciliation.reduce((sum, row) => sum + row.opening, 0)
  const expectedTotal = openingTotal + receivedTotal - expenseTotal
  const countedTotal = reconciliation.reduce((sum, row) => sum + row.actual, 0)

  async function closeDay() {
    if (!organizationId || !reconciliation.length || saving) return
    setSaving(true); setError(''); setMessage('')
    const { data: { user } } = await supabase.auth.getUser()
    const details = {
      date,
      payment_count: payments.length,
      expense_count: expenses.length,
      opening_total: openingTotal,
      received_total: receivedTotal,
      expense_total: expenseTotal,
      expected_closing: expectedTotal,
      counted_closing: countedTotal,
      variance: countedTotal - expectedTotal,
      methods: reconciliation,
    }
    const { error: saveError } = await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: user?.id || null,
      action: 'cash_up_closed',
      entity_type: 'cash_up',
      entity_id: date,
      details,
    })
    if (saveError) setError(`Could not save the cash-up record: ${saveError.message}`)
    else setMessage(`Cash-up saved for ${date}. Variance: ${money(countedTotal - expectedTotal)}.`)
    setSaving(false)
  }

  function downloadSummary() {
    const lines = [`Date: ${date}`, `Payments recorded: ${payments.length}`, `Total received: ${money(receivedTotal)}`, `Expenses recorded: ${expenses.length}`, `Total expenses: ${money(expenseTotal)}`, `Opening balance: ${money(openingTotal)}`, `Expected closing: ${money(expectedTotal)}`, `Counted closing: ${money(countedTotal)}`, `Variance: ${money(countedTotal - expectedTotal)}`, '', 'BY PAYMENT METHOD']
    reconciliation.forEach(row => lines.push(`${row.method}: opening ${money(row.opening)} | received ${money(row.received)} | expenses ${money(row.spent)} | expected ${money(row.expected)} | counted ${money(row.actual)} | variance ${money(row.variance)}`))
    downloadTextPdf(`NETVYL-cash-up-${date}.pdf`, `Daily Cash-up — ${date}`, lines)
  }

  return <>
    <PageHead title="Daily Cash-up" subtitle="Reconcile recorded payments and expenses against the amounts counted at close." actions={<button className="btn" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>} />
    <section className="card" style={{ marginTop: 18 }}>
      <label>Cash-up date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      {message && <div className="notice" style={{ marginTop: 12 }}>{message}</div>}
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat"><span>Payments received</span><strong><Money value={receivedTotal} /></strong></div>
        <div className="stat"><span>Expenses</span><strong><Money value={expenseTotal} /></strong></div>
        <div className="stat"><span>Expected closing</span><strong><Money value={expectedTotal} /></strong></div>
        <div className="stat"><span>Counted closing</span><strong><Money value={countedTotal} /></strong></div>
      </div>
    </section>
    <section className="card" style={{ marginTop: 16 }}>
      <div className="section-head"><div><h3>Reconcile by method</h3><span>Expected = opening balance + recorded payments − expenses assigned to that method.</span></div></div>
      {loading ? <div className="loading-state">Loading transactions…</div> : methods.length ? <div className="tablewrap"><table><thead><tr><th>Method</th><th>Opening</th><th>Received</th><th>Expenses</th><th>Expected</th><th>Counted at close</th><th>Variance</th></tr></thead><tbody>
        {reconciliation.map(row => <tr key={row.method}><td><strong>{row.method}</strong></td><td><input aria-label={`Opening ${row.method}`} type="number" step="0.01" value={opening[row.method] || ''} onChange={event => setOpening(value => ({ ...value, [row.method]: event.target.value }))} placeholder="0.00" /></td><td><Money value={row.received} /></td><td><Money value={row.spent} /></td><td><Money value={row.expected} /></td><td><input aria-label={`Counted ${row.method}`} type="number" step="0.01" value={counted[row.method] || ''} onChange={event => setCounted(value => ({ ...value, [row.method]: event.target.value }))} placeholder="0.00" /></td><td className={row.variance === 0 ? '' : 'wine-text'}><Money value={row.variance} /></td></tr>)}
      </tbody></table></div> : <div className="empty-state">No payments or expenses recorded for this date.</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button className="btn primary" disabled={loading || saving || !methods.length} onClick={() => void closeDay()}>{saving ? 'Saving…' : 'Save daily close'}</button>
        <button className="btn" disabled={loading || !methods.length} onClick={downloadSummary}>Download cash-up PDF</button>
      </div>
      <p className="cell-sub" style={{ marginTop: 10 }}>Saving records opening balances, counted balances and variance in the organization activity history.</p>
    </section>
  </>
}
