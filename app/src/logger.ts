/**
 * LOGS — Grafana Loki
 *
 * Um logger propositalmente simples (sem bibliotecas) para mostrar o que
 * acontece "por baixo dos panos":
 *   1. Cada log é um JSON estruturado (fácil de filtrar no Loki com `| json`).
 *   2. Cada log carrega o trace_id/span_id do trace ativo -> é isso que permite
 *      pular de um log para o trace no Grafana (correlação!).
 *   3. Os logs são agrupados em lotes e enviados para a API de push do Loki
 *      (POST /loki/api/v1/push) a cada 1 segundo.
 *
 * Em produção, normalmente quem envia os logs é um agente (Grafana Alloy,
 * Promtail, Fluent Bit, OTel Collector) lendo a saída padrão dos containers.
 */
import { context, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';

type Nivel = 'debug' | 'info' | 'warn' | 'error';
type Campos = Record<string, unknown>;

const LOKI_URL = process.env.LOKI_URL ?? 'http://loki:3100/loki/api/v1/push';
const SERVICO = process.env.OTEL_SERVICE_NAME ?? 'pizzaria';

// Labels do Loki: POUCAS e de baixa cardinalidade (serviço, nível).
// Nunca coloque IDs de pedido/usuário como label — eles vão no corpo do log.
const filas = new Map<Nivel, [string, string][]>();

function registrar(nivel: Nivel, msg: string, campos: Campos = {}) {
  const span = trace.getActiveSpan();
  const ctx = span?.spanContext();

  const linha = {
    ts: new Date().toISOString(),
    level: nivel,
    service: SERVICO,
    msg,
    ...campos,
    ...(ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {}),
  };

  const json = JSON.stringify(linha);
  // Também escreve no stdout: `docker compose logs -f pedidos`
  (nivel === 'error' ? console.error : console.log)(json);

  // Timestamp em nanossegundos, como o Loki espera
  const ns = (BigInt(Date.now()) * 1_000_000n).toString();
  if (!filas.has(nivel)) filas.set(nivel, []);
  filas.get(nivel)!.push([ns, json]);
}

async function enviarParaLoki() {
  if (filas.size === 0) return;
  const streams = [...filas.entries()].map(([level, values]) => ({
    stream: { app: 'pizzaria', service_name: SERVICO, level },
    values,
  }));
  filas.clear();

  // suppressTracing: o envio de logs NÃO deve gerar spans (senão viraria um loop)
  await context.with(suppressTracing(context.active()), async () => {
    try {
      await fetch(LOKI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streams }),
      });
    } catch {
      // Loki fora do ar? A aplicação continua funcionando normalmente.
    }
  });
}

setInterval(enviarParaLoki, 1000).unref();

export const log = {
  debug: (msg: string, campos?: Campos) => registrar('debug', msg, campos),
  info: (msg: string, campos?: Campos) => registrar('info', msg, campos),
  warn: (msg: string, campos?: Campos) => registrar('warn', msg, campos),
  error: (msg: string, campos?: Campos) => registrar('error', msg, campos),
};
