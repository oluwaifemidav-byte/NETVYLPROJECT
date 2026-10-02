'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Empty } from '../../components/ui'

const dedupeCustomersByName = (customers: Array<Record<string, any>>) => {
  const seen = new Set<string>()

  return customers.filter(customer => {
    const normalizedName = `${customer.name || ''}`.trim().toLowerCase()

    if (!normalizedName) return false

    if (seen.has(normalizedName)) {
      return false
    }

    seen.add(normalizedName)
    return true
  })
}

export default function Customers() {
  const router = useRouter()
  const ORG = getActiveOrganizationId()
  const s = useMemo(() => supabaseBrowser(), [])
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [loadingJobs, setLoadingJobs] = useState(false)

  useEffect(() => {
    if (!ORG) {
      router.replace('/login')
      return
    }

    async function load() {
      const { data } = await s.from('customers').select('*').eq('organization_id', ORG).order('name')
      setRows(dedupeCustomersByName(data || []))
    }

    load()
  }, [ORG, router, s])

  async function openCustomer(c: any) {
    if (!ORG) return
    setSelected(c)
    setLoadingJobs(true)
    const { data, error } = await s
      .from('jobs')
      .select('id,job_no,job_date,material_name_snapshot,grand_total,amount_paid,receipt_no,status')
      .eq('organization_id', ORG)
      .eq('customer_id', c.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    setJobs(data || [])
    if (error) setMsg(error.message)
    setLoadingJobs(false)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    if (!ORG) {
      router.replace('/login')
      return
    }
    if (!name.trim()) return

    const { data, error } = await s
      .from('customers')
      .insert({ organization_id: ORG, name: name.trim(), phone: phone.trim() || null, email: email.trim() || null })
      .select('*')
      .single()

    if (error) {
      setMsg(error.message)
    } else {
      setName('')
      setPhone('')
      setEmail('')
      setMsg('Customer added successfully.')
      const { data: refreshed } = await s.from('customers').select('*').eq('organization_id', ORG).order('name')
      setRows(dedupeCustomersByName(refreshed || []))
      if (data) openCustomer(data)
    }
  }

  const shown = dedupeCustomersByName(rows).filter((x) => `${x.name} ${x.phone || ''} ${x.email || ''}`.toLowerCase().includes(q.toLowerCase()))

  if (!ORG) {
    return <div className="card" style={{ marginTop: 20 }}><div className="notice">No active organization selected. Redirecting to login…</div></div>
  }

  return (
    <>
      <PageHead title="Customers" subtitle="Customer profiles now include their complete job list, balances and receipt history." />
      <div className="workspace-grid" style={{ marginTop: 20 }}>
        <form className="card form-card" onSubmit={add}>
          <div className="section-head">
            <div>
              <h3>New customer</h3>
              <span>Add a customer before creating a job.</span>
            </div>
          </div>
          <label>
            Customer name
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. ABC Limited" />
          </label>
          <label>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" />
          </label>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="customer@example.com" />
          </label>
          <button className="btn primary wide">Save customer</button>
          {msg && <div className="notice">{msg}</div>}
        </form>

        <section className="card">
          <div className="section-head">
            <div>
              <h3>{rows.length} customers</h3>
              <span>Customer directory — click a customer to open their job history.</span>
            </div>
            <input className="search-inline" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" />
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Created</th>
                  <th>History</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.id} className={selected?.id === x.id ? 'selected-row' : ''}>
                    <td><strong>{x.name}</strong></td>
                    <td>{x.phone || '—'}</td>
                    <td>{x.email || '—'}</td>
                    <td>{x.created_at ? new Date(x.created_at).toLocaleDateString('en-NG') : '—'}</td>
                    <td><a className="btn small" href={`/customers/${x.id}`}>View jobs →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shown.length && <Empty title="No matching customers" text="Try another search or add a new customer." />}
        </section>
      </div>
    </>
  )
}
