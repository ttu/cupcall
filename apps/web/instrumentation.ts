export async function register() {
  // Only register in the Node.js runtime; @vercel/otel does not support Edge.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerOTel } = await import('@vercel/otel');
  registerOTel({ serviceName: 'cupp' });
}
