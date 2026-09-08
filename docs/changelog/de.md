# Änderungen

Die Versionen vor 0.6.0 stehen auf Englisch im CHANGELOG des Repositorys.

## 0.6.0 — 2026-09-08

### Neu

- **Dateien gehen mit der Nachricht mit.** Eine Büroklammer im Eingabefeld oder Strg+V direkt
  hinein: ein Screenshot, ein PDF, ein Log. Bilder zeigen vorher ein Vorschaubild, alles andere
  Namen und Größe, und beides lässt sich wieder entfernen. Beim Senden wird die Datei in den
  projekteigenen Ordner `.ainess/attachments/` kopiert und der Prompt trägt ihren Pfad — das
  Einzige, was jede CLI mit einem Anhang anfangen kann, denn sie alle lesen das Repo, in dem sie
  arbeiten.

### Behoben

- Ein Projekt mit arbeitenden Agenten zeigt das in seinem eigenen Punkt, der langsam atmet. Vorher
  trug es einen orangefarbenen Zähler neben dem Namen, der aussah wie etwas, das auf eine Antwort
  wartet — das bernsteinfarbene Abzeichen unten im Menü, das dich wirklich braucht, sieht jetzt als
  Einziges so aus.
- Löschen aus dem Rechtsklick-Menü fragte in der Pille am oberen Fensterrand, der Form fürs Handy,
  statt im Dialog. Es passierte nur beim Arbeiten an der App, und die Frage konnte dabei ganz
  verloren gehen.
- Die `{{`-Liste eines Hooks sagt jetzt, was jede Variable enthält, nicht nur ihren Namen, und die
  Pfeiltasten scrollen sie: ab der achten rutschte die markierte Zeile unter den Rand.
