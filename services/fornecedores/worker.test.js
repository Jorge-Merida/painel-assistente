import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, parseReference } from './worker.js';
const ATA = '25053133000157-1-000211/2024-000001';
const request = (query = `ata=${ATA}`, origin = 'https://jorge-merida.github.io') => new Request(`https://example.workers.dev/fornecedores?${query}`, { headers: { Origin: origin } });
const env = { ALLOWED_ORIGINS: 'https://jorge-merida.github.io,http://localhost:8000' };
const ctx = { waitUntil() {} };
const ata = { numeroControlePNCP: ATA, unidadeOrgao: { codigoUnidade: '925402' }, dataVigenciaInicio: '2025-01-01' };
const item = { numeroControlePncpAta: ATA, nomeRazaoSocialFornecedor: 'E SOARES CARDOSO LTDA', niFornecedor: '47751972000181' };
function source(rows = [item], totalPaginas = 1, metadata = ata) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    calls.push(new URL(url));
    assert.equal(options.headers.Origin, undefined);
    assert.equal(options.redirect, 'manual');
    return Response.json(String(url).includes('pncp.gov.br') ? metadata : { resultado: rows, totalPaginas });
  } };
}
test('vínculo exato da ata, deduplicação, exclusões e múltiplos fornecedores', async () => {
  const second = { ...item, niFornecedor: '12345678000199', nomeRazaoSocialFornecedor: 'OUTRO FORNECEDOR' };
  const sources = source([item, item, second, { ...item, numeroControlePncpAta: ATA.replace('000001', '000002'), nomeRazaoSocialFornecedor: 'ATA ERRADA' }, { ...item, itemExcluido: true, nomeRazaoSocialFornecedor: 'EXCLUÍDO' }]);
  const response = await handleRequest(request('ata=25053133000157-1-211/2024-1'), env, ctx, sources);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://jorge-merida.github.io');
  const data = await response.json();
  assert.deepEqual(data.suppliers, [{ name: item.nomeRazaoSocialFornecedor, id: item.niFornecedor }, { name: second.nomeRazaoSocialFornecedor, id: second.niFornecedor }]);
  assert.equal(data.hasMore, false);
  assert.equal(sources.calls[1].searchParams.get('codigoUnidadeGerenciadora'), '925402');
  assert.equal(sources.calls[1].searchParams.get('dataVigenciaInicialMin'), '2025-01-01');
});
test('sem correspondência é ausência na fonte, não fornecedor de outro item', async () => {
  const response = await handleRequest(request(), env, ctx, source([{ ...item, numeroControlePncpAta: ATA.replace('000001', '000002') }]));
  assert.deepEqual((await response.json()).suppliers, []);
});
test('paginação mantém resultado parcial e limite explícito', async () => {
  let response = await handleRequest(request(), env, ctx, source([], 2));
  assert.equal((await response.json()).nextPage, 2);
  response = await handleRequest(request(`ata=${ATA}&pagina=100`), env, ctx, source([], 101));
  const data = await response.json();
  assert.equal(data.hasMore, true);
  assert.equal(data.nextPage, null);
});
test('validação e CORS rejeitam solicitações sem consultar fontes', async () => {
  const sources = source();
  for (const query of ['ata=https://evil.test', `ata=${ATA}&pagina=0`, `ata=${ATA}&url=https://evil.test`, `ata=${ATA}&pagina=101`]) {
    assert.equal((await handleRequest(request(query), env, ctx, sources)).status, 400);
  }
  assert.equal((await handleRequest(request(`ata=${ATA}`, 'https://evil.test'), env, ctx, sources)).status, 403);
  assert.equal(sources.calls.length, 0);
});
test('falha de fonte e identificador divergente não viram ausência de fornecedor', async () => {
  const broken = { fetch: async () => { throw new Error('offline'); } };
  assert.equal((await handleRequest(request(), env, ctx, broken)).status, 502);
  assert.equal((await handleRequest(request(), env, ctx, source([], 0, { ...ata, numeroControlePNCP: ATA.replace('000001', '000002') }))).status, 502);
  const unavailable = await handleRequest(request(), env, ctx, source([], 0, { ...ata, unidadeOrgao: null }));
  assert.equal((await unavailable.json()).status, 'unavailable');
  assert.equal(parseReference('invalid'), null);
});
test('preflight e método de escrita não acessam fontes', async () => {
  const sources = source();
  const preflight = new Request('https://worker.test/fornecedores', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8000' } });
  assert.equal((await handleRequest(preflight, env, ctx, sources)).status, 204);
  assert.equal((await handleRequest(new Request('https://worker.test/fornecedores', { method: 'POST' }), env, ctx, sources)).status, 405);
  assert.equal(sources.calls.length, 0);
});
test('cache de dados públicos evita repetir consultas; falhas não ficam em cache', async () => {
  const memory = new Map();
  const pending = [];
  const cache = {
    match: async (key) => memory.get(key.url)?.clone(),
    put: async (key, value) => { memory.set(key.url, value.clone()); },
  };
  const context = { waitUntil(promise) { pending.push(promise); } };
  const sources = { ...source(), cache };
  const first = await handleRequest(request(), env, context, sources);
  assert.equal(first.status, 200);
  await Promise.all(pending);
  const second = await handleRequest(request(), env, context, sources);
  assert.equal(second.status, 200);
  assert.equal(sources.calls.length, 2);
  assert.equal(memory.size, 2);
  memory.clear();
  sources.fetch = async () => new Response('offline', { status: 503 });
  assert.equal((await handleRequest(request(), env, context, sources)).status, 502);
  assert.equal(memory.size, 0);
});
