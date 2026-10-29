# Painel Assistente

- Trabalhe a partir da raiz deste repositório. Mantenha alterações do painel dentro dele.
- O site público está em `site/`; o GitHub Pages publica essa pasta pelo workflow `.github/workflows/pages.yml`.
- O primeiro aplicativo, `site/apps/atas/`, consulta dados públicos do PNCP sem IA, login, banco de dados ou armazenamento de PDFs.
- Mantenha textos da interface em português claro. Identifique valores como estimados ou homologados; a API não vincula os itens da contratação a uma ata específica.
- Não adicione credenciais, dados internos ou PDFs ao repositório. Para aplicativos restritos futuros, use autenticação e serviço próprios fora do site estático público.
- Consulte `README.md` e `docs/MVP.md` antes de ampliar o buscador. Verifique alterações no navegador e confira `git diff --check` antes de publicar.
