/** Strips trailing slashes without a backtracking-prone regex. */
function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  const rawEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!rawEndpoint) return;
  const endpoint = stripTrailingSlashes(rawEndpoint);

  const [
    { NodeTracerProvider, BatchSpanProcessor },
    { OTLPTraceExporter },
    { resourceFromAttributes },
    { AsyncLocalStorageContextManager },
  ] = await Promise.all([
    import('@opentelemetry/sdk-trace-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/context-async-hooks'),
  ]);

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'cupp' }),
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })),
    ],
  });

  provider.register({
    contextManager: new AsyncLocalStorageContextManager(),
  });
}
