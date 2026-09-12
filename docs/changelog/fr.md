# Nouveautés

Les versions antérieures à la 0.6.0 sont dans le CHANGELOG du dépôt, en anglais.

## Non publié

### Nouveau

- **Coller du code le met dans un bloc de code.** Plusieurs lignes qui ressemblent à du code —
  indentées, finissant par des accolades ou des points-virgules, commençant par `import`, `def`,
  `SELECT` et consorts — atterrissent dans un bloc ``` à elles, sur leurs propres lignes, le curseur
  après. La prose et les listes restent telles quelles, de même qu'un collage dans un bloc déjà
  ouvert.
- **Réessayer depuis l'erreur elle-même.** Quand une exécution finit en erreur, la boîte rouge de
  l'activité porte maintenant « Réessayer avec… », le même dialogue qui vivait à deux clics dans la
  carte : un autre agent, un autre modèle, le même prompt.
- **Le menu de la zone de notification parle la langue de l'application.** « Afficher », « Quitter »
  et l'infobulle étaient écrits dans le binaire, en espagnol. Ils viennent maintenant des
  dictionnaires, comme chaque autre phrase, et changent avec la langue choisie.
- **La zone de saisie aide à écrire du markdown, et le fil l'affiche.** Ctrl+B, Ctrl+I et Ctrl+E
  mettent la sélection en gras, italique ou code, et à nouveau l'annulent ; Ctrl+Shift+K en fait un
  lien. Shift+Entrée sur un élément de liste commence le suivant — `-` reste `-`, `3.` devient `4.`,
  une case cochée revient vide — et sur un élément vide termine la liste. Ce que vous avez envoyé
  s'affiche ensuite comme vous l'avez écrit : listes, liens et blocs de code dans votre propre bulle,
  dans le fil et dans les chats, là où c'était le texte brut avec les astérisques dedans.
- **Un bloc de code dans la zone de saisie en a l'air.** Taper ``` posait un surlignage gris
  arrondi derrière les lignes, accents graves compris. C'est maintenant une boîte de la largeur de
  la zone et de la hauteur du code, aux coins droits, avec les lignes de délimitation estompées pour
  que le code soit ce que l'on voit. Désormais les mots sont dessinés par la couche sous le
  textarea, ce qui rend cela possible.

### Corrigé

- **« Envoyer maintenant » livre votre message d'abord.** Arrêter un agent pour lui remettre un
  message, alors qu'une exécution attendait aussi son tour pour cet agent, lançait l'exécution en
  attente et gardait votre message derrière — l'interruption ne servait à rien. Le message passe
  maintenant en premier.

## 0.17.0 — 2026-09-11

### Nouveau

- **La fenêtre revient comme vous l'aviez laissée.** Taille, position, agrandie ou en plein écran :
  le lancement suivant s'ouvre là où le précédent s'est terminé, sur le même écran s'il est encore
  là, au lieu de 1400×900 au milieu de l'écran à chaque fois. Noté quand la fenêtre part dans la
  zone de notification et quand l'application se ferme.

### Modifié

- **Cliquer sur le projet où vous êtes déjà mène à son orchestrateur.** Le premier clic ouvre
  toujours un projet là où vous l'aviez laissé — le tableau, la hiérarchie, un chat. Un second clic
  sur le même projet, qui ne faisait rien, mène désormais au fil de l'orchestrateur : le seul
  endroit vers lequel il n'y avait pas de raccourci.

### Corrigé

- **Deux processus pour un même agent.** L'équipe est une hiérarchie avec un seul exemplaire de
  chaque agent, et rien ne le faisait respecter. Quand un implémenteur terminait alors que le
  reviewer travaillait encore sur la tâche que le planner lui avait confiée, la revue démarrait
  quand même — un second `agy.exe` sur le même reviewer, écrivant la même conversation, tant que les
  deux tournaient. Désormais un agent est un seul processus : le travail qui arrive à un agent en
  plein tour — une délégation, une revue, la réponse à sa question, une nouvelle tentative — est
  noté comme exécution en attente et démarre quand ce tour se termine, dans l'ordre d'arrivée. Le
  planner continue de l'attendre, la carte du tableau la connaît et le fil dit qui est attendu.
  Arrêter l'agent abandonne aussi ce qui attendait pour lui.

- **Le jeton du bot Telegram était écrit dans le journal.** À chaque interrogation de Telegram en
  échec — toutes les quarante-cinq secondes, tant que le réseau était coupé — l'URL entière était
  journalisée, et Telegram porte le jeton dans le chemin de cette URL :
  `api.telegram.org/bot<id>:<token>/getUpdates`. Le masqueur connaissait `token=`, `Bearer` et
  `api_key`, pas cette forme. Il la connaît désormais, des deux côtés de l'application, et rien de
  ce qui atteint le fichier journal ne la porte plus. **Si vos fichiers journaux ont déjà quitté
  votre machine, révoquez le jeton dans BotFather et collez-en un nouveau** — l'ancien est dans
  chaque `ainess-<date>.log` écrit avant cette version.


- **Un toast rouge disant « idle » pendant qu'un planificateur attendait ses implémenteurs.** Le
  texte était `root agent idle; waiting for 1 background task(s)` — Claude Code, sur stderr,
  signalant qu'il attend une sous-tâche, ce qui est exactement ce qu'il doit faire. Chaque ligne
  qu'un CLI écrivait sur stderr était classée comme erreur, et chaque erreur fait un toast. Une
  ligne stderr est désormais gardée pour ce qu'elle est : une ligne mono ordinaire dans l'activité
  de l'exécution, tandis qu'une erreur que le CLI nomme vraiment dans sa sortie structurée reste
  une erreur, rouge, avec son toast.


- **Plus de toasts pour le projet que vous regardez.** Un toast disant qu'un agent a délégué, ou
  qu'une tâche est terminée, dans le fil même où cela vient d'apparaître est une boîte par-dessus ce
  qu'elle répète. Ils sont retenus tant que la fenêtre est au premier plan et le projet à l'écran,
  et toujours affichés quand la fenêtre est en arrière-plan — le seul moment où ils servent.
- **Fermer un toast ne ferme plus le dialogue derrière lui.** Le toaster vit hors de tout dialogue
  par construction, et le dialogue prenait tout clic hors de lui-même comme raison de se fermer. Un
  toast n'est pas dehors ; il est dessus.

## 0.16.0 — 2026-09-11

### Nouveau

- **`--header` dans `ainess mcp add|edit`.** L'application sait donner à un serveur MCP hébergé
  les en-têtes qu'il demande depuis la 0.14.0 ; le CLI ne le pouvait pas. Désormais
  `--header "Nom: valeur"`, répétable, coupé au premier deux-points pour qu'une valeur ayant ses
  propres deux-points — une URL, un jeton en base64 — arrive entière. Sur `edit` les nouveaux
  en-têtes rejoignent les existants, et `--header "Nom:"` en retire un. Un en-tête est un
  identifiant, donc il n'atteint jamais un journal ni une sortie : la ligne de démarrage du CLI
  masque la valeur, et `--json` imprime `***` à sa place.

### Corrigé

- **Le bouton « Ajouter une commande » de la vérification ne faisait rien.** Depuis la 0.15.0. Il
  donnait à la ligne une commande vide, la commande vide était refusée comme invalide avant que la
  ligne existe, et le clic s'arrêtait là — les suggestions en un clic marchaient, le bouton non.
  Trouvé par le premier test de composant jamais écrit pour cette application, le jour de sa
  création.


- **Ce qu'un agent dit pendant qu'il travaille ne disparaît plus quand il s'arrête.** Deux
  personnes l'ont signalé par les deux bouts — « ma réponse a disparu quand il a délégué, il ne
  restait que la délégation » et « les réponses partielles sont perdues à la fin de l'activité, il
  ne montre que la dernière chose dite » — et c'est le même bug.

  Deux choses distinctes portent les mots d'un agent. Le flux porte tout ce qu'il dit au fur et à
  mesure. `run.output` est la réponse *finale* du fournisseur : pour Claude, la ligne `result`, qui
  est le dernier message et rien que lui. La bulle affichait `run.output`. Un tour qui expliquait ce
  qu'il avait trouvé, lançait trois outils et se terminait par une délégation perdait donc tout ce
  qui précédait, à l'instant où il cessait de tourner.

  Rien n'était réellement perdu : le flux est dans le fil de communication et dans la liste
  d'activité. Il avait seulement cessé d'être là où quelqu'un regardait, et un tour sans outils
  n'affichait même pas la section d'activité. La bulle montre désormais tout le tour, et n'ajoute la
  réponse finale que lorsqu'elle dit quelque chose que la transcription ne contient pas déjà. Le
  chat en tête-à-tête perdait la même chose par l'autre bout — sa bulle était écrasée par la
  réponse finale à la fin du tour — et suit désormais la même règle.

- **La liste de modèles de Claude n'avait pas Fable, et `fable-5.1` n'est pas son nom.** Elle est
  écrite dans le code, contrairement à celles d'antigravity et d'opencode qui sont interrogées : elle
  vieillit donc en silence. L'écrire à la main n'aidait pas non plus : Claude Code répond
  `unrecognized_model` à `fable-5.1`, car l'identifiant qu'il accepte est `claude-fable-5-1`. Les
  deux sont corrigés.


- **L'application parle sept langues partout, pas seulement là où quelqu'un y a pensé.** Cent sept
  phrases étaient écrites dans le code au lieu des dictionnaires : chaque toast et chaque dialogue
  produit par une opération de worktree, chaque message que renvoie un tunnel ou une installation
  ratée, les cartes de tâches, et tout le CLI, écran d'aide compris. Six des sept langues les
  recevaient dans une langue que personne n'avait choisie, et rien ne le remarquait — c'est ainsi
  qu'on en est arrivé à cent : chacune n'était qu'une ligne sur le moment.

  Elles n'étaient pas toutes de même nature. Ce qu'un utilisateur lit est parti dans les
  dictionnaires. Ce que seul un développeur lit — toutes les lignes de log — est désormais en
  anglais : un log se grep, se colle dans un ticket et se lit par qui débogue, et en traduire un le
  rend inutile à tout le monde sauf à la personne dont c'est la langue.

  L'aide du CLI est une seule entrée par langue et non vingt-quatre, parce que ses colonnes sont
  alignées et que les garder alignées est une décision par langue : l'allemand prend plus de place
  que le japonais, et deux douzaines d'entrées séparées laisseraient l'une d'elles se désaligner
  sans rien pour le montrer.

  Et il y a maintenant quelque chose qui le remarque : une vérification qui échoue sur un littéral
  se lisant comme de la prose espagnole hors de `src/i18n`, exécutée avec la suite de tests. Elle
  cherche de l'espagnol et non du texte, donc l'anglais dans lequel le code est écrit n'est pas
  signalé. Deux lignes sont autorisées et chacune dit pourquoi : les valeurs de rôle d'un chat sont
  enregistrées sur le chat et partent dans la consigne de l'agent, ce sont donc des données, pas des
  libellés.

- **Le chat devenant blanc à l'envoi d'un message.** Signalé quatre fois, jamais reproduit, jamais
  journalisé — parce que rien ne tombait en panne au sens où tout le monde cherchait. Aucune
  exception n'était levée, les messages étaient toujours dans le store, et changer de projet les
  ramenait : la signature de quelque chose qui est toujours là et qu'on ne montre pas.

  Le fil suit sa propre fin toutes les 150 ms pendant qu'une réponse s'écrit, et il le faisait avec
  `scrollIntoView`. Cette méthode ne fait pas défiler *un* conteneur : elle remonte depuis l'élément
  et fait défiler **tous les conteneurs de défilement du chemin**, autant que chacun en a besoin. Et
  `overflow: hidden` ne dispense pas une boîte d'être un conteneur de défilement : cela retire la
  barre et coupe la molette, tandis que `scrollTop` continue de fonctionner. Le shell de
  l'application est en `h-screen overflow-hidden`, plusieurs boîtes en dessous aussi : un shell dont
  le contenu dépassait de quelques pixels pouvait donc être défilé par cet appel — et le restait :
  pas de barre, pas de molette, rien pour le remettre. La conversation montait hors de vue et y
  restait jusqu'à ce que quelque chose force un relayout : ouvrir un panneau, changer de projet.

  Cela n'arrivait qu'à l'envoi d'un message parce que cette boucle ne tourne que pendant qu'une
  réponse arrive. Et le harnais construit pour l'attraper n'a jamais pu : son transport ne sait pas
  démarrer une exécution, donc la boucle qu'il devait solliciter n'a jamais démarré une seule fois.

  Les trois fils écrivent désormais `scrollTop` sur le conteneur qu'ils tiennent déjà, ce qui touche
  cet élément et rien au-dessus. Ils vérifient aussi, au même rythme, si quelque chose au-dessus a
  été défilé — rien là-haut ne devrait jamais l'être — et le remettent, avec une ligne dans le
  journal disant quelle boîte et de combien. Si cela se reproduit, il y aura enfin quelque chose à
  lire.


- **Changer l'équipe d'un projet ne laisse plus son planificateur déléguer à des agents disparus.**
  Une délégation se résout par nom contre les enfants du planificateur, et les noms que celui-ci
  connaît viennent du system prompt qu'on lui a remis. Mais la session est *reprise* : le CLI rejoue
  toute la conversation précédente, où l'ancienne équipe était listée et où les délégations vers ces
  noms ont été faites et ont fonctionné — et une transcription pèse plus lourd qu'un system prompt
  ajouté par-dessus. Renommer un agent, changer de formation ou ajouter un implémenteur laissait
  donc le planificateur parler à une équipe qui n'existait plus, et le travail revenait en
  « délégation échouée ».

  La session garde désormais une note de ce qu'on lui a dit de l'équipe : le nom de cet agent et
  celui de ses enfants, rien d'autre, car les noms sont tout ce contre quoi une délégation se
  résout. Quand cela ne correspond plus, le tour suivant ouvre une nouvelle conversation au lieu de
  reprendre la mauvaise, et le dit. Les sessions ouvertes avant sont adoptées plutôt que jetées : le
  remède ne peut pas être que tous les agents de tous les projets perdent leur contexte.

- **Une délégation qui nomme un agent inexistant ne perd plus ce travail en silence.** Quand tous
  les noms étaient faux, le tour était relancé, et c'était juste. Quand *certains* l'étaient, les
  valides démarraient, les invalides laissaient une erreur dans le fil, et du travail qu'ils
  portaient il n'était plus jamais question — par personne, à personne. Ces noms voyagent maintenant
  jusqu'à la fin du tour et sont placés devant le planificateur quand il reprend, avec la liste de
  ceux qui dépendent réellement de lui. Et un nom qui ne correspondait à personne est pris pour ce
  qu'il est — la preuve que la session se souvient d'une équipe antérieure — donc cette session est
  abandonnée et le tour suivant repart de l'équipe qui existe.

## 0.15.0 — 2026-09-11

### Nouveau

- **Les lignes de la hiérarchie relient enfin quelque chose.** Les cartes des agents ont toujours
  dessiné des points de connexion — c'est de là que partent les flèches — mais le canevas n'était
  pas connectable : ils avaient l'air de quelque chose qu'on pouvait tirer, sans l'être. Tirer une
  ligne d'une carte à une autre place désormais cet agent sous un nouveau planificateur. Les règles
  sont celles que l'éditeur d'agents appliquait déjà — pas à lui-même, pas sous quelqu'un qui est
  déjà en dessous de lui, et un seul planificateur au sommet — lues au même endroit plutôt
  qu'écrites une seconde fois, pour que les deux écrans ne finissent pas par diverger sur ce qu'est
  une équipe valide.


- **Un projet peut dire ce que « terminé » veut dire, et ainess le vérifie.** Jusqu'ici une tâche
  avançait parce que le processus de l'agent s'était terminé avec un code zéro. Rien d'autre n'était
  regardé, donc « terminé » voulait dire « le CLI est revenu » — et s'apercevoir du contraire était
  votre travail, le matin, carte par carte. Un projet peut désormais lister ses propres commandes
  (`npm test`, `npx tsc --noEmit`, `cargo check`), et quand un agent termine un travail délégué elles
  sont exécutées dans le dossier où il a réellement travaillé — son worktree, s'il en a un, pour que
  les tests voient le code qui vient d'être écrit. Si elles passent, la carte continue comme avant,
  vers le relecteur s'il y en a un. Si elles échouent, la carte vous revient avec le nom de la
  commande et ce qu'elle a affiché, un message dans le fil et un hook `verify.failed` pour que le
  téléphone vous prévienne à trois heures du matin. Les commandes que le projet déclare déjà —
  `test`, `lint`, `typecheck`, `check`, `build` de son package.json, Makefile ou Cargo.toml — sont
  proposées en un clic.

- **Annuler ce qu'une exécution a fait.** Une exécution notait déjà où elle avait eu lieu et sur
  quel commit elle s'était ouverte, parce que le panneau de diff en avait besoin ; ce qui manquait,
  c'était de savoir ce que le dossier avait *déjà* en cours. Sans cela, « annuler l'exécution » et
  « jeter tout ce qui n'est pas commité » sont la même commande, et ce ne sont pas la même chose :
  la seconde dévore le travail que vous avez fait vous-même sans jamais le dire. Une exécution note
  donc aussi ce qui était modifié ou non suivi quand elle a commencé, et le détail d'une exécution
  terminée a un bouton qui remet le dossier en état.

- **Un plafond pour une exécution, pas seulement pour la journée.** Les limites journalière et
  mensuelle n'ont jamais empêché une seule exécution de dépenser le quota de la journée d'un coup :
  ce sont des totaux, et un total ne s'en aperçoit qu'après. Un projet peut désormais fixer aussi ce
  qu'une exécution a le droit de coûter.

  Ce que cela peut honnêtement faire mérite d'être dit clairement, car ce n'est pas ce qu'on
  supposerait. Tous les CLI d'ici indiquent leur coût quand ils ont fini, pas pendant qu'ils
  travaillent — une exécution qui dépasse ne peut donc pas être coupée en cours de route, puisque
  tant qu'elle n'est pas terminée l'application ignore le prix. Ce que fait le plafond, c'est
  arrêter la *suivante* : dès qu'une exécution annonce qu'elle a dépassé, le message le dit, et
  aucun autre tour de ce même travail ne démarre. Toute la chaîne compte, pas seulement la dernière
  exécution, donc une délégation d'il y a deux tours qui a coûté une fortune l'arrête quand même —
  sinon un plafond n'en est plus un. Un budget réglé sur « avertir seulement » se contente toujours
  d'avertir.

  C'est délibérément conservateur, et cela le dit à voix haute avant de toucher à quoi que ce soit :
  la liste des fichiers qui reviennent, celle des fichiers supprimés parce qu'ils n'existaient pas
  avant, et celle à laquelle il ne touchera pas — les fichiers déjà modifiés au démarrage, où votre
  modification et celle de l'agent sont dans le même fichier et où rien ici ne peut les distinguer.
  Supprimer, c'est `git clean` avec une liste explicite de chemins, jamais lâché sur le dossier. Les
  exécutions antérieures proposent aussi le bouton, en considérant que le dossier était propre au
  départ, ce qui est la seule chose que l'on puisse en supposer.

  Rien n'est relancé automatiquement. Un échec que l'agent ne peut pas corriger deviendrait une
  boucle tournant toute la nuit, et décider de renvoyer un travail est une décision, pas un réflexe.

  Ce que vous tapez est découpé en programme et arguments sous vos yeux, et les morceaux sont montrés
  sous le champ, parce que c'est ainsi qu'il est lancé : rien de ce qui est tapé ici n'atteint jamais
  un shell. Un `&&`, un tube ou une redirection sont refusés avec un motif plutôt qu'échappés en
  silence — l'application tourne sur le shell que la machine propose et ils ne s'accordent pas sur
  les guillemets. Deux commandes est la réponse à vouloir deux commandes. Un projet sans commande
  listée se comporte exactement comme avant.


### Corrigé

- **On peut parler à un planificateur qui a délégué pendant que ses implémenteurs travaillent.** Il
  mettait votre message en file jusqu'au retour du tour complet, ce qui faisait du seul agent dont
  le métier est de continuer à planifier le seul qu'on ne pouvait pas joindre pendant que du travail
  était en cours. La cause tenait à un mot qui faisait trois métiers : « en attente » voulait dire
  en attente d'une réponse, en pause jusqu'au retour du quota, *et* en attente des implémenteurs —
  et seul le dernier décrit un agent sans aucun processus à lui. Ce dernier cas prend maintenant le
  message et démarre un tour ; les deux autres continuent d'attendre, car un nouveau tour y
  parlerait par-dessus ce que l'on attend précisément.

  Ce qui en fait plus qu'un changement d'une ligne, c'est ce qui se passe quand les implémenteurs
  reviennent alors que le planificateur est en train de vous répondre. Deux exécutions d'un agent,
  ce sont deux auteurs sur une même session CLI : les résultats attendent donc la fin de ce tour et
  sont remis juste après — le fil de la tâche d'abord, avant tout ce qui attend par ailleurs. Et un
  planificateur dont le tour se termine alors que du travail qu'il a distribué tourne encore
  s'affiche désormais comme en attente et non comme libre, ce qu'il est.

- **Un agent qui pose éternellement la même question s'arrête.** Répondre à une question reprend
  l'agent dans le tour où il était déjà — une question ne fait pas avancer le tour — et le tour est
  la seule chose que `maxRounds` compte. Un agent qui répond à chaque réponse par une autre question
  n'avait donc absolument rien qui le borne : vous répondez, il redemande, et la seule chose qui y
  met fin, c'est que vous renonciez. Le mode autonome l'avait remarqué et s'était donné son propre
  plafond, mais seulement pour les questions qu'il répond lui-même ; quand c'était vous qui
  répondiez, il n'y avait de plafond nulle part.

  Deux règles désormais. Une question à laquelle cette tâche a déjà répondu n'est pas reposée : la
  réponse est enregistrée, elle repart donc directement, et ce n'est pas un jugement. Et une tâche
  qui a demandé douze fois cesse de demander et le dit, parce que douze tours en rond font un
  mauvais après-midi et qu'une nuit ainsi est pire. Poser beaucoup de questions *différentes* reste
  permis : on borne le nombre, jamais le contenu.


- **L'application a cessé de dépenser plus de chaque seconde dont elle disposait à s'écrire un
  fichier à elle-même.** L'historique d'un projet est réécrit en entier dès que quelque chose y
  change, et relu et analysé au préalable pour ne pas perdre une décision prise dans le CLI ou sur le
  téléphone. C'est bon marché pour un fil de messages et ruineux pour un fil de sortie brute des CLI,
  ce qu'il était largement devenu : sur la machine où cela a été trouvé, le fichier d'un projet
  atteignait **47 Mo, dont 83 % de lignes brutes**, et chaque sauvegarde coûtait 283 ms de calcul sur
  le fil d'exécution de l'interface — deux fois par seconde, aussi longtemps qu'un agent travaillait.
  Cela fait 566 ms de chaque seconde passées à réfléchir au lieu de dessiner, ce qui explique
  exactement pourquoi l'application ralentissait au moment même où il y avait quelque chose à
  regarder, et pourquoi envoyer un message pouvait laisser le fil vide jusqu'à ce que n'importe
  quoi — ouvrir un panneau, changer de projet — la force à dessiner de nouveau. Ce n'étaient jamais
  les animations, ni la sortie de l'agent qui arrivait : l'agent imprime une ou deux lignes par
  seconde. C'était l'application, en conversation avec son propre disque.

  L'ancienne limite comptait les lignes sans regarder leur taille, ce qui revenait à mesurer la
  mauvaise chose : la ligne médiane fait 313 caractères et la plus grande mesurée en faisait 536 Ko.
  Désormais une ligne est coupée à 2 Ko, une exécution en garde 64 Ko, et seules les trente dernières
  exécutions en gardent — les plus anciennes conservent leur consigne, leur réponse et leur coût, et
  ne perdent que la transcription de la façon dont le CLI l'a dit. Le même fichier tombe à 7 Mo et
  une sauvegarde coûte 44 ms. La sauvegarde attendant en outre trois secondes au lieu d'une
  demi-seconde pendant qu'un agent travaille, l'interface est passée de **566 ms par seconde à 15**.
  Rien à faire sur un historique existant : la première sauvegarde le réécrit à la nouvelle taille.


- **Une option écrite sans rien derrière n'est plus prise pour sa propre valeur.** `ainess hook add
  --action slack --url --template "..."` — `--url` sans rien derrière — enregistrait la simple
  présence de l'option à la place de l'adresse du webhook, et le hook était sauvegardé pointant vers
  quelque chose que personne n'avait écrit : il n'aboutissait nulle part et ne disait jamais
  pourquoi. Maintenant il s'arrête et signale que `--url` manque, ce qui était le cas. Pareil pour
  `--program`, `--args` et `--template` : une option sans rien derrière est une option que vous avez
  oublié de remplir, pas une valeur.
- **Un tour de Claude qui démarre sans identifiant de session ouvre une nouvelle conversation au lieu
  d'en reprendre une vide.** ainess retient l'identifiant annoncé par le fournisseur pour que le
  message suivant poursuive le même fil. Une ligne d'ouverture arrivée sans identifiant était retenue
  quand même, comme rien, et le tour suivant demandait à Claude de reprendre une session sans nom.
  Cette ligne est désormais ignorée, donc le tour suivant démarre propre — ce à quoi il allait
  aboutir de toute façon, mais sans la reprise ratée en chemin.

## 0.14.0 — 2026-09-11

### Nouveau

- **Un serveur MCP hébergé peut enfin recevoir les en-têtes qu'il demande.** ainess écrivait un
  serveur http dans la configuration de session comme un type et une URL, rien d'autre : tout ce qui
  se trouvait derrière un jeton bearer était donc inatteignable, le champ pour le jeton n'existait
  pas. Il existe maintenant : un en-tête par ligne, `Nom : valeur`, sur un serveur http. La valeur
  est coupée au premier deux-points et non au dernier, car une valeur a ses propres deux-points (une
  URL, une heure, un jeton en base64) et couper à la fin remet au serveur la moitié d'une
  authentification — une panne qui apparaît bien plus tard, sous la forme d'une erreur
  d'authentification que personne ne remonte jusqu'à un signe de ponctuation. Écrivez
  `Bearer ${VOTRE_VARIABLE}` et le client l'étend depuis l'environnement au moment de se connecter,
  si bien que le secret n'entre jamais dans le fichier de configuration. Antigravity les reçoit
  aussi, via `agy mcp add --header`, l'option et la valeur en arguments séparés et jamais une ligne
  de commande assemblée en collant des chaînes. Et quand cette commande échoue, sa sortie vous est
  montrée après en avoir retiré l'identifiant : le message nomme toujours le serveur en cause, la
  seule partie qui ait jamais servi.

### Corrigé

- **Demander à Antigravity ce qu'il lui reste n'ouvre plus de terminal.** L'application prend une
  console au démarrage et la cache, pour que tout ce qu'un agent lance à son tour en hérite et que
  rien ne fasse surgir de fenêtre, à quelque profondeur que ce soit. Les sondes courtes en
  héritaient aussi — et cacher une console suppose que `ShowWindow` atteigne la fenêtre qui
  l'affiche, ce qui sous Windows 11, où l'hôte de console par défaut est Windows Terminal dans son
  propre processus, n'est pas le cas. Un enfant qui dessine un spinner fait remonter cette fenêtre,
  et `agy models` en dessine un. Les sondes n'ont désormais aucune console : le même drapeau que la
  détection de versions et les commandes d'entretien passent depuis toujours. Les agents ne changent
  pas — ce sont eux qui ont un arbre en dessous ayant besoin d'hériter d'une console.

- **Le champ des variables d'environnement sert à quelque chose sur un serveur http.** Il y était
  dessiné et n'allait nulle part : la branche http de la configuration de session n'a jamais écrit
  `env`, une clé tapée là sur un serveur http était donc enregistrée dans le fichier de
  configuration et n'allait nulle part. Un serveur MCP http n'a pas de processus à lui, mais l'agent
  si — et l'environnement de l'agent est exactement là où le client MCP regarde quand il étend
  `${VARIABLE}` dans un en-tête. C'est là qu'elles vont. Mettez la clé dans le champ, écrivez
  `X-Goog-Api-Key: ${VOTRE_CLE}` dans les en-têtes, et la connexion se fait sans toucher à
  l'environnement de la machine ni redémarrer quoi que ce soit. Le champ dit ce que cela coûte, car
  c'est plus large qu'il n'y paraît : une variable posée là appartient au processus de l'agent, donc
  tout serveur MCP qui étend des variables la voit, et tout ce que l'agent exécute aussi. Cela vous
  fait garder la clé dans l'application plutôt que dans Windows ; cela ne vous achète pas le secret.
  Les variables d'un serveur stdio restent intactes.
- **Le champ cesse de se redessiner deux fois par seconde pour une conversation immobile.** Le fait
  qu'une conversation soit en train de répondre vit dans la mémoire du module de chat et non dans le
  store : rien ne pouvait donc y réagir, et le champ interrogeait sur un minuteur de 500 ms tant
  qu'une conversation était ouverte, qu'il se passe quelque chose ou non. Il y est abonné
  maintenant — le champ se redessine quand un tour commence ou se termine, et pas autrement.

- **Taper vite ne fait plus travailler toute l'application à chaque lettre, et un panneau qui casse
  dit ce qui a cassé.** Ce que vous tapez appartient à la conversation, cela vivait donc dans le
  store — et y était écrit à chaque frappe. Le store exécute le sélecteur de chaque abonné à chaque
  écriture : chaque caractère relançait donc les sélecteurs de tous les écrans montés et
  re-rendait ce qu'ils alimentaient. Le champ est maintenant local et le store est écrit derrière :
  avec un délai pendant la frappe, et immédiatement quand quelque chose ne doit pas se perdre — un
  champ vidé, un changement de conversation, le fait de quitter l'écran. Par ailleurs :
  l'application n'avait aucune error boundary nulle part, si bien qu'une erreur de rendu emportait
  la fenêtre entière sans message et sans rien dans le journal, puisque ce qui l'aurait écrit
  mourait aussi. Le fil et le champ sont désormais chacun leur propre limite. Un panneau qui lève
  une erreur la garde chez lui, l'affiche et écrit la pile dans le journal — c'est la différence
  entre un bug qu'on peut signaler et un qu'on ne peut décrire que comme un écran devenu noir.

- **Le champ vide ne dessine plus deux phrases dans la même ligne d'espace.** La suggestion grise
  est peinte sur la couche derrière la zone de texte, qui porte le même remplissage qu'elle pour
  s'aligner sur ce que vous tapez — et un champ vide commence exactement à ce point, là où se trouve
  le texte indicatif. Alors quand le dernier message de l'agent finissait par une question fermée et
  que vous n'aviez encore rien écrit, « Sí, dale » et « Escribí mientras trabaja… » s'imprimaient
  l'un sur l'autre et aucun n'était lisible. La place revient désormais à la suggestion : c'est le
  travail du texte indicatif lui-même — dire à un champ vide quoi faire de lui — fait avec la
  conversation en main plutôt qu'en général. L'indice rotatif s'efface pour la même raison et au
  même endroit.

## 0.13.0 — 2026-09-10

### Nouveau

- **Un nouvel agent naît en approuvant automatiquement ses propres outils, et la CLI peut toujours
  dire le contraire.** ainess lance ces CLI en headless : personne n'est assis devant le processus
  pour lui répondre. Un agent créé avec la permission retenue était lancé avec `--permission-mode
  acceptEdits`, il demandait donc avant tout ce qui n'était pas une édition et restait là jusqu'à
  ce que quelqu'un s'en aperçoive — ce qui se lit exactement comme l'approbation de délégation, avec
  laquelle cela n'a rien à voir. Les nouveaux agents démarrent désormais avec cette option activée,
  dans la boîte de dialogue comme dans `ainess agents add`, et l'interrupteur dit en une ligne ce
  que cela signifie. Rien de ce qui est déjà enregistré n'est touché : activer une permission sur
  un agent que quelqu'un a configuré n'est pas un défaut, c'est un changement qu'il n'a pas
  demandé, et modifier un agent laisse toujours chaque réglage que la modification n'a pas nommé
  exactement où il était. Dans le même mouvement, la CLI a gagné `--no-auto-approve`, parce qu'une
  option booléenne n'a pas d'arrêt — `--auto-approve=false` est refusé net — et le jour où le
  défaut a basculé est le jour où un script ne pouvait plus monter une équipe aux outils retenus.
  Les deux passées en même temps : l'arrêt gagne, entre deux lectures d'une commande contradictoire
  celle qui accorde le moins.

- **Approuver et répondre depuis Telegram, Discord et Slack en appuyant sur un bouton.** Tout ce
  que le pont savait faire devait être tapé, et les deux choses qui vous attendent vraiment devaient
  l'être avec un identifiant recopié du message au-dessus : `/approve 3f2a1b2c`. Sur un téléphone
  c'est la différence entre répondre et ne pas répondre. Une délégation retenue pour approbation
  arrive désormais avec un oui et un non en dessous, et une question avec un bouton par option. Les
  trois plateformes livrent l'appui par la connexion qu'elles tiennent déjà ouverte — Telegram avec
  ses updates, Discord par la Gateway, Slack par Socket Mode — donc rien n'est exposé et aucune de
  vos adresses ne part nulle part. L'appui passe par la même porte qu'un message tapé, et c'est
  voulu : la liste d'autorisation est vérifiée à un seul endroit et un bouton n'est pas un moyen de
  la contourner. Rien n'est cru sur parole non plus : l'identifiant doit être encore en attente et
  l'option doit être une de celles que la question a vraiment, donc un vieux bouton dans un message
  d'hier ne décide rien une seconde fois. Une question à plusieurs réponses n'a pas de boutons, car
  un appui est une option et c'est une réponse différente de celle demandée ; celles-là se tapent
  toujours, et le message le dit.

- **L'écran d'accueil lance le travail au lieu de le lister.** C'était un tableau de bord : chaque
  projet en ligne, ce qui vous attendait, ce qui tournait. Tout cela vit déjà là où c'est sa place —
  la barre latérale tient les projets et le bouton pour en créer un, le panneau au-dessus continue de
  montrer ce qui est retenu en attente d'approbation, la cloche et la barre des tâches signalent
  qu'on attend une réponse. Il y avait donc ici une seconde copie de tout ça, précisément au seul
  endroit où ce qu'on ne peut faire nulle part ailleurs, c'est commencer. C'est maintenant un champ,
  au milieu, et rien au-dessus : écrivez ce que vous voulez, choisissez le dossier et une de vos
  équipes, le projet est créé et le prompt part. Si le dossier est déjà un projet, ça y va, avec son
  équipe — deux projets sur un même espace de travail seraient deux équipes modifiant les mêmes
  fichiers sans se connaître, et un dossier reste le même dossier quelle que soit la façon de
  l'écrire. Il n'invente pas d'équipe : sans aucune enregistrée, il indique où on les crée, et une
  équipe sans agent racine est annoncée plutôt que le prompt confié au premier agent venu. Sous le
  champ, le seul chiffre qu'aucun autre écran n'additionne entre projets : ce qu'ont coûté les quinze
  derniers jours, en tâches, tokens et dollars. Rien n'y est estimé — un CLI qui ne rapporte aucune
  consommation compte comme une exécution et zéro token, et une quinzaine où aucun n'a rapporté le
  dit plutôt que de tracer une ligne plate.

### Corrigé

- **`ainess agents edit` ne défait plus en silence une permission que vous aviez posée.** Chaque
  éditeur remet au store un agent entier et le store le met à la place de l'ancien : un champ que
  cet éditeur n'a pas construit dans l'objet n'est donc pas laissé tranquille, il disparaît. La CLI
  construit cet objet à partir de ses propres options, et elle n'en a aucune pour la dérogation
  d'approbation des délégations, ni pour le worktree, ni pour la reprise après quota. `ainess agents
  edit Impl --model x` remettait donc un agent réglé sur « ne jamais demander » à suivre le réglage
  global, et avec ce réglage activé il redemandait une approbation à la délégation suivante. Une
  modification se pose désormais par-dessus l'agent qui était là : ce qu'elle nomme l'emporte, ce
  qu'elle ne nomme pas est conservé. Et le nommer compte même quand la valeur est « suivre le
  réglage global », qui voyage comme rien du tout et doit pouvoir effacer un « jamais ».

- **Une conversation ne devient plus vide quand vous y envoyez un message.** Charger une
  conversation, c'est lire un fichier, et lire un fichier prend du temps. Dans cette fenêtre, trois
  choses différentes tournaient mal et les trois finissaient pareil : l'historique disparu jusqu'à
  ce qu'on quitte la conversation et qu'on y revienne, ce qui relançait la lecture. Un message
  envoyé pendant la lecture était écrasé par un fichier écrit avant qu'il n'existe — la mémoire
  gagne désormais, et ce qui est arrivé pendant la lecture est conservé. Une lecture en échec
  s'échappait du chargeur au lieu d'être attrapée, laissant la conversation sans rien en mémoire ;
  elle peut échouer pour une raison banale, comme tomber au moment où ce même fichier est écrit. Et
  un rechargement posait trois squelettes gris sur un historique qui était là, ce qui se lit comme
  une conversation perdue.

## 0.12.0 — 2026-09-10

### Nouveau

- **Les messages mis en file pendant qu'un agent travaille partent tous ensemble, en un seul.**
  Avant, ils partaient à la queue leu leu : le premier à la fin du tour, le second attendant la fin
  de *ce* tour-là. Trois lignes écrites d'une traite devenaient trois tours — trois exécutions,
  trois cartes sur le tableau, et un agent agissant sur la première avant d'avoir lu la correction
  de la troisième. Ils sont désormais remis en un seul prompt, dans l'ordre où ils ont été écrits
  et sans rien y ajouter : une ligne vide entre eux, comme si vous l'aviez tapé ainsi. « Envoyer
  maintenant » fait de même, donc interrompre un tour pour livrer un message sur trois n'est plus
  trois tours ; c'est un bouton pour le bloc plutôt qu'un par ligne, et chaque ligne peut toujours
  être retirée seule avant de partir.

- **Seulement ce que l'agent fait maintenant, sur une ligne.** Un agent au travail écrit une ligne
  par outil qu'il utilise, et une longue exécution en écrit des centaines : le fil se remplissait de
  ce qu'il avait déjà terminé, et la seule ligne qui valait la peine d'être lue — ce qu'il fait
  *à cet instant* — se retrouvait enterrée plus haut. Les étapes défilent maintenant dans un
  bandeau. Il fait une ligne de haut et son débordement est masqué : l'étape qui vient de finir
  sort par le haut pendant que la nouvelle arrive par le bas. Le mouvement est l'essentiel : une
  ligne qui change son texte sur place a la même allure qu'elle ait changé une fois ou quarante, et
  « est-ce que ça tourne encore ? » était exactement la question que posait un mur de texte immobile.
  Un clic sur la ligne ouvre l'historique au-dessus ; un nouveau clic sur la même ligne le referme.
  Trois choses ne se replient jamais : le texte de l'agent lui-même, une erreur, et la carte d'un
  agent à qui il a délégué. Cette carte porte l'approbation que quelqu'un doit donner, et un fil
  bien rangé ne vaut pas de la cacher.

- **La zone de saisie finit votre phrase, et Tab l'accepte.** Deux choses, toutes deux calculées sur
  votre machine et aucune envoyée où que ce soit. La zone vide et le dernier message de l'agent se
  terminant par une question fermée, la réponse apparaît en gris : Tab la prend, Entrée l'envoie.
  Avec quelque chose d'écrit, elle complète à partir de ce que vous avez déjà écrit dans cette même
  conversation — la dernière façon dont vous l'aviez formulé, reproposée dès les premiers caractères.
  Une question qui demande un choix plutôt qu'un oui n'obtient rien, car « oui » est la mauvaise
  réponse à « laquelle ? » ; la liste de mots qui en décide penche vers le silence. Rien d'un autre
  projet n'apparaît ici, la même règle que le contexte partagé. Tab n'agit qu'une fois que le menu
  `@`/`#`/`/` et un bloc ``` ont eu leur mot à dire, et Entrée reste intacte : accepter et envoyer
  restent deux décisions.

- **Le bouton de la barre des tâches clignote quand quelque chose attend votre réponse.** Une
  approbation ou une question arrête un agent jusqu'à votre retour, et jusqu'ici le seul moyen de
  l'apprendre était de regarder. Il ne clignote que tant que la fenêtre n'est pas au premier plan,
  et cette vérification se fait là où vit la fenêtre plutôt que d'être demandée puis suivie
  d'action : entre les deux, l'utilisateur peut revenir cliquer, et une barre qui clignote pour
  quelqu'un qui regarde déjà la fenêtre est pire que rien. Ces deux-là seulement : une tâche
  terminée est une nouvelle, pas un agent à l'arrêt.

- **La barre latérale marque un projet qui tourne sans surveillance.** Une lune à côté de son nom
  tant que le mode autonome est actif. C'était déjà propre à chaque projet — l'interrupteur ne
  l'active que sur celui-là — mais le seul endroit qui le disait se trouvait à l'intérieur du
  projet, ce qui ne sert à rien pour celui qu'on ne regarde pas.

### Corrigé

- **Un tour qui pose trois questions reçoit une seule réponse.** Un agent peut poser plusieurs
  questions d'un coup, et chaque réponse relançait son run de son côté : trois runs pour un seul
  tour, trois cartes sur le tableau, trois agents dans le même espace de travail, pour des questions
  auxquelles vous aviez répondu d'une traite. Elles arrivent en groupe désormais — un onglet par
  question, une coche sur celles que vous avez réglées, et un seul bouton qui reste désactivé tant
  qu'il en manque une. Ce qui repart est un unique message portant chaque question et sa réponse,
  car la deuxième réponse ne sert à rien à l'agent sans la question à laquelle elle appartient. Les
  questions d'un autre run attendent leur tour au lieu de rejoindre le groupe.

- **Un run qui attend du quota cesse de se relancer indéfiniment.** Les runs en attente sont repris
  quand le quota revient, et l'un des moments où cela est vérifié est « le dernier run vient de se
  terminer » — donc une relance qui se retrouvait de nouveau sans quota était de nouveau mise en
  attente, revérifiée et relancée, aussi vite que le CLI pouvait échouer, en écrivant un message
  dans le fil à chaque tour. Deux choses n'allaient pas. Le compte des tentatives déjà faites pour ce
  travail vivait sur l'entrée en attente, et cette entrée était justement supprimée pour le relancer :
  chaque tentative se lisait donc comme la première. Et un fournisseur qui signale être épuisé sans
  dire de combien il disposait — Antigravity, dont les pools ne disent que « agotado » et une heure
  de remise à zéro — ressortait du résumé comme « aucune idée », ce que tout ce qui demande « le
  quota est-il revenu ? » lit comme un oui. Trois tentatives maintenant, puis il le dit et vous
  attend.

- **L'application ne devient plus poussive pendant qu'un agent travaille.** Chaque ligne imprimée
  par un CLI était ajoutée à son run dans le store, douze fois par seconde pendant toute sa durée.
  Huit écrans sont abonnés à la table des runs — dont la zone où vous écrivez —, ils se redessinaient
  donc tous à ce rythme, pour un tampon que rien à l'écran ne lisait : ces lignes brutes ne
  s'affichent que dans une boîte de dialogue, et seulement si vous l'ouvrez. Elles sont désormais
  gardées à part et écrites dans le run une seule fois, à sa fin, si bien que les runs cessent de
  bouger pendant qu'il y en a un. La boîte de dialogue les suit toujours en direct, et un plantage en
  cours de run laisse malgré tout le journal sur le disque. Deux autres au passage : un vidage sans
  texte ne réécrit plus le fil pour le rendre identique, et les nœuds de la hiérarchie ne se
  redessinent plus à chaque delta — chacun surveille maintenant le dernier outil de son propre agent,
  qui ne bouge pas entre deux appels.

- **Un projet qui travaillait au redémarrage de l'application le dit.** Mettre l'application à jour
  au milieu d'une délégation, la rouvrir, aller à la hiérarchie : on aurait dit un projet où il ne
  s'était jamais rien passé — tous les agents inactifs, sans rien à dire. Les runs revenaient du
  disque depuis toujours et le fil les montrait ; ce que lit la hiérarchie, c'est l'état par agent,
  et un redémarrage le construit à partir de la seule équipe. Chaque agent revient maintenant avec
  la tâche au milieu de laquelle il a été coupé, marqué arrêté — rien n'a échoué, l'application est
  partie. Un agent que ce processus a déjà mis au travail est laissé tranquille : la restauration
  est asynchrone, et la tâche d'un run mort par-dessus un run vivant décrirait tout autre chose.

- **Le dock de droite appartient au projet où vous êtes.** Vous ouvriez le panneau des terminaux
  dans un projet, vous passiez à un autre, et il restait ouvert là aussi — au-dessus d'une barre
  d'onglets vide, puisque les terminaux étaient ceux du premier. Les trois panneaux sont désormais
  retenus par projet : rangés quand vous partez, ressortis quand vous revenez, et fermés pour un
  projet qui ne les a jamais ouverts.


## 0.11.0 — 2026-09-10

### Nouveau

- **Les trois vues d'un projet sont des lignes de la barre latérale.** Orchestrateur, Tâches et
  Hiérarchie formaient un sélecteur dans la barre du haut — la seule bande qui doit aussi porter le
  nom du projet, la branche, la dépense, l'interrupteur autonome et tous les boutons de panneaux.
  C'est de la navigation, et la navigation vit dans la colonne de gauche. Chaque ligne ouvre la vue
  qu'elle nomme, au lieu de vous laisser là où le projet en était resté.

- **Les commandes rapides peuvent être les vôtres.** À côté des scripts détectés, il y a désormais
  un endroit pour ajouter celles qu'aucun fichier ne déclare : la ligne docker compose, le tunnel,
  la migration que seul ce projet demande. Elles appartiennent au projet et s'affichent en tête du
  menu.

- **La barre de la fenêtre signale qu'un canal de discussion est connecté.** À côté du téléphone, un
  voyant pour Telegram, Discord ou Slack dès que l'un tourne vraiment — la question pour laquelle il
  fallait sinon ouvrir les réglages. Ce n'est pas un interrupteur : activer un canal demande un
  jeton et une liste de qui a le droit de parler.

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

- **Un long détail de tâche ne pousse plus tout le reste hors de la boîte de dialogue.** Un agent
  écrit autant qu'il le veut, et le détail se trouve entre les champs d'état et les dépendances et
  le run. Il est maintenant replié à quelques lignes, avec un « Voir plus » qui l'ouvre. La
  nécessité du bouton est mesurée, pas devinée d'après la longueur : le nombre de lignes d'un
  paragraphe dépend de la largeur qu'on lui donne.

- **Les scripts du projet sont un menu et non une rangée qui défile.** Une rangée de boutons dans un
  panneau déjà étroit signifiait une barre de défilement horizontale, et un projet à vingt scripts
  en cachait dix-neuf derrière. Ils sont maintenant un menu à côté du « + », de la même forme que le
  sélecteur de console.

- **La barre du haut ne dit plus combien d'agents travaillent.** Le point à côté du projet dans la
  barre latérale respire déjà pendant qu'ils travaillent, là où l'on regarde pour voir ce qui se
  passe.

- **Le bouton du mode autonome a la forme des boutons qui l'entourent.** Il portait son propre fond
  ambre pour être impossible à manquer. Ce n'était pas nécessaire : la bande sous la barre est la
  bruyante, elle occupe toute la largeur, et elle n'existe que tant que le mode est actif.

- **Le panneau de communication est une bulle de texte.** Son icône décrivait où le panneau s'ouvre,
  ce qui en est le moins intéressant. Ce qu'il contient, c'est ce que les agents se sont dit.

- **La barre du tableau est alignée.** Un Button, un Input et un SelectTrigger ne s'accordent pas par
  défaut sur l'arrondi, donc une rangée faite des trois sortait avec deux rayons côte à côte. Tout a
  maintenant une seule hauteur et un seul arrondi, dits sur chaque contrôle plutôt que laissés aux
  valeurs par défaut.

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
