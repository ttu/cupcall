import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 9,
        background: '#19A861',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '2.5px solid #192721',
        }}
      />
    </div>,
    { ...size },
  );
}
