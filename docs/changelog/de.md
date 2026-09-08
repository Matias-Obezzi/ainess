# Änderungen

Die Versionen vor 0.6.0 stehen auf Englisch im CHANGELOG des Repositorys.

## 0.7.0 — 2026-09-08

### Neu

- **Skills werden geöffnet, wenn sie passen, statt in jeden Lauf gekippt zu werden.** Eine Skill
  reiste ganz im Systemprompt jedes Agenten mit, der sie eingeschaltet hatte: fünf Skills waren
  fünf Handbücher in jedem Lauf, gelesen oder nicht. Jede wird jetzt nach
  `.ainess/skills/<name>/SKILL.md` geschrieben, und der Prompt trägt nur ihren Namen, eine Zeile
  dazu, wofür sie da ist, und diesen Pfad — der Agent öffnet die, um die es bei der Arbeit geht,
  und was die Skill sonst braucht (ein Skript, eine Vorlage), kann im selben Ordner liegen. Nach
  dieser einen Beschreibungszeile entscheidet er, und der Editor sagt das jetzt auch.
- **Benachrichtigungen haben einen Klang.** Zwei kurze Töne, steigend, wenn etwas dich braucht, und
  fallend, wenn etwas fertig ist, damit du sie ohne Hinsehen unterscheidest. Die App synthetisiert
  sie — keine Datei im Installer — und sie klingen gleich im Fenster, aus dem Infobereich (die App
  läuft dort weiter, und genau das lässt den Ton zu dir durch) und auf dem Telefon. Konfiguration →
  Allgemein schaltet sie ab, und ihr Editor stellt Töne, Wellenform und Lautstärke ein oder nimmt
  einen eigenen Klang.
- **Die Historie jedes Agenten, im Projekt.** `.ainess/history/` bekommt eine Datei pro Agent, an
  die jede Runde angehängt wird, sobald sie endet: wer gefragt hat, was gefragt wurde und was
  zurückkam, für delegierte Arbeit wie für Unterhaltungen. Die App behält alles in ihrem eigenen
  Speicher, wo nur sie lesen kann; das hier ist der Weg hinein für einen Agenten, der morgen
  wiederkommt, und für dich mit einem Editor. Füllt sich die Datei, fallen ganze Runden weg, nie
  eine halbe.
- **Terminal-Tabs lassen sich in die Reihenfolge ziehen, die du willst**, wie in jedem Editor mit
  Tabs: der getragene wird blass, und eine Linie zeigt, wo er landen würde.
- **Hooks auf die Bedingungen der Maschine selbst.** Bisher antwortete ein Hook auf etwas, das ein
  Agent getan hatte. Fünf weitere Ereignisse antworten der Maschine: die App startet, eine Uhr (zu
  einer Tageszeit oder alle so viele Minuten), die Verbindung bricht ab und kommt zurück, und eine
  Datei im Projektordner ändert sich — Letzteres auf dem Watcher, der ohnehin schon lief, sodass
  der Lärm (`.git`, `node_modules`, Build-Ausgaben) nie ankommt. Sie laufen, solange die App offen
  ist, höchstens einmal pro Minute je Hook, und das Projekt, auf das sie wirken, ist das aus dem
  Filter des Hooks oder das gerade geöffnete. `approval.requested`, das ohnehin schon ausgelöst
  wurde, steht endlich in der Liste.
- **Der Changelog in deiner Sprache.** Der Dialog nach einem Update und Konfiguration → Über zeigen
  die Notizen übersetzt. Englisch bleibt in `CHANGELOG.md`, und jede andere Sprache hat ihre
  eigene Datei, die der Release-Check mit der veröffentlichten Version im Gleichschritt hält.
- **Sie sucht alle fünf Minuten nach einer neuen Version**, nicht nur beim Start, sodass ein
  Release, das bei offener App erscheint, dich am selben Tag erreicht. Dasselbe Angebot wie immer,
  und derselbe Schalter in der Konfiguration schaltet es ab.
- **Eine Runde abbrechen, um etwas zu sagen.** Eine Nachricht, die auf einen Agenten wartet, hat
  einen zweiten Knopf: er stoppt, was läuft, und übergibt die Nachricht sofort. Nichts wird
  wiederholt — was der Agent getan hat, liegt auf der Platte, und was er gesagt hat, steht in
  seiner Sitzung, die der nächste Lauf fortsetzt — und ihm wird gesagt, dass seine Runde
  abgeschnitten wurde, damit er das Transkript nicht als abgeschlossen liest.
- **Befehle im Eingabefeld.** Ein `/` in einem leeren Eingabefeld öffnet eine kurze Liste:
  `/compact` lässt jeden Agenten des Projekts eine neue Sitzung beginnen — nichts geht verloren, da
  jeder auf seine eigene Datei in `.ainess/history/` gezeigt wird und nur das nachliest, was die
  neue Arbeit braucht — und `/cost` öffnet, was das Projekt ausgegeben hat. Alles andere im Feld
  ist eine Nachricht, „schau dir das /compact von Claude an“ geht also unverändert ans Team.

### Behoben

- **Die Anweisungen wurden in jeder Runde erneut geschickt.** Die Präambel eines Agenten — seine
  Rolle, die Schemata für `delegate` und `ask`, der geteilte Kontext, das Profil, die Liste der
  Skills — ging mit jeder Nachricht einer Unterhaltung mit, die die CLI ohnehin schon weitertrug.
  Bei Claude waren das dieselben Absätze, Runde für Runde abgerechnet; bei den Anbietern, die die
  Anweisungen in den Prompt selbst legen (Antigravity, Copilot, opencode und die übrigen), blieb
  zusätzlich eine Kopie im Transkript, für immer, sodass eine lange Sitzung sie viele Male bezahlte.
  Jetzt gehen sie einmal, in der Runde, die die Sitzung eröffnet. Was weiterhin jede Runde mitgeht,
  ist das Board, der Teil, der sich ändert.
- Ein Projekt öffnet seinen Ordner im Dateimanager, aus dem Rechtsklick wie aus den drei Punkten —
  und diese beiden Menüs bieten überall dort dieselben Aktionen, wo sie dasselbe sind. Der Pfad des
  Projekts stand im Rechtsklick und nicht in den Punkten, das „Öffnen“ einer Unterhaltung
  andersherum.
- Ein Projekt kann keine zwei Orchestratoren mehr an der Wurzel haben. Der Team-Dialog verlangt für
  den zweiten einen Vater, wohin er ohnehin gehörte: nebeneinander lesen beide das ganze Board und
  können dieselbe Karte nehmen, nur der erste ist das Standardziel von Eingabefeld, CLI und
  Telefon, und der eine „Aufgabe in Arbeit“-Zeiger des Projekts ließ den einen den anderen
  überschreiben — die erste Aufgabe blieb ohne verschobene Karte, ohne ihre Hooks und ohne ihre
  Benachrichtigung. Ein Team, das schon zwei hat, sagt es, sobald du einen davon öffnest.
- Die CLI eines Agenten zu wechseln behielt die Sitzung der alten, und der nächste Lauf reichte
  Antigravity eine Sitzungs-ID, die Claude eröffnet hatte — was sofort scheitert, denn es ist ein
  Name, den der andere nie gehört hat. Die Sitzung wird jetzt verworfen, wenn die CLI wechselt, und
  wenn der Agent in seinen eigenen Worktree geht oder ihn verlässt, die andere Hälfte dessen, woran
  eine Sitzung hängt.
- Der Repository-Watcher wacht nicht mehr beim `.ainess/`-Ordner der App selbst auf: Board, Team
  und jetzt die Historie werden dort während der Arbeit geschrieben, und ein Datei-Hook hätte damit
  der App geantwortet statt dem Benutzer.
- Ein Hook fragte zweimal, worauf er sich bezieht: ein Feld für den Agenten und eines für das
  Projekt. Es ist jetzt eines — alles, ein ganzes Projekt oder ein Agent darin — denn ein Agent
  gehört zu genau einem Projekt, und das Paar konnte sich nur einig sein oder sich so
  widersprechen, dass nie etwas auslöste.
- Die Agentenlisten, die über Projekte hinausreichen — der Agent, dem ein Hook eine Anweisung gibt,
  der Filter eines Hooks, die Bindung eines gespeicherten Auftrags — gruppieren die Agenten unter
  ihrem jeweiligen Projekt, mit dessen Farbe. Zwei Projekte mit je einem „Orchestrator“ lasen sich
  vorher gleich.
- Einem Agenten, dem du selbst schreibst, wird gesagt, wer er ist. Er las denselben Prompt, ob die
  Arbeit von seinem Planer kam oder von dir, also beantwortete ein Umsetzer deine Nachricht, indem
  er sie weiterdelegierte — und blieb dann bei „wartet auf sein Team“ stehen.
- Und dieses Warten ist ohnehin vorbei: eine Delegation, die jemanden nannte, der nicht unter
  diesem Agenten steht, ließ ihn auf ein Team warten, das nie kam. Landet keine einzige, ist der
  Agent wieder frei.
- Ein Link im Terminal öffnet mit einem Klick. Zuvor waren nur die Links, die die CLI selbst
  markiert hatte, überhaupt welche, und die brauchten gedrücktes Strg; jetzt ist jede URL in der
  Ausgabe einer, und sie öffnet im echten Browser.
- Auf dem Telefon verdeckte die Tastatur das Feld, in das du gerade schriebst. Die Seite ändert
  ihre Größe absichtlich nicht, wenn die Tastatur aufgeht — das riss die Unterhaltung mitten in der
  Arbeit von ihrem unteren Anker — also wird die App stattdessen um genau das gekürzt, was die
  Tastatur einnimmt.
- Der Toast „neue Version verfügbar“ zeigte die Release-Notiz so, wie sie geschrieben ist, es stand
  also `[CHANGELOG.md](https://…)` darin: ein Toast hat kein Markdown, um sie zu rendern. Er sagt
  jetzt, was er zu sagen hat, und was sich geändert hat, steht im Changelog, der nach dem Update
  aufgeht.
- Eine Nachricht, die geschrieben wurde, während ein Agent arbeitete, tauchte in Kommunikation auf
  und sonst nirgends, als hätte die App sie verschluckt. Sie steht jetzt am Ende der Unterhaltung,
  gestrichelt und mit einer Uhr, und sagt, auf wen sie wartet; zurücknehmen lässt sie sich, bevor
  sie an der Reihe ist.
- Diese Nachricht konnte auch zu früh übergeben werden: ein Agent, der delegiert, beendet seinen
  eigenen Lauf, bevor sein Team fertig ist, und die Warteschlange wurde dort geleert — die
  Nachricht lief neben der Arbeit, der sie folgen sollte. Sie wartet jetzt, bis der Agent wirklich
  frei ist.

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
