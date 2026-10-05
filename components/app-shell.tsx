'use client'
import Link from 'next/link'
import {usePathname,useRouter} from 'next/navigation'
import {useEffect,useMemo,useRef,useState} from 'react'
import {supabaseBrowser} from '../lib/supabase-browser'
import { DEFAULT_PLATFORM_APP_RELEASE, DEFAULT_PLATFORM_APP_SETTINGS, applyPlatformAppSettings, getCurrentAppVersion, isAppReleaseCurrent, isReleaseUpdateRequired, loadPlatformAppRelease, loadPlatformAppSettings } from '../lib/platform-config'

type Role='super_admin'|'administrator'|'manager'|'staff'|'cashier'|'production'
type NavItem=[string,string,string,Role[]]
const ALL:Role[]=['super_admin','administrator','manager','staff','cashier','production']
const groups:{label:string;items:NavItem[]}[]=[
 {label:'Overview',items:[['/dashboard','⌂','Dashboard',ALL]]},
 {label:'Sales & Production',items:[['/customers','♙','Customers',['super_admin','administrator','manager','staff','cashier']],['/new-job','＋','New Job',['super_admin','administrator','manager','staff']],['/jobs','▤','Job Records',['super_admin','administrator','manager','staff','production']],['/print-station','▶','Print Station',['super_admin','administrator','manager','staff','production']],['/production','⚙','Production Board',['super_admin','administrator','manager','staff','production']],['/quotes','▱','Quotes',['super_admin','administrator','manager','staff']],['/purchasing','⇩','Purchasing',['administrator']],['/expenses','◉','Expenses',['super_admin','administrator','manager']],['/delivery','⇢','Delivery',['super_admin','administrator','manager','staff','production']]]},
 {label:'Money & Stock',items:[['/payments','₦','Payments',['super_admin','administrator','manager','cashier']],['/receipts','▥','Receipts',['super_admin','administrator','manager','cashier']],['/inventory','◫','Inventory',['super_admin','administrator','manager']],['/inventory/labels','▥','Inventory Labels',['super_admin','administrator']],['/reports','◒','Reports',['super_admin','administrator','manager']]]},
 {label:'Administration',items:[['/admin','⚙','Administration',['super_admin','administrator','manager']],['/admin/setup','☷','Business Setup',['administrator']],['/admin/backup','⇩','Backup & Export',['administrator']],['/notifications','●','Notifications',ALL],['/master-admin','◆','Master Admin',['super_admin']]]}
]
const routeRoles:Record<string,Role[]>={'/dashboard':ALL,'/customers':['super_admin','administrator','manager','staff','cashier'],'/new-job':['super_admin','administrator','manager','staff'],'/jobs':['super_admin','administrator','manager','staff','production'],'/print-station':['super_admin','administrator','manager','staff','production'],'/production':['super_admin','administrator','manager','staff','production'],'/quotes':['super_admin','administrator','manager','staff'],'/purchasing':['administrator'],'/expenses':['super_admin','administrator','manager'],'/delivery':['super_admin','administrator','manager','staff','production'],'/notifications':ALL,'/payments':['super_admin','administrator','manager','cashier'],'/receipts':['super_admin','administrator','manager','cashier'],'/inventory':['super_admin','administrator','manager'],'/inventory/labels':['super_admin','administrator'],'/reports':['super_admin','administrator','manager'],'/admin':['super_admin','administrator','manager'],'/admin/setup':['administrator'],'/admin/backup':['administrator'],'/master-admin':['super_admin']}
const SUPPORT_KEY='netvyl-support-organization'
const WORKSPACE_CACHE_KEY='netvyl-workspace-cache'
const PUBLIC_PATHS=['/login','/forgot-password','/update-password','/activate','/register']

function readWorkspaceCache(){
  if(typeof window==='undefined') return null
  try{
    const raw = window.sessionStorage.getItem(WORKSPACE_CACHE_KEY)
    if(!raw) return null
    const parsed = JSON.parse(raw)
    if(!parsed || !parsed.orgId || !parsed.role) return null
    return parsed
  }catch{
    return null
  }
}

function writeWorkspaceCache(payload:any){
  if(typeof window==='undefined') return
  try{window.sessionStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(payload))}catch{}
}

function clearWorkspaceCache(){
  if(typeof window==='undefined') return
  try{window.sessionStorage.removeItem(WORKSPACE_CACHE_KEY)}catch{}
}

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

export function AppShell({children}:{children:React.ReactNode}){
 const path=usePathname(),router=useRouter();const [open,setOpen]=useState(false),[online,setOnline]=useState(typeof navigator==='undefined'||navigator.onLine),[user,setUser]=useState<any>(null),[org,setOrg]=useState<any>(null),[role,setRole]=useState<Role|null>(null),[memberships,setMemberships]=useState<any[]>([]),[platformAdmin,setPlatformAdmin]=useState(false),[subscription,setSubscription]=useState<any>(null),[supportMode,setSupportMode]=useState(false),[loading,setLoading]=useState(true),[platformConfig,setPlatformConfig]=useState(DEFAULT_PLATFORM_APP_SETTINGS),[platformRelease,setPlatformRelease]=useState(DEFAULT_PLATFORM_APP_RELEASE)
 const s=useMemo(()=>{try{return supabaseBrowser()}catch{return null}},[])
 const lastLoadedPathRef=useRef<string | null>(null)
 useEffect(()=>{setOnline(typeof navigator==='undefined'||navigator.onLine);const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[])
 useEffect(()=>{if(!s)return;let active=true;loadPlatformAppSettings(s).then((settings)=>{if(active){setPlatformConfig(settings);applyPlatformAppSettings(settings)}}).catch(()=>{});loadPlatformAppRelease(s).then((release)=>{if(active){setPlatformRelease(release)}}).catch(()=>{});return()=>{active=false}},[s])
 useEffect(()=>{if(!s)return;const sb=s;if(PUBLIC_PATHS.includes(path)){setLoading(false);return}let alive=true
  async function loadWorkspace(){
   setLoading(true)
   const {data:{user}}=await sb.auth.getUser();if(!alive)return;if(!user){router.replace('/login');return}setUser(user)
   const cached = readWorkspaceCache()
   if(cached && cached.userId===user.id && cached.orgId && lastLoadedPathRef.current===path){
     setOrg(cached.org || null)
     setRole(cached.role || null)
     setMemberships(cached.memberships || [])
     setPlatformAdmin(Boolean(cached.platformAdmin))
     setSubscription(cached.subscription || null)
     setSupportMode(Boolean(cached.supportMode))
     setLoading(false)
     return
   }
   let platform=false
   try{const {data}=await sb.rpc('netvyl_is_platform_super_admin');platform=data===true}catch{}
   const {data:members}=await sb.from('organization_members').select('organization_id,role,active').eq('user_id',user.id).eq('active',true)
   const isPlatform = platform || (members?.some((m:any)=>String(m.role||'').toLowerCase()==='super_admin') ?? false);setPlatformAdmin(isPlatform)
   const supportOrg=typeof window!=='undefined'?localStorage.getItem(SUPPORT_KEY):null
   let selected:any=null,selectedRole:Role|null=null,isSupport=false
   if(isPlatform && supportOrg){const {data:sub}=await sb.rpc('netvyl_has_support_access',{p_org_id:supportOrg});if(sub===true){const {data:o}=await sb.from('organizations').select('*').eq('id',supportOrg).maybeSingle();if(o){selected=o;selectedRole='administrator';isSupport=true}}else localStorage.removeItem(SUPPORT_KEY)}
   if(!selected && members?.length){const saved=typeof window!=='undefined'?localStorage.getItem('netvyl-active-organization'):null;const m=members.find((x:any)=>x.organization_id===saved)||members[0];const {data:o}=await sb.from('organizations').select('*').eq('id',m.organization_id).maybeSingle();selected=o||null;selectedRole=String(m.role||'').toLowerCase() as Role}
   if(!selected && isPlatform && path==='/master-admin'){setOrg(null);setRole('super_admin');setMemberships([]);setSupportMode(false);setSubscription(null);setLoading(false);writeWorkspaceCache({userId:user.id,orgId:null,role:'super_admin',memberships:[],platformAdmin:true,subscription:null,supportMode:false});return}
   if(!selected){setLoading(false);router.replace('/login');clearWorkspaceCache();return}
   if(typeof window!=='undefined')localStorage.setItem('netvyl-active-organization',selected.id)
   const {data:sub}=await sb.rpc('netvyl_get_org_subscription',{p_org_id:selected.id});const subscriptionData=sub?.[0]||null;setSubscription(subscriptionData);setOrg(selected);setRole(selectedRole);setSupportMode(isSupport)
   const nextMemberships=(members||[]).map((m:any)=>({...m,organization_name:m.organization_id===selected.id?selected.name:m.organization_id}))
   setMemberships(nextMemberships)
   writeWorkspaceCache({userId:user.id,orgId:selected.id,role:selectedRole,org:selected,memberships:nextMemberships,platformAdmin:isPlatform,subscription:subscriptionData,supportMode:isSupport})
   setLoading(false)
   const allowed=routeRoles[path];const routeAllowed=path==='/master-admin'?isPlatform:!!allowed?.includes(selectedRole as Role)
   if(allowed&&!routeAllowed)router.replace('/dashboard')
  }
  if(lastLoadedPathRef.current!==path){lastLoadedPathRef.current=path;loadWorkspace()} else if(!org || !role){loadWorkspace()}
  const sessionStartedKey='netvyl-session-started-at';if(typeof window!=='undefined'&&!localStorage.getItem(sessionStartedKey))localStorage.setItem(sessionStartedKey,new Date().toISOString());const checkRevocation=async()=>{if(!alive)return;const {data:cu}=await sb.auth.getUser();const activeOrg=typeof window!=='undefined'?localStorage.getItem('netvyl-active-organization'):null;if(!cu.user?.id||!activeOrg)return;const {data:m}=await sb.from('organization_members').select('session_revoked_at,active').eq('organization_id',activeOrg).eq('user_id',cu.user.id).maybeSingle();const started=localStorage.getItem(sessionStartedKey);if(m&&(!m.active||(m.session_revoked_at&&started&&new Date(m.session_revoked_at).getTime()>new Date(started).getTime()))){await sb.auth.signOut();localStorage.removeItem(sessionStartedKey);clearWorkspaceCache();router.replace('/login')}};const revocationTimer=window.setInterval(checkRevocation,300000);const onOrg=()=>loadWorkspace();window.addEventListener('netvyl:organization-updated',onOrg);return()=>{alive=false;window.clearInterval(revocationTimer);window.removeEventListener('netvyl:organization-updated',onOrg)}
 },[s,path,router])
 async function switchWorkspace(id:string){if(!s||!id)return;await s.rpc('master_end_support');localStorage.removeItem(SUPPORT_KEY);localStorage.setItem('netvyl-active-organization',id);window.dispatchEvent(new Event('netvyl:organization-updated'))}
 async function exitSupport(){if(!s)return;await s.rpc('master_end_support');localStorage.removeItem(SUPPORT_KEY);window.location.href='/master-admin'}
 async function logout(){if(s){if(supportMode)await s.rpc('master_end_support');await s.auth.signOut()}localStorage.removeItem('netvyl-active-organization');localStorage.removeItem(SUPPORT_KEY);localStorage.removeItem('netvyl-session-started-at');router.replace('/login')}
 const visibleGroups=useMemo(()=>groups.map(g=>({...g,items:g.items.filter(item=>{
   if(item[0]==='/master-admin') return platformAdmin
   if(item[0]==='/new-job' && !platformConfig.enable_dtf_calculator) return false
   if(item[0]==='/inventory/labels' && !platformConfig.enable_inventory_labels) return false
   return role ? item[3].includes(role) : false
 })})).filter(g=>g.items.length),[platformAdmin,platformConfig.enable_dtf_calculator,platformConfig.enable_inventory_labels,role])
 const current=useMemo(()=>groups.flatMap(g=>g.items).find(x=>path===x[0])?.[2]||'Dashboard',[path])
 const releaseNotice = platformRelease && !isAppReleaseCurrent(platformRelease) ? (
   <div className="notice warning" style={{marginBottom:12}}>
     <strong>App update available:</strong> {platformRelease.release_version} is live. Your installed version is {getCurrentAppVersion()}. {platformRelease.is_force_update ? 'This update is required to continue using the platform.' : 'Please refresh the app when convenient.'}
     {platformRelease.release_notes && <div style={{marginTop:8}}>{platformRelease.release_notes}</div>}
   </div>
 ) : null
 const forceUpdateRequired = isReleaseUpdateRequired(platformRelease)
 const expired=!!subscription&&subscription.access_status==='expired'
 if(PUBLIC_PATHS.includes(path))return <>{children}</>
 if(forceUpdateRequired && path !== '/master-admin'){
   return <div className="app-shell"><div className="main-shell" style={{marginLeft:0}}><main className="content"><div className="card" style={{maxWidth:540,margin:'40px auto'}}><div className="brand-block compact"><div className="brand-mark">N</div><div><div className="brand-name">{platformConfig.app_name}</div><div className="brand-sub">{platformConfig.app_tagline}</div></div></div><div className="notice error" style={{marginTop:16}}><strong>Update required.</strong><div style={{marginTop:8}}>A required app update is available ({platformRelease.release_version}). Please refresh the app or reopen the latest build to continue.</div>{platformRelease.release_notes && <div style={{marginTop:8}}>{platformRelease.release_notes}</div>}</div><button className="btn primary wide" style={{marginTop:16}} onClick={()=>window.location.reload()}>Refresh app</button></div></main></div></div>
 }
 if(!s||loading)return <div className="app-shell"><div className="main-shell" style={{marginLeft:0}}><main className="content"><div className="card" style={{marginTop:40}}><div className="brand-block compact"><div className="brand-mark">N</div><div><div className="brand-name">{platformConfig.app_name}</div><div className="brand-sub">{platformConfig.app_tagline}</div></div></div><div className="loading-state">Loading workspace…</div></div></main></div></div>
 return <div className="app-shell"><aside className={`sidebar ${open?'mobile-open':''}`}><div className="brand-block"><div className="brand-mark">N</div><div><div className="brand-name">{platformConfig.app_name}</div><div className="brand-sub">{platformConfig.app_tagline}</div></div></div><div className="workspace"><span className="status-dot"/><div style={{minWidth:0,flex:1}}><strong>{org?.name||'Platform Workspace'}</strong><small>{org?.currency||'—'} · {supportMode?'SUPPORT MODE':'Connected'}</small>{!supportMode&&memberships.length>1&&<select className="workspace-switcher" value={org?.id||''} onChange={e=>switchWorkspace(e.target.value)}>{memberships.map((m:any)=><option key={m.organization_id} value={m.organization_id}>{m.organization_name}</option>)}</select>}</div><span className="chev">›</span></div>{supportMode&&<div className="notice" style={{margin:10,fontSize:12}}><strong>Support Mode</strong><br/>You are operating inside this organization.<button className="btn small wide" style={{marginTop:8}} onClick={exitSupport}>Exit Support Mode</button></div>}<nav className="nav-groups">{visibleGroups.map(g=><div className="nav-group" key={g.label}><div className="nav-label">{g.label}</div>{g.items.map(([href,icon,label])=><Link className={path===href?'active':''} href={href} key={href} onClick={()=>setOpen(false)}><span className="nav-icon">{icon}</span><span>{label}</span></Link>)}</div>)}</nav><div className="sidebar-footer"><button className="logout" onClick={logout}>↪ <span>Log out</span></button></div></aside><div className="main-shell"><header className="topbar"><div className="top-left"><button className="mobile-menu" onClick={()=>setOpen(!open)}>☰</button><div><div className="eyebrow">{supportMode?'SUPPORT WORKSPACE':'WORKSPACE'}</div><div className="page-title">{current}</div></div></div><div className="top-actions"><button className="btn top-refresh" onClick={()=>window.dispatchEvent(new Event('netvyl:organization-updated'))}>Refresh</button><div className="avatar">{(user?.email?.[0]||'N').toUpperCase()}</div></div></header><main className="content">{supportMode&&<div className="notice" style={{marginBottom:14}}><strong>Master Admin Support Mode:</strong> All actions are scoped to <strong>{org?.name}</strong> and are recorded in the audit log.</div>}{expired&&<div className="notice error" style={{marginBottom:14}}><strong>License expired:</strong> Your business records remain available in read-only mode. New jobs, payments, inventory changes and other operational actions require renewal. <a href="/renew">Renew license</a>.</div>}{subscription&&subscription.access_status==='active'&&subscription.days_remaining!==null&&subscription.days_remaining<=14&&<div className="notice" style={{marginBottom:14,background:'#fff8e8',borderColor:'#f0dfb0',color:'#7b5a12'}}><strong>License notice:</strong> {subscription.days_remaining} day{subscription.days_remaining===1?'':'s'} remaining on {subscription.plan_name}.</div>}{children}</main><footer className="app-footer">Software designed &amp; developed by <strong>NETVYL Digital Resources Global Ltd</strong></footer></div></div>
}
