import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dev/'] },
    sitemap: 'https://cupcall.app/sitemap.xml',
    host: 'https://cupcall.app',
  };
}
