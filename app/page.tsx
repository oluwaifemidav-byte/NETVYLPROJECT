import Link from 'next/link'

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px 20px',
        background: 'linear-gradient(135deg, #06141f 0%, #0f172a 50%, #111827 100%)',
        color: '#e5eef7',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 900,
          background: 'rgba(15, 23, 42, 0.82)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
          padding: '48px 32px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 18,
            borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
            paddingBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #14b8a6, #3b82f6, #8b5cf6)',
                fontWeight: 900,
                color: 'white',
                boxShadow: '0 10px 24px rgba(20, 184, 166, 0.45)',
                fontSize: 28,
              }}
            >
              N
            </div>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.8 }}>BUSINESS MANAGEMENT</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>NETVYL</div>
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.45)',
              color: '#bbf7d0',
              borderRadius: 999,
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 1.2,
            }}
          >
            SALES INQUIRY
          </div>
        </div>

        <div
          style={{
            display: 'inline-block',
            background: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(96, 165, 250, 0.4)',
            color: '#bfdbfe',
            borderRadius: 999,
            padding: '8px 14px',
            fontSize: 12,
            letterSpacing: 1.2,
            fontWeight: 700,
            marginBottom: 18,
          }}
        >
          TRUSTED BY BUSINESSES
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 4rem)', margin: '0 0 18px', lineHeight: 1.1 }}>
          Run your business with one connected platform.
        </h1>

        <p style={{ fontSize: 18, maxWidth: 680, lineHeight: 1.7, color: '#cbd5e1', marginBottom: 32 }}>
          NETVYL helps organizations manage jobs, inventory, staff, payments, reporting, and customer operations from one dashboard.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
          <Link
            href="/activate"
            style={{
              textDecoration: 'none',
              background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)',
              color: 'white',
              padding: '14px 22px',
              borderRadius: 12,
              fontWeight: 700,
              display: 'inline-block',
            }}
          >
            Activate your organization
          </Link>

          <a
            href="mailto:oluwaifemidav@gmail.com"
            style={{
              textDecoration: 'none',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              color: '#e2e8f0',
              padding: '14px 22px',
              borderRadius: 12,
              fontWeight: 700,
              display: 'inline-block',
            }}
          >
            Contact sales
          </a>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
            marginTop: 24,
          }}
        >
          <div style={{ background: 'rgba(15, 118, 110, 0.18)', borderRadius: 16, padding: 20, border: '1px solid rgba(45, 212, 191, 0.25)' }}>
            <div style={{ fontSize: 12, letterSpacing: 1.5, opacity: 0.8, marginBottom: 8 }}>EMAIL</div>
            <a href="mailto:oluwaifemidav@gmail.com" style={{ color: '#a7f3d0', fontWeight: 700 }}>oluwaifemidav@gmail.com</a>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: 16, padding: 20, border: '1px solid rgba(148, 163, 184, 0.25)' }}>
            <div style={{ fontSize: 12, letterSpacing: 1.5, opacity: 0.8, marginBottom: 8 }}>PHONE</div>
            <a href="tel:+2348107992687" style={{ color: '#bfdbfe', fontWeight: 700 }}>+234 810 799 2687</a>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: 16, padding: 20, border: '1px solid rgba(148, 163, 184, 0.25)' }}>
            <div style={{ fontSize: 12, letterSpacing: 1.5, opacity: 0.8, marginBottom: 8 }}>WHATSAPP</div>
            <a href="https://wa.me/2348107992687" target="_blank" rel="noreferrer" style={{ color: '#bbf7d0', fontWeight: 700 }}>Chat on WhatsApp</a>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: 16, padding: 20, border: '1px solid rgba(148, 163, 184, 0.25)' }}>
            <div style={{ fontSize: 12, letterSpacing: 1.5, opacity: 0.8, marginBottom: 8 }}>WEBSITE</div>
            <a href="https://www.netvyl.online" target="_blank" rel="noreferrer" style={{ color: '#bfdbfe', fontWeight: 700 }}>www.netvyl.online</a>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: 16, padding: 20, border: '1px solid rgba(148, 163, 184, 0.25)' }}>
            <div style={{ fontSize: 12, letterSpacing: 1.5, opacity: 0.8, marginBottom: 8 }}>ACTIVATE</div>
            <Link href="/activate" style={{ color: '#bfdbfe', fontWeight: 700 }}>Open activation page</Link>
          </div>
        </div>

        <div
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: '1px solid rgba(148, 163, 184, 0.2)',
            color: '#cbd5e1',
            lineHeight: 1.8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
                color: 'white',
                fontWeight: 900,
                boxShadow: '0 8px 20px rgba(59, 130, 246, 0.35)',
              }}
            >
              N
            </div>
            <div style={{ fontWeight: 900, color: '#f8fafc', fontSize: 20 }}>NETVYL Business Solutions</div>
          </div>

          <div style={{ color: '#e2e8f0', marginBottom: 4 }}>Business Management Platform</div>
          <div>Email: <a href="mailto:oluwaifemidav@gmail.com" style={{ color: '#a7f3d0' }}>oluwaifemidav@gmail.com</a></div>
          <div>Phone: <a href="tel:+2348107992687" style={{ color: '#bfdbfe' }}>+234 810 799 2687</a></div>
          <div>WhatsApp: <a href="https://wa.me/2348107992687" target="_blank" rel="noreferrer" style={{ color: '#bbf7d0' }}>+234 810 799 2687</a></div>
          <div>Website: <a href="https://www.netvyl.online" target="_blank" rel="noreferrer" style={{ color: '#bfdbfe' }}>www.netvyl.online</a></div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
            <Link href="/terms" style={{ color: '#bfdbfe' }}>Terms &amp; Conditions</Link>
            <Link href="/disclaimer" style={{ color: '#bfdbfe' }}>Disclaimer</Link>
          </div>
          <div style={{ marginTop: 8, color: '#f8fafc', fontWeight: 700 }}>NETVYL Business Solutions • Smart Operations • Better Growth</div>
        </div>
      </section>
    </main>
  )
}
