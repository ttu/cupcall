import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        borderRadius: 40,
        background: '#19A861',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 90,
          height: 90,
          borderRadius: '50%',
          border: '14px solid #192721',
        }}
      />
    </div>,
    { ...size },
  );
}
