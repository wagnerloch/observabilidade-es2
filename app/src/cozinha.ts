/**
 * Serviço COZINHA — recebe o pedido pago e coloca as pizzas no forno.
 *   normal: 30–150 ms
 *   lento : +1 a 2 s (forno lotado)
 *   erros : ~25% de HTTP 500 (forno com defeito)
 */
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { criarServico, iniciar, esperar, aleatorio, modoCaos } from './comum';
import { log } from './logger';
import { pizzasNoForno } from './metrics';

const NOME = 'cozinha';
const tracer = trace.getTracer('pizzaria-cozinha');
const app = criarServico(NOME);

app.post('/preparar', async (req, res) => {
  const { pedido_id, sabor, quantidade = 1 } = req.body ?? {};

  await tracer.startActiveSpan('montar_pizza', async (span) => {
    span.setAttributes({ 'pizzaria.pedido_id': pedido_id, 'pizzaria.sabor': sabor, 'pizzaria.quantidade': quantidade });
    pizzasNoForno.inc(quantidade);
    try {
      let ms = aleatorio(30, 150);
      if (modoCaos() === 'lento') ms += aleatorio(1000, 2000);
      await esperar(ms);

      if (modoCaos() === 'erros' && Math.random() < 0.25) {
        const erro = new Error('forno 2 com temperatura fora do limite');
        span.recordException(erro);
        span.setStatus({ code: SpanStatusCode.ERROR, message: erro.message });
        log.error('falha no preparo', { pedido_id, sabor, erro: erro.message });
        res.status(500).json({ erro: erro.message });
        return;
      }

      const previsao_min = 15 + quantidade * 5 + aleatorio(0, 10);
      log.info('pizza no forno', { pedido_id, sabor, quantidade, previsao_min });
      res.json({ pedido_id, previsao_min });
    } finally {
      pizzasNoForno.dec(quantidade);
      span.end();
    }
  });
});

iniciar(app, NOME);
