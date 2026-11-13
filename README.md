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

Para uma verificação rápida, abra também `/apps/atas/`, pesquise um termo e um ID de ata, e confira o agrupamento por contratação, todas as atas e os links dos documentos no PNCP. Na busca interna, teste um item além da primeira página, um termo sem acento e a consulta sem termo para listar todos os itens. Antes de enviar alterações, execute `git diff --check`.

## Publicação

O workflow `pages.yml` publica apenas a pasta `site/` no GitHub Pages após um envio à branch `main`. Nas configurações do repositório, escolha **Settings → Pages → Source: GitHub Actions**. O endereço esperado é `https://jorge-merida.github.io/painel-assistente/`.

## Dados do PNCP

O buscador usa a busca pública do portal para localizar atas vigentes por texto e a API documentada do PNCP para identificar o arquivo da ata. O link de PDF é montado no domínio padrão `pncp.gov.br`, sem usar portas alternativas que às vezes não abrem no navegador. O navegador do usuário faz o download; o repositório não armazena PDFs.

Os resultados são agrupados por contratação de origem (pregão), usando CNPJ, ano e sequencial da compra. A busca inicial continua consultando atas vigentes; os filtros de UF e adesão selecionam contratações com uma ata encontrada que atenda aos critérios. Ao abrir **Consultar itens e todas as atas**, o aplicativo consulta a lista completa de atas daquela contratação, com paginação. Atas canceladas e fora da vigência também aparecem, identificadas. Cada ata permite abrir o registro oficial e listar todos os seus documentos para download, incluindo anexos.

A busca **Localizar itens neste pregão** pesquisa descrição, número do item e código de catálogo, ignorando acentos e diferenças entre maiúsculas e minúsculas. Ela percorre todas as páginas de itens, em lotes de 100, sob demanda. Os resultados são exibidos em grupos de 20, com quantidade, unidade, preço unitário homologado, fornecedor e valor estimado quando publicados. Os resultados homologados são consultados apenas para os itens exibidos, com até quatro consultas simultâneas. As páginas de itens ficam apenas na memória da consulta; uma falha ou interrupção mostra resultados parciais e permite continuar da página pendente. Uma nova busca geral descarta essa memória.

O PNCP pode publicar várias atas para uma contratação sem informar, em dados estruturados, quais itens e fornecedores compõem cada ata. Encontrar um item no pregão não confirma que ele pertença a uma ata específica. Para uma adesão, confirme itens, preços registrados e alterações no documento da ata.

**Limite importante:** a rota de busca textual usada pela interface do PNCP (`/api/search/`) não aparece na especificação pública da API de Consulta. Ela pode mudar ou ficar indisponível. A interface sempre oferece o link para abrir a ata no PNCP. Os filtros de UF e adesão são conferidos nos registros recebidos; carregue mais páginas para ampliar os resultados. Uma pesquisa sem retorno não prova que não exista ata no PNCP.

Busca nacional por CATMAT, comparação de preços e busca detalhada por item estão planejados para etapas posteriores. O PNCP pode deixar o campo de código do catálogo vazio em uma contratação.

### Fornecedores por ata

O serviço complementar publicado está em `https://painel-assistente-fornecedores.painel-fornecedores.workers.dev`. Seu código está em `services/fornecedores/`, fora da pasta publicada pelo Pages. Quando `supplierServiceUrl` em `site/apps/atas/config.js` estiver preenchido, cada ata consulta os fornecedores no Compras.gov.br por meio do Cloudflare Worker, vinculando-os pelo ID PNCP exato da ata. A lista exibe nome, identificação (CPF/CNPJ) e fonte. Uma resposta sem correspondência é identificada como ausência de registro na fonte; falhas podem ser tentadas novamente sem impedir os documentos ou os itens. A cobertura é parcial e a consulta não substitui a conferência no documento. Com o endereço vazio, a integração fica desativada.

Veja [configuração e publicação do serviço](services/fornecedores/README.md). Credenciais não fazem parte do site nem do repositório.

Fontes: [API de Consulta](https://pncp.gov.br/api/consulta/swagger-ui/index.html), [manual de atas](https://pncp.gov.br/manual/pt-br/latest/ata_de_registro_de_preco/consultar_ata_de_registro_de_preco.html), [manual de itens](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html) e [manual de resultados](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_resultados_de_item_de_uma_contratacao.html).

## Verificação do fluxo no navegador

O teste `tests/atas-browser.html` usa respostas simuladas do PNCP para conferir agrupamento, sete atas, vigência e cancelamento, múltiplos documentos, busca sem acentos além da primeira página, falhas parciais, retomada e exibição em grupos de 20. Ele não acessa o PNCP nem baixa PDFs.

Sirva a raiz do repositório em uma porta livre, por exemplo `python3 -m http.server 8001`, e abra `http://localhost:8001/tests/atas-browser.html`. O resultado ao final deve começar com `PASS`. Esse teste complementa a conferência manual com dados reais; não valida disponibilidade, CORS ou mudanças na API pública.
