import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'CupCall — Football Cup Prediction';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#192721',
        padding: '72px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Radial glow top-right */}
      <div
        style={{
          position: 'absolute',
          top: -80,
          right: -80,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(25,168,97,0.22) 0%, transparent 70%)',
        }}
      />
      {/* Radial glow bottom-left */}
      <div
        style={{
          position: 'absolute',
          bottom: -60,
          left: -60,
          width: 380,
          height: 380,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,121,46,0.16) 0%, transparent 70%)',
        }}
      />

      {/* Logo mark + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Logo mark: green rounded square with football */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: '#19A861',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 0 0 2.5px rgba(255,255,255,0.18)',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '4px solid #192721',
            }}
          />
        </div>
        {/* Wordmark */}
        <div
          style={{
            fontFamily: 'serif',
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#ffffff',
            display: 'flex',
          }}
        >
          CUP
          <span style={{ color: '#E8792E' }}>CALL</span>
        </div>
      </div>

      {/* Headline */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div
          style={{
            fontFamily: 'serif',
            fontSize: 80,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
          }}
        >
          Call every match.
          <br />
          Then defend it.
        </div>
        <div
          style={{
            fontSize: 26,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'sans-serif',
            lineHeight: 1.5,
          }}
        >
          Predict scores · build your bracket · compete in private pools
        </div>

        {/* Domain pill */}
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1.5px solid rgba(255,255,255,0.14)',
              borderRadius: 100,
              padding: '8px 22px',
              fontSize: 22,
              color: 'rgba(255,255,255,0.7)',
              fontFamily: 'monospace',
              letterSpacing: '0.03em',
            }}
          >
            cupcall.app
          </div>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
