# Novidades

As versões anteriores à 0.6.0 estão, em inglês, no CHANGELOG do repositório.

## Não publicado

### Novo

- **Um servidor MCP hospedado agora pode receber os cabeçalhos que pede.** O ainess escrevia um
  servidor http na configuração da sessão como um tipo e uma URL e nada mais, então qualquer coisa
  atrás de um token bearer era simplesmente inalcançável: o campo para guardar o token não existia.
  Agora existe: um cabeçalho por linha, `Nome: valor`, num servidor http. O valor é cortado nos
  primeiros dois-pontos e não nos últimos, porque um valor tem dois-pontos próprios (uma URL, uma
  hora, um token em base64) e cortar no fim entrega ao servidor meia credencial — uma falha que
  aparece muito depois, como um erro de autenticação que ninguém rastreia até um sinal de pontuação.
  Escreva `Bearer ${SUA_VARIAVEL}` e o cliente a expande do ambiente na hora de conectar, então o
  segredo nunca entra no arquivo de configuração. O Antigravity também os recebe, via `agy mcp add
  --header`, com a flag e o valor como argumentos separados e nunca uma linha de comando montada
  colando strings. E quando esse comando falha, a saída dele é mostrada a você com a credencial já
  retirada: a mensagem continua nomeando o servidor que falhou, que é a parte que sempre serviu.

### Corrigido

- **Digitar rápido não faz mais o app inteiro trabalhar a cada letra, e um painel que quebra diz o
  que quebrou.** O que você digita pertence à conversa, então vivia no store — e era escrito lá a
  cada tecla. O store roda o seletor de cada assinante a cada escrita, então cada caractere refazia
  os seletores de todas as telas montadas e re-renderizava o que eles alimentavam. Agora a caixa é
  local e o store é escrito por trás: com debounce enquanto você digita, e na hora quando há algo
  que não pode se perder — uma caixa esvaziada, uma troca de conversa, sair da tela. À parte: o app
  não tinha nenhum error boundary em lugar nenhum, então um erro de render levava a janela inteira
  junto, sem mensagem e sem nada no log, porque o que teria anotado também morria. Agora o fio e a
  caixa são cada um o seu próprio limite. Um painel que estoura mantém a falha dentro de si, mostra
  o erro e escreve o stack no log — que é a diferença entre um bug que dá para reportar e um que só
  dá para descrever como uma tela que ficou preta.

- **A caixa vazia não desenha mais duas frases na mesma linha de espaço.** A sugestão cinza é
  pintada na camada atrás do textarea, que carrega o mesmo padding dele para ficar alinhada com o
  que você digita — e uma caixa vazia começa exatamente nesse ponto, que é onde fica o placeholder.
  Então, quando a última mensagem do agente terminava numa pergunta fechada e você ainda não tinha
  escrito nada, "Sí, dale" e "Escribí mientras trabaja…" eram impressos um sobre o outro e não dava
  para ler nenhum. Agora o lugar fica com a sugestão: é o trabalho do próprio placeholder — dizer a
  uma caixa vazia o que fazer consigo — feito com a conversa em mãos em vez de em geral. A dica
  rotativa sai de cena pelo mesmo motivo e no mesmo lugar.

## 0.13.0 — 2026-09-10

### Novo

- **Um agente novo nasce aprovando automaticamente as próprias ferramentas, e a CLI ainda pode
  dizer o contrário.** O ainess lança essas CLIs headless: não há ninguém sentado na frente do
  processo para responder. Um agente criado com a permissão retida era lançado com
  `--permission-mode acceptEdits`, então perguntava antes de qualquer coisa que não fosse editar e
  ficava ali esperando até alguém perceber — o que se lê igual à aprovação de delegações, com a
  qual não tem nada a ver. Agora agentes novos começam com isso ligado, no diálogo e no `ainess
  agents add`, e o switch diz em uma linha o que isso significa. Nada do que já estava salvo é
  tocado: ligar uma permissão num agente que alguém configurou não é um padrão, é uma mudança que
  essa pessoa não pediu, e editar um agente continua deixando cada ajuste que a edição não nomeou
  exatamente onde estava. No mesmo movimento a CLI ganhou `--no-auto-approve`, porque uma flag
  booleana não tem desligado — `--auto-approve=false` é recusado de cara — e o dia em que o padrão
  virou foi o dia em que um script deixou de poder montar uma equipe com as ferramentas retidas.
  Passando as duas de uma vez, ganha o desligado: entre duas leituras de um comando que se
  contradiz, a que concede menos.

- **Aprovar e responder pelo Telegram, Discord e Slack apertando um botão.** Tudo o que a ponte
  sabia fazer tinha que ser digitado, e as duas coisas que de fato esperam por você tinham que ser
  digitadas com um id copiado da mensagem acima: `/approve 3f2a1b2c`. No celular essa é a diferença
  entre responder e não responder. Agora uma delegação esperando aprovação chega com um sim e um
  não embaixo, e uma pergunta chega com um botão por opção. As três plataformas entregam o toque
  pela conexão que já mantêm aberta — Telegram junto com seus updates, Discord pelo Gateway, Slack
  por Socket Mode — então nada é exposto e nenhum endereço seu vai para lugar nenhum. O toque entra
  pela mesma porta que uma mensagem digitada, e isso é de propósito: a lista de permitidos é
  verificada em um único lugar e um botão não é um jeito de contorná-la. Nada no toque é acreditado
  tampouco: o id precisa continuar pendente e a opção precisa ser uma que a pergunta realmente
  tenha, então um botão velho numa mensagem de ontem não decide nada uma segunda vez. Uma pergunta
  que aceita várias respostas não leva botões, porque um toque é uma opção e essa é uma resposta
  diferente da que está sendo pedida; essas continuam digitadas, e a mensagem diz isso.

- **A tela inicial agora começa o trabalho em vez de listá-lo.** Era um painel: cada projeto como
  uma linha, o que esperava por você, o que estava rodando. Tudo isso já vive em algum lugar que lhe
  cabe — a barra lateral tem os projetos e o botão de criar um, o painel de cima continua mostrando
  o que está retido esperando aprovação, o sininho e a barra de tarefas avisam quando algo quer
  resposta — então aqui havia uma segunda cópia disso, justamente no único lugar onde o que você não
  pode fazer em nenhum outro é começar. Agora é uma caixa, no meio, e nada acima: você escreve o que
  quer, escolhe a pasta e escolhe uma das suas equipes, e o projeto é criado e o prompt sai. Se a
  pasta já for um projeto, vai direto para lá, com a equipe dele — dois projetos no mesmo workspace
  seriam duas equipes editando os mesmos arquivos sem saber uma da outra, e uma mesma pasta escrita
  de três formas continua sendo uma só. Ela não inventa equipe: sem nenhuma salva, aponta para onde
  se criam, e uma equipe sem agente raiz é dita em voz alta em vez de o prompt ir para o primeiro
  agente que aparecer. Embaixo da caixa, o único número que nenhuma outra tela soma entre projetos:
  quanto custou a última quinzena em tarefas, tokens e dólares. Nada disso é estimado — um CLI que
  não reporta consumo conta como execução e zero tokens, e uma quinzena em que nenhum reportou diz
  isso em vez de desenhar uma linha plana.

### Corrigido

- **`ainess agents edit` não desfaz mais em silêncio uma permissão que você tinha definido.** Todo
  editor entrega ao store um agente inteiro e o store o põe no lugar do antigo, então um campo que
  esse editor não construiu dentro do objeto não fica intacto: some. A CLI monta esse objeto com as
  suas próprias flags, e não tem flag para o override de aprovação de delegações, nem para o
  worktree, nem para a repetição por cota. Por isso `ainess agents edit Impl --model x` devolvia um
  agente marcado como "nunca pedir" a seguir o ajuste global, e com esse ajuste ligado ele voltava a
  pedir aprovação na delegação seguinte. Agora uma edição se apoia sobre o agente que já estava: o
  que ela nomeia vence, o que não nomeia é preservado. E nomear conta mesmo quando o valor é "seguir
  o ajuste global", que viaja como nada e precisa poder apagar um "nunca".

- **Um chat não fica mais em branco quando você manda uma mensagem nele.** Carregar uma conversa é
  ler um arquivo, e ler um arquivo leva tempo. Dentro dessa janela três coisas diferentes davam
  errado e as três terminavam igual: o histórico sumido até você sair do chat e voltar, o que
  refazia a leitura. Uma mensagem enviada enquanto a leitura estava em voo era sobrescrita por um
  arquivo escrito antes de ela existir — agora a memória ganha, e o que chegou durante a leitura é
  preservado. Uma leitura que falhava escapava do carregador em vez de ser capturada, deixando o
  chat sem nada na memória; ela pode falhar por algo banal, como cair no momento em que esse mesmo
  arquivo está sendo escrito. E um recarregamento cobria com três esqueletos cinzas um histórico
  que estava bem ali, o que se lê como a conversa ter se perdido.

## 0.12.0 — 2026-09-10

### Novo

- **As mensagens enfileiradas enquanto um agente trabalha vão todas juntas, como uma só.** Antes
  saíam em fila: a primeira quando o turno terminava, e a segunda esperando *aquele* turno
  terminar. Três linhas escritas de uma vez viravam três turnos — três execuções, três cartões no
  quadro, e um agente agindo sobre a primeira antes de ter lido a correção da terceira. Agora são
  entregues como um único prompt, na ordem em que você escreveu e sem nada acrescentado: uma linha
  em branco entre elas, como se você tivesse digitado assim. "Enviar agora" faz o mesmo, então
  cortar um turno para entregar uma de três já não são três turnos; é um botão para o bloco em vez
  de um por linha, e cada linha ainda pode ser retirada sozinha antes de sair.

- **Só o que o agente está fazendo agora, em uma linha.** Um agente trabalhando escreve uma linha
  para cada ferramenta que usa, e uma execução longa escreve centenas: o chat enchia com o que ele
  já tinha terminado e a única linha que valia a pena ler — o que está fazendo *agora* — ficava
  enterrada mais acima. Agora os passos passam por uma faixa. Ela tem uma linha de altura e o
  overflow oculto, então o passo que terminou sai por cima enquanto o novo entra por baixo. O
  movimento é o ponto: uma linha que troca o texto no lugar parece igual tenha mudado uma vez ou
  quarenta, e "isso ainda está rodando?" era exatamente a pergunta que uma parede de texto parado
  provocava. Ao clicar nela o histórico abre acima; clique de novo na mesma linha e ele fecha. Três
  coisas nunca são dobradas: o texto do próprio agente, um erro, e o cartão de um agente para quem
  ele delegou. Esse cartão carrega a aprovação que alguém precisa responder, e um chat arrumado não
  vale escondê-la.

- **A caixa termina a sua frase, e o Tab aceita.** Duas coisas, ambas resolvidas na sua máquina e
  nenhuma delas enviada a lugar nenhum. Com a caixa vazia e a última mensagem do agente terminando
  numa pergunta fechada, a resposta aparece em cinza: o Tab pega, o Enter manda. Com algo escrito,
  completa com o que você já escreveu antes nessa mesma conversa — a última forma como você disse,
  oferecida de novo desde as primeiras letras. Uma pergunta que pede uma escolha em vez de um sim não
  recebe nada, porque «sim» é a resposta errada para «qual?»; a lista de palavras que decide isso foi
  feita para errar para o lado do silêncio. Nada de outro projeto aparece aqui, a mesma regra do
  contexto compartilhado. O Tab só age depois que o menu de `@`/`#`/`/` e um bloco ``` disseram o que
  tinham a dizer, e o Enter fica intacto: aceitar e enviar continuam sendo duas decisões.

- **O botão da barra de tarefas pisca quando algo espera a sua resposta.** Uma aprovação ou uma
  pergunta deixam um agente parado até você voltar, e até agora a única forma de saber era estar
  olhando. Pisca só enquanto a janela não é a que está na frente, e essa verificação é feita do lado
  da janela em vez de ser perguntada e depois agida: entre uma coisa e outra o usuário pode clicar
  de volta, e uma barra piscando para alguém que já está olhando a janela é pior que nenhuma. Só
  essas duas: uma tarefa que terminou é notícia, não um agente parado.

- **A barra lateral marca um projeto que está rodando sozinho.** Uma lua ao lado do nome enquanto o
  modo autônomo está ligado. Já era coisa de cada projeto — a chave liga só naquele — mas o único
  lugar que dizia isso ficava dentro do projeto, o que não serve justamente para aquele que você não
  está olhando.

### Corrigido

- **Um turno que pergunta três coisas é respondido uma vez só.** Um agente pode fazer várias
  perguntas de uma vez, e cada resposta retomava a execução dele por conta própria: três execuções
  de um único turno, três cartões no quadro, três agentes no mesmo workspace, por perguntas que você
  respondeu de uma sentada. Agora elas vêm como grupo — uma aba por pergunta, um tique nas que você
  já resolveu, e um único botão que fica desabilitado enquanto faltar alguma. O que volta é uma
  única mensagem com cada pergunta e a sua resposta, porque a segunda resposta não serve de nada ao
  agente sem a pergunta a que pertence. Perguntas de outra execução esperam a sua vez em vez de
  entrar no grupo.

- **Uma execução esperando cota para de se relançar para sempre.** As execuções em espera são
  retomadas quando a cota volta, e um dos momentos em que isso é checado é «acabou de terminar a
  última execução» — então um relançamento que ficava sem cota de novo voltava para a espera, era
  checado de novo e lançado de novo, tão rápido quanto o CLI conseguisse falhar, escrevendo uma
  mensagem no fio a cada volta. Duas coisas estavam erradas. A contagem de quantas tentativas aquele
  trabalho já tinha ficava na entrada em espera, e a entrada era justamente apagada para relançá-lo,
  então toda tentativa se lia como a primeira. E um provedor que informa estar esgotado sem dizer
  quanto havia — o Antigravity, cujos pools só dizem «agotado» e uma hora de reset — saía do resumo
  como «sei lá», o que qualquer um perguntando «a cota voltou?» lê como um sim. Agora são três
  tentativas, e depois ele avisa e espera por você.

- **O app para de ficar lento enquanto um agente trabalha.** Cada linha que um CLI imprimia era
  anexada à sua execução no store, doze vezes por segundo durante toda a execução. Oito telas se
  inscrevem no mapa de execuções — a caixa onde você escreve entre elas — então todas se redesenhavam
  nesse ritmo, por um buffer que nada na tela estava lendo: essas linhas cruas só aparecem numa
  janela, e só se você abri-la. Agora ficam guardadas à parte e são escritas na execução uma vez só,
  quando ela termina, então as execuções param de se mexer enquanto uma está em curso. A janela
  continua acompanhando ao vivo, e um travamento no meio de uma execução ainda deixa o log em disco.
  Mais duas de quebra: um flush sem texto parou de reescrever o fio para devolvê-lo igual, e os nós
  da hierarquia pararam de se redesenhar a cada delta — agora cada um observa a última ferramenta do
  seu próprio agente, que não muda entre uma chamada e outra.

- **Um projeto que estava trabalhando quando o app reiniciou avisa.** Você atualizava o app no meio
  de uma delegação, abria de novo, ia para a hierarquia e parecia um projeto onde nunca tinha
  acontecido nada: todos os agentes ociosos, sem nada a dizer. As execuções voltavam do disco desde
  sempre e o fio as mostrava; o que a hierarquia lê é o runtime por agente, e um reinício monta isso
  só com a equipe. Agora cada agente volta com a tarefa em que foi cortado, marcado como parado —
  nada falhou, o app é que foi embora. Um agente que este processo já colocou para trabalhar fica
  intocado: a restauração é assíncrona, e a tarefa de uma execução morta em cima de uma viva
  descreveria outra coisa.

- **O dock da direita é do projeto em que você está.** Você abria o painel de terminais num projeto
  e ia para outro, e ele continuava aberto lá também — em cima de uma barra de abas vazia, porque os
  terminais eram do primeiro. Agora os três painéis são lembrados por projeto: guardados quando você
  sai, trazidos de volta quando você volta, e fechados para um projeto que nunca os abriu.


## 0.11.0 — 2026-09-10

### Novo

- **As três visões de um projeto são linhas da barra lateral.** Orquestrador, Tarefas e Hierarquia
  eram um seletor na barra de cima — a única faixa que também precisa segurar o nome do projeto, o
  branch, o gasto, a chave do modo autônomo e todos os botões de painel. São navegação, e navegação
  mora na coluna da esquerda. Cada linha abre a visão que nomeia, em vez de deixar você onde o
  projeto tinha ficado.

- **Os comandos rápidos podem ser seus.** Ao lado dos scripts detectados há agora um lugar para
  adicionar os que nenhum arquivo declara: a linha do docker compose, o túnel, a migração que só
  este projeto precisa. Ficam no projeto e aparecem no topo do menu.

- **A barra da janela avisa quando um canal de conversa está conectado.** Ao lado do telefone, uma
  luz para Telegram, Discord ou Slack assim que um estiver de fato no ar — a pergunta para a qual
  você teria que abrir as Configurações. Não é um interruptor: ligar um canal pede um token e uma
  lista de quem pode falar.

- **O painel de terminais oferece os scripts do projeto como botões.** Subir o servidor de
  desenvolvimento era abrir um terminal e digitar o que o projeto já tem escrito. Agora o painel lê
  isso: os `scripts` de um package.json, os alvos de um Makefile e os quatro de sempre do cargo. Um
  botão para cada, com os mais usados na frente — dev, start, build, test. Cada um abre a sua própria
  aba, com o nome do script em vez de «PowerShell 3», então a aba do servidor é uma que dá para achar
  de novo. Se você apertar um script que já está rodando, ele te leva até lá em vez de iniciar um
  segundo que perde a disputa pela porta; um ponto verde marca os que estão no ar. O gerenciador de
  pacotes vem do lockfile, porque `npm run` num workspace pnpm resolve outra árvore. Um script cujo
  nome não seja um nome simples não é oferecido: estes textos são digitados num shell de verdade,
  onde `predev && curl x | sh` rodaria exatamente como está escrito.

- **O grafo de dependências se pede a partir de uma tarefa, e mostra só a família dela.** Antes era
  uma segunda visão do quadro inteiro e desenhava todas as cadeias do projeto lado a lado: ficava
  mais largo que a janela, e a resposta para «com o que esta aqui está enrolada?» se perdia no meio.
  Agora abre a partir da própria tarefa, e na tela está o que essa tarefa espera e o que a espera,
  transitivamente — nada mais. Uma tarefa que apenas compartilha um pré-requisito é irmã, não
  família, e fica de fora; as irmãs são o que tornava o antigo ilegível. Clicar num cartão muda o
  grafo para ele, dá para seguir uma cadeia um passo de cada vez. As arquivadas vêm junto: um
  pré-requisito arquivado continua sendo o motivo pelo qual algo abaixo não pode começar.

- **Voltar a conversa atrás, ou reescrever o que você perguntou.** Botão direito em qualquer
  mensagem de um chat e a conversa pode terminar ali; nas suas, dá também para editar e perguntar de
  novo a partir dali. O que veio depois vai embora, e a sessão do agente também: o fio que você vê é
  metade de uma conversa, a memória do agente é a outra metade, e deixá-la com o que você acabou de
  tirar faria o fio mentir sobre em cima do que a próxima resposta é construída. A janela diz isso
  antes do botão, não depois. Voltar até a última mensagem fica cinza, porque não levaria nada.

- **Modo autônomo, com hora para se desligar.** Um botão na barra do projeto liga por 1, 2, 4, 8 ou
  12 horas. Enquanto está ligado o projeto não espera por você: as delegações que pediriam a sua
  aprovação são aprovadas, as perguntas se respondem sozinhas pelo caminho mais conservador, e o
  limite de rodadas deixa de encerrar a tarefa. Não existe o modo «para sempre»: ele se desliga
  sozinho na hora que você marcou, e parar na mão continua parando. O teto de gasto do projeto vale
  igual a antes; esse é o freio. E uma tarefa que só faz perguntar não come a noite inteira: depois
  de dez respostas automáticas, as perguntas voltam a esperar por você. Quando termina, o relatório
  fica no fio: o que terminou, o que falhou, o que aprovou e o que respondeu sem você.

- **Retentar quando a cota volta.** Uma execução que morria porque o modelo ficou sem cota deixava o
  trabalho pela metade até você voltar e apertar retentar na mão. Cada agente tem agora a sua
  caixinha: sem cota, a execução espera em vez de falhar e se relança sozinha com o mesmo prompt
  assim que o provedor tem lugar de novo. No modo autônomo acontece com ou sem a caixinha. Se quando
  a cota voltar a caixinha estiver desligada, ou o modo autônomo já tiver acabado, nada é relançado
  — e isso fica dito, em vez de ficar calado.

- **Slack também, e com isso são os três.** Telegram, Discord e Slack, os mesmos comandos naquele
  que você já tiver aberto, cada um com o seu cartão nas Configurações e a sua própria lista de
  chats — um chat autorizado num está autorizado só nesse. O Slack pede dois tokens em vez de um: o de
  aplicação abre a conexão e o de bot escreve, que é como o Slack projetou e não nós, e a tela diz
  qual é qual. O Socket Mode precisa estar ligado no seu app do Slack e o bot precisa estar
  convidado para o canal; a tela também avisa, porque senão não chega nada e daqui não haveria como
  explicar por quê.

- **Discord, ao lado do Telegram.** Os mesmos comandos naquele dos dois que você já tiver aberto:
  qualquer coisa que escrever começa uma tarefa, `/status` diz quem está trabalhando, `/approve` e
  `/answer` resolvem o que precisa de você. As Configurações agora têm um cartão por canal. Nenhum
  dos dois expõe nada — o app é quem sai, então continua sem túnel, sem porta e sem endereço para
  achar. Cada canal autoriza os seus próprios chats e só os seus: um id de canal do Discord não fica
  autorizado por estar na lista do Telegram. O seu bot precisa da intent de conteúdo de mensagens
  ligada no portal de desenvolvedores do Discord, e a tela avisa, porque sem isso as mensagens
  chegam vazias e daqui não haveria como saber por quê.

- **Abrir o pull request daqui.** Um agente termina na sua branch e o último passo era seu, na mão.
  Agora há um botão ao lado de pull e push, e no cartão concluído. Ele nunca abre um com um clique
  só: um diálogo mostra qual branch vai contra qual, com o título e o corpo já escritos a partir da
  tarefa e do que o agente reportou — os arquivos que tocou, o que verificou, e o que não conseguiu
  fazer, que entra com um cabeçalho próprio em vez de ficar de fora. Na branch padrão ele recusa, e
  numa branch sem push ele oferece dar push antes, em vez de fazer isso pelas suas costas.

- **Tentar de novo uma tarefa com outro modelo, ou com outro agente.** Uma execução que deu errado,
  ou cujo agente ficou sem cota no meio do caminho, deixava você redigitando tudo. Agora o menu da
  execução — e o botão no cartão dela — oferecem relançá-la com o mesmo prompt e com quem você
  escolher. Ela começa do zero em vez de continuar a execução que falhou, porque o contexto dessa
  costuma ser o problema. Trocar de agente limpa o modelo: os modelos de um provedor não são os de
  outro, e arrastar um é como se manda uma execução para um modelo que não existe.

- **Solte arquivos na caixa.** O clipe e o Ctrl+V eram as duas formas de anexar; arrastar um
  arquivo da pasta que você já tinha aberta é a terceira, e a que não faz você dar volta nenhuma. A
  caixa se marca com um contorno quando passa por cima dela um arraste trazendo arquivos, e o que
  você já tinha escrito vai junto. Um cartão do quadro que cruze a caminho de outra coluna fica
  intocado — ele leva texto, não arquivos, e pegá-lo não o moveria para lugar nenhum.

### Corrigido

- **Um detalhe longo já não empurra todo o resto para fora do modal.** Um agente escreve o quanto
  quiser, e o detalhe fica entre os campos de estado e as dependências e a execução. Agora vem
  dobrado em poucas linhas, com um «Ver mais» que o abre. Se o botão é necessário se mede, não se
  adivinha pelo tamanho do texto: quantas linhas um parágrafo ocupa depende da largura que recebe.

- **Os scripts do projeto são um menu e não uma fila com rolagem.** Uma fila de botões num painel já
  estreito significava uma barra de rolagem horizontal, e um projeto com vinte scripts escondia
  dezenove atrás dela. Agora são um menu ao lado do «+», com a mesma forma do seletor de console.

- **A barra de cima deixa de dizer quantos agentes estão trabalhando.** O ponto ao lado do projeto na
  barra lateral já respira enquanto eles estão, no lugar para onde você olha para ver o que acontece.

- **O botão do modo autônomo tem a forma dos botões ao redor.** Ele carregava o próprio preenchimento
  âmbar para ser impossível de não ver. Não precisava: a faixa embaixo da barra é a barulhenta, ocupa
  toda a largura, e só existe enquanto o modo está ligado.

- **O painel de comunicação é um balão de fala.** O ícone dele descrevia onde o painel abre, que é a
  coisa menos interessante a seu respeito. O que ele guarda é o que os agentes disseram uns aos
  outros.

- **A barra do quadro fica alinhada.** Um Button, um Input e um SelectTrigger não concordam por
  padrão no arredondamento, então uma fila feita dos três saía com dois raios lado a lado. Agora tudo
  tem uma altura só e um arredondamento só, dito em cada controle em vez de deixado aos padrões.

- **Responder uma pergunta é uma lista que você marca e um botão que você aperta.** As opções eram
  botões em linha, cada um da largura do próprio texto, então um conjunto ficava desalinhado e uma
  opção de uma palavra era um alvo do tamanho da palavra. Agora são uma lista, uma por linha, na
  largura da caixa. Uma pergunta que aceita várias respostas avisa, em vez de você descobrir
  clicando duas vezes. E uma pergunta de resposta única não vai mais embora assim que você toca numa
  opção: as duas esperam «Responder», então o que está para ser dito fica na tela antes de ser dito
  — e um clique errado é um clique a mais para desfazer, não algo já enviado. Nas de resposta única,
  a opção e o campo para escrever a sua se substituem, porque uma resposta não pode ser também uma
  frase diferente.

- **Os botões no pé de uma tarefa se organizam pelo que fazem.** Três botões soltos sob uma regra de
  «espalhe-os» deixavam «arquivar» encalhado no meio, à mesma distância de um link que leva embora e
  de um apagar que não volta. Ir para outro lugar agora fica à esquerda, e o que muda a tarefa fica à
  direita, junto.

- **O quadro perdeu o alternador de visão e recuperou «Nova tarefa» onde ela pertence.** Como o grafo
  já não é uma segunda visão do quadro, não sobrou nada entre o que alternar, então as duas barras
  viraram uma: a busca, o filtro, a contagem, e no fim «Revisar», «Copiar como markdown» e «Nova
  tarefa» lado a lado.

- **A cota do Antigravity diz por que é uma estimativa.** O anel dele mostra um traço onde todos os
  outros provedores mostram um número, e um traço sem explicação ao lado parece coisa quebrada. Não
  está: o Antigravity não informa quanto resta. O número exato existe — o CLI dele pede ao Google —
  mas está atrás de uma licença paga do Code Assist, e a uma conta sem ela é negado. Então agora o
  app diz isso, ao lado do traço, no popover do campo de escrita, na tela do agente e nas
  configurações, em vez de deixar você adivinhando. O que aparece continua sendo inferido do «quota
  reached, resets in 1h45m» com que as execuções voltam, que é a única coisa que há para ler.

- **O anel e a barra de cota se enchem conforme ela é gasta.** Eles se enchiam com o que *sobrava*:
  uma cota intacta era um anel cheio e uma quase esgotada estava quase vazia — o contrário de
  qualquer medidor de algo que se consome, e o motivo de ninguém conseguir lê-los de relance. Agora
  começam vazios e se enchem com o que foi gasto, e todos os números ao lado contam a mesma coisa:
  «83%» é o que se foi, não o que resta. A cor continua olhando o que sobra, então um anel quase
  cheio também está vermelho: as duas metades dizem «está acabando» no mesmo momento, em vez de uma
  delas dizer tarde.

- **Um passo diz o que fez sem esperar pelo navegador.** Cada linha da atividade de um agente está
  cortada — uma ferramenta mostra o seu resumo, uma delegação noventa caracteres da tarefa — e a
  única forma de ler o resto era o `title` que o navegador desenha: um segundo de espera, uma
  caixinha pelada onde o ponteiro calhou de estar, e as quebras de linha achatadas em espaços, que é
  justamente o que você não quer num comando ou num stack trace. Agora têm o tooltip do app,
  ancorado na sua linha, em monoespaçada e com as quebras de linha intactas. O passo em que a
  execução está também tem um, e antes não tinha nada.

- **Um agente já não sabe de um projeto sobre o qual ninguém lhe falou.** O contexto compartilhado
  era um único texto na tela de ajustes, e era colado no prompt de todos os agentes de todos os
  projetos. Você escrevia algo sobre um repositório e todos os agentes, em todo lugar, tinham lido:
  foi assim que uma mensagem dirigida a um projeto foi entendida, seguida e levada para outro. Agora
  ele é de cada projeto: a tela de ajustes escolhe qual, e `ainess context` aceita `-p`/`-w` como o
  resto do CLI. O que você tinha escrito é copiado para cada projeto que já existia, então nada se
  perde; se aquele texto era de um só, os outros são agora o lugar onde apagá-lo.

- **Um hook começa com uma mensagem sobre o evento que você escolheu.** Havia um único texto padrão
  atrás dos dezessete, escrito para «um agente terminou» e preso ao espanhol. Um hook de «caiu a
  internet» começava anunciando que um agente tinha terminado, para todo mundo, num idioma que a
  maioria não escolheu. Agora cada evento começa com a sua própria linha, no seu idioma, com as
  variáveis que aquele evento realmente traz: a pergunta quando alguém pergunta, o modelo quando a
  cota acaba, os dois agentes quando há uma delegação. Se você trocar o evento antes de mexer na
  mensagem, ela acompanha; se mexer, ela para de acompanhar, porque dali em diante é sua. O botão
  de testar também preenche as variáveis no seu idioma, então a prévia é a mensagem que vai chegar.

- **O app deixa de carregar seis idiomas que não está mostrando para você.** Os sete dicionários
  vinham no mesmo bundle, então cada início pagava pelos seis que ninguém estava lendo: 575 kB, 179
  comprimidos. Agora só o espanhol vem embutido — é a base para a qual todos os outros caem — e o
  seu é buscado antes da primeira pintura e fica carregado. Esse pedaço passou de 575 kB para 83 kB,
  e de 179 comprimidos para 27.

- **Um agente que responde a uma pergunta num chat já não pode distribuir trabalho.** O turno que
  leva a sua resposta começava sem que lhe dissessem que era de um chat, então era lido como uma
  tarefa: os seus blocos `delegate` eram interpretados e executados. Um agente podia pôr outros a
  trabalhar de dentro de uma conversa onde ninguém tinha pedido.

- **O quadro também rola para baixo enquanto você arrasta.** Uma coluna mais alta que a tela tinha
  o mesmo problema que o quadro tinha na horizontal: o cartão sob o qual você queria soltar estava
  fora de vista. Agora a coluna sob o ponteiro também puxa, com a mesma rampa.

- **Acabaram as janelas de console que um agente abria enquanto trabalhava.** A tentativa anterior
  consertou a metade errada. Pedir um processo sem console funciona para aquele processo — e depois
  cada programa de console que *ele* roda pede uma ao Windows, recebe uma nova, e essa aparece. As
  janelas nunca foram nossas: eram dos programas que os nossos agentes estavam rodando. Agora o app
  toma um único console para si ao iniciar e o esconde, e tudo abaixo herda esse em vez de pedir o
  seu próprio, por mais fundo que vá.

- **Um link para um arquivo numa resposta agora faz alguma coisa.** Um agente que escrevia
  `[o arquivo](file:///C:/Users/voce/notas.txt)` desenhava um texto cinza morto: `file:` estava na
  mesma lista de recusados que `javascript:` e `data:`, que de fato executam na página, e tinha
  ficado ali por associação — ele não executa nada. Agora clicar nele mostra o arquivo no
  gerenciador de arquivos e para por aí. Nunca vira um link de verdade nem é entregue ao sistema
  para abrir, porque `[olha isso](file:///C:/x.exe)` é uma linha que qualquer agente pode
  escrever.

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
