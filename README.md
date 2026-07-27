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
  Position des dort liegenden Landes in dieser Reihenfolge. „Plan kopieren“ legt
  die Liste als Text in die Zwischenablage.
- **Panel**: linke Kante ziehen ändert die Breite (Standard 960 px, dem Spiel
  bleiben immer mindestens 460 px), `✕` schließt es, der „PUZZLER“-Reiter am
  rechten Bildschirmrand öffnet es wieder.

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
