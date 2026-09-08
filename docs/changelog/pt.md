# Novidades

As versões anteriores à 0.6.0 estão, em inglês, no CHANGELOG do repositório.

## 0.7.0 — 2026-09-08

### Novo

- **As skills são abertas quando cabem, não despejadas em cada execução.** Uma skill viajava
  inteira dentro do prompt de sistema de cada agente que a tivesse ligada: cinco skills eram cinco
  manuais em cada execução, lidos ou não. Agora cada uma é escrita em
  `.ainess/skills/<nome>/SKILL.md` e o prompt leva só o nome dela, uma linha do que serve e esse
  caminho — o agente abre a que trata do trabalho que tem, e o que a skill precisar (um script, um
  modelo) pode morar na mesma pasta. É por essa linha de descrição que ele decide, e o editor agora
  diz isso.
- **As notificações têm som.** Duas notas curtas, subindo quando algo precisa de você e descendo
  quando algo terminou, para distinguir sem olhar. O app as sintetiza — nenhum arquivo no
  instalador — e tocam igual na janela, a partir da bandeja (o app continua vivo ali, e é isso que
  deixa o som chegar) e no telefone. Configuração → Geral desliga, e o editor ajusta as notas, a
  onda e o volume, ou aceita um som seu.
- **O histórico de cada agente, dentro do projeto.** `.ainess/history/` recebe um arquivo por
  agente, ao qual cada turno é acrescentado quando termina: quem pediu, o que foi pedido e o que
  voltou, tanto do trabalho delegado quanto das conversas. O app guarda tudo no seu próprio
  armazenamento, onde só ele lê; esta é a porta de entrada para um agente que volta amanhã, e para
  você com um editor aberto. Quando o arquivo enche, turnos inteiros são descartados, nunca meio
  turno.
- **As abas do terminal são arrastadas para a ordem que você quiser**, como em qualquer editor com
  abas: a que está sendo levada esmaece e uma linha mostra onde cairia.
- **Hooks nas condições da própria máquina.** Até agora um hook respondia a algo que um agente
  fez. Mais cinco eventos respondem à máquina: o app abrir, um relógio (a uma hora do dia ou a cada
  tantos minutos), a conexão cair e voltar, e um arquivo mudar na pasta do projeto — este último
  montado no watcher que já existia, então o ruído (`.git`, `node_modules`, a saída do build) não
  chega nele. Rodam enquanto o app está aberto, no máximo uma vez por minuto cada um, e o projeto
  em que agem é o do filtro do hook ou o que estiver aberto. `approval.requested`, que já era
  disparado, finalmente está na lista.
- **O changelog no seu idioma.** O diálogo que abre depois de atualizar, e Configuração → Sobre,
  mostram as novidades traduzidas. O inglês fica em `CHANGELOG.md` e cada outro idioma tem seu
  arquivo, que a verificação de release mantém em dia com a versão publicada.
- **Procura uma versão nova a cada cinco minutos**, não só ao abrir, então uma release publicada
  com o app aberto chega no mesmo dia. A mesma oferta de sempre, e o mesmo interruptor em
  Configuração desliga.
- **Cortar um turno para dizer algo.** Uma mensagem esperando um agente tem um segundo botão: para
  o que está rodando e entrega a mensagem na hora. Nada se repete — o que o agente fez está em
  disco e o que ele disse está na sessão dele, que a execução seguinte retoma — e ele é avisado de
  que o turno foi cortado, para não ler o transcript como um que terminou.
- **Comandos na caixa.** Digitar `/` no campo de escrita vazio abre uma lista curta: `/compact` faz
  todos os agentes do projeto começarem uma sessão nova — nada se perde, porque cada um é apontado
  para seu arquivo em `.ainess/history/` e relê só o que o trabalho novo precisar — e `/cost` abre
  o que o projeto gastou. Qualquer outra coisa na caixa é uma mensagem, então «olha o /compact do
  Claude» continua indo intacto para a equipe.

### Corrigido

- **As instruções eram enviadas de novo a cada turno.** O preâmbulo de um agente — o papel dele, os
  esquemas de `delegate` e de `ask`, o contexto compartilhado, o perfil, a lista de skills — ia com
  cada mensagem de uma conversa que a CLI já vinha carregando. Com o Claude eram os mesmos
  parágrafos cobrados turno após turno; com os provedores que colocam as instruções dentro do
  prompt (Antigravity, Copilot, opencode e os demais) ainda deixava outra cópia no transcript, para
  sempre, então uma sessão longa pagava por isso muitas vezes. Agora vão uma vez só, no turno que
  abre a sessão. O que continua indo a cada turno é o quadro, que é a parte que muda.
- Um projeto abre sua pasta no explorador de arquivos, tanto pelo clique direito quanto pelos três
  pontos — e esses dois menus oferecem as mesmas ações em todo lugar onde são a mesma coisa. O
  caminho do projeto estava no clique direito e não nos pontos, e o «Abrir» de uma conversa ao
  contrário.
- Um projeto não pode mais ter dois orquestradores na raiz. O diálogo da equipe pede um pai para o
  segundo, que é onde ele pertencia: lado a lado os dois leem o quadro inteiro e podem pegar o
  mesmo cartão, só o primeiro é o destino padrão do campo de escrita, da CLI e do telefone, e o
  único ponteiro de «tarefa em andamento» do projeto deixava um passar por cima do outro — e a
  primeira tarefa ficava sem seu cartão movido, sem seus hooks e sem sua notificação. Uma equipe
  que já tem dois avisa assim que você abre qualquer um deles.
- Trocar a CLI de um agente mantinha a sessão da anterior, e a execução seguinte entregava ao
  Antigravity um id de sessão que o Claude tinha aberto — o que falha na hora, porque é um nome que
  o outro nunca ouviu. A sessão agora é descartada quando a CLI muda, e quando o agente entra ou
  sai do próprio worktree, que é a outra metade do que uma sessão está amarrada.
- O watcher do repositório não acorda mais com a pasta `.ainess/` do próprio app: o quadro, a
  equipe e agora o histórico são escritos ali enquanto se trabalha, e um hook de arquivo estaria
  respondendo ao app em vez de ao usuário.
- Um hook perguntava duas vezes sobre o que ele age: um campo para o agente e outro para o projeto.
  Agora é um só — tudo, um projeto inteiro, ou um agente dentro dele — já que um agente pertence a
  exatamente um projeto e o par só podia concordar ou se contradizer até nunca disparar.
- As listas de agentes que atravessam projetos — a do agente que um hook instrui, a do filtro do
  hook, a da ordem salva — agrupam os agentes sob o projeto de cada um, com a cor dele. Dois
  projetos com um «Orquestrador» cada liam igual.
- Um agente para quem você escreve é informado de quem ele é. Lia o mesmo prompt viesse o trabalho
  do planejador dele ou de você, então um implementador respondia sua mensagem delegando-a — e
  depois ficava em «esperando a equipe».
- E essa espera acabou de qualquer forma: uma delegação que nomeava alguém que não está sob aquele
  agente o deixava esperando uma equipe que nunca viria. Quando nenhuma aterrissa, o agente fica
  livre.
- Um link no terminal abre com um clique. Antes só eram links os que a CLI marcava, e ainda
  precisavam de Ctrl; agora qualquer URL na saída é um, e abre no navegador de verdade.
- No telefone o teclado cobria a caixa em que você estava escrevendo. A página de propósito não se
  redimensiona quando o teclado abre — isso tirava a conversa da âncora de baixo no meio do
  trabalho — então agora o app é encurtado exatamente pelo que o teclado ocupa.
- O toast de «há uma versão nova» mostrava a nota da release como ela está escrita, então se lia
  `[CHANGELOG.md](https://…)`: um toast não tem markdown para renderizá-la. Agora diz o que tem que
  dizer, e o que mudou está no changelog que abre depois de atualizar.
- Uma mensagem escrita enquanto o agente trabalhava aparecia em Comunicação e em nenhum outro
  lugar, como se o app a tivesse engolido. Agora fica no fim da conversa, tracejada e com um
  relógio, dizendo por quem espera, e pode ser retirada antes da vez dela.
- Essa mensagem também podia ser entregue cedo demais: um agente que delega termina a própria
  execução antes de a equipe dele terminar, e a fila era esvaziada ali — a mensagem corria ao lado
  do trabalho que deveria seguir. Agora espera até o agente estar realmente livre.

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
