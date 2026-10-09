import { ImageResponse } from 'next/og'

export const alt = 'NETVYL Business Management Platform'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '66px 76px',
          color: '#fff8fb',
          background: 'linear-gradient(135deg, #160b12 0%, #32101f 55%, #6e1738 100%)',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              background: 'linear-gradient(135deg, #d94b7c, #8e1c49)',
              fontSize: 48,
              fontWeight: 800,
            }}
          >
            N
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: 2 }}>NETVYL</span>
            <span style={{ fontSize: 16, letterSpacing: 3, color: '#e9b4c7' }}>BUSINESS MANAGEMENT</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 950 }}>
          <div style={{ fontSize: 58, lineHeight: 1.12, fontWeight: 750 }}>
            Run your business with one connected platform.
          </div>
          <div style={{ marginTop: 24, fontSize: 25, color: '#f0cfda' }}>
            Sales · Jobs · Payments · Inventory · Team operations
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 21, color: '#f4dce5' }}>
          <span>NETVYL Digital Resources Global Ltd</span>
          <span>netvyl.online</span>
        </div>
      </div>
    ),
    size,
  )
}
