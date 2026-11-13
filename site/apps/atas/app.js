import {
  ataPageUrl,
  brazilToday,
  fetchAta,
  fetchItemResults,
  fetchPurchaseItems,
  fetchPurchaseAtas,
  fetchAtaDocuments,
  purchaseKey,
  normalizeText,
  formatDate,
  formatMoney,
  formatQuantity,
  isVigente,
  normalizeSearchAta,
  parseAtaReference,
  searchAtas,
} from "./pncp.js";

const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const ufInput = document.querySelector("#uf");
const adhesionInput = document.querySelector("#adesao");
const searchButton = document.querySelector("#search-button");
const results = document.querySelector("#results");
const status = document.querySelector("#status");
const notice = document.querySelector("#notice");
const empty = document.querySelector("#empty");
const loadMore = document.querySelector("#load-more");

const state = { query: "", uf: "", adhesion: "", page: 1, total: 0, hasMore: false, direct: false, entries: [], renderedCount: 0, seen: new Set(), busy: false, run: 0 };

function element(tag, className = "", content = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function showNotice(message = "") {
  notice.hidden = !message;
  notice.textContent = message;
}

function setBusy(value) {
  state.busy = value;
  searchButton.disabled = value;
  loadMore.disabled = value;
  searchButton.textContent = value ? "Pesquisando…" : "Pesquisar";
}

function matchesFilters(entry) {
  if (!isVigente(entry, brazilToday())) return false;
  if (state.uf && entry.uf !== state.uf) return false;
  if (state.adhesion === "sim" && entry.allowsAdhesion !== true) return false;
  if (state.adhesion === "nao" && entry.allowsAdhesion !== false) return false;
  return true;
}

async function mapLimited(items, limit, work) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await work(item);
    }
  }));
}

function makePurchaseItem(item) {
  const row = element("article", "purchase-item");
  row.append(element("h4", "", `Item ${item.numeroItem} · ${item.descricao || "Descrição não informada"}`));
  const meta = element("p", "purchase-item-meta");
  const details = [`Quantidade: ${formatQuantity(item.quantidade)} ${item.unidadeMedida || ""}`.trim()];
  if (item.situacaoCompraItemNome) details.push(item.situacaoCompraItemNome);
  if (item.catalogoCodigoItem) details.push(`${item.catalogo?.nome || "Catálogo"}: ${item.catalogoCodigoItem}`);
  for (const detail of details) meta.append(element("span", "", detail));
  row.append(meta);
  if (item.valorUnitarioEstimado !== null && item.valorUnitarioEstimado !== undefined && !(item.orcamentoSigiloso && Number(item.valorUnitarioEstimado) === 0)) {
    row.append(element("p", "purchase-estimate", `Valor unitário estimado: ${formatMoney(item.valorUnitarioEstimado)}`));
  }
  const prices = element("div", "purchase-prices", item.temResultado ? "Consultando resultado homologado…" : "Sem preço homologado publicado no PNCP.");
  prices.setAttribute("aria-live", "polite");
  row.append(prices);
  return { item, row, prices };
}

function showItemResults(prices, itemResults) {
  prices.replaceChildren();
  if (itemResults.length === 0) {
    prices.textContent = "Sem resultado homologado ativo publicado no PNCP.";
    return;
  }
  for (const result of itemResults) {
    const line = element("div", "purchase-price");
    line.append(element("strong", "", `Preço unitário homologado: ${formatMoney(result.valorUnitarioHomologado)}`));
    if (result.nomeRazaoSocialFornecedor) line.append(element("span", "", `Fornecedor: ${result.nomeRazaoSocialFornecedor}`));
    if (result.quantidadeHomologada !== null && result.quantidadeHomologada !== undefined) line.append(element("span", "", `Quantidade homologada: ${formatQuantity(result.quantidadeHomologada)}`));
    if (result.ordemClassificacaoSrp) line.append(element("span", "", `Classificação SRP: ${result.ordemClassificacaoSrp}º`));
    prices.append(line);
  }
}

function makeCard(entry) {
  const card = element("article", "result-card");
  const ref = entry.ref;
  const key = purchaseKey(ref);
  const active = () => card.isConnected;
  card.append(element("h3", "", "Pregão / contratação de origem"));
  card.append(element("p", "result-meta", `${entry.organization} · ${entry.city}/${entry.uf}`));
  card.append(element("p", "result-description", entry.object));
  const purchaseLink = element("a", "text-link", `Contratação PNCP: ${key}`);
  purchaseLink.href = `https://pncp.gov.br/app/editais/${key}`;
  purchaseLink.target = "_blank";
  purchaseLink.rel = "noopener noreferrer";
  card.append(purchaseLink);
  card.append(element("p", "items-warning", "A busca encontrou uma ata vigente desta contratação. Consulte abaixo todas as atas e localize os itens do pregão. O PNCP não informa diretamente em qual ata está cada item; confirme no documento."));

  const toggle = element("button", "button button-primary", "Consultar itens e todas as atas");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  const panel = element("section", "items-panel");
  panel.id = `purchase-${key.replaceAll("/", "-")}`;
  panel.hidden = true;
  toggle.setAttribute("aria-controls", panel.id);
  card.append(toggle, panel);

  panel.append(element("h4", "items-title", "Atas desta contratação"));
  panel.append(element("p", "items-warning", "A lista inclui atas encerradas e canceladas, identificadas abaixo. Confira a vigência e a possibilidade de adesão antes de usar um documento."));
  const ataStatus = element("p", "items-status");
  ataStatus.setAttribute("role", "status");
  const ataList = element("div", "purchase-list");
  const retryAtas = element("button", "button button-secondary", "Tentar consultar atas novamente");
  retryAtas.type = "button";
  retryAtas.hidden = true;
  panel.append(ataStatus, ataList, retryAtas);
  let atasLoaded = false;
  let atasBusy = false;
  function ataRow(ata) {
    const row = element("article", "purchase-item");
    row.append(element("h4", "", ata.title));
    const situation = ata.canceled ? "Cancelada" : isVigente(ata, brazilToday()) ? "Vigente" : "Fora da vigência";
    const adhesion = ata.allowsAdhesion === true ? "Permite adesão" : ata.allowsAdhesion === false ? "Não permite adesão" : "Adesão não informada";
    row.append(element("p", "purchase-item-meta", `${situation} · ${formatDate(ata.start)} a ${formatDate(ata.end)} · ${adhesion}`));
    const actions = element("div", "result-actions");
    const link = element("a", "button button-secondary", "Ver ata no PNCP");
    link.href = ataPageUrl(ata.ref);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const documents = element("div", "ata-documents");
    const download = element("button", "button button-secondary", "Ver documentos para download");
    download.type = "button";
    download.addEventListener("click", async () => {
      download.disabled = true;
      documents.textContent = "Consultando documentos…";
      try {
        const files = await fetchAtaDocuments(ata.ref);
        documents.replaceChildren();
        for (const file of files) {
          const fileLink = element("a", "text-link", `Abrir / baixar: ${file.title}`);
          fileLink.href = file.url;
          fileLink.target = "_blank";
          fileLink.rel = "noopener noreferrer";
          documents.append(fileLink);
        }
        if (!files.length) documents.textContent = "Nenhum documento publicado para esta ata.";
        download.hidden = true;
      } catch {
        documents.textContent = "Não foi possível consultar os documentos. Tente novamente ou abra a ata no PNCP.";
      } finally {
        download.disabled = false;
      }
    });
    actions.append(link, download);
    row.append(actions, documents, element("p", "result-footer", `ID PNCP: ${ata.id}`));
    return row;
  }
  async function loadAtas() {
    if (atasBusy || atasLoaded) return;
    atasBusy = true;
    retryAtas.hidden = true;
    ataStatus.textContent = "Consultando todas as atas…";
    try {
      const atas = await fetchPurchaseAtas(ref);
      if (!active()) return;
      ataList.replaceChildren(...atas.map(ataRow));
      ataStatus.textContent = `${atas.length} ata(s) publicada(s) para esta contratação.`;
      atasLoaded = true;
    } catch {
      ataStatus.textContent = "Não foi possível consultar todas as atas. Você ainda pode abrir a ata encontrada na busca.";
      ataList.replaceChildren(ataRow(entry));
      retryAtas.hidden = false;
    } finally {
      atasBusy = false;
    }
  }
  retryAtas.addEventListener("click", loadAtas);

  panel.append(element("h4", "items-title item-search-title", "Localizar itens neste pregão"));
  panel.append(element("p", "items-warning", "Valores estimados e homologados pertencem à contratação, e precisam ser conferidos na ata. A pesquisa percorre todos os itens, inclusive os ainda não exibidos."));
  const itemForm = element("form", "item-search");
  const field = element("div", "field");
  const label = element("label", "", "Descrição, número do item ou código de catálogo");
  const input = element("input");
  input.id = `filter-${key.replaceAll("/", "-")}`;
  input.type = "search";
  input.value = parseAtaReference(state.query) ? "" : state.query;
  label.htmlFor = input.id;
  field.append(label, input);
  const find = element("button", "button button-primary", "Buscar em todos os itens");
  find.type = "submit";
  itemForm.append(field, find);
  panel.append(itemForm);
  const itemStatus = element("p", "items-status");
  itemStatus.setAttribute("role", "status");
  const itemList = element("div", "purchase-list");
  const more = element("button", "button button-secondary items-more", "Exibir mais itens encontrados");
  more.type = "button";
  more.hidden = true;
  const stop = element("button", "button button-secondary items-more", "Interromper consulta");
  stop.type = "button";
  stop.hidden = true;
  panel.append(itemStatus, itemList, more, stop);
  const cached = [];
  let page = 1;
  let complete = false;
  let busy = false;
  let stopped = false;
  let matches = [];
  let shown = 0;
  let filter = "";
  async function showMore() {
    more.disabled = true;
    const rows = matches.slice(shown, shown + 20).map(makePurchaseItem);
    shown += rows.length;
    itemList.append(...rows.map(({ row }) => row));
    more.hidden = shown >= matches.length;
    await mapLimited(rows.filter(({ item }) => item.temResultado), 4, async ({ item, prices }) => {
      try {
        const values = await fetchItemResults(ref, item.numeroItem);
        if (prices.isConnected) showItemResults(prices, values);
      } catch {
        prices.textContent = "Não foi possível consultar o resultado deste item agora.";
      }
    });
    more.disabled = false;
  }
  function updateMatches() {
    const terms = normalizeText(filter).split(/\s+/).filter(Boolean);
    matches = cached.filter((item) => {
      const text = normalizeText(`${item.numeroItem} ${item.descricao || ""} ${item.catalogoCodigoItem || ""}`);
      return terms.every((term) => text.includes(term));
    });
  }
  async function searchItems() {
    if (busy) return;
    busy = true;
    stopped = false;
    stop.disabled = false;
    find.disabled = true;
    input.disabled = true;
    more.hidden = true;
    stop.hidden = complete;
    filter = input.value.trim();
    itemList.replaceChildren();
    shown = 0;
    let failed = false;
    try {
      while (!complete && !stopped && active()) {
        itemStatus.textContent = `Consultando página ${page} · ${cached.length} itens consultados…`;
        const data = await fetchPurchaseItems(ref, page);
        if (!active()) return;
        cached.push(...data.items);
        page += 1;
        complete = !data.hasMore;
      }
    } catch {
      failed = true;
    } finally {
      if (active()) {
        updateMatches();
        const prefix = complete ? "Consulta completa." : failed ? "A consulta falhou. Pesquise novamente para continuar." : "Consulta interrompida. Pesquise novamente para continuar.";
        itemStatus.textContent = `${prefix} ${matches.length} item(ns) encontrado(s) em ${cached.length} consultado(s).${complete ? "" : " O resultado é parcial."}`;
        await showMore();
      }
      busy = false;
      find.disabled = false;
      input.disabled = false;
      stop.hidden = true;
    }
  }
  itemForm.addEventListener("submit", (event) => { event.preventDefault(); searchItems(); });
  more.addEventListener("click", showMore);
  stop.addEventListener("click", () => { stopped = true; stop.disabled = true; itemStatus.textContent = "Interrompendo após a consulta em andamento…"; });
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    toggle.textContent = panel.hidden ? "Consultar itens e todas as atas" : "Ocultar itens e atas";
    if (!panel.hidden) loadAtas();
  });
  return card;
}

function render() {
  results.append(...state.entries.slice(state.renderedCount).map(makeCard));
  state.renderedCount = state.entries.length;
  empty.hidden = state.entries.length > 0;
  loadMore.hidden = state.direct || !state.hasMore;
  if (state.entries.length === 0) {
    status.textContent = state.hasMore ? "Nenhuma ata nos resultados carregados. Você pode carregar mais." : "Nenhuma ata vigente encontrada com estes filtros.";
  } else {
    status.textContent = `${state.entries.length} ${state.entries.length === 1 ? "contratação exibida" : "contratações exibidas"}${state.hasMore ? ". Há mais resultados no PNCP." : "."}`;
  }
}

async function loadNext(run) {
  if (state.busy || !state.hasMore) return;
  setBusy(true);
  status.textContent = "Consultando o PNCP…";
  showNotice();
  try {
    let fetched = 0;
    const countBefore = state.entries.length;
    while (state.hasMore && fetched < 3 && state.entries.length === countBefore) {
      const page = state.page;
      const data = await searchAtas({ query: state.query, uf: state.uf, page });
      if (run !== state.run) return;
      state.total = data.total;
      state.page += 1;
      state.hasMore = data.items.length === data.pageSize && page * data.pageSize < Math.min(data.total, 10000);
      for (const raw of data.items) {
        const entry = normalizeSearchAta(raw);
        if (entry && !state.seen.has(purchaseKey(entry.ref)) && matchesFilters(entry)) {
          state.seen.add(purchaseKey(entry.ref));
          state.entries.push(entry);
        }
      }
      fetched += 1;
    }
    render();
  } catch {
    showNotice("A busca do PNCP não respondeu agora. Tente novamente ou consulte diretamente o portal oficial pelo link abaixo.");
    status.textContent = state.entries.length ? `${state.entries.length} contratações já carregadas.` : "Busca temporariamente indisponível.";
    loadMore.hidden = !state.hasMore;
  } finally {
    setBusy(false);
  }
}

async function search() {
  const query = queryInput.value.trim();
  if (query.length < 2) return;
  state.run += 1;
  const run = state.run;
  state.query = query;
  state.uf = ufInput.value;
  state.adhesion = adhesionInput.value;
  state.page = 1;
  state.total = 0;
  state.hasMore = true;
  state.direct = false;
  state.entries = [];
  state.renderedCount = 0;
  state.seen = new Set();
  results.replaceChildren();
  empty.hidden = true;
  showNotice();

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set("q", query);
  if (state.uf) currentUrl.searchParams.set("uf", state.uf); else currentUrl.searchParams.delete("uf");
  if (state.adhesion) currentUrl.searchParams.set("adesao", state.adhesion); else currentUrl.searchParams.delete("adesao");
  window.history.replaceState(null, "", currentUrl);

  const reference = parseAtaReference(query);
  if (!reference) return loadNext(run);
  state.direct = true;
  state.hasMore = false;
  setBusy(true);
  status.textContent = "Consultando a ata no PNCP…";
  try {
    const entry = await fetchAta(reference);
    if (run !== state.run) return;
    if (matchesFilters(entry)) state.entries.push(entry);
    render();
  } catch {
    showNotice("Não foi possível consultar esta ata pelo ID ou link informado. Confira o endereço e tente novamente.");
    status.textContent = "Consulta temporariamente indisponível.";
  } finally {
    setBusy(false);
  }
}

form.addEventListener("submit", (event) => { event.preventDefault(); search(); });
loadMore.addEventListener("click", () => loadNext(state.run));

const initial = new URLSearchParams(window.location.search);
if (initial.has("q")) {
  queryInput.value = initial.get("q") || "";
  ufInput.value = initial.get("uf") || "";
  adhesionInput.value = initial.get("adesao") || "";
  if (queryInput.value.trim().length >= 2) search();
}
