'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {supabaseBrowser} from '../../lib/supabase-browser'
import {PageHead,StatCard,Badge} from '../../components/ui'
import { CURRENT_APP_VERSION, DEFAULT_PLATFORM_APP_RELEASE, DEFAULT_PLATFORM_APP_SETTINGS, applyPlatformAppSettings, loadPlatformAppRelease, loadPlatformAppSettings, savePlatformAppRelease, savePlatformAppSettings } from '../../lib/platform-config'

async function isPlatformSuperAdmin(sb:any,userId:string|null|undefined){
 if(!sb||!userId) return false
 try{
  const {data,error}=await sb.rpc('netvyl_is_platform_super_admin')
  if(!error && data===true) return true
 }catch{}
 try{
  const {data,error}=await sb.from('organization_members').select('id').eq('user_id',userId).eq('active',true).ilike('role','super_admin').limit(1).maybeSingle()
  if(!error && !!data) return true
 }catch{}
 return false
}

export default function MasterAdmin(){
 const s=useMemo(()=>supabaseBrowser(),[]);const [orgs,setOrgs]=useState<any[]>([]),[licenses,setLicenses]=useState<any[]>([]),[payments,setPayments]=useState<any[]>([]),[devices,setDevices]=useState<any[]>([]),[audit,setAudit]=useState<any[]>([]),[requests,setRequests]=useState<any[]>([]),[allowed,setAllowed]=useState<boolean|undefined>(undefined)
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[error,setError]=useState(''),[toast,setToast]=useState(''),[orgOpen,setOrgOpen]=useState(false),[licOpen,setLicOpen]=useState(false),[requestModal,setRequestModal]=useState<any|null>(null),[requestEmailBusy,setRequestEmailBusy]=useState(false)
 const [orgForm,setOrgForm]=useState({name:'',slug:'',currency:'NGN'}),[licForm,setLicForm]=useState({plan:'professional',days:'365',max_users:'5',max_devices:'3',price:'0',buyer_email:''})
 const load=useCallback(async()=>{setError('');const [o,l,p,d,a,au]=await Promise.all([s.from('organizations').select('*').order('created_at',{ascending:false}),s.from('licenses').select('*').order('created_at',{ascending:false}),s.from('payments').select('*').order('created_at',{ascending:false}),s.from('license_devices').select('*').order('created_at',{ascending:false}),s.from('audit_logs').select('*').order('created_at',{ascending:false}),s.from('license_requests').select('*').order('created_at',{ascending:false})]);setOrgs(o.data||[]);setLicenses(l.data||[]);setPayments(p.data||[]);setDevices(d.data||[]);setAudit(a.data||[]);setRequests(au.data||[])} , [s])
 useEffect(()=>{(async()=>{const {data:{user}}=await s.auth.getUser();if(!user){setAllowed(false);return}setAllowed(await isPlatformSuperAdmin(s,user.id))})()},[s]);useEffect(()=>{if(allowed)load()},[allowed,load])
 useEffect(()=>{let active=true;loadPlatformAppSettings(s).then((settings)=>{if(active){applyPlatformAppSettings(settings)}}).catch(()=>{});loadPlatformAppRelease(s).catch(()=>{});return()=>{active=false}},[s])
 async function convertRequestToOrg(r:any){
  const companyName=String(r?.company_name||r?.full_name||'').trim()
  if(!companyName){
   setError('Request is missing a company name.')
   return
  }
  if(!window.confirm(`Create ${companyName}, generate its pending license, and mark this request converted?`)) return
  setBusy(true)
  setError('')
  try{
   const slug=companyName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
   const {data,error}=await s.rpc('master_convert_license_request',{
    p_request_id: r.id,
    p_name: companyName,
    p_slug: slug || companyName,
    p_currency: 'NGN',
    p_plan: 'professional',
    p_days: Number(licForm.days) || 365,
    p_max_users: Math.max(1, Number(r?.user_count || licForm.max_users || 5) || 5),
    p_price: Number(licForm.price) || 0,
   })
   if(error) throw error
   const orgId=data?.[0]?.organization_id
   const licenseId=data?.[0]?.license_id
   const licenseKey=data?.[0]?.license_key
   if(!orgId || !licenseId) throw new Error('The server did not return the new organization or license.')
   setMsg(`Created ${companyName}. Its license is pending payment verification (${licenseKey || 'key pending'}).`)
   setToast(`Converted ${companyName} to pending activation.`)
   setRequestModal(null)
   await load()
  }catch(e:any){
   setError(e?.message||'Unable to convert request.')
   await load()
  }finally{
   setBusy(false)
  }
 }
 async function resendLicenseEmailForRequest(r:any){
  const orgId=String(r?.converted_organization_id||'').trim()
  if(!orgId){
   setError('This request has not been linked to a converted organization yet.')
   return
  }
  const lic=licenses.filter((x:any)=>x.organization_id===orgId).sort((a:any,b:any)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]
  if(!lic?.id){
   setError('No license was found for the converted organization. Refresh and try again.')
   return
  }
  const orgName=orgs.find((o:any)=>String(o.id)===orgId)?.name || r?.company_name || r?.full_name || 'Converted organization'
  if(!window.confirm(`Resend the license email for ${orgName} to ${lic.buyer_email||r.email}?`)) return
  await sendLicenseEmail(lic.id)
 }
 async function sendLicenseEmail(id:string){
  if(!id){setError('License ID is missing. Refresh the page and try again.');return}
  setBusy(true);setError('');setMsg('')
  try{
   const {data:{session}}=await s.auth.getSession()
   if(!session?.access_token){setError('Your Master Admin session has expired. Please sign in again.');return}
   const {data,error}=await s.functions.invoke('send-license-email',{body:{licenseId:id}})
   if(error){
    let detail=error.message||'Failed to send a request to the Edge Function.'
    try{const ctx=(error as any).context;if(ctx&&typeof ctx.json==='function'){const body=await ctx.json();detail=body?.error||body?.message||detail}}catch{}
    setError(`Email failed: ${detail}`)
    return
   }
   if(data?.error){setError(`Email failed: ${data.error}`);return}
   if(data?.success!==true){setError('Email failed: The Edge Function did not confirm delivery.');return}
   setMsg('License key emailed successfully.')
  }catch(e:any){setError(`Email failed: ${e?.message||String(e)}`)}
  finally{setBusy(false)}
 }
 if(allowed===false)return <div className="card" style={{marginTop:20}}><h3>Access restricted</h3><p>You do not have permission to access Master Admin.</p></div>
 if(allowed!==true)return <div className="card" style={{marginTop:20}}>Checking access…</div>
 const active=licenses.filter(x=>x.status==='active').length,pending=licenses.filter(x=>x.payment_status==='pending'||x.status==='pending').length
 return <><PageHead title="Master Admin" subtitle="Platform control for organizations, licensing, payments, devices and support." actions={<><button className="btn" disabled={busy} onClick={load}>Refresh</button></>} />
  <div className="stats"><StatCard label="Organizations" value={orgs.length} icon="◆"/><StatCard label="Active licenses" value={active} icon="✓"/><StatCard label="Pending payment" value={pending} icon="⌛"/></div>
  <section className="card" style={{marginTop:16}}><div className="section-head"><div><h3>Organizations</h3><span>Each customer workspace is isolated from the platform.</span></div><button className="btn primary" onClick={()=>setOrgOpen(true)}>Create organization</button></div></section>
  <section className="card" style={{marginTop:16}}><div className="section-head"><div><h3>License Management</h3><span>Payment must be verified before access is granted.</span></div></div></section>
  <section className="card" style={{marginTop:16}}><div className="section-head"><div><h3>Payment Verification</h3><span>Review transfer evidence/reference before activating a license.</span></div></div></section>
  {requestModal&&<div className="modal-backdrop"><section className="modal card"><div className="section-head"><div><h3>Request details</h3><span>{requestModal.company_name}</span></div><button className="btn" onClick={()=>setRequestModal(null)}>Close</button></div><div style={{display:'grid',gap:10}}><p><strong>Name:</strong> {requestModal.full_name}</p><p><strong>Email:</strong> {requestModal.email}</p><p><strong>Status:</strong> <Badge>{requestModal.status}</Badge></p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{requestModal.status==='converted'? <button className="btn primary" disabled={busy} onClick={()=>resendLicenseEmailForRequest(requestModal)}>Resend license email{requestModal.converted_organization_id&&orgs.find((o:any)=>String(o.id)===String(requestModal.converted_organization_id)) ? ` · ${orgs.find((o:any)=>String(o.id)===String(requestModal.converted_organization_id))?.name}` : ''}</button> : <button className="btn primary" disabled={busy} onClick={()=>convertRequestToOrg(requestModal)}>Create organization from this request</button>} </div></div></section></div>}
 </>
}
