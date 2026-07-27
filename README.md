# Geozee Puzzler

Tampermonkey-Userscript: `geozee-puzzler.user.js` — für <https://geozee.earth/>

Ersetzt den Screenshot-und-GIMP-Umweg: eine Seitenleiste, in der die 9 Flaggen
frei in die 9 Kategorien geschoben und beliebig oft umsortiert werden können.
Das Ergebnis wird danach **von Hand** im echten Spiel eingetragen — das Skript
klickt nichts an.

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
- **Panel**: linke Kante ziehen ändert die Breite, `✕` schließt es, der
  „PUZZLER“-Reiter am rechten Bildschirmrand öffnet es wieder.

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

Statt eigener Farben nutzt die Leiste die CSS-Variablen der Seite
(`--surface`, `--border`, `--primary`, `--muted`, `--radius`, `--font-display`,
`--font-sans`) sowie deren eigene Kartenklasse `.mat-slot`. Dadurch sieht sie
identisch zum Original aus und zieht ein späteres Theme automatisch mit.

## Getestet

Gegen die Live-Seite (Headless Chrome via CDP): Auslesen von Ländern und
Kategorien, Klick- und Drag&Drop-Zuordnung, Tausch belegter Felder, Zurücklegen,
Reset, Schließen/Öffnen, Persistenz über einen Reload hinweg sowie Weiterlaufen
nach einem echten Spielzug (React baut das Board dabei neu auf).
