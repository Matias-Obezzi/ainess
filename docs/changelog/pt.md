# Novidades

As versões anteriores à 0.6.0 estão, em inglês, no CHANGELOG do repositório.

## Não publicado

### Novo

- **Solte arquivos na caixa.** O clipe e o Ctrl+V eram as duas formas de anexar; arrastar um
  arquivo da pasta que você já tinha aberta é a terceira, e a que não faz você dar volta nenhuma. A
  caixa se marca com um contorno quando passa por cima dela um arraste trazendo arquivos, e o que
  você já tinha escrito vai junto. Um cartão do quadro que cruze a caminho de outra coluna fica
  intocado — ele leva texto, não arquivos, e pegá-lo não o moveria para lugar nenhum.

### Corrigido

- **O quadro rola sozinho quando você leva um cartão até a borda.** Um quadro mais largo que a
  janela não dava para atravessar: a coluna que você queria estava fora de vista, e soltar para
  rolar deixava o cartão onde não era. Agora segurar um cartão perto de qualquer uma das bordas
  puxa o quadro junto, devagar ao entrar na zona e mais rápido quanto mais perto — e continua
  puxando mesmo com o mouse parado, coisa que os eventos de arraste sozinhos não avisam a
  ninguém.

## 0.10.0 — 2026-09-09

### Novo

- **A caixa completa o que você está prestes a escrever.** `@` nomeia um agente do projeto, `#` um
  arquivo do workspace, `{{` uma das variáveis de template, e `/` os seus comandos e as suas ordens
  salvas juntos — porque as duas coisas são coisas que você pode disparar. Setas para andar, Enter
  ou Tab para escolher, Esc para fechar a lista sem mexer no que você escreveu. Aos dois comandos
  que existiam somaram-se cinco: `/tasks`, `/chat`, `/diff`, `/stop` e `/clear`, que pergunta antes.
  Nada completa dentro de um bloco de código, onde um `#` é um comentário e uma `/` é um caminho.

- **Você pode escrever código na caixa.** O Enter enviava, então um bloco de código era lembrar do
  Shift+Enter em cada linha e torcer para ter fechado a cerca — a caixa mostrava o markdown como
  texto puro e não dava sinal nenhum. Agora as teclas sabem onde está o cursor: numa linha que é só
  a abertura de uma cerca, o Enter escreve a de fechamento e deixa você no meio; dentro de uma cerca
  o Enter quebra a linha mantendo a sua indentação e o Tab põe dois espaços; e a parte cercada do
  que você está escrevendo ganha um fundo, para você ver onde começa e onde termina. O Ctrl+Enter
  envia de dentro de uma cerca, já que o Enter sozinho não pode mais.

### Corrigido

- **Uma pergunta é feita num lugar só.** Ela aparecia como balão no fio e tomava a caixa ao mesmo
  tempo, as duas vivas, as duas a mesma pergunta. A caixa fica com ela, que é onde você pode
  responder com o composer inteiro. Depois de respondida, ela volta ao fio como uma linha somente
  de leitura — que é o único registro ali de que um dia foi feita.

- **Responder pela caixa agora responde de verdade.** Um agente pergunta algo, você escolhe
  escrever a resposta na caixa em vez do campo da pergunta, envia — e a pergunta continuava aberta.
  Ela voltava a cobrir a caixa toda vez que você entrava de novo na conversa, seguia no sino, na
  tela inicial e no `/status`, e a execução que perguntou continuava esperando uma resposta que já
  tinha recebido, enquanto a sua mensagem começava uma execução à parte. Um agente que perguntou
  algo está parado esperando você, então o que você escrever depois é a resposta, onde quer que a
  escreva.

- **A tela inicial diz cada coisa uma só vez.** Ela tinha virado a tela do que precisa de você, mas
  a grade antiga de cartões de projeto continuava embaixo, então um agente trabalhando aparecia três
  vezes: na lista do que está trabalhando, dentro do cartão do seu projeto e de novo no contador
  desse mesmo cartão. Cada cartão trazia ainda os seus próprios botões Abrir, Editar e Excluir — um
  vermelho em cada um — para ações que o clique do cartão e o menu de contexto já cobriam. Agora a
  tela inteira é um único tipo de linha: o que precisa de você, o que está trabalhando e os
  projetos, nessa ordem. A linha de um projeto mostra uma única linha de estado e, só quando há
  algo, uma contagem pequena do que espera e do que está rodando. Quando nada está esperando, ela
  diz isso numa linha em vez de deixar você deduzir.

- **As skills sugeridas são escritas para o agente e explicadas para você no seu idioma.** O
  catálogo por trás de "Sugeridas" estava todo em espanhol: os nomes, as instruções que o agente de
  fato lê e as descrições de uma linha da lista. As instruções são código — vão para o prompt de um
  agente e para um arquivo na pasta do projeto —, então agora estão em inglês, como o resto do
  repositório. O que está escrito para você é traduzido, nos sete idiomas, e há um teste que não
  deixa entrar uma sugestão nova até que todos os idiomas a tenham.

## 0.9.0 — 2026-09-08

### Novo

- **Um teto de gasto por projeto, e o aviso antes de queimá-lo.** A tela de uso sempre soube dizer
  quanto um projeto tinha custado. O que ela não podia era freá-lo. Agora um projeto aceita um teto
  diário, um mensal, ou os dois, e você diz o que fazer quando ele é atingido: avisar, ou não deixar
  novas execuções começarem. O aviso chega aos 80% — uma vez por dia, não uma por execução — e a tela
  de uso desenha a barra contra o teto que está mais perto de estourar. Os números continuam sendo só
  o que cada CLI realmente reportou: um provedor que não reporta nada não soma, e a tela diz isso em
  vez de estimar.

- **Um hook pode te avisar pelo Telegram, e há mais três momentos dos quais ficar sabendo.** As
  outras duas ações de chat pedem um webhook que você precisa ir criar num servidor; esta reaproveita
  o bot que você já configurou em Mensageria, então "quando uma tarefa terminar, me avise" é escolher
  numa lista. Você pode nomear um chat ou deixar em branco para todos os da lista — e só os da lista,
  porque um hook não pode ser a porta dos fundos que a contorna. Vieram junto três eventos novos: um
  agente perguntou algo e está esperando, uma revisão pediu mudanças, e um agente ficou sem cota.

- **A paleta busca o que foi dito, não só como as coisas se chamam.** Ela encontrava projetos,
  tarefas, chats e agentes pelo nome, que é o que você precisa no dia — e duas semanas depois o que
  você lembra é uma frase, não um título. Digite três letras e voltam também as mensagens do feed do
  projeto e de todos os chats, da mais nova para a mais antiga, cada uma mostrada com as palavras
  que você buscou no meio da linha, e não com o que a mensagem começava dizendo. Acentos e
  maiúsculas não importam, nem a quebra de linha que ficou entre as suas duas palavras.

- **O diff de uma execução, não o do projeto inteiro.** O painel de diff mostra a árvore de
  trabalho do projeto, o que responde "o que está acontecendo no repositório" e nunca "o que esta
  tarefa mexeu". Agora cada execução lembra onde rodou — o workspace do projeto ou o worktree do
  próprio agente — e em que commit começou, então o detalhe de uma execução mostra o que mudou desde
  então. As execuções anteriores a isto não lembram nenhuma das duas coisas, e dizem isso em vez de
  inventar.

- **Um agente pode mover o próprio cartão e abrir um para o que encontrou pelo caminho.** O quadro
  ia só num sentido: o planejador lia e distribuía, e quem fazia o trabalho não via nem o próprio
  cartão, muito menos podia avisar que travou. Agora qualquer agente pode deixar um bloco `task`
  enquanto trabalha — um move o seu cartão e acrescenta uma linha de detalhe, o outro abre um cartão
  sem responsável no backlog para algo que apareceu e não é da sua conta. Aparece no quadro enquanto
  a execução continua, não quando termina, e o cartão do backlog diz quem o propôs. Fechar um cartão
  continua não sendo decisão do agente.

- **O app responde num chat que você já tem aberto.** Em Configurações há uma seção Mensageria:
  você cola um token de bot do @BotFather no Telegram, liga e escreve para o bot — qualquer coisa
  que você disser começa uma tarefa, `/status` diz quem está trabalhando e o que espera por você,
  `/approve` e `/answer` resolvem o que precisa de você, `/stop` para tudo. Isso não expõe nada: é o
  app que sai para perguntar, então não há túnel, nem porta, nem endereço que alguém possa achar. Só
  os chats da lista podem dar ordens, a lista vazia não autoriza ninguém, e a um desconhecido não se
  responde nada — o id dele aparece nas Configurações com um botão para autorizar, que é também como
  você descobre o seu. O que chega ao sino chega também ao chat, e o que está esperando por você diz
  o que responder.

### Corrigido

- **Dois chats com o mesmo agente voltam a ser duas conversas.** O agente tinha um único
  compartimento para a sua sessão, e esse compartimento guardava a última conversa que tivesse
  falado. Você abria um segundo chat com um agente com quem já estava falando, voltava ao primeiro,
  e ele respondia com o contexto do outro — e um chat ainda por cima sobrescrevia a sessão que as
  suas próprias tarefas usavam. Agora o chat entrega a sessão que é dele em vez de ler aquele
  compartimento, guarda o que o provedor reporta junto do chat a que pertence, e um chat que ainda
  não tem a sua começa do zero em vez de pedir emprestada. Responder a uma pergunta feita dentro de
  um chat também fica lá dentro.

- **Desligar todos os tipos no filtro de comunicação agora deixa a visão vazia.** O que você manda
  a um agente era isento: aparecia dissesse o que dissesse o filtro, e nem constava na lista de
  tipos, então não havia como desligá-lo. O botão dizia "Tipos (0/8)" e o painel continuava
  mostrando coisas. Agora são dez tipos, os seus dois entre eles, e desligado é desligado. E quando
  foi o filtro que esvaziou a visão, ele diz isso, em vez de garantir que não houve atividade.

- **O painel de comunicação lê o que um agente escreveu do jeito que ele quis dizer.** Suas linhas
  mostravam o markdown cru — os asteriscos, as crases, as cerquilhas — enquanto o mesmo texto
  aparecia certo em todo o resto do app. Agora a prosa é renderizada: o que um agente disse, o que
  delegou, com o que voltou e as suas notas. As linhas de ferramenta e o stderr ficam exatamente
  como vieram, porque um caminho como `src/lib/__tests__/x.ts` não é uma instrução para deixar
  metade dele em negrito, e o que você digitou é mostrado como você digitou, como o chat já faz.

- **O filtro de tipos fica aberto enquanto você o usa, e não quebra mais o painel.** Escolher um
  tipo fechava o menu, então deixar o feed em dois tipos era abri-lo cinco vezes. E o botão que o
  abre diz "Tipos" até você desmarcar algo e "Tipos (7/8)" depois — um rótulo mais longo pelo qual
  nada naquela linha tinha permissão de encolher, então o painel inteiro acabava mais largo que o
  dock onde vive. Agora a linha cede, e a de cada mensagem também, onde dois nomes de agente, uma
  hora, uma etiqueta e um botão brigavam pelo mesmo espaço estreito.

- **Pedir o cru de uma mensagem mostra essa mensagem.** O botão de uma linha do painel de
  comunicação abria a execução inteira — cada linha de stdout que a sessão tivesse produzido —, que
  não é o que pede quem clica em cima de uma delegação. Agora mostra aquela mensagem: de quem para
  quem, quando, o texto completo e, se for uma chamada de ferramenta, a ferramenta, a entrada dela e
  o erro em que falhou, com um botão para copiar tudo. A execução inteira continua ali, um clique
  mais adentro, que é onde devia estar. O botão também ganhou uma dica, e aparece em todas as
  mensagens, não só nas que têm uma execução por trás.

- **Arrastar a janela não congela nem dá saltos.** Rodar um programa externo — o `git status` que
  atualiza a cada minuto, um `git diff`, uma sondagem de `--version` — segurava a thread que bombeia
  as mensagens da janela até o programa terminar. O Windows arrasta uma janela com um laço modal
  nessa mesma thread, então um arraste que caísse em cima de um desses travava e depois pulava para
  onde o ponteiro tivesse chegado. Esses comandos, e a leitura e escrita de configuração e logs,
  agora rodam fora dessa thread. Salvar a configuração também escreve ao lado e renomeia por cima,
  para que ninguém leia metade de uma.

- **O app se chama ainess em todo lugar, executável incluído.** Antes se chamava `ais`, e o nome
  antigo sobreviveu onde ninguém olha: o crate de Rust e, portanto, o binário — o app instalado era
  `ainess\ais.exe`, que é o que o Gerenciador de Tarefas, o aviso do firewall e a lista de
  inicialização mostravam. A linha de comando foi junto: `ais run` e `ais serve` agora são
  `ainess run` e `ainess serve`, e `ais` não existe mais. Nada do que você tinha se perde: rascunhos,
  larguras de painel e o token do celular são gravados com nomes novos e continuam lendo os
  antigos.

- **Acabaram as janelas de console piscando por cima do que você estava olhando.** Parar uma
  execução, fechar o app, uma execução que estourou o tempo, cortar o túnel e cada verificação de um
  processo velho chamavam `taskkill` ou `tasklist`, e o Windows dá uma janela de console a um
  programa de console iniciado por um app com janelas, a menos que se diga o contrário. As chamadas
  que iniciam um agente sempre diziam; as de limpeza ao redor delas, não.

- **Um único botão ao lado da caixa, e é o que faz falta naquele momento.** Enviar quando nada está
  rodando, parar enquanto um agente responde — os dois não se amontoam mais sobre o texto que você
  está escrevendo. Por baixo nada mudou: Enter continua enviando e, enquanto o agente trabalha,
  continua enfileirando o que você escrever para quando o turno terminar, que é o que a caixa vazia
  diz agora em vez de um segundo botão.

- **A pergunta de um agente ocupa o lugar da caixa.** Ela ficava dentro da bolha da execução: serve
  enquanto você está olhando e não serve mais assim que rola a tela — e pior, o que você escrevesse
  na caixa com uma pergunta aberta começava uma execução nova e deixava o agente esperando uma
  resposta que nunca chegaria. Agora a pergunta fica onde você ia escrever, com as opções como
  botões e espaço para uma resposta sua; se houver mais de uma esperando, ela avisa, e vêm uma de
  cada vez. "Escrever outra coisa" devolve a caixa sem responder nada.

- **O painel de notificações fecha ao clicar fora dele.** Ele fica preso à barra de título, que é a
  área por onde se arrasta a janela: um clique ali é tomado pelo sistema para mover a janela e nunca
  chega à camada que fecha o popover.

- **Os terminais pertencem ao seu projeto.** Você abria um em um projeto, ia para outro e continuava
  vendo as abas do primeiro — que é também por que um terminal parecia abrir na pasta errada: era o
  de outro projeto, parado na pasta dele. Agora cada projeto mostra os seus e lembra em qual estava.
  Apagar um projeto continua deixando os shells vivos, como sempre — algum pode estar no meio de
  algo — e eles aparecem na tela inicial, que é onde fica um terminal sem projeto.

## 0.8.0 — 2026-09-08

### Novo

- **A caixa vazia agora diz algo, e muda.** O placeholder do composer escreve uma de cinco
  linhas e muda a cada poucos segundos: para que serve a equipe, o que você pode deixar para eles, que `/`
  abre os comandos e o atalho do Enter, que deixa de ser um rastro permanente na linha e passa a ser
  algo que você lê uma vez. Ele fica quieto para quem pediu ao sistema menos movimento, e no
  telefone não se move de jeito nenhum.
- **Movimento onde significa algo.** Uma execução que ainda está em andamento tem a luz passando de
  um lado para o outro sobre a etapa em que está, em vez de um spinner; o "Trabalhando agora" do
  Início parece vivo; a pílula de aprovações usa um fio de luz ao redor enquanto —e apenas enquanto— algo
  espera sua resposta; e o dinheiro no painel de consumo vai subindo até o valor real, com o mesmo
  formato de moeda que as tabelas usam. Não se decorou mais nada: a thread, o feed e o quadro
  ficam quietos, porque uma ferramenta para a qual você olha o dia todo só deveria se mover quando está
  lhe dizendo algo.
- **Um agente pode dizer algo antes de terminar.** Até agora, a única coisa que um agente delegado podia
  dizer ao seu planejador era a resposta final: se travasse aos dois minutos, ninguém ficava
  sabendo por vinte. Agora ele pode deixar um bloco `note` enquanto trabalha —travado, mais lento do que o
  esperado, algo que você deveria saber agora— e o app o entrega enquanto a execução continua, direto no
  feed e para quem delegou o trabalho.
- **E fecha com o que realmente fez.** Um bloco `result` que nomeia os arquivos que tocou, o que
  executou para testá-los e o que não conseguiu fazer. A prosa fica; essa é a parte que o planejador lê
  sem ter que interpretá-la, e aparece nos detalhes da execução como três listas curtas.
- **Início é onde você descobre o que está esperando.** Acima dos projetos, duas listas que cruzam
  todos eles: o que está esperando por você —uma delegação parada para aprovação, uma pergunta
  que ninguém respondeu, um cartão que o quadro deixou em *Precisa da sua atenção*— e quem está
  trabalhando agora, em quê e desde quando. Cada linha coloca você onde a coisa está: a thread para uma
  aprovação ou pergunta, o quadro com o cartão aberto para uma tarefa. Ambas desaparecem
  quando não há nada nelas, então um Início tranquilo parece o mesmo de sempre. E o badge que
  marcava o último projeto que você abriu não está mais lá: você está no Início justamente porque não está nele.
  Em seu lugar, cada cartão diz o que está acontecendo lá dentro: "2 trabalhando · 1 aguardando você".
- **Os agentes na mesma tarefa sabem uns dos outros.** Um planejador dividindo o trabalho entre
  dois implementadores os iniciava às cegas: nenhum sabia que o outro estava lá, ambos mexiam nos
  mesmos arquivos e o planejador recebia duas respostas que discordavam. A cada um agora
  é dito quem mais está trabalhando nesta mesma tarefa e o que foi pedido para fazer, e que o que
  outra pessoa tem em mãos é dela para mudar, não seu para sobrescrever. Isso viaja a cada turno,
  como o quadro, porque é o tipo de coisa que muda enquanto você trabalha.
- **Um hook pode escrever para "o chefe" em vez de para alguém pelo nome.** O agente a instruir agora
  oferece o topo da hierarquia —o planejador raiz do projeto, o mesmo agente para quem o
  composer, a CLI e o telefone escrevem por padrão— resolvido quando o hook é acionado em vez de quando é
  salvo, então reorganizar a equipe nunca o deixa apontando para alguém que não está mais no comando.
  Se deixado sem filtro, chega ao chefe de *cada* projeto, o que faz com que um único
  hook programado seja suficiente para todos eles; restrito a um projeto, é o chefe daquele, e um evento que
  um agente causou fica no projeto onde aconteceu.

### Corrigido

- **Você pode ler uma conversa para trás enquanto um agente ainda está escrevendo.** Em um chat,
  cada delta que ele enviava arrastava você de volta para o fundo: rolar para cima para verificar o que ele tinha
  dito há dois minutos era impossível até que terminasse. O chat agora faz o que a thread
  orquestradora já fazia: segue o fundo apenas enquanto você está no fundo, e quando não está, uma pílula no
  canto diz quantas mensagens chegaram e leva você até lá quando quiser. A contagem agora está nos
  três lugares —chat, thread e o feed de comunicação— em vez de um simples "novas mensagens".
- **Um nome de modelo longo não quebra mais a caixa de diálogo de novo chat.** A linha de um participante é formada por
  três dropdowns e uma lixeira em uma grade, e uma coluna de grade não encolhe menos do que
  contém: se você escolhesse um modelo com um nome longo, a linha esticava, o diálogo esticava com
  ela, e os campos de nome e modo acabavam pendurados para fora do cartão. As colunas agora
  podem encolher e o nome é cortado.
- **Uma ferramenta falhando dentro de um agente para de parecer que o app quebrou.** O
  `view_file` do Antigravity falha, o agente tenta de novo e continua, e a conversa mostrava um alarme
  vermelho sobre isso, com a mesma forma que uma falha real tem. Agora é uma linha na atividade da
  execução, em âmbar, com o que o provedor disse a um hover de distância. O vermelho é guardado para
  o que está realmente quebrado. O único caso que vale a pena dizer em voz alta ainda é dito: a
  mesma ferramenta falhando três vezes em uma execução significa que o agente está andando em
  círculos, e isso ganha uma única linha nomeando a ferramenta.
- **Os botões do composer param de se amontoar na caixa.** O botão de enviar não se transforma mais
  em um relógio —enfileirar funciona exatamente como antes, o Enter enfileira enquanto um agente está
  ocupado e o tooltip diz isso— e o clipe desceu para a barra, sozinho à esquerda, com o agente, o
  modelo, as aprovações e a cota reunidos à direita.
- **`ais run` falha quando a tarefa falhou, em qualquer idioma.** Ele decidia seu código de saída procurando
  pelas palavras em espanhol de "CLI not found" no feed —texto que deixou de existir no dia em que essas
  mensagens começaram a sair dos dicionários. Em uma máquina em inglês, uma tarefa que morreu por
  falta de CLI saía com zero, verde para qualquer script que a tivesse chamado. Agora ele lê as execuções.
- **A conversa para de se repintar por inteiro.** A thread e o feed de comunicação desenhavam cada
  mensagem que tinham —três mil por projeto— e nenhuma linha era memorizada, então qualquer coisa
  que tocasse o store redesenhava todas elas. Agora eles desenham o último trecho, com um link no topo
  para caminhar mais para trás que mantém o seu lugar em vez de pular, e as linhas só são redesenhadas
  quando algo delas realmente mudou.
- **Um agente digitando não custa mais caro quanto mais tempo você estiver trabalhando.** Cada delta que
  uma CLI enviava era uma escrita: uma cópia de toda a lista de mensagens para adicionar uma letra ao
  final dela, mais uma cópia do mapa de execuções para a linha crua, mais uma passagem por cada mensagem para
  decidir o que salvar. Por token. Com um histórico longo, isso é trabalho proporcional a tudo o que
  já foi dito, que é exatamente o motivo pelo qual a janela ficava mais pesada conforme o dia passava.
  Os deltas agora são reunidos e aplicados juntos, no máximo a cada 80 ms, e são descarregados na hora
  quando uma execução termina ou é interrompida para que nada chegue atrasado ou falte.
- **Um projeto abre da forma como você o deixou, incluindo a conversa.** Mudar para outro projeto e
  voltar deixava você na thread do orquestrador, mesmo se você estivesse falando em um dos
  chats daquele projeto: a barra lateral pedia o projeto *e nenhum chat*, e isso é exatamente o que
  recebia. Cada projeto agora lembra de sua última conversa, além de sua visualização, e reabrir o app volta
  para ambos. Pedir a thread de propósito ainda lhe dá a thread.
- **Digitar não grava mais no disco a cada tecla.** Cada caractere salvava todos os rascunhos no
  app como JSON, sincronamente, na thread principal —que é exatamente a thread que tem que acompanhar
  a sua digitação. O que você escreve ainda chega no app instantaneamente; o disco fica sabendo disso
  no máximo a cada 400 ms, e imediatamente quando a janela fecha ou perde o foco, para que nada seja perdido.
- **O painel de notificações não abre mais com um tooltip já aparecendo.** Abri-lo movia o
  foco para o primeiro botão de ícone, e um tooltip é mostrado tanto com foco quanto com hover.
- **Um cartão deixado em revisão volta.** O quadro é colocado de volta em sincronia com suas execuções a cada inicialização,
  mas apenas para cartões *Trabalhando*. Um estacionado *Em revisão* por trás de
  uma revisão que morreu com o app —ou cuja execução caiu de um histórico cortado— ficava lá
  para sempre. Ele é lido agora da mesma forma que o fluxo ao vivo o lê: aprovado vai para a lista, mudanças e
  falhas voltam para você, e um cartão que alguém arrastou manualmente ainda é problema apenas dessa pessoa.
- **Um agente em um chat é o mesmo agente que em uma tarefa.** O chat construía seu próprio prompt de
  sistema, em espanhol, sem o bloco `ask` —então um agente com o qual você estava conversando não podia pedir uma
  decisão a você— e com cada skill colada por inteiro em vez de ser apontada no repositório. Os chats passam
  agora pelo mesmo construtor: mesmo perfil, mesmo contexto compartilhado, mesmas skills, mesma forma de
  perguntar, menos o quadro e a delegação, que não têm utilidade para um agente em uma conversa.
- **O app fala o seu idioma até o fim.** A interface estava traduzida e cerca de trinta mensagens
  por baixo dela não: uma execução parada, uma aprovação, uma delegação rejeitada, um hook que
  falhou, os erros que o telefone recebe, o que uma execução interrompida deixa para trás, a CLI que
  não pôde ser instalada. Em uma janela em inglês, todas saíam em espanhol. Agora elas passam pelos mesmos
  dicionários que todo o resto —e uma execução interrompida pela compilação de ontem em outro
  idioma ainda é reconhecida como interrompida hoje.
- **Uma delegação que não nomeia ninguém não trava mais a tarefa.** Um planejador que digitava errado o nome de um agente
  —ou nomeava um que não estava sob ele— ficava esperando por uma equipe que nunca ia chegar, e o seu
  cartão preso em *Trabalhando* até o app ser reiniciado. Agora o erro volta ao planejador com
  os nomes que ele realmente pode usar, para que delegue novamente; sem mais rodadas, a tarefa é fechada como
  precisando de você em vez de fingir que trabalha.
- **Uma execução que nem consegue iniciar fecha o seu cartão.** Com a CLI faltando, a execução dava erro e o
  quadro nunca ficava sabendo.
- **Atingir o teto de rodadas avisa sobre isso.** A tarefa agora é fechada como precisando de você, com o
  teto nos detalhes e a mesma notificação que qualquer falha recebe, em vez de terminar silenciosamente
  como se tivesse acabado.
- **Um planejador que tinha esquecido como delegar.** Enviar as instruções apenas no turno que
  abre uma sessão estava certo para a descrição —o papel, o perfil, o contexto compartilhado, a
  lista de skills— e errado para os dois blocos através dos quais um agente *age*. Uma CLI compacta seu próprio
  contexto conforme uma sessão cresce, e uma vez que o bloco `delegate` tinha sido resumido para fora, o
  planejador não conseguia mais alcançar sua própria equipe: ele ia procurar por uma linha de comando `ainess` e
  uma tool MCP, e acabava pedindo ao usuário que delegasse em seu nome, raciocinando sobre o app
  no qual estava rodando como se pertencesse a outra pessoa. Os blocos `delegate` e `ask` agora vão em cada
  turno. Eles são o protocolo, não o preâmbulo.
- **Um travamento não deixa mais agentes trabalhando nas costas do app.** Fechar o app encerra
  cada processo de agente; um travamento —o gerenciador de tarefas, uma queda de energia, um pânico— nunca
  chega a isso, então as CLIs continuavam: continuavam editando o workspace, continuavam gastando
  cota, sem ninguém lendo a saída delas e com o app que as iniciou já desaparecido. Cada execução
  agora anota o processo por trás dela, e a próxima inicialização os encontra, os para e
  diz isso, em todos os projetos —incluindo aqueles que não carrega na inicialização, cuja contabilidade pode
  esperar, mas seus processos não. Um pid nunca é suficiente para matar: eles são distribuídos novamente, e o dono
  seguinte tem tantas chances de ser seu próprio servidor de desenvolvimento quanto um agente, então
  um processo só é parado quando sua imagem *e* o
  momento em que começou ainda combinam com a execução que o registrou.
- **Cada projeto lembra da visualização em que você o deixou.** O quadro, a conversa e a
  hierarquia eram uma única configuração compartilhada por todos os projetos, então abrir um na
  hierarquia e voltar para outro mostrava a hierarquia lá também. Cada projeto agora guarda a sua —
  através de reinicializações, e reabrir o app retorna para o último projeto onde estava. Clicar em um chat
  ainda é um destino explícito e abre a conversa.
- **O modelo escolhido em uma conversa é lembrado com ela.** Se você escolhesse um, fosse ao quadro e
  voltasse, dizia "modelo padrão" de novo enquanto a caixa logo abaixo ainda guardava o que você tinha
  digitado. Agora é mantido por conversa, junto ao rascunho, incluindo modelo digitado à mão.
- **Um hook em um evento de máquina não pede mais um agente duas vezes.** A ação "instruir um agente"
  ficava sob um filtro que também listava agentes, então o mesmo diálogo tinha dois seletores de
  agentes significando coisas diferentes. Em um evento de máquina —um relógio, a conexão, um arquivo
  que muda— nada do que um agente fez dispara o hook, então filtrar por um só poderia
  significar "nunca disparar": essas opções saíram de lá, deixando o seletor da própria ação
  como o único, e um hook que tinha um recai no projeto daquele agente. O filtro
  também é nomeado pelo que faz agora ("Escuta a").
- **Links na resposta de um agente levavam todo o app para `tauri.localhost`.** Os
  agentes escrevem dois tipos de link e o app os tratava como um só: um endereço da web e um caminho
  dentro do repo em que estão trabalhando (`src/lib/foo.ts`, `README.md`). O segundo não é algo para
  abrir, e se deixado em um `<a href>`, a janela de desktop o seguia —lá se ia para
  `tauri.localhost/src/lib/foo.ts`, com o app desaparecendo debaixo de você. Agora apenas endereços reais são links,
  e abrem no navegador real; um caminho de repo é deixado como texto que você pode ler. Um link `javascript:` ou `data:`
  —que um agente pode escrever, intencionalmente ou não—
  nunca chega a ser um link para começo de conversa.
- **Um agente não conseguia trocar de modelo quando seu pai mandava.** Um planejador nomeando um `model` para
  uma tarefa só era obedecido enquanto "escolher o modelo" estava ligado em Configurações, então com ele desligado —o
  padrão— um implementador que recebeu ordens de tentar novamente em outro modelo porque o seu ficou sem cota era
  silenciosamente iniciado no mesmo modelo esgotado de novo. Um modelo que o pai pede é respeitado de ambas as
  formas agora; essa configuração decide se ao planejador *é dito para escolher* um, não se sua escolha
  conta. E um filho que ficou sem cota não chega mais ao pai como uma parede de erro de CLI: isso é
  dito claramente, com os modelos daquela mesma CLI que ainda valem a pena tentar —a sua própria família
  deixada de fora, já que a cota é gasta por família— e com o lembrete de que uma tarefa pode levar um
  `model`. Quando a CLI não tem outro modelo, é dito ao pai para avisar em vez de tentar novamente.


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
