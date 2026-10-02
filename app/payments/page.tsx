'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Badge } from '../../components/ui'

type Job = {
  id: string
  job_no: string
  customer_id: string | null
  customer_name_snapshot: string
  job_date: string
  grand_total: number
  amount_paid: number
  receipt_no: string | null
  status: string
  deleted_at: string | null
}

type Payment = {
  id: string
  job_id: string
  legacy_job_id: string | null
  receipt_no: string | null
  customer_id: string | null
  customer_name_snapshot: string | null
  payment_date: string
  amount: number
  method: string | null
  reference: string | null
  notes: string | null
  created_at: string
}

type PaymentJob = Job & {
  total: number
  paid: number
  balance: number
  paymentStatus: 'PAID' | 'PART PAYMENT' | 'UNPAID'
}

type Organization = {
  id: string
  name: string
  currency: string | null
}

function money(value: number) {
  return `₦${Number(value || 0).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`
}

function today() {
  return new Date()
    .toISOString()
    .slice(0, 10)
}

function formatDate(value: string) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString(
    'en-NG',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  )
}

function getPaymentStatus(
  total: number,
  paid: number
): PaymentJob['paymentStatus'] {
  if (total > 0 && paid >= total - 0.009) {
    return 'PAID'
  }

  if (paid > 0) {
    return 'PART PAYMENT'
  }

  return 'UNPAID'
}

function getBadgeTone(
  status: PaymentJob['paymentStatus']
) {
  if (status === 'PAID') {
    return 'success' as const
  }

  if (status === 'PART PAYMENT') {
    return 'warning' as const
  }

  return 'danger' as const
}

export default function PaymentsPage() {
  const supabase = useMemo(
    () => supabaseBrowser(),
    []
  )

  const organizationId =
    getActiveOrganizationId()

  const [
    organization,
    setOrganization,
  ] = useState<Organization | null>(null)

  const [jobs, setJobs] =
    useState<Job[]>([])

  const [payments, setPayments] =
    useState<Payment[]>([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')

  const [message, setMessage] =
    useState('')

  const [selectedJobId, setSelectedJobId] =
    useState('')

  const [amount, setAmount] =
    useState('')

  const [method, setMethod] =
    useState('Cash')

  const [paymentDate, setPaymentDate] =
    useState(today())

  const [reference, setReference] =
    useState('')

  const [notes, setNotes] =
    useState('')

  const [search, setSearch] =
    useState('')

  /*
   * ============================================================
   * LOAD DATA
   * ============================================================
   *
   * This page uses ONLY:
   *
   * organizations
   * jobs
   * payments
   *
   * There is intentionally NO:
   *
   * job_orders
   * orders
   * business_orders
   * record_job_payment RPC
   *
   */

  const load = useCallback(
    async () => {
      if (!organizationId) {
        setError(
          'No active organization is selected.'
        )

        setLoading(false)
        return
      }

      setError('')

      const [
        organizationResult,
        jobsResult,
        paymentsResult,
      ] = await Promise.all([
        supabase
          .from('organizations')
          .select(
            'id,name,currency'
          )
          .eq(
            'id',
            organizationId
          )
          .maybeSingle(),

        supabase
          .from('jobs')
          .select(
            `
              id,
              job_no,
              customer_id,
              customer_name_snapshot,
              job_date,
              grand_total,
              amount_paid,
              receipt_no,
              status,
              deleted_at
            `
          )
          .eq(
            'organization_id',
            organizationId
          )
          .is(
            'deleted_at',
            null
          )
          .order(
            'job_date',
            {
              ascending: false,
            }
          ),

        supabase
          .from('payments')
          .select(
            `
              id,
              job_id,
              legacy_job_id,
              receipt_no,
              customer_id,
              customer_name_snapshot,
              payment_date,
              amount,
              method,
              reference,
              notes,
              created_at
            `
          )
          .eq(
            'organization_id',
            organizationId
          )
          .order(
            'payment_date',
            {
              ascending: false,
            }
          )
          .limit(100),
      ])

      if (
        organizationResult.error
      ) {
        setError(
          `Company information: ${organizationResult.error.message}`
        )
      } else {
        setOrganization(
          organizationResult.data as Organization | null
        )
      }

      if (jobsResult.error) {
        setError(
          `Jobs: ${jobsResult.error.message}`
        )

        setJobs([])
      } else {
        setJobs(
          (jobsResult.data ||
            []) as Job[]
        )
      }

      if (paymentsResult.error) {
        setError(
          `Payments: ${paymentsResult.error.message}`
        )

        setPayments([])
      } else {
        setPayments(
          (paymentsResult.data ||
            []) as Payment[]
        )
      }

      setLoading(false)
      setRefreshing(false)
    },
    [
      organizationId,
      supabase,
    ]
  )

  useEffect(() => {
    void load()
  }, [load])

  /*
   * ============================================================
   * BUILD PAYMENT JOB LIST
   * ============================================================
   */

  const paymentJobs =
    useMemo<PaymentJob[]>(() => {
      return jobs.map(
        job => {
          const total =
            Number(
              job.grand_total || 0
            )

          const paid =
            Number(
              job.amount_paid || 0
            )

          const balance =
            Math.max(
              0,
              total - paid
            )

          return {
            ...job,
            total,
            paid,
            balance,
            paymentStatus:
              getPaymentStatus(
                total,
                paid
              ),
          }
        }
      )
    }, [jobs])

  /*
   * Only unpaid and part-paid jobs
   * are available for payment.
   */

  const outstandingJobs =
    useMemo(() => {
      return paymentJobs.filter(
        job =>
          job.balance >
          0.009
      )
    }, [paymentJobs])

  /*
   * Automatically select the first
   * outstanding job.
   */

  useEffect(() => {
    if (
      selectedJobId
    ) {
      return
    }

    if (
      outstandingJobs.length ===
      0
    ) {
      return
    }

    const first =
      outstandingJobs[0]

    setSelectedJobId(
      first.id
    )

    setAmount(
      first.balance.toFixed(2)
    )
  }, [
    outstandingJobs,
    selectedJobId,
  ])

  const selectedJob =
    paymentJobs.find(
      job =>
        job.id ===
        selectedJobId
    ) || null

  /*
   * Update amount when the selected
   * job changes.
   */

  useEffect(() => {
    if (!selectedJob) {
      return
    }

    setAmount(
      selectedJob.balance.toFixed(2)
    )
  }, [
    selectedJob?.id,
    selectedJob?.balance,
  ])

  /*
   * ============================================================
   * SEARCH PAYMENT HISTORY
   * ============================================================
   */

  const filteredPayments =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase()

      if (!query) {
        return payments
      }

      return payments.filter(
        payment => {
          const values = [
            payment.legacy_job_id,
            payment.job_id,
            payment.receipt_no,
            payment.customer_name_snapshot,
            payment.method,
            payment.reference,
            payment.notes,
          ]

          return values.some(
            value =>
              String(
                value || ''
              )
                .toLowerCase()
                .includes(
                  query
                )
          )
        }
      )
    }, [
      payments,
      search,
    ])

  /*
   * ============================================================
   * SUMMARY
   * ============================================================
   */

  const summary =
    useMemo(() => {
      const outstanding =
        outstandingJobs.reduce(
          (
            total,
            job
          ) =>
            total +
            job.balance,
          0
        )

      const paid =
        paymentJobs.reduce(
          (
            total,
            job
          ) =>
            total +
            job.paid,
          0
        )

      return {
        jobs:
          outstandingJobs.length,
        outstanding,
        paid,
      }
    }, [
      outstandingJobs,
      paymentJobs,
    ])

  /*
   * ============================================================
   * RECORD PAYMENT
   * ============================================================
   *
   * IMPORTANT:
   *
   * We DO NOT call record_job_payment().
   *
   * The current database has multiple overloaded versions
   * of that RPC, which caused the screenshot error:
   *
   * "Could not choose the best candidate function..."
   *
   * Instead:
   *
   * 1. Insert into payments.
   * 2. Recalculate payment total.
   * 3. Update jobs.amount_paid.
   * 4. Update jobs.status.
   *
   */

  async function savePayment() {
    setError('')
    setMessage('')

    if (!organizationId) {
      setError(
        'No active organization is selected.'
      )
      return
    }

    if (!selectedJob) {
      setError(
        'Please select a job.'
      )
      return
    }

    const paymentAmount =
      Number(amount)

    if (
      !Number.isFinite(
        paymentAmount
      ) ||
      paymentAmount <= 0
    ) {
      setError(
        'Enter a valid payment amount.'
      )
      return
    }

    if (
      paymentAmount >
      selectedJob.balance +
        0.009
    ) {
      setError(
        `Payment cannot exceed the outstanding balance of ${money(
          selectedJob.balance
        )}.`
      )
      return
    }

    setSaving(true)

    try {
      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser()

      /*
       * INSERT PAYMENT
       */

      const {
        error:
          insertError,
      } =
        await supabase
          .from('payments')
          .insert({
            organization_id:
              organizationId,

            job_id:
              selectedJob.id,

            legacy_job_id:
              selectedJob.job_no,

            receipt_no:
              selectedJob.receipt_no,

            customer_id:
              selectedJob.customer_id,

            customer_name_snapshot:
              selectedJob.customer_name_snapshot,

            payment_date:
              paymentDate,

            amount:
              Number(
                paymentAmount.toFixed(
                  2
                )
              ),

            method:
              method,

            reference:
              reference.trim() ||
              null,

            notes:
              notes.trim() ||
              null,

            created_by:
              user?.id ||
              null,
          })

      if (insertError) {
        throw new Error(
          insertError.message
        )
      }

      /*
       * GET ALL PAYMENTS FOR THIS JOB
       */

      const {
        data:
          jobPayments,
        error:
          historyError,
      } =
        await supabase
          .from('payments')
          .select(
            'amount'
          )
          .eq(
            'organization_id',
            organizationId
          )
          .eq(
            'job_id',
            selectedJob.id
          )

      if (historyError) {
        throw new Error(
          `Payment was saved, but the job balance could not be recalculated: ${historyError.message}`
        )
      }

      /*
       * CALCULATE TOTAL PAID
       */

      const totalPaid =
        (
          jobPayments ||
          []
        ).reduce(
          (
            total,
            row
          ) =>
            total +
            Number(
              row.amount || 0
            ),
          0
        )

      const newPaid =
        Number(
          totalPaid.toFixed(
            2
          )
        )

      const newBalance =
        Math.max(
          0,
          Number(
            selectedJob.total
          ) -
            newPaid
        )

      /*
       * PAYMENT STATUS
       */

      const newPaymentStatus =
        getPaymentStatus(
          selectedJob.total,
          newPaid
        )

      /*
       * Keep the existing job status model.
       *
       * Fully paid = completed
       * Part/unpaid = pending
       */

      const newJobStatus =
        newPaymentStatus ===
        'PAID'
          ? 'completed'
          : 'pending'

      /*
       * UPDATE JOB
       */

      const {
        error:
          updateError,
      } =
        await supabase
          .from('jobs')
          .update({
            amount_paid:
              newPaid,

            status:
              newJobStatus,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            selectedJob.id
          )
          .eq(
            'organization_id',
            organizationId
          )

      if (updateError) {
        throw new Error(
          `Payment was recorded but the job could not be updated: ${updateError.message}`
        )
      }

      /*
       * SUCCESS MESSAGE
       */

      if (
        newPaymentStatus ===
        'PAID'
      ) {
        setMessage(
          `Full payment recorded successfully for ${selectedJob.job_no}.`
        )
      } else {
        setMessage(
          `Part payment of ${money(
            paymentAmount
          )} recorded successfully. Remaining balance: ${money(
            newBalance
          )}.`
        )
      }

      /*
       * CLEAR FORM
       */

      setReference('')
      setNotes('')
      setAmount('')
      setSelectedJobId('')

      /*
       * REFRESH FROM DATABASE
       */

      await load()
    } catch (err: any) {
      setError(
        err?.message ||
          'Unable to record payment.'
      )
    } finally {
      setSaving(false)
    }
  }

  /*
   * ============================================================
   * REFRESH
   * ============================================================
   */

  function refresh() {
    setRefreshing(true)
    void load()
  }

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <>
      <PageHead
        title="Payments"
        subtitle="Record full or partial payments without losing the job balance history."
        actions={
          <button
            className="btn"
            type="button"
            onClick={refresh}
            disabled={
              refreshing
            }
          >
            {refreshing
              ? 'Refreshing…'
              : '↻ Refresh'}
          </button>
        }
      />

      {error && (
        <div
          className="notice"
          style={{
            marginTop: 16,
            borderColor:
              'rgba(220,70,90,.55)',
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          className="notice"
          style={{
            marginTop: 16,
            borderColor:
              'rgba(50,190,120,.55)',
          }}
        >
          {message}
        </div>
      )}

      {/* ======================================================
          SUMMARY
          ====================================================== */}

      <div
        className="grid3"
        style={{
          marginTop: 18,
        }}
      >
        <div className="card">
          <small>
            Outstanding Jobs
          </small>

          <h2
            style={{
              margin:
                '8px 0 0',
            }}
          >
            {
              summary.jobs
            }
          </h2>
        </div>

        <div className="card">
          <small>
            Total Outstanding
          </small>

          <h2
            style={{
              margin:
                '8px 0 0',
            }}
          >
            {money(
              summary.outstanding
            )}
          </h2>
        </div>

        <div className="card">
          <small>
            Total Paid
          </small>

          <h2
            style={{
              margin:
                '8px 0 0',
            }}
          >
            {money(
              summary.paid
            )}
          </h2>
        </div>
      </div>

      {/* ======================================================
          RECORD PAYMENT
          ====================================================== */}

      <section
        className="card"
        style={{
          marginTop: 18,
        }}
      >
        <div className="section-head">
          <div>
            <h3>
              Record payment
            </h3>

            <span>
              Record a full or partial
              payment against an existing
              job.
            </span>
          </div>

          {selectedJob && (
            <Badge
              tone={getBadgeTone(
                selectedJob.paymentStatus
              )}
            >
              {
                selectedJob.paymentStatus
              }
            </Badge>
          )}
        </div>

        {loading ? (
          <div
            className="empty-state"
            style={{
              marginTop: 18,
            }}
          >
            Loading jobs…
          </div>
        ) : outstandingJobs.length ===
          0 ? (
          <div
            className="empty-state"
            style={{
              marginTop: 18,
            }}
          >
            There are no outstanding
            payments for this company.
          </div>
        ) : (
          <>
            <div
              className="grid"
              style={{
                gridTemplateColumns:
                  'repeat(2, minmax(0, 1fr))',
                gap: 16,
                marginTop: 18,
              }}
            >
              {/* JOB */}

              <label>
                <span>
                  Job
                </span>

                <select
                  value={
                    selectedJobId
                  }
                  onChange={e =>
                    setSelectedJobId(
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select job
                  </option>

                  {outstandingJobs.map(
                    job => (
                      <option
                        key={
                          job.id
                        }
                        value={
                          job.id
                        }
                      >
                        {
                          job.job_no
                        }{' '}
                        •{' '}
                        {
                          job.customer_name_snapshot
                        }{' '}
                        • Balance{' '}
                        {money(
                          job.balance
                        )}
                      </option>
                    )
                  )}
                </select>
              </label>

              {/* AMOUNT */}

              <label>
                <span>
                  Amount
                </span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    amount
                  }
                  onChange={e =>
                    setAmount(
                      e.target.value
                    )
                  }
                  placeholder="Enter payment amount"
                />

                {selectedJob && (
                  <small
                    style={{
                      display:
                        'block',
                      marginTop:
                        6,
                      opacity:
                        0.7,
                    }}
                  >
                    Balance:{' '}
                    <strong>
                      {money(
                        selectedJob.balance
                      )}
                    </strong>
                  </small>
                )}
              </label>

              {/* METHOD */}

              <label>
                <span>
                  Payment method
                </span>

                <select
                  value={
                    method
                  }
                  onChange={e =>
                    setMethod(
                      e.target.value
                    )
                  }
                >
                  <option value="Cash">
                    Cash
                  </option>

                  <option value="Transfer">
                    Transfer
                  </option>

                  <option value="POS">
                    POS
                  </option>

                  <option value="Other">
                    Other
                  </option>
                </select>
              </label>

              {/* DATE */}

              <label>
                <span>
                  Payment date
                </span>

                <input
                  type="date"
                  value={
                    paymentDate
                  }
                  onChange={e =>
                    setPaymentDate(
                      e.target.value
                    )
                  }
                />
              </label>

              {/* REFERENCE */}

              <label>
                <span>
                  Reference
                </span>

                <input
                  value={
                    reference
                  }
                  onChange={e =>
                    setReference(
                      e.target.value
                    )
                  }
                  placeholder="Optional transfer/POS reference"
                />
              </label>

              {/* NOTES */}

              <label>
                <span>
                  Note
                </span>

                <input
                  value={
                    notes
                  }
                  onChange={e =>
                    setNotes(
                      e.target.value
                    )
                  }
                  placeholder="Optional payment note"
                />
              </label>
            </div>

            {/* SELECTED JOB SUMMARY */}

            {selectedJob && (
              <div
                className="card"
                style={{
                  marginTop: 18,
                  background:
                    'rgba(255,255,255,.02)',
                }}
              >
                <div
                  style={{
                    display:
                      'grid',
                    gridTemplateColumns:
                      'repeat(4, minmax(0, 1fr))',
                    gap: 14,
                  }}
                >
                  <div>
                    <small>
                      Job
                    </small>

                    <strong
                      style={{
                        display:
                          'block',
                        marginTop:
                          5,
                      }}
                    >
                      {
                        selectedJob.job_no
                      }
                    </strong>
                  </div>

                  <div>
                    <small>
                      Customer
                    </small>

                    <strong
                      style={{
                        display:
                          'block',
                        marginTop:
                          5,
                      }}
                    >
                      {
                        selectedJob.customer_name_snapshot
                      }
                    </strong>
                  </div>

                  <div>
                    <small>
                      Job Total
                    </small>

                    <strong
                      style={{
                        display:
                          'block',
                        marginTop:
                          5,
                      }}
                    >
                      {money(
                        selectedJob.total
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>
                      Balance
                    </small>

                    <strong
                      style={{
                        display:
                          'block',
                        marginTop:
                          5,
                        color:
                          '#ff5d87',
                      }}
                    >
                      {money(
                        selectedJob.balance
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* ACTIONS */}

            <div
              style={{
                display:
                  'flex',
                gap: 10,
                flexWrap:
                  'wrap',
                marginTop: 18,
              }}
            >
              <button
                className="btn primary"
                type="button"
                onClick={
                  savePayment
                }
                disabled={
                  saving ||
                  !selectedJob
                }
              >
                {saving
                  ? 'Saving payment…'
                  : 'Save payment'}
              </button>

              {selectedJob && (
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    setAmount(
                      selectedJob.balance.toFixed(
                        2
                      )
                    )
                  }
                >
                  Full payment
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ======================================================
          PAYMENT HISTORY
          ====================================================== */}

      <section
        className="card"
        style={{
          marginTop: 18,
        }}
      >
        <div className="section-head">
          <div>
            <h3>
              Payment history
            </h3>

            <span>
              Latest 100 payment
              transactions.
            </span>
          </div>

          <input
            value={
              search
            }
            onChange={e =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Search job, customer, receipt..."
            style={{
              width: 300,
              maxWidth:
                '100%',
            }}
          />
        </div>

        <div
          style={{
            overflowX:
              'auto',
            marginTop: 16,
          }}
        >
          <table
            style={{
              width:
                '100%',
              borderCollapse:
                'collapse',
            }}
          >
            <thead>
              <tr>
                <th align="left">
                  DATE
                </th>

                <th align="left">
                  JOB
                </th>

                <th align="left">
                  CUSTOMER
                </th>

                <th align="right">
                  AMOUNT
                </th>

                <th align="left">
                  METHOD
                </th>

                <th align="left">
                  REFERENCE
                </th>

                <th align="left">
                  RECEIPT
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredPayments.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding:
                        30,
                      textAlign:
                        'center',
                    }}
                  >
                    No payment transactions
                    found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map(
                  payment => (
                    <tr
                      key={
                        payment.id
                      }
                    >
                      <td>
                        {formatDate(
                          payment.payment_date
                        )}
                      </td>

                      <td>
                        <strong>
                          {
                            payment.legacy_job_id
                          }
                        </strong>
                      </td>

                      <td>
                        {
                          payment.customer_name_snapshot ||
                          '—'
                        }
                      </td>

                      <td align="right">
                        <strong>
                          {money(
                            Number(
                              payment.amount
                            )
                          )}
                        </strong>
                      </td>

                      <td>
                        {
                          payment.method ||
                          '—'
                        }
                      </td>

                      <td>
                        {
                          payment.reference ||
                          '—'
                        }
                      </td>

                      <td>
                        {
                          payment.receipt_no ||
                          '—'
                        }
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ======================================================
          OUTSTANDING BALANCES
          ====================================================== */}

      <section
        className="card"
        style={{
          marginTop: 18,
        }}
      >
        <div className="section-head">
          <div>
            <h3>
              Outstanding balances
            </h3>

            <span>
              Unpaid and part-paid jobs
              for this company.
            </span>
          </div>
        </div>

        <div
          style={{
            overflowX:
              'auto',
            marginTop: 16,
          }}
        >
          <table
            style={{
              width:
                '100%',
              borderCollapse:
                'collapse',
            }}
          >
            <thead>
              <tr>
                <th align="left">
                  JOB
                </th>

                <th align="left">
                  CUSTOMER
                </th>

                <th align="left">
                  DATE
                </th>

                <th align="right">
                  TOTAL
                </th>

                <th align="right">
                  PAID
                </th>

                <th align="right">
                  BALANCE
                </th>

                <th align="left">
                  STATUS
                </th>

                <th align="right">
                  ACTION
                </th>
              </tr>
            </thead>

            <tbody>
              {outstandingJobs.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding:
                        30,
                      textAlign:
                        'center',
                    }}
                  >
                    No outstanding
                    balances.
                  </td>
                </tr>
              ) : (
                outstandingJobs.map(
                  job => (
                    <tr
                      key={
                        job.id
                      }
                    >
                      <td>
                        <strong>
                          {
                            job.job_no
                          }
                        </strong>
                      </td>

                      <td>
                        {
                          job.customer_name_snapshot
                        }
                      </td>

                      <td>
                        {formatDate(
                          job.job_date
                        )}
                      </td>

                      <td align="right">
                        {money(
                          job.total
                        )}
                      </td>

                      <td align="right">
                        {money(
                          job.paid
                        )}
                      </td>

                      <td
                        align="right"
                        style={{
                          color:
                            '#ff5d87',
                          fontWeight:
                            700,
                        }}
                      >
                        {money(
                          job.balance
                        )}
                      </td>

                      <td>
                        <Badge
                          tone={getBadgeTone(
                            job.paymentStatus
                          )}
                        >
                          {
                            job.paymentStatus
                          }
                        </Badge>
                      </td>

                      <td align="right">
                        <button
                          className="btn small"
                          type="button"
                          onClick={() => {
                            setSelectedJobId(
                              job.id
                            )

                            setAmount(
                              job.balance.toFixed(
                                2
                              )
                            )

                            window.scrollTo(
                              {
                                top: 0,
                                behavior:
                                  'smooth',
                              }
                            )
                          }}
                        >
                          Pay
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ======================================================
          FOOTER
          ====================================================== */}

      <div
        style={{
          textAlign:
            'center',
          marginTop:
            28,
          marginBottom:
            12,
          opacity:
            0.65,
          fontSize:
            11,
        }}
      >
        Software designed &amp;
        developed by NETVYL Digital
        Resources Global Ltd
      </div>
    </>
  )
}
