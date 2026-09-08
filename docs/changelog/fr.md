# Nouveautés

Les versions antérieures à la 0.6.0 sont dans le CHANGELOG du dépôt, en anglais.

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
