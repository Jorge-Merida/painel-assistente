# Painel Assistente

Portal público e independente de ferramentas de apoio à gestão de recursos vinculados à saúde. A primeira ferramenta pesquisa atas vigentes de registro de preços no PNCP.

## Estrutura

```text
site/
  index.html                 Homepage pública
  assets/styles.css          Estilos compartilhados
  apps/atas/                 Buscador de atas do PNCP
docs/MVP.md                  Escopo e próximos passos
.github/workflows/pages.yml  Publicação no GitHub Pages
```

Cada aplicativo pode ter sua própria pasta em `site/apps/`. O portal público pode, no futuro, apontar para ferramentas restritas hospedadas separadamente com autenticação. Nenhuma credencial, dado interno ou PDF baixado deve ser adicionado a `site/`.

## Executar localmente

Com Python 3 instalado, na raiz do repositório:

```bash
python3 -m http.server 8000 --directory site
```

Abra `http://localhost:8000/`. Não há dependências de instalação nem etapa de compilação.

## Publicação

O workflow `pages.yml` publica apenas a pasta `site/` no GitHub Pages após um envio à branch `main`. Nas configurações do repositório, escolha **Settings → Pages → Source: GitHub Actions**. O endereço esperado é `https://jorge-merida.github.io/painel-assistente/`.

## Dados do PNCP

O buscador usa a busca pública do portal para localizar atas vigentes por texto e a API documentada do PNCP para identificar o arquivo da ata. O link de PDF é montado no domínio padrão `pncp.gov.br`, sem usar portas alternativas que às vezes não abrem no navegador. O navegador do usuário faz o download; o repositório não armazena PDFs.

O botão **Ver itens e preços** consulta, sob demanda e em páginas de 10 itens, os itens da contratação de origem e os resultados homologados de cada item. Mostra quantidade, unidade, preço unitário homologado, fornecedor e valor estimado quando publicado, com rótulos distintos. O PNCP pode publicar várias atas para uma contratação sem informar, em dados estruturados, quais itens e fornecedores compõem cada ata. Por isso a lista é identificada como pertencente à **contratação de origem**; para uma adesão, confirme itens, preços registrados e alterações no documento da ata.

**Limite importante:** a rota de busca textual usada pela interface do PNCP (`/api/search/`) não aparece na especificação pública da API de Consulta. Ela pode mudar ou ficar indisponível. A interface sempre oferece o link para abrir a ata no PNCP. Os filtros de UF e adesão são conferidos nos registros recebidos; carregue mais páginas para ampliar os resultados. Uma pesquisa sem retorno não prova que não exista ata no PNCP.

Busca nacional por CATMAT, comparação de preços e busca detalhada por item estão planejados para etapas posteriores. O PNCP pode deixar o campo de código do catálogo vazio em uma contratação.

Fontes: [API de Consulta](https://pncp.gov.br/api/consulta/swagger-ui/index.html), [manual de atas](https://pncp.gov.br/manual/pt-br/latest/ata_de_registro_de_preco/consultar_ata_de_registro_de_preco.html), [manual de itens](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html) e [manual de resultados](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_resultados_de_item_de_uma_contratacao.html).
