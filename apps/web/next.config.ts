import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile workspace packages so Next.js webpack can resolve their
  // TypeScript source files (which use .js extensions in imports, per ESM TS convention).
  transpilePackages: ['@cup/engine', '@cup/db', '@cup/schemas'],
  // Keep these as native Node.js requires — webpack mangles their internal
  // worker-thread file paths (thread-stream/lib/worker.js, etc.) which crashes
  // the render worker before instrumentation.ts can run.
  serverExternalPackages: [
    'pino',
    'thread-stream',
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/context-async-hooks',
  ],
  webpack(config) {
    // Allow .js extensions in TypeScript source to resolve to .ts/.tsx files.
    // This is required by workspace packages that use ESM-style relative imports.
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
        '.jsx': ['.tsx', '.jsx'],
      },
    };
    return config;
  },
};

export default nextConfig;
