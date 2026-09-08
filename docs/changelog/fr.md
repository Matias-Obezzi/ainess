# Nouveautés

Les versions antérieures à la 0.6.0 sont dans le CHANGELOG du dépôt, en anglais.

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
