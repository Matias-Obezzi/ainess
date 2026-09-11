# Änderungen

Die Versionen vor 0.6.0 stehen auf Englisch im CHANGELOG des Repositorys.

## 0.15.1 — 2026-09-11

### Behoben

- **Der Chat, der beim Senden einer Nachricht leer wird.** Viermal gemeldet, nie reproduziert, nie
  protokolliert — weil nichts kaputtging in dem Sinn, in dem alle gesucht haben. Es wurde keine
  Ausnahme geworfen, die Nachrichten standen weiter im Store, und ein Projektwechsel holte sie
  zurück: die Signatur von etwas, das noch da ist und nicht gezeigt wird.

  Der Verlauf folgt seinem eigenen Ende alle 150 ms, während eine Antwort geschrieben wird, und tat
  das mit `scrollIntoView`. Diese Methode scrollt nicht *einen* Container: Sie geht vom Element
  aufwärts und scrollt **jeden Scroll-Container auf dem Weg**, so weit jeder es braucht. Und
  `overflow: hidden` nimmt einer Box nicht die Eigenschaft, ein Scroll-Container zu sein: Es nimmt
  die Bildlaufleiste und das Mausrad, `scrollTop` funktioniert weiter. Die Hülle der App ist
  `h-screen overflow-hidden`, mehrere Kästen darunter auch — eine Hülle, deren Inhalt ein paar Pixel
  höher ausfiel als ihr Kasten, konnte von diesem Aufruf gescrollt werden und blieb dann gescrollt:
  keine Leiste, kein Rad, nichts, was sie zurückholt. Das Gespräch rutschte aus dem Bild und blieb
  dort, bis etwas ein Neu-Layout erzwang: eine Seitenleiste öffnen, das Projekt wechseln.

  Es passierte nur beim Senden, weil diese Schleife nur läuft, während eine Antwort kommt. Und der
  Prüfstand, der es fangen sollte, konnte es nie: Sein Transport kann keinen Lauf starten, also
  startete die Schleife, die er hätte belasten müssen, kein einziges Mal.

  Die drei Verläufe setzen jetzt `scrollTop` auf dem Container, den sie ohnehin halten — das
  betrifft dieses Element und nichts darüber. Sie prüfen im selben Takt auch, ob etwas über ihnen
  gescrollt wurde — dort oben soll nie etwas gescrollt sein — und stellen es zurück, mit einer Zeile
  im Log, welche Box und um wie viel. Falls es wieder passiert, gibt es diesmal etwas zu lesen.


- **Das Team eines Projekts zu ändern lässt seinen Planer nicht mehr an verschwundene Agenten
  delegieren.** Eine Delegation wird über den Namen gegen die Kinder des Planers aufgelöst, und die
  Namen, die der Planer kennt, stammen aus dem System-Prompt, den er bekommen hat. Eine Sitzung wird
  aber *fortgesetzt*: Das CLI spielt das ganze frühere Gespräch erneut ab, in dem das alte Team
  aufgezählt war und Delegationen an jene Namen gemacht wurden und funktionierten — und ein
  Protokoll ist lauter als ein oben angehängter System-Prompt. Einen Agenten umzubenennen, die
  Formation zu wechseln oder einen Implementierer hinzuzufügen ließ den Planer also mit einem Team
  sprechen, das es nicht mehr gab, und die Arbeit kam als „Delegation fehlgeschlagen" zurück.

  Eine Sitzung merkt sich jetzt, was ihr über das Team gesagt wurde: den Namen dieses Agenten und
  die seiner Kinder, sonst nichts, denn Namen sind alles, wogegen eine Delegation aufgelöst wird.
  Stimmt das nicht mehr, eröffnet der nächste Zug ein neues Gespräch, statt in das falsche
  zurückzukehren, und sagt es. Früher eröffnete Sitzungen werden übernommen statt weggeworfen: Die
  Heilung darf nicht sein, dass jeder Agent in jedem Projekt seinen Kontext verliert.

- **Eine Delegation, die einen nicht existierenden Agenten nennt, verliert diese Arbeit nicht mehr
  stillschweigend.** Waren alle Namen falsch, wurde der Zug wiederholt, und das war richtig. Waren
  *einige* falsch, starteten die gültigen, die ungültigen hinterließen einen Fehler im Verlauf, und
  von der Arbeit dahinter war nie wieder die Rede — von niemandem, gegenüber niemandem. Diese Namen
  reisen nun bis zum Ende der Runde und werden dem Planer vorgelegt, wenn er wieder übernimmt,
  zusammen mit der Liste derer, die ihm tatsächlich unterstehen. Und ein Name, der zu niemandem
  passte, gilt als das, was er ist — Beleg dafür, dass die Sitzung ein älteres Team erinnert — also
  wird sie verworfen und der nächste Zug beginnt bei dem Team, das existiert.

## 0.15.0 — 2026-09-11

### Neu

- **Die Linien in der Hierarchie verbinden jetzt etwas.** Die Agentenkarten haben immer
  Verbindungspunkte gezeichnet — daran hängen die Pfeile — aber die Fläche war nicht verbindbar, sie
  sahen also nach etwas aus, das man ziehen kann, und waren es nicht. Eine Linie von einer Karte zur
  anderen zu ziehen hängt diesen Agenten jetzt unter einen neuen Planer. Die Regeln sind die, die
  der Agenten-Editor längst anwendet — nicht unter sich selbst, nicht unter jemanden, der schon
  darunter steht, und nur ein Planer ganz oben — an derselben Stelle gelesen statt ein zweites Mal
  geschrieben, damit die beiden Bildschirme nicht irgendwann uneins darüber werden, was ein gültiges
  Team ist.


- **Ein Projekt kann sagen, was „fertig“ bedeutet, und ainess prüft es nach.** Bisher rückte eine
  Aufgabe vor, weil der Prozess des Agenten mit Code null endete. Mehr wurde nicht angesehen, also
  hieß „fertig“ nur „das CLI ist zurück“ — und das Gegenteil herauszufinden war Ihre Arbeit, morgens,
  Karte für Karte. Ein Projekt kann jetzt eigene Befehle auflisten (`npm test`, `npx tsc --noEmit`,
  `cargo check`), und wenn ein Agent delegierte Arbeit beendet, werden sie in dem Ordner ausgeführt,
  in dem er tatsächlich gearbeitet hat — seinem Worktree, falls er einen hat, damit die Tests den
  gerade geschriebenen Code sehen. Gehen sie durch, läuft die Karte weiter wie bisher, zum Prüfer,
  falls es einen gibt. Scheitern sie, kommt die Karte mit dem Namen des Befehls und seiner Ausgabe zu
  Ihnen zurück, dazu eine Nachricht im Verlauf und ein `verify.failed`-Hook, damit das Telefon Sie um
  drei Uhr morgens erreicht. Befehle, die das Projekt ohnehin angibt — `test`, `lint`, `typecheck`,
  `check`, `build` aus package.json, Makefile oder Cargo.toml — werden per Klick angeboten.

- **Rückgängig machen, was ein Lauf getan hat.** Ein Lauf hielt schon fest, wo er stattfand und auf
  welchem Commit er öffnete, weil das Diff-Panel das brauchte; was fehlte, war zu wissen, was der
  Ordner *vorher* schon offen hatte. Ohne das sind „den Lauf rückgängig machen" und „alles
  Uncommittete wegwerfen" derselbe Befehl, und sie sind nicht dasselbe: Das zweite frisst Arbeit,
  die Sie selbst gemacht und nie erwähnt haben. Ein Lauf notiert jetzt also auch, was beim Start
  geändert oder unversioniert war, und das Detail eines beendeten Laufs hat einen Knopf, der den
  Ordner zurückstellt.

- **Eine Obergrenze für einen Lauf, nicht nur für den Tag.** Das Tages- und das Monatslimit haben
  nie verhindert, dass ein einzelner Lauf das Tagesbudget auf einmal ausgibt: Es sind Summen, und
  eine Summe merkt es erst hinterher. Ein Projekt kann jetzt auch festlegen, was ein einzelner Lauf
  kosten darf.

  Was das ehrlicherweise leisten kann, sollte man klar sagen, denn es ist nicht das, was man annehmen
  würde. Alle CLIs hier melden ihre Kosten, wenn sie fertig sind, nicht während sie arbeiten — ein
  Lauf, der darüber geht, lässt sich also nicht mittendrin abbrechen, weil die App bis zum Ende den
  Preis nicht kennt. Was die Obergrenze tut, ist den *nächsten* zu stoppen: Sobald ein Lauf meldet,
  dass er darüber lag, sagt die Nachricht es, und eine weitere Runde derselben Arbeit startet nicht.
  Es zählt die ganze Kette und nicht nur der letzte Lauf, sodass auch eine zwei Runden alte
  Delegation, die ein Vermögen gekostet hat, sie anhält — sonst ist eine Obergrenze keine. Ein
  Budget auf „nur warnen" warnt weiterhin nur.

  Er ist absichtlich vorsichtig und sagt es laut, bevor er irgendetwas anfasst: die Liste der
  Dateien, die zurückkommen, die der Dateien, die gelöscht werden, weil es sie vorher nicht gab, und
  die, die er nicht anfasst — Dateien, die beim Start schon geändert waren, wo die Änderung des
  Agenten und Ihre in derselben Datei liegen und von hier aus nicht zu trennen sind. Gelöscht wird
  mit `git clean` und einer ausdrücklichen Pfadliste, nie frei auf dem Ordner. Ältere Läufe bieten
  den Knopf ebenfalls an und behandeln den Ordner als anfangs sauber, was das Einzige ist, was sich
  über sie annehmen lässt.

  Nichts wird automatisch wiederholt. Ein Fehlschlag, den der Agent nicht beheben kann, würde zu
  einer Schleife, die die ganze Nacht läuft, und Arbeit zurückzugeben ist eine Entscheidung, kein
  Reflex.

  Was Sie tippen, wird vor Ihren Augen in Programm und Argumente zerlegt, und die Teile stehen unter
  dem Feld, denn genau so wird es gestartet: Nichts hiervon erreicht je eine Shell. Ein `&&`, eine
  Pipe oder eine Umleitung werden mit Begründung abgelehnt statt still maskiert — die App läuft auf
  der Shell, die die Maschine anbietet, und die sind sich über Anführungszeichen nicht einig. Zwei
  Befehle ist die Antwort darauf, zwei Befehle zu wollen. Ein Projekt ohne aufgelistete Befehle
  verhält sich genau wie zuvor.


### Behoben

- **Mit einem Planer, der delegiert hat, lässt sich reden, während seine Implementierer
  arbeiten.** Bisher wurde Ihre Nachricht eingereiht, bis die ganze Runde zurück war — womit
  ausgerechnet der eine Agent, dessen Aufgabe das Weiterplanen ist, der einzige war, den man während
  laufender Arbeit nicht erreichte. Schuld war ein Wort mit drei Bedeutungen: „wartet" hieß wartet
  auf eine Antwort, pausiert bis das Kontingent zurückkommt, *und* wartet auf die Implementierer —
  und nur Letzteres beschreibt einen Agenten ohne eigenen laufenden Prozess. Dieser Fall nimmt die
  Nachricht nun an und beginnt einen Zug; die anderen beiden reihen weiter ein, weil ein neuer Zug
  dort genau dem ins Wort fiele, worauf gewartet wird.

  Mehr als eine Zeile wurde daraus, weil die Implementierer zurückkommen können, während der Planer
  mitten in einer Antwort an Sie steckt. Zwei Läufe eines Agenten sind zwei Schreiber auf einer
  CLI-Sitzung, also warten die Ergebnisse auf das Ende dieses Zuges und werden unmittelbar danach
  übergeben — der eigene Faden der Aufgabe zuerst, vor allem anderen Eingereihten. Und ein Planer,
  dessen Zug endet, während von ihm verteilte Arbeit noch läuft, liest sich jetzt als wartend statt
  als frei, was er auch ist.

- **Ein Agent, der ewig dasselbe fragt, hört jetzt auf.** Eine Antwort setzt den Agenten in der
  Runde fort, in der er ohnehin war — eine Frage bringt die Runde nicht weiter — und die Runde ist
  das Einzige, was `maxRounds` zählt. Ein Agent, der jede Antwort mit einer weiteren Frage
  beantwortet, hatte also überhaupt nichts, was ihn begrenzte: Sie antworten, er fragt erneut, und
  beendet wird das nur dadurch, dass Sie aufgeben. Der autonome Modus hatte das bemerkt und sich
  eine eigene Obergrenze gegeben, aber nur für die Fragen, die er selbst beantwortet; wenn Sie
  antworteten, gab es nirgends eine.

  Jetzt zwei Regeln. Eine Frage, die diese Aufgabe schon beantwortet hat, wird nicht erneut
  gestellt: Die Antwort steht fest, also geht sie direkt zurück — das ist keine Ermessensfrage. Und
  eine Aufgabe, die zwölfmal gefragt hat, hört auf zu fragen und sagt es, denn zwölf Runden im Kreis
  sind ein schlechter Nachmittag und eine Nacht davon ist schlimmer. Viele *verschiedene* Fragen
  sind weiterhin erlaubt: begrenzt wird die Anzahl, nie der Inhalt.


- **Die App verbringt nicht mehr über jede Sekunde, die sie hat, damit, sich selbst eine Datei zu
  schreiben.** Der Verlauf eines Projekts wird vollständig neu geschrieben, sobald sich darin etwas
  ändert, und vorher gelesen und geparst, damit keine im CLI oder am Telefon getroffene Entscheidung
  verloren geht. Für einen Nachrichtenstrom ist das billig, für einen Strom roher CLI-Ausgabe
  ruinös — und dazu war er weitgehend geworden: Auf der Maschine, auf der das gefunden wurde, war die
  Datei eines Projekts auf **47 MB angewachsen, 83 % davon Rohzeilen**, und ein Speichern kostete
  283 ms Rechnerei auf dem Thread der Oberfläche — zweimal pro Sekunde, so lange ein Agent arbeitete.
  Das sind 566 ms jeder Sekunde mit Denken statt Zeichnen, weshalb die App genau dann langsam wurde,
  wenn es etwas zu sehen gab, und weshalb das Senden einer Nachricht den Verlauf leer lassen konnte,
  bis irgendetwas — eine Seitenleiste öffnen, das Projekt wechseln — sie zum Neuzeichnen zwang. Es
  waren nie die Animationen, und es war nie die eintreffende Ausgabe des Agenten: Der Agent druckt
  ein bis zwei Zeilen pro Sekunde. Es war die App im Gespräch mit ihrer eigenen Festplatte.

  Die alte Grenze zählte Zeilen und übersah deren Größe, was das Falsche maß: Die mittlere Zeile hat
  313 Zeichen, die größte gemessene hatte 536 KB. Jetzt wird eine Zeile bei 2 KB abgeschnitten, ein
  Lauf behält 64 KB davon, und nur die letzten dreißig Läufe behalten überhaupt welche — ältere
  behalten ihren Auftrag, ihre Antwort und ihre Kosten und verlieren nur die Mitschrift davon, wie
  das CLI es gesagt hat. Dieselbe Datei kommt auf 7 MB, ein Speichern kostet 44 ms. Da das Speichern
  außerdem drei Sekunden statt einer halben wartet, während ein Agent arbeitet, ging die Oberfläche
  von **566 ms je Sekunde auf 15**. An einem bestehenden Verlauf ist nichts zu tun: Das erste
  Speichern schreibt ihn in der neuen Größe neu.


- **Eine Option ohne etwas dahinter wird nicht mehr als ihr eigener Wert gelesen.** `ainess hook add
  --action slack --url --template "..."` — `--url` ohne etwas dahinter — schrieb das bloße
  Vorhandensein der Option dorthin, wo die Adresse des Webhooks steht, und der Hook wurde
  gespeichert, zeigend auf etwas, das niemand getippt hatte: Er kam nirgends an und sagte nie,
  warum. Jetzt bricht er ab und meldet, dass `--url` fehlt, was auch stimmte. Dasselbe für
  `--program`, `--args` und `--template`: Eine Option ohne etwas dahinter ist eine, die Sie
  auszufüllen vergessen haben, kein Wert.
- **Ein Claude-Zug, der ohne Session-ID beginnt, startet ein neues Gespräch, statt ein leeres
  fortzusetzen.** ainess merkt sich die ID, die der Anbieter ankündigt, damit die nächste Nachricht
  denselben Faden fortsetzt. Eine Eröffnungszeile, die ohne ID ankam, wurde trotzdem gemerkt, als
  nichts, und der Zug danach bat Claude, eine Session ohne Namen fortzusetzen. Diese Zeile wird nun
  ignoriert, also startet der nächste Zug sauber — wo er ohnehin gelandet wäre, nur ohne das
  gescheiterte Fortsetzen auf dem Weg.

## 0.14.0 — 2026-09-11

### Neu

- **Ein gehosteter MCP-Server bekommt jetzt die Header, nach denen er fragt.** ainess schrieb einen
  http-Server in die Sitzungskonfiguration als Typ und URL und sonst nichts, also war alles hinter
  einem Bearer-Token schlicht nicht erreichbar: das Feld für den Token existierte nicht. Jetzt schon:
  ein Header pro Zeile, `Name: Wert`, bei einem http-Server. Der Wert wird am ersten Doppelpunkt
  geteilt und nicht am letzten, denn ein Wert hat eigene Doppelpunkte (eine URL, eine Uhrzeit, ein
  Base64-Token), und am Ende zu schneiden übergibt dem Server eine halbe Anmeldung — ein Fehler, der
  viel später als Authentifizierungsproblem auftaucht, das niemand bis zu einem Satzzeichen
  zurückverfolgt. Schreib `Bearer ${DEINE_VARIABLE}`, und der Client löst sie beim Verbinden aus der
  Umgebung auf, sodass das Geheimnis nie in die Konfigurationsdatei gerät. Antigravity bekommt sie
  ebenfalls, über `agy mcp add --header`, Flag und Wert als getrennte Argumente und nie eine aus
  Strings zusammengeklebte Kommandozeile. Und wenn dieser Befehl fehlschlägt, wird seine Ausgabe mit
  bereits entfernter Anmeldung gezeigt: die Meldung nennt weiterhin den Server, der fehlschlug — der
  Teil, der je nützlich war.

### Behoben

- **Antigravity nach dem Rest seines Kontingents zu fragen, öffnet kein Terminal mehr.** Die App
  nimmt sich beim Start eine Konsole und versteckt sie, damit alles, was ein Agent seinerseits
  startet, sie erbt und in keiner Tiefe ein Fenster aufgeht. Kurze Abfragen erbten sie ebenfalls —
  und eine Konsole zu verstecken setzt voraus, dass `ShowWindow` das Fenster erreicht, das sie
  anzeigt, was unter Windows 11, wo der Standard-Konsolenhost das Windows Terminal in einem eigenen
  Prozess ist, nicht der Fall ist. Ein Kind, das einen Spinner zeichnet, holt dieses Fenster nach
  vorn — und `agy models` zeichnet einen. Abfragen bekommen jetzt gar keine Konsole: dasselbe Flag,
  das die Versionserkennung und die Aufräumbefehle seit jeher übergeben. Die Agenten bleiben, wie
  sie waren; sie sind die mit einem Baum darunter, der eine Konsole zum Erben braucht.

- **Das Feld für Umgebungsvariablen tut bei einem http-Server etwas.** Es wurde dort gezeichnet und
  führte nirgendwohin: der http-Zweig der Sitzungskonfiguration hat nie `env` geschrieben, ein dort
  eingetragener Schlüssel landete also in der Konfigurationsdatei und sonst nirgends. Ein
  http-MCP-Server hat keinen eigenen Prozess, der Agent aber schon — und die Umgebung des Agenten
  ist genau der Ort, an dem der MCP-Client nachsieht, wenn er `${VARIABLE}` in einem Header auflöst.
  Dorthin gehen sie jetzt. Schlüssel ins Feld, `X-Goog-Api-Key: ${DEIN_SCHLUESSEL}` in die Header,
  und es verbindet sich, ohne die Umgebung des Rechners anzufassen oder etwas neu zu starten. Das
  Feld sagt, was das kostet, denn es ist weiter, als es aussieht: eine hier gesetzte Variable gehört
  dem Prozess des Agenten, also sieht sie jeder MCP-Server, der Variablen auflöst, und alles, was
  der Agent ausführt. Es bringt den Schlüssel in die App statt nach Windows; Geheimhaltung bringt es
  nicht. Die Variablen eines stdio-Servers bleiben unberührt.
- **Das Eingabefeld zeichnet sich nicht mehr zweimal pro Sekunde für einen Chat neu, in dem nichts
  passiert.** Ob ein Chat gerade antwortet, liegt im Speicher des Chat-Moduls und nicht im Store,
  also konnte nichts darauf reagieren: das Feld fragte auf einem 500-ms-Timer nach, solange eine
  Unterhaltung offen war — ob etwas geschah oder nicht. Jetzt ist es abonniert: das Feld zeichnet
  sich neu, wenn ein Zug beginnt oder endet, und sonst nicht.

- **Schnelles Tippen lässt nicht mehr die ganze App für jeden Buchstaben arbeiten, und ein Panel,
  das kaputtgeht, sagt, was kaputtging.** Was getippt wird, gehört zur Unterhaltung, lag also im
  Store — und wurde bei jedem Tastendruck dorthin geschrieben. Der Store führt bei jedem Schreiben
  den Selektor jedes Abonnenten aus, also ließ jedes Zeichen die Selektoren sämtlicher eingehängter
  Bildschirme neu laufen und rendert neu, was sie speisten. Das Feld ist jetzt lokal und der Store
  wird dahinter geschrieben: entprellt beim Tippen und sofort, wenn etwas nicht verloren gehen darf
  — ein geleertes Feld, ein Wechsel der Unterhaltung, das Verlassen des Bildschirms. Davon
  getrennt: die App hatte nirgends eine Error Boundary, ein Renderfehler riss also das ganze
  Fenster mit, ohne Meldung und ohne Logeintrag — denn was ihn geschrieben hätte, starb ebenfalls.
  Jetzt sind der Verlauf und das Feld jeweils ihre eigene Grenze. Ein Panel, das wirft, behält den
  Fehler bei sich, zeigt ihn an und schreibt den Stack ins Log — das ist der Unterschied zwischen
  einem Fehler, den man melden kann, und einem, den man nur als schwarz gewordenen Bildschirm
  beschreiben kann.

- **Das leere Feld malt nicht mehr zwei Sätze in dieselbe Zeile.** Der graue Vorschlag wird auf der
  Ebene hinter dem Textfeld gezeichnet, die dessen eigenen Innenabstand trägt, damit er zu dem
  passt, was man tippt — und ein leeres Feld beginnt genau an diesem Punkt, dort, wo der Platzhalter
  steht. Endete die letzte Nachricht des Agenten also mit einer Ja/Nein-Frage und man hatte noch
  nichts geschrieben, wurden "Sí, dale" und "Escribí mientras trabaja…" übereinander gedruckt und
  keines von beiden war lesbar. Den Platz bekommt jetzt der Vorschlag: das ist die Aufgabe des
  Platzhalters selbst — einem leeren Feld zu sagen, was damit anzufangen ist — nur mit der
  Unterhaltung in der Hand statt im Allgemeinen. Der rotierende Hinweis tritt aus demselben Grund
  und an derselben Stelle zurück.

## 0.13.0 — 2026-09-10

### Neu

- **Ein neuer Agent wird geboren, indem er seine eigenen Werkzeuge automatisch freigibt — und die
  CLI kann weiterhin das Gegenteil sagen.** ainess startet diese CLIs headless: niemand sitzt vor
  dem Prozess, um ihm zu antworten. Ein Agent, der mit zurückgehaltener Berechtigung angelegt
  wurde, startete mit `--permission-mode acceptEdits`, fragte also vor allem, was keine Bearbeitung
  war, und wartete dort, bis es jemand bemerkte — was sich genauso liest wie die
  Delegations-Freigabe, mit der es nichts zu tun hat. Neue Agenten starten das jetzt eingeschaltet,
  im Dialog wie in `ainess agents add`, und der Schalter sagt in einer Zeile, was das bedeutet.
  Nichts Gespeichertes wird angefasst: eine Berechtigung in einem Agenten einzuschalten, den jemand
  eingerichtet hat, ist kein Standard, sondern eine Änderung, um die niemand gebeten hat — und eine
  Bearbeitung lässt weiterhin jede Einstellung, die sie nicht benennt, genau dort, wo sie war. Im
  selben Zug bekam die CLI `--no-auto-approve`, denn ein boolesches Flag hat kein Aus —
  `--auto-approve=false` wird schlicht abgelehnt — und der Tag, an dem der Standard kippte, war der
  Tag, an dem ein Skript kein Team mit zurückgehaltenen Werkzeugen mehr aufsetzen konnte. Beide
  zusammen übergeben: Aus gewinnt — zwischen zwei Lesarten eines widersprüchlichen Befehls die, die
  weniger gewährt.

- **Aus Telegram, Discord und Slack per Knopfdruck freigeben und antworten.** Alles, was die
  Brücke konnte, musste getippt werden, und die beiden Dinge, die wirklich auf dich warten, mussten
  mit einer Id getippt werden, die man aus der Nachricht darüber abschrieb: `/approve 3f2a1b2c`.
  Auf dem Telefon ist das der Unterschied zwischen antworten und nicht antworten. Eine zur Freigabe
  angehaltene Delegation kommt jetzt mit einem Ja und einem Nein darunter an, und eine Frage mit
  einem Knopf pro Option. Alle drei Plattformen liefern den Druck über die Verbindung, die sie
  ohnehin offen halten — Telegram neben seinen Updates, Discord über das Gateway, Slack über Socket
  Mode — also wird nichts exponiert und keine deiner Adressen geht irgendwohin. Der Druck kommt
  durch dieselbe Tür wie eine getippte Nachricht, und das mit Absicht: die Erlaubnisliste wird an
  einer Stelle geprüft, und ein Knopf ist kein Weg daran vorbei. Dem Druck wird auch nichts
  geglaubt: die Id muss noch offen sein und die Option eine, die die Frage wirklich hat — ein alter
  Knopf in einer Nachricht von gestern entscheidet also nichts ein zweites Mal. Eine Frage mit
  mehreren Antworten bekommt keine Knöpfe, denn ein Druck ist eine Option und das ist eine andere
  Antwort als die verlangte; die werden weiter getippt, und die Nachricht sagt das.

- **Der Startbildschirm beginnt die Arbeit, statt sie aufzuzählen.** Er war ein Dashboard: jedes
  Projekt eine Zeile, das Wartende, das Laufende. All das wohnt längst dort, wo es hingehört — die
  Seitenleiste hat die Projekte und den Knopf, eines anzulegen, das Panel darüber zeigt weiterhin,
  was zur Freigabe angehalten ist, Glocke und Taskleiste melden, wenn etwas eine Antwort will. Hier
  stand also eine zweite Kopie davon, ausgerechnet an der einen Stelle, an der das, was man nirgends
  sonst kann, das Anfangen ist. Jetzt ist es ein Feld, in der Mitte, und darüber nichts: schreib, was
  zu tun ist, wähl den Ordner und eines deiner Teams — das Projekt entsteht und der Prompt geht raus.
  Ist der Ordner schon ein Projekt, geht es einfach dorthin, samt Team: zwei Projekte auf einem
  Workspace wären zwei Teams, die dieselben Dateien bearbeiten, ohne voneinander zu wissen, und ein
  Ordner bleibt derselbe Ordner, wie auch immer er geschrieben wird. Ein Team erfindet er nicht: ist
  keines gespeichert, zeigt er dorthin, wo Teams entstehen, und ein Team ohne Wurzel-Agenten wird
  gesagt, statt den Prompt dem erstbesten Agenten zu geben. Unter dem Feld die eine Zahl, die kein
  anderer Bildschirm über Projekte hinweg zusammenzählt: was die letzten zwei Wochen gekostet haben,
  in Aufgaben, Tokens und Dollar. Nichts davon wird geschätzt — ein CLI ohne Verbrauchsmeldung zählt
  als Lauf und null Tokens, und zwei Wochen, in denen keines gemeldet hat, sagen das, statt eine
  flache Linie zu zeichnen.

### Behoben

- **`ainess agents edit` macht eine gesetzte Berechtigung nicht mehr stillschweigend rückgängig.**
  Jeder Editor übergibt dem Store einen ganzen Agenten, und der Store setzt ihn an die Stelle des
  alten — ein Feld, das dieser Editor nicht in das Objekt gebaut hat, bleibt also nicht unberührt,
  es ist weg. Die CLI baut dieses Objekt aus ihren eigenen Flags und hat keines für die
  Freigabe-Ausnahme bei Delegationen, keines für den Worktree und keines für den Wiederholversuch
  nach Kontingent. `ainess agents edit Impl --model x` setzte einen auf "nie fragen" gestellten
  Agenten damit zurück auf die globale Einstellung, und mit der eingeschalteten Einstellung fragte
  er bei der nächsten Delegation wieder. Eine Bearbeitung legt sich jetzt über den Agenten, der da
  war: was sie benennt, gewinnt; was sie nicht benennt, bleibt. Benennen zählt auch dann, wenn der
  Wert "der globalen Einstellung folgen" ist — der reist als gar nichts und muss ein "nie" löschen
  können.

- **Ein Chat wird nicht mehr leer, wenn du eine Nachricht hineinschickst.** Eine Unterhaltung zu
  laden heißt, eine Datei zu lesen, und das dauert. In diesem Zeitfenster gingen drei verschiedene
  Dinge schief, und alle drei endeten gleich: der Verlauf weg, bis man den Chat verließ und
  zurückkam, was den Lesevorgang wiederholte. Eine Nachricht, die während des Lesens gesendet
  wurde, wurde von einer Datei überschrieben, die vor ihr geschrieben worden war — jetzt gewinnt
  der Speicher, und was während des Lesens ankam, bleibt. Ein fehlgeschlagenes Lesen flog aus dem
  Lader heraus, statt aufgefangen zu werden, und ließ den Chat ohne Inhalt im Speicher zurück; es
  kann aus einem banalen Grund fehlschlagen, etwa weil dieselbe Datei gerade geschrieben wird. Und
  ein Neuladen legte drei graue Skelette über einen Verlauf, der längst da war, was sich liest, als
  wäre die Unterhaltung verloren.

## 0.12.0 — 2026-09-10

### Neu

- **Nachrichten, die während der Arbeit eines Agenten in die Warteschlange gehen, gehen zusammen
  hinaus, als eine.** Vorher gingen sie im Gänsemarsch: die erste, wenn der Zug endete, die zweite
  wartete auf das Ende *dieses* Zuges. Drei in einem Zug getippte Zeilen wurden zu drei Zügen —
  drei Läufe, drei Karten auf dem Board, und ein Agent, der die erste ausführte, bevor er die
  Korrektur in der dritten gelesen hatte. Sie werden jetzt als ein einziger Prompt übergeben, in
  der Reihenfolge, in der sie geschrieben wurden, und ohne Zusatz: eine Leerzeile dazwischen, so
  wie man es selbst getippt hätte. "Jetzt senden" macht dasselbe, also ist das Abbrechen eines
  Zuges, um eine von dreien zu übergeben, nicht mehr drei Züge; es ist ein Knopf für den Block
  statt einer pro Zeile, und jede Zeile lässt sich weiterhin einzeln zurücknehmen, bevor sie geht.

- **Nur das, was der Agent gerade tut, in einer Zeile.** Ein arbeitender Agent schreibt eine Zeile
  pro Werkzeug, das er benutzt, und ein langer Lauf schreibt Hunderte: der Verlauf füllte sich mit
  dem, was er schon erledigt hatte, und die eine lesenswerte Zeile — was er *gerade jetzt* tut —
  lag irgendwo weiter oben begraben. Die Schritte laufen jetzt durch eine Laufzeile. Sie ist eine
  Zeile hoch und ihr Überlauf ist verborgen, also verlässt der eben beendete Schritt sie nach oben,
  während der neue von unten hereinkommt. Die Bewegung ist der Punkt: eine Zeile, die ihren Text an
  Ort und Stelle austauscht, sieht gleich aus, ob sie sich einmal oder vierzigmal geändert hat, und
  "läuft das noch?" war genau die Frage, die eine Wand aus stillem Text aufwarf. Ein Klick auf die
  Zeile öffnet die Historie darüber, ein weiterer Klick auf dieselbe Zeile schließt sie wieder.
  Drei Dinge falten sich nie ein: der Text des Agenten selbst, ein Fehler, und die Karte eines
  Agenten, an den er delegiert hat. Auf dieser Karte sitzt die Freigabe, die jemand beantworten
  muss, und dafür ist ein aufgeräumter Verlauf nicht genug.

- **Der Kasten schreibt deinen Satz zu Ende, und Tab nimmt ihn an.** Zwei Dinge, beide auf deinem
  Rechner ausgerechnet und keines davon irgendwohin geschickt. Ist der Kasten leer und endet die
  letzte Nachricht des Agenten mit einer Ja/Nein-Frage, erscheint die Antwort in Grau: Tab nimmt sie,
  Enter schickt sie. Steht schon etwas darin, wird aus dem ergänzt, was du in genau diesem Gespräch
  vorher geschrieben hast — die letzte Formulierung, ab den ersten Zeichen wieder angeboten. Eine
  Frage, die eine Wahl statt eines Ja will, bekommt nichts, denn „ja" ist die falsche Antwort auf
  „welches?"; die Wortliste, die das entscheidet, ist auf Schweigen hin gebaut. Nichts aus einem
  anderen Projekt taucht hier auf, dieselbe Regel wie beim gemeinsamen Kontext. Tab greift erst,
  wenn das `@`/`#`/`/`-Menü und ein ```-Block ihr Recht hatten, und Enter bleibt unangetastet:
  Annehmen und Senden bleiben zwei Entscheidungen.

- **Die Taskleistenschaltfläche blinkt, wenn etwas auf deine Antwort wartet.** Eine Freigabe oder
  eine Frage hält einen Agenten an, bis du zurückkommst, und bisher war Hinsehen die einzige Art,
  davon zu erfahren. Es blinkt nur, solange das Fenster nicht im Vordergrund ist, und diese Prüfung
  geschieht dort, wo das Fenster lebt, statt sie zu erfragen und dann zu handeln: dazwischen kann
  der Benutzer zurückklicken, und eine Taskleiste, die jemanden anblinkt, der ohnehin auf das
  Fenster schaut, ist schlimmer als gar keine. Nur diese zwei: eine fertige Aufgabe ist eine
  Nachricht, kein angehaltener Agent.

- **Die Seitenleiste markiert ein Projekt, das unbeaufsichtigt läuft.** Ein Mond neben seinem Namen,
  solange der autonome Modus an ist. Das war schon immer projektweise — der Schalter setzt ihn nur
  auf jenem Projekt — aber die einzige Stelle, die es sagte, lag im Projekt selbst, was für das
  Projekt, auf das man gerade nicht schaut, nichts nützt.

### Behoben

- **Ein Zug, der drei Dinge fragt, wird einmal beantwortet.** Ein Agent kann mehrere Fragen auf
  einmal stellen, und jede Antwort setzte seinen Lauf für sich fort: drei Läufe aus einem einzigen
  Zug, drei Karten auf dem Board, drei Agenten im selben Arbeitsverzeichnis, wegen Fragen, die du in
  einem Rutsch beantwortet hast. Jetzt kommen sie als Gruppe — ein Reiter je Frage, ein Haken auf
  den erledigten, und ein einziger Knopf, der deaktiviert bleibt, solange eine fehlt. Zurück geht
  eine einzige Nachricht mit jeder Frage und ihrer Antwort, denn die zweite Antwort nützt dem
  Agenten nichts ohne die Frage, zu der sie gehört. Fragen aus einem anderen Lauf warten auf ihren
  Zug, statt sich der Gruppe anzuschließen.

- **Ein Lauf, der auf Kontingent wartet, startet sich nicht mehr endlos neu.** Geparkte Läufe werden
  wieder aufgenommen, wenn das Kontingent zurück ist, und einer der Momente, in denen das geprüft
  wird, ist „der letzte Lauf ist gerade zu Ende" — ein Neustart, dem erneut das Kontingent ausging,
  wurde also erneut geparkt, erneut geprüft und erneut gestartet, so schnell das CLI scheitern
  konnte, mit einer Nachricht im Verlauf bei jeder Runde. Zwei Dinge waren falsch. Der Zähler, wie
  viele Versuche diese Arbeit schon hatte, lag auf dem geparkten Eintrag, und der Eintrag wurde
  gerade zum Neustarten weggeworfen — also las sich jeder Versuch wie der erste. Und ein Anbieter,
  der meldet, aufgebraucht zu sein, ohne zu sagen, wie viel es war — Antigravity, dessen Pools nur
  „agotado" und eine Reset-Zeit sagen —, kam aus der Zusammenfassung als „keine Ahnung", was alles,
  was fragt „ist das Kontingent zurück?", als Ja liest. Jetzt drei Versuche, dann sagt es Bescheid
  und wartet auf dich.

- **Die App wird nicht mehr träge, während ein Agent arbeitet.** Jede Zeile, die ein CLI ausgab,
  wurde an seinen Lauf im Store angehängt, zwölfmal pro Sekunde, den ganzen Lauf lang. Acht Ansichten
  hängen an der Map der Läufe — das Eingabefeld darunter —, also zeichneten sie sich alle in diesem
  Takt neu, für einen Puffer, den nichts auf dem Bildschirm las: diese Rohzeilen stehen nur in einem
  Dialog, und nur wenn man ihn öffnet. Sie liegen jetzt beiseite und werden einmal in den Lauf
  geschrieben, wenn er endet, sodass die Läufe stillstehen, solange einer läuft. Der Dialog folgt
  ihnen weiterhin live, und ein Absturz mitten im Lauf hinterlässt das Log trotzdem auf der Platte.
  Zwei weitere nebenbei: ein Flush ohne Text schreibt den Verlauf nicht mehr um, nur um ihn
  unverändert zurückzugeben, und die Knoten der Hierarchie zeichnen sich nicht mehr bei jedem Delta
  neu — jeder beobachtet jetzt den letzten Werkzeugaufruf seines eigenen Agenten, der sich zwischen
  zwei Aufrufen nicht bewegt.

- **Ein Projekt, das beim Neustart der App gearbeitet hat, sagt das auch.** Die App mitten in einer
  Delegation aktualisieren, wieder öffnen, zur Hierarchie gehen — und es sah aus wie ein Projekt, in
  dem nie etwas passiert war: alle Agenten untätig, ohne etwas zu sagen. Die Läufe kamen die ganze
  Zeit von der Platte zurück und der Verlauf zeigte sie; was die Hierarchie liest, ist die Laufzeit
  je Agent, und ein Neustart baut die allein aus dem Team. Jeder Agent kommt jetzt mit der Aufgabe
  zurück, in deren Mitte er abgeschnitten wurde, als gestoppt markiert — nichts ist gescheitert, die
  App ist weggegangen. Einen Agenten, den dieser Prozess bereits an die Arbeit gesetzt hat, lässt es
  in Ruhe: das Wiederherstellen ist asynchron, und die Aufgabe eines toten Laufs über einem lebenden
  würde etwas völlig anderes beschreiben.

- **Das rechte Dock gehört zu dem Projekt, in dem du bist.** Öffnetest du das Terminal-Panel in
  einem Projekt und gingst in ein anderes, blieb es auch dort offen — über einer leeren Tableiste,
  denn die Terminals gehörten dem ersten. Alle drei Panels werden jetzt pro Projekt gemerkt: beim
  Verlassen weggeräumt, beim Zurückkommen wieder hervorgeholt, und zu für ein Projekt, das sie nie
  geöffnet hat.


## 0.11.0 — 2026-09-10

### Neu

- **Die drei Ansichten eines Projekts sind Zeilen in der Seitenleiste.** Orchestrator, Aufgaben und
  Hierarchie waren ein Umschalter in der oberen Leiste — der einzige Streifen, der auch den
  Projektnamen, den Branch, die Ausgaben, den autonomen Schalter und jeden Panel-Knopf tragen muss.
  Sie sind Navigation, und Navigation gehört in die linke Spalte. Jede Zeile öffnet die Ansicht, die
  sie benennt, statt dich dort zu lassen, wo das Projekt zuletzt stand.

- **Schnellbefehle dürfen deine eigenen sein.** Neben den erkannten Skripten gibt es jetzt einen
  Platz für die, die keine Datei deklariert: die docker-compose-Zeile, den Tunnel, die Migration,
  die nur dieses Projekt braucht. Sie gehören zum Projekt und stehen im Menü ganz oben.

- **Die Fensterleiste sagt, wenn ein Chatkanal verbunden ist.** Neben dem Telefon ein Licht für
  Telegram, Discord oder Slack, sobald einer wirklich läuft — die Frage, für die du sonst die
  Einstellungen öffnen müsstest. Es ist kein Schalter: einen Kanal anzuschalten verlangt ein Token
  und eine Liste, wer sprechen darf.

- **Das Terminal-Panel bietet die Skripte des Projekts als Knöpfe an.** Den Dev-Server zu starten
  hieß, ein Terminal zu öffnen und einzutippen, was im Projekt längst steht. Das Panel liest es
  jetzt: die `scripts` einer package.json, die Targets eines Makefiles und cargos übliche vier. Je
  ein Knopf, die häufigsten zuerst — dev, start, build, test. Jeder öffnet einen eigenen Tab, benannt
  nach dem Skript statt „PowerShell 3", damit der Tab mit dem Server wiederzufinden ist. Drückst du
  ein Skript, das schon läuft, bringt es dich dorthin, statt ein zweites zu starten, das den Kampf
  um den Port verliert; ein grüner Punkt markiert die laufenden. Der Paketmanager kommt aus der
  Lockdatei, denn `npm run` löst in einem pnpm-Workspace einen anderen Baum auf. Ein Skript, dessen
  Name kein einfacher Name ist, wird gar nicht angeboten: diese Zeichenketten landen in einer echten
  Shell, wo `predev && curl x | sh` genau so liefe, wie es dasteht.

- **Der Abhängigkeitsgraph wird von einer Aufgabe aus geöffnet und zeigt nur deren Familie.** Früher
  war er eine zweite Ansicht des ganzen Boards und zeichnete jede Kette des Projekts nebeneinander:
  er wurde breiter als das Fenster, und die Antwort auf „womit hängt diese hier zusammen?" lag
  irgendwo mittendrin. Jetzt öffnet er sich von der Aufgabe selbst, und auf dem Bildschirm steht,
  worauf diese Aufgabe wartet und was auf sie wartet, transitiv — sonst nichts. Eine Aufgabe, die
  bloß eine Voraussetzung teilt, ist ein Geschwister, keine Familie, und bleibt draußen; die
  Geschwister waren es, die den alten unlesbar machten. Ein Klick auf eine Karte rückt den Graphen
  auf sie, so lässt sich eine Kette Schritt für Schritt verfolgen. Archivierte kommen mit: eine
  archivierte Voraussetzung ist weiterhin der Grund, warum etwas darunter nicht starten kann.

- **Ein Gespräch zurücknehmen oder umschreiben, was du gefragt hast.** Rechtsklick auf eine
  Nachricht in einem Chat, und das Gespräch kann dort enden; bei deinen eigenen kannst du sie
  außerdem bearbeiten und von dort aus neu fragen. Was danach kam, geht — und die Sitzung des
  Agenten ebenfalls. Der sichtbare Verlauf ist nur die eine Hälfte eines Gesprächs, das Gedächtnis
  des Agenten ist die andere, und ließe man es mit dem zurück, was du gerade zurückgenommen hast,
  würde der Verlauf darüber lügen, worauf die nächste Antwort aufbaut. Der Dialog sagt das vor dem
  Knopf, nicht danach. Bis zur letzten Nachricht zurückzugehen ist ausgegraut, denn es nähme nichts
  mit.

- **Autonomer Modus, mit einer Uhrzeit, zu der er sich abschaltet.** Ein Knopf in der Projektleiste
  schaltet ihn für 1, 2, 4, 8 oder 12 Stunden ein. Solange er läuft, wartet das Projekt nicht auf
  dich: Delegationen, die deine Freigabe bräuchten, werden freigegeben, Fragen beantworten sich
  selbst auf dem vorsichtigsten Weg, und die Rundengrenze beendet die Aufgabe nicht mehr. Ein „für
  immer“ gibt es nicht — er schaltet sich zur eingestellten Uhrzeit selbst ab, und ein Stopp von
  Hand stoppt weiterhin. Das Ausgabenlimit des Projekts gilt unverändert; das ist die Bremse. Und
  eine Aufgabe, die nichts als fragt, frisst nicht die ganze Nacht: nach zehn eigenen Antworten
  warten die Fragen wieder auf dich. Am Ende bleibt der Bericht im Verlauf: was fertig wurde, was
  scheiterte, was freigegeben und was ohne dich beantwortet wurde.

- **Neuer Versuch, wenn das Kontingent zurück ist.** Ein Lauf, der starb, weil sein Modell leer war,
  ließ die Arbeit liegen, bis du von Hand neu gestartet hast. Jeder Agent hat jetzt sein eigenes
  Kästchen: ohne Kontingent wartet der Lauf, statt zu scheitern, und startet mit demselben Prompt
  von selbst neu, sobald der Anbieter wieder Platz hat. Im autonomen Modus geschieht das mit oder
  ohne Kästchen. Ist das Kästchen aus oder der autonome Zeitraum vorbei, wenn das Kontingent
  zurückkommt, wird nichts neu gestartet — und das steht da, statt still zu bleiben.

- **Slack auch, und damit sind es alle drei.** Telegram, Discord und Slack, dieselben Befehle in
  dem, den du ohnehin offen hast, jeder mit eigener Karte in den Einstellungen und eigener
  Chatliste — ein Chat, der auf einem autorisiert ist, ist nur auf diesem autorisiert. Slack verlangt
  zwei Tokens statt einem: eines auf App-Ebene, das die Verbindung öffnet, und eines für den Bot,
  das schreibt. Das ist Slacks Entwurf, nicht unserer, und der Bildschirm sagt, welches welches
  ist. Socket Mode muss in deiner Slack-App eingeschaltet und der Bot in den Kanal eingeladen sein;
  auch das steht dort, denn sonst kommt nichts an und von hier ließe sich nicht sagen, warum.

- **Discord, neben Telegram.** Dieselben Befehle in dem der beiden, den du ohnehin offen hast: Was
  du schreibst, startet eine Aufgabe, `/status` sagt, wer arbeitet, `/approve` und `/answer`
  erledigen, was auf dich wartet. Die Einstellungen haben jetzt eine Karte pro Kanal. Keiner von
  beiden legt etwas offen — die App geht hinaus, es gibt weiterhin keinen Tunnel, keinen Port und
  keine Adresse zu finden. Jeder Kanal autorisiert seine eigenen Chats und nur seine: Eine
  Discord-Kanal-ID ist nicht autorisiert, weil sie auf Telegrams Liste steht. Dein Bot braucht im
  Discord-Entwicklerportal die Berechtigung für Nachrichteninhalte, und der Bildschirm sagt das —
  ohne sie kommen die Nachrichten leer an, und von hier aus wäre nicht zu erkennen, warum.

- **Den Pull Request von hier aus öffnen.** Ein Agent wird auf seinem Branch fertig, und der letzte
  Schritt war deiner, von Hand. Jetzt gibt es eine Schaltfläche neben Pull und Push und auf der
  fertigen Karte. Sie öffnet nie einen mit einem einzigen Klick: Ein Dialog zeigt, welcher Branch
  gegen welchen geht, mit Titel und Text schon geschrieben — aus der Aufgabe und aus dem, was der
  Agent gemeldet hat: die angefassten Dateien, was er geprüft hat, und was er nicht schaffen
  konnte, das eine eigene Überschrift bekommt statt wegzufallen. Auf dem Standard-Branch verweigert
  sie, und auf einem ungepushten bietet sie an, vorher zu pushen, statt es hinter deinem Rücken zu
  tun.

- **Eine Aufgabe mit einem anderen Modell oder einem anderen Agenten wiederholen.** Ein Lauf, der
  schiefging — oder dessen Agent auf halbem Weg das Kontingent aufbrauchte — ließ dich alles neu
  tippen. Jetzt bieten das Menü des Laufs und die Schaltfläche auf seiner Karte an, ihn mit
  demselben Prompt und dem, den du wählst, noch einmal zu starten. Er beginnt bei null, statt den
  gescheiterten Lauf fortzusetzen, denn dessen Kontext ist meist das Problem. Ein Agentenwechsel
  setzt das Modell zurück: Die Modelle eines Anbieters sind nicht die eines anderen, und eines
  mitzunehmen ist der Weg, einen Lauf an ein Modell zu schicken, das es nicht gibt.

- **Dateien aufs Eingabefeld ziehen.** Die Büroklammer und Strg+V waren die beiden Wege hinein;
  eine Datei aus dem Ordner zu ziehen, den du ohnehin offen hast, ist der dritte — und der ohne
  Umweg. Das Feld umrandet sich, wenn ein Zug mit Dateien darüberkommt, und was du schon
  geschrieben hattest, geht mit. Eine Board-Karte, die auf dem Weg in eine andere Spalte
  vorbeikommt, bleibt unberührt: Sie trägt Text, keine Dateien, und sie abzufangen würde sie
  nirgendwohin bewegen.

### Behoben

- **Ein langes Aufgabendetail schiebt nicht mehr alles andere aus dem Dialog.** Ein Agent schreibt
  so viel, wie ihm danach ist, und das Detail steht zwischen den Statusfeldern und den Abhängigkeiten
  und dem Lauf. Es ist jetzt auf wenige Zeilen gefaltet, mit einem „Mehr anzeigen", das es öffnet. Ob
  der Knopf gebraucht wird, wird gemessen und nicht aus der Textlänge geraten: wie viele Zeilen ein
  Absatz braucht, hängt von der Breite ab, die er bekommt.

- **Die Skripte des Projekts sind ein Menü statt einer scrollenden Zeile.** Eine Knopfreihe in einem
  ohnehin schmalen Panel hieß eine waagerechte Scrollleiste, und ein Projekt mit zwanzig Skripten
  versteckte neunzehn dahinter. Jetzt sind sie ein Menü neben dem „+", in derselben Form wie die
  Shell-Auswahl daneben.

- **Die obere Leiste sagt nicht mehr, wie viele Agenten arbeiten.** Der Punkt neben dem Projekt in
  der Seitenleiste atmet ohnehin, solange sie es tun — dort, wo man hinsieht, um zu sehen, was los
  ist.

- **Der Knopf für den autonomen Modus hat die Form der Knöpfe um ihn herum.** Er trug seine eigene
  bernsteinfarbene Füllung, um unübersehbar zu sein. Nötig war das nicht: der Streifen unter der
  Leiste ist der laute, er läuft über die volle Breite, und es gibt ihn nur, solange der Modus an
  ist.

- **Das Kommunikationspanel ist eine Sprechblase.** Sein Symbol beschrieb, wo sich das Panel öffnet,
  das Uninteressanteste daran. Was drinsteht, ist, was die Agenten einander gesagt haben.

- **Die Leiste des Boards steht auf einer Linie.** Ein Button, ein Input und ein SelectTrigger sind
  sich beim Eckenradius von Haus aus nicht einig, also kam eine Reihe aus allen dreien mit zwei
  Radien nebeneinander heraus. Jetzt hat alles eine Höhe und einen Radius, an jedem Steuerelement
  gesagt statt den Standardwerten überlassen.

- **Eine Frage zu beantworten ist eine Liste zum Ankreuzen und ein Knopf zum Drücken.** Die
  Optionen waren Knöpfe in einer Zeile, jeder so breit wie sein eigener Text, also wirkte eine Reihe
  davon ausgefranst und eine Ein-Wort-Option war ein Ziel von der Größe des Wortes. Jetzt sind sie
  eine Liste, eine pro Zeile, so breit wie der Kasten. Eine Frage, die mehrere Antworten annimmt,
  sagt das, statt es dich mit zwei Klicks herausfinden zu lassen. Und eine Frage mit einer Antwort
  geht nicht mehr los, sobald du eine Option berührst: beide warten auf „Antworten", damit das, was
  gleich gesagt wird, vorher auf dem Bildschirm steht — und ein Fehlklick ist ein Klick zum
  Rückgängigmachen statt etwas bereits Gesendetes. Bei einer Antwort ersetzen sich Option und
  Freitextfeld gegenseitig, denn eine Antwort kann nicht zugleich ein anderer Satz sein.

- **Die Knöpfe am Fuß einer Aufgabe ordnen sich danach, was sie tun.** Drei lose Knöpfe unter einer
  „verteil sie"-Regel ließen „archivieren" in der Mitte stranden, gleich weit entfernt von einem
  Link, der woandershin führt, und einem Löschen, das nicht zurückkommt. Woandershin gehen steht
  jetzt links, und was die Aufgabe verändert, steht rechts, beisammen.

- **Das Board hat seinen Ansichtsumschalter verloren und „Neue Aufgabe" dorthin zurückbekommen, wo
  sie hingehört.** Da der Graph keine zweite Ansicht des Boards mehr ist, gab es nichts mehr zu
  wechseln, also sind aus den zwei Leisten eine geworden: die Suche, der Filter, die Zählung, und am
  Ende „Prüfen", „Als Markdown kopieren" und „Neue Aufgabe" nebeneinander.

- **Antigravitys Kontingent sagt, warum es eine Schätzung ist.** Sein Ring zeigt einen Strich, wo
  jeder andere Anbieter eine Zahl zeigt, und ein Strich ohne Begründung daneben wirkt wie ein
  Fehler. Es ist keiner: Antigravity meldet nicht, wie viel übrig ist. Die genaue Zahl gibt es —
  sein CLI fragt Google danach — aber sie steckt hinter einer kostenpflichtigen Code-Assist-Lizenz,
  und einem Konto ohne sie wird sie verweigert. Also sagt die App das jetzt, neben dem Strich, im
  Popover des Eingabefelds, im Bildschirm des Agenten und in den Einstellungen, statt dich raten zu
  lassen. Was zu sehen ist, wird weiterhin aus dem „quota reached, resets in 1h45m" abgeleitet, mit
  dem die Läufe zurückkommen — mehr gibt es nicht zu lesen.

- **Ring und Balken des Kontingents füllen sich, während es verbraucht wird.** Sie füllten sich mit
  dem, was *übrig* war: ein unangetastetes Kontingent war ein voller Ring, ein fast aufgebrauchtes
  fast leer — verkehrt herum für die Anzeige von etwas, das verbraucht wird, und der Grund, warum
  sie auf einen Blick nicht zu lesen waren. Jetzt beginnen sie leer und füllen sich mit dem
  Verbrauchten, und jede Zahl daneben zählt dasselbe: „83 %" ist, was weg ist, nicht was bleibt. Die
  Farbe richtet sich weiter nach dem Rest, ein fast voller Ring ist also auch rot — beide Hälften
  sagen im selben Moment „es geht zur Neige", statt dass eine es zu spät sagt.

- **Ein Schritt sagt, was er getan hat, ohne auf den Browser zu warten.** Jede Zeile der Aktivität
  eines Agenten ist gekürzt — ein Werkzeug zeigt seine Zusammenfassung, eine Delegation neunzig
  Zeichen der Aufgabe — und der Rest war nur über das `title` des Browsers zu lesen: eine Sekunde
  Warten, ein nacktes Kästchen irgendwo beim Zeiger, und Zeilenumbrüche zu Leerzeichen plattgedrückt,
  genau das, was man bei einem Befehl oder einem Stacktrace nicht will. Jetzt haben sie den Tooltip
  der App, an ihrer Zeile verankert, in Monospace und mit erhaltenen Umbrüchen. Der Schritt, bei dem
  ein Lauf gerade ist, hat auch einen — er hatte vorher gar nichts.

- **Ein Agent weiß nicht mehr von einem Projekt, von dem ihm niemand erzählt hat.** Der gemeinsame
  Kontext war ein einziger Text in den Einstellungen und wurde an den Prompt jedes Agenten in jedem
  Projekt gehängt. Schriebst du etwas über ein Repo, hatten alle Agenten überall es gelesen — so kam
  es, dass eine Nachricht für ein Projekt in einem anderen verstanden, befolgt und weitergetragen
  wurde. Jetzt gehört er zu je einem Projekt: die Einstellungen wählen welches, und `ainess context`
  nimmt `-p`/`-w` wie der Rest des CLI. Was du geschrieben hattest, wird in jedes vorhandene Projekt
  kopiert, damit nichts verloren geht; galt der Text nur einem, sind die anderen jetzt der Ort, wo
  du ihn löschst.

- **Ein Hook beginnt mit einer Nachricht zu dem Ereignis, das du gewählt hast.** Hinter allen
  siebzehn stand ein einziger Vorschlag, geschrieben für „ein Agent ist fertig" und fest auf
  Spanisch. Ein Hook auf „Internet weg" begann damit, zu verkünden, ein Agent sei fertig — für
  alle, in einer Sprache, die die meisten nicht gewählt hatten. Jedes Ereignis beginnt jetzt mit
  seiner eigenen Zeile, in deiner Sprache, mit den Variablen, die es wirklich mitbringt: die Frage,
  wenn gefragt wird, das Modell, wenn das Kontingent leer ist, beide Agenten bei einer Delegation.
  Änderst du das Ereignis, bevor du die Nachricht anfasst, folgt sie; fasst du sie an, folgt sie
  nicht mehr, denn ab da gehört sie dir. Auch der Testknopf füllt die Variablen in deiner Sprache,
  damit die Vorschau die Nachricht ist, die du wirklich bekommst.

- **Die App schleppt keine sechs Sprachen mehr mit, die sie dir nicht zeigt.** Alle sieben
  Wörterbücher steckten im selben Bundle, also zahlte jeder Start für die sechs, die niemand las:
  575 kB, 179 gepackt. Jetzt ist nur Spanisch fest eingebaut — es ist die Basis, auf die alle
  anderen zurückfallen — und deine wird vor dem ersten Zeichnen geholt und behalten. Dieser Chunk
  ging von 575 kB auf 83 kB und von 179 gepackt auf 27.

- **Ein Agent, der in einem Chat eine Frage beantwortet, kann keine Arbeit mehr verteilen.** Der
  Zug, der deine Antwort trägt, wurde gestartet, ohne dass ihm gesagt wurde, dass er zu einem Chat
  gehört — also wurde er als Aufgabe gelesen und seine `delegate`-Blöcke ausgeführt. Ein Agent
  konnte andere aus einem Gespräch heraus an die Arbeit schicken, in dem niemand darum gebeten
  hatte.

- **Das Board scrollt beim Ziehen auch nach unten.** Eine Spalte, die höher ist als der
  Bildschirm, hatte dasselbe Problem wie das Board in der Breite: Die Karte, unter der du ablegen
  wolltest, lag außerhalb. Jetzt zieht auch die Spalte unter dem Zeiger, mit derselben Rampe.

- **Die Konsolenfenster, die ein Agent bei der Arbeit öffnete, sind endgültig weg.** Der letzte
  Versuch behob die falsche Hälfte. Einen Prozess ohne Konsole anzufordern wirkt für diesen Prozess
  — und dann fragt jedes Konsolenprogramm, das *er* startet, Windows nach einer, bekommt eine neue,
  und die ist sichtbar. Die Fenster waren nie unsere: Sie gehörten den Programmen, die unsere
  Agenten ausführten. Die App nimmt sich beim Start jetzt eine einzige Konsole und versteckt sie,
  und alles darunter erbt diese, statt nach einer eigenen zu fragen — wie tief es auch geht.

- **Ein Dateilink in einer Antwort tut jetzt etwas.** Schrieb ein Agent
  `[die Datei](file:///C:/Users/du/notizen.txt)`, wurde daraus ein toter grauer Text: `file:` stand
  auf derselben Verbotsliste wie `javascript:` und `data:`, die tatsächlich in der Seite ausgeführt
  werden — dorthin geraten war es nur durch Assoziation, denn es führt gar nichts aus. Ein Klick
  zeigt die Datei jetzt im Dateimanager und hört dort auf. Ein echter Link wird daraus nie, und dem
  System zum Öffnen übergeben wird sie auch nicht: `[schau dir das an](file:///C:/x.exe)` ist eine
  Zeile, die jeder Agent schreiben kann.

- **Das Board scrollt selbst, wenn du eine Karte an seinen Rand ziehst.** Ein Board, das breiter
  ist als das Fenster, ließ sich nicht überqueren: Die gewünschte Spalte lag außerhalb, und
  loszulassen, um zu scrollen, legte die Karte dorthin, wo du sie nicht haben wolltest. Eine Karte
  nahe einem der beiden Ränder zu halten zieht jetzt das Board mit — sanft am Rand der Zone und
  schneller, je näher du kommst. Und es zieht weiter, während du stillhältst, wovon die
  Drag-Ereignisse von sich aus niemandem erzählen.

## 0.10.0 — 2026-09-09

### Neu

- **Das Eingabefeld vervollständigt, was du gerade tippst.** `@` nennt einen Agenten des Projekts,
  `#` eine Datei des Arbeitsverzeichnisses, `{{` eine der Vorlagenvariablen, und `/` deine Befehle
  und deine gespeicherten Aufträge zusammen — beides ist etwas, das man starten kann. Pfeile zum
  Wandern, Enter oder Tab zum Auswählen, Escape zum Schließen der Liste, ohne das Getippte
  anzurühren. Zu den zwei vorhandenen Befehlen kamen fünf: `/tasks`, `/chat`, `/diff`, `/stop` und
  `/clear`, das vorher fragt. Innerhalb eines Codeblocks wird nichts vervollständigt — dort ist ein
  `#` ein Kommentar und ein `/` ein Pfad.

- **Du kannst Code in das Feld schreiben.** Enter hat gesendet, also hieß ein Codeblock: in jeder
  Zeile an Shift+Enter denken und hoffen, dass der Zaun geschlossen war — das Feld zeigte Markdown
  als flachen Text und gab keinerlei Hinweis. Jetzt wissen die Tasten, wo der Cursor steht: In einer
  Zeile, die nur eine öffnende Zaunzeile ist, schreibt Enter die schließende und setzt dich
  dazwischen; innerhalb eines Zauns ist Enter ein Zeilenumbruch, der deine Einrückung mitnimmt, und
  Tab sind zwei Leerzeichen; und der eingezäunte Teil dessen, was du schreibst, bekommt einen
  Hintergrund, damit du siehst, wo er anfängt und aufhört. Ctrl+Enter sendet von innen, da Enter
  allein es nicht mehr kann.

### Behoben

- **Eine Frage wird an einer Stelle gestellt.** Sie erschien als Blase im Verlauf und übernahm
  gleichzeitig das Eingabefeld — beide lebendig, beide dieselbe Frage. Das Feld behält sie, denn
  dort kannst du mit dem ganzen Composer antworten. Beantwortet kehrt sie als schreibgeschützte
  Zeile in den Verlauf zurück, die dort das Einzige ist, was festhält, dass sie je gestellt wurde.

- **Aus dem Eingabefeld zu antworten beantwortet die Frage jetzt wirklich.** Ein Agent fragt etwas,
  du schreibst die Antwort lieber im Eingabefeld als im Feld der Frage, du sendest — und die Frage
  blieb offen. Sie legte sich bei jeder Rückkehr in das Gespräch wieder über das Feld, blieb in der
  Glocke, auf dem Startbildschirm und in `/status`, und der fragende Lauf wartete weiter auf eine
  Antwort, die er längst hatte, während deine Nachricht einen eigenen Lauf startete. Ein Agent, der
  etwas gefragt hat, steht und wartet auf dich — was du als Nächstes schreibst, ist die Antwort,
  ganz gleich wo du sie geschrieben hast.

- **Der Startbildschirm sagt jede Sache genau einmal.** Er war zum Bildschirm für das geworden, was
  dich braucht — aber das alte Raster aus Projektkarten lag noch darunter. Ein arbeitender Agent
  erschien dreimal: in der Liste der laufenden Arbeit, in der Karte seines Projekts und noch einmal
  im Zähler derselben Karte. Jede Karte trug außerdem eigene Schaltflächen für Öffnen, Bearbeiten
  und Löschen — eine rote auf jeder — für Aktionen, die der Klick auf die Karte und ihr
  Kontextmenü längst abdeckten. Jetzt ist der ganze Bildschirm eine einzige Art von Zeile: was dich
  braucht, was arbeitet, und die Projekte, in dieser Reihenfolge. Eine Projektzeile zeigt eine
  Zeile Status und, nur wenn es etwas gibt, eine kleine Zahl für Wartendes und Laufendes. Wartet
  nichts, sagt sie das in einer Zeile, statt es dich herleiten zu lassen.

- **Die vorgeschlagenen Skills sind für den Agenten geschrieben und dir in deiner Sprache
  erklärt.** Der Katalog hinter „Vorschläge" war durchgehend spanisch: die Namen, die Anweisungen,
  die ein Agent tatsächlich liest, und die einzeiligen Beschreibungen in der Liste. Die Anweisungen
  sind Code — sie gehen in den Prompt eines Agenten und in eine Datei im Projektordner —, also sind
  sie jetzt englisch wie der Rest des Repositorys. Was für dich geschrieben ist, wird stattdessen
  übersetzt, in allen sieben Sprachen, und ein Test lässt keinen neuen Vorschlag durch, bevor ihn
  jede Sprache hat.

## 0.9.0 — 2026-09-08

### Neu

- **Ein Ausgabenlimit pro Projekt, und die Warnung, bevor es aufgebraucht ist.** Die Nutzungsansicht
  konnte immer sagen, was ein Projekt gekostet hat. Aufhalten konnte sie es nicht. Ein Projekt nimmt
  jetzt ein Tageslimit, ein Monatslimit oder beides — und du legst fest, was beim Erreichen passiert:
  warnen, oder keine neuen Läufe mehr starten lassen. Die Warnung kommt bei 80 %, einmal am Tag und
  nicht einmal pro Lauf, und die Nutzungsansicht zeichnet den Balken gegen das Limit, das dem Bruch am
  nächsten ist. Die Zahlen sind weiterhin nur das, was die jeweilige CLI tatsächlich gemeldet hat: Ein
  Anbieter, der nichts meldet, zählt nichts — und die Ansicht sagt das, statt zu schätzen.

- **Ein Hook kann dir über Telegram Bescheid geben, und es gibt drei weitere Momente, von denen es
  sich zu erfahren lohnt.** Die beiden anderen Chat-Aktionen verlangen einen Webhook, den man erst
  auf einem Server anlegen muss; diese nutzt den Bot, der in „Nachrichten" schon eingerichtet ist —
  „wenn eine Aufgabe fertig ist, sag mir Bescheid" ist damit ein Eintrag in einer Liste. Du kannst
  einen Chat benennen oder das Feld leer lassen für alle Chats der Liste — und nur die der Liste,
  denn ein Hook darf nicht die Hintertür daran vorbei sein. Mitgekommen sind drei neue Ereignisse:
  ein Agent hat etwas gefragt und wartet, eine Review hat Änderungen verlangt, und einem Agenten ist
  das Kontingent ausgegangen.

- **Die Palette durchsucht, was gesagt wurde, nicht nur, wie die Dinge heißen.** Sie fand Projekte,
  Aufgaben, Chats und Agenten am Namen — was man am selben Tag braucht. Zwei Wochen später erinnert
  man sich aber an einen Satz, nicht an einen Titel. Drei Zeichen genügen, und die Nachrichten aus
  dem Projekt-Feed und aus jedem Chat kommen mit zurück, die neuesten zuerst, jede mit den gesuchten
  Wörtern mitten in der Zeile statt mit dem, womit die Nachricht zufällig anfing. Akzente und
  Groß- und Kleinschreibung spielen keine Rolle, und der Zeilenumbruch zwischen den zwei Wörtern
  auch nicht.

- **Das Diff eines Laufs, nicht das des ganzen Projekts.** Das Diff-Panel zeigt den Arbeitsbaum des
  Projekts — das beantwortet „was ist in diesem Repository los" und nie „was hat diese Aufgabe
  angefasst". Jeder Lauf merkt sich jetzt, wo er lief (im Projekt-Workspace oder im eigenen Worktree
  des Agenten) und auf welchem Commit er startete. Die Detailansicht eines Laufs zeigt damit, was
  sich seit seinem Start bewegt hat. Ältere Läufe wissen beides nicht und sagen das, statt zu
  raten.

- **Ein Agent kann seine eigene Karte bewegen und eine für das öffnen, was ihm unterwegs
  auffällt.** Das Board lief nur in eine Richtung: Der Planer las es und verteilte die Arbeit, und
  wer sie erledigte, sah nicht einmal die eigene Karte — geschweige denn, dass er sagen konnte, er
  hänge fest. Jetzt kann jeder Agent während der Arbeit einen `task`-Block hinterlassen: der eine
  bewegt seine Karte und hängt eine Zeile Detail an, der andere legt im Backlog eine nicht
  zugewiesene Karte für etwas an, das ihm begegnet ist und nicht zu ihm gehört. Es landet auf dem
  Board, während der Lauf noch läuft, nicht erst am Ende, und die Backlog-Karte nennt den
  Vorschlagenden. Eine Karte zu schließen bleibt nicht Sache des Agenten.

- **Die App antwortet in einem Chat, den du ohnehin offen hast.** In den Einstellungen gibt es einen
  Bereich Messaging: du fügst ein Bot-Token von @BotFather auf Telegram ein, schaltest es an und
  schreibst dem Bot — alles, was du sagst, startet eine Aufgabe, `/status` sagt, wer arbeitet und was
  auf dich wartet, `/approve` und `/answer` erledigen, was dich braucht, `/stop` stoppt. Dabei wird
  nichts geöffnet: die App fragt von sich aus nach, also kein Tunnel, kein Port, keine Adresse, die
  jemand finden könnte. Nur die Chats auf der Liste dürfen Befehle geben, eine leere Liste erlaubt
  niemandem etwas, und ein Fremder bekommt gar keine Antwort — seine Id taucht in den Einstellungen
  mit einem Knopf zum Erlauben auf, und so findest du auch deine eigene. Was die Glocke erreicht,
  erreicht auch den Chat, und was auf dich wartet, sagt dir, was du zurückschreiben sollst.

### Behoben

- **Zwei Chats mit demselben Agenten sind wieder zwei Gespräche.** Ein Agent hatte genau ein Fach
  für seine Provider-Sitzung, und darin lag jeweils das Gespräch, das zuletzt gesprochen hatte. Du
  öffnest einen zweiten Chat mit einem Agenten, mit dem du schon sprichst, gehst zurück zum ersten —
  und er antwortet dir mit dem Kontext des anderen. Zudem überschrieb ein Chat die Sitzung, die
  seine eigenen Aufgaben benutzten. Jetzt übergibt ein Chat die Sitzung, die ihm gehört, statt in
  jenes Fach zu greifen, legt das vom Provider Gemeldete zu dem Chat, zu dem es gehört, und ein Chat
  ohne eigene Sitzung fängt neu an, statt sich eine zu borgen. Eine Frage, die in einem Chat
  gestellt wurde, wird auch dort beantwortet.

- **Alle Arten im Kommunikationsfilter abzuschalten leert jetzt die Ansicht.** Was du einem Agenten
  schickst, war ausgenommen: Es wurde gezeigt, ganz gleich was der Filter sagte, und es stand nicht
  einmal auf der Liste der Arten — es ließ sich also gar nicht abschalten. Die Schaltfläche las sich
  als „Typen (0/8)", während das Panel weiter Dinge zeigte. Jetzt sind es zehn Arten, deine beiden
  darunter, und aus heißt aus. Und wenn es der Filter war, der die Ansicht geleert hat, sagt sie
  das, statt zu behaupten, es habe keine Aktivität gegeben.

- **Der Kommunikationsbereich liest, was ein Agent geschrieben hat, so wie er es meinte.** Seine
  Zeilen zeigten rohes Markdown — die Sternchen, die Backticks, die Rauten —, während derselbe Text
  überall sonst in der App richtig dargestellt wurde. Jetzt wird Fließtext gerendert: was ein Agent
  gesagt hat, was er delegiert hat, womit er zurückkam, und seine Notizen. Werkzeugzeilen und
  stderr bleiben genau so, wie sie kamen, denn ein Pfad wie `src/lib/__tests__/x.ts` ist keine
  Anweisung, die Hälfte davon fett zu setzen — und was du getippt hast, wird so gezeigt, wie du es
  getippt hast, wie im Chat auch.

- **Der Typenfilter bleibt offen, während du ihn benutzt, und sprengt das Panel nicht mehr.** Einen
  Typ auszuwählen schloss das Menü; den Feed auf zwei Typen einzugrenzen hieß, es fünfmal zu öffnen.
  Und die Schaltfläche, die es öffnet, heißt „Typen", bis du etwas abwählst, danach „Typen (7/8)" —
  eine längere Beschriftung, für die in dieser Zeile nichts schrumpfen durfte, sodass das ganze
  Panel breiter wurde als das Dock, in dem es sitzt. Jetzt gibt die Zeile nach, und die jeder
  Nachricht ebenso, wo zwei Agentennamen, eine Uhrzeit, ein Etikett und eine Schaltfläche denselben
  Streit um denselben schmalen Platz führten.

- **Wer eine Nachricht roh sehen will, bekommt diese Nachricht.** Die Schaltfläche in einer Zeile
  des Kommunikationsbereichs öffnete den ganzen Lauf — jede Zeile stdout, die die Sitzung
  hervorgebracht hatte. Das fragt niemand, der auf eine einzelne Delegation klickt. Jetzt zeigt sie
  diese Nachricht: von wem an wen, wann, der vollständige Text und, bei einem Werkzeugaufruf, das
  Werkzeug, seine Eingabe und der Fehler, an dem es scheiterte — mit einer Schaltfläche, um alles zu
  kopieren. Der ganze Lauf ist weiterhin da, einen Klick tiefer, wo er hingehört. Die Schaltfläche
  hat außerdem einen Tooltip und erscheint bei jeder Nachricht, nicht nur bei denen mit einem Lauf
  dahinter.

- **Das Fenster zu ziehen friert nicht mehr ein und springt nicht mehr.** Ein externes Programm
  auszuführen — das `git status`, das jede Minute aktualisiert, ein `git diff`, eine
  `--version`-Abfrage — hielt den Thread fest, der die Fensternachrichten pumpt, bis das Programm
  fertig war. Windows zieht ein Fenster mit einer modalen Schleife auf genau diesem Thread; ein Zug,
  der zufällig auf so einen Aufruf traf, blieb stehen und sprang dann dorthin, wo der Zeiger
  inzwischen war. Diese Befehle laufen jetzt außerhalb dieses Threads, ebenso das Lesen und
  Schreiben von Konfiguration und Logs. Die Konfiguration wird zudem daneben geschrieben und
  darübergelegt, damit niemand je eine halbe liest.

- **Die App heißt jetzt überall ainess, die ausführbare Datei eingeschlossen.** Früher hieß sie
  `ais`, und der alte Name überlebte dort, wo niemand hinsieht: im Rust-Crate und damit in der
  Binärdatei — die installierte App war `ainess\ais.exe`, und genau das zeigten Task-Manager,
  Firewall-Abfrage und Autostart-Liste. Die Kommandozeile zog mit: Aus `ais run` und `ais serve`
  werden `ainess run` und `ainess serve`, und `ais` gibt es nicht mehr. Nichts von dem, was du
  hattest, geht verloren: Entwürfe, Panel-Breiten und das Token des Telefons liegen unter neuen
  Namen und lesen weiterhin die alten.

- **Keine Konsolenfenster mehr, die über dem aufblitzen, was du gerade ansiehst.** Einen Lauf
  stoppen, die App schließen, ein Lauf mit Zeitüberschreitung, den Tunnel beenden und jede Prüfung
  auf einen alten Prozess griffen zu `taskkill` oder `tasklist` — und Windows gibt einem
  Konsolenprogramm, das eine Fensteranwendung startet, ein Konsolenfenster, sofern man nichts
  anderes sagt. Die Aufrufe, die einen Agenten starten, sagten es immer; die Aufräumaufrufe
  drumherum nicht.

- **Ein Knopf neben der Box, und zwar der, den der Moment verlangt.** Senden, wenn nichts läuft;
  stoppen, während ein Agent antwortet — die beiden drängeln sich nicht mehr über dem Text, den du
  schreibst. Darunter hat sich nichts geändert: Enter sendet weiterhin und stellt, während der Agent
  arbeitet, weiterhin in die Warteschlange für das Ende des Zugs — was jetzt die leere Box sagt
  statt eines zweiten Knopfes.

- **Die Frage eines Agenten nimmt den Platz der Box ein.** Sie lebte in der Blase des Laufs: nützlich,
  solange du hinschaust, nutzlos, sobald du weitergescrollt hast — und schlimmer, was du bei offener
  Frage in die Box geschrieben hast, startete einen neuen Lauf und ließ den Agenten auf eine Antwort
  warten, die nie kam. Jetzt steht die Frage dort, wo du schreiben wolltest, mit ihren Optionen als
  Schaltflächen und Platz für eine eigene Antwort; warten mehrere, sagt sie es, und sie kommen
  nacheinander. "Etwas anderes schreiben" gibt dir die Box zurück, ohne zu antworten.

- **Das Benachrichtigungs-Panel schließt sich, wenn du daneben klickst.** Es hängt an der
  Titelleiste, die die Zone zum Ziehen des Fensters ist: ein Klick dort nimmt das System, um das
  Fenster zu bewegen, und er erreicht nie die Schicht, die ein Popover schließt.

- **Terminals gehören zu ihrem Projekt.** Du hast eines in einem Projekt geöffnet, bist zu einem
  anderen gegangen und hast weiter die Tabs des ersten gesehen — deshalb schien ein Terminal auch im
  falschen Ordner zu öffnen: es war das eines anderen Projekts, in dessen eigenem Ordner. Jetzt
  zeigt jedes Projekt seine eigenen und merkt sich, welches vorn war. Ein gelöschtes Projekt lässt
  seine Shells weiterlaufen, wie bisher — eine davon steckt vielleicht mitten in etwas — und sie
  tauchen auf der Startseite auf, wo ein Terminal ohne Projekt hingehört.

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
