/**
 * TRACES — OpenTelemetry
 *
 * Este arquivo é carregado ANTES da aplicação (node --require ./dist/tracing.js ...).
 * Ele "liga" a auto-instrumentação: toda requisição HTTP recebida (Express) e
 * enviada (fetch) vira um span automaticamente, e o contexto do trace
 * (cabeçalho W3C `traceparent`) é propagado entre os serviços.
 *
 * Os spans são enviados via OTLP/HTTP para o Grafana Tempo.
 * Configuração por variáveis de ambiente (ver docker-compose.yml):
 *   OTEL_SERVICE_NAME                    -> nome do serviço no trace
 *   OTEL_EXPORTER_OTLP_TRACES_ENDPOINT   -> http://tempo:4318/v1/traces
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Rotas "técnicas" que não queremos poluindo os traces
const ROTAS_IGNORADAS = ['/metrics', '/health', '/favicon.ico'];

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'pizzaria',
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Instrumentações muito "barulhentas" para uma aula: desligadas
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      // Não criar um span para cada middleware do Express (json, static...)
      '@opentelemetry/instrumentation-express': {
        ignoreLayersType: ['middleware' as never],
      },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) =>
          ROTAS_IGNORADAS.some((rota) => (req.url ?? '').startsWith(rota)) ||
          (req.url ?? '').startsWith('/admin') ||
          (req.url ?? '').startsWith('/painel') ||
          (req.url ?? '') === '/',
      },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
