'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {supabaseBrowser} from '../../lib/supabase-browser'

export default function UpdatePassword(){
  const router=useRouter()
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [ready,setReady]=useState(false)

  useEffect(()=>{
    const s=supabaseBrowser()
    let mounted=true
    const check=async()=>{
      const {data:{session}}=await s.auth.getSession()
      if(mounted){
        if(session) setReady(true)
        else setError('This password-reset link is missing or has expired. Request a new reset link.')
      }
    }
    check()
    const {data:{subscription}}=s.auth.onAuthStateChange((event,session)=>{
      if(!mounted)return
      if(session && (event==='PASSWORD_RECOVERY'||event==='SIGNED_IN')){setReady(true);setError('')}
    })
    return()=>{mounted=false;subscription.unsubscribe()}
  },[])

  async function submit(e:React.FormEvent){
    e.preventDefault();setError('');setMessage('')
    if(password.length<8){setError('Password must be at least 8 characters.');return}
    if(password!==confirm){setError('Passwords do not match.');return}
    setBusy(true)
    const {error}=await supabaseBrowser().auth.updateUser({password})
    if(error){setError(error.message);setBusy(false);return}
    setMessage('Password updated successfully. Redirecting to your workspace…')
    setTimeout(()=>router.push('/dashboard'),900)
    setBusy(false)
  }

  return <main className="auth-page">
    <div className="auth-brand"><div className="brand-mark large">N</div><div><div className="brand-name">NETVYL</div><div className="brand-sub">BUSINESS MANAGEMENT PLATFORM</div></div></div>
    <form className="auth-card" onSubmit={submit}>
      <span className="kicker">SECURE ACCOUNT</span>
      <h1>Create new password</h1>
      <p>Set a new password for your NETVYL workspace account.</p>
      <label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password"/></label>
      <label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required autoComplete="new-password"/></label>
      {error&&<div className="notice error">{error}</div>}
      {message&&<div className="notice">{message}</div>}
      <button className="btn primary wide" disabled={busy||!ready}>{busy?'Updating…':'Update password'}</button>
      {!ready&&!error&&<small style={{display:'block',marginTop:12}}>Waiting for the secure recovery session…</small>}
      <div style={{textAlign:'center',marginTop:14}}><Link href="/login">Back to sign in</Link></div>
      <small className="auth-foot">Powered by NETVYL Digital Resources Global Ltd</small>
    </form>
  </main>
}
