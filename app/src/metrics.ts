/**
 * MÉTRICAS — Prometheus
 *
 * O Prometheus funciona no modelo PULL: a cada 5s ele visita GET /metrics
 * de cada serviço e guarda os números como séries temporais.
 *
 * Tipos de métrica usados aqui:
 *   Counter   -> só cresce (total de requisições, total de pedidos)
 *   Gauge     -> sobe e desce (pedidos em andamento)
 *   Histogram -> distribuição de valores em "baldes" (latência) -> permite p95/p99
 */
import client from 'prom-client';
import { trace } from '@opentelemetry/api';
import type { Request, Response, NextFunction } from 'express';

const SERVICO = process.env.OTEL_SERVICE_NAME ?? 'pizzaria';

export const registry = new client.Registry<client.OpenMetricsContentType>();
// Formato OpenMetrics: necessário para enviar "exemplars" (ligação métrica -> trace)
registry.setContentType(client.Registry.OPENMETRICS_CONTENT_TYPE);
registry.setDefaultLabels({ service: SERVICO });

// Métricas do runtime do Node.js: CPU, memória, event loop, GC...
client.collectDefaultMetrics({ register: registry });

const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP recebidas',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  enableExemplars: true,
  registers: [registry],
});

// ---- Métricas de NEGÓCIO (o que importa para o dono da pizzaria) ----
export const pedidosTotal = new client.Counter({
  name: 'pizzaria_pedidos_total',
  help: 'Pedidos recebidos, por sabor e resultado',
  labelNames: ['sabor', 'resultado'] as const,
  registers: [registry],
});

export const faturamentoTotal = new client.Counter({
  name: 'pizzaria_faturamento_reais_total',
  help: 'Faturamento acumulado (R$) dos pedidos confirmados',
  registers: [registry],
});

export const pedidosEmAndamento = new client.Gauge({
  name: 'pizzaria_pedidos_em_andamento',
  help: 'Pedidos sendo processados neste instante',
  registers: [registry],
});

export const pizzasNoForno = new client.Gauge({
  name: 'pizzaria_pizzas_no_forno',
  help: 'Pizzas sendo preparadas na cozinha neste instante',
  registers: [registry],
});

/** Middleware: mede TODAS as requisições (contagem + duração). */
export function middlewareMetricas(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/metrics') return next();
  const inicio = process.hrtime.bigint();
  // trace_id da requisição atual: vira um "exemplar" no histograma
  const traceId = trace.getActiveSpan()?.spanContext().traceId;

  res.on('finish', () => {
    // Usamos o "molde" da rota (/pedidos/:id) e não a URL real, para não
    // explodir a cardinalidade (uma série por ID seria um desastre).
    const route = req.route?.path ?? 'outras';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;

    httpRequests.inc(labels);
    httpDuration.observe({
      labels,
      value: segundos,
      // (cast: a tipagem do prom-client não prevê labels extras no exemplar)
      ...(traceId ? { exemplarLabels: { trace_id: traceId } as any } : {}),
    });
  });
  next();
}

export async function rotaMetrics(_req: Request, res: Response) {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}
