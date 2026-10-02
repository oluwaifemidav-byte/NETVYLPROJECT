'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Badge, Money, Empty } from '../../components/ui'

type InventoryItem = {
  id: string
  organization_id: string
  name: string
  sku: string | null
  category: string | null
  item_kind: string | null
  base_unit: string | null
  cost_per_unit: number | null
  sell_price: number | null
  current_stock: number | null
  initial_stock: number | null
  reorder_level: number | null
  metadata: Record<string, any> | null
  active: boolean | null
  created_at: string | null
  updated_at: string | null
}

type Material = {
  id: string
  name: string
  base_name: string | null
  price_per_sqft: number | null
  roll_width_ft: number | null
  initial_length_ft: number | null
  current_length_ft: number | null
  active: boolean | null
}

type FormState = {
  name: string
  sku: string
  category: string
  item_kind: string
  base_unit: string
  cost_per_unit: string
  sell_price: string
  di_base_price: string
  dtf_a4_price: string
  dtf_a3_price: string
  dtf_a2_price: string
  dtf_roll_type: string
  current_stock: string
  initial_stock: string
  stock_add: string
  stock_remove: string
  reorder_level: string
  roll_width_ft: string
  base_name: string
}

const EMPTY_FORM: FormState = {
  name: '',
  sku: '',
  category: 'Large Format',
  item_kind: 'material',
  base_unit: 'ft',
  cost_per_unit: '0',
  sell_price: '0',
  di_base_price: '0',
  dtf_a4_price: '1000',
  dtf_a3_price: '1600',
  dtf_a2_price: '3200',
  dtf_roll_type: 'A3',
  current_stock: '0',
  initial_stock: '0',
  stock_add: '0',
  stock_remove: '0',
  reorder_level: '5',
  roll_width_ft: '0',
  base_name: '',
}

const MATERIAL_TEMPLATES = [
  {
    value: 'Large Format',
    label: 'Large Format',
    baseUnit: 'ft',
    itemKind: 'material',
    showRollWidth: true,
    showBaseMaterial: true,
    showDiBasePrice: false,
    showDtfPricing: false,
  },
  {
    value: 'Direct Image',
    label: 'Direct Image',
    baseUnit: 'pcs',
    itemKind: 'material',
    showRollWidth: false,
    showBaseMaterial: false,
    showDiBasePrice: true,
    showDtfPricing: false,
  },
  {
    value: 'DTF',
    label: 'DTF',
    baseUnit: 'ft',
    itemKind: 'material',
    showRollWidth: false,
    showBaseMaterial: false,
    showDiBasePrice: false,
    showDtfPricing: true,
  },
  {
    value: 'Finishing',
    label: 'Finishing',
    baseUnit: 'pcs',
    itemKind: 'supply',
    showRollWidth: false,
    showBaseMaterial: false,
    showDiBasePrice: false,
    showDtfPricing: false,
  },
  {
    value: 'Garment',
    label: 'Garment',
    baseUnit: 'pcs',
    itemKind: 'garment',
    showRollWidth: false,
    showBaseMaterial: false,
    showDiBasePrice: false,
    showDtfPricing: false,
  },
  {
    value: 'General',
    label: 'General',
    baseUnit: 'pcs',
    itemKind: 'material',
    showRollWidth: false,
    showBaseMaterial: false,
    showDiBasePrice: false,
    showDtfPricing: false,
  },
] as const

const UNLOCK_KEY = 'netvyl_admin_unlocked'

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveInventoryServiceType(value: string) {
  const normalized = `${value || ''}`.trim().toLowerCase()

  if (!normalized) return null

  if (/\bdtf\b/.test(normalized)) return 'dtf'
  if (/direct image|direct-image|\bdi printing\b|^di$/.test(normalized)) return 'direct_image'
  if (/large format|large-format|vinyl|flex|banner|sav|backlit|window|reflective/.test(normalized)) return 'large_format'
  return null
}

function isUnlocked() {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(UNLOCK_KEY) === 'true'
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString('en-NG', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export default function InventoryPage() {
  const organizationId = getActiveOrganizationId()
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [items, setItems] = useState<InventoryItem[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [serviceTypes, setServiceTypes] = useState<Array<{ name: string; calculator_type: string | null }>>([])
  const materialTemplates = useMemo(() => {
    const serviceTemplates = serviceTypes.map(service => {
      const normalized = `${service.name} ${service.calculator_type || ''}`.toLowerCase()
      const preset = normalized.includes('direct image') || normalized.includes('direct_image')
        ? MATERIAL_TEMPLATES[1]
        : normalized.includes('large format') || normalized.includes('large_format')
          ? MATERIAL_TEMPLATES[0]
          : normalized.includes('dtf')
            ? MATERIAL_TEMPLATES[2]
            : MATERIAL_TEMPLATES[5]
      const value = preset === MATERIAL_TEMPLATES[1]
        ? 'Direct Image'
        : preset === MATERIAL_TEMPLATES[0]
          ? 'Large Format'
          : preset === MATERIAL_TEMPLATES[2]
            ? 'DTF'
            : service.name
      return { ...preset, value, label: value }
    }).filter(template => !MATERIAL_TEMPLATES.some(existing => existing.value === template.value))

    return [...MATERIAL_TEMPLATES, ...serviceTemplates]
  }, [serviceTypes])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [unlocked, setUnlocked] = useState(false)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showInactive, setShowInactive] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const [deleteItem, setDeleteItem] =
    useState<InventoryItem | null>(null)

  const [adjustItem, setAdjustItem] =
    useState<InventoryItem | null>(null)

  const [adjustQuantity, setAdjustQuantity] =
    useState('')

  const [adjustType, setAdjustType] =
    useState<'restock' | 'remove'>('restock')

  const [adjustNote, setAdjustNote] =
    useState('')

  const load = useCallback(async () => {
    if (!organizationId) {
      setError('No active organization was found.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const [inventoryResult, materialsResult, servicesResult] =
      await Promise.all([
        supabase
          .from('inventory_items')
          .select(
            'id,organization_id,name,sku,category,item_kind,base_unit,cost_per_unit,sell_price,current_stock,initial_stock,reorder_level,metadata,active,created_at,updated_at'
          )
          .eq('organization_id', organizationId)
          .order('category')
          .order('name'),

        supabase
          .from('materials')
          .select(
            'id,name,base_name,price_per_sqft,roll_width_ft,initial_length_ft,current_length_ft,active'
          )
          .eq('organization_id', organizationId)
          .order('name'),
        supabase
          .from('business_services')
          .select('name,calculator_type')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .order('sort_order')
          .order('name'),
      ])

    if (inventoryResult.error) {
      setError(inventoryResult.error.message)
    }

    if (materialsResult.error && !inventoryResult.error) {
      setError(
        `Large Format materials: ${materialsResult.error.message}`
      )
    }

    setItems(
      (inventoryResult.data || []) as InventoryItem[]
    )

    setMaterials(
      (materialsResult.data || []) as Material[]
    )
    setServiceTypes(
      (servicesResult.data?.length
        ? servicesResult.data
        : [
            { name: 'Large Format Printing', calculator_type: 'large_format' },
            { name: 'DTF Printing', calculator_type: 'dtf' },
            { name: 'Direct Image Printing', calculator_type: 'direct_image' },
            { name: 'Sublimation Printing', calculator_type: 'generic' },
            { name: 'Screen Printing', calculator_type: 'generic' },
            { name: 'Vinyl Cutting & Plotting', calculator_type: 'generic' },
            { name: 'UV Printing', calculator_type: 'generic' },
          ]) as Array<{ name: string; calculator_type: string | null }>
    )

    setLoading(false)
  }, [organizationId, supabase])

  useEffect(() => {
    void load()

    const refreshUnlock = () => {
      setUnlocked(isUnlocked())
    }

    refreshUnlock()

    window.addEventListener(
      'netvyl:admin-lock-changed',
      refreshUnlock
    )

    return () => {
      window.removeEventListener(
        'netvyl:admin-lock-changed',
        refreshUnlock
      )
    }
  }, [load])

  function openAdd() {
    if (!unlocked) {
      setError(
        'Inventory editing is locked. Unlock protected actions from Administration first.'
      )
      return
    }

    setError('')
    setMessage('')
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
    })
    setFormOpen(true)
  }

  function openEdit(item: InventoryItem) {
    if (!unlocked) {
      setError(
        'Inventory editing is locked. Unlock protected actions from Administration first.'
      )
      return
    }

    const metadata =
      item.metadata || {}

    const material = materials.find(
      current =>
        String(
          metadata.legacy_material_id || ''
        ) === String(current.id)
    )

    setError('')
    setMessage('')
    setEditingId(item.id)

    const dtfPricing =
      (metadata.dtf_pricing as Record<string, number> | null) || {}

    setForm({
      name: item.name || '',
      sku: item.sku || '',
      category: item.category || 'General',
      item_kind: item.item_kind || 'material',
      base_unit: item.base_unit || 'pcs',
      cost_per_unit: String(
        number(item.cost_per_unit)
      ),
      sell_price: String(
        number(item.sell_price)
      ),
      di_base_price: String(
        number(
          metadata.di_base_price ?? 0
        )
      ),
      dtf_a4_price: String(
        number(dtfPricing.A4 ?? dtfPricing.a4 ?? 1000)
      ),
      dtf_a3_price: String(
        number(dtfPricing.A3 ?? dtfPricing.a3 ?? 1600)
      ),
      dtf_a2_price: String(
        number(dtfPricing.A2 ?? dtfPricing.a2 ?? 3200)
      ),
      dtf_roll_type:
        String(
          metadata.dtf_roll_type || 'A3'
        ).toUpperCase() === 'A2'
          ? 'A2'
          : 'A3',
      current_stock: String(
        number(item.current_stock)
      ),
      initial_stock: String(
        number(item.initial_stock)
      ),
      stock_add: '0',
      stock_remove: '0',
      reorder_level: String(
        number(item.reorder_level)
      ),
      roll_width_ft: String(
        number(
          metadata.roll_width_ft ??
          material?.roll_width_ft ??
          0
        )
      ),
      base_name:
        material?.base_name ||
        String(
          metadata.legacy_base_name || ''
        ),
    })

    setFormOpen(true)
  }

  async function saveItem() {
    if (!organizationId) return

    if (!unlocked) {
      setError(
        'Inventory editing is locked. Unlock protected actions from Administration first.'
      )
      return
    }

    if (!form.name.trim()) {
      setError('Enter a material/item name.')
      return
    }

    const currentStock = number(form.current_stock)
    const stockAdd = number(form.stock_add)
    const stockRemove = number(form.stock_remove)
    const stock =
      /direct image|\bdi\b/i.test(form.category)
        ? Math.max(0, currentStock + stockAdd - stockRemove)
        : currentStock
    const initialStock = number(form.initial_stock)
    const cost = number(form.cost_per_unit)
    const sellPrice = number(form.sell_price)
    const diBasePrice = number(form.di_base_price)
    const reorder = number(form.reorder_level)
    const rollWidth = number(form.roll_width_ft)

    if (stock < 0 || initialStock < 0) {
      setError('Stock values cannot be negative.')
      return
    }

    if (cost < 0 || sellPrice < 0 || diBasePrice < 0) {
      setError('Prices cannot be negative.')
      return
    }

    const serviceType =
      resolveInventoryServiceType(`${form.category} ${form.name}`) ||
      resolveInventoryServiceType(form.category) ||
      resolveInventoryServiceType(form.name)

    const isLargeFormat = serviceType === 'large_format'
    const isDirectImage = serviceType === 'direct_image'
    const isDtf = serviceType === 'dtf'

    if (
      isLargeFormat &&
      rollWidth <= 0
    ) {
      setError(
        'Enter the roll width in feet for Large Format material.'
      )
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      let inventoryId = editingId

      const metadata = {
        ...(editingId
          ? (
              items.find(
                item =>
                  item.id === editingId
              )?.metadata || {}
            )
          : {}),
        service_type: serviceType || undefined,
        calculator_type:
          isLargeFormat
            ? 'large_format'
            : isDirectImage
              ? 'direct_image'
              : isDtf
                ? 'dtf'
                : undefined,
        stock_unit:
          isLargeFormat
            ? 'linear_ft'
            : isDirectImage
              ? 'pcs'
              : isDtf
                ? 'linear_ft'
                : form.base_unit,
        selling_unit:
          isLargeFormat
            ? 'sqft'
            : isDirectImage
              ? 'pcs'
              : isDtf
                ? 'ft'
                : form.base_unit,
        roll_width_ft:
          isLargeFormat
            ? rollWidth
            : null,
        di_base_price: diBasePrice,
        dtf_pricing: isDtf
          ? {
              A4: number(form.dtf_a4_price),
              A3: number(form.dtf_a3_price),
              A2: number(form.dtf_a2_price),
            }
          : undefined,
        dtf_roll_type: isDtf
          ? form.dtf_roll_type
          : undefined,
        dtf_roll_width_ft: isDtf
          ? {
              A3: 1.5,
              A2: 2,
            }
          : undefined,
      }

      if (editingId) {
        const { error: updateError } =
          await supabase
            .from('inventory_items')
            .update({
              name: form.name.trim(),
              sku:
                form.sku.trim() ||
                null,
              category:
                form.category.trim() ||
                'General',
              item_kind:
                form.item_kind.trim() ||
                'material',
              base_unit:
                form.base_unit.trim() ||
                'pcs',
              cost_per_unit: cost,
              sell_price: sellPrice,
              current_stock: stock,
              initial_stock: initialStock,
              reorder_level: reorder,
              metadata,
              active: true,
              updated_at:
                new Date().toISOString(),
            })
            .eq('id', editingId)
            .eq(
              'organization_id',
              organizationId)

        if (updateError) {
          throw updateError
        }
      } else {
        const { data, error: insertError } =
          await supabase
            .from('inventory_items')
            .insert({
              organization_id:
                organizationId,
              name: form.name.trim(),
              sku:
                form.sku.trim() ||
                null,
              category:
                form.category.trim() ||
                'General',
              item_kind:
                form.item_kind.trim() ||
                'material',
              base_unit:
                form.base_unit.trim() ||
                'pcs',
              cost_per_unit: cost,
              sell_price: sellPrice,
              current_stock: stock,
              initial_stock:
                initialStock || stock,
              reorder_level: reorder,
              metadata,
              active: true,
            })
            .select('id')
            .single()

        if (insertError) {
          throw insertError
        }

        inventoryId = data?.id || null
      }

      /*
       * Keep the legacy materials table synchronized for Large Format.
       * New Job still uses this table for its legacy job-creation RPC.
       */
      if (
        isLargeFormat
      ) {
        const existingMaterial =
          editingId
            ? materials.find(
                material =>
                  String(
                    items.find(
                      item =>
                        item.id ===
                        editingId
                    )?.metadata
                      ?.legacy_material_id ||
                      ''
                  ) ===
                  String(material.id)
              )
            : null

        if (existingMaterial) {
          const { error: materialError } =
            await supabase
              .from('materials')
              .update({
                name:
                  form.name.trim(),
                base_name:
                  form.base_name.trim() ||
                  form.name.trim(),
                price_per_sqft:
                  sellPrice,
                roll_width_ft:
                  rollWidth,
                initial_length_ft:
                  initialStock,
                current_length_ft:
                  stock,
                active: true,
              })
              .eq(
                'id',
                existingMaterial.id
              )
              .eq(
                'organization_id',
                organizationId)

          if (materialError) {
            throw materialError
          }

          if (inventoryId) {
            const updatedMetadata =
              {
                ...metadata,
                legacy_material_id:
                  existingMaterial.id,
                legacy_base_name:
                  form.base_name.trim() ||
                  form.name.trim(),
                roll_width_ft:
                  rollWidth,
                roll_width:
                  rollWidth,
                calculator_type:
                  'large_format',
                stock_unit:
                  'linear_ft',
                selling_unit:
                  'sqft',
              }

            const { error: linkError } =
              await supabase
                .from('inventory_items')
                .update({
                  metadata:
                    updatedMetadata,
                })
                .eq(
                  'id',
                  inventoryId
                )
                .eq(
                  'organization_id',
                  organizationId)

            if (linkError) {
              throw linkError
            }
          }
        } else if (!editingId) {
          const { data: materialData, error: materialError } =
            await supabase
              .from('materials')
              .insert({
                organization_id:
                  organizationId,
                name:
                  form.name.trim(),
                base_name:
                  form.base_name.trim() ||
                  form.name.trim(),
                price_per_sqft:
                  sellPrice,
                roll_width_ft:
                  rollWidth,
                initial_length_ft:
                  initialStock || stock,
                current_length_ft:
                  stock,
                active: true,
              })
              .select('id')
              .single()

          if (materialError) {
            throw materialError
          }

          if (
            materialData?.id &&
            inventoryId
          ) {
            const linkedMetadata = {
              ...metadata,
              legacy_material_id:
                materialData.id,
              legacy_base_name:
                form.base_name.trim() ||
                form.name.trim(),
              roll_width_ft:
                rollWidth,
              roll_width:
                rollWidth,
              calculator_type:
                'large_format',
              stock_unit:
                'linear_ft',
              selling_unit:
                'sqft',
            }

            const { error: linkError } =
              await supabase
                .from('inventory_items')
                .update({
                  metadata:
                    linkedMetadata,
                })
                .eq(
                  'id',
                  inventoryId
                )
                .eq(
                  'organization_id',
                  organizationId)

            if (linkError) {
              throw linkError
            }
          }
        }
      }

      setFormOpen(false)
      setEditingId(null)
      setMessage(
        editingId
          ? 'Inventory item updated successfully.'
          : 'Inventory item added successfully.'
      )

      await load()
    } catch (caught: any) {
      setError(
        caught?.message ||
          'Unable to save inventory item.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteItemPermanently() {
    if (!deleteItem) return

    if (!unlocked) {
      setError(
        'Inventory deletion is locked. Unlock protected actions from Administration first.'
      )
      setDeleteItem(null)
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      /*
       * Existing historical jobs can reference the legacy material.
       * Therefore we deactivate the legacy material instead of
       * physically deleting it. The inventory item itself is also
       * deactivated. This keeps historical jobs intact.
       */
      const metadata =
        deleteItem.metadata || {}

      const legacyMaterialId =
        metadata.legacy_material_id

      if (legacyMaterialId) {
        const { error: materialError } =
          await supabase
            .from('materials')
            .update({
              active: false,
            })
            .eq(
              'id',
              String(
                legacyMaterialId
              )
            )
            .eq(
              'organization_id',
              organizationId)

        if (materialError) {
          throw materialError
        }
      }

      const { error: inventoryError } =
        await supabase
          .from('inventory_items')
          .update({
            active: false,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            deleteItem.id
          )
          .eq(
            'organization_id',
            organizationId)

      if (inventoryError) {
        throw inventoryError
      }

      setDeleteItem(null)

      setMessage(
        `${deleteItem.name} has been removed from active inventory. Historical records were preserved.`
      )

      await load()
    } catch (caught: any) {
      setError(
        caught?.message ||
          'Unable to remove inventory item.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function adjustStock() {
    if (!adjustItem) return

    if (!unlocked) {
      setError(
        'Inventory editing is locked. Unlock protected actions from Administration first.'
      )
      setAdjustItem(null)
      return
    }

    const quantity =
      number(adjustQuantity)

    if (quantity <= 0) {
      setError(
        'Enter a quantity greater than zero.'
      )
      return
    }

    const current =
      number(adjustItem.current_stock)

    const next =
      adjustType === 'restock'
        ? current + quantity
        : current - quantity

    if (next < 0) {
      setError(
        `Cannot remove ${formatNumber(quantity)} ${adjustItem.base_unit || ''}. Only ${formatNumber(current)} is available.`
      )
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const { error: updateError } =
        await supabase
          .from('inventory_items')
          .update({
            current_stock: next,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            adjustItem.id
          )
          .eq(
            'organization_id',
            organizationId)

      if (updateError) {
        throw updateError
      }

      const metadata =
        adjustItem.metadata || {}

      const legacyMaterialId =
        metadata.legacy_material_id

      if (legacyMaterialId) {
        const { error: materialError } =
          await supabase
            .from('materials')
            .update({
              current_length_ft:
                next,
            })
            .eq(
              'id',
              String(
                legacyMaterialId
              )
            )
            .eq(
              'organization_id',
              organizationId)

        if (materialError) {
          throw materialError
        }
      }

      const { error: transactionError } =
        await supabase
          .from('inventory_transactions')
          .insert({
            organization_id:
              organizationId,
            inventory_item_id:
              adjustItem.id,
            movement_type:
              adjustType ===
              'restock'
                ? 'restock'
                : 'adjustment',
            quantity:
              adjustType ===
              'restock'
                ? quantity
                : -quantity,
            unit_cost:
              number(
                adjustItem.cost_per_unit
              ),
            reference:
              'manual-adjustment',
            notes:
              adjustNote.trim() ||
              (adjustType ===
              'restock'
                ? 'Manual inventory restock'
                : 'Manual inventory reduction'),
          })

      if (transactionError) {
        /*
         * The stock update has already happened. Do not roll it back
         * from the browser because historical stock must remain intact.
         * Surface the transaction problem clearly.
         */
        throw transactionError
      }

      setAdjustItem(null)
      setAdjustQuantity('')
      setAdjustNote('')

      setMessage(
        `${adjustItem.name} stock updated successfully.`
      )

      await load()
    } catch (caught: any) {
      setError(
        caught?.message ||
          'Unable to adjust inventory.'
      )
    } finally {
      setSaving(false)
    }
  }

  const categories =
    Array.from(
      new Set(
        items
          .map(item =>
            item.category ||
            'General'
          )
          .filter(Boolean)
      )
    ).sort()

  const selectedTemplate =
    materialTemplates.find(
      template =>
        template.value ===
        form.category
    ) ||
    MATERIAL_TEMPLATES[0]

  const filteredItems =
    items.filter(item => {
      const activeMatch =
        showInactive ||
        item.active !== false

      const categoryMatch =
        categoryFilter === 'All' ||
        (item.category ||
          'General') ===
          categoryFilter

      const query =
        search.trim().toLowerCase()

      const searchMatch =
        !query ||
        item.name
          .toLowerCase()
          .includes(query) ||
        String(
          item.sku || ''
        )
          .toLowerCase()
          .includes(query)

      return (
        activeMatch &&
        categoryMatch &&
        searchMatch
      )
    })

  const activeItems =
    items.filter(
      item => item.active !== false
    )

  const inventoryValue =
    activeItems.reduce(
      (total, item) => {
        const stock =
          number(
            item.current_stock
          )

        const sellPrice =
          number(
            item.sell_price
          )

        const cost =
          number(
            item.cost_per_unit
          )

        const metadata =
          item.metadata || {}

        const rollWidth =
          number(
            metadata.roll_width_ft ??
              metadata.roll_width
          )

        if (
          item.category ===
            'Large Format' &&
          rollWidth > 0
        ) {
          return (
            total +
            stock *
              rollWidth *
              (sellPrice || cost)
          )
        }

        return (
          total +
          stock *
            (sellPrice || cost)
        )
      },
      0
    )

  const inventoryCostValue =
    activeItems.reduce(
      (total, item) =>
        total +
        number(
          item.current_stock
        ) *
          number(
            item.cost_per_unit
          ),
      0
    )

  const lowStock =
    activeItems.filter(
      item =>
        number(
          item.current_stock
        ) <=
        number(
          item.reorder_level
        )
    )

  return (
    <>
      <PageHead
        title="Inventory"
        subtitle="Manage materials, stock, cost prices and selling prices used by the New Job calculator."
        actions={
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <Badge
              tone={
                unlocked
                  ? 'success'
                  : 'warning'
              }
            >
              {unlocked
                ? 'EDITING UNLOCKED'
                : 'VIEW ONLY'}
            </Badge>

            <button
              className="btn"
              disabled={loading}
              onClick={() => void load()}
            >
              ↻ Refresh
            </button>

            <button
              className="btn primary"
              disabled={!unlocked}
              onClick={openAdd}
              title={
                unlocked
                  ? 'Add inventory item'
                  : 'Unlock protected actions from Administration'
              }
            >
              ＋ Add material
            </button>
          </div>
        }
      />

      {(error || message) && (
        <div
          className={`notice ${
            error ? 'error' : ''
          }`}
          style={{
            marginTop: 14,
          }}
        >
          {error || message}
        </div>
      )}

      <section
        className="grid4"
        style={{
          marginTop: 18,
        }}
      >
        <div className="card stat-card">
          <small>
            Active materials
          </small>
          <strong>
            {activeItems.length}
          </strong>
        </div>

        <div className="card stat-card">
          <small>
            Inventory value
          </small>
          <strong>
            <Money
              value={
                inventoryValue
              }
            />
          </strong>
        </div>

        <div className="card stat-card">
          <small>
            Inventory cost
          </small>
          <strong>
            <Money
              value={
                inventoryCostValue
              }
            />
          </strong>
        </div>

        <div className="card stat-card">
          <small>
            Low stock
          </small>
          <strong>
            {lowStock.length}
          </strong>
        </div>
      </section>

      <section
        className="card"
        style={{
          marginTop: 20,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(220px, 1fr) 180px auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <label>
            Search
            <input
              value={search}
              onChange={e =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Search material or SKU..."
            />
          </label>

          <label>
            Category
            <select
              value={
                categoryFilter
              }
              onChange={e =>
                setCategoryFilter(
                  e.target.value
                )
              }
            >
              <option value="All">
                All
              </option>

              {categories.map(
                category => (
                  <option
                    key={
                      category
                    }
                    value={
                      category
                    }
                  >
                    {category}
                  </option>
                )
              )}
            </select>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingBottom: 10,
            }}
          >
            <input
              type="checkbox"
              checked={
                showInactive
              }
              onChange={e =>
                setShowInactive(
                  e.target.checked
                )
              }
            />
            Show inactive
          </label>
        </div>
      </section>

      <section
        className="card"
        style={{
          marginTop: 20,
          overflowX: 'auto',
        }}
      >
        <div className="section-head">
          <div>
            <h3>
              Inventory items
            </h3>

            <span>
              Large Format stock is stored in linear feet.
              Its selling price is per square foot.
            </span>
          </div>
        </div>

        {loading ? (
          <div className="notice">
            Loading inventory…
          </div>
        ) : filteredItems.length === 0 ? (
          <Empty
            title="No inventory items found"
            text="Add a material or change the search filters."
          />
        ) : (
          <div
            style={{
              overflowX:
                'auto',
            }}
          >
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>
                    Material
                  </th>
                  <th>
                    Category
                  </th>
                  <th>
                    Unit
                  </th>
                  <th>
                    Cost
                  </th>
                  <th>
                    Sell Price
                  </th>
                  <th>
                    Stock
                  </th>
                  <th>
                    Roll Width
                  </th>
                  <th>
                    Status
                  </th>
                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map(
                  item => {
                    const metadata =
                      item.metadata ||
                      {}

                    const rollWidth =
                      number(
                        metadata.roll_width_ft ??
                          metadata.roll_width
                      )

                    const stock =
                      number(
                        item.current_stock
                      )

                    const reorder =
                      number(
                        item.reorder_level
                      )

                    const low =
                      item.active !==
                        false &&
                      stock <=
                        reorder

                    return (
                      <tr
                        key={
                          item.id
                        }
                      >
                        <td>
                          <strong>
                            {item.name}
                          </strong>

                          {item.sku && (
                            <small
                              style={{
                                display:
                                  'block',
                              }}
                            >
                              {item.sku}
                            </small>
                          )}
                        </td>

                        <td>
                          {item.category ||
                            'General'}
                        </td>

                        <td>
                          {item.base_unit ||
                            '—'}
                        </td>

                        <td>
                          <Money
                            value={number(
                              item.cost_per_unit
                            )}
                          />
                          {item.category ===
                            'Large Format' &&
                            ' / ft'}
                        </td>

                        <td>
                          <Money
                            value={number(
                              item.sell_price
                            )}
                          />
                          {item.category ===
                            'Large Format' &&
                            ' / sqft'}
                        </td>

                        <td>
                          <strong>
                            {formatNumber(
                              stock
                            )}
                          </strong>{' '}
                          {item.base_unit}
                          {low && (
                            <Badge
                              tone="danger"
                            >
                              LOW
                            </Badge>
                          )}
                        </td>

                        <td>
                          {item.category ===
                            'Large Format' &&
                          rollWidth > 0
                            ? `${formatNumber(
                                rollWidth
                              )} ft`
                            : '—'}
                        </td>

                        <td>
                          <Badge
                            tone={
                              item.active
                                ? low
                                  ? 'danger'
                                  : 'success'
                                : 'warning'
                            }
                          >
                            {item.active
                              ? low
                                ? 'LOW STOCK'
                                : 'ACTIVE'
                              : 'INACTIVE'}
                          </Badge>
                        </td>

                        <td>
                          <div
                            style={{
                              display:
                                'flex',
                              gap: 6,
                              flexWrap:
                                'wrap',
                            }}
                          >
                            <button
                              className="btn small"
                              disabled={
                                !unlocked ||
                                saving
                              }
                              onClick={() =>
                                openEdit(
                                  item
                                )
                              }
                            >
                              Edit
                            </button>

                            <button
                              className="btn small"
                              disabled={
                                !unlocked ||
                                saving
                              }
                              onClick={() => {
                                setAdjustItem(
                                  item
                                )
                                setAdjustQuantity(
                                  ''
                                )
                                setAdjustType(
                                  'restock'
                                )
                                setAdjustNote(
                                  ''
                                )
                                setError('')
                              }}
                            >
                              Stock
                            </button>

                            <button
                              className="btn danger small"
                              disabled={
                                !unlocked ||
                                saving
                              }
                              onClick={() =>
                                setDeleteItem(
                                  item
                                )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen && (
        <div className="modal-backdrop">
          <section className="modal card">
            <div className="section-head">
              <div>
                <h3>
                  {editingId
                    ? 'Edit inventory item'
                    : 'Add inventory material'}
                </h3>

                <span>
                  Cost price feeds the estimated-profit calculation.
                </span>
              </div>

              <button
                className="btn"
                disabled={
                  saving
                }
                onClick={() =>
                  setFormOpen(
                    false
                  )
                }
              >
                Close
              </button>
            </div>

            <div className="grid2">
              <label>
                Material name
                <input
                  value={
                    form.name
                  }
                  onChange={e =>
                    setForm(
                      previous => ({
                        ...previous,
                        name:
                          e.target
                            .value,
                      })
                    )
                  }
                  autoFocus
                />
              </label>

              <label>
                SKU
                <input
                  value={
                    form.sku
                  }
                  onChange={e =>
                    setForm(
                      previous => ({
                        ...previous,
                        sku:
                          e.target
                            .value,
                      })
                    )
                  }
                />
              </label>
            </div>

            <div className="grid2">
              <label>
                Material type
                <select
                  value={
                    form.category
                  }
                  onChange={e => {
                    const template =
                      materialTemplates.find(
                        item =>
                          item.value ===
                          e.target.value
                      ) ||
                      { ...MATERIAL_TEMPLATES[5], value: e.target.value, label: e.target.value }

                    setForm(
                      previous => ({
                        ...previous,
                        category:
                          template.value,
                        base_unit:
                          template.baseUnit,
                        item_kind:
                          template.itemKind,
                        di_base_price:
                          template.showDiBasePrice
                            ? previous.di_base_price
                            : '0',
                        roll_width_ft:
                          template.showRollWidth
                            ? previous.roll_width_ft
                            : '0',
                      })
                    )
                  }}
                >
                  {materialTemplates.map(template => (
                    <option
                      key={template.value}
                      value={template.value}
                    >
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>

              {selectedTemplate.showDiBasePrice ? (
                <label>
                  Base unit
                  <input
                    value="pcs"
                    readOnly
                    disabled
                  />
                </label>
              ) : (
                <label>
                  Base unit
                  <select
                    value={
                      form.base_unit
                    }
                    onChange={e =>
                      setForm(
                        previous => ({
                          ...previous,
                          base_unit:
                            e.target
                              .value,
                        })
                      )
                    }
                  >
                    <option value="ft">
                      ft
                    </option>
                    <option value="pcs">
                      pcs
                    </option>
                    <option value="sheet">
                      sheet
                    </option>
                    <option value="kg">
                      kg
                    </option>
                    <option value="roll">
                      roll
                    </option>
                    <option value="box">
                      box
                    </option>
                  </select>
                </label>
              )}
            </div>

            {!selectedTemplate.showDiBasePrice && !selectedTemplate.showDtfPricing && (
            <div className="grid2">
              <label>
                Cost price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    form.cost_per_unit
                  }
                  onChange={e =>
                    setForm(
                      previous => ({
                        ...previous,
                        cost_per_unit:
                          e.target
                            .value,
                      })
                    )
                  }
                />

                <small>
                  Large Format = cost per linear foot
                </small>
              </label>

              <label>
                Selling price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    form.sell_price
                  }
                  onChange={e =>
                    setForm(
                      previous => ({
                        ...previous,
                        sell_price:
                          e.target
                            .value,
                      })
                    )
                  }
                />

                <small>
                  Large Format = selling price per square foot
                </small>
              </label>
            </div>

            )}

            {selectedTemplate.showDiBasePrice && (
              <div className="grid2">
                <label>
                  DI base price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.di_base_price
                    }
                    onChange={e =>
                      setForm(
                        previous => ({
                          ...previous,
                          di_base_price:
                            e.target
                              .value,
                        })
                      )
                    }
                  />

                  <small>
                    Used as the default base charge for Direct Image material cards.
                  </small>
                </label>
              </div>
            )}

            {selectedTemplate.showDtfPricing && (
              <div className="grid3">
                <label>
                  A4 price
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.dtf_a4_price}
                    onChange={e =>
                      setForm(previous => ({
                        ...previous,
                        dtf_a4_price: e.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  A3 price
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.dtf_a3_price}
                    onChange={e =>
                      setForm(previous => ({
                        ...previous,
                        dtf_a3_price: e.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  A2 price
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.dtf_a2_price}
                    onChange={e =>
                      setForm(previous => ({
                        ...previous,
                        dtf_a2_price: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            )}

            {selectedTemplate.showDtfPricing && (
              <div className="grid2">
                <label>
                  Roll material
                  <select
                    value={form.dtf_roll_type}
                    onChange={e =>
                      setForm(previous => ({
                        ...previous,
                        dtf_roll_type: e.target.value,
                      }))
                    }
                  >
                    <option value="A3">A3 material roll (1.5ft x 164.04ft)</option>
                    <option value="A2">A2 material roll (2ft x 164.04ft)</option>
                  </select>
                </label>
              </div>
            )}

            {selectedTemplate.showDiBasePrice ? (
              <div className="grid2">
                <label>
                  Add stock (pcs)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      form.stock_add
                    }
                    onChange={e =>
                      setForm(
                        previous => ({
                          ...previous,
                          stock_add:
                            e.target
                              .value,
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Remove stock (pcs)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={
                      form.stock_remove
                    }
                    onChange={e =>
                      setForm(
                        previous => ({
                          ...previous,
                          stock_remove:
                            e.target
                              .value,
                        })
                      )
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="grid3">
                <label>
                  Current stock
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.current_stock
                    }
                    onChange={e =>
                      setForm(
                        previous => ({
                          ...previous,
                          current_stock:
                            e.target
                              .value,
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Opening stock
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.initial_stock
                    }
                    onChange={e =>
                      setForm(
                        previous => ({
                          ...previous,
                          initial_stock:
                            e.target
                              .value,
                        })
                      )
                    }
                  />
                </label>

                <label>
                  Reorder level
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.reorder_level
                    }
                    onChange={e =>
                      setForm(
                        previous => ({
                          ...previous,
                          reorder_level:
                            e.target
                              .value,
                        })
                      )
                    }
                  />
                </label>
              </div>
            )}

            {selectedTemplate.showRollWidth && (
              <>
                <div className="grid2">
                  <label>
                    Roll width (ft)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        form.roll_width_ft
                      }
                      onChange={e =>
                        setForm(
                          previous => ({
                            ...previous,
                            roll_width_ft:
                              e.target
                                .value,
                          })
                        )
                      }
                    />
                  </label>

                  <label>
                    Base material name
                    <input
                      value={
                        form.base_name
                      }
                      onChange={e =>
                        setForm(
                          previous => ({
                            ...previous,
                            base_name:
                              e.target
                                .value,
                          })
                        )
                      }
                      placeholder="e.g. Flex"
                    />
                  </label>
                </div>

                <div className="notice">
                  <strong>
                    New Job connection
                  </strong>

                  <div>
                    Large Format materials are synchronized
                    with the legacy <code>materials</code> table
                    used by the existing New Job calculator.
                    Stock is linear feet; selling price is per
                    square foot.
                  </div>
                </div>
              </>
            )}

            <button
              className="btn primary wide"
              disabled={
                saving ||
                !unlocked
              }
              onClick={() =>
                void saveItem()
              }
            >
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save inventory changes'
                  : 'Add inventory material'}
            </button>
          </section>
        </div>
      )}

      {adjustItem && (
        <div className="modal-backdrop">
          <section className="modal card">
            <div className="section-head">
              <div>
                <h3>
                  Adjust stock
                </h3>

                <span>
                  {adjustItem.name}
                </span>
              </div>

              <button
                className="btn"
                disabled={
                  saving
                }
                onClick={() =>
                  setAdjustItem(
                    null
                  )
                }
              >
                Close
              </button>
            </div>

            <div className="notice">
              Current stock:{' '}
              <strong>
                {formatNumber(
                  number(
                    adjustItem.current_stock
                  )
                )}{' '}
                {adjustItem.base_unit}
              </strong>
            </div>

            <label>
              Adjustment type

              <select
                value={
                  adjustType
                }
                onChange={e =>
                  setAdjustType(
                    e.target
                      .value as
                      | 'restock'
                      | 'remove'
                  )
                }
              >
                <option value="restock">
                  Restock / Add
                </option>

                <option value="remove">
                  Remove / Reduce
                </option>
              </select>
            </label>

            <label>
              Quantity
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  adjustQuantity
                }
                onChange={e =>
                  setAdjustQuantity(
                    e.target
                      .value
                  )
                }
                autoFocus
              />
            </label>

            <label>
              Note
              <textarea
                value={
                  adjustNote
                }
                onChange={e =>
                  setAdjustNote(
                    e.target
                      .value
                  )
                }
                placeholder="Reason for stock adjustment"
              />
            </label>

            <button
              className="btn primary wide"
              disabled={
                saving ||
                !unlocked
              }
              onClick={() =>
                void adjustStock()
              }
            >
              {saving
                ? 'Updating…'
                : 'Update stock'}
            </button>
          </section>
        </div>
      )}

      {deleteItem && (
        <div className="modal-backdrop">
          <section className="modal card">
            <div className="section-head">
              <div>
                <h3>
                  Remove inventory item
                </h3>

                <span>
                  This removes it from active inventory.
                </span>
              </div>

              <button
                className="btn"
                disabled={
                  saving
                }
                onClick={() =>
                  setDeleteItem(
                    null
                  )
                }
              >
                Cancel
              </button>
            </div>

            <div
              className="notice error"
              style={{
                marginTop: 0,
              }}
            >
              <strong>
                {deleteItem.name}
              </strong>

              <div>
                The item will become inactive and
                disappear from normal inventory and
                the New Job material list.
              </div>

              <div
                style={{
                  marginTop: 6,
                }}
              >
                Historical job records will be preserved.
              </div>
            </div>

            <button
              className="btn danger wide"
              disabled={
                saving ||
                !unlocked
              }
              onClick={() =>
                void deleteItemPermanently()
              }
            >
              {saving
                ? 'Removing…'
                : 'Remove from inventory'}
            </button>
          </section>
        </div>
      )}
    </>
  )
}
