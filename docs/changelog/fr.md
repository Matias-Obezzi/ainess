# Nouveautés

Les versions antérieures à la 0.6.0 sont dans le CHANGELOG du dépôt, en anglais.

## Non publié

### Nouveau

- **Le panneau des terminaux propose les scripts du projet en boutons.** Lancer le serveur de
  développement, c'était ouvrir un terminal et taper ce que le projet a déjà écrit quelque part. Le
  panneau le lit maintenant : les `scripts` d'un package.json, les cibles d'un Makefile, et les
  quatre habituelles de cargo. Un bouton chacun, les plus courants en tête — dev, start, build,
  test. Chacun ouvre son propre onglet, nommé d'après le script et non « PowerShell 3 », pour que
  l'onglet du serveur se retrouve. Appuyez sur un script déjà lancé et il vous y emmène au lieu d'en
  démarrer un second qui perdra la course au port ; un point vert marque ceux qui tournent. Le
  gestionnaire de paquets vient du fichier de verrouillage, car `npm run` dans un espace de travail
  pnpm résout un autre arbre. Un script dont le nom n'est pas un nom simple n'est pas proposé du
  tout : ces chaînes sont tapées dans un vrai shell, où `predev && curl x | sh` s'exécuterait tel
  quel.

- **Le graphe de dépendances se demande depuis une tâche, et n'affiche que sa famille.** C'était
  auparavant une seconde vue du tableau entier, dessinant côte à côte toutes les chaînes du projet :
  il devenait plus large que la fenêtre, et la réponse à « avec quoi celle-ci est-elle emmêlée ? »
  se perdait au milieu. Il s'ouvre maintenant depuis la tâche elle-même, et à l'écran il y a ce que
  cette tâche attend et ce qui l'attend, de façon transitive — rien d'autre. Une tâche qui partage
  seulement un prérequis est une sœur, pas de la famille, et reste dehors ; ce sont les sœurs qui
  rendaient l'ancien illisible. Cliquer sur une carte y déplace le graphe, pour suivre une chaîne
  pas à pas. Les archivées viennent aussi : un prérequis archivé reste la raison pour laquelle ce
  qui est en dessous ne peut pas démarrer.

- **Revenir en arrière dans une conversation, ou réécrire ce que vous avez demandé.** Clic droit
  sur n'importe quel message d'une discussion et la conversation peut s'arrêter là ; sur les vôtres,
  vous pouvez aussi le modifier et redemander à partir de ce point. Ce qui suivait s'en va, et la
  session de l'agent aussi : le fil visible n'est que la moitié d'une conversation, la mémoire de
  l'agent est l'autre, et la lui laisser avec ce que vous venez de retirer ferait mentir le fil sur
  ce qui fonde la réponse suivante. La boîte de dialogue le dit avant le bouton, pas après. Revenir
  au dernier message est grisé, puisque cela n'emporterait rien.

- **Mode autonome, avec une heure d'extinction.** Un bouton dans la barre du projet l'active pour 1,
  2, 4, 8 ou 12 heures. Tant qu'il tourne, le projet ne vous attend plus : les délégations qui
  demanderaient votre accord sont approuvées, les questions reçoivent d'elles-mêmes la réponse la
  plus prudente, et le plafond de tours ne referme plus la tâche. Il n'y a pas de « pour toujours »
  : il s'éteint tout seul à l'heure fixée, et un arrêt à la main arrête toujours. Le plafond de
  dépense du projet vaut comme avant ; c'est lui, le frein. Et une tâche qui ne fait que poser des
  questions ne mange pas la nuit entière : après dix réponses automatiques, les questions vous
  attendent de nouveau. À la fin, le rapport reste dans le fil : ce qui s'est terminé, ce qui a
  échoué, ce qui a été approuvé et répondu sans vous.

- **Relancer quand le quota revient.** Un run qui mourait parce que son modèle était à sec laissait
  le travail en plan jusqu'à ce que vous reveniez cliquer sur relancer. Chaque agent a maintenant sa
  case : à court de quota, le run attend au lieu d'échouer, et repart tout seul avec le même prompt
  dès que le fournisseur a de la place. En mode autonome, cela arrive avec ou sans la case. Si la
  case est décochée ou le mode autonome terminé quand le quota revient, rien n'est relancé — et
  c'est écrit, plutôt que passé sous silence.

- **Slack aussi, et cela fait les trois.** Telegram, Discord et Slack, les mêmes commandes dans
  celui que vous avez déjà ouvert, chacun avec sa carte dans les réglages et sa propre liste de
  conversations — une conversation autorisée sur l'un ne l'est que sur celui-là. Slack demande deux
  jetons plutôt qu'un : celui au niveau de l'application ouvre la connexion, celui du bot écrit.
  C'est la conception de Slack, pas la nôtre, et l'écran dit lequel est lequel. Le Socket Mode doit
  être activé dans votre application Slack et le bot invité dans le salon ; l'écran le dit aussi,
  car sinon rien n'arrive et rien ici ne pourrait vous en donner la raison.

- **Discord, à côté de Telegram.** Les mêmes commandes dans celui des deux que vous avez déjà
  ouvert : ce que vous écrivez lance une tâche, `/status` dit qui travaille, `/approve` et
  `/answer` règlent ce qui vous attend. Les réglages ont désormais une carte par canal. Ni l'un ni
  l'autre n'expose quoi que ce soit — c'est l'application qui sort, il n'y a toujours ni tunnel, ni
  port, ni adresse à trouver. Chaque canal autorise ses propres conversations et seulement les
  siennes : un identifiant de salon Discord n'est pas autorisé parce qu'il figure sur la liste de
  Telegram. Votre bot a besoin de l'intent de contenu des messages activé dans le portail
  développeur de Discord, et l'écran le dit : sans lui les messages arrivent vides et rien ici ne
  pourrait vous expliquer pourquoi.

- **Ouvrir la pull request depuis ici.** Un agent termine sur sa branche et la dernière étape était
  à vous, à la main. Il y a désormais un bouton à côté de pull et push, et sur la carte terminée. Il
  n'en ouvre jamais une d'un seul clic : une boîte de dialogue montre quelle branche va contre
  laquelle, avec le titre et le corps déjà rédigés depuis la tâche et depuis ce que l'agent a
  rapporté — les fichiers touchés, ce qu'il a vérifié, et ce qu'il n'a pas pu faire, qui apparaît
  sous son propre titre au lieu d'être omis. Sur la branche par défaut elle refuse, et sur une
  branche non poussée elle propose de pousser d'abord plutôt que de le faire dans votre dos.

- **Relancer une tâche avec un autre modèle, ou un autre agent.** Une exécution ratée, ou dont
  l'agent s'est retrouvé à court de quota à mi-chemin, vous laissait tout retaper. Le menu de
  l'exécution — et le bouton sur sa carte — proposent désormais de la relancer avec le même prompt
  et celui que vous choisissez. Elle repart de zéro plutôt que de poursuivre l'exécution qui a
  échoué, car son contexte est le plus souvent le problème. Changer d'agent remet le modèle à zéro :
  les modèles d'un fournisseur ne sont pas ceux d'un autre, et en emporter un est le moyen d'envoyer
  une exécution vers un modèle qui n'existe pas.

- **Déposez des fichiers sur la boîte.** Le trombone et Ctrl+V étaient les deux entrées ; faire
  glisser un fichier depuis le dossier que vous aviez déjà ouvert est la troisième, et celle qui ne
  demande aucun détour. La boîte se souligne quand un glisser transportant des fichiers passe
  au-dessus, et ce que vous aviez déjà écrit part avec eux. Une carte du tableau qui traverse en
  chemin vers une autre colonne n'est pas touchée : elle transporte du texte, pas des fichiers, et
  l'attraper ne la déplacerait nulle part.

### Corrigé

- **Répondre à une question, c'est une liste qu'on coche et un bouton qu'on presse.** Les options
  étaient des boutons en ligne, chacun large comme son propre texte : un ensemble paraissait
  irrégulier et une option d'un mot était une cible de la taille du mot. Ce sont maintenant une
  liste, une par ligne, sur toute la largeur du cadre. Une question qui accepte plusieurs réponses
  le dit, au lieu de vous le faire découvrir en cliquant deux fois. Et une question à réponse unique
  ne part plus dès que vous touchez une option : les deux attendent « Répondre », pour que ce qui
  va être dit soit à l'écran avant de l'être — et un clic raté est un clic de plus à annuler plutôt
  que quelque chose de déjà envoyé. Sur une question à réponse unique, l'option et le champ libre se
  remplacent l'un l'autre : une réponse ne peut pas être aussi une phrase différente.

- **Les boutons au pied d'une tâche s'alignent selon ce qu'ils font.** Trois boutons libres sous une
  règle « espacez-les » laissaient « archiver » échoué au milieu, à égale distance d'un lien qui vous
  emmène ailleurs et d'une suppression sans retour. Partir ailleurs est maintenant à gauche, et ce
  qui modifie la tâche est à droite, ensemble.

- **Le tableau a perdu son sélecteur de vue et retrouvé « Nouvelle tâche » à sa place.** Le graphe
  n'étant plus une seconde vue du tableau, il n'y avait plus rien entre quoi basculer : les deux
  barres n'en font qu'une, la recherche, le filtre, le compte, puis « Revoir », « Copier en
  markdown » et « Nouvelle tâche » côte à côte.

- **Le quota d'Antigravity dit pourquoi c'est une estimation.** Son anneau affiche un tiret là où
  tous les autres fournisseurs affichent un nombre, et un tiret sans explication à côté ressemble à
  une panne. Ce n'en est pas une : Antigravity n'indique pas ce qu'il reste. Le chiffre exact existe
  — son CLI le demande à Google — mais il est derrière une licence Code Assist payante, et un compte
  qui n'en a pas se le voit refuser. L'application le dit donc maintenant, à côté du tiret, dans la
  popover de la zone de saisie, dans l'écran de l'agent et dans les réglages, au lieu de vous
  laisser deviner. Ce qui s'affiche reste déduit du « quota reached, resets in 1h45m » que
  renvoient les runs, la seule chose qu'il y ait à lire.

- **L'anneau et la barre de quota se remplissent à mesure qu'il se consomme.** Ils se remplissaient
  avec ce qui *restait* : un quota intact était un anneau plein, un quota presque épuisé était
  presque vide — l'inverse de n'importe quelle jauge de quelque chose qui se consomme, et la raison
  pour laquelle on ne les lisait pas d'un coup d'œil. Ils partent vides et se remplissent de ce qui
  a été dépensé, et tous les chiffres à côté comptent la même chose : « 83 % », c'est ce qui est
  parti, pas ce qui reste. La couleur suit toujours ce qui reste, donc un anneau presque plein est
  aussi rouge : les deux moitiés disent « ça s'épuise » au même moment, au lieu que l'une le dise
  trop tard.

- **Une étape dit ce qu'elle a fait sans attendre le navigateur.** Chaque ligne de l'activité d'un
  agent est tronquée — un outil affiche son résumé, une délégation quatre-vingt-dix caractères de la
  tâche — et le seul moyen de lire le reste était le `title` du navigateur : une seconde d'attente,
  une boîte nue là où se trouvait le pointeur, et les retours à la ligne écrasés en espaces, soit
  exactement ce qu'on ne veut pas pour une commande ou une trace d'erreur. Elles ont maintenant
  l'infobulle de l'application, ancrée à leur ligne, en monospace et avec les retours à la ligne
  conservés. L'étape en cours en a une aussi, elle qui n'avait rien du tout.

- **Un agent ne sait plus rien d'un projet dont personne ne lui a parlé.** Le contexte partagé était
  un seul texte dans les réglages, ajouté au prompt de chaque agent de chaque projet. Écrivez-y
  quelque chose sur un dépôt et tous les agents, partout, l'avaient lu : c'est ainsi qu'un message
  destiné à un projet a été compris, suivi et emporté dans un autre. Il appartient désormais à un
  projet : les réglages choisissent lequel, et `ainess context` accepte `-p`/`-w` comme le reste du
  CLI. Ce que vous aviez écrit est copié dans chacun de vos projets, pour ne rien perdre ; si ce
  texte ne concernait qu'un seul, les autres sont maintenant l'endroit où l'effacer.

- **Un hook démarre avec un message qui parle de l'événement choisi.** Un seul texte par défaut se
  tenait derrière les dix-sept, écrit pour « un agent a terminé » et figé en espagnol. Un hook sur
  « internet coupé » commençait en annonçant qu'un agent avait terminé, à tout le monde, dans une
  langue que la plupart n'avaient pas choisie. Chaque événement démarre maintenant avec sa propre
  ligne, dans votre langue, avec les variables qu'il porte vraiment : la question quand on
  questionne, le modèle quand le quota est à sec, les deux agents pour une délégation. Changez
  l'événement avant de toucher au message et il suit ; touchez-y et il cesse de suivre, car il est
  à vous désormais. Le bouton de test remplit lui aussi les variables dans votre langue, pour que
  l'aperçu soit le message que vous recevrez.

- **L'application cesse de transporter six langues qu'elle ne vous montre pas.** Les sept
  dictionnaires étaient dans le même bundle : chaque démarrage payait pour les six que personne ne
  lisait — 575 ko, 179 compressés. Désormais seul l'espagnol est intégré (c'est la base vers
  laquelle toutes les autres retombent) et la vôtre est chargée avant le premier affichage puis
  conservée. Ce morceau est passé de 575 ko à 83 ko, et de 179 compressés à 27.

- **Un agent qui répond à une question dans une conversation ne peut plus distribuer du travail.**
  Le tour qui porte votre réponse démarrait sans qu'on lui dise qu'il appartenait à une
  conversation : il était donc lu comme une tâche et ses blocs `delegate` étaient exécutés. Un agent
  pouvait mettre d'autres agents au travail depuis une conversation où personne ne l'avait
  demandé.

- **Le tableau défile aussi vers le bas pendant que vous glissez.** Une colonne plus haute que
  l'écran avait le même problème que le tableau en largeur : la carte sous laquelle vous vouliez
  déposer était hors champ. La colonne sous le pointeur entraîne désormais elle aussi, avec la même
  rampe.

- **Les fenêtres de console qu'un agent ouvrait en travaillant ont disparu pour de bon.** La
  tentative précédente réparait la mauvaise moitié. Demander un processus sans console fonctionne
  pour ce processus — et ensuite chaque programme console que *lui* lance en demande une à Windows,
  en reçoit une neuve, et celle-là est visible. Les fenêtres n'ont jamais été les nôtres : elles
  appartenaient aux programmes que nos agents exécutaient. L'application prend désormais une seule
  console pour elle au démarrage et la masque, et tout ce qui se trouve en dessous hérite de
  celle-là au lieu d'en demander une, aussi profond que cela descende.

- **Un lien vers un fichier dans une réponse fait enfin quelque chose.** Un agent écrivant
  `[le fichier](file:///C:/Users/vous/notes.txt)` produisait un texte gris mort : `file:` figurait
  sur la même liste de refus que `javascript:` et `data:`, qui s'exécutent réellement dans la page,
  et il s'y était retrouvé par association — il n'exécute rien du tout. Un clic révèle désormais le
  fichier dans votre gestionnaire de fichiers et s'arrête là. Il ne devient jamais un vrai lien et
  n'est jamais confié au système pour être ouvert, car `[regarde ça](file:///C:/x.exe)` est une
  ligne que n'importe quel agent peut écrire.

- **Le tableau défile de lui-même quand vous amenez une carte au bord.** Un tableau plus large que
  la fenêtre ne pouvait pas être traversé : la colonne voulue était hors champ, et lâcher pour
  faire défiler déposait la carte là où vous ne vouliez pas. Tenir une carte près de l'un des deux
  bords entraîne désormais le tableau, doucement à l'entrée de la zone et plus vite à mesure que
  vous approchez — et il continue tant que vous restez immobile, ce dont les événements de
  glisser-déposer ne préviennent personne d'eux-mêmes.

## 0.10.0 — 2026-09-09

### Nouveau

- **La boîte complète ce que vous êtes en train d'écrire.** `@` nomme un agent du projet, `#` un
  fichier de l'espace de travail, `{{` une des variables de gabarit, et `/` vos commandes et vos
  ordres enregistrés ensemble — ce sont deux choses que l'on lance. Les flèches pour se déplacer,
  Entrée ou Tab pour choisir, Échap pour fermer la liste sans toucher à ce que vous avez écrit. Aux
  deux commandes existantes s'en ajoutent cinq : `/tasks`, `/chat`, `/diff`, `/stop` et `/clear`,
  qui demande d'abord. Rien ne se complète à l'intérieur d'un bloc de code, où un `#` est un
  commentaire et un `/` un chemin.

- **Vous pouvez écrire du code dans la boîte.** Entrée envoyait : un bloc de code voulait dire
  penser à Maj+Entrée à chaque ligne et espérer avoir fermé la clôture — la boîte affichait le
  markdown en texte brut et n'en donnait aucun signe. Les touches savent désormais où est le
  curseur : sur une ligne qui n'est qu'une ouverture de clôture, Entrée écrit la fermeture et vous
  laisse au milieu ; à l'intérieur, Entrée est un saut de ligne qui reprend votre indentation et
  Tab fait deux espaces ; et la partie clôturée de ce que vous écrivez reçoit un fond, pour voir où
  elle commence et où elle finit. Ctrl+Entrée envoie depuis l'intérieur, puisque Entrée seule ne le
  peut plus.

### Corrigé

- **Une question se pose à un seul endroit.** Elle apparaissait en bulle dans le fil et prenait la
  boîte en même temps, les deux vivantes, les deux la même question. C'est la boîte qui la garde,
  puisque c'est là que vous pouvez répondre avec tout le composer. Une fois répondue, elle revient
  dans le fil en ligne non modifiable — la seule trace qu'elle y ait jamais été posée.

- **Répondre depuis la boîte répond vraiment.** Un agent pose une question, vous choisissez
  d'écrire la réponse dans la boîte plutôt que dans le champ de la question, vous envoyez — et la
  question restait ouverte. Elle revenait recouvrir la boîte à chaque retour dans la conversation,
  elle restait dans la cloche, sur l'accueil et dans `/status`, et l'exécution qui avait posé la
  question continuait d'attendre une réponse déjà donnée, pendant que votre message lançait une
  exécution à part. Un agent qui a posé une question est arrêté à vous attendre : ce que vous
  écrivez ensuite est la réponse, où que vous l'ayez écrite.

- **L'accueil dit chaque chose une seule fois.** Il était devenu l'écran de ce qui vous attend,
  mais l'ancienne grille de cartes de projet était toujours en dessous : un agent au travail
  apparaissait trois fois — dans la liste de ce qui travaille, dans la carte de son projet, et
  encore dans le compteur de cette même carte. Chaque carte portait en plus ses propres boutons
  Ouvrir, Modifier et Supprimer — un rouge sur chacune — pour des actions que le clic sur la carte
  et son menu contextuel couvraient déjà. Désormais tout l'écran est un seul type de rangée : ce
  qui vous attend, ce qui travaille, et les projets, dans cet ordre. La rangée d'un projet montre
  une seule ligne d'état et, seulement s'il y a quelque chose, un petit compte de ce qui attend et
  de ce qui tourne. Quand rien ne vous attend, elle le dit en une ligne plutôt que de vous laisser
  le déduire.

- **Les compétences suggérées sont écrites pour l'agent et expliquées pour vous dans votre
  langue.** Le catalogue derrière « Suggestions » était entièrement en espagnol : les noms, les
  instructions que l'agent lit réellement, et les descriptions d'une ligne de la liste. Les
  instructions sont du code — elles vont dans le prompt d'un agent et dans un fichier du dossier du
  projet — elles sont donc en anglais désormais, comme le reste du dépôt. Ce qui est écrit pour vous
  est traduit, dans les sept langues, et un test refuse toute nouvelle suggestion tant que chaque
  langue ne l'a pas.

## 0.9.0 — 2026-09-08

### Nouveau

- **Un plafond de dépense par projet, et l'alerte avant de l'avoir brûlé.** L'écran d'utilisation a
  toujours su dire ce qu'un projet avait coûté. Il ne pouvait pas l'arrêter. Un projet accepte
  désormais un plafond journalier, un mensuel, ou les deux, et vous dites quoi faire quand il est
  atteint : prévenir, ou refuser de démarrer de nouvelles exécutions. L'alerte arrive à 80 % — une
  fois par jour, pas une fois par exécution — et l'écran d'utilisation trace la barre contre le
  plafond le plus près de céder. Les chiffres restent uniquement ce que chaque CLI a réellement
  rapporté : un fournisseur qui ne rapporte rien n'ajoute rien, et l'écran le dit au lieu
  d'estimer.

- **Un hook peut vous prévenir sur Telegram, et il y a trois moments de plus dont être averti.**
  Les deux autres actions de chat réclament un webhook qu'il faut aller créer sur un serveur ;
  celle-ci réutilise le bot déjà configuré dans Messagerie, si bien que « quand une tâche se
  termine, préviens-moi » se choisit dans une liste. Vous pouvez nommer une conversation ou laisser
  vide pour toutes celles de la liste — et seulement celles de la liste, car un hook n'a pas le
  droit d'être la porte dérobée qui la contourne. Trois nouveaux événements l'accompagnent : un
  agent a posé une question et attend, une relecture a demandé des changements, et un agent est
  arrivé au bout de son quota.

- **La palette cherche ce qui a été dit, pas seulement comment les choses s'appellent.** Elle
  trouvait projets, tâches, conversations et agents par leur nom — ce dont on a besoin le jour même.
  Deux semaines plus tard, ce dont on se souvient est une phrase, pas un titre. Trois caractères
  suffisent et les messages du fil du projet et de toutes les conversations reviennent aussi, du
  plus récent au plus ancien, chacun affiché avec les mots cherchés au milieu de la ligne plutôt
  qu'avec ce par quoi le message commençait. Les accents et les majuscules n'y changent rien, ni le
  saut de ligne resté entre vos deux mots.

- **Le diff d'une exécution, pas celui du projet entier.** Le panneau de diff montre l'arbre de
  travail du projet, ce qui répond à « que se passe-t-il dans ce dépôt » et jamais à « qu'a touché
  cette tâche ». Chaque exécution se souvient désormais d'où elle a tourné — l'espace de travail du
  projet, ou le worktree propre à l'agent — et du commit sur lequel elle a démarré : le détail d'une
  exécution montre donc ce qui a bougé depuis. Les exécutions antérieures ne se souviennent
  d'aucun des deux, et le disent au lieu de deviner.

- **Un agent peut déplacer sa propre carte et en ouvrir une pour ce qu'il a trouvé en chemin.** Le
  tableau n'allait que dans un sens : le planificateur le lisait et distribuait le travail, et celui
  qui le faisait ne voyait même pas sa carte, encore moins de quoi dire qu'il était bloqué.
  Désormais, tout agent peut laisser un bloc `task` pendant qu'il travaille — l'un déplace sa carte
  et lui ajoute une ligne de détail, l'autre ouvre dans le backlog une carte non assignée pour
  quelque chose qu'il a croisé et qui ne le concerne pas. Cela arrive sur le tableau pendant que
  l'exécution continue, pas à la fin, et la carte du backlog dit qui l'a proposée. Fermer une carte
  n'est toujours pas à l'agent de le décider.

- **L'app te répond dans une conversation que tu as déjà ouverte.** Les réglages ont une section
  Messagerie : tu colles un jeton de bot d'@BotFather sur Telegram, tu l'actives et tu écris au bot —
  tout ce que tu dis lance une tâche, `/status` dit qui travaille et ce qui t'attend, `/approve` et
  `/answer` règlent ce qui a besoin de toi, `/stop` arrête tout. Rien n'est exposé : c'est l'app qui
  sort demander, donc pas de tunnel, pas de port, pas d'adresse à trouver. Seules les conversations
  de la liste peuvent donner des ordres, une liste vide n'autorise personne, et un inconnu n'a aucune
  réponse — son identifiant apparaît dans les réglages avec un bouton pour l'autoriser, ce qui est
  aussi comme ça que tu découvres le tien. Ce qui arrive à la cloche arrive aussi au chat, et ce qui
  t'attend te dit quoi répondre.

### Corrigé

- **Deux conversations avec le même agent redeviennent deux conversations.** L'agent n'avait qu'un
  seul emplacement pour sa session, et cet emplacement contenait la conversation qui avait parlé en
  dernier. Vous ouvriez une deuxième conversation avec un agent à qui vous parliez déjà, vous
  reveniez à la première, et il vous répondait avec le contexte de l'autre — et une conversation
  écrasait en prime la session qu'utilisaient ses propres tâches. Désormais une conversation remet
  la session qui lui appartient au lieu de lire cet emplacement, range ce que rapporte le
  fournisseur avec la conversation à laquelle il appartient, et une conversation qui n'en a pas
  encore démarre à neuf plutôt que d'en emprunter une. Répondre à une question posée dans une
  conversation y reste aussi.

- **Éteindre tous les types dans le filtre de communication vide désormais la vue.** Ce que vous
  envoyez à un agent en était exempté : il s'affichait quoi qu'en dise le filtre, et ne figurait
  même pas dans la liste des types, donc rien ne permettait de l'éteindre. Le bouton indiquait
  « Types (0/8) » pendant que le panneau continuait d'afficher des choses. Il y a dix types
  maintenant, les deux vôtres compris, et éteint veut dire éteint. Et quand c'est le filtre qui a
  vidé la vue, elle le dit, au lieu d'affirmer qu'il n'y a eu aucune activité.

- **Le panneau de communication lit ce qu'un agent a écrit comme il l'entendait.** Ses lignes
  affichaient le markdown brut — les astérisques, les accents graves, les dièses — alors que le même
  texte s'affichait correctement partout ailleurs dans l'application. La prose est désormais rendue :
  ce qu'un agent a dit, ce qu'il a délégué, ce avec quoi il est revenu, et ses notes. Les lignes
  d'outil et stderr restent exactement telles qu'elles sont arrivées, car un chemin comme
  `src/lib/__tests__/x.ts` n'est pas une consigne d'en mettre la moitié en gras ; et ce que vous
  avez tapé est montré tel que vous l'avez tapé, comme le fait déjà la conversation.

- **Le filtre de types reste ouvert pendant que vous vous en servez, et ne casse plus le panneau.**
  Choisir un type fermait le menu : réduire le fil à deux types demandait de l'ouvrir cinq fois. Et
  le bouton qui l'ouvre affiche « Types » jusqu'à ce que vous décochiez quelque chose, puis
  « Types (7/8) » — une étiquette plus longue pour laquelle rien dans cette rangée n'avait le droit
  de rétrécir, si bien que le panneau entier devenait plus large que le dock qui l'accueille. La
  rangée cède maintenant, et celle de chaque message aussi, où deux noms d'agent, une heure, une
  étiquette et un bouton se disputaient le même espace étroit.

- **Demander le brut d'un message montre ce message.** Le bouton d'une ligne du panneau de
  communication ouvrait l'exécution entière — chaque ligne de stdout que la session avait produite —
  ce que ne demande personne en cliquant sur une délégation. Il montre désormais ce message : de qui
  à qui, quand, le texte complet, et pour un appel d'outil l'outil, son entrée et l'erreur sur
  laquelle il a échoué, avec un bouton pour tout copier. L'exécution entière est toujours là, un
  clic plus loin, à sa place. Le bouton a aussi une infobulle et apparaît sur tous les messages, pas
  seulement ceux qui ont une exécution derrière eux.

- **Faire glisser la fenêtre ne fige plus et ne saute plus.** Lancer un programme externe — le `git
  status` qui se rafraîchit chaque minute, un `git diff`, une sonde `--version` — retenait le fil
  qui pompe les messages de la fenêtre jusqu'à la fin du programme. Windows déplace une fenêtre avec
  une boucle modale sur ce même fil : un déplacement qui tombait sur l'un de ces appels se figeait,
  puis sautait là où le pointeur était arrivé. Ces commandes, ainsi que la lecture et l'écriture de
  la configuration et des journaux, s'exécutent désormais hors de ce fil. La configuration est en
  outre écrite à côté puis renommée par-dessus, pour que personne n'en lise jamais la moitié.

- **L'application s'appelle ainess partout, exécutable compris.** Elle s'appelait `ais`, et
  l'ancien nom a survécu là où personne ne regarde : dans la crate Rust, et donc dans le binaire —
  l'application installée était `ainess\ais.exe`, ce qu'affichaient le gestionnaire de tâches,
  l'invite du pare-feu et la liste de démarrage. La ligne de commande a suivi : `ais run` et
  `ais serve` deviennent `ainess run` et `ainess serve`, et `ais` n'existe plus. Rien de ce que vous
  aviez n'est perdu : brouillons, largeurs de panneaux et jeton du téléphone sont enregistrés sous
  de nouveaux noms et continuent de lire les anciens.

- **Fini les fenêtres de console qui clignotent par-dessus ce que vous regardiez.** Arrêter une
  exécution, fermer l'application, une exécution qui dépasse son délai, couper le tunnel et chaque
  vérification d'un processus périmé appelaient `taskkill` ou `tasklist`, et Windows attribue une
  fenêtre de console à un programme console lancé par une application fenêtrée, sauf si on lui dit
  le contraire. Les appels qui démarrent un agent le disaient toujours ; pas ceux de ménage autour
  d'eux.

- **Un seul bouton à côté de la boîte, et c'est celui qu'il faut sur le moment.** Envoyer quand rien
  ne tourne, arrêter pendant qu'un agent répond — les deux ne s'entassent plus par-dessus le texte
  que tu écris. Rien n'a changé en dessous : Entrée envoie toujours et, pendant que l'agent
  travaille, met toujours en file ce que tu écris pour la fin du tour — ce que la boîte vide te dit
  maintenant, à la place d'un second bouton.

- **La question d'un agent prend la place de la boîte.** Elle vivait dans la bulle de l'exécution :
  utile tant que tu la regardes, inutile dès que tu as fait défiler — et pire, ce que tu écrivais
  dans la boîte avec une question ouverte lançait une nouvelle exécution et laissait l'agent
  attendre une réponse qui n'arriverait jamais. La question se tient maintenant là où tu allais
  écrire, avec ses options en boutons et de la place pour ta propre réponse ; s'il y en a plusieurs
  en attente, elle le dit, et elles viennent une par une. « Écrire autre chose » te rend la boîte
  sans rien répondre.

- **Le panneau de notifications se ferme quand tu cliques ailleurs.** Il pend de la barre de titre,
  qui est la zone par laquelle on déplace la fenêtre : un clic là est pris par le système pour
  déplacer la fenêtre et n'atteint jamais la couche qui ferme le popover.

- **Les terminaux appartiennent à leur projet.** Tu en ouvrais un dans un projet, tu passais à un
  autre et tu voyais toujours les onglets du premier — c'est aussi pourquoi un terminal semblait
  s'ouvrir dans le mauvais dossier : c'était celui d'un autre projet, dans son propre dossier.
  Chaque projet montre les siens maintenant, et se souvient duquel il s'agissait. Supprimer un
  projet laisse toujours ses shells en vie, comme avant — l'un d'eux est peut-être en train de faire
  quelque chose — et ils réapparaissent sur l'écran d'accueil, là où va un terminal sans projet.

## 0.8.0 — 2026-09-08

### Nouveau

- **La boîte vide dit maintenant quelque chose, et ça change.** Le placeholder du composer écrit l'une de cinq
  lignes et change toutes les quelques secondes : à quoi sert l'équipe, ce que tu peux lui confier, que `/`
  ouvre les commandes et le raccourci Entrée, qui cesse d'être une trace permanente sur la ligne pour devenir
  quelque chose que tu lis une seule fois. Il reste immobile pour quiconque a demandé au système moins de
  mouvement, et sur téléphone il ne bouge pas du tout.
- **Du mouvement là où ça veut dire quelque chose.** Une exécution toujours en cours a la lumière qui balaye
  l'étape sur laquelle elle se trouve, au lieu d'un spinner ; le "En cours" de l'Accueil a l'air
  vivant ; la pilule d'approbations porte un fil de lumière autour pendant —et seulement pendant— que quelque
  chose attend ta réponse ; et l'argent dans le panneau de consommation augmente jusqu'à son montant réel, avec
  le même format de devise que celui utilisé par les tableaux. Rien d'autre n'a été décoré : le fil, le feed et
  le tableau restent immobiles, car un outil que tu regardes toute la journée ne devrait bouger que lorsqu'il
  te dit quelque chose.
- **Un agent peut dire quelque chose avant d'avoir fini.** Jusqu'à présent, la seule chose qu'un agent délégué
  pouvait dire à son planificateur était sa réponse finale : s'il bloquait au bout de deux minutes, personne ne le
  savait pendant vingt minutes. Il peut maintenant laisser un bloc `note` pendant qu'il travaille —bloqué, plus
  lent que prévu, quelque chose que tu devrais savoir maintenant— et l'application le remet pendant que l'exécution
  est toujours en cours, directement dans le feed et à celui qui a délégué le travail.
- **Et il termine avec ce qu'il a réellement fait.** Un bloc `result` qui nomme les fichiers qu'il a touchés, ce qu'il
  a exécuté pour les vérifier et ce qu'il n'a pas pu faire. La prose reste ; c'est la partie que le planificateur lit
  sans avoir à l'interpréter, et elle apparaît dans le détail de l'exécution sous forme de trois courtes listes.
- **L'Accueil est l'endroit où tu découvres ce qui attend.** Au-dessus des projets, deux listes qui les croisent
  tous : ce qui t'attend —une délégation en attente d'approbation, une question à laquelle personne n'a répondu,
  une carte que le tableau a laissée dans *Nécessite ton attention*— et qui travaille en ce moment, sur quoi, et
  depuis quand. Chaque ligne te place là où se trouve la chose : le fil pour une approbation ou une question,
  le tableau avec la carte ouverte pour une tâche. Les deux disparaissent quand il n'y a rien dedans, donc un Accueil
  calme ressemble à ce qu'il a toujours été. Et le badge qui marquait le dernier projet que tu as ouvert n'est plus
  là : tu es sur l'Accueil précisément parce que tu n'y es pas. À sa place, chaque carte indique ce qui se passe
  à l'intérieur : "2 en cours · 1 en attente".
- **Les agents sur la même tâche se connaissent.** Un planificateur divisant le travail entre deux implémenteurs
  les démarrait à l'aveugle : aucun ne savait que l'autre était là, les deux touchaient aux mêmes fichiers et le
  planificateur recevait deux réponses qui se contredisaient. Chacun est maintenant informé de qui d'autre travaille
  sur cette même tâche et ce qu'on lui a demandé de faire —et que ce que quelqu'un d'autre a entre les mains
  lui appartient pour le modifier, pas pour que tu l'écrases. Cela voyage à chaque tour, comme le tableau,
  car c'est le genre de chose qui change pendant que tu travailles.
- **Un hook peut écrire "au chef" au lieu de quelqu'un par son nom.** L'agent à instruire propose désormais
  le sommet de la hiérarchie —le planificateur racine du projet, le même agent auquel le composer,
  la CLI et le téléphone écrivent par défaut— résolu au moment où le hook se déclenche plutôt qu'au moment
  où il est sauvegardé, donc réorganiser l'équipe ne le laisse jamais pointer vers quelqu'un qui n'est plus en
  charge. Laissé sans filtre, il atteint le chef de *chaque* projet, ce qui fait qu'un seul hook programmé
  suffit pour tous ; réduit à un projet, il est le chef de celui-ci, et un événement qu'un agent a causé
  reste dans le projet où il s'est produit.

### Corrigé

- **Tu peux relire une conversation en arrière pendant qu'un agent est encore en train d'écrire.** Dans un chat,
  chaque delta qu'il envoyait te ramenait en bas : scroller vers le haut pour vérifier ce qu'il avait dit il y a deux
  minutes était impossible jusqu'à ce qu'il ait terminé. Le chat fait maintenant ce que le fil de l'orchestrateur
  faisait déjà : il suit le bas seulement tant que tu es en bas, et quand tu ne l'es pas, une pilule dans le coin
  indique combien de messages sont arrivés et t'y emmène quand tu le souhaites. Le compte est maintenant aux trois
  endroits —chat, fil et feed de communication— au lieu d'un simple "nouveaux messages".
- **Un nom de modèle long ne casse plus la boîte de dialogue de nouveau chat.** La ligne d'un participant est de trois
  listes déroulantes et d'une corbeille dans une grille, et une colonne de grille ne rétrécit pas en dessous de ce
  qu'elle contient : si tu choisissais un modèle avec un nom long, la ligne s'étirait, le dialogue s'étirait avec, et
  les champs nom et mode finissaient par pendre en dehors de la carte. Les colonnes peuvent maintenant rétrécir et le
  nom est tronqué.
- **Un outil qui échoue à l'intérieur d'un agent ne donne plus l'impression que l'appli est cassée.** Le `view_file`
  d'Antigravity échoue, l'agent réessaie et continue, et la conversation montrait une alarme rouge à ce sujet,
  avec la même forme qu'une véritable défaillance. Maintenant, c'est une ligne dans l'activité de l'exécution,
  en ambre, avec ce que le fournisseur a dit à un hover de distance. Le rouge est gardé pour ce qui est vraiment
  cassé. Le seul cas qui vaut la peine d'être dit à voix haute l'est toujours : le même outil échouant trois
  fois dans une exécution signifie que l'agent tourne en rond, et cela obtient une seule ligne le nommant.
- **Les boutons du composer arrêtent de s'entasser dans la boîte.** Le bouton d'envoi ne se transforme plus en
  horloge —mettre en file d'attente fonctionne exactement comme avant, Entrée met en file d'attente pendant qu'un
  agent est occupé et le tooltip le dit— et le trombone est descendu dans la barre, seul à gauche, avec l'agent,
  le modèle, les approbations et le quota rassemblés à droite.
- **`ais run` échoue quand la tâche a échoué, dans n'importe quelle langue.** Il décidait de son code de sortie
  en cherchant les mots espagnols de "CLI not found" dans le feed —texte qui a cessé d'exister le jour où ces
  messages ont commencé à sortir des dictionnaires. Sur une machine en anglais, une tâche qui mourait par manque de
  CLI sortait avec un zéro, verte pour tout script qui l'avait appelée. Maintenant il lit les exécutions.
- **La conversation arrête de se repeindre entièrement.** Le fil et le feed de communication dessinaient
  chaque message qu'ils avaient —trois mille par projet— et aucune ligne n'était mémoïsée, donc tout
  ce qui touchait le store les redessinait toutes. Ils dessinent maintenant la dernière partie, avec un lien
  en haut pour remonter plus loin qui garde ta place au lieu de sauter, et les lignes ne se redessinent que
  lorsque quelque chose de leur côté a vraiment changé.
- **Qu'un agent écrive ne coûte plus plus cher plus tu travailles longtemps.** Chaque delta envoyé par une CLI
  était une écriture : une copie de toute la liste de messages pour ajouter une lettre à la fin, plus une copie de
  la map des exécutions pour la ligne brute, plus un passage sur chaque message pour décider quoi sauvegarder.
  Par token. Avec un long historique, c'est un travail proportionnel à tout ce qui a jamais été dit, ce qui est
  exactement pourquoi la fenêtre devenait plus lourde au fil de la journée. Les deltas sont maintenant rassemblés
  et appliqués ensemble, au maximum toutes les 80 ms, et sauvegardés sur-le-champ quand une exécution se termine
  ou est arrêtée pour que rien n'arrive en retard ou ne manque.
- **Un projet s'ouvre comme tu l'as laissé, conversation incluse.** Passer à un autre projet et revenir te
  laissait dans le fil de l'orchestrateur, même si tu avais parlé dans l'un des chats de ce projet : la
  barre latérale demandait le projet *et aucun chat*, et c'est exactement ce qu'elle obtenait. Chaque projet
  se souvient maintenant de sa dernière conversation ainsi que de sa vue, et rouvrir l'appli revient aux deux.
  Demander le fil exprès te donne toujours le fil.
- **Taper n'écrit plus sur le disque à chaque touche.** Chaque caractère sauvegardait chaque brouillon dans
  l'appli en JSON, de manière synchrone, sur le thread principal —qui est exactement le thread qui doit suivre
  ta frappe. Ce que tu écris atterrit toujours dans l'appli instantanément ; le disque en est informé au maximum
  toutes les 400 ms, et immédiatement lorsque la fenêtre se ferme ou perd le focus, pour que rien ne soit perdu.
- **Le panneau de notifications ne s'ouvre plus avec un tooltip déjà affiché.** L'ouvrir déplaçait le focus sur
  le premier bouton d'icône, et un tooltip s'affiche aussi bien avec le focus qu'avec le hover.
- **Une carte laissée en revue revient.** Le tableau est remis en phase avec ses exécutions à chaque démarrage,
  mais seulement pour les cartes *En cours*. Une carte garée *En revue* derrière une révision qui est morte
  avec l'appli —ou dont l'exécution est tombée d'un historique réduit— restait là pour toujours. Elle est lue
  maintenant de la même manière que le flux en direct : approuvée va dans la liste, changements et échecs
  reviennent vers toi, et une carte qu'une personne a glissée là à la main reste uniquement son affaire.
- **Un agent dans un chat est le même agent que dans une tâche.** Le chat construisait son propre prompt
  système, en espagnol, sans le bloc `ask` —donc un agent avec qui tu parlais ne pouvait pas te demander de
  décision— et avec chaque skill collée en entier au lieu d'être pointée dans le repo. Les chats passent
  maintenant par le seul constructeur : même profil, même contexte partagé, mêmes skills, même façon de
  demander, moins le tableau et la délégation dont un agent n'a pas besoin dans une conversation.
- **L'appli parle ta langue jusqu'au bout.** L'interface était traduite et une trentaine de messages
  en dessous ne l'étaient pas : une exécution arrêtée, une approbation, une délégation rejetée, un hook qui
  a échoué, les erreurs que le téléphone reçoit, ce qu'une exécution interrompue laisse derrière elle, la CLI qui
  n'a pas pu être installée. Dans une fenêtre en anglais, ils sortaient tous en espagnol. Ils passent maintenant
  par les mêmes dictionnaires que tout le reste —et une exécution interrompue par le build d'hier dans une autre
  langue est toujours reconnue comme interrompue aujourd'hui.
- **Une délégation qui ne nomme personne ne bloque plus la tâche.** Un planificateur qui orthographiait mal le
  nom d'un agent —ou en nommait un qui n'était pas sous ses ordres— restait à attendre une équipe qui ne viendrait
  jamais, sa carte bloquée sur *En cours* jusqu'à ce que l'appli redémarre. Maintenant, l'erreur revient au
  planificateur avec les noms qu'il peut réellement utiliser, pour qu'il délègue à nouveau ; sans plus de tours,
  la tâche se ferme comme ayant besoin de toi au lieu de faire semblant de travailler.
- **Une exécution qui ne peut même pas démarrer ferme sa carte.** Sans la CLI, l'exécution a échoué et le
  tableau n'en a jamais entendu parler.
- **Atteindre le plafond de tours le dit.** La tâche se ferme maintenant comme ayant besoin de toi, avec le
  plafond dans les détails et la même notification que n'importe quelle défaillance, au lieu de se terminer
  silencieusement comme si elle avait fini.
- **Un planificateur qui avait oublié comment déléguer.** Envoyer les instructions seulement au tour qui
  ouvre une session était bien pour la description —le rôle, le profil, le contexte partagé, la liste des
  skills— et mauvais pour les deux blocs à travers lesquels un agent *agit*. Une CLI compacte son propre
  contexte lorsqu'une session s'allonge, et une fois que le bloc `delegate` avait été résumé, le
  planificateur ne pouvait plus atteindre sa propre équipe : il cherchait une ligne de commande `ainess`
  et une tool MCP, et finissait par demander à l'utilisateur de déléguer en son nom, raisonnant sur l'appli
  dans laquelle il s'exécutait comme si elle appartenait à quelqu'un d'autre. Les blocs `delegate` et `ask`
  vont maintenant à chaque tour. Ils sont le protocole, pas le préambule.
- **Un plantage ne laisse plus d'agents travailler dans le dos de l'appli.** Fermer l'appli arrête chaque
  processus d'agent ; un plantage —le gestionnaire des tâches, une coupure de courant, une panique— ne va
  jamais jusque-là, donc les CLI continuaient : continuant à éditer le workspace, continuant à dépenser
  du quota, sans personne pour lire leur sortie et avec l'appli qui les a démarrées déjà disparue. Chaque
  exécution note maintenant le processus derrière elle, et le prochain démarrage les trouve, les arrête et
  le dit, dans tous les projets —y compris ceux qu'il ne charge pas au démarrage, dont la comptabilité peut
  attendre mais pas leurs processus. Un pid n'est jamais suffisant pour tuer : ils sont redistribués, et le
  prochain propriétaire a autant de chances d'être ton propre serveur de développement qu'un agent, donc
  un processus n'est arrêté que lorsque son image *et* le
  moment où il a commencé correspondent encore à l'exécution qui l'a enregistré.
- **Chaque projet se souvient de la vue dans laquelle tu l'as laissé.** Le tableau, la conversation et la
  hiérarchie étaient un seul réglage partagé par tous les projets, donc en ouvrir un dans la
  hiérarchie et revenir à un autre montrait la hiérarchie là aussi. Chaque projet garde maintenant la sienne —
  à travers les redémarrages, et rouvrir l'appli atterrit sur le dernier projet où il était. Cliquer sur un chat
  reste une destination explicite et ouvre la conversation.
- **Le modèle choisi dans une conversation s'en souvient avec elle.** Si tu en choisissais un, allais au tableau et
  revenais, il disait à nouveau "modèle par défaut" alors que la boîte juste en dessous gardait encore ce que tu avais
  tapé. Il est maintenant conservé par conversation, à côté du brouillon, y compris un modèle tapé à la main.
- **Un hook sur un événement machine ne demande plus un agent deux fois.** L'action "instruire un agent"
  se trouvait sous un filtre qui listait également les agents, donc le même dialogue avait deux sélecteurs
  d'agents signifiant des choses différentes. Sur un événement machine —une horloge, la connexion, un fichier
  qui change— rien de ce qu'un agent a fait ne déclenche le hook, donc filtrer par un seul ne pouvait que
  signifier "ne jamais se déclencher" : ces options ont disparu, laissant le propre sélecteur de l'action
  comme le seul, et un hook qui en avait un retombe sur le projet de cet agent. Le filtre
  porte aussi maintenant le nom de ce qu'il fait ("Écoute").
- **Les liens dans la réponse d'un agent emmenaient toute l'appli vers `tauri.localhost`.** Les agents
  écrivent deux types de liens et l'appli les traitait comme un seul : une adresse web, et un chemin
  dans le repo où ils travaillent (`src/lib/foo.ts`, `README.md`). Le deuxième n'est pas quelque chose à
  ouvrir, et laissé sur un `<a href>`, la fenêtre de bureau le suivait —vers `tauri.localhost/src/lib/foo.ts`,
  avec l'appli qui disparaît sous toi. Maintenant seules les vraies adresses sont des liens, et elles s'ouvrent dans
  le vrai navigateur ; un chemin de repo est laissé comme texte que tu peux lire. Un lien `javascript:` ou `data:`
  —qu'un agent peut écrire, volontairement ou non—
  n'arrive jamais à être un lien pour commencer.
- **Un agent ne pouvait pas changer de modèle quand son père le lui disait.** Un planificateur nommant un `model` pour
  une tâche n'était obéi que tant que "choisir le modèle" était activé dans les Paramètres, donc avec ça désactivé
  —par défaut— un implémenteur qui recevait l'ordre de réessayer sur un autre modèle parce que le sien n'avait plus
  de quota était silencieusement démarré à nouveau sur le même modèle épuisé. Un modèle que le père demande est respecté
  des deux manières maintenant ; ce paramètre décide si l'on *dit au planificateur de choisir* un modèle, pas si son
  choix compte. Et un fils à court de quota ne parvient plus à son père comme un mur d'erreur de CLI : c'est
  dit clairement, avec les modèles de cette même CLI qui valent encore la peine d'être essayés —sa propre famille
  laissée de côté, car le quota est dépensé par famille— et avec le rappel qu'une tâche peut porter un
  `model`. Quand la CLI n'a pas d'autre modèle, on dit au père de prévenir au lieu de réessayer.


## 0.7.0 — 2026-09-08

### Nouveau

- **Les skills s'ouvrent quand elles s'appliquent, au lieu d'être versées dans chaque exécution.**
  Une skill voyageait entière dans le prompt système de chaque agent qui l'avait activée : cinq
  skills faisaient cinq manuels dans chaque exécution, lus ou non. Chacune est désormais écrite
  dans `.ainess/skills/<nom>/SKILL.md` et le prompt ne porte que son nom, une ligne sur ce qu'elle
  fait et ce chemin — l'agent ouvre celle qui concerne son travail, et ce dont la skill a besoin
  (un script, un modèle) peut vivre dans le même dossier. C'est sur cette ligne de description
  qu'il décide, et l'éditeur le dit maintenant.
- **Les notifications font un son.** Deux notes courtes, montantes quand quelque chose vous attend
  et descendantes quand quelque chose s'est terminé, pour les distinguer sans regarder.
  L'application les synthétise — aucun fichier dans l'installateur — et elles sonnent pareil dans
  la fenêtre, depuis la zone de notification (l'application y reste vivante, et c'est ce qui laisse
  le son vous parvenir) et sur le téléphone. Configuration → Général les coupe, et son éditeur
  règle les notes, l'onde et le volume, ou prend un son à vous.
- **L'historique de chaque agent, dans le projet.** `.ainess/history/` reçoit un fichier par agent,
  auquel chaque tour est ajouté quand il se termine : qui a demandé, ce qui a été demandé et ce qui
  est revenu, pour le travail délégué comme pour les conversations. L'application garde tout dans
  son propre stockage, où elle seule peut lire ; c'est la porte d'entrée pour un agent qui revient
  demain, et pour vous avec un éditeur ouvert. Quand le fichier se remplit, des tours entiers sont
  jetés, jamais un demi-tour.
- **Les onglets du terminal se glissent dans l'ordre que vous voulez**, comme dans n'importe quel
  éditeur à onglets : celui qu'on porte s'estompe et une ligne montre où il tomberait.
- **Des hooks sur les conditions de la machine.** Jusqu'ici un hook répondait à ce qu'un agent
  avait fait. Cinq événements de plus répondent à la machine : l'application qui s'ouvre, une
  horloge (à une heure de la journée ou toutes les tant de minutes), la connexion qui tombe et qui
  revient, et un fichier qui change dans le dossier d'un projet — ce dernier monté sur le watcher
  qui existait déjà, donc le bruit (`.git`, `node_modules`, la sortie du build) ne l'atteint pas.
  Ils tournent tant que l'application est ouverte, au plus une fois par minute chacun, et le projet
  sur lequel ils agissent est celui du filtre du hook, ou celui qui est ouvert.
  `approval.requested`, déjà émis, est enfin dans la liste.
- **Le changelog dans votre langue.** La fenêtre qui s'ouvre après une mise à jour, et
  Configuration → À propos, montrent les notes traduites. L'anglais reste dans `CHANGELOG.md` et
  chaque autre langue a son fichier, que la vérification de release tient à jour avec la version
  publiée.
- **Il cherche une nouvelle version toutes les cinq minutes**, pas seulement au démarrage, donc une
  release publiée pendant que l'application est ouverte vous parvient le jour même. La même
  proposition que toujours, et le même interrupteur dans Configuration la coupe.
- **Couper un tour pour dire quelque chose.** Un message qui attend un agent a un second bouton :
  il arrête ce qui tourne et remet le message tout de suite. Rien n'est répété — ce que l'agent a
  fait est sur le disque et ce qu'il a dit est dans sa session, que l'exécution suivante reprend —
  et on lui dit que son tour a été coupé, pour qu'il ne lise pas le transcript comme un tour fini.
- **Des commandes dans la boîte.** Taper `/` dans une zone de saisie vide ouvre une courte liste :
  `/compact` fait recommencer une session à tous les agents du projet — rien n'est perdu, puisque
  chacun est pointé vers son fichier dans `.ainess/history/` et ne relit que ce dont le nouveau
  travail a besoin — et `/cost` ouvre ce que le projet a dépensé. Tout le reste dans la boîte est
  un message, donc « regarde le /compact de Claude » part intact vers l'équipe.

### Corrigé

- **Les instructions étaient renvoyées à chaque tour.** Le préambule d'un agent — son rôle, les
  schémas `delegate` et `ask`, le contexte partagé, le profil, la liste des skills — partait avec
  chaque message d'une conversation que la CLI portait déjà. Avec Claude c'étaient les mêmes
  paragraphes facturés tour après tour ; avec les fournisseurs qui mettent les instructions dans le
  prompt (Antigravity, Copilot, opencode et les autres) cela laissait en plus une copie dans le
  transcript, pour de bon, donc une longue session la payait bien des fois. Elles partent une seule
  fois maintenant, au tour qui ouvre la session. Ce qui part encore à chaque tour, c'est le
  tableau, la partie qui change.
- Un projet ouvre son dossier dans le gestionnaire de fichiers, depuis le clic droit comme depuis
  les trois points — et ces deux menus proposent les mêmes actions partout où ils sont la même
  chose. Le chemin du projet était dans le clic droit et pas dans les points, et l'« Ouvrir » d'une
  conversation l'inverse.
- Un projet ne peut plus avoir deux orchestrateurs à la racine. Le dialogue de l'équipe demande un
  parent pour le second, là où il avait sa place : côte à côte, les deux lisent tout le tableau et
  peuvent prendre la même carte, seul le premier est la destination par défaut de la zone de
  saisie, de la CLI et du téléphone, et l'unique pointeur de « tâche en cours » du projet laissait
  l'un écraser l'autre — la première tâche restait sans sa carte déplacée, sans ses hooks et sans
  sa notification. Une équipe qui en a déjà deux le dit dès que vous en ouvrez un.
- Changer la CLI d'un agent gardait la session de l'ancienne, et l'exécution suivante donnait à
  Antigravity un identifiant de session ouvert par Claude — ce qui échoue aussitôt, puisque c'est
  un nom que l'autre n'a jamais entendu. La session est maintenant abandonnée quand la CLI change,
  et quand l'agent entre dans son propre worktree ou en sort, l'autre moitié de ce à quoi une
  session est liée.
- Le watcher du dépôt ne se réveille plus sur le dossier `.ainess/` de l'application elle-même : le
  tableau, l'équipe et maintenant l'historique y sont écrits pendant le travail, et un hook de
  fichier aurait répondu à l'application au lieu de l'utilisateur.
- Un hook demandait deux fois sur quoi il porte : un champ pour l'agent et un autre pour le projet.
  Il n'y en a plus qu'un — tout, un projet entier, ou un agent dedans — puisqu'un agent appartient
  à exactement un projet et que la paire ne pouvait que s'accorder ou se contredire jusqu'à ne
  jamais se déclencher.
- Les listes d'agents qui traversent les projets — celui qu'un hook instruit, celui vers lequel un
  hook est filtré, celui auquel un ordre est lié — regroupent les agents sous le projet de chacun,
  avec sa couleur. Deux projets avec un « Orchestrateur » chacun se lisaient pareil.
- Un agent à qui vous écrivez vous-même sait qui il est. Il lisait le même prompt que le travail
  vienne de son planificateur ou de vous, donc un implémenteur répondait à votre message en le
  déléguant — puis restait à « en attente de son équipe ».
- Et cette attente est finie de toute façon : une délégation qui nommait quelqu'un qui n'est pas
  sous cet agent le laissait attendre une équipe qui ne venait jamais. Quand aucune n'aboutit,
  l'agent est libre.
- Un lien dans le terminal s'ouvre d'un seul clic. Avant, seuls ceux que la CLI marquait étaient
  des liens, et il fallait tenir Ctrl ; maintenant toute URL de la sortie en est un, et il s'ouvre
  dans le vrai navigateur.
- Sur le téléphone, le clavier couvrait la boîte dans laquelle vous écriviez. La page ne se
  redimensionne volontairement pas quand le clavier s'ouvre — cela décrochait la conversation de
  son ancrage en bas en plein travail — alors l'application est raccourcie exactement de ce que le
  clavier prend.
- Le toast « nouvelle version disponible » montrait la note de release telle qu'elle est écrite, on
  lisait donc `[CHANGELOG.md](https://…)` : un toast n'a pas de markdown pour la rendre. Il dit
  maintenant ce qu'il a à dire, et ce qui a changé est dans le changelog qui s'ouvre après la mise
  à jour.
- Un message écrit pendant qu'un agent travaillait apparaissait dans Communication et nulle part
  ailleurs, comme si l'application l'avait avalé. Il reste maintenant au bas de la conversation, en
  pointillés et avec une horloge, en disant qui il attend, et il peut être repris avant son tour.
- Ce message pouvait aussi être remis trop tôt : un agent qui délègue termine sa propre exécution
  avant que son équipe ait fini, et la file était vidée là — le message courait à côté du travail
  qu'il devait suivre. Il attend maintenant que l'agent soit vraiment libre.

## 0.6.0 — 2026-09-08

### Nouveau

- **Les fichiers partent avec le message.** Un trombone dans la zone de saisie, ou Ctrl+V collé
  directement dedans : une capture, un PDF, un journal. Les images montrent une vignette avant de
  partir et le reste son nom et sa taille, et on peut retirer n'importe lequel. À l'envoi, le
  fichier est copié dans le dossier `.ainess/attachments/` du projet et le prompt porte son chemin
  — la seule chose que toutes les CLI savent faire d'une pièce jointe, puisqu'elles lisent toutes
  le dépôt dans lequel elles travaillent.

### Corrigé

- Un projet dont les agents travaillent le montre dans son propre point, qui respire lentement.
  Avant, il portait un compteur orange à côté de son nom, avec l'air de quelque chose qui attend
  une réponse — le badge ambre en bas du menu, celui qui a vraiment besoin de toi, est désormais le
  seul à ressembler à ça.
- Supprimer depuis le menu du clic droit demandait dans la pastille en haut de la fenêtre, la forme
  prévue pour le téléphone, au lieu de la boîte de dialogue. Cela n'arrivait qu'en travaillant sur
  l'app, et la question pouvait même se perdre.
- La liste de `{{` d'un hook dit ce que contient chaque variable, pas seulement son nom, et les
  flèches la font défiler : passé la huitième, la ligne sélectionnée passait sous la coupure.
