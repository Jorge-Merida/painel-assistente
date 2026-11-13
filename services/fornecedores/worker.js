const PNCP = "https://pncp.gov.br/api/pncp/v1/orgaos/";
const COMPRAS = "https://dadosabertos.compras.gov.br/modulo-arp/2_consultarARPItem";
const MAX_PAGE = 100;

export function parseReference(value) {
  const match = String(value || "").match(/^([A-Za-z0-9]{14})-1-(\d{1,10})\/(\d{4})-(\d{1,10})$/);
  if (!match || Number(match[2]) < 1 || Number(match[4]) < 1) return null;
  return { cnpj: match[1].toUpperCase(), purchase: Number(match[2]), year: Number(match[3]), ata: Number(match[4]) };
}

function referenceKey(ref) {
  return ref && `${ref.cnpj}/${ref.year}/${ref.purchase}/${ref.ata}`;
}

export function suppliersForAta(items, reference) {
  const result = new Map();
  for (const item of items) {
    if (item.itemExcluido || item.dataHoraExclusao) continue;
    if (referenceKey(parseReference(item.numeroControlePncpAta)) !== referenceKey(reference)) continue;
    const name = String(item.nomeRazaoSocialFornecedor || "").trim();
    const id = String(item.niFornecedor || "").trim();
    if (!name || !id) continue;
    result.set(`${id.toUpperCase()}|${name.toUpperCase()}`, { name, id });
  }
  return [...result.values()];
}

async function sourceJson(url, context, dependencies) {
  const cache = dependencies.cache;
  const key = new Request(url);
  const cached = cache && await cache.match(key);
  if (cached) return cached.json();
  const fetchSource = dependencies.fetch;
  const response = await fetchSource(url, {
    headers: { Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  const data = await response.json();
  if (cache) {
    const saved = new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } });
    // Cache apenas de dados públicos; falhas de cache não impedem a consulta.
    context.waitUntil(cache.put(key, saved).catch(() => {}));
  }
  return data;
}

export async function handleRequest(request, env, context, dependencies = { fetch, cache: globalThis.caches?.default }) {
  const origin = request.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS || "https://jorge-merida.github.io").split(",").map((value) => value.trim());
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin", "X-Content-Type-Options": "nosniff" };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin)) return reply({ error: "Origem não permitida." }, 403);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  if (request.method === "OPTIONS") {
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Max-Age"] = "86400";
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "GET") return reply({ error: "Método não permitido." }, 405);
  const url = new URL(request.url);
  if (url.pathname === "/health") return reply({ status: "ok" });
  if (url.pathname !== "/fornecedores") return reply({ error: "Rota não encontrada." }, 404);
  const reference = parseReference(url.searchParams.get("ata"));
  const pageText = url.searchParams.get("pagina") || "1";
  const page = Number(pageText);
  if (!reference || !/^\d+$/.test(pageText) || page < 1 || page > MAX_PAGE || [...url.searchParams.keys()].some((key) => !["ata", "pagina"].includes(key))) {
    return reply({ error: "Informe uma ata PNCP válida e uma página de 1 a 100." }, 400);
  }
  try {
    const ataUrl = `${PNCP}${reference.cnpj}/compras/${reference.year}/${reference.purchase}/atas/${reference.ata}`;
    const ata = await sourceJson(ataUrl, context, dependencies);
    if (referenceKey(parseReference(ata.numeroControlePNCP)) !== referenceKey(reference)) throw new Error("Identificador divergente");
    const unit = String(ata.unidadeOrgao?.codigoUnidade || "");
    const start = String(ata.dataVigenciaInicio || "").slice(0, 10);
    if (!/^\d{1,10}$/.test(unit) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return reply({ status: "unavailable", suppliers: [], hasMore: false, source: "Compras.gov.br" });
    }
    const sourceUrl = new URL(COMPRAS);
    for (const [key, value] of Object.entries({ pagina: page, tamanhoPagina: 500, codigoUnidadeGerenciadora: unit, dataVigenciaInicialMin: start, dataVigenciaInicialMax: start })) sourceUrl.searchParams.set(key, String(value));
    const data = await sourceJson(sourceUrl.toString(), context, dependencies);
    if (!Array.isArray(data.resultado) || !Number.isInteger(data.totalPaginas) || data.totalPaginas < 0) throw new Error("Resposta inesperada");
    const hasMore = page < data.totalPaginas;
    return reply({
      status: "ok",
      suppliers: suppliersForAta(data.resultado, reference),
      hasMore,
      nextPage: hasMore && page < MAX_PAGE ? page + 1 : null,
      source: "Compras.gov.br",
      sourceUrl: sourceUrl.toString(),
    });
  } catch (error) {
    console.warn("supplier_lookup_failed", error instanceof Error ? error.message : "Erro de consulta");
    return reply({ error: "Não foi possível consultar as fontes oficiais agora. Tente novamente." }, 502);
  }
}

export default { fetch: handleRequest };
