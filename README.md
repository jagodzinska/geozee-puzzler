# Geozee Puzzler

Tampermonkey-Userscript: `geozee-puzzler.user.js` — für <https://geozee.earth/>

Ersetzt den Screenshot-und-GIMP-Umweg: eine Seitenleiste, in der die 9 Flaggen
frei in die 9 Kategorien geschoben und beliebig oft umsortiert werden können.
Das Ergebnis wird danach **von Hand** im echten Spiel eingetragen — das Skript
klickt nichts an.

## Installation

Bei installiertem Tampermonkey diese URL im Browser öffnen — der Installations-
Dialog geht dann von selbst auf:

<https://raw.githubusercontent.com/jagodzinska/geozee-puzzler/main/geozee-puzzler.user.js>

`@updateURL`/`@downloadURL` zeigen auf dieselbe Datei, Tampermonkey holt sich
Updates also automatisch von `main`. Dafür muss die `@version` im Header bei
jeder Änderung hochgezählt werden.

## Bedienung

- **Zuordnen**: Flagge aus der Ablage in eine Kategorie ziehen — oder Flagge
  anklicken (Rahmen wird grün) und dann die Zielkategorie anklicken.
- **Umsortieren**: Flagge von einer Kategorie in eine andere ziehen. Ist das Ziel
  schon belegt, tauschen die beiden Länder ihre Plätze.
- **Lösen**: Flagge zurück in die Ablage ziehen (oder anklicken und dann in die
  Ablage klicken). `Esc` hebt die Auswahl auf.
- **Zum Eintragen**: Die Liste unten zeigt die Zuordnung in der festen
  Spielreihenfolge (1–9); die Zahl oben rechts auf einer Kategorie ist die
  Position des dort liegenden Landes in dieser Reihenfolge. Der Fortschritt
  (`x / 9 zugeordnet`) steht in der Kopfzeile.
- **Panel**: linke Kante ziehen ändert die Breite (Standard 960 px, dem Spiel
  bleiben immer mindestens 460 px), `✕` schließt es, der „PUZZLER“-Reiter am
  rechten Bildschirmrand öffnet es wieder.

- **Dialoge des Spiels**: Klickt man im Spiel eine Flagge an, zeigt Geozee sie
  vergrößert in einem Dialog — der zentriert sich normalerweise im ganzen
  Fenster und liegt damit zur Hälfte hinter der Leiste. Das Skript zieht solche
  `position: fixed`-Overlays auf den freien Bereich links der Leiste, sodass sie
  dort mittig stehen. Das gilt für alle Overlays der Seite (Modals, Toasts,
  Konfetti, Cookie-Banner) und geht beim Breiterziehen live mit; ist die Leiste
  geschlossen, sitzt wieder alles wie im Original.

- **Platz für das Spiel**: Geozee stellt links und rechts neben das Board je
  eine Anzeigenspalte (`flex-1 max-w-[350px]`). Die wachsen genauso stark wie
  das Spiel selbst, das Board bekommt also nur ein Drittel der Breite – auch
  wenn dort gar keine Anzeige steht (Adblocker). Neben der offenen Leiste bleibt
  davon so wenig übrig, dass die Kartentexte aus ihren Karten laufen. Solange
  die Leiste offen ist, hören die beiden Spalten deshalb auf zu wachsen und sind
  nur noch so breit wie ihr Inhalt: leer also gar nicht, mit geladener Anzeige
  weiterhin genau so breit wie diese. Bei geschlossener Leiste steht die Seite
  wieder im Original. Als Sicherheitsnetz brechen im Spielbereich zu lange
  Wörter um (`overflow-wrap: anywhere`), statt sich zu überlagern.

Der Stand wird pro Tag in `localStorage` gespeichert (`geozee-puzzler:v1:<datum>`)
und übersteht ein Neuladen. `Reset` leert ihn.

## Keine Spoiler

Gelesen wird ausschließlich, was auf der Seite ohnehin sichtbar ist:

- die Flaggen und englischen Ländernamen aus der Warteschlange oben
  (`button[title]` mit Flaggen-`<img>`),
- die Kategorienamen und die dazugehörige Punkteregel aus den `.mat-slot`-Karten.

Punktzahlen, die Score-Matrix oder die optimale Lösung werden **nicht**
ausgelesen. Der eigene Puzzle-Stand ist komplett unabhängig vom echten Spiel:
Züge im Spiel verändern die Leiste nicht und umgekehrt.

## Optik

Statt eigener Werte nutzt die Leiste die CSS-Variablen der Seite — sowohl die
Farben und Schriften (`--surface`, `--border`, `--primary`, `--muted`,
`--radius`, `--font-display`, `--font-sans`) als auch die Tailwind-v4-Tokens für
die Maße (`--spacing`, `--text-xs` … `--text-2xl`, `--leading-tight`,
`--tracking-widest`) und die Kartenklasse `.mat-slot` selbst.

Flaggen, Kartengrößen und Schriftgrade entsprechen damit 1:1 der
Desktop-Darstellung des Originals: Ablage-Flaggen `h-10` wie die Warteschlange
oben, Kategorienamen `text-lg`, Regeltext 11 px, abgelegte Flaggen `h-8 w-12`
mit `text-base`-Ländername, Rasterabstand `gap-5`. Ein späteres Theme oder
geänderte Tokens ziehen automatisch mit.

Wird die Leiste schmal gezogen, schalten Container-Queries stufenweise auf
kleinere Maße um (unter 700 px eine Stufe kleiner, unter 460 px zweispaltiges
Raster ohne Regeltext); ab 780 px steht die Übertragungsliste zweispaltig.

## Getestet

Gegen die Live-Seite (Headless Chrome via CDP): Auslesen von Ländern und
Kategorien, Klick- und Drag&Drop-Zuordnung, Tausch belegter Felder, Zurücklegen,
Reset, Schließen/Öffnen, Persistenz über einen Reload hinweg sowie Weiterlaufen
nach einem echten Spielzug (React baut das Board dabei neu auf).

Für die Anzeigenspalten nachgemessen (Fenster 1618 px, Leiste 960 px, Anzeigen
geblockt): vorher 214 px für das Board (Karten 47 px breit, 36 überlaufende
Textelemente), nachher 528 px (Karten 152 px, kein Überlauf). Bei maximaler
Leistenbreite und in einem 1024-px-Fenster bleibt das Board ebenfalls
überlaufsfrei; mit geschlossener Leiste stehen die Spalten wieder bei 350 px
wie im Original.

Für die Overlay-Zentrierung nachgemessen: die vergrößerte Flagge und ihr
Hintergrund sitzen bei 960 px und bei 500 px Leistenbreite exakt mittig im
Restbereich, bei geschlossener Leiste wieder mittig im Fenster — waagerecht wie
senkrecht (die Seite ist Tailwind v4 und zentriert per `translate`; das Skript
verschiebt deshalb über `right`/`margin`, nicht über `transform`).
