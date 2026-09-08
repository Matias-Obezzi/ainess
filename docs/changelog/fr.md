# Nouveautés

Les versions antérieures à la 0.6.0 sont dans le CHANGELOG du dépôt, en anglais.

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

- **Le panneau de notifications se ferme quand tu cliques ailleurs.** Il pend de la barre de titre,
  qui est la zone par laquelle on déplace la fenêtre : un clic là est pris par le système pour
  déplacer la fenêtre et n'atteint jamais la couche qui ferme le popover.
- **Les terminaux appartiennent à leur projet.** Tu en ouvrais un dans un projet, tu passais à un
  autre et tu voyais toujours les onglets du premier — c'est aussi pourquoi un terminal semblait
  s'ouvrir dans le mauvais dossier : c'était celui d'un autre projet, dans son propre dossier.
  Chaque projet montre les siens maintenant, et se souvient duquel il s'agissait. Supprimer un
  projet laisse toujours ses shells en vie, comme avant — l'un d'eux est peut-être en train de faire
  quelque chose — et ils réapparaissent sur l'écran d'accueil, là où va un terminal sans projet.
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
