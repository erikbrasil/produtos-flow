# Produtos Flow

Script do Tampermonkey que marca produtos nos cortes do Flow, no YouTube Studio, sem usar IA.

- Descobre o convidado pelo título do episódio completo (link "ASSISTA COMPLETO" da descrição) e pela Wikipédia.
- Descobre o assunto pelo título do corte (STF, política, geopolítica, games, música, carros…).
- Busca produtos nesta ordem: pessoa famosa citada no corte, convidado, assunto e itens coringa.
- Marca até 10 produtos, um por busca, sem repetir o mesmo produto de lojas diferentes.
- Distribui os tempos ao longo do vídeo.
- **Para duas vezes para você conferir.** Nunca clica em Pronto, Salvar ou Publicar.

## Instalar (Opera GX, Chrome ou Edge)

1. Instale a extensão **Tampermonkey** (no Opera GX, pela loja de extensões do Opera).
2. Em `opera://extensions` (ou `chrome://extensions`), ligue o **Modo de desenvolvedor**. Nos detalhes do Tampermonkey, ligue **Permitir scripts de usuário**. Feche e abra o navegador.
3. Clique neste link e depois em **Instalar**:
   **https://raw.githubusercontent.com/erikbrasil/produtos-flow/main/produtos-flow.user.js**

   Se o link só mostrar o código, use: Tampermonkey → Painel → Utilitários → **Importar do URL** → cole o link → Instalar.

As atualizações chegam sozinhas: o Tampermonkey confere o link todo dia. Para buscar na hora, use Tampermonkey → **Procurar atualizações de scripts**.

## Usar

1. No Studio, abra o corte em **Detalhes**, no rascunho ou no vídeo já publicado.
2. Clique no botão vermelho **🛒 Produtos Flow** e depois em **▶ Começar**.
3. **Parada 1:** confira os produtos marcados e clique em **Está certo — marcar os tempos**.
4. **Parada 2:** confira os tempos e clique em **Pronto** no Studio. Em vídeo publicado, clique também em **Salvar**.

Se der erro, clique em **📋 Copiar relatório** e mande para quem cuida do script.
