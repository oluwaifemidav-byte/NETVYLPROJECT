'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import {
  PageHead,
  StatCard,
  QuickLink,
  Money,
  Badge,
  Empty,
} from '../../components/ui'

type Job = {
  id: string
  job_no: string
  customer_name_snapshot: string | null
  grand_total: number | null
  amount_paid: number | null
  status: string | null
  estimated_cost: number | null
  estimated_profit: number | null
  material_name_snapshot: string | null
  job_date: string | null
  created_at: string
}

type InventoryItem = {
  current_stock: number | null
  cost_per_unit: number | null
  sell_price: number | null
  reorder_level: number | null
  active: boolean | null
  category: string | null
  metadata: Record<string, unknown> | null
}

type Expense = {
  amount: number | null
  expense_date: string | null
}

const n = (value: unknown) => Number(value || 0)

export default function Dashboard() {
  const organizationId = getActiveOrganizationId()
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [greeting, setGreeting] = useState('Good day 👋')
  const [jobs, setJobs] = useState<Job[]>([])
  const [customers, setCustomers] = useState(0)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!organizationId) {
      setError('No active organization was found.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const [jobsResult, customersResult, inventoryResult, expensesResult] =
      await Promise.all([
        supabase
          .from('jobs')
          .select(
            'id,job_no,customer_name_snapshot,grand_total,amount_paid,status,estimated_cost,estimated_profit,material_name_snapshot,job_date,created_at'
          )
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1000),

        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId),

        supabase
          .from('inventory_items')
          .select(
            'current_stock,cost_per_unit,sell_price,reorder_level,active,category,metadata'
          )
          .eq('organization_id', organizationId)
          .eq('active', true),

        supabase
          .from('expenses')
          .select('amount,expense_date')
          .eq('organization_id', organizationId),
      ])

    const firstError =
      jobsResult.error ||
      customersResult.error ||
      inventoryResult.error ||
      expensesResult.error

    if (firstError) setError(firstError.message)

    setJobs((jobsResult.data || []) as Job[])
    setCustomers(customersResult.count || 0)
    setInventory((inventoryResult.data || []) as InventoryItem[])
    setExpenses((expensesResult.data || []) as Expense[])
    setLoading(false)
  }

  useEffect(() => {
    function updateGreeting() {
      const hour = new Date().getHours()
      if (hour >= 5 && hour < 12) setGreeting('Good morning 👋')
      else if (hour >= 12 && hour < 17) setGreeting('Good afternoon 👋')
      else setGreeting('Good evening 👋')
    }

    updateGreeting()
    const timer = window.setInterval(updateGreeting, 60000)
    void load()

    return () => window.clearInterval(timer)
  }, [organizationId, supabase])

  const sales = jobs.reduce((total, job) => total + n(job.grand_total), 0)
  const paid = jobs.reduce((total, job) => total + n(job.amount_paid), 0)
  const outstanding = Math.max(0, sales - paid)

  const estimatedProfit = jobs.reduce(
    (total, job) => total + n(job.estimated_profit),
    0
  )

  const operatingExpenses = expenses.reduce(
    (total, item) => total + n(item.amount),
    0
  )

  const netOperatingResult = estimatedProfit - operatingExpenses

  const inventoryValue = inventory.reduce((total, item) => {
    const stock = n(item.current_stock)
    const cost = n(item.cost_per_unit)
    const sellPrice = n(item.sell_price)
    const metadata = item.metadata || {}
    const rollWidth = n(
      metadata.roll_width_ft ?? metadata.roll_width
    )

    if (item.category === 'Large Format' && rollWidth > 0) {
      return total + stock * rollWidth * (sellPrice || cost)
    }

    return total + stock * (sellPrice || cost)
  }, 0)

  const lowStockItems = inventory.filter(
    item => n(item.current_stock) <= n(item.reorder_level)
  ).length

  const recentJobs = jobs.slice(0, 8)

  const statusCount = (status: string) =>
    jobs.filter(
      job => String(job.status || '').toLowerCase() === status.toLowerCase()
    ).length

  const badgeTone = (
    status: string | null
  ): 'success' | 'warning' | 'danger' | 'wine' => {
    const value = String(status || '').toLowerCase()
    if (value === 'completed' || value === 'ready' || value === 'delivered') {
      return 'success'
    }
    if (value === 'printing' || value === 'in production') return 'warning'
    if (value === 'cancelled') return 'danger'
    return 'wine'
  }

  return (
    <>
      <PageHead
        title={greeting}
        subtitle="Your print business at a glance — sales, production, stock and profitability."
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={load}
              disabled={loading}
            >
              {loading ? '↻ Loading…' : '↻ Refresh'}
            </button>
            <Link className="btn primary" href="/new-job">
              ＋ New Job
            </Link>
          </>
        }
      />

      {error && (
        <div className="notice error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ padding: 24 }}>Loading business health…</div>
        </div>
      ) : (
        <>
          <div className="stats">
            <StatCard label="Customers" value={customers} icon="♙" />
            <StatCard label="Jobs" value={jobs.length} icon="▤" />
            <StatCard label="Sales" value={<Money value={sales} />} icon="₦" />
            <StatCard label="Outstanding" value={<Money value={outstanding} />} icon="!" />
          </div>

          <div className="stats" style={{ marginTop: 14 }}>
            <StatCard label="Estimated profit" value={<Money value={estimatedProfit} />} icon="↗" />
            <StatCard label="Operating expenses" value={<Money value={operatingExpenses} />} icon="−" />
            <StatCard label="Net operating result" value={<Money value={netOperatingResult} />} icon="=" />
            <StatCard label="Low-stock items" value={lowStockItems} icon="◫" />
          </div>

          <div className="stats" style={{ marginTop: 14 }}>
            <StatCard label="Pending" value={statusCount('pending')} icon="•" />
            <StatCard label="Printing" value={statusCount('printing')} icon="▶" />
            <StatCard label="Completed" value={statusCount('completed')} icon="✓" />
            <StatCard label="Inventory value" value={<Money value={inventoryValue} />} icon="◫" />
          </div>

          <div className="dashboard-grid" style={{ marginTop: 20 }}>
            <section className="card">
              <div className="section-head">
                <div>
                  <h3>Recent Jobs</h3>
                  <span>Live activity from your current jobs database</span>
                </div>
                <Link className="text-link" href="/jobs">View all →</Link>
              </div>

              {recentJobs.length > 0 ? (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>Customer</th>
                        <th>Material</th>
                        <th>Total</th>
                        <th>Profit</th>
                        <th>Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentJobs.map(job => {
                        const balance = Math.max(
                          0,
                          n(job.grand_total) - n(job.amount_paid)
                        )

                        return (
                          <tr key={job.id}>
                            <td>
                              <strong>{job.job_no}</strong>
                              <small className="cell-sub">
                                {job.job_date || String(job.created_at).slice(0, 10)}
                              </small>
                            </td>
                            <td>{job.customer_name_snapshot || '—'}</td>
                            <td>{job.material_name_snapshot || '—'}</td>
                            <td><Money value={job.grand_total} /></td>
                            <td><Money value={job.estimated_profit} /></td>
                            <td><Money value={balance} /></td>
                            <td>
                              <Badge tone={badgeTone(job.status)}>
                                {job.status || 'pending'}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No jobs yet" text="Create your first job from New Job." />
              )}
            </section>

            <section className="card">
              <div className="section-head">
                <div>
                  <h3>Quick actions</h3>
                  <span>Common tasks</span>
                </div>
              </div>

              <div className="quick-grid">
                <QuickLink href="/new-job" icon="＋" title="Create job" text="Calculate, price & save" />
                <QuickLink href="/quotes" icon="₦" title="Create quote" text="Quote and convert" />
                <QuickLink href="/payments" icon="✓" title="Record payment" text="Full or partial payment" />
                <QuickLink href="/production" icon="▶" title="Production" text="Advance live jobs" />
                <QuickLink href="/inventory" icon="◫" title="Inventory" text="Stock & movements" />
                <QuickLink href="/reports" icon="◒" title="Reports" text="Business performance" />
              </div>
            </section>
          </div>
        </>
      )}
    </>
  )
}
