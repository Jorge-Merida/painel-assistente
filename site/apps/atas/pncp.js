const PNCP = "https://pncp.gov.br";
const SEARCH_PAGE_SIZE = 20;

export function parseAtaReference(value) {
  const input = String(value ?? "").trim();
  let match = input.match(/(?:^|\/)atas\/([A-Za-z0-9]{14})\/(\d{4})\/(\d+)\/(\d+)(?:[/?#]|$)/);
  if (match) {
    return { cnpj: match[1], anoCompra: Number(match[2]), sequencialCompra: Number(match[3]), sequencialAta: Number(match[4]) };
  }
  match = input.match(/^([A-Za-z0-9]{14})-1-(\d+)\/(\d{4})-(\d+)$/);
  if (match) {
    return { cnpj: match[1], anoCompra: Number(match[3]), sequencialCompra: Number(match[2]), sequencialAta: Number(match[4]) };
  }
  return null;
}

export function ataPageUrl(ref) {
  return `${PNCP}/app/atas/${ref.cnpj}/${ref.anoCompra}/${ref.sequencialCompra}/${ref.sequencialAta}`;
}

export function ataApiBase(ref) {
  return `${PNCP}/api/pncp/v1/orgaos/${ref.cnpj}/compras/${ref.anoCompra}/${ref.sequencialCompra}/atas/${ref.sequencialAta}`;
}

export function buildSearchUrl({ query, uf = "", page = 1 }) {
  const url = new URL(`${PNCP}/api/search/`);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("tipos_documento", "ata");
  url.searchParams.set("status", "vigente");
  url.searchParams.set("ordenacao", "-data");
  url.searchParams.set("pagina", String(page));
  url.searchParams.set("tam_pagina", String(SEARCH_PAGE_SIZE));
  if (uf) url.searchParams.set("ufs", uf);
  return url.toString();
}

export function normalizeSearchAta(item) {
  const ref = parseAtaReference(item.numero_controle_pncp) || parseAtaReference(item.item_url);
  if (!ref) return null;
  return {
    id: item.numero_controle_pncp || `${ref.cnpj}-${ref.anoCompra}-${ref.sequencialCompra}-${ref.sequencialAta}`,
    title: item.title || `Ata de registro de preços`,
    object: item.description || "Objeto não informado pelo PNCP.",
    organization: item.orgao_nome || "Órgão não informado",
    city: item.municipio_nome || "Município não informado",
    uf: item.uf || "",
    start: item.data_inicio_vigencia || "",
    end: item.data_fim_vigencia || "",
    canceled: item.cancelado === true,
    allowsAdhesion: item.permite_adesao,
    ref,
  };
}

export function normalizeDirectAta(item, ref) {
  return {
    id: item.numeroControlePNCP || `${ref.cnpj}-${ref.anoCompra}-${ref.sequencialCompra}-${ref.sequencialAta}`,
    title: `Ata nº ${item.numeroAtaRegistroPreco || ref.sequencialAta}/${item.anoAta || ref.anoCompra}`,
    object: item.objetoCompra || "Objeto não informado pelo PNCP.",
    organization: item.orgaoEntidade?.razaoSocial || "Órgão não informado",
    city: item.unidadeOrgao?.municipioNome || "Município não informado",
    uf: item.unidadeOrgao?.ufSigla || "",
    start: item.dataVigenciaInicio || "",
    end: item.dataVigenciaFim || "",
    canceled: item.cancelado === true,
    allowsAdhesion: item.possibilidadeAdesao,
    ref,
  };
}

export function isVigente(ata, today) {
  const start = String(ata.start || "").slice(0, 10);
  const end = String(ata.end || "").slice(0, 10);
  return !ata.canceled && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= today && today <= end;
}

export function brazilToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDate(value) {
  const iso = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "não informada";
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`O PNCP respondeu ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

export async function searchAtas(options) {
  const data = await fetchJson(buildSearchUrl(options));
  if (!Array.isArray(data.items)) throw new Error("O PNCP devolveu uma resposta inesperada.");
  return { items: data.items, total: Number(data.total) || 0, pageSize: SEARCH_PAGE_SIZE };
}

export async function fetchAta(ref) {
  return normalizeDirectAta(await fetchJson(ataApiBase(ref)), ref);
}

export async function findAtaDocumentUrl(ref) {
  const documents = await fetchJson(`${ataApiBase(ref)}/arquivos`);
  if (!Array.isArray(documents) || documents.length === 0) throw new Error("O PNCP não informou um arquivo para esta ata.");
  const document = documents.find((entry) => entry.tipoDocumentoId === 11) || documents[0];
  if (!Number.isInteger(document.sequencialDocumento)) throw new Error("O PNCP não informou o número do documento.");
  return `${ataApiBase(ref)}/arquivos/${document.sequencialDocumento}`;
}
