"use client"
import {useCallback,useEffect,useMemo,useState} from 'react'
import {supabaseBrowser} from '../../../lib/supabase-browser'
import {getActiveOrganizationId} from '../../../lib/organization-context'
import {PageHead,Badge} from '../../../components/ui'

type Service={id:string;name:string;code:string;category:string;calculator_type:string;active:boolean;sort_order:number}
type Item={id:string;name:string;sku?:string;category:string;item_kind:string;base_unit:string;cost_per_unit:number;sell_price:number;current_stock:number;reorder_level:number;active:boolean;metadata?:Record<string, unknown>|null}
type Rule={id:string;name:string;service_id?:string;pricing_basis:string;rate:number;minimum_charge:number;active:boolean}
type Workflow={id:string;name:string;service_id?:string;active:boolean}

const emptyService={name:'',code:'',category:'printing',calculator_type:'generic',active:true,sort_order:0}
const emptyItem={name:'',sku:'',category:'material',item_kind:'material',base_unit:'piece',cost_per_unit:0,sell_price:0,opening_stock:0,current_stock:0,reorder_level:0,active:true}
const emptyRule={name:'',service_id:'',pricing_basis:'fixed',rate:0,minimum_charge:0,active:true}

const PRINTING_SERVICE_SUGGESTIONS = [
  { name: 'Direct Image Printing', code: 'direct_image_printing', category: 'printing', calculator_type: 'direct_image' },
  { name: 'Sublimation Printing', code: 'sublimation_printing', category: 'printing', calculator_type: 'generic' },
  { name: 'Screen Printing', code: 'screen_printing', category: 'printing', calculator_type: 'generic' },
  { name: 'Vinyl Cutting & Plotting', code: 'vinyl_cutting', category: 'signage', calculator_type: 'generic' },
  { name: 'UV Printing', code: 'uv_printing', category: 'printing', calculator_type: 'generic' },
  { name: 'Embroidery', code: 'embroidery', category: 'apparel', calculator_type: 'generic' },
  { name: 'Offset Printing', code: 'offset_printing', category: 'printing', calculator_type: 'generic' },
  { name: 'A3 / A4 Digital Printing', code: 'digital_printing', category: 'printing', calculator_type: 'generic' },
]

const INVENTORY_ITEM_SUGGESTIONS = [
  { name: 'DTF Film 22in', sku: 'DTF-FILM-22', category: 'DTF', item_kind: 'material', base_unit: 'ft', cost_per_unit: 650, sell_price: 1200, opening_stock: 50, reorder_level: 15 },
  { name: 'DTF Powder', sku: 'DTF-POWDER', category: 'DTF', item_kind: 'consumable', base_unit: 'kg', cost_per_unit: 1800, sell_price: 3200, opening_stock: 10, reorder_level: 4 },
  { name: 'Transfer Paper A3', sku: 'SUB-TRANSFER-A3', category: 'Sublimation', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 120, sell_price: 220, opening_stock: 200, reorder_level: 50 },
  { name: 'Adhesive Vinyl', sku: 'VINYL-ADHESIVE', category: 'Vinyl', item_kind: 'material', base_unit: 'ft', cost_per_unit: 220, sell_price: 480, opening_stock: 120, reorder_level: 25 },
  { name: 'Backlit Film', sku: 'BACKLIT-FILM', category: 'Large Format', item_kind: 'material', base_unit: 'ft', cost_per_unit: 350, sell_price: 700, opening_stock: 80, reorder_level: 20 },
  { name: 'Glossy Photo Paper', sku: 'DI-GLOSSY-A4', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 120, sell_price: 280, opening_stock: 200, reorder_level: 50 },
  { name: 'Matte Photo Paper', sku: 'DI-MATTE-A4', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 110, sell_price: 260, opening_stock: 220, reorder_level: 60 },
  { name: 'Canvas Paper', sku: 'DI-CANVAS-A3', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 180, sell_price: 420, opening_stock: 120, reorder_level: 30 },
  { name: 'Premium PVC Board', sku: 'DI-PVC-A3', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 260, sell_price: 620, opening_stock: 80, reorder_level: 20 },
  { name: 'Foam Board', sku: 'DI-FOAM-A3', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 280, sell_price: 680, opening_stock: 70, reorder_level: 18 },
  { name: 'Sticker Vinyl', sku: 'DI-STICKER-VINYL', category: 'Direct Image', item_kind: 'material', base_unit: 'ft', cost_per_unit: 220, sell_price: 520, opening_stock: 140, reorder_level: 35 },
  { name: 'Transparent Film', sku: 'DI-TRANSPARENT-FILM', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 170, sell_price: 420, opening_stock: 150, reorder_level: 40 },
  { name: 'Backlit Film', sku: 'DI-BACKLIT-FILM', category: 'Direct Image', item_kind: 'material', base_unit: 'ft', cost_per_unit: 300, sell_price: 760, opening_stock: 90, reorder_level: 25 },
  { name: 'Premium White T-Shirt', sku: 'APPAREL-WHITE-M', category: 'Apparel', item_kind: 'product', base_unit: 'piece', cost_per_unit: 2200, sell_price: 4200, opening_stock: 30, reorder_level: 10 },
  { name: 'Acrylic Sheet 3mm', sku: 'ACRYLIC-3MM', category: 'Signage', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 2500, sell_price: 4800, opening_stock: 20, reorder_level: 6 },
  { name: 'UV Ink', sku: 'UV-INK-1L', category: 'UV', item_kind: 'consumable', base_unit: 'litre', cost_per_unit: 8500, sell_price: 16500, opening_stock: 12, reorder_level: 3 },
]

const DI_SIZE_SUGGESTIONS = [
  { name: 'Glossy Photo Paper A4', sku: 'DI-GLOSSY-A4', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 140, sell_price: 320, opening_stock: 150, reorder_level: 40 },
  { name: 'Glossy Photo Paper A3', sku: 'DI-GLOSSY-A3', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 220, sell_price: 480, opening_stock: 120, reorder_level: 35 },
  { name: 'Glossy Photo Paper A2', sku: 'DI-GLOSSY-A2', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 360, sell_price: 760, opening_stock: 80, reorder_level: 20 },
  { name: 'Matte Photo Paper A4', sku: 'DI-MATTE-A4', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 130, sell_price: 300, opening_stock: 170, reorder_level: 45 },
  { name: 'Matte Photo Paper A3', sku: 'DI-MATTE-A3', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 210, sell_price: 460, opening_stock: 130, reorder_level: 35 },
  { name: 'Canvas Paper A3', sku: 'DI-CANVAS-A3', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 220, sell_price: 500, opening_stock: 100, reorder_level: 25 },
  { name: 'Canvas Paper A2', sku: 'DI-CANVAS-A2', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 380, sell_price: 820, opening_stock: 70, reorder_level: 18 },
  { name: 'PVC Board A3', sku: 'DI-PVC-A3', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 300, sell_price: 700, opening_stock: 75, reorder_level: 20 },
  { name: 'PVC Board A2', sku: 'DI-PVC-A2', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 520, sell_price: 1200, opening_stock: 45, reorder_level: 12 },
  { name: 'Foam Board A3', sku: 'DI-FOAM-A3', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 340, sell_price: 760, opening_stock: 55, reorder_level: 15 },
  { name: 'Foam Board A2', sku: 'DI-FOAM-A2', category: 'Direct Image', item_kind: 'material', base_unit: 'sheet', cost_per_unit: 560, sell_price: 1300, opening_stock: 30, reorder_level: 10 },
]

export default function BusinessSetup(){
 const org=getActiveOrganizationId(); const s=useMemo(()=>supabaseBrowser(),[])
 const [tab,setTab]=useState('services'); const [configServiceId,setConfigServiceId]=useState('all'); const [recipes,setRecipes]=useState<any[]>([]); const [recipe,setRecipe]=useState({name:'',service_id:'',workflow_id:'',rules:'{}'}); const [variants,setVariants]=useState<any[]>([]); const [variant,setVariant]=useState({item_id:'',name:'',attributes:'{}'}); const [services,setServices]=useState<Service[]>([]); const [items,setItems]=useState<Item[]>([]); const [rules,setRules]=useState<Rule[]>([]); const [workflows,setWorkflows]=useState<Workflow[]>([])
 const [service,setService]=useState<any>(emptyService); const [item,setItem]=useState<any>(emptyItem); const [rule,setRule]=useState<any>(emptyRule)
 const [busy,setBusy]=useState(false); const [msg,setMsg]=useState(''); const [error,setError]=useState('')
 const [editingRuleId,setEditingRuleId]=useState<string|null>(null)
 const [diPricingItemId,setDiPricingItemId]=useState(''); const [diPricingSize,setDiPricingSize]=useState('A4'); const [diPricing,setDiPricing]=useState({front_print:0,back_print:0,laminating:0,cutting:0,stitching:0,spiral_binding:0})
 const activeServices=services.filter(x=>x.active)
 const scopedActiveServices=activeServices.filter(x=>configServiceId==='all'||x.id===configServiceId)
 const focusedService=activeServices.find(x=>x.id===configServiceId)
 const visibleRules=rules.filter(x=>configServiceId==='all'?!x.service_id||services.some(sv=>sv.id===x.service_id&&sv.active):!x.service_id||x.service_id===configServiceId)
 const visibleRecipes=recipes.filter(x=>configServiceId==='all'?services.some(sv=>sv.id===x.service_id&&sv.active):x.service_id===configServiceId)
 const visibleWorkflows=workflows.filter(x=>configServiceId==='all'?!x.service_id||services.some(sv=>sv.id===x.service_id&&sv.active):!x.service_id||x.service_id===configServiceId)
 const scopedWorkflows=workflows.filter(x=>!x.service_id||configServiceId==='all'||x.service_id===configServiceId)
 const contextualInventorySuggestions=focusedService?.calculator_type==='direct_image'?DI_SIZE_SUGGESTIONS:focusedService?INVENTORY_ITEM_SUGGESTIONS.filter(x=>`${x.category} ${x.name}`.toLowerCase().includes(focusedService.category.toLowerCase())||`${x.category} ${x.name}`.toLowerCase().includes(focusedService.name.toLowerCase().split(' ')[0])):[]
 const hasActiveDirectImage=activeServices.some(x=>x.calculator_type==='direct_image')

 useEffect(()=>{if(!diPricingItemId) return; const selected=items.find(x=>x.id===diPricingItemId); const metadata=(selected?.metadata as any) || {}; const sizeProfile=(metadata.di_pricing && metadata.di_pricing[diPricingSize]) || {}; setDiPricing({front_print:Number(sizeProfile.front_print||0),back_print:Number(sizeProfile.back_print||0),laminating:Number(sizeProfile.laminating||0),cutting:Number(sizeProfile.cutting||0),stitching:Number(sizeProfile.stitching||0),spiral_binding:Number(sizeProfile.spiral_binding||0)})},[diPricingItemId,diPricingSize,items])

 async function saveDiPricing(){
   if(!diPricingItemId){setError('Select a direct image item first.');return}
   const selected=items.find(x=>x.id===diPricingItemId)
   if(!selected){setError('Direct image item not found.');return}
   const baseMetadata=(selected.metadata && typeof selected.metadata === 'object') ? {...(selected.metadata as Record<string, unknown>)} : {}
   const existingPricing=(typeof baseMetadata.di_pricing === 'object' && baseMetadata.di_pricing !== null)
     ? (baseMetadata.di_pricing as Record<string, Record<string, number>>)
     : {}
   const nextPricing={
     ...existingPricing,
     [diPricingSize]: {
       front_print: Number(diPricing.front_print) || 0,
       back_print: Number(diPricing.back_print) || 0,
       laminating: Number(diPricing.laminating) || 0,
       cutting: Number(diPricing.cutting) || 0,
       stitching: Number(diPricing.stitching) || 0,
       spiral_binding: Number(diPricing.spiral_binding) || 0,
     },
   }
   setBusy(true);setError('');setMsg('');
   const {error:saveError}=await s.from('inventory_items').update({metadata:{...baseMetadata,di_pricing:nextPricing}}).eq('id',diPricingItemId).eq('organization_id',org)
   if(saveError){setError(saveError.message)}else{setMsg('DI price profile saved. The New Job form will use it automatically.');await load()}
   setBusy(false)
 }

 const applySuggestedService = (index:number) => {
   const suggestion = PRINTING_SERVICE_SUGGESTIONS[index]
   if (!suggestion) return
   setService({
     ...emptyService,
     name: suggestion.name,
     code: suggestion.code,
     category: suggestion.category,
     calculator_type: suggestion.calculator_type,
   })
 }

 const applySuggestedInventoryItem = (suggestion:any) => {
   if (!suggestion) return
   setItem({
     ...emptyItem,
     name: suggestion.name,
     sku: suggestion.sku,
     category: suggestion.category,
     item_kind: suggestion.item_kind,
     base_unit: suggestion.base_unit,
     cost_per_unit: suggestion.cost_per_unit,
     sell_price: suggestion.sell_price,
     opening_stock: suggestion.opening_stock,
     current_stock: suggestion.opening_stock,
     reorder_level: suggestion.reorder_level,
   })
 }

 const applySuggestedDISize = (index:number) => {
   const suggestion = DI_SIZE_SUGGESTIONS[index]
   if (!suggestion) return
   setItem({
     ...emptyItem,
     name: suggestion.name,
     sku: suggestion.sku,
     category: suggestion.category,
     item_kind: suggestion.item_kind,
     base_unit: suggestion.base_unit,
     cost_per_unit: suggestion.cost_per_unit,
     sell_price: suggestion.sell_price,
     opening_stock: suggestion.opening_stock,
     current_stock: suggestion.opening_stock,
     reorder_level: suggestion.reorder_level,
   })
 }
 const load=useCallback(async()=>{setError('');const [{data:a,error:ae},{data:b,error:be},{data:c,error:ce},{data:d,error:de},{data:e,error:ee},{data:f,error:fe}]=await Promise.all([
  s.from('business_services').select('*').eq('organization_id',org).order('sort_order').order('name'),
  s.from('inventory_items').select('*').eq('organization_id',org).order('name'),
  s.from('pricing_rules').select('*').eq('organization_id',org).order('name'),
  s.from('production_workflows').select('*').eq('organization_id',org).order('name'),
  s.from('inventory_variants').select('*').eq('organization_id',org).order('name'),
  s.from('service_recipes').select('*').eq('organization_id',org).order('name')])
  if(ae||be||ce||de||ee||fe)setError([ae,be,ce,de,ee,fe].filter(Boolean).map(x=>(x as any).message).join(' | '));
  setServices(a||[]);setItems(b||[]);setRules(c||[]);setWorkflows(d||[]);setVariants(e||[]);setRecipes(f||[])
 },[s,org])
 useEffect(()=>{load()},[load])
 async function saveService(){setBusy(true);setError('');setMsg('');const payload={organization_id:org,name:service.name.trim(),code:service.code.trim().toLowerCase().replace(/\s+/g,'_'),category:service.category,calculator_type:service.calculator_type,active:service.active,sort_order:Number(service.sort_order)||0};if(!payload.name||!payload.code){setError('Service name and code are required.');setBusy(false);return}const {error}=await s.from('business_services').insert(payload);if(error)setError(error.message);else{setMsg('Service added.');setService(emptyService);await load()}setBusy(false)}
 async function updateServiceCalculator(serviceId:string,calculatorType:string){setBusy(true);setError('');setMsg('');const {error}=await s.from('business_services').update({calculator_type:calculatorType}).eq('id',serviceId).eq('organization_id',org);if(error)setError(error.message);else{setMsg('Service calculator updated.');await load()}setBusy(false)}
 function focusService(id:string){setConfigServiceId(id);if(id!=='all'){setRule(current=>({...current,service_id:id}));setRecipe(current=>({...current,service_id:id}))}}
 async function saveItem(){setBusy(true);setError('');setMsg('');const payload={organization_id:org,name:item.name.trim(),sku:item.sku||null,category:item.category,item_kind:item.item_kind,base_unit:item.base_unit,cost_per_unit:Number(item.cost_per_unit)||0,sell_price:Number(item.sell_price)||0,opening_stock:Number(item.opening_stock)||0,current_stock:Number(item.current_stock)||0,reorder_level:Number(item.reorder_level)||0,active:item.active};if(!payload.name){setError('Inventory item name is required.');setBusy(false);return}const {error}=await s.from('inventory_items').insert(payload);if(error)setError(error.message);else{setMsg('Inventory item added.');setItem(emptyItem);await load()}setBusy(false)}
 async function saveRule(){setBusy(true);setError('');setMsg('');const payload={organization_id:org,name:rule.name.trim(),service_id:rule.service_id||null,pricing_basis:rule.pricing_basis,rate:Number(rule.rate)||0,minimum_charge:Number(rule.minimum_charge)||0,active:rule.active};if(!payload.name){setError('Pricing rule name is required.');setBusy(false);return}const result=editingRuleId?await s.from('pricing_rules').update(payload).eq('id',editingRuleId).eq('organization_id',org):await s.from('pricing_rules').insert(payload);if(result.error)setError(result.error.message);else{setMsg(editingRuleId?'Pricing rule updated.':'Pricing rule added.');setRule(emptyRule);setEditingRuleId(null);await load()}setBusy(false)}
 function editPricingRule(row:Rule){setEditingRuleId(row.id);setRule({name:row.name,service_id:row.service_id||'',pricing_basis:row.pricing_basis,rate:row.rate,minimum_charge:row.minimum_charge,active:row.active});if(row.service_id&&services.some(item=>item.id===row.service_id&&item.active))setConfigServiceId(row.service_id);setTab('pricing')}
 async function saveRecipe(){setBusy(true);setError('');let rules:any={};try{rules=JSON.parse(recipe.rules||'{}')}catch{setError('Recipe rules must be valid JSON.');setBusy(false);return}const {error}=await s.from('service_recipes').insert({organization_id:org,name:recipe.name.trim(),service_id:recipe.service_id,workflow_id:recipe.workflow_id||null,rules});if(error)setError(error.message);else{setMsg('Service recipe added.');setRecipe({name:'',service_id:'',workflow_id:'',rules:'{}'});await load()}setBusy(false)}
 async function saveVariant(){setBusy(true);setError('');let attrs:any={};try{attrs=JSON.parse(variant.attributes||'{}')}catch{setError('Variant attributes must be valid JSON, e.g. {"size":"M","colour":"White"}.');setBusy(false);return}const {error}=await s.from('inventory_variants').insert({organization_id:org,inventory_item_id:variant.item_id,name:variant.name.trim(),attributes:attrs});if(error)setError(error.message);else{setMsg('Variant added.');setVariant({item_id:'',name:'',attributes:'{}'});await load()}setBusy(false)}
 async function deleteItem(id:string,name:string){if(!window.confirm(`Delete ${name}? If it has history or stock movement, NETVYL will require disabling it instead.`))return;setBusy(true);const {error}=await s.rpc('delete_inventory_item_v36',{p_item_id:id});if(error)setError(error.message);else setMsg(`${name} deleted.`);await load();setBusy(false)}
 async function toggle(table:string,id:string,active:boolean){setBusy(true);const {error}=await s.from(table).update({active}).eq('id',id).eq('organization_id',org);if(error)setError(error.message);else{if(table==='business_services'&&!active&&configServiceId===id)setConfigServiceId('all');await load()}setBusy(false)}
 return <><PageHead title="Business Setup" subtitle="Set up a service, choose its calculator, then add prices and production details."/>
 <div className="tabs" style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>{[['services','1. Services'],['pricing','2. Prices'],['inventory','3. Inventory'],['workflows','4. Workflows'],['variants','Options'],['recipes','Recipes']].map(([k,l])=><button key={k} className={`btn ${tab===k?'primary':''}`} onClick={()=>setTab(k)}>{l}</button>)}</div>
 <section className="card" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:16}}><label style={{minWidth:260,margin:0}}>Organize by active service<select value={configServiceId} onChange={e=>focusService(e.target.value)}><option value="all">All active services</option>{activeServices.map(x=><option key={x.id} value={x.id}>{x.name} · {x.calculator_type.replaceAll('_',' ')}</option>)}</select></label><span className="cell-sub">{focusedService?`Settings below are focused on ${focusedService.name}.`:'Choose a service to keep its settings together.'}</span></section>
 {msg&&<div className="notice success">{msg}</div>}{error&&<div className="notice error">{error}</div>}
 {tab==='services'&&<div className="workspace-grid"><section className="card form-card"><div className="section-head"><div><h3>Add service</h3><span>Create services for this organization.</span></div></div><div className="notice" style={{marginBottom:12}}><strong>Suggested printing services:</strong> {PRINTING_SERVICE_SUGGESTIONS.slice(0,3).map(x=>x.name).join(', ')} and more. Add any custom print line you need.</div><label>Name<input value={service.name} onChange={e=>setService({...service,name:e.target.value})} placeholder="e.g. Sublimation"/></label><label>Code<input value={service.code} onChange={e=>setService({...service,code:e.target.value})} placeholder="e.g. sublimation"/></label><div className="grid2"><label>Category<select value={service.category} onChange={e=>setService({...service,category:e.target.value})}><option>printing</option><option>apparel</option><option>signage</option><option>finishing</option><option>custom</option></select></label><label>Calculator<select value={service.calculator_type} onChange={e=>setService({...service,calculator_type:e.target.value})}><option value="generic">Generic</option><option value="large_format">Large Format</option><option value="dtf">DTF</option><option value="direct_image">Direct Image</option></select></label></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>{PRINTING_SERVICE_SUGGESTIONS.slice(0,4).map((suggestion,index)=><button key={suggestion.code} className="btn small" onClick={()=>applySuggestedService(index)}>{suggestion.name}</button>)}</div><button className="btn primary wide" disabled={busy} onClick={saveService}>{busy?'Saving…':'Add service'}</button></section><section className="card"><div className="section-head"><div><h3>Services</h3><span>These drive calculators and workflows.</span></div></div><div className="tablewrap"><table><thead><tr><th>Name</th><th>Code</th><th>Calculator</th><th>State</th><th/></tr></thead><tbody>{services.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.code}</td><td><select aria-label={`Calculator for ${x.name}`} value={x.calculator_type} disabled={busy} onChange={e=>updateServiceCalculator(x.id,e.target.value)}><option value="generic">Generic</option><option value="large_format">Large Format</option><option value="dtf">DTF</option><option value="direct_image">Direct Image</option></select></td><td><Badge tone={x.active?'success':'danger'}>{x.active?'ACTIVE':'OFF'}</Badge></td><td><button className="btn small" onClick={()=>toggle('business_services',x.id,!x.active)}>{x.active?'Deactivate':'Activate'}</button></td></tr>)}</tbody></table></div></section></div>}
 {tab==='inventory'&&<div className="workspace-grid">{(configServiceId==='all'?hasActiveDirectImage:focusedService?.calculator_type==='direct_image')&&<section className="card form-card"><div className="section-head"><div><h3>Direct Image pricing</h3><span>Set each size-specific finishing charge to use automatically in the New Job form.</span></div></div><div className="grid2"><label>DI material<select value={diPricingItemId} onChange={e=>setDiPricingItemId(e.target.value)}><option value="">Select material</option>{items.filter(x=>x.category?.toLowerCase().includes('direct') || x.name?.toLowerCase().includes('photo') || x.name?.toLowerCase().includes('canvas') || x.name?.toLowerCase().includes('pvc') || x.name?.toLowerCase().includes('foam')).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Size<select value={diPricingSize} onChange={e=>setDiPricingSize(e.target.value)}><option>A4</option><option>A3</option><option>A2</option><option>A1</option><option>A0</option><option>Custom</option></select></label></div><div className="grid2" style={{marginTop:12}}><label>Front print<input type="number" value={diPricing.front_print} onChange={e=>setDiPricing({...diPricing,front_print:Number(e.target.value)||0})}/></label><label>Back print<input type="number" value={diPricing.back_print} onChange={e=>setDiPricing({...diPricing,back_print:Number(e.target.value)||0})}/></label><label>Laminating<input type="number" value={diPricing.laminating} onChange={e=>setDiPricing({...diPricing,laminating:Number(e.target.value)||0})}/></label><label>Cutting<input type="number" value={diPricing.cutting} onChange={e=>setDiPricing({...diPricing,cutting:Number(e.target.value)||0})}/></label><label>Stitching<input type="number" value={diPricing.stitching} onChange={e=>setDiPricing({...diPricing,stitching:Number(e.target.value)||0})}/></label><label>Spiral binding<input type="number" value={diPricing.spiral_binding} onChange={e=>setDiPricing({...diPricing,spiral_binding:Number(e.target.value)||0})}/></label></div><button className="btn primary wide" disabled={busy||!diPricingItemId} onClick={saveDiPricing}>{busy?'Saving…':'Save DI pricing'}</button></section>}<section className="card form-card"><div className="section-head"><div><h3>Add inventory item</h3><span>Use any unit: piece, sheet, ft, metre, kg, litre, etc.</span></div></div><div className="notice" style={{marginBottom:12}}><strong>{focusedService?`Suggested materials for ${focusedService.name}:`:`Choose an active service above to see matching suggestions.`}</strong> {contextualInventorySuggestions.slice(0,3).map(x=>x.name).join(', ')}</div><label>Name<input value={item.name} onChange={e=>setItem({...item,name:e.target.value})} placeholder="DTF Film 22in"/></label><div className="grid2"><label>SKU<input value={item.sku} onChange={e=>setItem({...item,sku:e.target.value})}/></label><label>Category<input value={item.category} onChange={e=>setItem({...item,category:e.target.value})}/></label><label>Item type<select value={item.item_kind} onChange={e=>setItem({...item,item_kind:e.target.value})}><option value="material">Material</option><option value="product">Product</option><option value="consumable">Consumable</option><option value="service_component">Service component</option></select></label><label>Base unit<input value={item.base_unit} onChange={e=>setItem({...item,base_unit:e.target.value})} placeholder="piece / ft / kg"/></label><label>Cost / unit<input type="number" value={item.cost_per_unit} onChange={e=>setItem({...item,cost_per_unit:e.target.value})}/></label><label>Sell price / unit<input type="number" value={item.sell_price} onChange={e=>setItem({...item,sell_price:e.target.value})}/></label><label>Opening stock<input type="number" value={item.opening_stock} onChange={e=>setItem({...item,opening_stock:e.target.value,current_stock:e.target.value})}/></label><label>Reorder level<input type="number" value={item.reorder_level} onChange={e=>setItem({...item,reorder_level:e.target.value})}/></label></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>{contextualInventorySuggestions.map((suggestion,index)=><button key={suggestion.sku} className="btn small" onClick={()=>applySuggestedInventoryItem(suggestion)}>{suggestion.name}</button>)}</div>{(configServiceId==='all'?hasActiveDirectImage:focusedService?.calculator_type==='direct_image')&&<><div className="notice" style={{margin:'12px 0'}}><strong>Direct Image size presets:</strong> add a common paper size with default pricing.</div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>{DI_SIZE_SUGGESTIONS.slice(0,6).map((suggestion,index)=><button key={suggestion.sku} className="btn small" onClick={()=>applySuggestedDISize(index)}>{suggestion.name}</button>)}</div></>}<button className="btn primary wide" disabled={busy} onClick={saveItem}>{busy?'Saving…':'Add inventory item'}</button></section><section className="card"><div className="section-head"><div><h3>Universal inventory</h3><span>One inventory engine for all services.</span></div></div><div className="tablewrap"><table><thead><tr><th>Item</th><th>Type</th><th>Unit</th><th>Stock</th><th>Cost</th><th/></tr></thead><tbody>{items.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.item_kind}</td><td>{x.base_unit}</td><td>{Number(x.current_stock||0).toLocaleString()}</td><td>₦{Number(x.cost_per_unit||0).toLocaleString()}</td><td><div style={{display:'flex',gap:6}}><button className="btn small" onClick={()=>toggle('inventory_items',x.id,!x.active)}>{x.active?'Disable':'Enable'}</button>{x.active&&<button className="btn danger small" onClick={()=>deleteItem(x.id,x.name)}>Delete</button>}</div></td></tr>)}</tbody></table></div></section></div>}
 {tab==='variants'&&<div className="workspace-grid"><section className="card form-card"><div className="section-head"><div><h3>Add product/material variant</h3><span>Useful for garment sizes, colours and other configurable variants.</span></div></div><label>Parent inventory item<select value={variant.item_id} onChange={e=>setVariant({...variant,item_id:e.target.value})}><option value="">Select item</option>{items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Variant name<input value={variant.name} onChange={e=>setVariant({...variant,name:e.target.value})} placeholder="White / M"/></label><label>Attributes JSON<textarea value={variant.attributes} onChange={e=>setVariant({...variant,attributes:e.target.value})}/></label><button className="btn primary wide" disabled={busy||!variant.item_id||!variant.name.trim()} onClick={saveVariant}>Add variant</button></section><section className="card"><div className="tablewrap"><table><thead><tr><th>Item</th><th>Variant</th><th>Attributes</th><th>Stock</th></tr></thead><tbody>{variants.map(x=><tr key={x.id}><td>{items.find(i=>i.id===x.inventory_item_id)?.name||'—'}</td><td><strong>{x.name}</strong></td><td>{JSON.stringify(x.attributes)}</td><td>{Number(x.stock||0).toLocaleString()}</td></tr>)}</tbody></table></div></section></div>}
 {tab==='recipes'&&<div className="workspace-grid"><section className="card form-card"><div className="section-head"><div><h3>Service recipe</h3><span>Define reusable production/costing rules for a service.</span></div></div><label>Recipe name<input value={recipe.name} onChange={e=>setRecipe({...recipe,name:e.target.value})} placeholder="Premium DTF"/></label><label>Service<select value={recipe.service_id} onChange={e=>setRecipe({...recipe,service_id:e.target.value})}><option value="">Select service</option>{scopedActiveServices.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Workflow<select value={recipe.workflow_id} onChange={e=>setRecipe({...recipe,workflow_id:e.target.value})}><option value="">No linked workflow</option>{scopedWorkflows.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Rules JSON<textarea value={recipe.rules} onChange={e=>setRecipe({...recipe,rules:e.target.value})} placeholder='{"waste_percent":5,"minimum_margin":25}'/></label><button className="btn primary wide" disabled={busy||!recipe.name.trim()||!recipe.service_id} onClick={saveRecipe}>Add recipe</button></section><section className="card"><div className="tablewrap"><table><thead><tr><th>Recipe</th><th>Service</th><th>Workflow</th><th>Rules</th></tr></thead><tbody>{visibleRecipes.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{services.find(sv=>sv.id===x.service_id)?.name||'—'}</td><td>{workflows.find(w=>w.id===x.workflow_id)?.name||'—'}</td><td>{JSON.stringify(x.rules)}</td></tr>)}</tbody></table></div></section></div>}
 {tab==='pricing'&&<div className="workspace-grid"><section className="card form-card"><div className="section-head"><div><h3>Add pricing rule</h3><span>Rates are company configuration, not hard-coded application values.</span></div></div><label>Name<input value={rule.name} onChange={e=>setRule({...rule,name:e.target.value})} placeholder="Flex 5ft per sqft"/></label><label>Service<select value={rule.service_id} onChange={e=>setRule({...rule,service_id:e.target.value})}><option value="">All / generic</option>{scopedActiveServices.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><div className="grid2"><label>Basis<select value={rule.pricing_basis} onChange={e=>setRule({...rule,pricing_basis:e.target.value})}><option value="fixed">Fixed</option><option value="per_piece">Per piece</option><option value="per_sqft">Per sq ft</option><option value="per_ft">Per ft</option><option value="per_metre">Per metre</option><option value="percentage">Percentage</option></select></label><label>Rate<input type="number" value={rule.rate} onChange={e=>setRule({...rule,rate:e.target.value})}/></label><label>Minimum charge<input type="number" value={rule.minimum_charge} onChange={e=>setRule({...rule,minimum_charge:e.target.value})}/></label></div><button className="btn primary wide" disabled={busy} onClick={saveRule}>{busy?'Saving…':editingRuleId?'Save pricing changes':'Add pricing rule'}</button>{editingRuleId&&<button className="btn wide" onClick={()=>{setEditingRuleId(null);setRule(emptyRule)}}>Cancel edit</button>}</section><section className="card"><div className="section-head"><div><h3>Pricing rules</h3><span>Historical jobs keep their saved prices.</span></div></div><div className="tablewrap"><table><thead><tr><th>Name</th><th>Basis</th><th>Rate</th><th>Minimum</th><th/></tr></thead><tbody>{visibleRules.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.pricing_basis}</td><td>₦{Number(x.rate||0).toLocaleString()}</td><td>₦{Number(x.minimum_charge||0).toLocaleString()}</td><td><button className="btn small" onClick={()=>editPricingRule(x)}>Edit</button><button className="btn small" onClick={()=>toggle('pricing_rules',x.id,!x.active)}>{x.active?'Deactivate':'Activate'}</button></td></tr>)}</tbody></table></div></section></div>}
 {tab==='workflows'&&<div className="workspace-grid"><section className="card form-card"><div className="section-head"><div><h3>Add workflow</h3><span>Create production workflows.</span></div></div><label>Name<input id="workflow-name" placeholder="e.g. Premium DTF"/></label><label>Service<select id="workflow-service"><option value="">Generic</option>{scopedActiveServices.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Steps <textarea id="workflow-steps" placeholder="Artwork, Film Printing, Powder, Curing, Heat Press, QC, Ready"/></label><button className="btn primary wide" onClick={async()=>{const name=(document.getElementById('workflow-name') as HTMLInputElement)?.value.trim();const sid=(document.getElementById('workflow-service') as HTMLSelectElement)?.value||null;const raw=(document.getElementById('workflow-steps') as HTMLTextAreaElement)?.value||'';const names=raw.split(',').map(x=>x.trim()).filter(Boolean);if(!name||!names.length){setError('Workflow name and at least one step are required.');return}setBusy(true);setError('');const {data,error}=await s.from('production_workflows').insert({organization_id:org,name,service_id:sid}).select('id').single();if(!error){await s.from('production_workflow_steps').insert(names.map((step,i)=>({workflow_id:data.id,name:step,step_order:i+1})));setMsg('Workflow created.');await load()}else setError(error.message);setBusy(false)}}>{busy?'Saving…':'Add workflow'}</button></section><section className="card"><div className="section-head"><div><h3>Production workflows</h3><span>Workflow steps drive the production board.</span></div></div><div className="tablewrap"><table><thead><tr><th>Workflow</th><th>Service</th><th>State</th></tr></thead><tbody>{visibleWorkflows.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{services.find(sv=>sv.id===x.service_id)?.name||'—'}</td><td><Badge tone={x.active?'success':'danger'}>{x.active?'ACTIVE':'OFF'}</Badge></td></tr>)}</tbody></table></div><div className="notice" style={{marginTop:14}}>Default workflows are installed for Large Format, DTF and Direct Image. New workflows can be added above.</div></section></div>}
 </>
}
