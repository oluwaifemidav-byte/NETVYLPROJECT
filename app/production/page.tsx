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
  customer_name_snapshot: string | null
  job_date: string | null
  material_id: string | null
  material_name_snapshot: string | null
  print_cut: boolean | null
  width: number | null
  height: number | null
  qty: number | null
  unit: string | null
  billed_sqft: number | null
  linear_length_ft: number | null
  production_total: number | null
  design_charge: number | null
  grand_total: number | null
  amount_paid: number | null
  receipt_no: string | null
  status: string | null
  created_at?: string | null
  updated_at?: string | null
  deleted_at?: string | null
}

type QueueRow = {
  id: string
  organization_id: string
  job_id: string
  status: string
  created_at?: string | null
  updated_at?: string | null
}

type ProductionJob = Job & {
  queue_id: string | null
  production_status: string
}

const STATUS_OPTIONS = [
  {
    value: 'pending',
    label: 'NEW',
  },
  {
    value: 'printing',
    label: 'PRINTING',
  },
  {
    value: 'finishing',
    label: 'FINISHING',
  },
  {
    value: 'completed',
    label: 'READY / COMPLETED',
  },
  {
    value: 'cancelled',
    label: 'CANCELLED',
  },
]

function money(
  value: number | null | undefined
) {
  return `₦${Number(
    value || 0
  ).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`
}

function formatDate(
  value: string | null | undefined
) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
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

function normalizeStatus(
  value: string | null | undefined
) {
  const status = String(
    value || 'pending'
  )
    .toLowerCase()
    .trim()

  if (
    status === 'printing' ||
    status === 'finishing' ||
    status === 'completed' ||
    status === 'cancelled'
  ) {
    return status
  }

  return 'pending'
}

function statusLabel(
  value: string
) {
  const option =
    STATUS_OPTIONS.find(
      item =>
        item.value ===
        value
    )

  return (
    option?.label ||
    value.toUpperCase()
  )
}

function statusTone(
  value: string
) {
  if (
    value === 'completed'
  ) {
    return 'success' as const
  }

  if (
    value === 'finishing'
  ) {
    return 'warning' as const
  }

  if (
    value === 'cancelled'
  ) {
    return 'danger' as const
  }

  return 'neutral' as const
}

function dimensions(
  job: Job
) {
  const width =
    Number(
      job.width || 0
    )

  const height =
    Number(
      job.height || 0
    )

  if (
    width > 0 &&
    height > 0
  ) {
    return `${width} × ${height} ${
      job.unit || 'ft'
    }`
  }

  return '—'
}

function quantity(
  job: Job
) {
  const qty =
    Number(
      job.qty || 0
    )

  if (
    Number.isInteger(qty)
  ) {
    return String(qty)
  }

  return qty.toFixed(2)
}

export default function ProductionPage() {
  const supabase =
    useMemo(
      () =>
        supabaseBrowser(),
      []
    )

  const organizationId =
    getActiveOrganizationId()

  const [jobs, setJobs] =
    useState<
      ProductionJob[]
    >([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [error, setError] =
    useState('')

  const [message, setMessage] =
    useState('')

  const [updatingJobId, setUpdatingJobId] =
    useState<
      string | null
    >(null)

  const [search, setSearch] =
    useState('')

  const [statusFilter, setStatusFilter] =
    useState('all')

  /*
   * ==========================================================
   * LOAD JOBS + PRODUCTION QUEUE
   * ==========================================================
   *
   * IMPORTANT:
   *
   * The current database does NOT use job_lines.
   *
   * Production is based on:
   *
   *   jobs
   *   print_queue
   *
   * The jobs table contains the commercial/job information.
   * The print_queue table contains the production state.
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
      setMessage('')

      const [
        jobsResult,
        queueResult,
      ] = await Promise.all([
        supabase
          .from('jobs')
          .select(
            `
              id,
              job_no,
              customer_id,
              customer_name_snapshot,
              job_date,
              material_id,
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
              created_at,
              updated_at,
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
            'created_at',
            {
              ascending:
                false,
            }
          ),

        supabase
          .from('print_queue')
          .select(
            `
              id,
              organization_id,
              job_id,
              status,
              created_at,
              updated_at
            `
          )
          .eq(
            'organization_id',
            organizationId
          )
          .order(
            'created_at',
            {
              ascending:
                true,
            }
          ),
      ])

      if (
        jobsResult.error
      ) {
        setError(
          `Jobs: ${jobsResult.error.message}`
        )

        setJobs([])
        setLoading(false)
        setRefreshing(false)

        return
      }

      if (
        queueResult.error
      ) {
        setError(
          `Production queue: ${queueResult.error.message}`
        )

        setJobs([])
        setLoading(false)
        setRefreshing(false)

        return
      }

      const loadedJobs =
        (jobsResult.data ||
          []) as Job[]

      const loadedQueue =
        (queueResult.data ||
          []) as QueueRow[]

      /*
       * Create lookup:
       *
       * job ID → print queue row
       */

      const queueMap =
        new Map<
          string,
          QueueRow
        >()

      loadedQueue.forEach(
        queue => {
          queueMap.set(
            queue.job_id,
            queue
          )
        }
      )

      /*
       * Combine the job record with
       * its production queue status.
       */

      const combined =
        loadedJobs.map(
          job => {
            const queue =
              queueMap.get(
                job.id
              )

            /*
             * Prefer print_queue.status.
             *
             * If an old job does not have
             * a queue row, use jobs.status.
             */

            const productionStatus =
              normalizeStatus(
                queue?.status ||
                  job.status
              )

            return {
              ...job,
              queue_id:
                queue?.id ||
                null,
              production_status:
                productionStatus,
            }
          }
        )

      setJobs(
        combined
      )

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
   * ==========================================================
   * FILTER
   * ==========================================================
   */

  const filteredJobs =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase()

      return jobs.filter(
        job => {
          if (
            statusFilter !==
              'all' &&
            job.production_status !==
              statusFilter
          ) {
            return false
          }

          if (!query) {
            return true
          }

          const searchable =
            [
              job.job_no,
              job.customer_name_snapshot,
              job.material_name_snapshot,
              job.receipt_no,
            ]
              .map(
                value =>
                  String(
                    value || ''
                  ).toLowerCase()
              )
              .join(' ')

          return searchable.includes(
            query
          )
        }
      )
    }, [
      jobs,
      search,
      statusFilter,
    ])

  /*
   * ==========================================================
   * BOARD GROUPS
   * ==========================================================
   */

  const newJobs =
    filteredJobs.filter(
      job =>
        job.production_status ===
        'pending'
    )

  const printingJobs =
    filteredJobs.filter(
      job =>
        job.production_status ===
        'printing'
    )

  const finishingJobs =
    filteredJobs.filter(
      job =>
        job.production_status ===
        'finishing'
    )

  const readyJobs =
    filteredJobs.filter(
      job =>
        job.production_status ===
        'completed'
    )

  const cancelledJobs =
    filteredJobs.filter(
      job =>
        job.production_status ===
        'cancelled'
    )

  /*
   * ==========================================================
   * UPDATE PRODUCTION STATUS
   * ==========================================================
   */

  async function updateStatus(
    job: ProductionJob,
    newStatus: string
  ) {
    if (
      !organizationId ||
      updatingJobId
    ) {
      return
    }

    setError('')
    setMessage('')
    setUpdatingJobId(
      job.id
    )

    try {
      /*
       * Existing queue row:
       * update it.
       */

      if (job.queue_id) {
        const {
          error:
            queueError,
        } =
          await supabase
            .from(
              'print_queue'
            )
            .update({
              status:
                newStatus,
              updated_at:
                new Date().toISOString(),
            })
            .eq(
              'id',
              job.queue_id
            )
            .eq(
              'organization_id',
              organizationId
            )

        if (queueError) {
          throw new Error(
            queueError.message
          )
        }
      } else {
        /*
         * Older jobs may not yet have
         * a print_queue row.
         *
         * Create it automatically.
         */

        const {
          data:
            createdQueue,
          error:
            insertError,
        } =
          await supabase
            .from(
              'print_queue'
            )
            .insert({
              organization_id:
                organizationId,
              job_id:
                job.id,
              status:
                newStatus,
            })
            .select(
              'id,organization_id,job_id,status'
            )
            .single()

        if (insertError) {
          throw new Error(
            insertError.message
          )
        }

        if (
          createdQueue?.id
        ) {
          setJobs(
            current =>
              current.map(
                item =>
                  item.id ===
                  job.id
                    ? {
                        ...item,
                        queue_id:
                          createdQueue.id,
                        production_status:
                          newStatus,
                      }
                    : item
              )
          )
        }
      }

      /*
       * Keep jobs.status synchronized.
       *
       * The existing database already uses
       * jobs.status for production state.
       */

      const {
        error:
          jobError,
      } =
        await supabase
          .from('jobs')
          .update({
            status:
              newStatus,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            job.id
          )
          .eq(
            'organization_id',
            organizationId
          )

      if (jobError) {
        throw new Error(
          jobError.message
        )
      }

      setMessage(
        `${job.job_no} moved to ${statusLabel(
          newStatus
        )}.`
      )

      await load()
    } catch (
      err: any
    ) {
      setError(
        err?.message ||
          'Unable to update production status.'
      )
    } finally {
      setUpdatingJobId(
        null
      )
    }
  }

  /*
   * ==========================================================
   * REFRESH
   * ==========================================================
   */

  function refresh() {
    setRefreshing(true)
    void load()
  }

  /*
   * ==========================================================
   * JOB CARD
   * ==========================================================
   */

  function JobCard({
    job,
  }: {
    job: ProductionJob
  }) {
    return (
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems:
              'flex-start',
            gap: 10,
          }}
        >
          <div>
            <strong
              style={{
                fontSize: 16,
              }}
            >
              {job.job_no}
            </strong>

            <div
              style={{
                marginTop: 6,
                fontWeight: 600,
              }}
            >
              {job.customer_name_snapshot ||
                'Walk-in customer'}
            </div>
          </div>

          <Badge
            tone={statusTone(
              job.production_status
            )}
          >
            {statusLabel(
              job.production_status
            )}
          </Badge>
        </div>

        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gap: 8,
            fontSize: 12,
          }}
        >
          <div>
            <span
              style={{
                opacity: 0.6,
              }}
            >
              Material:
            </span>{' '}
            {job.material_name_snapshot ||
              '—'}
          </div>

          <div>
            <span
              style={{
                opacity: 0.6,
              }}
            >
              Size:
            </span>{' '}
            {dimensions(
              job
            )}
          </div>

          <div>
            <span
              style={{
                opacity: 0.6,
              }}
            >
              Quantity:
            </span>{' '}
            {quantity(job)}
          </div>

          <div>
            <span
              style={{
                opacity: 0.6,
              }}
            >
              Job date:
            </span>{' '}
            {formatDate(
              job.job_date
            )}
          </div>

          <div>
            <span
              style={{
                opacity: 0.6,
              }}
            >
              Job value:
            </span>{' '}
            {money(
              job.grand_total
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
          }}
        >
          <label>
            <span>
              Production status
            </span>

            <select
              value={
                job.production_status
              }
              disabled={
                updatingJobId ===
                job.id
              }
              onChange={e =>
                void updateStatus(
                  job,
                  e.target.value
                )
              }
            >
              {STATUS_OPTIONS.map(
                option => (
                  <option
                    key={
                      option.value
                    }
                    value={
                      option.value
                    }
                  >
                    {
                      option.label
                    }
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 7,
            marginTop: 10,
          }}
        >
          {job.production_status !==
            'printing' && (
            <button
              type="button"
              className="btn small"
              disabled={
                updatingJobId ===
                job.id
              }
              onClick={() =>
                void updateStatus(
                  job,
                  'printing'
                )
              }
            >
              → PRINTING
            </button>
          )}

          {job.production_status !==
            'finishing' && (
            <button
              type="button"
              className="btn small"
              disabled={
                updatingJobId ===
                job.id
              }
              onClick={() =>
                void updateStatus(
                  job,
                  'finishing'
                )
              }
            >
              → FINISHING
            </button>
          )}

          {job.production_status !==
            'completed' && (
            <button
              type="button"
              className="btn small"
              disabled={
                updatingJobId ===
                job.id
              }
              onClick={() =>
                void updateStatus(
                  job,
                  'completed'
                )
              }
            >
              → READY
            </button>
          )}
        </div>
      </div>
    )
  }

  /*
   * ==========================================================
   * BOARD COLUMN
   * ==========================================================
   */

  function BoardColumn({
    title,
    jobs: columnJobs,
    borderColor,
  }: {
    title: string
    jobs: ProductionJob[]
    borderColor: string
  }) {
    return (
      <section
        style={{
          minWidth: 285,
          flex:
            '1 1 285px',
        }}
      >
        <div
          className="card"
          style={{
            padding:
              '14px 16px',
            marginBottom: 12,
            borderColor:
              borderColor,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
            }}
          >
            <strong>
              {title}
            </strong>

            <span
              style={{
                opacity: 0.65,
                fontSize: 12,
              }}
            >
              {
                columnJobs.length
              }
            </span>
          </div>
        </div>

        {columnJobs.length ===
        0 ? (
          <div
            className="empty-state"
            style={{
              padding: 24,
            }}
          >
            No jobs
          </div>
        ) : (
          columnJobs.map(
            job => (
              <JobCard
                key={
                  job.id
                }
                job={job}
              />
            )
          )
        )}
      </section>
    )
  }

  /*
   * ==========================================================
   * PAGE
   * ==========================================================
   */

  return (
    <>
      <PageHead
        title="Production"
        subtitle="Live production board for jobs created by this organization."
        actions={
          <button
            className="btn"
            type="button"
            onClick={
              refresh
            }
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

      <section
        className="card"
        style={{
          marginTop: 18,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(0, 2fr) minmax(220px, 1fr)',
            gap: 14,
          }}
        >
          <label>
            <span>
              Search production
            </span>

            <input
              value={
                search
              }
              onChange={e =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Search job, customer, material..."
            />
          </label>

          <label>
            <span>
              Status
            </span>

            <select
              value={
                statusFilter
              }
              onChange={e =>
                setStatusFilter(
                  e.target.value
                )
              }
            >
              <option value="all">
                All statuses
              </option>

              {STATUS_OPTIONS.map(
                option => (
                  <option
                    key={
                      option.value
                    }
                    value={
                      option.value
                    }
                  >
                    {
                      option.label
                    }
                  </option>
                )
              )}
            </select>
          </label>
        </div>
      </section>

      <div
        className="grid3"
        style={{
          marginTop: 18,
        }}
      >
        <div className="card">
          <small>
            Total production jobs
          </small>

          <h2
            style={{
              margin:
                '8px 0 0',
            }}
          >
            {
              filteredJobs.length
            }
          </h2>
        </div>

        <div className="card">
          <small>
            Currently printing
          </small>

          <h2
            style={{
              margin:
                '8px 0 0',
            }}
          >
            {
              printingJobs.length
            }
          </h2>
        </div>

        <div className="card">
          <small>
            Finishing
          </small>

          <h2
            style={{
              margin:
                '8px 0 0',
            }}
          >
            {
              finishingJobs.length
            }
          </h2>
        </div>
      </div>

      {loading ? (
        <div
          className="card"
          style={{
            marginTop: 18,
            padding: 45,
            textAlign:
              'center',
          }}
        >
          Loading production board…
        </div>
      ) : filteredJobs.length ===
        0 ? (
        <div
          className="empty-state"
          style={{
            marginTop: 18,
            padding: 50,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Production queue is clear
          </div>

          <div>
            {search ||
            statusFilter !==
              'all'
              ? 'No jobs match the current search or status filter.'
              : 'New jobs created by this organization will appear here automatically.'}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 16,
            overflowX:
              'auto',
            alignItems:
              'flex-start',
            marginTop: 18,
            paddingBottom:
              15,
          }}
        >
          <BoardColumn
            title="NEW"
            jobs={newJobs}
            borderColor="rgba(80,150,255,.45)"
          />

          <BoardColumn
            title="PRINTING"
            jobs={
              printingJobs
            }
            borderColor="rgba(255,165,60,.45)"
          />

          <BoardColumn
            title="FINISHING"
            jobs={
              finishingJobs
            }
            borderColor="rgba(190,90,255,.45)"
          />

          <BoardColumn
            title="READY / COMPLETED"
            jobs={
              readyJobs
            }
            borderColor="rgba(60,205,130,.45)"
          />

          <BoardColumn
            title="CANCELLED"
            jobs={
              cancelledJobs
            }
            borderColor="rgba(220,70,90,.45)"
          />
        </div>
      )}

      <div
        style={{
          textAlign:
            'center',
          marginTop: 30,
          marginBottom: 12,
          opacity: 0.65,
          fontSize: 11,
        }}
      >
        Software designed &amp;
        developed by NETVYL Digital
        Resources Global Ltd
      </div>
    </>
  )
}
