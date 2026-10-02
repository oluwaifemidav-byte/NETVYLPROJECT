'use client'
import {useEffect,useMemo,useState} from 'react'
import {useParams} from 'next/navigation'
import {supabaseBrowser} from '../../../lib/supabase-browser'
import {getActiveOrganizationId} from '../../../lib/organization-context'
import {PageHead,Empty,Money,Badge} from '../../../components/ui'


export default function CustomerJobs(){const ORG=getActiveOrganizationId();
 const {id}=useParams<{id:string}>(); const s=useMemo(()=>supabaseBrowser(),[])
 const [customer,setCustomer]=useState<any>(null),[jobs,setJobs]=useState<any[]>([]),[orders,setOrders]=useState<any[]>([]),[services,setServices]=useState<string[]>([]),[loading,setLoading]=useState(true),[msg,setMsg]=useState('')
 async function load(){
  setLoading(true); setMsg('')
  const {data:c,error:ce}=await s.from('customers').select('*').eq('organization_id',ORG).eq('id',id).maybeSingle()
  if(ce||!c){setMsg(ce?.message||'Customer not found.');setLoading(false);return}
  setCustomer(c)
  const {data:o}=await s.from('job_orders').select('id,order_no,grand_total,amount_paid,status,created_at').eq('organization_id',ORG).eq('customer_id',id).order('created_at',{ascending:false}).limit(100);setOrders(o||[]);if(o?.length){const {data:ls}=await s.from('job_lines').select('service_id,business_services(name)').eq('organization_id',ORG).in('order_id',o.map(x=>x.id));setServices([...new Set((ls||[]).map((x:any)=>x.business_services?.name).filter(Boolean))])}
  const {data:j,error:je}=await s.from('jobs').select('id,job_no,job_date,material_name_snapshot,grand_total,amount_paid,receipt_no,status,created_at').eq('organization_id',ORG).eq('customer_id',id).is('deleted_at',null).order('job_date',{ascending:false}).order('created_at',{ascending:false})
  if(je)setMsg(je.message); setJobs(j||[]); setLoading(false)
 }
 useEffect(()=>{if(id)load()},[id])
 const orderTotal=orders.reduce((a,j)=>a+Number(j.grand_total||0),0),orderPaid=orders.reduce((a,j)=>a+Number(j.amount_paid||0),0); const total=jobs.reduce((a,j)=>a+Number(j.grand_total||0),0), paid=jobs.reduce((a,j)=>a+Number(j.amount_paid||0),0), balance=Math.max(0,total-paid)
 return <>
  <PageHead title={customer?customer.name:'Customer Jobs'} subtitle="Complete job history, receipts and outstanding balance for this customer." actions={<><a className="btn" href="/customers">← Customers</a>{customer&&<a className="btn primary" href={`/new-job?customer=${customer.id}`}>＋ New Job</a>}</>}/>
  {loading?<section className="card" style={{marginTop:20}}><div className="empty-state">Loading customer history…</div></section>:msg?<section className="card" style={{marginTop:20}}><div className="notice">{msg}</div></section>:<>
   <section className="stats-grid" style={{marginTop:20}}><div className="stat-card"><span>Total jobs</span><strong>{jobs.length}</strong></div><div className="stat-card"><span>Total value</span><strong><Money value={total}/></strong></div><div className="stat-card"><span>Total paid</span><strong><Money value={paid}/></strong></div><div className="stat-card"><span>Balance</span><strong className={balance?'wine-text':''}><Money value={balance}/></strong></div></section>
   <section className="card" style={{marginTop:16}}><div className="section-head"><div><h3>{customer.name}</h3><span>{customer.phone||'No phone'}{customer.email?` · ${customer.email}`:''}{customer.address?` · ${customer.address}`:''}</span></div></div>
   {jobs.length?<div className="tablewrap"><table><thead><tr><th>Job ID</th><th>Date</th><th>Material</th><th>Total</th><th>Paid</th><th>Balance</th><th>Receipt</th><th>Status</th><th>Action</th></tr></thead><tbody>{jobs.map(j=>{const b=Math.max(0,Number(j.grand_total||0)-Number(j.amount_paid||0));return <tr key={j.id}><td><strong>{j.job_no}</strong></td><td>{j.job_date}</td><td>{j.material_name_snapshot||'—'}</td><td><Money value={j.grand_total}/></td><td><Money value={j.amount_paid}/></td><td className={b?'wine-text':''}><Money value={b}/></td><td>{j.receipt_no||'—'}</td><td><Badge tone={b===0?'success':'warning'}>{b===0?'PAID':'OUTSTANDING'}</Badge></td><td><a className="btn small" href={`/jobs?job=${j.id}`}>View job</a></td></tr>})}</tbody></table></div>:<Empty title="No jobs for this customer" text="Create the first job for this customer."/>}</section><section className="card" style={{marginTop:16}}><div className="section-head"><div><h3>NETVYL customer memory</h3><span>Recent unified orders and repeat-business context.</span></div></div><div className="stats"><div className="stat"><span>Unified orders</span><strong>{orders.length}</strong></div><div className="stat"><span>Unified value</span><strong><Money value={orderTotal}/></strong></div><div className="stat"><span>Unified balance</span><strong><Money value={Math.max(0,orderTotal-orderPaid)}/></strong></div><div className="stat"><span>Recent services</span><strong>{services.slice(0,3).join(', ')||'—'}</strong></div></div>{orders.length?<div className="tablewrap" style={{marginTop:12}}><table><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead><tbody>{orders.slice(0,10).map(o=><tr key={o.id}><td><strong>{o.order_no}</strong></td><td>{String(o.created_at).slice(0,10)}</td><td><Money value={o.grand_total}/></td><td><Money value={o.amount_paid}/></td><td><Badge tone={Number(o.grand_total)<=Number(o.amount_paid)?'success':'warning'}>{o.status}</Badge></td></tr>)}</tbody></table></div>:<div className="empty-state">No unified orders yet.</div>}</section>
  </>}
 </>
}
