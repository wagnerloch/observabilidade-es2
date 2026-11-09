/**
 * Serviço PAGAMENTOS — simula a integração com uma operadora de cartão.
 *   normal: 80–300 ms, ~4% dos cartões recusados (HTTP 402 — regra de negócio, não é bug)
 *   lento : +1,5 a 3 s (operadora degradada)
 *   erros : ~40% de HTTP 503 (operadora fora do ar)
 */
import { trace } from '@opentelemetry/api';
import { criarServico, iniciar, esperar, aleatorio, modoCaos } from './comum';
import { log } from './logger';

const NOME = 'pagamentos';
const app = criarServico(NOME);

app.post('/pagamentos', async (req, res) => {
  const { pedido_id, valor } = req.body ?? {};
  const span = trace.getActiveSpan();
  span?.setAttributes({ 'pizzaria.pedido_id': pedido_id, 'pagamento.valor': valor });

  let ms = aleatorio(80, 300);
  if (modoCaos() === 'lento') ms += aleatorio(1500, 3000);
  await esperar(ms);

  if (modoCaos() === 'erros' && Math.random() < 0.4) {
    log.error('operadora de cartão indisponível', { pedido_id, valor, operadora: 'PagaFácil', latencia_ms: ms });
    res.status(503).json({ erro: 'operadora de cartão indisponível' });
    return;
  }

  if (Math.random() < 0.04) {
    log.warn('pagamento recusado', { pedido_id, valor, motivo: 'saldo insuficiente' });
    res.status(402).json({ erro: 'pagamento recusado' });
    return;
  }

  const transacao_id = `TX${Date.now().toString(36).toUpperCase()}`;
  span?.setAttribute('pagamento.transacao_id', transacao_id);
  log.info('pagamento aprovado', { pedido_id, valor, transacao_id, latencia_ms: ms });
  res.json({ aprovado: true, transacao_id });
});

iniciar(app, NOME);
