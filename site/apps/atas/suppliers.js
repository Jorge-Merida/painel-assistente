import { config } from "./config.js";

export function supplierServiceEnabled() {
  return Boolean(config.supplierServiceUrl);
}

export async function fetchAtaSuppliers(ata, onProgress = () => {}, isActive = () => true) {
  const ref = ata.ref;
  const id = `${ref.cnpj}-1-${ref.sequencialCompra}/${ref.anoCompra}-${ref.sequencialAta}`;
  const suppliers = new Map();
  let page = 1;
  while (isActive()) {
    onProgress(page);
    const url = new URL("/fornecedores", config.supplierServiceUrl);
    url.searchParams.set("ata", id);
    url.searchParams.set("pagina", String(page));
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("Consulta indisponível");
    const data = await response.json();
    if (!["ok", "unavailable"].includes(data.status) || !Array.isArray(data.suppliers) || typeof data.hasMore !== "boolean") throw new Error("Resposta inesperada");
    for (const supplier of data.suppliers) {
      if (typeof supplier.name !== "string" || typeof supplier.id !== "string") throw new Error("Fornecedor inesperado");
      suppliers.set(`${supplier.id.toUpperCase()}|${supplier.name.toUpperCase()}`, supplier);
    }
    if (!data.hasMore) return { status: data.status, suppliers: [...suppliers.values()] };
    if (!Number.isInteger(data.nextPage) || data.nextPage !== page + 1 || data.nextPage > 100) throw new Error("Consulta incompleta");
    page = data.nextPage;
  }
  throw new Error("Consulta encerrada");
}
