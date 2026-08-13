import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://cupcall.app',
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://cupcall.app/login',
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
