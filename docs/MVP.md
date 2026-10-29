# MVP — Buscador de atas do PNCP

## Objetivo

Permitir que uma pessoa encontre uma ata vigente de registro de preços, reconheça o órgão de origem e abra ou baixe seu documento diretamente do PNCP, sem IA, login, banco de dados ou armazenamento de PDFs no projeto.

## Entrega inicial

- Homepage pública com identidade visual própria inspirada nas cores do portal de Campo Largo/PR, sem brasão e sem se apresentar como ferramenta oficial.
- Campo único de texto para objeto, número da ata, órgão ou município. Um ID ou link de ata do PNCP também pode ser colado diretamente.
- Filtros de UF e possibilidade de adesão; os filtros são conferidos nos registros devolvidos pelo PNCP.
- Apenas atas vigentes e não canceladas.
- Cartões com número, objeto, órgão, município/UF, fim da vigência, informação de adesão, ID PNCP e ações para abrir o registro e baixar o documento.
- Paginação por “Carregar mais resultados” e mensagens claras quando a fonte estiver indisponível.
- Publicação estática no GitHub Pages; somente `site/` é publicado.

## Limites desta etapa

- A busca textual depende da rota pública utilizada pela interface do PNCP, que não consta da documentação da API de Consulta. A resposta pode falhar ou mudar.
- A busca não garante cobertura exaustiva de todas as atas quando os filtros locais são usados; o usuário pode carregar mais páginas.
- CATMAT e outros códigos de catálogo ainda não são filtros. Eles exigem consultar e indexar itens das contratações e podem estar ausentes nos dados publicados.
- Preços e fornecedores de itens ainda não são exibidos. Quando adicionados, cada valor deverá ser identificado como estimado, homologado ou registrado na ata.
- Acesso restrito, escrita em planilhas e IA ficam para aplicativos futuros, com autenticação e serviço de dados próprios.

## Próximas etapas

1. Verificar a busca no navegador publicado e corrigir diferenças entre os filtros do portal e os dados retornados.
2. Acrescentar detalhes dos itens e resultados homologados consultando a API documentada do PNCP.
3. Medir volume e custo de um índice próprio para busca nacional por CATMAT e relações entre termos, sem IA.
4. Validar com a equipe as consultas reais e ajustar relevância, filtros e apresentação.
