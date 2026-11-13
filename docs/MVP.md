# MVP — Buscador de atas do PNCP

## Objetivo

Permitir que uma pessoa encontre uma ata vigente de registro de preços, reconheça o órgão de origem e abra ou baixe seu documento diretamente do PNCP, sem IA, login, banco de dados ou armazenamento de PDFs no projeto.

## Entrega inicial

- Homepage pública com identidade visual própria inspirada nas cores do portal de Campo Largo/PR, sem brasão e sem se apresentar como ferramenta oficial.
- Campo único de texto para objeto, número da ata, órgão ou município. Um ID ou link de ata do PNCP também pode ser colado diretamente.
- Filtros de UF e possibilidade de adesão; os filtros são conferidos nos registros devolvidos pelo PNCP.
- Busca inicial por atas vigentes e não canceladas, com resultados agrupados por contratação. A lista interna reúne todas as atas do pregão, com indicação de vigência e cancelamento.
- Cartões por contratação com órgão, município/UF, objeto e link oficial; lista de todas as atas com número, vigência, adesão, ID PNCP e todos os documentos disponíveis.
- Busca interna em todas as páginas de itens por descrição, número ou código de catálogo, sem distinção de acentos; valores estimados e homologados identificados, com fornecedores dos resultados.
- Consulta de itens sob demanda, com progresso, interrupção e retomada após falhas; resultados parciais identificados e exibição em grupos de 20 itens.
- Integração opcional com serviço Cloudflare para consultar fornecedores no Compras.gov.br por ID PNCP exato da ata, com identificação da fonte e mensagens de ausência de registro ou indisponibilidade. Serviço fora de `site/`, sem banco ou armazenamento de PDFs; ativação por URL pública em `config.js`.
- Paginação por “Carregar mais resultados” e mensagens claras quando a fonte estiver indisponível.
- Publicação estática no GitHub Pages; somente `site/` é publicado.

## Limites desta etapa

- A busca textual depende da rota pública utilizada pela interface do PNCP, que não consta da documentação da API de Consulta. A resposta pode falhar ou mudar.
- A busca não garante cobertura exaustiva de todas as atas quando os filtros locais são usados; o usuário pode carregar mais páginas.
- CATMAT e outros códigos de catálogo podem ser procurados nos itens de uma contratação, quando publicados. A busca nacional por esses códigos ainda exige consultar e indexar itens das contratações.
- Os itens e preços estruturados disponíveis no PNCP pertencem à contratação de origem. Uma contratação pode gerar várias atas, e o vínculo exato de itens e fornecedores com cada documento de ata não é fornecido pela API. Os valores exibidos são identificados como estimados ou homologados, nunca apresentados como preço registrado na ata.
- Acesso restrito, escrita em planilhas e IA ficam para aplicativos futuros, com autenticação e serviço de dados próprios.

## Próximas etapas

1. Verificar a busca no navegador publicado e corrigir diferenças entre os filtros do portal e os dados retornados.
2. Validar com a equipe se os itens e resultados homologados da contratação atendem à triagem inicial e estudar uma forma confiável de vincular preços à ata específica.
3. Medir volume e custo de um índice próprio para busca nacional por CATMAT e relações entre termos, sem IA.
4. Validar com a equipe as consultas reais e ajustar relevância, filtros e apresentação.
