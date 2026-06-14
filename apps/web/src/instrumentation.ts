export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

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
