'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Badge } from '../../components/ui'

type Job = {
  id: string
  job_no: string
  customer_id: string | null
  customer_name_snapshot: string
  job_date: string
  material_name_snapshot: string
  print_cut: boolean
  width: number
  height: number
  qty: number
  unit: string
  billed_sqft: number
  linear_length_ft: number
  production_total: number
  design_charge: number
  grand_total: number
  amount_paid: number
  receipt_no: string | null
  status: string
  deleted_at?: string | null
}

type Payment = {
  id: string
  job_id: string
  receipt_no: string | null
  customer_name_snapshot: string | null
  payment_date: string
  amount: number
  method: string | null
  reference: string | null
  notes: string | null
}

type Organization = {
  name?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  currency?: string
  receipt_footer?: string
}

type ReceiptGroup = {
  key: string
  receiptNo: string
  customerName: string
  customerId: string
  date: string
  jobs: Job[]
  payments: Payment[]
  total: number
  paid: number
  balance: number
  status: 'PAID' | 'PART PAYMENT' | 'UNPAID'
}

const money = (value: unknown) =>
  `₦${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function paymentStatus(
  total: number,
  paid: number
): ReceiptGroup['status'] {
  if (total <= 0) return 'UNPAID'
  if (paid >= total) return 'PAID'
  if (paid > 0) return 'PART PAYMENT'
  return 'UNPAID'
}

function formatDate(value: string) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default function ReceiptsPage() {
  const supabase = useMemo(
    () => supabaseBrowser(),
    []
  )

  const organizationId =
    getActiveOrganizationId()

  const [organization, setOrganization] =
    useState<Organization>({})

  const [jobs, setJobs] =
    useState<Job[]>([])

  const [payments, setPayments] =
    useState<Payment[]>([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [error, setError] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [selectedReceipt, setSelectedReceipt] =
    useState<ReceiptGroup | null>(null)

  const loadReceipts = useCallback(
    async () => {
      if (!organizationId) {
        setError(
          'No active organization was found.'
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
            'name,address,phone,email,website,currency,receipt_footer'
          )
          .eq(
            'id',
            organizationId
          )
          .maybeSingle(),

        /*
         * IMPORTANT:
         * The installed database uses `jobs`.
         * There is NO `job_orders` table.
         */
        supabase
          .from('jobs')
          .select(
            `
            id,
            job_no,
            customer_id,
            customer_name_snapshot,
            job_date,
            material_name_snapshot,
            print_cut,
            width,
            height,
            qty,
            unit,
            billed_sqft,
            linear_length_ft,
            production_total,
            design_charge,
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
          )
          .order(
            'created_at',
            {
              ascending: false,
            }
          ),

        /*
         * Payments are loaded separately because
         * one receipt may contain several payments.
         */
        supabase
          .from('payments')
          .select(
            `
            id,
            job_id,
            receipt_no,
            customer_name_snapshot,
            payment_date,
            amount,
            method,
            reference,
            notes
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
          ),
      ])

      if (organizationResult.error) {
        console.warn(
          'Organization receipt settings:',
          organizationResult.error.message
        )
      }

      if (jobsResult.error) {
        setError(
          `Unable to load receipts: ${jobsResult.error.message}`
        )
        setJobs([])
      } else {
        setJobs(
          (jobsResult.data ||
            []) as Job[]
        )
      }

      if (paymentsResult.error) {
        /*
         * Do not make the entire Receipts page fail
         * if payment history has an RLS/schema issue.
         *
         * Jobs already contain amount_paid.
         */
        console.warn(
          'Payment history:',
          paymentsResult.error.message
        )

        setPayments([])
      } else {
        setPayments(
          (paymentsResult.data ||
            []) as Payment[]
        )
      }

      if (
        organizationResult.data
      ) {
        setOrganization(
          organizationResult.data as Organization
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
    void loadReceipts()
  }, [loadReceipts])

  /*
   * Build receipt groups from the existing jobs table.
   *
   * Multiple jobs can share one receipt number.
   * This preserves the original print-shop behaviour.
   */
  const receipts = useMemo(() => {
    const map =
      new Map<
        string,
        ReceiptGroup
      >()

    for (const job of jobs) {
      const receiptNo =
        job.receipt_no?.trim() ||
        `JOB-${job.job_no}`

      const key =
        receiptNo.toUpperCase()

      if (!map.has(key)) {
        map.set(
          key,
          {
            key,
            receiptNo,
            customerName:
              job.customer_name_snapshot ||
              'Walk-in Customer',
            customerId:
              job.customer_id || '',
            date:
              job.job_date,
            jobs: [],
            payments: [],
            total: 0,
            paid: 0,
            balance: 0,
            status:
              'UNPAID',
          }
        )
      }

      const receipt =
        map.get(key)!

      receipt.jobs.push(job)

      receipt.total +=
        Number(
          job.grand_total || 0
        )

      /*
       * Jobs already contain the synchronized
       * amount_paid value.
       */
      receipt.paid +=
        Number(
          job.amount_paid || 0
        )

      if (
        new Date(
          job.job_date
        ).getTime() >
        new Date(
          receipt.date
        ).getTime()
      ) {
        receipt.date =
          job.job_date
      }
    }

    /*
     * Attach payment history to each receipt.
     */
    for (const payment of payments) {
      const receiptNo =
        payment.receipt_no?.trim()

      if (!receiptNo) continue

      const receipt =
        map.get(
          receiptNo.toUpperCase()
        )

      if (!receipt) continue

      receipt.payments.push(
        payment
      )
    }

    for (const receipt of map.values()) {
      /*
       * Prefer the synchronized amount_paid
       * stored on jobs.
       *
       * If the job amount is unavailable but
       * payment history exists, calculate from
       * payment records.
       */
      if (
        receipt.paid <= 0 &&
        receipt.payments.length > 0
      ) {
        receipt.paid =
          receipt.payments.reduce(
            (sum, payment) =>
              sum +
              Number(
                payment.amount || 0
              ),
            0
          )
      }

      receipt.balance =
        Math.max(
          0,
          receipt.total -
            receipt.paid
        )

      receipt.status =
        paymentStatus(
          receipt.total,
          receipt.paid
        )
    }

    return Array.from(
      map.values()
    ).sort(
      (a, b) =>
        new Date(b.date).getTime() -
        new Date(a.date).getTime()
    )
  }, [
    jobs,
    payments,
  ])

  const filteredReceipts =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase()

      if (!q) {
        return receipts
      }

      return receipts.filter(
        receipt =>
          receipt.receiptNo
            .toLowerCase()
            .includes(q) ||
          receipt.customerName
            .toLowerCase()
            .includes(q) ||
          receipt.customerId
            .toLowerCase()
            .includes(q) ||
          receipt.jobs.some(
            job =>
              job.job_no
                .toLowerCase()
                .includes(q) ||
              job.material_name_snapshot
                .toLowerCase()
                .includes(q)
          )
      )
    }, [
      receipts,
      search,
    ])

  function refresh() {
    setRefreshing(true)
    void loadReceipts()
  }

  function printReceipt(
    receipt: ReceiptGroup
  ) {
    const company =
      organization.name ||
      'NETVYL BUSINESS MANAGEMENT PLATFORM'

    const address =
      organization.address ||
      ''

    const phone =
      organization.phone ||
      ''

    const email =
      organization.email ||
      ''

    const footer =
      organization.receipt_footer ||
      'Thank you for your patronage.'

    const rows =
      receipt.jobs
        .map(
          job => `
            <tr>
              <td>
                ${escapeHtml(
                  job.job_no
                )}
              </td>

              <td>
                ${escapeHtml(
                  job.material_name_snapshot ||
                    'Service'
                )}
                ${
                  job.print_cut
                    ? ' P&amp;C'
                    : ''
                }

                <br>

                <small>
                  ${Number(
                    job.width || 0
                  ).toFixed(2)}
                  ×
                  ${Number(
                    job.height || 0
                  ).toFixed(2)}
                  ${escapeHtml(
                    job.unit ||
                      ''
                  )}
                </small>
              </td>

              <td>
                ${Number(
                  job.qty || 0
                )}
              </td>

              <td class="right">
                ${money(
                  job.grand_total
                )}
              </td>
            </tr>
          `
        )
        .join('')

    const paymentRows =
      receipt.payments.length
        ? receipt.payments
            .map(
              payment => `
                <tr>
                  <td>
                    ${formatDate(
                      payment.payment_date
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      payment.method ||
                        '—'
                    )}
                  </td>

                  <td class="right">
                    ${money(
                      payment.amount
                    )}
                  </td>
                </tr>
              `
            )
            .join('')
        : `
          <tr>
            <td colspan="3">
              No separate payment record available.
            </td>
          </tr>
        `

    const html = `
      <!doctype html>

      <html>
      <head>

        <meta charset="utf-8">

        <title>
          Receipt ${escapeHtml(
            receipt.receiptNo
          )}
        </title>

        <style>

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 30px;
            background: white;
            color: #111;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
          }

          .receipt {
            max-width: 800px;
            margin: 0 auto;
          }

          .center {
            text-align: center;
          }

          h1 {
            margin: 0 0 6px;
            font-size: 24px;
          }

          .subtitle {
            font-size: 13px;
            color: #555;
          }

          .meta {
            margin-top: 18px;
            display: grid;
            grid-template-columns:
              1fr 1fr;
            gap: 8px;
            font-size: 13px;
          }

          hr {
            border: 0;
            border-top:
              1px solid #ddd;
            margin: 18px 0;
          }

          table {
            width: 100%;
            border-collapse:
              collapse;
            margin-top: 12px;
          }

          th,
          td {
            border-bottom:
              1px solid #ddd;
            padding: 9px 7px;
            text-align: left;
            font-size: 13px;
          }

          th {
            background: #f5f5f5;
          }

          .right {
            text-align: right;
          }

          .total {
            display: flex;
            justify-content:
              space-between;
            margin-top: 8px;
            font-size: 14px;
          }

          .grand {
            font-size: 20px;
            font-weight: 700;
            margin-top: 14px;
          }

          .status {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            background: #eee;
            font-weight: 700;
            margin-top: 10px;
          }

          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 12px;
            color: #555;
          }

          @media print {
            body {
              padding: 0;
            }

            .no-print {
              display: none;
            }
          }

        </style>

      </head>

      <body>

        <div class="receipt">

          <div class="center">

            <h1>
              ${escapeHtml(
                company
              )}
            </h1>

            ${
              address
                ? `<div class="subtitle">
                    ${escapeHtml(
                      address
                    )}
                   </div>`
                : ''
            }

            ${
              phone
                ? `<div class="subtitle">
                    ${escapeHtml(
                      phone
                    )}
                   </div>`
                : ''
            }

            ${
              email
                ? `<div class="subtitle">
                    ${escapeHtml(
                      email
                    )}
                   </div>`
                : ''
            }

            <div
              style="
                margin-top:12px;
                font-weight:700;
              "
            >
              CUSTOMER RECEIPT
            </div>

          </div>

          <hr>

          <div class="meta">

            <div>
              <strong>
                Receipt No:
              </strong>
              ${escapeHtml(
                receipt.receiptNo
              )}
            </div>

            <div>
              <strong>
                Date:
              </strong>
              ${formatDate(
                receipt.date
              )}
            </div>

            <div>
              <strong>
                Customer:
              </strong>
              ${escapeHtml(
                receipt.customerName
              )}
            </div>

            <div>
              <strong>
                Jobs:
              </strong>
              ${
                receipt.jobs.length
              }
            </div>

          </div>

          <hr>

          <table>

            <thead>

              <tr>
                <th>
                  Job
                </th>

                <th>
                  Description
                </th>

                <th>
                  Qty
                </th>

                <th class="right">
                  Amount
                </th>
              </tr>

            </thead>

            <tbody>
              ${rows}
            </tbody>

          </table>

          <div
            class="total"
            style="margin-top:18px;"
          >
            <span>
              Grand Total
            </span>

            <strong>
              ${money(
                receipt.total
              )}
            </strong>
          </div>

          <div class="total">

            <span>
              Amount Paid
            </span>

            <strong>
              ${money(
                receipt.paid
              )}
            </strong>

          </div>

          <div class="total">

            <span>
              Balance Due
            </span>

            <strong>
              ${money(
                receipt.balance
              )}
            </strong>

          </div>

          <div class="center">

            <div class="status">
              ${receipt.status}
            </div>

          </div>

          <hr>

          <h3>
            Payment History
          </h3>

          <table>

            <thead>

              <tr>
                <th>
                  Date
                </th>

                <th>
                  Method
                </th>

                <th class="right">
                  Amount
                </th>
              </tr>

            </thead>

            <tbody>
              ${paymentRows}
            </tbody>

          </table>

          <div class="footer">
            ${escapeHtml(
              footer
            )}
          </div>

        </div>

        <script>
          window.onload = function () {
            window.print()
          }
        </script>

      </body>
      </html>
    `

    const printWindow =
      window.open(
        '',
        '_blank',
        'width=900,height=900'
      )

    if (!printWindow) {
      setError(
        'The receipt print window was blocked by the browser. Allow pop-ups for localhost.'
      )
      return
    }

    printWindow.document.open()
    printWindow.document.write(
      html
    )
    printWindow.document.close()
  }

  function openReceipt(
    receipt: ReceiptGroup
  ) {
    setSelectedReceipt(
      receipt
    )
  }

  return (
    <>
      <PageHead
        title="Receipts"
        subtitle="Print receipts from the existing jobs and payments records."
        actions={
          <button
            className="btn"
            onClick={refresh}
            disabled={refreshing}
          >
            ↻ Refresh
          </button>
        }
      />

      <section
        className="card"
        style={{
          marginTop: 18,
        }}
      >

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >

          <input
            style={{
              flex: 1,
              minWidth: 260,
            }}
            value={search}
            onChange={e =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Search receipt, job or customer..."
          />

          <button
            className="btn"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing
              ? 'Refreshing…'
              : '↻ Refresh'}
          </button>

        </div>

        {error && (
          <div
            className="notice"
            style={{
              marginTop: 14,
              borderColor:
                'rgba(220,80,80,.45)',
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div
            className="empty-state"
            style={{
              marginTop: 18,
            }}
          >
            Loading receipts…
          </div>
        ) : (
          <div
            style={{
              overflowX: 'auto',
              marginTop: 18,
            }}
          >

            <table
              style={{
                width: '100%',
                borderCollapse:
                  'collapse',
              }}
            >

              <thead>

                <tr>

                  <th align="left">
                    RECEIPT / ORDER
                  </th>

                  <th align="left">
                    CUSTOMER
                  </th>

                  <th align="left">
                    DATE
                  </th>

                  <th align="left">
                    TYPE
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

                {filteredReceipts.length ===
                  0 && (
                  <tr>

                    <td
                      colSpan={9}
                      style={{
                        padding:
                          30,
                        textAlign:
                          'center',
                      }}
                    >
                      No receipts found.
                    </td>

                  </tr>
                )}

                {filteredReceipts.map(
                  receipt => (
                    <tr
                      key={
                        receipt.key
                      }
                    >

                      <td>
                        <strong>
                          {
                            receipt.receiptNo
                          }
                        </strong>

                        <small
                          style={{
                            display:
                              'block',
                            opacity:
                              0.6,
                            marginTop:
                              3,
                          }}
                        >
                          {
                            receipt.jobs.length
                          }{' '}
                          job
                          {receipt.jobs.length ===
                          1
                            ? ''
                            : 's'}
                        </small>
                      </td>

                      <td>
                        {
                          receipt.customerName
                        }
                      </td>

                      <td>
                        {formatDate(
                          receipt.date
                        )}
                      </td>

                      <td>
                        <Badge tone="neutral">
                          LEGACY JOB
                        </Badge>
                      </td>

                      <td align="right">
                        <strong>
                          {money(
                            receipt.total
                          )}
                        </strong>
                      </td>

                      <td align="right">
                        {money(
                          receipt.paid
                        )}
                      </td>

                      <td
                        align="right"
                        style={{
                          color:
                            receipt.balance >
                            0
                              ? '#ff5d87'
                              : undefined,
                        }}
                      >
                        {money(
                          receipt.balance
                        )}
                      </td>

                      <td>

                        <Badge
                          tone={
                            receipt.status ===
                            'PAID'
                              ? 'success'
                              : receipt.status ===
                                  'PART PAYMENT'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {
                            receipt.status
                          }
                        </Badge>

                      </td>

                      <td align="right">

                        <button
                          className="btn small"
                          onClick={() =>
                            openReceipt(
                              receipt
                            )
                          }
                        >
                          View
                        </button>

                        <button
                          className="btn small"
                          style={{
                            marginLeft:
                              6,
                          }}
                          onClick={() =>
                            printReceipt(
                              receipt
                            )
                          }
                        >
                          Print receipt
                        </button>

                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>
        )}

      </section>

      {selectedReceipt && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setSelectedReceipt(
              null
            )
          }
        >

          <section
            className="modal card"
            style={{
              maxWidth: 900,
              width: '95%',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
            }}
            onClick={e =>
              e.stopPropagation()
            }
          >

            <div className="section-head">

              <div>
                <h3>
                  Receipt
                </h3>

                <span>
                  {
                    selectedReceipt.receiptNo
                  }
                </span>
              </div>

              <div
                style={{
                  display:
                    'flex',
                  gap: 8,
                }}
              >

                <button
                  className="btn primary"
                  onClick={() =>
                    printReceipt(
                      selectedReceipt
                    )
                  }
                >
                  Print Receipt
                </button>

                <button
                  className="btn"
                  onClick={() =>
                    setSelectedReceipt(
                      null
                    )
                  }
                >
                  Close
                </button>

              </div>

            </div>

            <div
              style={{
                marginTop: 18,
                padding: 24,
                background:
                  '#fff',
                color: '#111',
                borderRadius: 12,
              }}
            >

              <div
                style={{
                  textAlign:
                    'center',
                }}
              >

                <h2
                  style={{
                    margin:
                      '0 0 6px',
                  }}
                >
                  {
                    organization.name ||
                    'NETVYL BUSINESS MANAGEMENT PLATFORM'
                  }
                </h2>

                {organization.address && (
                  <div>
                    {
                      organization.address
                    }
                  </div>
                )}

                {organization.phone && (
                  <div>
                    {
                      organization.phone
                    }
                  </div>
                )}

                <strong
                  style={{
                    display:
                      'block',
                    marginTop:
                      12,
                  }}
                >
                  CUSTOMER RECEIPT
                </strong>

              </div>

              <hr />

              <div
                style={{
                  display:
                    'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 8,
                  fontSize:
                    13,
                }}
              >

                <div>
                  <strong>
                    Receipt:
                  </strong>{' '}
                  {
                    selectedReceipt.receiptNo
                  }
                </div>

                <div>
                  <strong>
                    Date:
                  </strong>{' '}
                  {formatDate(
                    selectedReceipt.date
                  )}
                </div>

                <div>
                  <strong>
                    Customer:
                  </strong>{' '}
                  {
                    selectedReceipt.customerName
                  }
                </div>

                <div>
                  <strong>
                    Jobs:
                  </strong>{' '}
                  {
                    selectedReceipt.jobs.length
                  }
                </div>

              </div>

              <hr />

              <table
                style={{
                  width: '100%',
                  borderCollapse:
                    'collapse',
                }}
              >

                <thead>
                  <tr>
                    <th align="left">
                      Job
                    </th>

                    <th align="left">
                      Description
                    </th>

                    <th align="right">
                      Qty
                    </th>

                    <th align="right">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>

                  {selectedReceipt.jobs.map(
                    job => (
                      <tr
                        key={
                          job.id
                        }
                      >

                        <td>
                          {
                            job.job_no
                          }
                        </td>

                        <td>
                          {
                            job.material_name_snapshot
                          }

                          {job.print_cut
                            ? ' P&C'
                            : ''}

                          <small
                            style={{
                              display:
                                'block',
                              opacity:
                                0.6,
                            }}
                          >
                            {
                              job.width
                            }{' '}
                            ×{' '}
                            {
                              job.height
                            }{' '}
                            {
                              job.unit
                            }
                          </small>
                        </td>

                        <td align="right">
                          {
                            job.qty
                          }
                        </td>

                        <td align="right">
                          {money(
                            job.grand_total
                          )}
                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

              <hr />

              <div
                style={{
                  maxWidth:
                    400,
                  marginLeft:
                    'auto',
                }}
              >

                <div
                  className="order-total"
                >
                  <span>
                    Grand Total
                  </span>

                  <strong>
                    {money(
                      selectedReceipt.total
                    )}
                  </strong>
                </div>

                <div
                  className="order-total"
                >
                  <span>
                    Amount Paid
                  </span>

                  <strong>
                    {money(
                      selectedReceipt.paid
                    )}
                  </strong>
                </div>

                <div
                  className="order-total"
                >
                  <span>
                    Balance
                  </span>

                  <strong>
                    {money(
                      selectedReceipt.balance
                    )}
                  </strong>
                </div>

              </div>

              <div
                style={{
                  textAlign:
                    'center',
                  marginTop:
                    18,
                }}
              >
                <Badge
                  tone={
                    selectedReceipt.status ===
                    'PAID'
                      ? 'success'
                      : selectedReceipt.status ===
                          'PART PAYMENT'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {
                    selectedReceipt.status
                  }
                </Badge>
              </div>

              <hr />

              <h3>
                Payment History
              </h3>

              {selectedReceipt.payments.length ===
              0 ? (
                <div
                  style={{
                    fontSize:
                      13,
                    opacity:
                      0.65,
                  }}
                >
                  No separate payment
                  transactions were found
                  for this receipt.
                </div>
              ) : (
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
                        Date
                      </th>

                      <th align="left">
                        Method
                      </th>

                      <th align="left">
                        Reference
                      </th>

                      <th align="right">
                        Amount
                      </th>
                    </tr>
                  </thead>

                  <tbody>

                    {selectedReceipt.payments.map(
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

                          <td align="right">
                            {money(
                              payment.amount
                            )}
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>
              )}

              <div
                style={{
                  textAlign:
                    'center',
                  marginTop:
                    24,
                  fontSize:
                    12,
                  opacity:
                    0.65,
                }}
              >
                {
                  organization.receipt_footer ||
                  'Thank you for your patronage.'
                }
              </div>

            </div>

          </section>

        </div>
      )}

      <div
        style={{
          textAlign:
            'center',
          marginTop:
            24,
          marginBottom:
            10,
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
