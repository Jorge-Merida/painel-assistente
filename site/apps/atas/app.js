import {
  ataPageUrl,
  brazilToday,
  fetchAta,
  fetchItemResults,
  fetchPurchaseItems,
  findAtaDocumentUrl,
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
  const top = element("div", "result-top");
  top.append(element("h3", "", entry.title));
  top.append(element("span", "badge", "Vigente"));
  card.append(top);

  const meta = element("p", "result-meta");
  const location = entry.uf ? `${entry.city}/${entry.uf}` : entry.city;
  for (const text of [entry.organization, location, `Até ${formatDate(entry.end)}`]) meta.append(element("span", "", text));
  card.append(meta);
  card.append(element("p", "result-description", entry.object));

  const actions = element("div", "result-actions");
  const viewItems = element("button", "button button-primary", "Ver itens e preços");
  viewItems.type = "button";
  viewItems.setAttribute("aria-expanded", "false");
  const panel = element("section", "items-panel");
  panel.id = `items-${entry.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  panel.hidden = true;
  viewItems.setAttribute("aria-controls", panel.id);
  panel.append(element("h4", "items-title", "Itens e preços da contratação de origem"));
  panel.append(element("p", "items-warning", "Uma contratação pode gerar várias atas. Estes são os itens e resultados publicados para a contratação; confira no documento quais pertencem a esta ata e se houve alterações de preço."));
  const itemStatus = element("p", "items-status", "Os dados serão consultados no PNCP ao abrir esta seção.");
  itemStatus.setAttribute("role", "status");
  panel.append(itemStatus);
  const itemList = element("div", "purchase-list");
  panel.append(itemList);
  const moreItems = element("button", "button button-secondary items-more", "Carregar mais itens");
  moreItems.type = "button";
  moreItems.hidden = true;
  panel.append(moreItems);
  let itemPage = 1;
  let itemBusy = false;
  let itemLoaded = false;
  let itemHasMore = true;

  async function loadItemPage() {
    if (itemBusy || !itemHasMore) return;
    itemBusy = true;
    moreItems.disabled = true;
    itemStatus.textContent = "Consultando itens no PNCP…";
    try {
      const data = await fetchPurchaseItems(entry.ref, itemPage);
      const rows = data.items.map(makePurchaseItem);
      itemList.append(...rows.map(({ row }) => row));
      itemPage += 1;
      itemHasMore = data.hasMore;
      itemLoaded = true;
      itemStatus.textContent = data.items.length === 0 && itemPage === 2
        ? "O PNCP não publicou itens estruturados para esta contratação."
        : `${itemList.childElementCount} ${itemList.childElementCount === 1 ? "item carregado" : "itens carregados"} da contratação de origem.`;
      moreItems.hidden = !itemHasMore;
      moreItems.textContent = "Carregar mais itens";
      await mapLimited(rows.filter(({ item }) => item.temResultado), 4, async ({ item, prices }) => {
        try {
          showItemResults(prices, await fetchItemResults(entry.ref, item.numeroItem));
        } catch {
          prices.textContent = "Não foi possível consultar o resultado deste item agora.";
        }
      });
    } catch {
      itemStatus.textContent = "Não foi possível consultar os itens agora. Tente novamente.";
      moreItems.textContent = "Tentar novamente";
      moreItems.hidden = false;
    } finally {
      itemBusy = false;
      moreItems.disabled = false;
    }
  }

  viewItems.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    viewItems.setAttribute("aria-expanded", String(!panel.hidden));
    viewItems.textContent = panel.hidden ? "Ver itens e preços" : "Ocultar itens e preços";
    if (!panel.hidden && !itemLoaded) loadItemPage();
  });
  moreItems.addEventListener("click", loadItemPage);
  actions.append(viewItems);
  const pncpLink = element("a", "button button-secondary", "Ver no PNCP");
  pncpLink.href = ataPageUrl(entry.ref);
  pncpLink.target = "_blank";
  pncpLink.rel = "noopener noreferrer";
  actions.append(pncpLink);

  const download = element("button", "button button-secondary", "Baixar ata");
  download.type = "button";
  download.addEventListener("click", async () => {
    download.disabled = true;
    download.textContent = "Localizando PDF…";
    try {
      const url = await findAtaDocumentUrl(entry.ref);
      window.location.assign(url);
    } catch {
      const message = card.querySelector(".result-error") || element("p", "result-footer result-error");
      message.textContent = "Não foi possível localizar o PDF agora. Use “Ver no PNCP” ou tente novamente.";
      if (!message.isConnected) card.append(message);
    } finally {
      download.disabled = false;
      download.textContent = "Baixar ata";
    }
  });
  actions.append(download);
  card.append(actions);
  card.append(panel);

  const footer = element("p", "result-footer");
  const adhesion = entry.allowsAdhesion === true ? "Permite adesão" : entry.allowsAdhesion === false ? "Não permite adesão" : "Adesão não informada";
  footer.textContent = `${adhesion} · ID PNCP: ${entry.id}`;
  card.append(footer);
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
    status.textContent = `${state.entries.length} ${state.entries.length === 1 ? "ata exibida" : "atas exibidas"}${state.hasMore ? ". Há mais resultados no PNCP." : "."}`;
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
        if (entry && !state.seen.has(entry.id) && matchesFilters(entry)) {
          state.seen.add(entry.id);
          state.entries.push(entry);
        }
      }
      fetched += 1;
    }
    render();
  } catch {
    showNotice("A busca do PNCP não respondeu agora. Tente novamente ou consulte diretamente o portal oficial pelo link abaixo.");
    status.textContent = state.entries.length ? `${state.entries.length} atas já carregadas.` : "Busca temporariamente indisponível.";
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
