'use client'
import Link from 'next/link'
import {useState} from 'react'
import {supabaseBrowser} from '../../lib/supabase-browser'

export default function ForgotPassword(){
  const [email,setEmail]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  async function submit(e:React.FormEvent){
    e.preventDefault(); setBusy(true); setMessage(''); setError('')
    const origin=window.location.origin
    const {error}=await supabaseBrowser().auth.resetPasswordForEmail(email.trim(),{redirectTo:`${origin}/update-password`})
    if(error) setError(error.message)
    else setMessage('Password reset instructions have been sent. Open the email and use the secure link to create a new password.')
    setBusy(false)
  }

  return <main className="auth-page">
    <div className="auth-brand"><div className="brand-mark large">N</div><div><div className="brand-name">NETVYL</div><div className="brand-sub">BUSINESS MANAGEMENT PLATFORM</div></div></div>
    <form className="auth-card" onSubmit={submit}>
      <span className="kicker">ACCOUNT RECOVERY</span>
      <h1>Reset password</h1>
      <p>Enter your account email and we will send you a secure password-reset link.</p>
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>
      {error&&<div className="notice error">{error}</div>}
      {message&&<div className="notice">{message}</div>}
      <button className="btn primary wide" disabled={busy}>{busy?'Sending…':'Send reset link'}</button>
      <div style={{textAlign:'center',marginTop:14}}><Link href="/login">Back to sign in</Link></div>
      <small className="auth-foot">Powered by NETVYL Digital Resources Global Ltd</small>
    </form>
  </main>
}
