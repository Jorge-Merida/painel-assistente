# Consulta complementar de fornecedores

Worker independente do GitHub Pages, sem banco de dados, autenticação do visitante ou armazenamento de PDFs. Apenas dados públicos são consultados. O site continua publicado pela pasta `site/`.

## Como funciona

`GET /fornecedores?ata=25053133000157-1-000211/2024-000001&pagina=1`

1. Valida o ID PNCP e consulta aquela ata no PNCP para obter unidade gerenciadora e data de início da vigência.
2. Consulta uma página de até 500 itens no endpoint oficial `https://dadosabertos.compras.gov.br/modulo-arp/2_consultarARPItem`, filtrada por unidade e data.
3. Retém apenas registros cujo `numeroControlePncpAta` corresponda exatamente à ata solicitada, desconsiderando diferenças de zeros à esquerda. Registros excluídos são descartados.
4. Retorna nomes e identificações dos fornecedores. Não usa os vencedores dos itens gerais do pregão para inferir fornecedores da ata.

O serviço não é um proxy genérico: não aceita URL de destino. Só consulta os dois domínios oficiais fixos. Cada fonte tem tempo máximo de 12 segundos. Respostas públicas das fontes ficam em cache temporário por até uma hora, compartilhado entre atas com os mesmos filtros. Não há banco ou armazenamento permanente. A consulta pode refletir atraso das fontes e do cache; confirme no documento.

O navegador percorre as páginas e deduplica os fornecedores. Só apresenta a lista após concluir a consulta; falhas e limite de 100 páginas são tratados como indisponibilidade, sem declarar uma busca parcial como completa. Até duas atas são consultadas ao mesmo tempo. Uma falha não bloqueia itens nem documentos.

## Cobertura e limites

- Compras.gov.br é uma fonte complementar: não há garantia de cobertura de todas as atas do PNCP.
- `suppliers: []` significa que não foi encontrado vínculo naquela fonte, não que a ata não tenha fornecedor.
- A identificação pode ser CPF ou CNPJ e é exibida como publicada na fonte.
- A restrição de origens permite o Pages e os endereços locais listados no Wrangler. CORS não é autenticação; o serviço utiliza apenas dados públicos.
- O plano gratuito do Workers tem limites próprios de requisições, CPU e subconsultas. Nenhum recurso pago, banco, domínio ou plano pago é provisionado por esta configuração.

## Testar e publicar

Com Node.js 24 e npm instalados, nesta pasta:

```bash
npm ci
npm test
npx wrangler deploy --dry-run
npx wrangler login
npx wrangler deploy
```

Use uma conta Cloudflare com Workers Free. Se a conta tiver mais de uma organização, selecione explicitamente a conta pretendida. O primeiro uso pode pedir a criação de um subdomínio `workers.dev`. Não é necessário cadastrar domínio próprio.

Após a publicação, confira `/health` e a consulta acima. Confira também CORS a partir de `https://jorge-merida.github.io` e um caso sem correspondência. Só então preencha `supplierServiceUrl` em `site/apps/atas/config.js` com a origem HTTPS do Worker, sem barra de caminho e sem tokens. Faça o teste `tests/atas-browser.html` e publique o Pages pelo fluxo normal do projeto.

Para desligar a integração, deixe `supplierServiceUrl` vazio e publique novamente o site. A consulta original ao PNCP continua independente.

Credenciais do Wrangler ficam no perfil local do usuário, fora do repositório. Não adicione tokens, `.dev.vars`, arquivos `.env` ou `.wrangler/` ao Git.

## Fontes

- [Documentação da API do Compras.gov.br](https://dadosabertos.compras.gov.br/swagger-ui/index.html)
- [Manual oficial, seção 11.2 — Itens da ARP](https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manual-dados-abertos/manual-api-compras.pdf)
- [Limites do Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/)
