/**
 * Gerador de carga — simula clientes da pizzaria.
 *
 * Variáveis de ambiente:
 *   ALVO      URL do serviço de pedidos (padrão: http://pedidos:3000)
 *   TAXA_RPS  pedidos por segundo (padrão: 3)
 *   DURACAO_S para depois de N segundos (padrão: 0 = infinito)
 *
 * Sem dependências: roda com `node gerador.js` em qualquer Node 18+.
 */
const ALVO = process.env.ALVO ?? 'http://pedidos:3000';
const TAXA = Number(process.env.TAXA_RPS ?? 3);
const DURACAO = Number(process.env.DURACAO_S ?? 0);

// Sabores com "popularidade" diferente — fica bonito no gráfico de negócio
const SABORES = [
  ['margherita', 30], ['calabresa', 25], ['portuguesa', 15],
  ['quatro_queijos', 12], ['frango_catupiry', 13], ['chocolate', 5],
];
const total = SABORES.reduce((s, [, p]) => s + p, 0);

function sortearSabor() {
  let r = Math.random() * total;
  for (const [sabor, peso] of SABORES) {
    if ((r -= peso) < 0) return sabor;
  }
  return 'margherita';
}

const stats = { enviados: 0, ok: 0, erro4xx: 0, erro5xx: 0, falhaRede: 0 };

async function umPedido() {
  // 3% dos clientes digitam errado o sabor -> HTTP 400
  const sabor = Math.random() < 0.03 ? 'pizza_de_abacaxi' : sortearSabor();
  const quantidade = Math.random() < 0.8 ? 1 : Math.ceil(Math.random() * 3);
  stats.enviados++;
  try {
    const r = await fetch(`${ALVO}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sabor, quantidade }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status < 400) stats.ok++;
    else if (r.status < 500) stats.erro4xx++;
    else stats.erro5xx++;
    // De vez em quando o cliente consulta o cardápio
    if (Math.random() < 0.3) await fetch(`${ALVO}/cardapio`).catch(() => {});
  } catch {
    stats.falhaRede++;
  }
}

console.log(`Gerador de carga: ${TAXA} pedidos/s em ${ALVO}`);
const inicio = Date.now();
const intervalo = setInterval(() => {
  // Chegadas "irregulares" (como clientes reais), em média TAXA por segundo
  for (let i = 0; i < TAXA; i++) setTimeout(umPedido, Math.random() * 1000);
  if (DURACAO && Date.now() - inicio > DURACAO * 1000) {
    clearInterval(intervalo);
    setTimeout(() => process.exit(0), 11000);
  }
}, 1000);

setInterval(() => {
  console.log(`enviados=${stats.enviados} ok=${stats.ok} 4xx=${stats.erro4xx} 5xx=${stats.erro5xx} falha_rede=${stats.falhaRede}`);
}, 10000);
