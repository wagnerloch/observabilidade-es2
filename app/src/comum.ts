/**
 * Código compartilhado pelos três serviços: criação do Express, rotas
 * técnicas (/metrics, /health) e o "Modo Caos" para simular incidentes.
 */
import express from 'express';
import { log } from './logger';
import { middlewareMetricas, rotaMetrics } from './metrics';

export type ModoCaos = 'normal' | 'lento' | 'erros';
const MODOS: ModoCaos[] = ['normal', 'lento', 'erros'];

let modoAtual: ModoCaos = 'normal';
export const modoCaos = () => modoAtual;

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const aleatorio = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export function criarServico(nome: string) {
  const app = express();
  app.use(express.json());
  app.use(middlewareMetricas);

  app.get('/metrics', rotaMetrics);
  app.get('/health', (_req, res) => res.json({ status: 'ok', servico: nome }));

  // ---- Modo Caos: liga/desliga problemas para os alunos investigarem ----
  app.get('/admin/caos', (_req, res) => res.json({ servico: nome, modo: modoAtual }));
  app.post('/admin/caos', (req, res) => {
    const modo = req.body?.modo as ModoCaos;
    if (!MODOS.includes(modo)) {
      res.status(400).json({ erro: `modo inválido. Use: ${MODOS.join(', ')}` });
      return;
    }
    modoAtual = modo;
    log.warn('modo caos alterado', { modo });
    res.json({ servico: nome, modo: modoAtual });
  });

  return app;
}

export function iniciar(app: express.Express, nome: string, porta = Number(process.env.PORT ?? 3000)) {
  app.listen(porta, '0.0.0.0', () => {
    log.info(`serviço ${nome} iniciado`, { porta });
  });
}
