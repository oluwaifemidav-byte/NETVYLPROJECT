'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Badge } from '../../components/ui'

type InventoryItem = {
  id: string
  name: string
  category?: string | null
  base_unit: string
  cost_per_unit: number
  sell_price: number
  current_stock: number
  item_kind?: string | null
  metadata?: Record<string, unknown> | null
  active?: boolean
}

type Material = {
  id: string
  name: string
  base_name: string
  price_per_sqft: number
  roll_width_ft: number
  initial_length_ft: number
  current_length_ft: number
  inventory_item_id?: string | null
  inventory_current_stock?: number | null
  active?: boolean
}

type Customer = {
  id: string
  name: string
  phone?: string | null
}

const dedupeCustomersByName = (customers: Customer[]) => {
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

type ServiceType = {
  id: string
  name: string
  description: string
  available: boolean
}

type OrderLine = {
  id: string
  service: string
  materialId: string
  inventoryItemId?: string | null
  materialName: string
  directImageSize?: string
  width: number
  height: number
  unit: 'ft' | 'in'
  quantity: number
  billedSqFt: number
  linearLengthFt: number
  materialRate: number
  materialTotal: number
  printCut: boolean
  printCutRate: number
  printCutCharge: number
  designCharge: number
  finishingCharge: number
  productionTotal: number
  grandTotal: number
}

const DEFAULT_SERVICES: ServiceType[] = [
  {
    id: 'large-format',
    name: 'Large Format Printing',
    description: 'Flex, SAV, Clear SAV, Reflective SAV and Window Graphic.',
    available: true,
  },
  {
    id: 'dtf',
    name: 'DTF Printing',
    description: 'DTF garment printing.',
    available: true,
  },
  {
    id: 'direct-image',
    name: 'Direct Image Printing',
    description: 'Flyers, brochures, booklets and direct image products.',
    available: true,
  },
  {
    id: 'sublimation',
    name: 'Sublimation Printing',
    description: 'Mugs, tiles, apparel, signage and custom textile items.',
    available: false,
  },
  {
    id: 'screen-printing',
    name: 'Screen Printing',
    description: 'Bulk garment printing and branded apparel work.',
    available: false,
  },
  {
    id: 'vinyl-cutting',
    name: 'Vinyl Cutting & Plotting',
    description: 'Vehicle graphics, stickers, labels and signage.',
    available: false,
  },
  {
    id: 'uv-printing',
    name: 'UV Printing',
    description: 'Rigid materials, panels, acrylic and signage boards.',
    available: false,
  },
]

const DI_SIZE_OPTIONS = [
  { value: 'A4', label: 'A4', baseRate: 600 },
  { value: 'A3', label: 'A3', baseRate: 900 },
  { value: 'A2', label: 'A2', baseRate: 1400 },
  { value: 'A1', label: 'A1', baseRate: 2200 },
  { value: 'A0', label: 'A0', baseRate: 3500 },
  { value: '4x6', label: '4 x 6 in', baseRate: 500 },
  { value: '5x7', label: '5 x 7 in', baseRate: 650 },
  { value: '8x10', label: '8 x 10 in', baseRate: 850 },
  { value: '12x18', label: '12 x 18 in', baseRate: 1500 },
  { value: '18x24', label: '18 x 24 in', baseRate: 2200 },
  { value: '24x36', label: '24 x 36 in', baseRate: 3400 },
  { value: 'custom', label: 'Custom Size', baseRate: 0 },
]

const DTF_SIZE_OPTIONS = [
  { value: 'A4', label: 'A4', defaultRate: 1000 },
  { value: 'A3', label: 'A3', defaultRate: 1600 },
  { value: 'A2', label: 'A2', defaultRate: 3200 },
]

const DTF_ROLL_LENGTH_FT = 164.04

const DTF_SIZE_DIMENSIONS_IN = {
  A4: { width: 8.27, height: 11.69 },
  A3: { width: 11.69, height: 16.54 },
  A2: { width: 16.54, height: 23.39 },
} as const

const getDtfRollWidthFt = (size: string) => {
  switch (size) {
    case 'A2':
      return 2
    case 'A4':
    case 'A3':
    default:
      return 1.5
  }
}

const getDtfRollWidthFromMetadata = (
  item: InventoryItem | undefined,
  size: string,
  rollType: 'A3' | 'A2' = 'A3'
) => {
  const rollTypeFromMeta =
    (item?.metadata as Record<string, unknown> | null)?.dtf_roll_type as
      | 'A3'
      | 'A2'
      | undefined

  const effectiveRollType =
    rollTypeFromMeta || rollType

  const rollWidths =
    (item?.metadata as Record<string, unknown> | null)?.dtf_roll_width_ft as
      | Record<string, number>
      | null

  if (rollWidths) {
    const explicit =
      rollWidths[effectiveRollType] ??
      rollWidths[effectiveRollType.toLowerCase()]

    if (explicit) {
      return Number(explicit)
    }
  }

  if (effectiveRollType === 'A2') {
    return 2
  }

  if (size === 'A2') {
    return 2
  }

  return getDtfRollWidthFt(size)
}

const num = (value: unknown) =>
  Math.max(0, Number(value) || 0)

const getInventoryServiceKey = (item: InventoryItem) => {
  const metadata = (item.metadata as Record<string, unknown> | null) || {}
  const category = `${item.category || ''}`.trim().toLowerCase()
  const name = `${item.name || ''}`.trim().toLowerCase()
  const combined = `${category} ${name}`
  const metadataService = `${
    (metadata.service_type as string | undefined) ||
    (metadata.service as string | undefined) ||
    (metadata.calculator_type as string | undefined) ||
    ''
  }`.trim().toLowerCase()

  if (
    metadataService === 'dtf' ||
    category.includes('dtf') ||
    name.includes('dtf')
  ) {
    return 'dtf'
  }

  if (
    metadataService === 'direct_image' ||
    metadataService === 'direct image' ||
    metadataService === 'di' ||
    category.includes('direct image') ||
    category.includes('direct-image') ||
    category.includes('di printing') ||
    name.includes('direct image') ||
    name.includes('direct-image') ||
    name.includes('di printing')
  ) {
    if (!/large format|large-format|vinyl|flex|banner|sav|backlit|window|reflective/.test(combined)) {
      return 'direct_image'
    }
  }

  if (
    metadataService === 'large_format' ||
    metadataService === 'large-format' ||
    category.includes('large format') ||
    category.includes('large-format') ||
    /large format|large-format|vinyl|flex|banner|sav|backlit|window|reflective/.test(combined)
  ) {
    return 'large_format'
  }

  return null
}

const money = (value: unknown) =>
  `₦${Number(value || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const today = () =>
  new Date().toISOString().slice(0, 10)

export default function NewJobPage() {
  const supabase = useMemo(
    () => supabaseBrowser(),
    []
  )

  const organizationId =
    getActiveOrganizationId()

  /* DATA */
  const [materials, setMaterials] = useState<
    Material[]
  >([])

  const [services, setServices] = useState<
    ServiceType[]
  >([])

  const [customers, setCustomers] = useState<
    Customer[]
  >([])

  /* UI */
  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [online, setOnline] =
    useState(true)

  const [error, setError] =
    useState('')

  const [success, setSuccess] =
    useState('')

  const [saveSuccess, setSaveSuccess] =
    useState('')

  /* CUSTOMER */
  const [customerId, setCustomerId] =
    useState('')

  const [customerName, setCustomerName] =
    useState('')

  /* ORDER */
  const [jobDate, setJobDate] =
    useState(today())

  const [dueDate, setDueDate] =
    useState('')

  const [priority, setPriority] =
    useState('normal')

  const [notes, setNotes] =
    useState('')

  /* SERVICE */
  const [service, setService] =
    useState<string>('large-format')

  const [inventoryItems, setInventoryItems] =
    useState<InventoryItem[]>([])

  const [diMaterialId, setDiMaterialId] =
    useState('')

  const [dtfMaterialId, setDtfMaterialId] =
    useState('')

  const [diSize, setDiSize] =
    useState('A4')

  const [dtfSize, setDtfSize] =
    useState('A4')

  const [dtfRollType, setDtfRollType] =
    useState<'A3' | 'A2'>('A3')

  const [dtfWidth, setDtfWidth] =
    useState('8.27')

  const [dtfHeight, setDtfHeight] =
    useState('11.69')

  const [dtfUnit, setDtfUnit] =
    useState<'ft' | 'in'>('in')

  const [dtfQuantity, setDtfQuantity] =
    useState('1')

  const [dtfFinishingPrice, setDtfFinishingPrice] =
    useState('0')

  const diMaterialChoices = useMemo(() => {
    return inventoryItems
      .filter(item => item.active !== false)
      .filter(item => getInventoryServiceKey(item) === 'direct_image')
      .map(item => ({
        value: item.id,
        label: item.name,
        baseRate: Number(
          (item.metadata as Record<string, unknown> | null
          )?.di_base_price ?? 0
        ),
      }))
  }, [inventoryItems])

  const diPricingFromInventory = (
    materialId: string,
    size: string
  ) => {
    const item = inventoryItems.find(
      entry => entry.id === materialId
    )

    const allPricing =
      (item?.metadata as Record<string, unknown>
        | null)?.di_pricing as Record<
        string,
        Record<string, number>
      > | null

    const sizePricing =
      allPricing?.[size] || {}

    return {
      front_print:
        Number(sizePricing.front_print || 0),
      back_print:
        Number(sizePricing.back_print || 0),
      laminating:
        Number(sizePricing.laminating || 0),
      cutting:
        Number(sizePricing.cutting || 0),
      stitching:
        Number(sizePricing.stitching || 0),
      spiral_binding:
        Number(
          sizePricing.spiral_binding || 0
        ),
    }
  }

  const [frontPrintPrice, setFrontPrintPrice] =
    useState('0')

  const [backPrintPrice, setBackPrintPrice] =
    useState('0')

  const [laminatingPrice, setLaminatingPrice] =
    useState('0')

  const [cuttingPrice, setCuttingPrice] =
    useState('0')

  const [stitchingPrice, setStitchingPrice] =
    useState('0')

  const [spiralBindingPrice, setSpiralBindingPrice] =
    useState('0')

  /* LARGE FORMAT */
  const [materialId, setMaterialId] =
    useState('')

  const [width, setWidth] =
    useState('4')

  const [height, setHeight] =
    useState('3')

  const [unit, setUnit] =
    useState<'ft' | 'in'>('ft')

  const [quantity, setQuantity] =
    useState('1')

  const [printCut, setPrintCut] =
    useState(false)

  const [printCutRate, setPrintCutRate] =
    useState('180')

  const [designCharge, setDesignCharge] =
    useState('0')

  const [finishingCharge, setFinishingCharge] =
    useState('0')

  /* ORDER QUEUE */
  const [orderLines, setOrderLines] =
    useState<OrderLine[]>([])

  /* PAYMENT */
  const [paymentStatus, setPaymentStatus] =
    useState<
      'FULL PAYMENT' |
      'PART PAYMENT' |
      'UNPAID'
    >('UNPAID')

  const [paymentMethod, setPaymentMethod] =
    useState('cash')

  const [paymentAmount, setPaymentAmount] =
    useState('0')

  /* LOAD DATABASE DATA */
  useEffect(() => {
    let mounted = true

    async function load() {
      if (!organizationId) {
        setError(
          'No active organization was found.'
        )
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      const [
        serviceResult,
        materialResult,
        inventoryResult,
        customerResult,
      ] = await Promise.all([
        supabase
          .from('business_services')
          .select(
            'id,name,category,calculator_type,active,sort_order'
          )
          .eq(
            'organization_id',
            organizationId
          )
          .eq('active', true)
          .order('sort_order')
          .order('name'),

        supabase
          .from('materials')
          .select(
            `
            id,
            name,
            base_name,
            price_per_sqft,
            roll_width_ft,
            initial_length_ft,
            current_length_ft,
            active
          `
          )
          .eq(
            'organization_id',
            organizationId
          )
          .eq('active', true)
          .order('name'),

        supabase
          .from('inventory_items')
          .select(
            'id,name,base_unit,cost_per_unit,sell_price,current_stock,item_kind,metadata,active,category'
          )
          .eq(
            'organization_id',
            organizationId
          )
          .eq('active', true)
          .order('name'),

        supabase
          .from('customers')
          .select(
            'id,name,phone'
          )
          .eq(
            'organization_id',
            organizationId
          )
          .order('name'),
      ])

      if (!mounted) return

      if (serviceResult.error) {
        setError(
          `Unable to load services: ${serviceResult.error.message}`
        )
      }

      if (materialResult.error) {
        setError(
          `Unable to load materials: ${materialResult.error.message}`
        )
      }

      if (inventoryResult.error) {
        setError(
          `Unable to load Large Format inventory: ${inventoryResult.error.message}`
        )
      }

      if (customerResult.error) {
        setError(
          `Unable to load customers: ${customerResult.error.message}`
        )
      }

      const loadedServices = (
        serviceResult.data || []
      ).map(item => ({
        id: item.id,
        name: item.name,
        description: item.category || 'Printing service',
        available: true,
      }))

      const fallbackServices =
        loadedServices.length > 0
          ? loadedServices
          : DEFAULT_SERVICES

      setServices(fallbackServices)

      const loadedInventory =
        (inventoryResult.data || []) as InventoryItem[]

      setInventoryItems(loadedInventory)

      const diInventoryChoices =
        loadedInventory.filter(item => item.active !== false).filter(item => {
          const label = `${item.name || ''}`.toLowerCase()
          const category = `${item.category || ''}`.toLowerCase()

          return (
            category.includes('direct image') ||
            category.includes('di') ||
            label.includes('direct image') ||
            label.includes('photo') ||
            label.includes('canvas') ||
            label.includes('pvc') ||
            label.includes('foam') ||
            label.includes('card') ||
            label.includes('paper') ||
            label.includes('film') ||
            label.includes('print')
          )
        })

      const dtfInventoryChoices =
        loadedInventory.filter(item => item.active !== false).filter(item => {
          const label = `${item.name || ''}`.toLowerCase()
          const category = `${item.category || ''}`.toLowerCase()
          return category.includes('dtf') || label.includes('dtf')
        })

      if (
        diInventoryChoices.length > 0 &&
        (!diMaterialId ||
          !diInventoryChoices.some(item => item.id === diMaterialId))
      ) {
        setDiMaterialId(
          diInventoryChoices[0].id
        )
      }

      if (
        diInventoryChoices.length === 0 &&
        diMaterialId
      ) {
        setDiMaterialId('')
      }

      if (
        dtfInventoryChoices.length > 0 &&
        (!dtfMaterialId ||
          !dtfInventoryChoices.some(item => item.id === dtfMaterialId))
      ) {
        setDtfMaterialId(
          dtfInventoryChoices[0].id
        )
      }

      if (
        dtfInventoryChoices.length === 0 &&
        dtfMaterialId
      ) {
        setDtfMaterialId('')
      }

      /*
       * Match the legacy material to the migrated inventory item.
       * The migration stores materials.id in:
       * inventory_items.metadata.legacy_material_id
       */
      const loadedMaterials = (
        (materialResult.data || []) as Material[]
      ).map(material => {
        const matchedInventory =
          loadedInventory.find(item => {
            const legacyId =
              item.metadata?.legacy_material_id

            return (
              String(legacyId || '') ===
              String(material.id)
            )
          }) ||
          loadedInventory.find(
            item =>
              item.name.trim().toLowerCase() ===
              material.name.trim().toLowerCase()
          )

        return {
          ...material,
          inventory_item_id:
            matchedInventory?.id || null,
          inventory_current_stock:
            matchedInventory
              ? num(matchedInventory.current_stock)
              : null,
        }
      })

      setMaterials(
        loadedMaterials
      )

      const largeFormatDefaults = loadedMaterials.filter(item => {
        const combined = `${item.name || ''} ${item.base_name || ''}`.toLowerCase()
        return !/(^|\s|-)dtf\b|direct image|di printing|photo|canvas|pvc|foam|card|paper|film|backlit/.test(combined)
      })

      setCustomers(
        dedupeCustomersByName(
          (customerResult.data || []) as Customer[]
        )
      )

      if (
        largeFormatDefaults.length > 0 &&
        (!materialId || !largeFormatDefaults.some(item => item.id === materialId))
      ) {
        setMaterialId(
          largeFormatDefaults[0].id
        )
      }

      setService(currentService =>
        currentService &&
        fallbackServices.some(
          item => item.id === currentService
        )
          ? currentService
          : fallbackServices[0]?.id || 'large-format'
      )

      setLoading(false)
    }

    void load()

    return () => {
      mounted = false
    }
  }, [
    organizationId,
    supabase,
  ])

  /* ONLINE STATUS */
  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return
    }

    const onlineHandler = () =>
      setOnline(true)

    const offlineHandler = () =>
      setOnline(false)

    setOnline(
      navigator.onLine
    )

    window.addEventListener(
      'online',
      onlineHandler
    )

    window.addEventListener(
      'offline',
      offlineHandler
    )

    return () => {
      window.removeEventListener(
        'online',
        onlineHandler
      )

      window.removeEventListener(
        'offline',
        offlineHandler
      )
    }
  }, [])

  const selectedService =
    useMemo(
      () =>
        services.find(
          item =>
            item.id ===
            service
        ),
      [
        services,
        service,
      ]
    )

  const isDIService =
    service === 'direct-image' ||
    service === 'di' ||
    (
      selectedService?.name
        ?.toLowerCase()
        .includes('direct image') ||
      selectedService?.name
        ?.toLowerCase()
        .includes('di printing') ||
      selectedService?.name
        ?.toLowerCase()
        .includes('di ')
    )

  const isProductionService =
    service === 'large-format' ||
    service === 'dtf' ||
    (
      selectedService?.name
        ?.toLowerCase()
        .includes('large format') ||
      selectedService?.name
        ?.toLowerCase()
        .includes('dtf')
    )

  const largeFormatMaterials = useMemo(() => {
    return materials.filter(item => {
      const combined = `${item.name || ''} ${item.base_name || ''}`.toLowerCase()

      return !/(^|\s|-)dtf\b|direct image|di printing|photo|canvas|pvc|foam|card|paper|film|backlit/.test(combined)
    })
  }, [materials])

  const selectedMaterial =
    useMemo(
      () =>
        materials.find(
          item =>
            item.id ===
            materialId
        ),
      [
        materials,
        materialId,
      ]
    )

  const selectedDIInventoryMaterial =
    useMemo(
      () =>
        inventoryItems.find(
          item =>
            item.id ===
            diMaterialId
        ),
      [
        inventoryItems,
        diMaterialId,
      ]
    )

  const selectedDIMaterial =
    diMaterialChoices.find(
      item =>
        item.value ===
        diMaterialId
    ) ||
    diMaterialChoices[0]

  const dtfMaterialChoices = useMemo(() => {
    return inventoryItems
      .filter(item => item.active !== false)
      .filter(item => getInventoryServiceKey(item) === 'dtf')
      .map(item => ({
        value: item.id,
        label: item.name,
        pricing: (item.metadata as Record<string, unknown> | null)?.dtf_pricing as Record<string, number> | null || {},
      }))
  }, [inventoryItems])

  const selectedDTFMaterial = useMemo(
    () =>
      dtfMaterialChoices.find(
        item =>
          item.value ===
          dtfMaterialId
      ) ||
      dtfMaterialChoices[0],
    [dtfMaterialChoices, dtfMaterialId]
  )

  const dtfBasePrice = useMemo(() => {
    const requested = selectedDTFMaterial?.pricing?.[dtfSize as keyof typeof selectedDTFMaterial.pricing] ?? selectedDTFMaterial?.pricing?.[dtfSize.toLowerCase() as keyof typeof selectedDTFMaterial.pricing]
    const fallback = DTF_SIZE_OPTIONS.find(option => option.value === dtfSize)?.defaultRate || 0
    return Number(requested || fallback || 0)
  }, [dtfSize, selectedDTFMaterial])

  const dtfRollWidthFt = useMemo(() => {
    const inventoryItem = inventoryItems.find(
      item => item.id === dtfMaterialId
    )

    return getDtfRollWidthFromMetadata(
      inventoryItem,
      dtfSize,
      dtfRollType
    )
  }, [dtfMaterialId, dtfRollType, dtfSize, inventoryItems])

  const dtfRollDimensions = `${dtfRollWidthFt.toFixed(1)}ft x ${DTF_ROLL_LENGTH_FT.toFixed(2)}ft`

  const dtfPrintWidthFt =
    dtfUnit === 'in' ? num(dtfWidth) / 12 : num(dtfWidth)

  const dtfPrintHeightFt =
    dtfUnit === 'in' ? num(dtfHeight) / 12 : num(dtfHeight)

  const dtfPrintAreaSqFt =
    dtfPrintWidthFt * dtfPrintHeightFt

  const dtfMaterialUsedFt =
    dtfPrintAreaSqFt > 0 && dtfRollWidthFt > 0
      ? (dtfPrintAreaSqFt / dtfRollWidthFt) * Math.max(1, Math.floor(num(dtfQuantity) || 1))
      : 0

  const dtfFinishingCharge = num(dtfFinishingPrice)

  const dtfJobTotal =
    dtfBasePrice * Math.max(1, Math.floor(num(dtfQuantity) || 1)) +
    dtfFinishingCharge

  const diBaseCharge =
    Number(
      (selectedDIInventoryMaterial?.metadata as Record<string, unknown>
        | null)?.di_base_price ||
        selectedDIMaterial?.baseRate ||
        0
    )

  const diPrintCharge =
    num(frontPrintPrice)

  const diDesignCharge =
    num(designCharge)

  const diLaminatingCharge =
    num(laminatingPrice)

  const diCuttingCharge =
    num(cuttingPrice)

  const diStitchingCharge =
    num(stitchingPrice)

  const diSpiralBindingCharge =
    num(spiralBindingPrice)

  const diFinishingTotal =
    diLaminatingCharge +
    diCuttingCharge +
    diStitchingCharge +
    diSpiralBindingCharge

  const diSummaryRows = [
    { label: 'Base price', value: diBaseCharge },
    { label: 'Front / Back print', value: diPrintCharge },
    { label: 'Lamination', value: diLaminatingCharge },
    { label: 'Cutting', value: diCuttingCharge },
    { label: 'Stitching / Spiral', value: diStitchingCharge + diSpiralBindingCharge },
    { label: 'Design charge', value: diDesignCharge },
  ]

  /* CURRENT CALCULATOR */
  const widthFt =
    unit === 'in'
      ? num(width) / 12
      : num(width)

  const heightFt =
    unit === 'in'
      ? num(height) / 12
      : num(height)

  const qty =
    Math.max(
      1,
      Math.floor(
        num(quantity) || 1
      )
    )

  const areaPerPiece =
    widthFt * heightFt

  const billedSqFt =
    areaPerPiece * qty

  const rollWidth =
    num(
      selectedMaterial
        ?.roll_width_ft
    )

  const linearLengthFt =
    rollWidth > 0
      ? (
          areaPerPiece /
          rollWidth
        ) * qty
      : 0

  const materialRate =
    num(
      selectedMaterial
        ?.price_per_sqft
    )

  const materialTotal =
    billedSqFt *
    materialRate

  const cutRate =
    num(printCutRate)

  const printCutCharge =
    printCut
      ? billedSqFt * cutRate
      : 0

  const design =
    num(designCharge)

  const finishing =
    num(finishingCharge)

  const productionTotal =
    materialTotal +
    printCutCharge

  const isDTFService =
    service === 'dtf' ||
    (
      selectedService?.name
        ?.toLowerCase()
        .includes('dtf')
    )

  useEffect(() => {
    if (
      !service ||
      service !== 'large-format' ||
      isDIService ||
      isDTFService
    ) {
      return
    }

    if (
      largeFormatMaterials.length > 0 &&
      (!materialId || !largeFormatMaterials.some(item => item.id === materialId))
    ) {
      setMaterialId(largeFormatMaterials[0].id)
    }
  }, [service, isDIService, isDTFService, largeFormatMaterials, materialId])

  const currentGrandTotal =
    isDIService
      ? diBaseCharge +
        diPrintCharge +
        diDesignCharge +
        diFinishingTotal
      : isDTFService
        ? dtfJobTotal
        : productionTotal +
          design +
          finishing

  /*
   * The migrated inventory_items table is the live Workspace stock.
   * Fall back to legacy materials only if an item has not yet been
   * migrated.
   */
  const selectedInventoryStock =
    selectedMaterial
      ? selectedMaterial.inventory_current_stock !==
          null &&
        selectedMaterial.inventory_current_stock !==
          undefined
        ? num(
            selectedMaterial.inventory_current_stock
          )
        : num(
            selectedMaterial.current_length_ft
          )
      : 0

  const inventoryInsufficient =
    selectedMaterial
      ? linearLengthFt >
        selectedInventoryStock
      : false

  /* QUEUED ORDER TOTALS */
  const queuedSubtotal =
    orderLines.reduce(
      (
        total,
        line
      ) =>
        total +
        line.grandTotal,
      0
    )

  const orderGrandTotal =
    queuedSubtotal +
    (orderLines.length === 0
      ? currentGrandTotal
      : 0)

  const queuedMaterialLength =
    orderLines.reduce(
      (
        total,
        line
      ) =>
        total +
        line.linearLengthFt,
      0
    )

  /* PAYMENT */
  const fullPaymentAmount =
    orderGrandTotal

  const actualPaymentAmount =
    paymentStatus ===
    'FULL PAYMENT'
      ? orderGrandTotal
      : paymentStatus ===
          'PART PAYMENT'
        ? Math.min(
            num(paymentAmount),
            orderGrandTotal
          )
        : 0

  const balance =
    Math.max(
      0,
      orderGrandTotal -
        actualPaymentAmount
    )

  function resetCalculator() {
    setWidth('4')
    setHeight('3')
    setUnit('ft')
    setQuantity('1')
    setPrintCut(false)
    setDesignCharge('0')
    setFinishingCharge('0')
    setDtfSize('A4')
    setDtfRollType('A3')
    setDtfWidth('8.27')
    setDtfHeight('11.69')
    setDtfUnit('in')
    setDtfQuantity('1')
    setDtfFinishingPrice('0')
  }

  function addJobToQueue() {
    setError('')
    setSuccess('')

    if (!service) {
      setError(
        'Select a service before adding the job.'
      )
      return
    }

    if (isDIService) {
      const selectedDI =
        diMaterialChoices.find(
          item =>
            item.value ===
            diMaterialId
        ) ||
        diMaterialChoices[0]

      if (!selectedDI) {
        setError(
          'Add a Direct Image material in inventory before creating this job.'
        )
        return
      }

      const line: OrderLine = {
        id:
          typeof crypto !==
          'undefined' &&
          crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,

        service,

        materialId:
          selectedDI.value,

        inventoryItemId:
          selectedDI.value,

        materialName:
          `${selectedDI.label}`,

        directImageSize: diSize,

        width: 0,

        height: 0,

        unit: 'in',

        quantity: qty,

        billedSqFt: 0,

        linearLengthFt: 0,

        materialRate:
          diBaseCharge,

        materialTotal:
          diBaseCharge,

        printCut: false,

        printCutRate: 0,

        printCutCharge: 0,

        designCharge:
          diDesignCharge,

        finishingCharge:
          diFinishingTotal,

        productionTotal:
          (diBaseCharge +
            diPrintCharge +
            diFinishingTotal) * qty +
          diDesignCharge,

        grandTotal:
          (diBaseCharge +
            diPrintCharge +
            diFinishingTotal) * qty +
          diDesignCharge,
      }

      setOrderLines(
        previous => [
          ...previous,
          line,
        ]
      )

      resetCalculator()
      setSuccess(
        'DI job added to the current order queue.'
      )
      return
    }

    if (isDTFService) {
      const selectedDTF = selectedDTFMaterial
      if (!selectedDTF) {
        setError(
          'Add a DTF material in inventory before creating this job.'
        )
        return
      }

      const quantity = Math.max(1, Math.floor(num(dtfQuantity) || 1))
      const line: OrderLine = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        service,
        materialId: selectedDTF.value,
        inventoryItemId: selectedDTF.value,
        materialName: `${selectedDTF.label} (${dtfSize})`,
        directImageSize: dtfSize,
        width: dtfPrintWidthFt,
        height: dtfPrintHeightFt,
        unit: dtfUnit,
        quantity,
        billedSqFt: dtfPrintAreaSqFt * quantity,
        linearLengthFt: dtfMaterialUsedFt,
        materialRate: dtfBasePrice,
        materialTotal: dtfBasePrice * quantity,
        printCut: false,
        printCutRate: 0,
        printCutCharge: 0,
        designCharge: 0,
        finishingCharge: dtfFinishingCharge,
        productionTotal: dtfJobTotal,
        grandTotal: dtfJobTotal,
      }

      setOrderLines(previous => [...previous, line])
      resetCalculator()
      setSuccess('DTF job added to the current order queue.')
      return
    }

    if (!materialId) {
      setError(
        'Select a material before adding the job.'
      )
      return
    }

    if (!selectedMaterial) {
      setError(
        'The selected material could not be found.'
      )
      return
    }

    if (
      widthFt <= 0 ||
      heightFt <= 0
    ) {
      setError(
        'Enter valid width and height.'
      )
      return
    }

    if (qty <= 0) {
      setError(
        'Quantity must be at least 1.'
      )
      return
    }

    if (inventoryInsufficient) {
      setError(
        `Insufficient ${selectedMaterial.name} stock. Available ${num(
          selectedMaterial.current_length_ft
        ).toFixed(
          2
        )} ft, but this job requires ${linearLengthFt.toFixed(
          2
        )} ft.`
      )
      return
    }

    const line: OrderLine = {
      id:
        typeof crypto !==
        'undefined' &&
        crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,

      service,

      materialId,

      inventoryItemId:
        selectedMaterial.inventory_item_id ||
        null,

      materialName:
        selectedMaterial.name,

      width:
        widthFt,

      height:
        heightFt,

      unit,

      quantity:
        qty,

      billedSqFt,

      linearLengthFt,

      materialRate,

      materialTotal,

      printCut,

      printCutRate:
        cutRate,

      printCutCharge,

      designCharge:
        design,

      finishingCharge:
        finishing,

      productionTotal,

      grandTotal:
        currentGrandTotal,
    }

    setOrderLines(
      previous => [
        ...previous,
        line,
      ]
    )

    /*
     * Reset only the calculator.
     * Customer and order information remain.
     */
    resetCalculator()

    setSuccess(
      'Job added to the current order queue.'
    )
  }

  function removeQueuedJob(
    lineId: string
  ) {
    setOrderLines(
      previous =>
        previous.filter(
          line =>
            line.id !==
            lineId
        )
    )
  }

  function clearQueue() {
    setOrderLines([])
    setPaymentAmount('0')
    setPaymentStatus(
      'UNPAID'
    )
    setError('')
    setSuccess('')
  }

  function choosePaymentStatus(
    status:
      | 'FULL PAYMENT'
      | 'PART PAYMENT'
      | 'UNPAID'
  ) {
    setPaymentStatus(status)

    if (
      status ===
      'FULL PAYMENT'
    ) {
      setPaymentAmount(
        String(
          orderGrandTotal
        )
      )
    }

    if (
      status ===
      'UNPAID'
    ) {
      setPaymentAmount('0')
    }

    if (
      status ===
      'PART PAYMENT'
    ) {
      if (
        num(paymentAmount) <=
        0
      ) {
        setPaymentAmount(
          '0'
        )
      }
    }
  }

  async function ensureCustomer(): Promise<string> {
    if (customerId) {
      return customerId
    }

    const name =
      customerName.trim()

    const { data: matchingCustomers, error: customerLookupError } =
      await supabase
        .from('customers')
        .select('id,name')
        .eq('organization_id', organizationId)
        .ilike('name', name)
        .limit(10)

    if (customerLookupError) throw customerLookupError

    const existingCustomer = (matchingCustomers || []).find(
      (customer: { id: string; name: string }) =>
        customer.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (existingCustomer) return existingCustomer.id

    if (!name) {
      throw new Error(
        'Enter or select a customer.'
      )
    }

    const legacyCustomerId =
      `CUST-${Date.now()
        .toString()
        .slice(-10)}`

    const {
      data,
      error,
    } = await supabase
      .from('customers')
      .insert({
        organization_id:
          organizationId,

        legacy_customer_id:
          legacyCustomerId,

        name,
      })
      .select('id')
      .single()

    if (error) {
      throw error
    }

    if (!data?.id) {
      throw new Error(
        'Unable to create customer.'
      )
    }

    return data.id
  }

  async function saveOrder() {
    setError('')
    setSaveSuccess('')

    if (!organizationId) {
      setError(
        'No active organization was found.'
      )
      return
    }

    if (!online) {
      setError(
        'You are offline. Connect to the internet before saving the order.'
      )
      return
    }

    if (!customerName.trim()) {
      setError(
        'Enter or select a customer.'
      )
      return
    }

    /*
     * Require at least one queued job.
     */
    if (
      orderLines.length ===
      0
    ) {
      setError(
        'Add at least one job to the order queue before saving.'
      )
      return
    }

    if (
      paymentStatus ===
        'PART PAYMENT' &&
      actualPaymentAmount <= 0
    ) {
      setError(
        'Enter the amount received for part payment.'
      )
      return
    }

    setSaving(true)

    try {
      const cid =
        await ensureCustomer()

      let sharedReceiptNo: string | null = null
      const { data: receiptData, error: receiptError } =
        await supabase.rpc('get_customer_day_receipt', {
          p_organization_id: organizationId,
          p_customer_id: cid,
          p_date: jobDate,
        })

      if (!receiptError && receiptData) {
        sharedReceiptNo = String(receiptData)
      } else {
        const { data: existingJobs } = await supabase
          .from('jobs')
          .select('receipt_no')
          .eq('organization_id', organizationId)
          .eq('customer_id', cid)
          .eq('job_date', jobDate)
          .not('receipt_no', 'is', null)
          .limit(1)

        sharedReceiptNo = existingJobs?.[0]?.receipt_no || null
      }

      if (!sharedReceiptNo && cid && jobDate) {
        const fallback = await supabase.rpc('get_customer_day_receipt', {
          p_organization_id: organizationId,
          p_customer_id: cid,
          p_date: jobDate,
        })

        if (!fallback.error && fallback.data) {
          sharedReceiptNo = String(fallback.data)
        }
      }

      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const unifiedLines = orderLines.map(line => {
        const inventoryItem = inventoryItems.find(
          item => item.id === line.inventoryItemId
        )
        if (!inventoryItem) {
          throw new Error(`${line.materialName} is no longer available in inventory.`)
        }

        const metadata = inventoryItem.metadata as Record<string, unknown> | null
        const stockUnit = String(
          metadata?.stock_unit || inventoryItem.base_unit || 'pcs'
        ).toLowerCase()
        const consumesLinearFeet =
          (stockUnit === 'ft' || stockUnit === 'linear_ft') &&
          line.linearLengthFt > 0
        const consumptionQuantity = consumesLinearFeet
          ? line.linearLengthFt
          : line.quantity
        const consumptionUnit =
          stockUnit === 'linear_ft' ? 'ft' : stockUnit
        const itemCost = num(inventoryItem.cost_per_unit) * consumptionQuantity

        return {
          service_id: uuidPattern.test(line.service) ? line.service : null,
          description: line.materialName,
          specifications: {
            direct_image_size: line.directImageSize || null,
            width: line.width,
            height: line.height,
            unit: line.unit,
            billed_sqft: line.billedSqFt,
            print_cut: line.printCut,
            print_cut_charge: line.printCutCharge,
            design_charge: line.designCharge,
            finishing_charge: line.finishingCharge,
          },
          quantity: line.quantity,
          unit: consumptionUnit,
          unit_price: line.grandTotal / Math.max(1, line.quantity),
          line_total: line.grandTotal,
          estimated_cost: itemCost,
          consumption: [{
            inventory_item_id: inventoryItem.id,
            quantity: consumptionQuantity,
            unit: consumptionUnit,
            cost: itemCost,
          }],
        }
      })

      const { data: orderResult, error: orderError } =
        await supabase.rpc('create_unified_order_v36', {
          p_organization_id: organizationId,
          p_customer_id: cid,
          p_customer_name: customerName.trim(),
          p_job_date: jobDate,
          p_due_at: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
          p_notes: notes.trim() || null,
          p_lines: unifiedLines,
        })

      if (
        orderError &&
        /could not find the function|schema cache|function .* does not exist/i.test(
          orderError.message
        )
      ) {
        let remainingPayment = actualPaymentAmount

        for (let index = 0; index < orderLines.length; index++) {
          const line = orderLines[index]
          const inventoryItem = inventoryItems.find(
            item => item.id === line.inventoryItemId
          )
          if (!inventoryItem) {
            throw new Error(`${line.materialName} is no longer available in inventory.`)
          }

          let legacyMaterial = materials.find(material =>
            material.id === line.materialId ||
            material.name.trim().toLowerCase() === line.materialName.trim().toLowerCase()
          )

          if (!legacyMaterial && line.directImageSize) {
            const { data: insertedMaterial, error: materialError } =
              await supabase
                .from('materials')
                .insert({
                  organization_id: organizationId,
                  name: inventoryItem.name,
                  base_name: inventoryItem.category || inventoryItem.name,
                  price_per_sqft: 0,
                  roll_width_ft: 1,
                  initial_length_ft: num(inventoryItem.current_stock),
                  current_length_ft: num(inventoryItem.current_stock),
                  active: true,
                })
                .select('id,name,base_name,price_per_sqft,roll_width_ft,initial_length_ft,current_length_ft,active')
                .single()

            if (materialError) throw materialError
            legacyMaterial = insertedMaterial as Material
          }

          if (!legacyMaterial) {
            throw new Error(`${line.materialName} has no compatible material record for saving this job.`)
          }

          const currentMetadata =
            (inventoryItem.metadata || {}) as Record<string, unknown>
          if (
            String(currentMetadata.legacy_material_id || '') !==
            String(legacyMaterial.id)
          ) {
            const { error: linkError } = await supabase
              .from('inventory_items')
              .update({
                metadata: {
                  ...currentMetadata,
                  legacy_material_id: legacyMaterial.id,
                },
              })
              .eq('id', inventoryItem.id)
              .eq('organization_id', organizationId)
            if (linkError) throw linkError
          }

          const jobPayment = Math.min(remainingPayment, line.grandTotal)
          const { data: createdJobId, error: legacySaveError } =
            await supabase.rpc('create_job_with_inventory', {
              p_organization_id: organizationId,
              p_job_no: null,
              p_customer_id: cid,
              p_customer_name: customerName.trim(),
              p_job_date: jobDate,
              p_material_id: legacyMaterial.id,
              p_print_cut: line.printCut,
              p_width: line.width,
              p_height: line.height,
              p_qty: line.quantity,
              p_unit: line.directImageSize ? 'pcs' : 'ft',
              p_billed_sqft: line.billedSqFt,
              p_linear_length_ft: line.linearLengthFt,
              p_production_total: line.productionTotal,
              p_design_charge: line.designCharge + line.finishingCharge,
              p_grand_total: line.grandTotal,
              p_amount_paid: jobPayment,
              p_payment_method: paymentMethod,
              p_receipt_no: sharedReceiptNo,
            })

          if (legacySaveError) throw legacySaveError
          if (!createdJobId) {
            throw new Error(`Job ${index + 1} was not returned by the database.`)
          }

          const consumptionQuantity = line.directImageSize
            ? line.quantity
            : line.linearLengthFt
          if (consumptionQuantity > 0) {
            const { error: inventoryError } = await supabase.rpc(
              'netvyl_consume_inventory_for_order',
              {
                p_organization_id: organizationId,
                p_order_id: String(createdJobId),
                p_consumption: [{
                  inventory_item_id: inventoryItem.id,
                  quantity: consumptionQuantity,
                  unit: line.directImageSize ? 'pcs' : 'ft',
                  cost: num(inventoryItem.cost_per_unit) * consumptionQuantity,
                }],
              }
            )
            if (inventoryError) throw inventoryError
          }

          remainingPayment = Math.max(0, remainingPayment - jobPayment)
        }

        if (sharedReceiptNo) {
          const [{ error: jobsReceiptError }, { error: paymentsReceiptError }] =
            await Promise.all([
              supabase
                .from('jobs')
                .update({ receipt_no: sharedReceiptNo })
                .eq('organization_id', organizationId)
                .eq('customer_id', cid)
                .eq('job_date', jobDate),
              supabase
                .from('payments')
                .update({ receipt_no: sharedReceiptNo })
                .eq('organization_id', organizationId)
                .eq('customer_id', cid)
                .eq('payment_date', jobDate),
            ])
          if (jobsReceiptError) throw jobsReceiptError
          if (paymentsReceiptError) throw paymentsReceiptError
        }

        setSaveSuccess(
          `Order saved successfully. ${orderLines.length} job${orderLines.length === 1 ? '' : 's'} created successfully and sent to the production queue.`
        )
        setOrderLines([])
        return
      }

      if (orderError) throw orderError
      if (!orderResult?.order_id) {
        throw new Error('The order was not returned by the database.')
      }

      if (actualPaymentAmount > 0) {
        const { error: paymentError } = await supabase.rpc(
          'record_unified_order_payment_v36',
          {
            p_order_id: orderResult.order_id,
            p_amount: actualPaymentAmount,
            p_method: paymentMethod,
            p_reference: null,
          }
        )
        if (paymentError) {
          throw new Error(`Order ${orderResult.order_no} was saved, but payment recording failed: ${paymentError.message}`)
        }

      }

      if (sharedReceiptNo) {
        const [{ error: jobReceiptError }, { error: paymentReceiptError }] =
          await Promise.all([
            supabase
              .from('jobs')
              .update({ receipt_no: sharedReceiptNo })
              .eq('organization_id', organizationId)
              .eq('customer_id', cid)
              .eq('job_date', jobDate),
            supabase
              .from('payments')
              .update({ receipt_no: sharedReceiptNo })
              .eq('organization_id', organizationId)
              .eq('customer_id', cid)
              .eq('payment_date', jobDate),
          ])
        if (jobReceiptError) throw jobReceiptError
        if (paymentReceiptError) throw paymentReceiptError
      }

      const createdJobs = orderLines

      setSaveSuccess(
        `Order saved successfully. ${createdJobs.length} job${
          createdJobs.length ===
          1
            ? ''
            : 's'
        } created successfully and sent to the production queue.`
      )

      setOrderLines([])

    } catch (
      err: any
    ) {
      console.error(
        'SAVE ORDER ERROR:',
        err
      )

      setError(
        err?.message ||
          err?.details ||
          'Unable to save the order.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHead
          title="New Job"
          subtitle="Create and queue customer jobs."
        />

        <div className="card">
          <div
            style={{
              padding: 24,
            }}
          >
            Loading customers and
            materials…
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="New Job"
        subtitle="Build the customer order, add jobs to the queue, then save the complete order."
        actions={
          online ? (
            <Badge tone="success">
              Cloud Connected
            </Badge>
          ) : (
            <Badge tone="warning">
              Offline
            </Badge>
          )
        }
      />

      <div className="workspace-grid">

        {/* LEFT */}
        <section className="card form-card">

          {/* SERVICE */}
          <div className="section-head">
            <div>
              <h3>
                Service
              </h3>

              <span>
                Select the service for this job.
              </span>
            </div>
          </div>

          <label>
            Service

            <select
              value={service}
              onChange={e =>
                setService(
                  e.target.value
                )
              }
            >
              {services.map(
                item => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                    {!item.available
                      ? ' — Coming soon'
                      : ''}
                  </option>
                )
              )}
            </select>
          </label>

          {isDIService && (
            <div
              className="card"
              style={{
                marginTop: 18,
                padding: 18,
                background: '#0d0d10',
                borderColor: '#2a2a2d',
                color: '#f5f5f5',
                boxShadow: '0 20px 45px rgba(0, 0, 0, 0.34)',
              }}
            >
              <div className="section-head" style={{ color: '#f5f5f5' }}>
                <div>
                  <h3 style={{ color: '#f5f5f5' }}>DI setup</h3>
                  <span style={{ color: '#c7c7cc' }}>
                    Select material, size, and finishing charges for direct image jobs.
                  </span>
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 18 }}>
                <label style={{ color: '#f5f5f5' }}>
                  DI material
                  {diMaterialChoices.length === 0 ? (
                    <div
                      className="notice"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        color: '#f5f5f5',
                        borderColor: '#36363b',
                        marginTop: 8,
                      }}
                    >
                      No DI materials have been added in inventory yet. Add one in the inventory page first.
                    </div>
                  ) : (
                    <select
                      value={diMaterialId}
                      onChange={e => setDiMaterialId(e.target.value)}
                      style={{ background: '#18181b', color: '#fff', borderColor: '#3a3a40' }}
                    >
                      {diMaterialChoices.map(option => (
                        <option
                          key={option.value}
                          value={option.value}
                          style={{ background: '#18181b', color: '#fff' }}
                        >
                          {option.label} ({money(option.baseRate || 0)})
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              </div>

              <div className="grid2" style={{ marginTop: 18 }}>
                <label style={{ color: '#f5f5f5' }}>
                  Front / Back print price
                  <input
                    type="number"
                    value={frontPrintPrice}
                    onChange={e => {
                      const value = e.target.value
                      setFrontPrintPrice(value)
                      setBackPrintPrice(value)
                    }}
                    style={{ background: '#18181b', color: '#fff', borderColor: '#3a3a40' }}
                  />
                </label>

                <label style={{ color: '#f5f5f5' }}>
                  Design charge
                  <input
                    type="number"
                    value={designCharge}
                    onChange={e => setDesignCharge(e.target.value)}
                    style={{ background: '#18181b', color: '#fff', borderColor: '#3a3a40' }}
                  />
                </label>
              </div>

              <div className="grid2" style={{ marginTop: 18 }}>
                <label style={{ color: '#f5f5f5' }}>
                  Cutting charge
                  <input
                    type="number"
                    value={cuttingPrice}
                    onChange={e => setCuttingPrice(e.target.value)}
                    style={{ background: '#18181b', color: '#fff', borderColor: '#3a3a40' }}
                  />
                </label>

                <label style={{ color: '#f5f5f5' }}>
                  Lamination charge
                  <input
                    type="number"
                    value={laminatingPrice}
                    onChange={e => setLaminatingPrice(e.target.value)}
                    style={{ background: '#18181b', color: '#fff', borderColor: '#3a3a40' }}
                  />
                </label>

                <label style={{ color: '#f5f5f5' }}>
                  Stitching / Spiral binding
                  <input
                    type="number"
                    value={stitchingPrice}
                    onChange={e => setStitchingPrice(e.target.value)}
                    style={{ background: '#18181b', color: '#fff', borderColor: '#3a3a40' }}
                  />
                </label>

                <label style={{ color: '#f5f5f5' }}>
                  Spiral binding
                  <input
                    type="number"
                    value={spiralBindingPrice}
                    onChange={e => setSpiralBindingPrice(e.target.value)}
                    style={{ background: '#18181b', color: '#fff', borderColor: '#3a3a40' }}
                  />
                </label>
              </div>

              <div
                style={{
                  marginTop: 18,
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid #2d2d32',
                  background: '#121216',
                  color: '#fff',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 10, color: '#fff' }}>
                  DI price summary
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {diSummaryRows.map(row => (
                    <div
                      key={row.label}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        color: '#e8e8eb',
                        fontSize: 13,
                      }}
                    >
                      <span>{row.label}</span>
                      <strong style={{ color: '#fff' }}>{money(row.value)}</strong>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid #2d2d32',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    fontWeight: 700,
                  }}
                >
                  <span>Total</span>
                  <span>{money(currentGrandTotal)}</span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 18,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="btn primary"
                  disabled={
                    !diMaterialId ||
                    currentGrandTotal <= 0
                  }
                  onClick={addJobToQueue}
                >
                  + Add Job to Order
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={resetCalculator}
                >
                  Clear Calculator
                </button>
              </div>
            </div>
          )}

          {/* CUSTOMER */}
          <div
            className="section-head"
            style={{
              marginTop: 24,
            }}
          >
            <div>
              <h3>
                Customer
              </h3>

              <span>
                The same customer can have multiple jobs in this order.
              </span>
            </div>
          </div>

          <div className="grid2">

            <label>
              Existing customer

              <select
                value={
                  customerId
                }
                onChange={e => {
                  const id =
                    e.target
                      .value

                  setCustomerId(
                    id
                  )

                  const found =
                    customers.find(
                      item =>
                        item.id ===
                        id
                    )

                  setCustomerName(
                    found?.name ||
                      ''
                  )
                }}
              >
                <option value="">
                  New customer
                </option>

                {customers.map(
                  item => (
                    <option
                      key={
                        item.id
                      }
                      value={
                        item.id
                      }
                    >
                      {
                        item.name
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              Customer name

              <input
                value={
                  customerName
                }
                onChange={e => {
                  setCustomerName(
                    e.target
                      .value
                  )

                  if (
                    customerId
                  ) {
                    setCustomerId(
                      ''
                    )
                  }
                }}
                placeholder="Customer or company name"
              />
            </label>

          </div>

          {/* JOB INFO */}
          <div
            className="section-head"
            style={{
              marginTop: 24,
            }}
          >
            <div>
              <h3>
                Order Details
              </h3>

              <span>
                These details apply to the current order.
              </span>
            </div>
          </div>

          <div className="grid2">

            <label>
              Job date

              <input
                type="date"
                value={
                  jobDate
                }
                onChange={e =>
                  setJobDate(
                    e.target
                      .value
                  )
                }
              />
            </label>

            <label>
              Due date

              <input
                type="date"
                value={
                  dueDate
                }
                onChange={e =>
                  setDueDate(
                    e.target
                      .value
                  )
                }
              />
            </label>

            <label>
              Priority

              <select
                value={
                  priority
                }
                onChange={e =>
                  setPriority(
                    e.target
                      .value
                  )
                }
              >
                <option value="normal">
                  Normal
                </option>

                <option value="high">
                  High
                </option>

                <option value="urgent">
                  Urgent
                </option>
              </select>
            </label>

          </div>

          {isDTFService && (
            <>
              <div className="section-head" style={{ marginTop: 24 }}>
                <div>
                  <h3>DTF Calculator</h3>
                  <span>Set the print size and quantity, then add the job to the order queue.</span>
                </div>
                <Badge tone="wine">Live</Badge>
              </div>

              <div className="grid2">
                <label>
                  DTF material
                  {dtfMaterialChoices.length === 0 ? (
                    <div className="notice" style={{ marginTop: 8 }}>
                      No DTF materials have been added in inventory yet. Add one in the inventory page first.
                    </div>
                  ) : (
                    <select value={dtfMaterialId} onChange={e => setDtfMaterialId(e.target.value)}>
                      {dtfMaterialChoices.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  )}
                </label>

                <label>
                  Add new roll as
                  <select value={dtfRollType} onChange={e => setDtfRollType(e.target.value as 'A3' | 'A2')}>
                    <option value="A3">A3 material roll</option>
                    <option value="A2">A2 material roll</option>
                  </select>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#b7b7bf' }}>
                    Roll size: {dtfRollDimensions}
                  </div>
                </label>

                <label>
                  Print size
                  <select value={dtfSize} onChange={e => {
                    const nextSize = e.target.value
                    const defaults = DTF_SIZE_DIMENSIONS_IN[nextSize as keyof typeof DTF_SIZE_DIMENSIONS_IN]
                    setDtfSize(nextSize)
                    setDtfWidth(String(defaults.width))
                    setDtfHeight(String(defaults.height))
                  }}>
                    {DTF_SIZE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Width
                  <input type="number" min="0" step="0.01" value={dtfWidth} onChange={e => setDtfWidth(e.target.value)} />
                </label>

                <label>
                  Height
                  <input type="number" min="0" step="0.01" value={dtfHeight} onChange={e => setDtfHeight(e.target.value)} />
                </label>

                <label>
                  Unit
                  <select value={dtfUnit} onChange={e => setDtfUnit(e.target.value as 'ft' | 'in')}>
                    <option value="in">Inches</option>
                    <option value="ft">Feet</option>
                  </select>
                </label>

                <label>
                  Quantity
                  <input type="number" min="1" step="1" value={dtfQuantity} onChange={e => setDtfQuantity(e.target.value)} />
                </label>

                <label>
                  Finishing price
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={dtfFinishingPrice}
                    onChange={e => setDtfFinishingPrice(e.target.value)}
                  />
                </label>
              </div>

              <div className="card" style={{ marginTop: 14 }}>
                <div className="order-total" style={{ marginTop: 0, fontSize: 21 }}>
                  <span>Job Total</span>
                  <strong>{money(dtfJobTotal)}</strong>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                  <button type="button" className="btn primary" disabled={!selectedDTFMaterial || currentGrandTotal <= 0} onClick={addJobToQueue}>
                    + Add Job to Order
                  </button>

                  <button type="button" className="btn" onClick={resetCalculator}>Clear Calculator</button>
                </div>
              </div>
            </>
          )}

          {!isDIService && !isDTFService && service === 'large-format' && (
            <>
              <div
                className="section-head"
                style={{
                  marginTop: 24,
                }}
              >
                <div>
                  <h3>
                    {selectedService?.name?.toLowerCase().includes('dtf')
                      ? 'DTF Calculator'
                      : 'Large Format Calculator'}
                  </h3>

                  <span>
                    Calculate this job, then add it to the order queue.
                  </span>
                </div>

                <Badge tone="wine">
                  Live
                </Badge>
              </div>

              <div className="grid2">

                <label>
                  Material

                  <select
                    value={
                      materialId
                    }
                    onChange={e =>
                      setMaterialId(
                        e.target
                          .value
                      )
                    }
                  >
                    <option value="">
                      Select material
                    </option>

                    {largeFormatMaterials.map(
                      item => (
                        <option
                          key={
                            item.id
                          }
                          value={
                            item.id
                          }
                        >
                          {
                            item.name
                          } — ₦
                          {num(
                            item.price_per_sqft
                          ).toLocaleString(
                            'en-NG'
                          )}
                          /sqft
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  Unit

                  <select
                    value={
                      unit
                    }
                    onChange={e =>
                      setUnit(
                        e.target
                          .value as
                          | 'ft'
                          | 'in'
                      )
                    }
                  >
                    <option value="ft">
                      Feet
                    </option>

                    <option value="in">
                      Inches
                    </option>
                  </select>
                </label>

                <label>
                  Width

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      width
                    }
                    onChange={e =>
                      setWidth(
                        e.target
                          .value
                      )
                    }
                  />
                </label>

                <label>
                  Height

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      height
                    }
                    onChange={e =>
                      setHeight(
                        e.target
                          .value
                      )
                    }
                  />
                </label>

                <label>
                  Quantity

                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={
                      quantity
                    }
                    onChange={e =>
                      setQuantity(
                        e.target
                          .value
                      )
                    }
                  />
                </label>

                <label>
                  Material rate / sqft

                  <input
                    type="number"
                    value={
                      selectedMaterial
                        ?.price_per_sqft ||
                      ''
                    }
                    readOnly
                  />
                </label>

                <label>
                  Design charge

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      designCharge
                    }
                    onChange={e =>
                      setDesignCharge(
                        e.target
                          .value
                      )
                    }
                  />
                </label>

                <label>
                  Finishing charge

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      finishingCharge
                    }
                    onChange={e =>
                      setFinishingCharge(
                        e.target
                          .value
                      )
                    }
                  />
                </label>

                <label>
                  Print & Cut rate / sqft

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      printCutRate
                    }
                    onChange={e =>
                      setPrintCutRate(
                        e.target
                          .value
                      )
                    }
                  />
                </label>

                <label
                  style={{
                    display:
                      'flex',
                    alignItems:
                      'center',
                    gap: 10,
                    paddingTop:
                      24,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      printCut
                    }
                    onChange={e =>
                      setPrintCut(
                        e.target
                          .checked
                      )
                    }
                  />

                  Print & Cut
                </label>

              </div>

              {/* MATERIAL STOCK */}
              {selectedMaterial && (
                <div
                  className="notice"
                  style={{
                    marginTop: 14,
                  }}
                >
                  <strong>
                    {
                      selectedMaterial.name
                    }
                  </strong>

                  <div
                    className="grid3"
                    style={{
                      marginTop: 10,
                    }}
                  >
                    <div>
                      <small>
                        Roll width
                      </small>

                      <div>
                        {num(
                          selectedMaterial.roll_width_ft
                        ).toFixed(
                          2
                        )}{' '}
                        ft
                      </div>
                    </div>

                    <div>
                      <small>
                        Current stock
                      </small>

                      <div>
                        {selectedInventoryStock.toFixed(
                          2
                        )}{' '}
                        ft
                      </div>
                    </div>

                    <div>
                      <small>
                        This job consumes
                      </small>

                      <div>
                        {linearLengthFt.toFixed(
                          2
                        )}{' '}
                        ft
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CALCULATOR */}
              <div
                className="card"
                style={{
                  marginTop: 14,
                }}
              >
                <div className="grid3">

                  <div>
                    <small>
                      Area
                    </small>

                    <h3>
                      {billedSqFt.toFixed(
                        2
                      )}{' '}
                      sqft
                    </h3>
                  </div>

                  <div>
                    <small>
                      Material usage
                    </small>

                    <h3>
                      {linearLengthFt.toFixed(
                        2
                      )}{' '}
                      ft
                    </h3>
                  </div>

                  <div>
                    <small>
                      Material total
                    </small>

                    <h3>
                      {money(
                        materialTotal
                      )}
                    </h3>
                  </div>

                  <div>
                    <small>
                      Print & Cut
                    </small>

                    <h3>
                      {money(
                        printCutCharge
                      )}
                    </h3>
                  </div>

                  <div>
                    <small>
                      Design
                    </small>

                    <h3>
                      {money(
                        design
                      )}
                    </h3>
                  </div>

                  <div>
                    <small>
                      Finishing
                    </small>

                    <h3>
                      {money(
                        finishing
                      )}
                    </h3>
                  </div>

                </div>

                <div
                  className="order-total"
                  style={{
                    marginTop: 18,
                    fontSize: 21,
                  }}
                >
                  <span>
                    Job Total
                  </span>

                  <strong>
                    {money(
                      currentGrandTotal
                    )}
                  </strong>
                </div>

                {inventoryInsufficient && (
                  <div
                    className="notice"
                    style={{
                      marginTop: 14,
                    }}
                  >
                    <strong>
                      Insufficient material
                    </strong>

                    <div>
                      Required:{' '}
                      {linearLengthFt.toFixed(
                        2
                      )}{' '}
                      ft
                    </div>

                    <div>
                      Available:{' '}
                      {selectedInventoryStock.toFixed(
                        2
                      )}{' '}
                      ft
                    </div>
                  </div>
                )}

                {/* ADD JOB TO QUEUE */}
                <div
                  style={{
                    display:
                      'flex',
                    gap: 10,
                    marginTop: 18,
                    flexWrap:
                      'wrap',
                  }}
                >
                  <button
                    type="button"
                    className="btn primary"
                    disabled={
                      !selectedMaterial ||
                      inventoryInsufficient ||
                      currentGrandTotal <=
                        0
                    }
                    onClick={
                      addJobToQueue
                    }
                  >
                    + Add Job to Order
                  </button>

                  <button
                    type="button"
                    className="btn"
                    onClick={
                      resetCalculator
                    }
                  >
                    Clear Calculator
                  </button>
                </div>
              </div>
            </>
          )}

          {/* NOTES */}
          <label
            style={{
              display:
                'block',
              marginTop: 24,
            }}
          >
            Order / Production Notes

            <textarea
              rows={4}
              value={
                notes
              }
              onChange={e =>
                setNotes(
                  e.target
                    .value
                )
              }
              placeholder="Production instructions, artwork instructions, delivery notes..."
            />
          </label>

          {/* ERRORS */}
          {error && (
            <div
              className="notice"
              style={{
                marginTop: 16,
                borderColor:
                  'rgba(220,80,80,.5)',
              }}
            >
              <strong>
                Error
              </strong>

              <div
                style={{
                  marginTop: 5,
                }}
              >
                {error}
              </div>
            </div>
          )}

          {success && (
            <div
              className="notice"
              style={{
                marginTop: 16,
              }}
            >
              {success}
            </div>
          )}

        </section>

        {/* RIGHT */}
        <aside>

          {/* ORDER QUEUE */}
          <section className="card">

            <div className="section-head">
              <div>
                <h3>
                  Current Order
                </h3>

                <span>
                  {orderLines.length}{' '}
                  job
                  {orderLines.length ===
                  1
                    ? ''
                    : 's'}{' '}
                  in queue
                </span>
              </div>

              {orderLines.length >
                0 && (
                <button
                  type="button"
                  className="btn"
                  onClick={
                    clearQueue
                  }
                >
                  Clear Queue
                </button>
              )}
            </div>

            {orderLines.length ===
              0 ? (
              <div
                className="notice"
              >
                <strong>
                  No jobs added yet
                </strong>

                <div
                  style={{
                    marginTop: 6,
                  }}
                >
                  Configure a job on the
                  left and click
                  <strong>
                    {' '}
                    “+ Add Job to Order”
                  </strong>
                  .
                </div>
              </div>
            ) : (
              <div>
                {orderLines.map(
                  (
                    line,
                    index
                  ) => (
                    <div
                      key={
                        line.id
                      }
                      className="order-line"
                      style={{
                        padding:
                          '14px 0',
                        borderBottom:
                          '1px solid rgba(255,255,255,.08)',
                      }}
                    >
                      <div className="order-line-main">

                        <strong>
                          Job{' '}
                          {index +
                            1}
                          {' — '}
                          {
                            line.materialName
                          }
                        </strong>

                        <small>
                          {services.find(item => item.id === line.service)?.name || line.service}
                        </small>

                        {line.directImageSize ? (
                          <small>
                            Size: {line.directImageSize} · Quantity: {line.quantity}
                          </small>
                        ) : (
                          <>
                            <small>
                              {line.width}ft × {line.height}ft × {line.quantity} · {line.billedSqFt.toFixed(2)} sqft
                            </small>

                            <small>
                              Material: {line.linearLengthFt.toFixed(2)} ft
                            </small>
                          </>
                        )}

                      </div>

                      <div
                        style={{
                          textAlign:
                            'right',
                        }}
                      >
                        <strong>
                          {money(
                            line.grandTotal
                          )}
                        </strong>

                        <button
                          type="button"
                          className="btn"
                          style={{
                            marginTop:
                              7,
                            fontSize:
                              11,
                          }}
                          onClick={() =>
                            removeQueuedJob(
                              line.id
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* QUEUE TOTAL */}
            {orderLines.length >
              0 && (
              <>
                <div
                  className="order-total"
                  style={{
                    marginTop: 16,
                  }}
                >
                  <span>
                    Queued jobs
                  </span>

                  <strong>
                    {orderLines.length}
                  </strong>
                </div>

                <div className="order-total">
                  <span>
                    Job subtotal
                  </span>

                  <strong>
                    {money(
                      queuedSubtotal
                    )}
                  </strong>
                </div>

                <div className="order-total">
                  <span>
                    Material usage
                  </span>

                  <strong>
                    {queuedMaterialLength.toFixed(
                      2
                    )}{' '}
                    ft
                  </strong>
                </div>

                <div
                  className="order-total"
                  style={{
                    marginTop:
                      10,
                    fontSize:
                      21,
                  }}
                >
                  <span>
                    Order Total
                  </span>

                  <strong>
                    {money(
                      orderGrandTotal
                    )}
                  </strong>
                </div>
              </>
            )}

          </section>

          {/* PAYMENT */}
          <section
            className="card"
            style={{
              marginTop: 16,
            }}
          >

            <div className="section-head">
              <div>
                <h3>
                  Payment
                </h3>

                <span>
                  Select how this order is being paid.
                </span>
              </div>
            </div>

            {/* PAYMENT STATUS */}
            <div
              style={{
                display:
                  'grid',
                gridTemplateColumns:
                  'repeat(3,minmax(0,1fr))',
                gap: 8,
              }}
            >

              <button
                type="button"
                className={
                  paymentStatus ===
                  'FULL PAYMENT'
                    ? 'btn primary'
                    : 'btn'
                }
                onClick={() =>
                  choosePaymentStatus(
                    'FULL PAYMENT'
                  )
                }
              >
                Full Payment
              </button>

              <button
                type="button"
                className={
                  paymentStatus ===
                  'PART PAYMENT'
                    ? 'btn primary'
                    : 'btn'
                }
                onClick={() =>
                  choosePaymentStatus(
                    'PART PAYMENT'
                  )
                }
              >
                Part Payment
              </button>

              <button
                type="button"
                className={
                  paymentStatus ===
                  'UNPAID'
                    ? 'btn primary'
                    : 'btn'
                }
                onClick={() =>
                  choosePaymentStatus(
                    'UNPAID'
                  )
                }
              >
                Unpaid
              </button>

            </div>

            {/* PAYMENT AMOUNT */}
            {paymentStatus !==
              'UNPAID' && (
              <label
                style={{
                  display:
                    'block',
                  marginTop:
                    16,
                }}
              >
                Amount received

                <input
                  type="number"
                  min="0"
                  max={
                    orderGrandTotal
                  }
                  step="0.01"
                  value={
                    paymentStatus ===
                    'FULL PAYMENT'
                      ? fullPaymentAmount
                      : paymentAmount
                  }
                  readOnly={
                    paymentStatus ===
                    'FULL PAYMENT'
                  }
                  onChange={e =>
                    setPaymentAmount(
                      e.target
                        .value
                    )
                  }
                />
              </label>
            )}

            {paymentStatus !==
              'UNPAID' && (
              <label
                style={{
                  display:
                    'block',
                  marginTop:
                    12,
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
                  <option value="cash">
                    Cash
                  </option>

                  <option value="transfer">
                    Bank Transfer
                  </option>

                  <option value="pos">
                    POS
                  </option>

                  <option value="card">
                    Card
                  </option>

                  <option value="other">
                    Other
                  </option>
                </select>
              </label>
            )}

            {/* PAYMENT SUMMARY */}
            <div
              className="notice"
              style={{
                marginTop:
                  16,
              }}
            >
              <div className="order-total">
                <span>
                  Order Total
                </span>

                <strong>
                  {money(
                    orderGrandTotal
                  )}
                </strong>
              </div>

              <div className="order-total">
                <span>
                  Payment Status
                </span>

                <strong>
                  {paymentStatus}
                </strong>
              </div>

              <div className="order-total">
                <span>
                  Amount Paid
                </span>

                <strong>
                  {money(
                    actualPaymentAmount
                  )}
                </strong>
              </div>

              <div className="order-total">
                <span>
                  Balance
                </span>

                <strong>
                  {money(
                    balance
                  )}
                </strong>
              </div>
            </div>

            {/* SAVE */}
            <button
              type="button"
              className="btn primary wide"
              style={{
                marginTop:
                  18,
              }}
              disabled={
                saving
              }
              onClick={
                saveOrder
              }
            >
              {saving
                ? 'Saving Order…'
                : `Save Order & Send ${orderLines.length} Job${
                    orderLines.length ===
                    1
                      ? ''
                      : 's'
                  } to Production`}
            </button>

            {error && (
              <div
                className="notice"
                role="alert"
                style={{
                  marginTop: 12,
                  borderColor: 'rgba(220, 80, 80, 0.55)',
                }}
              >
                {error}
              </div>
            )}

            {saveSuccess && (
              <div
                className="notice"
                role="status"
                style={{
                  marginTop: 12,
                  borderColor: 'rgba(34, 197, 94, 0.45)',
                }}
              >
                {saveSuccess}
              </div>
            )}

          </section>

        </aside>
      </div>
    </>
  )
}
