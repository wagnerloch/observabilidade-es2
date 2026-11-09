/**
 * Serviço PEDIDOS (porta 3000) — porta de entrada da Pizzaria.
 *
 * Fluxo de um pedido (cada etapa aparece como um span no Tempo):
 *
 *   cliente ──POST /pedidos──> pedidos
 *                                ├─ consultar_estoque   (span manual: "banco de dados")
 *                                ├─ POST pagamentos/pagamentos
 *                                └─ POST cozinha/preparar
 */
import path from 'node:path';
import express from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { criarServico, iniciar, esperar, aleatorio, modoCaos } from './comum';
import { log } from './logger';
import { pedidosTotal, faturamentoTotal, pedidosEmAndamento } from './metrics';

const NOME = 'pedidos';
const PAGAMENTOS_URL = process.env.PAGAMENTOS_URL ?? 'http://pagamentos:3000';
const COZINHA_URL = process.env.COZINHA_URL ?? 'http://cozinha:3000';
const GRAFANA_URL = process.env.GRAFANA_URL ?? 'http://localhost:3001';

const tracer = trace.getTracer('pizzaria-pedidos');

const CARDAPIO: Record<string, number> = {
  margherita: 42,
  calabresa: 45,
  portuguesa: 49,
  quatro_queijos: 52,
  frango_catupiry: 50,
  chocolate: 47,
};

interface Pedido {
  id: string;
  sabor: string;
  quantidade: number;
  valor: number;
  status: string;
  previsao_min?: number;
  criado_em: string;
}
const pedidos = new Map<string, Pedido>();
let sequencia = 1000;

class ErroNegocio extends Error {
  constructor(public status: number, message: string, public resultado: string) {
    super(message);
  }
}

const app = criarServico(NOME);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/cardapio', (_req, res) => {
  res.json(Object.entries(CARDAPIO).map(([sabor, preco]) => ({ sabor, preco })));
});

app.get('/pedidos/:id', (req, res) => {
  const pedido = pedidos.get(req.params.id);
  if (!pedido) {
    res.status(404).json({ erro: 'pedido não encontrado' });
    return;
  }
  res.json(pedido);
});

/** Simula uma consulta ao banco de dados, criando um span MANUAL. */
async function consultarEstoque(sabor: string, quantidade: number) {
  return tracer.startActiveSpan('consultar_estoque', async (span) => {
    span.setAttributes({
      'db.system': 'postgresql',
      'db.operation': 'SELECT',
      'db.statement': 'SELECT quantidade FROM estoque WHERE sabor = $1',
      'pizzaria.sabor': sabor,
    });
    try {
      let ms = aleatorio(5, 30);
      if (modoCaos() === 'lento') ms += aleatorio(800, 1500); // índice faltando? :)
      await esperar(ms);

      if (modoCaos() === 'erros' && Math.random() < 0.35) {
        throw new Error('timeout ao obter conexão do pool do banco de dados');
      }
      // 2% de chance de faltar ingrediente
      if (Math.random() < 0.02) {
        throw new ErroNegocio(409, `sem estoque para ${quantidade}x ${sabor}`, 'sem_estoque');
      }
      span.setAttribute('pizzaria.estoque_ok', true);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

async function chamar(url: string, corpo: unknown) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(5000),
  });
  const json = (await resp.json().catch(() => ({}))) as Record<string, any>;
  return { status: resp.status, json };
}

app.post('/pedidos', async (req, res) => {
  const sabor = String(req.body?.sabor ?? '').toLowerCase();
  const quantidade = Number(req.body?.quantidade ?? 1);
  const span = trace.getActiveSpan();

  if (!(sabor in CARDAPIO) || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10) {
    pedidosTotal.inc({ sabor: 'invalido', resultado: 'invalido' });
    log.warn('pedido inválido recebido', { sabor, quantidade });
    res.status(400).json({ erro: 'sabor ou quantidade inválidos', cardapio: Object.keys(CARDAPIO) });
    return;
  }

  const id = `P${++sequencia}`;
  const valor = CARDAPIO[sabor] * quantidade;
  span?.setAttributes({ 'pizzaria.pedido_id': id, 'pizzaria.sabor': sabor, 'pizzaria.valor': valor });

  pedidosEmAndamento.inc();
  log.info('pedido recebido', { pedido_id: id, sabor, quantidade, valor });

  try {
    await consultarEstoque(sabor, quantidade);

    const pagamento = await chamar(`${PAGAMENTOS_URL}/pagamentos`, { pedido_id: id, valor });
    if (pagamento.status === 402) {
      throw new ErroNegocio(402, 'pagamento recusado pela operadora', 'pagamento_recusado');
    }
    if (pagamento.status >= 500) {
      throw new Error(`serviço de pagamentos falhou (HTTP ${pagamento.status}): ${pagamento.json.erro ?? ''}`);
    }

    const preparo = await chamar(`${COZINHA_URL}/preparar`, { pedido_id: id, sabor, quantidade });
    if (preparo.status >= 500) {
      throw new Error(`cozinha falhou (HTTP ${preparo.status}): ${preparo.json.erro ?? ''}`);
    }

    const pedido: Pedido = {
      id, sabor, quantidade, valor,
      status: 'confirmado',
      previsao_min: preparo.json.previsao_min,
      criado_em: new Date().toISOString(),
    };
    pedidos.set(id, pedido);
    pedidosTotal.inc({ sabor, resultado: 'confirmado' });
    faturamentoTotal.inc(valor);
    log.info('pedido confirmado', { pedido_id: id, sabor, valor, transacao: pagamento.json.transacao_id });
    res.status(201).json(pedido);
  } catch (err) {
    if (err instanceof ErroNegocio) {
      pedidosTotal.inc({ sabor, resultado: err.resultado });
      log.warn('pedido não concluído', { pedido_id: id, sabor, motivo: err.message });
      res.status(err.status).json({ erro: err.message, pedido_id: id });
    } else {
      pedidosTotal.inc({ sabor, resultado: 'falha' });
      log.error('falha ao processar pedido', { pedido_id: id, sabor, erro: (err as Error).message });
      res.status(500).json({ erro: 'falha interna ao processar pedido', pedido_id: id });
    }
  } finally {
    pedidosEmAndamento.dec();
  }
});

// ---- Painel de controle (usado pela página em public/index.html) ----
const SERVICOS: Record<string, string> = {
  pedidos: 'http://127.0.0.1:' + (process.env.PORT ?? 3000),
  pagamentos: PAGAMENTOS_URL,
  cozinha: COZINHA_URL,
};

app.get('/painel/config', (_req, res) => res.json({ grafana: GRAFANA_URL }));

app.get('/painel/caos', async (_req, res) => {
  const estados = await Promise.all(
    Object.entries(SERVICOS).map(async ([nome, url]) => {
      try {
        const r = await fetch(`${url}/admin/caos`, { signal: AbortSignal.timeout(2000) });
        return { servico: nome, modo: ((await r.json()) as any).modo };
      } catch {
        return { servico: nome, modo: 'fora do ar' };
      }
    }),
  );
  res.json(estados);
});

app.post('/painel/caos/:servico', async (req, res) => {
  const url = SERVICOS[req.params.servico];
  if (!url) {
    res.status(404).json({ erro: 'serviço desconhecido' });
    return;
  }
  const r = await fetch(`${url}/admin/caos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modo: req.body?.modo }),
  });
  res.status(r.status).json(await r.json());
});

iniciar(app, NOME);
