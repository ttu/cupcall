import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CupCall — Football Cup Prediction',
    short_name: 'CupCall',
    description:
      'Predict scores, build your bracket, pick the specials. Compete in private pools with friends.',
    start_url: '/',
    display: 'standalone',
    background_color: '#192721',
    theme_color: '#192721',
    icons: [
      { src: '/icon?size=192', sizes: '192x192', type: 'image/png' },
      { src: '/icon?size=512', sizes: '512x512', type: 'image/png' },
    ],
  };
}
