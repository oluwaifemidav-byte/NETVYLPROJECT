'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react'

import {
  supabaseBrowser
} from '../../lib/supabase-browser'

import {
  getActiveOrganizationId
} from '../../lib/organization-context'

import {
  PageHead,
  Badge
} from '../../components/ui'

type Expense = {
  id: string
  organization_id: string
  category: string
  expense_date: string
  description: string
  amount: number
  payment_method: string
  reference: string | null
  created_at: string
}

const EXPENSE_CATEGORIES = [
  'Electricity',
  'Rent',
  'Internet',
  'Fuel',
  'Transportation',
  'Salaries',
  'Maintenance',
  'Office Supplies',
  'Equipment',
  'Marketing',
  'Printing Materials',
  'Bank Charges',
  'Delivery',
  'Other'
]

const PAYMENT_METHODS = [
  'Cash',
  'Transfer',
  'POS',
  'Bank',
  'Card',
  'Other'
]

function today() {
  const date = new Date()

  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, '0')

  const day =
    String(
      date.getDate()
    ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function money(
  value:
    | number
    | string
    | null
    | undefined
) {
  return `₦${Number(
    value || 0
  ).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`
}

export default function Expenses() {
  const organizationId =
    getActiveOrganizationId()

  const supabase =
    useMemo(
      () =>
        supabaseBrowser(),
      []
    )

  const [expenses, setExpenses] =
    useState<Expense[]>([])

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')

  const [message, setMessage] =
    useState('')

  const [category, setCategory] =
    useState(
      'Electricity'
    )

  const [expenseDate, setExpenseDate] =
    useState(today())

  const [description, setDescription] =
    useState('')

  const [amount, setAmount] =
    useState('')

  const [paymentMethod, setPaymentMethod] =
    useState('Transfer')

  const [reference, setReference] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [filterCategory, setFilterCategory] =
    useState('All')

  const [filterPayment, setFilterPayment] =
    useState('All')

  const [dateFrom, setDateFrom] =
    useState('')

  const [dateTo, setDateTo] =
    useState('')

  const clearNotice =
    () => {
      setError('')
      setMessage('')
    }

  const loadExpenses =
    useCallback(
      async () => {
        if (!organizationId) {
          setError(
            'No active organization was found.'
          )

          return
        }

        setLoading(true)

        const {
          data,
          error
        } =
          await supabase
            .from('expenses')
            .select(
              `
                id,
                organization_id,
                category,
                expense_date,
                description,
                amount,
                payment_method,
                reference,
                created_at
              `
            )
            .eq(
              'organization_id',
              organizationId
            )
            .order(
              'expense_date',
              {
                ascending: false
              }
            )
            .order(
              'created_at',
              {
                ascending: false
              }
            )

        if (error) {
          setError(
            error.message
          )
        } else {
          setExpenses(
            (data ||
              []) as Expense[]
          )
        }

        setLoading(false)
      },
      [
        organizationId,
        supabase
      ]
    )

  useEffect(() => {
    void loadExpenses()
  }, [loadExpenses])

  const filteredExpenses =
    useMemo(() => {
      const searchText =
        search
          .trim()
          .toLowerCase()

      return expenses.filter(
        expense => {
          const matchesSearch =
            !searchText ||
            [
              expense.category,
              expense.description,
              expense.payment_method,
              expense.reference ||
                ''
            ]
              .join(' ')
              .toLowerCase()
              .includes(
                searchText
              )

          const matchesCategory =
            filterCategory ===
              'All' ||
            expense.category ===
              filterCategory

          const matchesPayment =
            filterPayment ===
              'All' ||
            expense.payment_method ===
              filterPayment

          const matchesFrom =
            !dateFrom ||
            expense.expense_date >=
              dateFrom

          const matchesTo =
            !dateTo ||
            expense.expense_date <=
              dateTo

          return (
            matchesSearch &&
            matchesCategory &&
            matchesPayment &&
            matchesFrom &&
            matchesTo
          )
        }
      )
    }, [
      expenses,
      search,
      filterCategory,
      filterPayment,
      dateFrom,
      dateTo
    ])

  const totalExpense =
    filteredExpenses.reduce(
      (
        total,
        expense
      ) =>
        total +
        Number(
          expense.amount ||
            0
        ),
      0
    )

  const allTimeExpense =
    expenses.reduce(
      (
        total,
        expense
      ) =>
        total +
        Number(
          expense.amount ||
            0
        ),
      0
    )

  const categoryTotals =
    useMemo(() => {
      const totals:
        Record<
          string,
          number
        > = {}

      filteredExpenses.forEach(
        expense => {
          totals[
            expense.category
          ] =
            (totals[
              expense.category
            ] || 0) +
            Number(
              expense.amount ||
                0
            )
        }
      )

      return Object.entries(
        totals
      ).sort(
        (
          a,
          b
        ) =>
          b[1] -
          a[1]
      )
    }, [
      filteredExpenses
    ])

  async function recordExpense() {
    clearNotice()

    if (!organizationId) {
      setError(
        'No active organization was found.'
      )

      return
    }

    const numericAmount =
      Number(amount)

    if (
      !description.trim()
    ) {
      setError(
        'Please enter an expense description.'
      )

      return
    }

    if (
      !Number.isFinite(
        numericAmount
      ) ||
      numericAmount <= 0
    ) {
      setError(
        'Please enter a valid expense amount.'
      )

      return
    }

    if (!expenseDate) {
      setError(
        'Please select an expense date.'
      )

      return
    }

    setSaving(true)

    try {
      const {
        data: {
          user
        }
      } =
        await supabase.auth.getUser()

      const {
        error
      } =
        await supabase
          .from('expenses')
          .insert({
            organization_id:
              organizationId,

            category,

            expense_date:
              expenseDate,

            description:
              description.trim(),

            amount:
              Number(
                numericAmount.toFixed(
                  2
                )
              ),

            payment_method:
              paymentMethod,

            reference:
              reference.trim() ||
              null,

            created_by:
              user?.id ||
              null
          })

      if (error) {
        throw error
      }

      setMessage(
        'Expense recorded successfully.'
      )

      setDescription('')
      setAmount('')
      setReference('')
      setCategory(
        'Electricity'
      )
      setPaymentMethod(
        'Transfer'
      )
      setExpenseDate(
        today()
      )

      await loadExpenses()
    } catch (e: any) {
      setError(
        e?.message ||
        'Unable to record expense.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteExpense(
    id: string
  ) {
    clearNotice()

    const confirmed =
      window.confirm(
        'Delete this expense? This action cannot be undone.'
      )

    if (!confirmed) {
      return
    }

    setSaving(true)

    try {
      const {
        error
      } =
        await supabase
          .from('expenses')
          .delete()
          .eq(
            'id',
            id
          )
          .eq(
            'organization_id',
            organizationId
          )

      if (error) {
        throw error
      }

      setMessage(
        'Expense deleted successfully.'
      )

      await loadExpenses()
    } catch (e: any) {
      setError(
        e?.message ||
        'Unable to delete expense.'
      )
    } finally {
      setSaving(false)
    }
  }

  function resetFilters() {
    setSearch('')
    setFilterCategory(
      'All'
    )
    setFilterPayment(
      'All'
    )
    setDateFrom('')
    setDateTo('')
  }

  function exportCsv() {
    if (
      !filteredExpenses.length
    ) {
      setError(
        'There are no expenses to export.'
      )

      return
    }

    const header = [
      'Date',
      'Category',
      'Description',
      'Payment Method',
      'Reference',
      'Amount'
    ]

    const rows =
      filteredExpenses.map(
        expense => [
          expense.expense_date,
          expense.category,
          expense.description,
          expense.payment_method,
          expense.reference ||
            '',
          Number(
            expense.amount
          ).toFixed(2)
        ]
      )

    const csv = [
      header,
      ...rows
    ]
      .map(
        row =>
          row
            .map(
              value =>
                `"${String(
                  value
                ).replace(
                  /"/g,
                  '""'
                )}"`
            )
            .join(',')
      )
      .join('\n')

    const blob =
      new Blob(
        [csv],
        {
          type:
            'text/csv;charset=utf-8;'
        }
      )

    const url =
      URL.createObjectURL(
        blob
      )

    const link =
      document.createElement(
        'a'
      )

    link.href = url

    link.download =
      `NETVYL-expenses-${today()}.csv`

    link.click()

    URL.revokeObjectURL(
      url
    )
  }

  if (loading) {
    return (
      <>
        <PageHead
          title="Expenses"
          subtitle="Track operating expenses separately from direct job costs."
        />

        <div
          className="card"
          style={{
            marginTop: 18
          }}
        >
          Loading expenses…
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="Expenses"
        subtitle="Track operating expenses separately from direct job costs."
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearNotice()
              void loadExpenses()
            }}
          >
            ↻ Refresh
          </button>
        }
      />

      {(error ||
        message) && (
        <div
          className={`notice ${
            error
              ? 'error'
              : ''
          }`}
          style={{
            marginTop: 14
          }}
        >
          {error ||
            message}
        </div>
      )}

      <div
        className="stats"
        style={{
          marginTop: 18
        }}
      >

        <div className="stat">
          <strong>
            {
              filteredExpenses.length
            }
          </strong>

          <span>
            Filtered expenses
          </span>
        </div>

        <div className="stat">
          <strong>
            {money(
              totalExpense
            )}
          </strong>

          <span>
            Filtered total
          </span>
        </div>

        <div className="stat">
          <strong>
            {
              expenses.length
            }
          </strong>

          <span>
            All recorded expenses
          </span>
        </div>

        <div className="stat">
          <strong>
            {money(
              allTimeExpense
            )}
          </strong>

          <span>
            All-time expense
          </span>
        </div>

      </div>

      <div
        className="workspace-grid"
        style={{
          marginTop: 20,
          alignItems:
            'start'
        }}
      >

        <section
          className="card form-card"
        >

          <div
            className="section-head"
          >

            <div>

              <h3>
                Record expense
              </h3>

              <span>
                Operating expenses reduce business profitability but do not consume job materials.
              </span>

            </div>

          </div>

          <label>
            Category

            <select
              value={
                category
              }
              onChange={e =>
                setCategory(
                  e.target
                    .value
                )
              }
            >

              {EXPENSE_CATEGORIES.map(
                item => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                )
              )}

            </select>

          </label>

          <label
            style={{
              marginTop: 12
            }}
          >
            Date

            <input
              type="date"
              value={
                expenseDate
              }
              onChange={e =>
                setExpenseDate(
                  e.target
                    .value
                )
              }
            />

          </label>

          <label
            style={{
              marginTop: 12
            }}
          >
            Description

            <input
              value={
                description
              }
              onChange={e =>
                setDescription(
                  e.target
                    .value
                )
              }
              placeholder="e.g. Generator fuel"
            />

          </label>

          <label
            style={{
              marginTop: 12
            }}
          >
            Amount

            <input
              type="number"
              min="0"
              step="0.01"
              value={
                amount
              }
              onChange={e =>
                setAmount(
                  e.target
                    .value
                )
              }
              placeholder="₦0.00"
            />

          </label>

          <label
            style={{
              marginTop: 12
            }}
          >
            Payment method

            <select
              value={
                paymentMethod
              }
              onChange={e =>
                setPaymentMethod(
                  e.target
                    .value
                )
              }
            >

              {PAYMENT_METHODS.map(
                item => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                )
              )}

            </select>

          </label>

          <label
            style={{
              marginTop: 12
            }}
          >
            Reference

            <input
              value={
                reference
              }
              onChange={e =>
                setReference(
                  e.target
                    .value
                )
              }
              placeholder="Optional reference"
            />

          </label>

          <button
            type="button"
            className="btn primary wide"
            style={{
              marginTop: 14
            }}
            disabled={
              saving
            }
            onClick={
              recordExpense
            }
          >
            {saving
              ? 'Recording…'
              : 'Record expense'}
          </button>

        </section>

        <section
          className="card"
        >

          <div
            className="section-head"
          >

            <div>

              <h3>
                Expense history
              </h3>

              <span>
                Search, filter and review operating expenses.
              </span>

            </div>

            <button
              type="button"
              className="btn"
              onClick={
                exportCsv
              }
            >
              Export CSV
            </button>

          </div>

          <div
            className="grid2"
            style={{
              marginTop: 15
            }}
          >

            <label>
              Search

              <input
                value={
                  search
                }
                onChange={e =>
                  setSearch(
                    e.target
                      .value
                  )
                }
                placeholder="Search description, category or reference..."
              />
            </label>

            <label>
              Category

              <select
                value={
                  filterCategory
                }
                onChange={e =>
                  setFilterCategory(
                    e.target
                      .value
                  )
                }
              >

                <option value="All">
                  All categories
                </option>

                {EXPENSE_CATEGORIES.map(
                  item => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  )
                )}

              </select>

            </label>

            <label>
              Payment method

              <select
                value={
                  filterPayment
                }
                onChange={e =>
                  setFilterPayment(
                    e.target
                      .value
                  )
                }
              >

                <option value="All">
                  All payment methods
                </option>

                {PAYMENT_METHODS.map(
                  item => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  )
                )}

              </select>

            </label>

            <div
              style={{
                display:
                  'flex',
                alignItems:
                  'end',
                justifyContent:
                  'flex-end'
              }}
            >

              <button
                type="button"
                className="btn"
                onClick={
                  resetFilters
                }
              >
                Reset filters
              </button>

            </div>

          </div>

          <div
            className="grid2"
            style={{
              marginTop: 12
            }}
          >

            <label>
              From date

              <input
                type="date"
                value={
                  dateFrom
                }
                onChange={e =>
                  setDateFrom(
                    e.target
                      .value
                  )
                }
              />

            </label>

            <label>
              To date

              <input
                type="date"
                value={
                  dateTo
                }
                onChange={e =>
                  setDateTo(
                    e.target
                      .value
                  )
                }
              />

            </label>

          </div>

          {filteredExpenses.length ===
          0 ? (
            <div
              className="empty-state"
              style={{
                marginTop: 18,
                minHeight: 220,
                display:
                  'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                flexDirection:
                  'column'
              }}
            >

              <div
                style={{
                  fontSize: 32,
                  opacity: .4
                }}
              >
                ₦
              </div>

              <strong>
                No expenses found
              </strong>

              <span
                style={{
                  marginTop: 5
                }}
              >
                Record your first operating expense on the left.
              </span>

            </div>
          ) : (
            <div
              style={{
                marginTop: 18,
                overflowX:
                  'auto'
              }}
            >

              <table
                style={{
                  width: '100%',
                  borderCollapse:
                    'collapse',
                  minWidth:
                    720
                }}
              >

                <thead>

                  <tr>

                    <th
                      style={{
                        textAlign:
                          'left',
                        padding:
                          '12px 8px',
                        color:
                          'var(--muted)',
                        fontSize:
                          11
                      }}
                    >
                      DATE
                    </th>

                    <th
                      style={{
                        textAlign:
                          'left',
                        padding:
                          '12px 8px',
                        color:
                          'var(--muted)',
                        fontSize:
                          11
                      }}
                    >
                      CATEGORY
                    </th>

                    <th
                      style={{
                        textAlign:
                          'left',
                        padding:
                          '12px 8px',
                        color:
                          'var(--muted)',
                        fontSize:
                          11
                      }}
                    >
                      DESCRIPTION
                    </th>

                    <th
                      style={{
                        textAlign:
                          'left',
                        padding:
                          '12px 8px',
                        color:
                          'var(--muted)',
                        fontSize:
                          11
                      }}
                    >
                      METHOD
                    </th>

                    <th
                      style={{
                        textAlign:
                          'right',
                        padding:
                          '12px 8px',
                        color:
                          'var(--muted)',
                        fontSize:
                          11
                      }}
                    >
                      AMOUNT
                    </th>

                    <th
                      style={{
                        padding:
                          '12px 8px'
                      }}
                    />

                  </tr>

                </thead>

                <tbody>

                  {filteredExpenses.map(
                    expense => (
                      <tr
                        key={
                          expense.id
                        }
                        style={{
                          borderTop:
                            '1px solid var(--line)'
                        }}
                      >

                        <td
                          style={{
                            padding:
                              '13px 8px',
                            fontSize:
                              12
                          }}
                        >
                          {
                            expense.expense_date
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              '13px 8px'
                          }}
                        >

                          <Badge tone="warning">
                            {
                              expense.category
                            }
                          </Badge>

                        </td>

                        <td
                          style={{
                            padding:
                              '13px 8px'
                          }}
                        >

                          <strong
                            style={{
                              display:
                                'block',
                              fontSize:
                                12
                            }}
                          >
                            {
                              expense.description
                            }
                          </strong>

                          {expense.reference && (
                            <small
                              style={{
                                color:
                                  'var(--muted)'
                              }}
                            >
                              Ref:{' '}
                              {
                                expense.reference
                              }
                            </small>
                          )}

                        </td>

                        <td
                          style={{
                            padding:
                              '13px 8px',
                            fontSize:
                              12,
                            color:
                              'var(--muted)'
                          }}
                        >
                          {
                            expense.payment_method
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              '13px 8px',
                            textAlign:
                              'right',
                            fontWeight:
                              700
                          }}
                        >
                          {money(
                            expense.amount
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              '13px 8px',
                            textAlign:
                              'right'
                          }}
                        >

                          <button
                            type="button"
                            className="btn danger small"
                            disabled={
                              saving
                            }
                            onClick={() =>
                              deleteExpense(
                                expense.id
                              )
                            }
                          >
                            Delete
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

      </div>

      {categoryTotals.length >
        0 && (
        <section
          className="card"
          style={{
            marginTop: 20
          }}
        >

          <div
            className="section-head"
          >

            <div>

              <h3>
                Expense breakdown
              </h3>

              <span>
                Spending by category for the current filters.
              </span>

            </div>

          </div>

          <div
            className="services"
            style={{
              marginTop: 15
            }}
          >

            {categoryTotals.map(
              ([
                name,
                value
              ]) => (
                <div
                  key={
                    name
                  }
                  className="service"
                >

                  <div
                    className="num"
                  >
                    CATEGORY
                  </div>

                  <h3>
                    {name}
                  </h3>

                  <strong
                    style={{
                      color:
                        'var(--green2)',
                      fontSize:
                        20
                    }}
                  >
                    {money(
                      value
                    )}
                  </strong>

                </div>
              )
            )}

          </div>

        </section>
      )}

    </>
  )
}