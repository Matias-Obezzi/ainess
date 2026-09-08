# Novidades

As versões anteriores à 0.6.0 estão, em inglês, no CHANGELOG do repositório.

## 0.6.0 — 2026-09-08

### Novo

- **Os arquivos vão junto com a mensagem.** Um clipe no campo de escrita, ou Ctrl+V colando direto
  na caixa: uma captura, um PDF, um log. As imagens mostram miniatura antes de ir e o resto mostra
  nome e tamanho, e qualquer um pode ser retirado. Ao enviar, o arquivo é copiado para a pasta
  `.ainess/attachments/` do próprio projeto e o prompt leva o caminho dele — que é a única coisa que
  toda CLI consegue fazer com um anexo, já que todas leem o repositório em que trabalham.

### Corrigido

- O projeto com agentes trabalhando mostra isso no próprio ponto, que pulsa devagar. Antes ele
  usava um contador laranja ao lado do nome, com a mesma cara de algo esperando uma resposta sua —
  o selo âmbar no rodapé do menu, esse sim precisa de você, agora é a única coisa com essa cara.
- Excluir pelo menu do botão direito perguntava na pílula no topo da janela, o formato pensado para
  o celular, em vez do diálogo. Só acontecia enquanto se trabalha no app, e ainda podia perder a
  pergunta por completo.
- A lista de `{{` de um hook diz o que cada variável guarda, não só o nome dela, e as setas fazem a
  lista rolar: passada a oitava, a destacada ficava abaixo do corte.
