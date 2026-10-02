'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {supabaseBrowser} from '../../lib/supabase-browser'
import {getActiveOrganizationId} from '../../lib/organization-context'
import {PageHead,StatCard,Money} from '../../components/ui'
import {downloadTextPdf,money} from '../../lib/pdf-report'

const STATUS_LABELS=['NEW','QUEUED','PRINTING','FINISHING','COMPLETED','DELIVERED','CANCELLED']
const STATUS_DB:Record<string,string[]>={NEW:['new'],QUEUED:['queued','pending'],PRINTING:['printing'],FINISHING:['finishing'],COMPLETED:['completed'],DELIVERED:['delivered'],CANCELLED:['cancelled']}
const isoToday=()=>new Date().toISOString().slice(0,10)

export default function Reports(){
 const ORG=getActiveOrganizationId(); const s=useMemo(()=>supabaseBrowser(),[])
 const [jobs,setJobs]=useState<any[]>([]),[payments,setPayments]=useState<any[]>([]),[materials,setMaterials]=useState<any[]>([]),[orders,setOrders]=useState<any[]>([]),[expenses,setExpenses]=useState<any[]>([]),[company,setCompany]=useState<any>({})
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[lastUpdated,setLastUpdated]=useState<Date|null>(null)
 const [from,setFrom]=useState(isoToday()),[to,setTo]=useState(isoToday())
 const load=useCallback(async()=>{setLoading(true);setError('');const [j,p,m,o,e,c]=await Promise.all([
  s.from('jobs').select('id,job_no,customer_name_snapshot,grand_total,amount_paid,status,job_date,material_name_snapshot,linear_length_ft').eq('organization_id',ORG).is('deleted_at',null),
  s.from('payments').select('amount,method,payment_date,created_at,customer_name_snapshot,receipt_no').eq('organization_id',ORG),
  s.from('materials').select('name,current_length_ft').eq('organization_id',ORG).eq('active',true),
  s.from('job_orders').select('id,order_no,grand_total,estimated_cost,actual_cost,estimated_profit,actual_profit,created_at').eq('organization_id',ORG),
  s.from('expenses').select('amount,expense_date,category').eq('organization_id',ORG),
  s.from('organizations').select('name,address,phone,email,currency').eq('id',ORG).maybeSingle()
 ]);const err=j.error||p.error||m.error||o.error||e.error||c.error;if(err)setError(err.message);setJobs(j.data||[]);setPayments(p.data||[]);setMaterials(m.data||[]);setOrders(o.data||[]);setExpenses(e.data||[]);setCompany(c.data||{});setLastUpdated(new Date());setLoading(false)},[s,ORG])
 useEffect(()=>{if(ORG)load()},[ORG,load])
 const filteredJobs=useMemo(()=>jobs.filter(j=>(!from||j.job_date>=from)&&(!to||j.job_date<=to)),[jobs,from,to])
 const filteredPayments=useMemo(()=>payments.filter(p=>{const d=p.payment_date||String(p.created_at||'').slice(0,10);return(!from||d>=from)&&(!to||d<=to)}),[payments,from,to])
 const sales=filteredJobs.reduce((a,x)=>a+Number(x.grand_total||0),0),paid=filteredPayments.reduce((a,x)=>a+Number(x.amount||0),0)||filteredJobs.reduce((a,x)=>a+Number(x.amount_paid||0),0),out=Math.max(0,sales-paid)
 const filteredOrders=useMemo(()=>orders.filter(o=>{const d=String(o.created_at||'').slice(0,10);return(!from||d>=from)&&(!to||d<=to)}),[orders,from,to])
 const filteredExpenses=useMemo(()=>expenses.filter(e=>(!from||e.expense_date>=from)&&(!to||e.expense_date<=to)),[expenses,from,to])
 const unifiedRevenue=filteredOrders.reduce((a,x)=>a+Number(x.grand_total||0),0),unifiedCost=filteredOrders.reduce((a,x)=>a+Number(x.actual_cost||x.estimated_cost||0),0),unifiedProfit=filteredOrders.reduce((a,x)=>a+Number(x.actual_profit||x.estimated_profit||0),0),operatingExpenses=filteredExpenses.reduce((a,x)=>a+Number(x.amount||0),0)
 const completed=filteredJobs.filter(x=>['completed','delivered'].includes(String(x.status||'').toLowerCase())).length
 function exportReport(kind:'daily'|'monthly'|'yearly'|'custom'){
  let a=from,b=to,label='Custom Date Range'
  const now=new Date()
  if(kind==='daily'){a=b=from||isoToday();label='Daily Report'}
  if(kind==='monthly'){const d=new Date((from||isoToday())+'T12:00:00');a=new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10);b=new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10);label='Monthly Report'}
  if(kind==='yearly'){const y=new Date((from||isoToday())+'T12:00:00').getFullYear();a=`${y}-01-01`;b=`${y}-12-31`;label='Yearly Report'}
  const js=jobs.filter(j=>(!a||j.job_date>=a)&&(!b||j.job_date<=b));const ps=payments.filter(p=>{const d=p.payment_date||String(p.created_at||'').slice(0,10);return(!a||d>=a)&&(!b||d<=b)})
  const billed=js.reduce((n,j)=>n+Number(j.grand_total||0),0),collected=ps.reduce((n,p)=>n+Number(p.amount||0),0)||js.reduce((n,j)=>n+Number(j.amount_paid||0),0)
  const statusCounts=STATUS_LABELS.map(st=>[st,js.filter(j=>STATUS_DB[st].includes(String(j.status||'').toLowerCase())).length])
  const materialCounts=new Map<string,number>();js.forEach(j=>materialCounts.set(j.material_name_snapshot||'Unknown',(materialCounts.get(j.material_name_snapshot||'Unknown')||0)+1))
  const methods=new Map<string,number>();ps.forEach(p=>methods.set(String(p.method||'Other'),(methods.get(String(p.method||'Other'))||0)+Number(p.amount||0)))
  const lines=[`Company: ${company.name||'NETVYL Organization'}`,`Report period: ${a||'Beginning'} → ${b||'Today'}`,`Generated: ${now.toLocaleString('en-NG')}`,'',`Total jobs: ${js.length}`,`Customers served: ${new Set(js.map(j=>j.customer_name_snapshot)).size}`,`Total billed: ${money(billed,company.currency||'NGN')}`,`Total collected: ${money(collected,company.currency||'NGN')}`,`Outstanding: ${money(Math.max(0,billed-collected),company.currency||'NGN')}`,`Completed/delivered: ${js.filter(j=>['completed','delivered'].includes(String(j.status||'').toLowerCase())).length}`,'','JOB STATUS']
  statusCounts.forEach(([k,v])=>lines.push(`${k}: ${v}`));lines.push('','MATERIAL / JOB VOLUME');materialCounts.forEach((v,k)=>lines.push(`${k}: ${v} job(s)`));lines.push('','PAYMENT METHODS');methods.forEach((v,k)=>lines.push(`${k}: ${money(v,company.currency||'NGN')}`));lines.push('','Powered by NETVYL Digital Resources Global Ltd')
  downloadTextPdf(`NETVYL-${kind}-report-${a}-${b}.pdf`,`${company.name||'NETVYL'} — ${label}`,lines)
 }
 const countStatus=(label:string)=>filteredJobs.filter(x=>STATUS_DB[label].includes(String(x.status||'').toLowerCase())).length
 return <><PageHead title="Reports" subtitle="Daily, monthly, yearly and custom date-range reports for this organization." actions={<button className="btn" onClick={load} disabled={loading}>{loading?'Refreshing…':'↻ Refresh'}</button>}/>
 {error&&<div className="notice error" style={{marginTop:16}}>{error}</div>}
 <section className="card" style={{marginTop:18}}><div className="section-head"><div><h3>Download reports</h3><span>All reports are restricted to the current organization.</span></div></div><div className="grid2"><label>From date<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To date<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}><button className="btn primary" onClick={()=>exportReport('daily')}>Download Daily PDF</button><button className="btn primary" onClick={()=>exportReport('monthly')}>Download Monthly PDF</button><button className="btn primary" onClick={()=>exportReport('yearly')}>Download Yearly PDF</button><button className="btn" onClick={()=>exportReport('custom')}>Download Custom PDF</button></div></section>
 <div className="stats" style={{marginTop:16}}><StatCard label="Gross job value" value={money(sales,company.currency||'NGN')} icon="₦"/><StatCard label="Collected" value={money(paid,company.currency||'NGN')} icon="✓"/><StatCard label="Outstanding" value={money(out,company.currency||'NGN')} icon="!"/><StatCard label="Completed jobs" value={completed} icon="◆"/><StatCard label="Unified revenue" value={money(unifiedRevenue,company.currency||'NGN')} icon="◇"/><StatCard label="Job profit" value={money(unifiedProfit,company.currency||'NGN')} icon="↗"/><StatCard label="Operating expenses" value={money(operatingExpenses,company.currency||'NGN')} icon="−"/></div>
 <div className="dashboard-grid" style={{marginTop:16}}><section className="card"><div className="section-head"><div><h3>Job status</h3><span>Selected date range</span></div></div>{STATUS_LABELS.map(st=>{const n=countStatus(st);const pct=filteredJobs.length?Math.round(n/filteredJobs.length*100):0;return <div className="report-row" key={st}><div><span>{st}</span><strong>{n}</strong></div><div className="progress"><span style={{width:`${pct}%`}}/></div></div>})}</section><section className="card"><div className="section-head"><div><h3>Inventory watch</h3><span>Lowest active balances first</span></div></div>{[...materials].sort((a,b)=>Number(a.current_length_ft)-Number(b.current_length_ft)).slice(0,7).map(m=><div className="stat" key={m.name}><span>{m.name}</span><strong>{Number(m.current_length_ft).toFixed(2)} ft</strong></div>)}{!materials.length&&<div className="empty-state">No active materials found.</div>}</section></div>
 <section className="card" style={{marginTop:16}}><div className="section-head"><div><h3>Profitability</h3><span>Unified service orders versus operating expenses for the selected period.</span></div></div><div className="grid3"><div><small>Unified revenue</small><h2>{money(unifiedRevenue,company.currency||'NGN')}</h2></div><div><small>Direct job cost</small><h2>{money(unifiedCost,company.currency||'NGN')}</h2></div><div><small>Operating expenses</small><h2>{money(operatingExpenses,company.currency||'NGN')}</h2></div></div><div className="notice" style={{marginTop:12}}>Estimated operating result: <strong>{money(unifiedProfit-operatingExpenses,company.currency||'NGN')}</strong>. Actual profit improves as production costs and waste are recorded.</div></section><section className="card" style={{marginTop:16}}><div className="section-head"><div><h3>Payment methods</h3><span>Selected date range</span></div></div>{['Transfer','Cash','POS','Card','Online','Other / Unclassified'].map(m=>{const normalize=(v:any)=>String(v??'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');const aliases:Record<string,string[]>= {'Transfer':['transfer','bank transfer','bank','online transfer'],'Cash':['cash'],'POS':['pos','point of sale'],'Card':['card','debit card','credit card'],'Online':['online','online payment','payment link']};const total=filteredPayments.filter(x=>m==='Other / Unclassified'?!Object.values(aliases).flat().includes(normalize(x.method)):aliases[m]?.includes(normalize(x.method))).reduce((a,x)=>a+Number(x.amount||0),0);return <div className="stat" key={m}><span>{m}</span><strong><Money value={total}/></strong></div>})}{lastUpdated&&<div className="cell-sub" style={{marginTop:12}}>Last updated {lastUpdated.toLocaleTimeString('en-NG')}</div>}</section>
 </>
}
