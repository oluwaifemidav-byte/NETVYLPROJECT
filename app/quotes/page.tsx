'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Badge } from '../../components/ui'

type Customer = {
  id: string
  name: string
  phone: string | null
  email: string | null
  address?: string | null
}

type Service = {
  id: string
  name: string
  code: string | null
  category: string | null
  description: string | null
  calculator_type: string
  active: boolean
  sort_order: number
}

type QuoteLine = {
  service_id: string
  service_name: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
}

type Quote = {
  id: string
  organization_id: string
  quote_no: string
  customer_id: string | null
  status: string
  valid_until: string | null
  subtotal: number
  discount: number
  tax: number
  grand_total: number
  notes: string | null
  created_at: string
  updated_at: string
}

const money = (value: number | string | null | undefined) =>
  `₦${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`

const today = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const defaultValidUntil = () => {
  const d = new Date()
  d.setDate(d.getDate() + 7)

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const escapeHtml = (value: any) =>
  String(value ?? '').replace(/[&<>"']/g, character => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }

    return map[character]
  })

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')

  if (!digits) return ''

  if (digits.startsWith('0')) {
    return `234${digits.slice(1)}`
  }

  if (digits.startsWith('234')) {
    return digits
  }

  return digits
}

export default function Quotes() {
  const organizationId = getActiveOrganizationId()

  const supabase = useMemo(
    () => supabaseBrowser(),
    []
  )

  const [customers, setCustomers] = useState<Customer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [quoteLines, setQuoteLines] = useState<
    Record<string, QuoteLine[]>
  >({})

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [customerMode, setCustomerMode] =
    useState<'existing' | 'new'>('existing')

  const [customerSearch, setCustomerSearch] =
    useState('')

  const [customerId, setCustomerId] =
    useState('')

  const [customerName, setCustomerName] =
    useState('')

  const [customerPhone, setCustomerPhone] =
    useState('')

  const [customerEmail, setCustomerEmail] =
    useState('')

  const [serviceId, setServiceId] =
    useState('')

  const [lineDescription, setLineDescription] =
    useState('')

  const [lineQuantity, setLineQuantity] =
    useState('1')

  const [lineUnit, setLineUnit] =
    useState('piece')

  const [lineUnitPrice, setLineUnitPrice] =
    useState('')

  const [validUntil, setValidUntil] =
    useState(defaultValidUntil())

  const [notes, setNotes] =
    useState('')

  const [lines, setLines] =
    useState<QuoteLine[]>([])

  const [expandedQuote, setExpandedQuote] =
    useState<string | null>(null)

  const [historySearch, setHistorySearch] =
    useState('')

  const selectedCustomer = customers.find(
    customer => customer.id === customerId
  )

  const selectedService = services.find(
    service => service.id === serviceId
  )

  const filteredCustomers = useMemo(() => {
    const search = customerSearch
      .trim()
      .toLowerCase()

    if (!search) {
      return customers
    }

    return customers.filter(customer =>
      [
        customer.name,
        customer.phone || '',
        customer.email || ''
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    )
  }, [customers, customerSearch])

  const filteredQuotes = useMemo(() => {
    const search = historySearch
      .trim()
      .toLowerCase()

    if (!search) {
      return quotes
    }

    return quotes.filter(quote => {
      const customer = customers.find(
        item => item.id === quote.customer_id
      )

      return [
        quote.quote_no,
        quote.status,
        customer?.name || '',
        customer?.phone || '',
        customer?.email || ''
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    })
  }, [
    quotes,
    customers,
    historySearch
  ])

  const currentSubtotal = lines.reduce(
    (total, line) =>
      total + Number(line.line_total || 0),
    0
  )

  const currentLineCount = lines.length

  const clearNotice = () => {
    setError('')
    setMessage('')
  }

  const loadCustomers = useCallback(
    async () => {
      if (!organizationId) {
        throw new Error(
          'No active organization was found.'
        )
      }

      const {
        data,
        error
      } = await supabase
        .from('customers')
        .select(
          'id,name,phone,email,address'
        )
        .eq(
          'organization_id',
          organizationId
        )
        .order('name', {
          ascending: true
        })

      if (error) {
        throw error
      }

      setCustomers(
        (data || []) as Customer[]
      )
    },
    [
      organizationId,
      supabase
    ]
  )

  const loadServices = useCallback(
    async () => {
      if (!organizationId) {
        throw new Error(
          'No active organization was found.'
        )
      }

      const {
        data,
        error
      } = await supabase
        .from('business_services')
        .select(
          'id,name,code,category,description,calculator_type,active,sort_order'
        )
        .eq(
          'organization_id',
          organizationId
        )
        .eq('active', true)
        .order('sort_order', {
          ascending: true
        })
        .order('name', {
          ascending: true
        })

      if (error) {
        throw error
      }

      setServices(
        (data || []) as Service[]
      )
    },
    [
      organizationId,
      supabase
    ]
  )

  const loadQuotes = useCallback(
    async () => {
      if (!organizationId) {
        throw new Error(
          'No active organization was found.'
        )
      }

      const {
        data,
        error
      } = await supabase
        .from('quotes')
        .select(
          'id,organization_id,quote_no,customer_id,status,valid_until,subtotal,discount,tax,grand_total,notes,created_at,updated_at'
        )
        .eq(
          'organization_id',
          organizationId
        )
        .order('created_at', {
          ascending: false
        })
        .limit(200)

      if (error) {
        throw error
      }

      setQuotes(
        (data || []) as Quote[]
      )

      const quoteIds = (
        data || []
      ).map(
        (quote: any) => quote.id
      )

      if (!quoteIds.length) {
        setQuoteLines({})
        return
      }

      const {
        data: lineData,
        error: lineError
      } = await supabase
        .from('quote_lines')
        .select(
          'id,quote_id,service_id,description,quantity,unit,unit_price,line_total,specifications'
        )
        .eq(
          'organization_id',
          organizationId
        )
        .in(
          'quote_id',
          quoteIds
        )
        .order('created_at', {
          ascending: true
        })

      if (lineError) {
        throw lineError
      }

      const lineMap: Record<
        string,
        QuoteLine[]
      > = {}

      ;(lineData || []).forEach(
        (line: any) => {
          const service =
            services.find(
              item =>
                item.id ===
                line.service_id
            )

          if (!lineMap[line.quote_id]) {
            lineMap[line.quote_id] = []
          }

          lineMap[line.quote_id].push({
            service_id:
              line.service_id || '',
            service_name:
              service?.name ||
              'Service',
            description:
              line.description || '',
            quantity:
              Number(
                line.quantity || 0
              ),
            unit:
              line.unit ||
              'piece',
            unit_price:
              Number(
                line.unit_price ||
                  0
              ),
            line_total:
              Number(
                line.line_total ||
                  0
              )
          })
        }
      )

      setQuoteLines(lineMap)
    },
    [
      organizationId,
      supabase,
      services
    ]
  )

  const loadAll = useCallback(
    async () => {
      setLoading(true)
      clearNotice()

      try {
        await Promise.all([
          loadCustomers(),
          loadServices()
        ])
      } catch (e: any) {
        setError(
          e?.message ||
          'Unable to load quotation data.'
        )
      } finally {
        setLoading(false)
      }
    },
    [
      loadCustomers,
      loadServices
    ]
  )

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (
      services.length &&
      !serviceId
    ) {
      setServiceId(
        services[0].id
      )

      if (
        services[0].description
      ) {
        setLineDescription(
          services[0].description
        )
      }
    }
  }, [
    services,
    serviceId
  ])

  useEffect(() => {
    if (
      organizationId &&
      services.length
    ) {
      void loadQuotes().catch(
        (e: any) => {
          setError(
            e?.message ||
            'Unable to load quotation history.'
          )
        }
      )
    }
  }, [
    organizationId,
    services,
    loadQuotes
  ])

  function selectExistingCustomer(
    customer: Customer
  ) {
    clearNotice()

    setCustomerId(
      customer.id
    )

    setCustomerName(
      customer.name || ''
    )

    setCustomerPhone(
      customer.phone || ''
    )

    setCustomerEmail(
      customer.email || ''
    )

    setCustomerSearch(
      customer.name || ''
    )
  }

  function switchCustomerMode(
    mode: 'existing' | 'new'
  ) {
    clearNotice()

    setCustomerMode(mode)

    if (mode === 'new') {
      setCustomerId('')
      setCustomerName('')
      setCustomerPhone('')
      setCustomerEmail('')
      setCustomerSearch('')
    } else {
      setCustomerName('')
      setCustomerPhone('')
      setCustomerEmail('')
    }
  }

  function handleServiceChange(
    value: string
  ) {
    clearNotice()

    setServiceId(value)

    const service =
      services.find(
        item => item.id === value
      )

    if (service) {
      setLineDescription(
        service.description ||
          service.name
      )
    } else {
      setLineDescription('')
    }
  }

  function addLine() {
    clearNotice()

    if (!serviceId) {
      setError(
        'Please select a service.'
      )
      return
    }

    const quantity =
      Number(lineQuantity)

    const unitPrice =
      Number(lineUnitPrice)

    if (
      !Number.isFinite(
        quantity
      ) ||
      quantity <= 0
    ) {
      setError(
        'Quantity must be greater than zero.'
      )
      return
    }

    if (
      !Number.isFinite(
        unitPrice
      ) ||
      unitPrice <= 0
    ) {
      setError(
        'Unit price must be greater than zero.'
      )
      return
    }

    if (
      !lineDescription.trim()
    ) {
      setError(
        'Please enter a description.'
      )
      return
    }

    const line: QuoteLine = {
      service_id:
        serviceId,

      service_name:
        selectedService?.name ||
        'Service',

      description:
        lineDescription.trim(),

      quantity,

      unit:
        lineUnit || 'piece',

      unit_price:
        Number(
          unitPrice.toFixed(2)
        ),

      line_total:
        Number(
          (
            quantity *
            unitPrice
          ).toFixed(2)
        )
    }

    setLines(
      previous => [
        ...previous,
        line
      ]
    )

    setLineDescription('')
    setLineQuantity('1')
    setLineUnitPrice('')

    setMessage(
      'Service line added.'
    )
  }

  function removeLine(
    index: number
  ) {
    setLines(previous =>
      previous.filter(
        (_, itemIndex) =>
          itemIndex !== index
      )
    )
  }

  function clearQuotation() {
    setLines([])
    setNotes('')
    setValidUntil(
      defaultValidUntil()
    )
    setServiceId(
      services[0]?.id || ''
    )
    setLineDescription(
      services[0]?.description ||
      services[0]?.name ||
      ''
    )
    setLineQuantity('1')
    setLineUnit('piece')
    setLineUnitPrice('')
    clearNotice()
  }

  async function getOrCreateCustomer() {
    if (!organizationId) {
      throw new Error(
        'No active organization was found.'
      )
    }

    if (
      customerMode ===
      'existing'
    ) {
      if (!customerId) {
        throw new Error(
          'Please select an existing customer.'
        )
      }

      return customerId
    }

    const name =
      customerName.trim()

    if (!name) {
      throw new Error(
        'Customer name is required.'
      )
    }

    const phone =
      customerPhone.trim()

    const email =
      customerEmail.trim()

    const {
      data: existingByName,
      error: searchError
    } = await supabase
      .from('customers')
      .select(
        'id,name,phone,email'
      )
      .eq(
        'organization_id',
        organizationId
      )
      .ilike(
        'name',
        name
      )
      .limit(1)
      .maybeSingle()

    if (searchError) {
      throw searchError
    }

    if (
      existingByName?.id
    ) {
      const updates: Record<
        string,
        any
      > = {}

      if (phone) {
        updates.phone =
          phone
      }

      if (email) {
        updates.email =
          email
      }

      if (
        Object.keys(
          updates
        ).length
      ) {
        await supabase
          .from('customers')
          .update(updates)
          .eq(
            'id',
            existingByName.id
          )
          .eq(
            'organization_id',
            organizationId
          )
      }

      return existingByName.id
    }

    const {
      data,
      error
    } = await supabase
      .from('customers')
      .insert({
        organization_id:
          organizationId,
        name,
        phone:
          phone || null,
        email:
          email || null
      })
      .select('id')
      .single()

    if (error) {
      throw error
    }

    await loadCustomers()

    return data.id
  }

  async function createQuote() {
    clearNotice()

    if (!organizationId) {
      setError(
        'No active organization was found.'
      )
      return
    }

    if (!lines.length) {
      setError(
        'Add at least one service line before creating the quotation.'
      )
      return
    }

    if (
      customerMode ===
      'existing' &&
      !customerId
    ) {
      setError(
        'Please select an existing customer.'
      )
      return
    }

    if (
      customerMode ===
      'new' &&
      !customerName.trim()
    ) {
      setError(
        'Enter the new customer name.'
      )
      return
    }

    setSaving(true)

    try {
      const finalCustomerId =
        await getOrCreateCustomer()

      const quoteNo =
        `QT-${Date.now()
          .toString()
          .slice(-8)}`

      const {
        data: quote,
        error: quoteError
      } = await supabase
        .from('quotes')
        .insert({
          organization_id:
            organizationId,

          quote_no:
            quoteNo,

          customer_id:
            finalCustomerId,

          status:
            'draft',

          valid_until:
            validUntil ||
            null,

          subtotal:
            currentSubtotal,

          discount:
            0,

          tax:
            0,

          grand_total:
            currentSubtotal,

          notes:
            notes.trim() ||
            null
        })
        .select(
          'id,quote_no'
        )
        .single()

      if (quoteError) {
        throw quoteError
      }

      const lineRows =
        lines.map(
          line => ({
            organization_id:
              organizationId,

            quote_id:
              quote.id,

            service_id:
              line.service_id ||
              null,

            description:
              line.description,

            quantity:
              line.quantity,

            unit:
              line.unit,

            unit_price:
              line.unit_price,

            line_total:
              line.line_total,

            specifications:
              {}
          })
        )

      const {
        error: linesError
      } = await supabase
        .from('quote_lines')
        .insert(
          lineRows
        )

      if (linesError) {
        await supabase
          .from('quotes')
          .delete()
          .eq(
            'id',
            quote.id
          )
          .eq(
            'organization_id',
            organizationId
          )

        throw linesError
      }

      setMessage(
        `Quotation ${quote.quote_no} created successfully.`
      )

      setLines([])

      setNotes('')

      setValidUntil(
        defaultValidUntil()
      )

      await loadCustomers()
      await loadQuotes()
    } catch (e: any) {
      setError(
        e?.message ||
        'Unable to create quotation.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function approveQuote(
    quoteId: string
  ) {
    clearNotice()
    setSaving(true)

    try {
      const {
        error
      } = await supabase
        .from('quotes')
        .update({
          status:
            'approved',

          updated_at:
            new Date().toISOString()
        })
        .eq(
          'id',
          quoteId
        )
        .eq(
          'organization_id',
          organizationId
        )

      if (error) {
        throw error
      }

      setMessage(
        'Quotation approved successfully.'
      )

      await loadQuotes()
    } catch (e: any) {
      setError(
        e?.message ||
        'Unable to approve quotation.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteQuote(
    quoteId: string
  ) {
    clearNotice()

    const confirmed =
      window.confirm(
        'Delete this quotation? This will also remove its quotation lines.'
      )

    if (!confirmed) {
      return
    }

    setSaving(true)

    try {
      const {
        error
      } = await supabase
        .from('quotes')
        .delete()
        .eq(
          'id',
          quoteId
        )
        .eq(
          'organization_id',
          organizationId
        )

      if (error) {
        throw error
      }

      setMessage(
        'Quotation deleted.'
      )

      await loadQuotes()
    } catch (e: any) {
      setError(
        e?.message ||
        'Unable to delete quotation.'
      )
    } finally {
      setSaving(false)
    }
  }

  function printQuote(
    quote: Quote
  ) {
    const customer =
      customers.find(
        item =>
          item.id ===
          quote.customer_id
      )

    const linesForQuote =
      quoteLines[
        quote.id
      ] || []

    const html = `
      <!doctype html>

      <html>
        <head>

          <meta charset="utf-8">

          <title>
            ${escapeHtml(
              quote.quote_no
            )}
          </title>

          <style>

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 40px;
              font-family: Arial, Helvetica, sans-serif;
              color: #161616;
              background: white;
            }

            .sheet {
              max-width: 900px;
              margin: auto;
            }

            .top {
              display: flex;
              justify-content: space-between;
              gap: 30px;
              border-bottom: 3px solid #111;
              padding-bottom: 22px;
            }

            .brand h1 {
              margin: 0;
              font-size: 28px;
            }

            .brand p {
              margin: 5px 0 0;
              color: #666;
            }

            .quote-meta {
              text-align: right;
              font-size: 13px;
              line-height: 1.8;
            }

            .customer {
              margin-top: 30px;
              padding: 18px;
              background: #f5f5f5;
              border-radius: 10px;
            }

            .customer strong {
              display: block;
              margin-bottom: 5px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 28px;
            }

            th,
            td {
              padding: 12px 8px;
              border-bottom: 1px solid #ddd;
              text-align: left;
            }

            th {
              background: #f3f3f3;
            }

            .right {
              text-align: right;
            }

            .summary {
              width: 320px;
              margin-left: auto;
              margin-top: 25px;
            }

            .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 7px 0;
            }

            .grand {
              border-top: 2px solid #111;
              padding-top: 12px;
              margin-top: 7px;
              font-size: 20px;
              font-weight: bold;
            }

            .notes {
              margin-top: 30px;
              padding: 18px;
              background: #f5f5f5;
              border-radius: 10px;
              white-space: pre-wrap;
            }

            .footer {
              margin-top: 50px;
              border-top: 1px solid #ddd;
              padding-top: 15px;
              font-size: 12px;
              color: #666;
            }

            @media print {

              body {
                padding: 10px;
              }

              .no-print {
                display: none;
              }

            }

          </style>

        </head>

        <body>

          <div class="sheet">

            <div class="top">

              <div class="brand">

                <h1>
                  NETVYL Digital Resources Global Ltd
                </h1>

                <p>
                  Professional Quotation
                </p>

              </div>

              <div class="quote-meta">

                <strong>
                  ${escapeHtml(
                    quote.quote_no
                  )}
                </strong>

                <br>

                Date:
                ${escapeHtml(
                  new Date(
                    quote.created_at
                  ).toLocaleDateString(
                    'en-NG'
                  )
                )}

                <br>

                Valid until:
                ${escapeHtml(
                  quote.valid_until ||
                  '—'
                )}

              </div>

            </div>

            <div class="customer">

              <strong>
                Customer
              </strong>

              ${escapeHtml(
                customer?.name ||
                'Customer'
              )}

              <br>

              ${escapeHtml(
                customer?.phone ||
                ''
              )}

              ${
                customer?.email
                  ? `<br>${escapeHtml(
                      customer.email
                    )}`
                  : ''
              }

            </div>

            <table>

              <thead>

                <tr>

                  <th>
                    Service
                  </th>

                  <th>
                    Description
                  </th>

                  <th class="right">
                    Qty
                  </th>

                  <th class="right">
                    Unit Price
                  </th>

                  <th class="right">
                    Total
                  </th>

                </tr>

              </thead>

              <tbody>

                ${
                  linesForQuote.length
                    ? linesForQuote
                        .map(
                          line => `
                            <tr>

                              <td>
                                ${escapeHtml(
                                  line.service_name
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  line.description
                                )}
                              </td>

                              <td class="right">
                                ${line.quantity}
                                ${escapeHtml(
                                  line.unit
                                )}
                              </td>

                              <td class="right">
                                ${money(
                                  line.unit_price
                                )}
                              </td>

                              <td class="right">
                                ${money(
                                  line.line_total
                                )}
                              </td>

                            </tr>
                          `
                        )
                        .join('')
                    : `
                        <tr>
                          <td colspan="5">
                            No quotation lines.
                          </td>
                        </tr>
                      `
                }

              </tbody>

            </table>

            <div class="summary">

              <div class="summary-row">

                <span>
                  Subtotal
                </span>

                <strong>
                  ${money(
                    quote.subtotal
                  )}
                </strong>

              </div>

              <div class="summary-row">

                <span>
                  Discount
                </span>

                <strong>
                  ${money(
                    quote.discount
                  )}
                </strong>

              </div>

              <div class="summary-row">

                <span>
                  Tax
                </span>

                <strong>
                  ${money(
                    quote.tax
                  )}
                </strong>

              </div>

              <div class="summary-row grand">

                <span>
                  Grand Total
                </span>

                <strong>
                  ${money(
                    quote.grand_total
                  )}
                </strong>

              </div>

            </div>

            ${
              quote.notes
                ? `
                  <div class="notes">

                    <strong>
                      Notes / Terms
                    </strong>

                    <br><br>

                    ${escapeHtml(
                      quote.notes
                    )}

                  </div>
                `
                : ''
            }

            <div class="footer">

              NETVYL Digital Resources Global Ltd
              <br>

              RC No. 9869835
              <br>

              Professional quotation generated by NETVYL Workspace.

            </div>

          </div>

          <script>

            window.onload = function() {
              window.print()
            }

          </script>

        </body>

      </html>
    `

    const popup =
      window.open(
        '',
        '_blank',
        'width=1000,height=800'
      )

    if (!popup) {
      setError(
        'The browser blocked the print window. Please allow pop-ups for NETVYL.'
      )

      return
    }

    popup.document.open()
    popup.document.write(
      html
    )
    popup.document.close()
  }

  function sendWhatsApp(
    quote: Quote
  ) {
    const customer =
      customers.find(
        item =>
          item.id ===
          quote.customer_id
      )

    if (!customer?.phone) {
      setError(
        'This customer does not have a phone number.'
      )

      return
    }

    const phone =
      normalizePhone(
        customer.phone
      )

    const linesForQuote =
      quoteLines[
        quote.id
      ] || []

    const message = [
      'NETVYL QUOTATION',
      '',
      `Quote No: ${quote.quote_no}`,
      `Customer: ${
        customer.name
      }`,
      '',
      ...linesForQuote.map(
        (
          line,
          index
        ) =>
          `${index + 1}. ${
            line.service_name
          } — ${
            line.description
          } — ${
            line.quantity
          } ${
            line.unit
          } × ${
            money(
              line.unit_price
            )
          } = ${
            money(
              line.line_total
            )
          }`
      ),
      '',
      `TOTAL: ${money(
        quote.grand_total
      )}`,
      `Valid until: ${
        quote.valid_until ||
        '—'
      }`,
      '',
      'NETVYL Digital Resources Global Ltd'
    ].join('\n')

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(
        message
      )}`,
      '_blank'
    )
  }

  function statusTone(
    status: string
  ):
    | 'success'
    | 'warning'
    | 'danger'
    | 'wine' {
    if (
      status ===
      'approved'
    ) {
      return 'success'
    }

    if (
      status ===
      'rejected'
    ) {
      return 'danger'
    }

    if (
      status ===
      'converted'
    ) {
      return 'success'
    }

    return 'warning'
  }

  if (loading) {
    return (
      <>
        <PageHead
          title="Quotes"
          subtitle="Create professional quotations for existing or new customers."
        />

        <div
          className="card"
          style={{
            marginTop: 18
          }}
        >
          Loading quotation workspace…
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="Quotes"
        subtitle="Create professional quotations for existing or new customers."
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              void loadAll()
              void loadQuotes()
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
        className="workspace-grid"
        style={{
          marginTop: 18,
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

              <div
                style={{
                  fontSize: 11,
                  textTransform:
                    'uppercase',
                  letterSpacing:
                    '.14em',
                  color:
                    'var(--muted)',
                  marginBottom:
                    5
                }}
              >
                QUOTATION BUILDER
              </div>

              <h3>
                New quotation
              </h3>

              <span>
                Create a professional quotation for an existing or new customer.
              </span>

            </div>

          </div>

          <div
            className="work-tabs"
            style={{
              marginTop: 18
            }}
          >

            <button
              type="button"
              className={`filter ${
                customerMode ===
                'existing'
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                switchCustomerMode(
                  'existing'
                )
              }
            >
              Existing customer
            </button>

            <button
              type="button"
              className={`filter ${
                customerMode ===
                'new'
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                switchCustomerMode(
                  'new'
                )
              }
            >
              New customer
            </button>

          </div>

          <div
            className="card"
            style={{
              marginBottom: 16,
              padding: 16,
              background:
                'rgba(255,255,255,.018)'
            }}
          >

            {customerMode ===
            'existing' ? (
              <>

                <label>
                  Search existing customer

                  <input
                    value={
                      customerSearch
                    }
                    onChange={e =>
                      setCustomerSearch(
                        e.target
                          .value
                      )
                    }
                    placeholder="Search by customer name, phone or email"
                  />
                </label>

                <label
                  style={{
                    marginTop: 12
                  }}
                >
                  Existing customer

                  <select
                    value={
                      customerId
                    }
                    onChange={e => {
                      const customer =
                        customers.find(
                          item =>
                            item.id ===
                            e.target
                              .value
                        )

                      if (
                        customer
                      ) {
                        selectExistingCustomer(
                          customer
                        )
                      } else {
                        setCustomerId(
                          ''
                        )
                        setCustomerName(
                          ''
                        )
                        setCustomerPhone(
                          ''
                        )
                        setCustomerEmail(
                          ''
                        )
                      }
                    }}
                  >

                    <option value="">
                      Select existing customer
                    </option>

                    {filteredCustomers.map(
                      customer => (
                        <option
                          key={
                            customer.id
                          }
                          value={
                            customer.id
                          }
                        >
                          {
                            customer.name
                          }
                          {customer.phone
                            ? ` · ${customer.phone}`
                            : ''}
                        </option>
                      )
                    )}

                  </select>

                </label>

                {customerId && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 13,
                      border:
                        '1px solid rgba(102,153,52,.25)',
                      background:
                        'rgba(102,153,52,.07)',
                      borderRadius: 12
                    }}
                  >

                    <strong>
                      {selectedCustomer?.name ||
                        customerName}
                    </strong>

                    <div
                      style={{
                        marginTop: 5,
                        color:
                          'var(--muted)',
                        fontSize: 12
                      }}
                    >
                      {customerPhone ||
                        'No phone number'}
                      {' · '}
                      {customerEmail ||
                        'No email address'}
                    </div>

                  </div>
                )}

              </>
            ) : (
              <>

                <div
                  style={{
                    padding: 12,
                    marginBottom: 12,
                    border:
                      '1px solid rgba(255,255,255,.08)',
                    borderRadius: 12,
                    color:
                      'var(--muted)',
                    fontSize: 12
                  }}
                >
                  A new customer will be saved automatically when you create the quotation.
                </div>

                <label>
                  Customer name

                  <input
                    value={
                      customerName
                    }
                    onChange={e =>
                      setCustomerName(
                        e.target
                          .value
                      )
                    }
                    placeholder="Customer or company name"
                  />
                </label>

                <div
                  className="grid2"
                  style={{
                    marginTop: 12
                  }}
                >

                  <label>
                    Customer phone

                    <input
                      value={
                        customerPhone
                      }
                      onChange={e =>
                        setCustomerPhone(
                          e.target
                            .value
                        )
                      }
                      placeholder="080..."
                    />
                  </label>

                  <label>
                    Customer email

                    <input
                      type="email"
                      value={
                        customerEmail
                      }
                      onChange={e =>
                        setCustomerEmail(
                          e.target
                            .value
                        )
                      }
                      placeholder="customer@email.com"
                    />
                  </label>

                </div>

              </>
            )}

          </div>

          <div
            className="grid2"
          >

            <label>
              Quotation date

              <input
                type="date"
                value={today()}
                readOnly
              />
            </label>

            <label>
              Valid until

              <input
                type="date"
                value={
                  validUntil
                }
                min={today()}
                onChange={e =>
                  setValidUntil(
                    e.target
                      .value
                  )
                }
              />
            </label>

          </div>

          <div
            style={{
              marginTop: 24,
              marginBottom: 10,
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
              gap: 10
            }}
          >

            <div>

              <h3
                style={{
                  margin: 0
                }}
              >
                Quotation lines
              </h3>

              <span
                style={{
                  color:
                    'var(--muted)',
                  fontSize: 12
                }}
              >
                Add one or multiple services.
              </span>

            </div>

            <button
              type="button"
              className="btn"
              onClick={
                addLine
              }
            >
              ＋ Add line
            </button>

          </div>

          <div
            className="card"
            style={{
              padding: 16
            }}
          >

            <label>
              Service

              <select
                value={
                  serviceId
                }
                onChange={e =>
                  handleServiceChange(
                    e.target
                      .value
                  )
                }
              >

                <option value="">
                  Select service
                </option>

                {services.map(
                  service => (
                    <option
                      key={
                        service.id
                      }
                      value={
                        service.id
                      }
                    >
                      {
                        service.name
                      }
                      {service.category
                        ? ` · ${service.category}`
                        : ''}
                    </option>
                  )
                )}

              </select>

            </label>

            {!services.length && (
              <div
                className="notice error"
                style={{
                  marginTop: 10
                }}
              >
                No active services are configured for this organization.
              </div>
            )}

            <label
              style={{
                marginTop: 12
              }}
            >
              Description

              <textarea
                value={
                  lineDescription
                }
                onChange={e =>
                  setLineDescription(
                    e.target
                      .value
                  )
                }
                placeholder="Describe exactly what the customer is requesting..."
                style={{
                  minHeight: 85
                }}
              />

            </label>

            <div
              className="grid3"
              style={{
                marginTop: 12
              }}
            >

              <label>
                Quantity

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={
                    lineQuantity
                  }
                  onChange={e =>
                    setLineQuantity(
                      e.target
                        .value
                    )
                  }
                />
              </label>

              <label>
                Unit

                <select
                  value={
                    lineUnit
                  }
                  onChange={e =>
                    setLineUnit(
                      e.target
                        .value
                    )
                  }
                >
                  <option value="piece">
                    Piece
                  </option>

                  <option value="job">
                    Job
                  </option>

                  <option value="sheet">
                    Sheet
                  </option>

                  <option value="sq ft">
                    Sq Ft
                  </option>

                  <option value="ft">
                    Ft
                  </option>

                  <option value="metre">
                    Metre
                  </option>

                  <option value="set">
                    Set
                  </option>

                </select>
              </label>

              <label>
                Unit price

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    lineUnitPrice
                  }
                  onChange={e =>
                    setLineUnitPrice(
                      e.target
                        .value
                    )
                  }
                  placeholder="₦0.00"
                />
              </label>

            </div>

            <button
              type="button"
              className="btn primary wide"
              style={{
                marginTop: 14
              }}
              disabled={
                !serviceId
              }
              onClick={
                addLine
              }
            >
              ＋ Add service to quotation
            </button>

          </div>

          <div
            style={{
              marginTop: 14
            }}
          >

            {lines.map(
              (
                line,
                index
              ) => (
                <div
                  key={`${line.service_id}-${index}`}
                  className="card"
                  style={{
                    padding: 15,
                    marginBottom: 8,
                    background:
                      'rgba(255,255,255,.018)'
                  }}
                >

                  <div
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'space-between',
                      gap: 15
                    }}
                  >

                    <div
                      style={{
                        minWidth: 0
                      }}
                    >

                      <div
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: 8
                        }}
                      >

                        <Badge tone="wine">
                          {index +
                            1}
                        </Badge>

                        <strong>
                          {
                            line.service_name
                          }
                        </strong>

                      </div>

                      <div
                        style={{
                          color:
                            'var(--muted)',
                          fontSize: 12,
                          marginTop: 7
                        }}
                      >
                        {
                          line.description
                        }
                      </div>

                      <div
                        style={{
                          color:
                            'var(--muted)',
                          fontSize: 11,
                          marginTop: 5
                        }}
                      >
                        {
                          line.quantity
                        }{' '}
                        {
                          line.unit
                        }{' '}
                        ×{' '}
                        {money(
                          line.unit_price
                        )}
                      </div>

                    </div>

                    <div
                      style={{
                        textAlign:
                          'right',
                        whiteSpace:
                          'nowrap'
                      }}
                    >

                      <strong
                        style={{
                          display:
                            'block',
                          fontSize:
                            15
                        }}
                      >
                        {money(
                          line.line_total
                        )}
                      </strong>

                      <button
                        type="button"
                        className="linklike"
                        style={{
                          marginTop: 5
                        }}
                        onClick={() =>
                          removeLine(
                            index
                          )
                        }
                      >
                        Remove
                      </button>

                    </div>

                  </div>

                </div>
              )
            )}

          </div>

          {!lines.length && (
            <div
              className="empty-state"
              style={{
                marginTop: 12
              }}
            >
              No quotation lines yet. Select a service and click “Add service to quotation”.
            </div>
          )}

          <div
            className="card"
            style={{
              marginTop: 14,
              padding: 18,
              background:
                'linear-gradient(145deg,rgba(102,153,52,.10),rgba(255,255,255,.025))'
            }}
          >

            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center'
              }}
            >

              <div>

                <small
                  style={{
                    color:
                      'var(--muted)'
                  }}
                >
                  {currentLineCount}{' '}
                  service{' '}
                  {currentLineCount ===
                  1
                    ? 'line'
                    : 'lines'}
                </small>

                <h2
                  style={{
                    margin:
                      '4px 0 0'
                  }}
                >
                  {money(
                    currentSubtotal
                  )}
                </h2>

              </div>

              <span
                style={{
                  color:
                    'var(--muted)',
                  fontSize: 12
                }}
              >
                Grand total
              </span>

            </div>

          </div>

          <label
            style={{
              marginTop: 14
            }}
          >
            Notes / Terms

            <textarea
              value={
                notes
              }
              onChange={e =>
                setNotes(
                  e.target
                    .value
                )
              }
              placeholder="Payment terms, delivery details, artwork requirements, validity conditions..."
              style={{
                minHeight: 100
              }}
            />

          </label>

          <div
            style={{
              display:
                'flex',
              gap: 10,
              marginTop: 14
            }}
          >

            <button
              type="button"
              className="btn primary"
              style={{
                flex: 1
              }}
              disabled={
                saving ||
                !lines.length ||
                (
                  customerMode ===
                  'existing'
                    ? !customerId
                    : !customerName.trim()
                )
              }
              onClick={
                createQuote
              }
            >
              {saving
                ? 'Creating quotation…'
                : 'Create quotation'}
            </button>

            <button
              type="button"
              className="btn"
              disabled={
                saving
              }
              onClick={
                clearQuotation
              }
            >
              Clear
            </button>

          </div>

        </section>

        <section
          className="card"
        >

          <div
            className="section-head"
          >

            <div>

              <div
                style={{
                  fontSize: 11,
                  textTransform:
                    'uppercase',
                  letterSpacing:
                    '.14em',
                  color:
                    'var(--muted)',
                  marginBottom:
                    5
                }}
              >
                QUOTATION HISTORY
              </div>

              <h3>
                Saved quotations
              </h3>

              <span>
                Print, send or approve previously created quotations.
              </span>

            </div>

            <Badge tone="success">
              {quotes.length}{' '}
              QUOTES
            </Badge>

          </div>

          <label
            style={{
              marginTop: 15,
              display:
                'block'
            }}
          >

            Search quotation history

            <input
              value={
                historySearch
              }
              onChange={e =>
                setHistorySearch(
                  e.target
                    .value
                )
              }
              placeholder="Search quote number, customer or status..."
            />

          </label>

          {!filteredQuotes.length ? (
            <div
              className="empty-state"
              style={{
                marginTop: 18,
                minHeight: 180,
                display:
                  'flex',
                flexDirection:
                  'column',
                alignItems:
                  'center',
                justifyContent:
                  'center'
              }}
            >

              <div
                style={{
                  fontSize: 30,
                  opacity: .45,
                  marginBottom: 8
                }}
              >
                ▤
              </div>

              <strong>
                No quotations yet
              </strong>

              <span
                style={{
                  marginTop: 4
                }}
              >
                Create your first quotation on the left.
              </span>

            </div>
          ) : (
            <div
              style={{
                marginTop: 16,
                display:
                  'grid',
                gap: 10
              }}
            >

              {filteredQuotes.map(
                quote => {
                  const customer =
                    customers.find(
                      item =>
                        item.id ===
                        quote.customer_id
                    )

                  const linesForQuote =
                    quoteLines[
                      quote.id
                    ] || []

                  const isExpanded =
                    expandedQuote ===
                    quote.id

                  return (
                    <div
                      key={
                        quote.id
                      }
                      className="card"
                      style={{
                        padding: 16,
                        background:
                          'rgba(255,255,255,.018)'
                      }}
                    >

                      <div
                        style={{
                          display:
                            'flex',
                          justifyContent:
                            'space-between',
                          alignItems:
                            'flex-start',
                          gap: 15
                        }}
                      >

                        <div
                          style={{
                            minWidth: 0
                          }}
                        >

                          <div
                            style={{
                              display:
                                'flex',
                              alignItems:
                                'center',
                              gap: 9,
                              flexWrap:
                                'wrap'
                            }}
                          >

                            <strong>
                              {
                                quote.quote_no
                              }
                            </strong>

                            <Badge
                              tone={statusTone(
                                quote.status
                              )}
                            >
                              {String(
                                quote.status
                              ).toUpperCase()}
                            </Badge>

                          </div>

                          <div
                            style={{
                              marginTop: 7
                            }}
                          >
                            <strong>
                              {
                                customer?.name ||
                                'Customer'
                              }
                            </strong>
                          </div>

                          <div
                            style={{
                              color:
                                'var(--muted)',
                              fontSize: 12,
                              marginTop: 3
                            }}
                          >
                            {customer?.phone ||
                              'No phone'}
                            {' · '}
                            {customer?.email ||
                              'No email'}
                          </div>

                        </div>

                        <div
                          style={{
                            textAlign:
                              'right',
                            whiteSpace:
                              'nowrap'
                          }}
                        >

                          <strong
                            style={{
                              fontSize:
                                16
                            }}
                          >
                            {money(
                              quote.grand_total
                            )}
                          </strong>

                          <div
                            style={{
                              color:
                                'var(--muted)',
                              fontSize: 11,
                              marginTop: 3
                            }}
                          >
                            Valid until{' '}
                            {
                              quote.valid_until ||
                              '—'
                            }
                          </div>

                        </div>

                      </div>

                      <div
                        style={{
                          display:
                            'flex',
                          flexWrap:
                            'wrap',
                          gap: 7,
                          marginTop: 14
                        }}
                      >

                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            setExpandedQuote(
                              isExpanded
                                ? null
                                : quote.id
                            )
                          }
                        >
                          {isExpanded
                            ? 'Hide details'
                            : 'View details'}
                        </button>

                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            printQuote(
                              quote
                            )
                          }
                        >
                          Print / PDF
                        </button>

                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            sendWhatsApp(
                              quote
                            )
                          }
                        >
                          WhatsApp
                        </button>

                        {quote.status !==
                          'approved' &&
                          quote.status !==
                            'converted' && (
                            <button
                              type="button"
                              className="btn primary small"
                              disabled={
                                saving
                              }
                              onClick={() =>
                                approveQuote(
                                  quote.id
                                )
                              }
                            >
                              Approve quotation
                            </button>
                          )}

                        <button
                          type="button"
                          className="btn danger small"
                          disabled={
                            saving
                          }
                          onClick={() =>
                            deleteQuote(
                              quote.id
                            )
                          }
                        >
                          Delete
                        </button>

                      </div>

                      {isExpanded && (
                        <div
                          style={{
                            marginTop: 14,
                            borderTop:
                              '1px solid var(--line)',
                            paddingTop: 14
                          }}
                        >

                          {linesForQuote.length ? (
                            <div
                              style={{
                                display:
                                  'grid',
                                gap: 7
                              }}
                            >

                              {linesForQuote.map(
                                (
                                  line,
                                  index
                                ) => (
                                  <div
                                    key={
                                      index
                                    }
                                    style={{
                                      display:
                                        'flex',
                                      justifyContent:
                                        'space-between',
                                      gap: 15,
                                      padding:
                                        '10px 0',
                                      borderBottom:
                                        '1px solid var(--line)'
                                    }}
                                  >

                                    <div>

                                      <strong
                                        style={{
                                          fontSize:
                                            12
                                        }}
                                      >
                                        {
                                          line.service_name
                                        }
                                      </strong>

                                      <div
                                        style={{
                                          color:
                                            'var(--muted)',
                                          fontSize:
                                            11,
                                          marginTop:
                                            3
                                        }}
                                      >
                                        {
                                          line.description
                                        }
                                      </div>

                                    </div>

                                    <div
                                      style={{
                                        textAlign:
                                          'right',
                                        whiteSpace:
                                          'nowrap'
                                      }}
                                    >

                                      <strong
                                        style={{
                                          fontSize:
                                            12
                                        }}
                                      >
                                        {money(
                                          line.line_total
                                        )}
                                      </strong>

                                      <div
                                        style={{
                                          color:
                                            'var(--muted)',
                                          fontSize:
                                            10
                                        }}
                                      >
                                        {
                                          line.quantity
                                        }{' '}
                                        {
                                          line.unit
                                        }{' '}
                                        ×{' '}
                                        {money(
                                          line.unit_price
                                        )}
                                      </div>

                                    </div>

                                  </div>
                                )
                              )}

                            </div>
                          ) : (
                            <div
                              style={{
                                color:
                                  'var(--muted)',
                                fontSize:
                                  12
                              }}
                            >
                              No quotation line details found.
                            </div>
                          )}

                          {quote.notes && (
                            <div
                              style={{
                                marginTop:
                                  12,
                                padding:
                                  12,
                                borderRadius:
                                  10,
                                background:
                                  'rgba(255,255,255,.035)',
                                color:
                                  'var(--muted)',
                                fontSize:
                                  12,
                                whiteSpace:
                                  'pre-wrap'
                              }}
                            >
                              <strong
                                style={{
                                  color:
                                    'var(--text)'
                                }}
                              >
                                Notes
                              </strong>

                              <br />

                              {
                                quote.notes
                              }
                            </div>
                          )}

                        </div>
                      )}

                    </div>
                  )
                }
              )}

            </div>
          )}

        </section>

      </div>
    </>
  )
}