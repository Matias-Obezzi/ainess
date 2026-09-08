# Änderungen

Die Versionen vor 0.6.0 stehen auf Englisch im CHANGELOG des Repositorys.

## 0.8.0 — 2026-09-08

### Neu

- **Die leere Box sagt jetzt etwas, und es ändert sich.** Der Platzhalter des Composers tippt eine von fünf
  Zeilen und wechselt alle paar Sekunden: wofür das Team da ist, was du übergeben kannst, dass `/`
  die Befehle öffnet, und den Enter-Shortcut, der nicht mehr als dauerhaftes Anhängsel an der Zeile klebt,
  sondern etwas ist, das man einmal liest. Er bleibt stehen für alle, die das System um weniger
  Bewegung gebeten haben, und auf dem Telefon bewegt er sich überhaupt nicht.
- **Bewegung, wo sie etwas bedeutet.** Ein Lauf, der noch im Gange ist, hat das Licht, das über den
  Schritt wischt, auf dem er sich befindet, anstelle eines Spinners; das "Gerade in Arbeit" der Startseite wirkt
  lebendig; die Genehmigungs-Pille trägt einen Lichtfaden um sich, während —und nur während— etwas
  auf deine Antwort wartet; und das Geld im Verbrauchs-Panel zählt hoch bis zu dem, was es ist, im selben
  Währungsformat, das die Tabellen verwenden. Sonst wurde nichts dekoriert: der Thread, der Feed und das
  Board bleiben still, denn ein Werkzeug, das man den ganzen Tag betrachtet, sollte sich nur bewegen, wenn
  es einem etwas sagt.
- **Ein Agent kann etwas sagen, bevor er fertig ist.** Bisher war das Einzige, was ein delegierter Agent
  seinem Planer sagen konnte, seine finale Antwort: Blieb er nach zwei Minuten stecken, erfuhr zwanzig
  Minuten lang niemand davon. Jetzt kann er während der Arbeit einen `note`-Block hinterlassen —blockiert,
  langsamer als erwartet, etwas, das du jetzt wissen solltest— und die App übergibt ihn, während der Lauf
  noch im Gange ist, direkt in den Feed und an denjenigen, der die Arbeit delegiert hat.
- **Und er schließt mit dem, was er tatsächlich getan hat.** Ein `result`-Block, der die Dateien benennt, die er
  berührt hat, was er ausgeführt hat, um sie zu prüfen, und was er nicht tun konnte. Die Prosa bleibt; das ist
  der Teil, den der Planer liest, ohne ihn interpretieren zu müssen, und er taucht im Detail des Laufs als
  drei kurze Listen auf.
- **Die Startseite ist der Ort, an dem du erfährst, was wartet.** Über den Projekten gibt es zwei Listen, die
  sie alle kreuzen: was auf dich wartet —eine Delegation, die zur Genehmigung pausiert, eine Frage, die
  niemand beantwortet hat, eine Karte, die das Board in *Braucht dich* gelassen hat— und wer gerade arbeitet,
  woran und seit wann. Jede Zeile bringt dich dorthin, wo die Sache ist: der Thread für eine Genehmigung oder
  Frage, das Board mit der offenen Karte für eine Aufgabe. Beide verschwinden, wenn nichts in ihnen ist, sodass
  eine ruhige Startseite wie immer aussieht. Und das Badge, das dein zuletzt geöffnetes Projekt markierte, ist
  weg: Du bist genau deshalb auf der Startseite, weil du nicht in ihm bist. An seiner Stelle sagt jede Karte,
  was drinnen passiert: "2 in Arbeit · 1 warten auf dich".
- **Agenten an der gleichen Aufgabe wissen voneinander.** Ein Planer, der die Arbeit zwischen zwei Implementierern
  aufteilte, startete beide blind: Keiner wusste, dass der andere da war, beide griffen nach denselben
  Dateien, und der Planer bekam zwei Antworten zurück, die sich widersprachen. Jedem wird jetzt gesagt,
  wer noch an derselben Aufgabe arbeitet und was er tun sollte —und dass das, was jemand anderes in den Händen
  hält, seins zum Ändern ist, nicht deins zum Überschreiben. Das reist in jeder Runde mit, wie das Board,
  weil es die Art von Dingen ist, die sich ändern, während man arbeitet.
- **Ein Hook kann an "den Chef" schreiben statt an jemanden mit Namen.** Der zu instruierende Agent bietet
  jetzt die Spitze der Hierarchie an —den Root-Planer des Projekts, denselben Agenten, an den der Composer,
  die CLI und das Telefon standardmäßig schreiben— der aufgelöst wird, wenn der Hook auslöst, und nicht,
  wenn er gespeichert wird. So führt eine Umstrukturierung des Teams nie dazu, dass er auf jemanden zeigt,
  der nicht mehr das Sagen hat. Ungefiltert erreicht er den Chef *jedes* Projekts, was einen geplanten
  Hook für alle ausreichen lässt; auf ein Projekt eingeschränkt, ist es dessen Chef, und ein Ereignis, das
  ein Agent verursacht hat, bleibt in dem Projekt, in dem es passiert ist.

### Behoben

- **Du kannst in einer Konversation zurücklesen, während ein Agent noch schreibt.** In einem Chat
  zog dich jedes gesendete Delta zurück nach unten: hochzuscrollen, um zu prüfen, was er vor zwei
  Minuten gesagt hatte, war unmöglich, bis er fertig war. Der Chat macht jetzt, was der Orchestrator-Thread
  bereits tat: Er folgt dem Boden nur, während du am Boden bist, und wenn nicht, sagt eine Pille in der Ecke,
  wie viele Nachrichten angekommen sind, und bringt dich dorthin, wann du willst. Die Zählung ist jetzt an
  allen drei Orten —Chat, Thread und Kommunikations-Feed— anstatt eines bloßen "neue Nachrichten".
- **Ein langer Modellname bricht nicht länger den Neues-Chat-Dialog.** Die Zeile eines Teilnehmers besteht aus drei
  Dropdowns und einem Papierkorb in einem Grid, und eine Grid-Spalte schrumpft nicht unter die Breite
  ihres Inhalts: Wenn du ein Modell mit langem Namen ausgewählt hast, dehnte sich die Zeile, der Dialog dehnte sich
  mit ihr, und die Namens- und Modusfelder hingen schließlich aus der Karte heraus. Die Spalten können jetzt
  schrumpfen und der Name wird abgeschnitten.
- **Ein Werkzeug, das innerhalb eines Agenten fehlschlägt, sieht nicht mehr so aus, als sei die App kaputt.** Das
  `view_file` von Antigravity schlägt fehl, der Agent versucht es erneut und macht weiter, und die Konversation zeigte
  deswegen einen roten Alarm, in der gleichen Form, die ein echter Fehler bekommt. Es ist jetzt eine Zeile in
  der Aktivität des Laufs, in Bernstein, mit dem, was der Provider gesagt hat, nur einen Hover entfernt. Rot
  bleibt für das reserviert, was wirklich kaputt ist. Der einzige Fall, der es wert ist, laut gesagt zu werden,
  wird weiterhin gesagt: Dass dasselbe Werkzeug in einem Lauf dreimal fehlschlägt, bedeutet, dass der Agent
  sich im Kreis dreht, und das bekommt eine einzelne Zeile, die es benennt.
- **Die Buttons des Composers drängen sich nicht mehr in der Box.** Der Senden-Button wird nicht mehr zu
  einer Uhr —das Einreihen in die Warteschlange funktioniert genau wie vorher, Enter reiht ein, während ein
  Agent beschäftigt ist, und der Tooltip sagt das— und die Büroklammer ist in die Leiste gewandert, allein links,
  während Agent, Modell, Genehmigungen und Kontingent rechts versammelt sind.
- **`ais run` schlägt fehl, wenn die Aufgabe fehlgeschlagen ist, in jeder Sprache.** Er entschied über seinen
  Exit-Code, indem er im Feed nach den spanischen Wörtern "CLI not found" suchte —ein Text, der nicht mehr
  existierte, seitdem diese Nachrichten aus den Wörterbüchern kamen. Auf einer englischen Maschine stieg eine Aufgabe,
  die mangels CLI starb, mit null aus, grün für jedes Skript, das sie aufgerufen hatte. Jetzt liest er die Läufe.
- **Die Konversation zeichnet sich nicht mehr komplett neu.** Der Thread und der Kommunikations-Feed zeichneten
  jede Nachricht, die sie hatten —dreitausend pro Projekt— und keine einzige Zeile war memoisiert, sodass alles,
  was den Store berührte, sie alle neu zeichnete. Sie zeichnen jetzt den letzten Abschnitt, mit einem Link oben,
  um weiter zurückzugehen, der deinen Platz behält, anstatt zu springen, und die Zeilen werden nur neu gezeichnet,
  wenn sich bei ihnen tatsächlich etwas geändert hat.
- **Dass ein Agent tippt, kostet nicht mehr umso mehr, je länger du gearbeitet hast.** Jedes Delta, das eine
  CLI sendete, war ein Schreibvorgang: eine Kopie der gesamten Nachrichtenliste, um einen Buchstaben am Ende
  hinzuzufügen, plus eine Kopie der Läufe-Map für die rohe Zeile, plus ein Durchlauf über jede Nachricht, um
  zu entscheiden, was gespeichert wird. Pro Token. Mit einem langen Verlauf ist das Arbeit proportional zu allem,
  was je gesagt wurde, was genau der Grund ist, warum das Fenster im Laufe des Tages immer schwerfälliger wurde.
  Die Deltas werden jetzt gesammelt und gemeinsam angewendet, höchstens alle 80 ms, und auf der Stelle geflusht,
  wenn ein Lauf endet oder gestoppt wird, damit nichts zu spät oder gar nicht ankommt.
- **Ein Projekt öffnet sich so, wie du es verlassen hast, Konversation inklusive.** Der Wechsel zu einem anderen
  Projekt und die Rückkehr ließen dich im Orchestrator-Thread landen, selbst wenn du in einem der Chats
  dieses Projekts gesprochen hattest: Die Seitenleiste fragte nach dem Projekt *und keinem Chat*, und genau
  das bekam sie auch. Jedes Projekt merkt sich jetzt seine letzte Konversation sowie seine Ansicht, und
  beim erneuten Öffnen der App kehrt beides zurück. Wenn du den Thread absichtlich anforderst, bekommst du ihn weiterhin.
- **Tippen schreibt nicht mehr bei jedem Tastendruck auf die Festplatte.** Jedes Zeichen speicherte jeden
  Entwurf in der App synchron als JSON im Main-Thread —was genau der Thread ist, der mit deinem Tippen
  Schritt halten muss. Was du schreibst, landet immer noch sofort in der App; die Festplatte erfährt davon
  höchstens alle 400 ms, und sofort, wenn das Fenster geschlossen wird oder den Fokus verliert, damit nichts verloren geht.
- **Das Benachrichtigungs-Panel öffnet sich nicht mehr mit einem bereits angezeigten Tooltip.** Das Öffnen
  verschob den Fokus auf den ersten Icon-Button, und ein Tooltip wird beim Fokus genauso angezeigt wie beim Hover.
- **Eine im Review gelassene Karte kommt zurück.** Das Board wird bei jedem Start wieder mit seinen Läufen in Einklang
  gebracht, aber nur für Karten *In Arbeit*. Eine, die *Im Review* geparkt war, hinter einem Review, das
  mit der App starb —oder dessen Lauf aus einem gekürzten Verlauf herausfiel— blieb für immer dort. Sie wird
  jetzt genauso gelesen, wie der Live-Fluss sie liest: Genehmigt geht in die Liste, Änderungen und Fehler
  kommen zu dir zurück, und eine Karte, die jemand von Hand dorthin gezogen hat, bleibt die Angelegenheit dieser Person.
- **Ein Agent in einem Chat ist derselbe Agent wie in einer Aufgabe.** Der Chat baute seinen eigenen System-Prompt,
  auf Spanisch, ohne den `ask`-Block —sodass ein Agent, mit dem du sprachst, dich nicht um eine Entscheidung
  bitten konnte— und mit jedem Skill im Ganzen eingefügt, anstatt im Repo darauf zu verweisen. Chats gehen
  jetzt durch den einen Builder: dasselbe Profil, derselbe geteilte Kontext, dieselben Skills, dieselbe Art
  zu fragen, abzüglich des Boards und der Delegation, die ein Agent in einer Konversation nicht gebrauchen kann.
- **Die App spricht deine Sprache bis ganz nach unten.** Die Benutzeroberfläche war übersetzt und etwa dreißig
  Nachrichten darunter waren es nicht: ein gestoppter Lauf, eine Genehmigung, eine abgelehnte Delegation, ein Hook,
  der fehlschlug, die Fehler, die das Telefon zurückbekommt, was ein unterbrochener Lauf hinterlässt, die CLI,
  die nicht installiert werden konnte. In einem englischen Fenster kamen sie alle auf Spanisch heraus. Sie
  gehen jetzt durch dieselben Wörterbücher wie alles andere auch —und ein Lauf, der durch den gestrigen Build
  in einer anderen Sprache unterbrochen wurde, wird heute immer noch als unterbrochen erkannt.
- **Eine Delegation, die niemanden benennt, hängt die Aufgabe nicht mehr auf.** Ein Planer, der den Namen
  eines Agenten falsch schrieb —oder einen benannte, der nicht unter ihm stand— wartete auf ein Team, das
  niemals kommen würde, und seine Karte hing bei *In Arbeit* fest, bis die App neu startete. Jetzt geht der
  Fehler an den Planer zurück, mit den Namen, die er tatsächlich verwenden kann, damit er erneut delegiert;
  sind die Runden aufgebraucht, wird die Aufgabe geschlossen als etwas, das dich braucht, anstatt Arbeit vorzutäuschen.
- **Ein Lauf, der nicht einmal starten kann, schließt seine Karte.** Fehlt die CLI, brach der Lauf mit
  einem Fehler ab, und das Board erfuhr nie davon.
- **Wenn das Runden-Limit erreicht ist, wird das gesagt.** Die Aufgabe schließt nun als etwas, das dich braucht,
  mit dem Limit in den Details und der gleichen Benachrichtigung, die jeder Fehler erhält, anstatt
  still zu enden, als wäre sie fertig.
- **Ein Planer, der vergessen hatte, wie man delegiert.** Die Anweisungen nur in dem Zug zu senden, der eine
  Sitzung eröffnet, war richtig für die Beschreibung —die Rolle, das Profil, den geteilten Kontext, die
  Liste der Skills— und falsch für die zwei Blöcke, durch die ein Agent *handelt*. Eine CLI komprimiert
  ihren eigenen Kontext, wenn eine Sitzung wächst, und sobald der `delegate`-Block weg-zusammengefasst
  worden war, konnte der Planer sein eigenes Team nicht mehr erreichen: Er suchte nach einer `ainess`-Kommandozeile
  und einem MCP-Tool und bat schließlich den Benutzer, in seinem Namen zu delegieren, wobei er über die
  App, in der er lief, nachdachte, als gehörte sie jemand anderem. Die `delegate`- und `ask`-Blöcke gehen
  jetzt bei jedem Zug mit. Sie sind das Protokoll, nicht die Einleitung.
- **Ein Absturz lässt Agenten nicht mehr hinter dem Rücken der App arbeiten.** Das Schließen der App fährt
  jeden Agenten-Prozess herunter; ein Absturz —der Task-Manager, ein Stromausfall, eine Panik— erreicht
  das nie, also liefen die CLIs weiter: Sie editierten das Workspace weiter, verbrauchten weiter
  Kontingent, ohne dass jemand ihre Ausgabe las, und die App, die sie gestartet hatte, war bereits weg.
  Jeder Lauf notiert jetzt den Prozess hinter ihm, und der nächste Start findet diese, stoppt sie und
  sagt das, über alle Projekte hinweg —einschließlich derer, die er beim Start nicht lädt, deren Buchhaltung
  warten kann, ihre Prozesse jedoch nicht. Eine PID allein reicht nie aus, um sie zu beenden: Sie werden neu
  vergeben, und der nächste Besitzer hat genauso gute Chancen, dein eigener Dev-Server zu sein wie ein Agent.
  Daher wird ein Prozess nur gestoppt, wenn sein Image *und* der
  Zeitpunkt, an dem er gestartet wurde, immer noch mit dem Lauf übereinstimmen, der ihn aufgezeichnet hat.
- **Jedes Projekt merkt sich die Ansicht, in der du es verlassen hast.** Das Board, die Konversation und die
  Hierarchie waren eine einzige Einstellung, die von allen Projekten geteilt wurde, sodass das Öffnen eines
  in der Hierarchie und die Rückkehr zu einem anderen die Hierarchie auch dort zeigte. Jedes Projekt behält
  jetzt seine eigene —über Neustarts hinweg, und das erneute Öffnen der App landet in dem letzten Projekt,
  wo es war. Das Anklicken eines Chats bleibt ein explizites Ziel und öffnet die Konversation.
- **Das in einer Konversation gewählte Modell wird mit ihr gemerkt.** Wenn du eins ausgewählt hast, zum Board
  gegangen und zurückgekommen bist, stand da wieder "Standard-Modell", während die Box direkt darunter
  noch das hielt, was du getippt hattest. Es wird jetzt pro Konversation neben dem Entwurf aufbewahrt,
  einschließlich eines von Hand getippten Modells.
- **Ein Hook bei einem Maschinen-Event fragt nicht mehr zweimal nach einem Agenten.** Die Aktion "Einen Agenten
  instruieren" saß unter einem Filter, der ebenfalls Agenten auflistete, sodass derselbe Dialog zwei Agenten-Auswahlen
  mit unterschiedlicher Bedeutung hatte. Bei einem Maschinen-Event —einer Uhr, der Verbindung, einer Datei,
  die sich ändert— löst nichts, was ein Agent getan hat, den Hook aus, also konnte das Filtern nach einem
  nur bedeuten "niemals auslösen": Diese Optionen sind von dort verschwunden, sodass die eigene Auswahl der
  Aktion als einzige übrig bleibt, und ein Hook, der eine hatte, fällt auf das Projekt dieses Agenten
  zurück. Der Filter ist jetzt auch danach benannt, was er tut ("Hört auf").
- **Links in der Antwort eines Agenten brachten die ganze App zu `tauri.localhost`.** Agenten schreiben zwei
  Arten von Links und die App behandelte sie als eine: eine Webadresse und ein Pfad innerhalb des Repos, in
  dem sie arbeiten (`src/lib/foo.ts`, `README.md`). Zweiteres ist nichts zum Öffnen, und auf einem `<a href>`
  belassen, folgte das Desktop-Fenster ihm —ab nach `tauri.localhost/src/lib/foo.ts`, wobei die App
  unter dir verschwand. Jetzt sind nur echte Adressen Links, und sie öffnen sich im echten Browser; ein
  Repo-Pfad wird als Text belassen, den du lesen kannst. Ein `javascript:`- oder `data:`-Link —den ein Agent
  schreiben kann, absichtlich oder nicht—
  ist von vornherein gar kein Link.
- **Ein Agent konnte nicht das Modell wechseln, wenn sein Parent es ihm sagte.** Ein Planer, der ein `model`
  für eine Aufgabe benannte, wurde nur befolgt, solange "Modell auswählen" in den Einstellungen aktiviert war.
  War es ausgeschaltet —die Standardeinstellung— startete ein Implementierer, dem gesagt wurde, er solle es mit einem
  anderen Modell erneut versuchen, weil sein eigenes Kontingent aufgebraucht war, still und leise wieder mit
  demselben erschöpften Modell. Ein Modell, um das der Parent bittet, wird nun in beiden Fällen respektiert;
  diese Einstellung entscheidet, ob dem Planer *gesagt wird, eins zu wählen*, nicht, ob seine Wahl zählt. Und
  ein Kind, dem das Kontingent ausgeht, erreicht seinen Parent nicht mehr als Wand aus CLI-Fehlertext: Es wird
  klar gesagt, mit den Modellen derselben CLI, die noch einen Versuch wert sind —seine eigene Familie
  ausgenommen, da das Kontingent pro Familie ausgegeben wird— und mit der Erinnerung, dass eine Aufgabe ein
  `model` tragen kann. Wenn die CLI kein anderes Modell hat, wird dem Parent gesagt, er solle Bescheid geben,
  anstatt es erneut zu versuchen.


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
