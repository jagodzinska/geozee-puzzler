// ==UserScript==
// @name         Geozee Puzzler
// @namespace    jago/geozee-puzzler
// @version      1.4.0
// @description  Seitenleiste zum Vorsortieren der Geozee-Flaggen: Alle 9 Länder per Drag&Drop (oder Klick) in die 9 Kategorien schieben, beliebig umsortieren, dann die fertige Zuordnung händisch im Spiel eintragen. Nutzt ausschließlich Infos, die ohnehin auf der Seite stehen (Flagge, Ländername, Kategoriename + Regel) – spoilert also nichts.
// @author       jago/claude
// @license      MIT
// @homepageURL  https://github.com/jagodzinska/geozee-puzzler
// @supportURL   https://github.com/jagodzinska/geozee-puzzler/issues
// @downloadURL  https://raw.githubusercontent.com/jagodzinska/geozee-puzzler/main/geozee-puzzler.user.js
// @updateURL    https://raw.githubusercontent.com/jagodzinska/geozee-puzzler/main/geozee-puzzler.user.js
// @match        https://geozee.earth/*
// @icon         https://geozee.earth/favicon.ico
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return; // nicht in Ad-iframes laufen

  // ---------------------------------------------------------------------------
  // Hintergrund
  //
  // Geozee zeigt oben eine Warteschlange aus 9 Ländern (Buttons mit title +
  // Flaggen-<img>) in FESTER Reihenfolge und darunter ein 3x3-Raster aus
  // Kategorie-Karten (".mat-slot"). Jedes Land muss in genau eine Kategorie,
  // jede Kategorie nimmt genau ein Land auf – also eine Bijektion. Weil die
  // Reihenfolge fest ist, kann man im Spiel selbst nichts mehr umsortieren.
  //
  // Dieses Skript baut eine eigenständige Seitenleiste, in der genau diese
  // Zuordnung frei hin- und hergeschoben werden kann. Es klickt NICHTS im Spiel
  // an und liest keine Punkte-/Lösungsdaten aus – nur das, was sowieso sichtbar
  // ist: Flagge, Ländername, Kategoriename und Kategorie-Regel.
  //
  // Optik: statt eigener Farben werden die CSS-Variablen der Seite benutzt
  // (--surface, --border, --primary, --font-display, --radius ...) sowie deren
  // eigene Klasse ".mat-slot". Dadurch sieht die Leiste identisch zum Original
  // aus und zieht ein evtl. späteres Theme automatisch mit.
  // ---------------------------------------------------------------------------

  const NS = 'gzp';
  const STORE_PREFIX = 'geozee-puzzler:v1:';
  const UI_KEY = 'geozee-puzzler:ui:v2'; // v2: neue, breitere Standardbreite
  const FLAG_RE = /\/flags\/([a-z0-9_-]+)\.svg/i;

  // ===========================================================================
  // Hilfsfunktionen
  // ===========================================================================

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function todayLocal() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** Datum der aktuellen Runde – im Archiv steht es im Pfad, sonst ist es heute. */
  function roundDate() {
    const m = location.pathname.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : todayLocal();
  }

  /** Beschriftung wie "#019 Monday, July 27th", falls die Seite sie anzeigt. */
  function roundLabel() {
    for (const el of document.querySelectorAll('main div')) {
      if (el.children.length === 0 && /^#\d+\s/.test(el.textContent.trim())) return el.textContent.trim();
    }
    return null;
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* privater Modus o.ä. – dann eben ohne Persistenz */
    }
  }

  // ===========================================================================
  // Daten von der Seite lesen
  // ===========================================================================

  /**
   * Die Länder-Warteschlange. Alle 9 Buttons liegen im selben Container, auch
   * schon platzierte (die werden nur ausgegraut). Deshalb: alle Buttons mit
   * title + Flaggenbild sammeln und die größte Geschwistergruppe nehmen – so
   * fangen wir uns keine Flaggen aus dem Endergebnis-Screen ein.
   */
  function scrapeCountries() {
    const groups = new Map();
    for (const btn of document.querySelectorAll('button[title]')) {
      if (btn.closest(`#${NS}-root`)) continue;
      const img = btn.querySelector('img[src*="/flags/"]');
      if (!img) continue;
      const code = (img.getAttribute('src').match(FLAG_RE) || [])[1];
      if (!code) continue;
      const parent = btn.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push({ code, name: btn.getAttribute('title') || code, src: img.getAttribute('src') });
    }
    let best = [];
    for (const list of groups.values()) if (list.length > best.length) best = list;

    const seen = new Set();
    return best.filter((c) => !seen.has(c.code) && seen.add(c.code));
  }

  /**
   * Die 9 Kategorien. ".mat-slot" ist die Klasse der Seite; sie taucht sowohl in
   * der Vorschau (Rückseite der "How To Play"-Karte) als auch im echten Board
   * auf – beide in derselben Reihenfolge, daher wird über den Namen entdoppelt.
   */
  function scrapeCategories() {
    const out = [];
    const seen = new Set();
    for (const slot of document.querySelectorAll('.mat-slot')) {
      if (slot.closest(`#${NS}-root`)) continue;
      const nameEl = slot.querySelector('div.font-display');
      const name = nameEl && nameEl.textContent.trim();
      if (!name || seen.has(name)) continue;
      // Direkt unter dem Namen steht die Regel, einmal kurz (mobil) und einmal
      // lang (Desktop). Die lange Variante ist die zweite.
      const ruleBox = nameEl.nextElementSibling;
      let rule = '';
      if (ruleBox) {
        const spans = ruleBox.querySelectorAll('span');
        rule = ((spans[1] || spans[0] || ruleBox).textContent || '').trim();
      }
      seen.add(name);
      out.push({ id: name, name, rule });
    }
    return out.slice(0, 9);
  }

  // ===========================================================================
  // Zustand
  // ===========================================================================

  let countries = [];
  let categories = [];
  let placements = {}; // { [categoryId]: countryCode }
  let selected = null; // aktuell "in der Hand" gehaltener Ländercode
  let currentDate = roundDate();

  // Breite: großzügig, aber dem Spiel bleiben mindestens MIN_PAGE Pixel.
  const DEFAULT_WIDTH = 960;
  const MIN_WIDTH = 340;
  const MIN_PAGE = 460;
  const clampWidth = (w) => Math.max(MIN_WIDTH, Math.min(w, Math.max(MIN_WIDTH, window.innerWidth - MIN_PAGE)));

  const ui = Object.assign({ open: true, width: DEFAULT_WIDTH }, readJSON(UI_KEY, {}));

  const storeKey = () => STORE_PREFIX + currentDate;

  function loadPlacements() {
    const data = readJSON(storeKey(), null);
    placements = data && typeof data.placements === 'object' ? data.placements : {};
  }

  function savePlacements() {
    writeJSON(storeKey(), { date: currentDate, placements });
  }

  function saveUI() {
    writeJSON(UI_KEY, ui);
  }

  const countryByCode = (code) => countries.find((c) => c.code === code) || null;
  const categoryOfCountry = (code) => Object.keys(placements).find((cat) => placements[cat] === code) || null;

  /** Einträge wegwerfen, die nicht mehr zur heutigen Runde passen. */
  function prunePlacements() {
    if (!countries.length || !categories.length) return;
    const catIds = new Set(categories.map((c) => c.id));
    const codes = new Set(countries.map((c) => c.code));
    let changed = false;
    for (const cat of Object.keys(placements)) {
      if (!catIds.has(cat) || !codes.has(placements[cat])) {
        delete placements[cat];
        changed = true;
      }
    }
    if (changed) savePlacements();
  }

  /**
   * Land in eine Kategorie legen. Sitzt dort schon jemand, wird getauscht
   * (bzw. der Vorgänger zurück in die Ablage geschickt).
   */
  function place(code, catId) {
    const from = categoryOfCountry(code);
    const occupant = placements[catId] || null;
    if (from === catId) return;

    if (from) delete placements[from];
    placements[catId] = code;
    if (occupant && occupant !== code) {
      if (from) placements[from] = occupant; // echter Tausch
    }
    savePlacements();
  }

  function unplace(code) {
    const from = categoryOfCountry(code);
    if (from) {
      delete placements[from];
      savePlacements();
    }
  }

  // ===========================================================================
  // Aufbau der Seitenleiste
  // ===========================================================================

  // Maße und Schriftgrößen kommen aus denselben Tailwind-v4-Tokens, die die
  // Seite selbst benutzt (--spacing, --text-*, --leading-tight, --radius ...).
  // Basis ist damit 1:1 die Desktop-Darstellung des Originals; erst wenn die
  // Leiste schmal gezogen wird, greifen weiter unten die Container-Queries.
  const CSS = `
#${NS}-root { --sp: var(--spacing, .25rem); }
#${NS}-root, #${NS}-root * { box-sizing: border-box; }

#${NS}-panel {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: var(--${NS}-w, ${DEFAULT_WIDTH}px);
  display: flex; flex-direction: column;
  container-type: inline-size; container-name: ${NS};
  background: var(--surface, #fff);
  border-left: 1px solid var(--border, #e8e4dd);
  box-shadow: -8px 0 24px rgb(0 0 0 / .08);
  font-family: var(--font-sans, "Manrope", sans-serif);
  font-size: var(--text-base, 1rem);
  color: var(--foreground, #2d2d2d);
  z-index: 2147482000;
}
#${NS}-root.${NS}-closed #${NS}-panel { display: none; }

#${NS}-grip {
  position: absolute; left: -3px; top: 0; bottom: 0; width: 7px;
  cursor: col-resize; touch-action: none;
}
#${NS}-grip:hover { background: var(--primary, #7d9b76); opacity: .35; }

/* --- Kopfzeile: Maße wie die Kopfzeile der Seite (h-14, px-4) ------------- */
#${NS}-head {
  display: flex; align-items: center; gap: calc(var(--sp) * 3);
  min-height: calc(var(--sp) * 14);
  padding: calc(var(--sp) * 2) calc(var(--sp) * 4);
  border-bottom: 1px solid var(--border, #e8e4dd);
  background: var(--surface-muted, #f0ebe3);
}
#${NS}-head .${NS}-title {
  font-family: var(--font-display, "Sora", sans-serif);
  font-weight: 800; font-size: var(--text-2xl, 1.5rem); line-height: 1;
}
#${NS}-head .${NS}-round {
  flex: 1; min-width: 0;
  font-size: var(--text-xs, .75rem);
  letter-spacing: var(--tracking-widest, .1em);
  text-transform: uppercase; color: var(--muted, #6b7280);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Pill-Button wie "Category Atlas" auf der Seite */
.${NS}-btn {
  border: 1px solid var(--border, #e8e4dd);
  background: var(--surface, #fff);
  color: var(--foreground, #2d2d2d);
  border-radius: 9999px;
  padding: calc(var(--sp) * 1.5) calc(var(--sp) * 3);
  font: inherit; font-size: var(--text-sm, .875rem); font-weight: 600;
  box-shadow: 0 1px 2px rgb(0 0 0 / .05);
  cursor: pointer; white-space: nowrap;
  transition: border-color .15s, background-color .15s, color .15s;
}
.${NS}-btn:hover { border-color: var(--primary, #7d9b76); background: var(--surface-muted, #f0ebe3); }

#${NS}-body {
  flex: 1; overflow-y: auto;
  padding: calc(var(--sp) * 4);
  display: flex; flex-direction: column; gap: calc(var(--sp) * 5);
}

/* Abschnittsüberschrift im Stil der Seitenlabels ("SCORE", "Now placing") */
.${NS}-h3 {
  display: flex; align-items: baseline; gap: calc(var(--sp) * 2);
  margin-bottom: calc(var(--sp) * 2);
  font-size: var(--text-xs, .75rem);
  letter-spacing: var(--tracking-widest, .1em);
  text-transform: uppercase; color: var(--muted, #6b7280);
}
.${NS}-h3 b {
  color: var(--foreground, #2d2d2d); font-weight: 700;
  font-size: var(--text-sm, .875rem); letter-spacing: normal; text-transform: none;
}

/* --- Ablage: Flaggen so groß wie in der Warteschlange oben (md:h-10) ------ */
#${NS}-tray {
  display: flex; flex-wrap: wrap; gap: calc(var(--sp) * 2);
  padding: calc(var(--sp) * 3);
  border: 1px dashed var(--border, #e8e4dd);
  border-radius: var(--radius, .75rem);
  background: var(--surface-muted, #f0ebe3);
  min-height: calc(var(--sp) * 18);
}
#${NS}-tray.${NS}-dropok { border-color: var(--primary, #7d9b76); border-style: solid; }

.${NS}-chip {
  display: inline-flex; align-items: center; gap: calc(var(--sp) * 2);
  padding: calc(var(--sp) * 1.5) calc(var(--sp) * 3) calc(var(--sp) * 1.5) calc(var(--sp) * 1.5);
  border-radius: 9999px;
  background: var(--surface, #fff);
  box-shadow: 0 0 0 1px var(--border, #e8e4dd);
  cursor: grab; user-select: none;
  font-size: var(--text-base, 1rem); line-height: var(--leading-tight, 1.25);
  transition: box-shadow .15s, opacity .15s;
}
.${NS}-chip:hover { box-shadow: 0 0 0 1px var(--border, #e8e4dd), 0 6px 16px rgb(0 0 0 / .1); }
.${NS}-chip:active { cursor: grabbing; }
.${NS}-chip img {
  height: calc(var(--sp) * 10); width: auto;
  border-radius: .25rem; background: var(--surface-muted, #f0ebe3);
}
.${NS}-chip .${NS}-num {
  display: inline-flex; align-items: center; justify-content: center;
  height: calc(var(--sp) * 6); min-width: calc(var(--sp) * 6); padding: 0 calc(var(--sp) * 1);
  border-radius: 9999px;
  background: var(--surface-muted, #f0ebe3); color: var(--muted, #6b7280);
  font-size: var(--text-xs, .75rem); font-weight: 800;
}
.${NS}-chip.${NS}-placed { opacity: .4; }
.${NS}-chip.${NS}-sel { box-shadow: 0 0 0 2px var(--primary, #7d9b76); opacity: 1; }
.${NS}-chip.${NS}-dragging { opacity: .3; }

/* --- Kategorie-Raster: .mat-slot liefert Radius, min-height 140px und
       padding 1rem von der Seite selbst, hier nur Layout und Zustände ------ */
#${NS}-grid {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: calc(var(--sp) * 5);
}
#${NS}-grid .mat-slot { display: flex; flex-direction: column; background: var(--surface, #fff); }
#${NS}-grid .mat-slot:not(.${NS}-filled) { outline: 2px solid var(--primary, #7d9b76); outline-offset: 2px; }
#${NS}-grid .mat-slot.${NS}-filled { box-shadow: inset 0 0 0 1px var(--border, #e8e4dd); }
#${NS}-grid .mat-slot:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgb(0 0 0 / .08); }
#${NS}-grid .mat-slot.${NS}-dropok,
#${NS}-grid .mat-slot.${NS}-armed { outline: 3px solid var(--primary, #7d9b76); outline-offset: 2px; }

.${NS}-cat-name {
  font-family: var(--font-display, "Sora", sans-serif);
  font-weight: 700; font-size: var(--text-lg, 1.125rem); line-height: var(--leading-tight, 1.25);
}
.${NS}-cat-rule {
  margin-top: calc(var(--sp) * 1.5); padding-top: calc(var(--sp) * 2);
  border-top: 1px solid color-mix(in oklab, var(--foreground, #2d2d2d) 20%, transparent);
  font-size: 11px; line-height: var(--leading-tight, 1.25);
  color: color-mix(in oklab, var(--foreground, #2d2d2d) 75%, transparent);
}
.${NS}-cat-foot { margin-top: auto; padding-top: calc(var(--sp) * 3); }
.${NS}-cat-empty {
  text-align: center; font-size: var(--text-xs, .75rem);
  letter-spacing: .2em; text-transform: uppercase;
  color: color-mix(in oklab, var(--foreground, #2d2d2d) 40%, transparent);
}
.${NS}-cat-fill { display: flex; align-items: center; gap: calc(var(--sp) * 3); cursor: grab; }
.${NS}-cat-fill img {
  height: calc(var(--sp) * 8); width: calc(var(--sp) * 12); flex: none;
  object-fit: cover; border-radius: .25rem;
  border: 1px solid color-mix(in oklab, var(--foreground, #2d2d2d) 10%, transparent);
}
.${NS}-cat-fill span {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-display, "Sora", sans-serif); font-size: var(--text-base, 1rem);
}
.${NS}-slot-num {
  position: absolute; right: calc(var(--sp) * 3); top: calc(var(--sp) * 3);
  display: inline-flex; align-items: center; justify-content: center;
  min-width: calc(var(--sp) * 7); padding: calc(var(--sp) * 1) calc(var(--sp) * 2);
  border-radius: 9999px;
  background: var(--primary, #7d9b76); color: var(--primary-foreground, #fff);
  font-size: var(--text-sm, .875rem); font-weight: 700; line-height: 1;
}

/* --- Übertragungsliste ---------------------------------------------------- */
#${NS}-plan { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--sp) * 1); }
#${NS}-plan li {
  display: flex; align-items: center; gap: calc(var(--sp) * 2);
  padding: calc(var(--sp) * 1.5) calc(var(--sp) * 3);
  border-radius: calc(var(--radius, .75rem) * .6);
  background: var(--surface-muted, #f0ebe3);
  font-size: var(--text-base, 1rem);
}
#${NS}-plan li.${NS}-todo { background: transparent; color: var(--muted, #6b7280); }
#${NS}-plan img { height: calc(var(--sp) * 5); width: calc(var(--sp) * 8); flex: none; object-fit: cover; border-radius: .25rem; }
#${NS}-plan .${NS}-idx { min-width: calc(var(--sp) * 6); font-weight: 800; color: var(--muted, #6b7280); }
#${NS}-plan .${NS}-arrow { color: var(--muted, #6b7280); }
#${NS}-plan .${NS}-target { font-family: var(--font-display, "Sora", sans-serif); font-weight: 700; }

#${NS}-head .${NS}-count {
  font-size: var(--text-sm, .875rem); font-weight: 600;
  color: var(--muted, #6b7280); white-space: nowrap;
}

#${NS}-tab {
  position: fixed; right: 0; top: 50%; transform: translateY(-50%);
  z-index: 2147482000;
  padding: calc(var(--spacing, .25rem) * 3) calc(var(--spacing, .25rem) * 2);
  border: 1px solid var(--border, #e8e4dd); border-right: none;
  border-radius: var(--radius, .75rem) 0 0 var(--radius, .75rem);
  background: var(--surface, #fff); color: var(--foreground, #2d2d2d);
  font-family: var(--font-display, "Sora", sans-serif);
  font-size: var(--text-sm, .875rem); font-weight: 700;
  letter-spacing: var(--tracking-widest, .1em);
  writing-mode: vertical-rl; cursor: pointer;
  box-shadow: -4px 0 12px rgb(0 0 0 / .08);
}
#${NS}-root:not(.${NS}-closed) #${NS}-tab { display: none; }

.${NS}-empty-hint { padding: 2rem 1rem; text-align: center; font-size: var(--text-sm, .875rem); color: var(--muted, #6b7280); }

/* --- Overlays der Seite (Flaggen-Dialog, Modals, Toasts) --------------------
   Die liegen als "position: fixed" im Viewport und wissen nichts von der
   Leiste – ihre Mitte landet deshalb halb dahinter. Die Klassen vergibt
   scanOverlays(), --${NS}-shift ist die aktuelle Leistenbreite (0px, solange
   die Leiste zu ist). Verschoben wird über Rand/Kante statt über transform
   oder translate: die Seite ist Tailwind v4 und zentriert ihre Dialoge selbst
   per "translate" – das dürfen wir nicht überschreiben.                      */
.${NS}-shift-inset {
  right: var(--${NS}-shift, 0px) !important;
  max-width: calc(100% - var(--${NS}-shift, 0px)) !important; /* falls die Breite fest steht */
}
.${NS}-shift-offset { margin-left: calc(var(--${NS}-shift, 0px) / -2) !important; }
.${NS}-shift-auto { margin-right: var(--${NS}-shift, 0px) !important; }

/* --- Sehr breite Leiste: Übertragungsliste zweispaltig, spaltenweise
       gefüllt (1–5 links, 6–9 rechts), damit nichts scrollen muss --------- */
@container ${NS} (min-width: 780px) {
  #${NS}-plan {
    display: grid; grid-auto-flow: column;
    grid-template-rows: repeat(5, auto); grid-auto-columns: 1fr;
    column-gap: calc(var(--sp) * 3);
  }
}

/* --- Schmal gezogene Leiste: alles eine Stufe kleiner --------------------- */
@container ${NS} (max-width: 700px) {
  #${NS}-body { padding: calc(var(--sp) * 3); gap: calc(var(--sp) * 4); }
  .${NS}-chip { font-size: var(--text-sm, .875rem); }
  .${NS}-chip img { height: calc(var(--sp) * 7); }
  #${NS}-grid { gap: calc(var(--sp) * 3); }
  #${NS}-grid .mat-slot { min-height: calc(var(--sp) * 30); padding: calc(var(--sp) * 2.5); }
  .${NS}-cat-name { font-size: var(--text-base, 1rem); }
  .${NS}-cat-rule { font-size: 10px; }
  .${NS}-cat-fill img { height: calc(var(--sp) * 6); width: calc(var(--sp) * 9); }
  .${NS}-cat-fill span { font-size: var(--text-sm, .875rem); }
  .${NS}-slot-num { font-size: var(--text-xs, .75rem); }
  #${NS}-plan li { font-size: var(--text-sm, .875rem); }
}

@container ${NS} (max-width: 460px) {
  #${NS}-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .${NS}-chip img { height: calc(var(--sp) * 5); }
  .${NS}-cat-rule { display: none; }
}
`;

  const root = document.createElement('div');
  root.id = `${NS}-root`;
  root.innerHTML = `
<style>${CSS}</style>
<button id="${NS}-tab" type="button" title="Geozee Puzzler öffnen">PUZZLER</button>
<aside id="${NS}-panel" aria-label="Geozee Puzzler">
  <div id="${NS}-grip" title="Breite ziehen"></div>
  <div id="${NS}-head">
    <span class="${NS}-title">Puzzler</span>
    <span class="${NS}-round" id="${NS}-round"></span>
    <span class="${NS}-count" id="${NS}-count"></span>
    <button class="${NS}-btn" type="button" data-act="reset" title="Alle Zuordnungen löschen">Reset</button>
    <button class="${NS}-btn" type="button" data-act="close" title="Seitenleiste schließen">✕</button>
  </div>
  <div id="${NS}-body">
    <section>
      <div class="${NS}-h3"><b>Länder</b> feste Reihenfolge – ziehen oder anklicken</div>
      <div id="${NS}-tray"></div>
    </section>
    <section>
      <div class="${NS}-h3"><b>Kategorien</b> Ziel ablegen / tauschen</div>
      <div id="${NS}-grid"></div>
    </section>
    <section>
      <div class="${NS}-h3"><b>Zum Eintragen</b> in dieser Reihenfolge</div>
      <ol id="${NS}-plan"></ol>
    </section>
  </div>
</aside>`;
  document.body.appendChild(root);

  const $ = (id) => root.querySelector(`#${NS}-${id}`);
  const elPanel = $('panel');
  const elTray = $('tray');
  const elGrid = $('grid');
  const elPlan = $('plan');
  const elRound = $('round');
  const elCount = $('count');
  const elBody = $('body');

  // ===========================================================================
  // Rendern
  // ===========================================================================

  function applyUI() {
    const w = clampWidth(ui.width);
    root.classList.toggle(`${NS}-closed`, !ui.open);
    root.style.setProperty(`--${NS}-w`, w + 'px');
    // Seiteninhalt neben der Leiste halten statt darunter zu verschwinden
    document.body.style.paddingRight = ui.open ? w + 'px' : '';
    // Fixe Overlays der Seite folgen der Breite über diese Variable
    document.documentElement.style.setProperty(`--${NS}-shift`, ui.open ? w + 'px' : '0px');
  }

  function renderTray() {
    elTray.innerHTML = '';
    countries.forEach((c, i) => {
      const placedIn = categoryOfCountry(c.code);
      const chip = document.createElement('div');
      chip.className =
        `${NS}-chip` + (placedIn ? ` ${NS}-placed` : '') + (selected === c.code ? ` ${NS}-sel` : '');
      chip.draggable = true;
      chip.dataset.code = c.code;
      chip.title = placedIn ? `${c.name} → ${placedIn}` : c.name;
      chip.innerHTML =
        `<span class="${NS}-num">${i + 1}</span>` +
        `<img src="${esc(c.src)}" alt="">` +
        `<span>${esc(c.name)}</span>`;
      elTray.appendChild(chip);
    });
  }

  function renderGrid() {
    elGrid.innerHTML = '';
    categories.forEach((cat) => {
      const code = placements[cat.id] || null;
      const country = code ? countryByCode(code) : null;
      const queueIdx = country ? countries.findIndex((c) => c.code === code) + 1 : 0;

      const slot = document.createElement('div');
      slot.className =
        'mat-slot' + (country ? ` ${NS}-filled` : '') + (selected && !country ? ` ${NS}-armed` : '');
      slot.dataset.cat = cat.id;
      slot.setAttribute('role', 'button');
      slot.tabIndex = 0;
      slot.title = cat.rule || cat.name;

      slot.innerHTML =
        (country ? `<span class="${NS}-slot-num">${queueIdx}</span>` : '') +
        `<div class="${NS}-cat-name">${esc(cat.name)}</div>` +
        (cat.rule ? `<div class="${NS}-cat-rule">${esc(cat.rule)}</div>` : '') +
        `<div class="${NS}-cat-foot">` +
        (country
          ? `<div class="${NS}-cat-fill" draggable="true" data-code="${esc(country.code)}">` +
            `<img src="${esc(country.src)}" alt=""><span>${esc(country.name)}</span></div>`
          : `<div class="${NS}-cat-empty">ablegen</div>`) +
        `</div>`;
      elGrid.appendChild(slot);
    });
  }

  function renderPlan() {
    elPlan.innerHTML = '';
    countries.forEach((c, i) => {
      const cat = categoryOfCountry(c.code);
      const li = document.createElement('li');
      if (!cat) li.className = `${NS}-todo`;
      li.innerHTML =
        `<span class="${NS}-idx">${i + 1}.</span>` +
        `<img src="${esc(c.src)}" alt="">` +
        `<span>${esc(c.name)}</span>` +
        `<span class="${NS}-arrow">→</span>` +
        `<span class="${NS}-target">${cat ? esc(cat) : '…'}</span>`;
      elPlan.appendChild(li);
    });

    const done = countries.filter((c) => categoryOfCountry(c.code)).length;
    elCount.textContent = countries.length ? `${done} / ${countries.length} zugeordnet` : '';
  }

  /**
   * Drag-Markierungen aufräumen. Nach einem Drop wird das Quell-Element beim
   * Neuzeichnen aus dem DOM geworfen, sein "dragend" feuert also ins Leere –
   * deshalb hier zentral abräumen statt nur im dragend-Handler.
   */
  function clearDragMarks() {
    root.querySelectorAll(`.${NS}-dropok, .${NS}-dragging`).forEach((el) => {
      el.classList.remove(`${NS}-dropok`, `${NS}-dragging`);
    });
  }

  function render() {
    clearDragMarks();
    applyUI();
    elRound.textContent = roundLabel() || currentDate;

    if (!countries.length || !categories.length) {
      elTray.innerHTML = `<div class="${NS}-empty-hint">Warte auf das Spielfeld …<br>Seite ggf. neu laden.</div>`;
      elGrid.innerHTML = '';
      elPlan.innerHTML = '';
      elCount.textContent = '';
      return;
    }
    renderTray();
    renderGrid();
    renderPlan();
  }

  // ===========================================================================
  // Interaktion: Klicken (auswählen → ablegen) und Drag & Drop
  // ===========================================================================

  function setSelected(code) {
    selected = selected === code ? null : code;
    render();
  }

  elBody.addEventListener('click', (ev) => {
    const chip = ev.target.closest(`.${NS}-chip`);
    if (chip) {
      setSelected(chip.dataset.code);
      return;
    }
    const slot = ev.target.closest('.mat-slot');
    if (!slot) return;

    const catId = slot.dataset.cat;
    if (selected) {
      place(selected, catId);
      selected = null;
      render();
    } else if (placements[catId]) {
      // Belegtes Feld anklicken = Land wieder in die Hand nehmen
      setSelected(placements[catId]);
    }
  });

  // Klick in die Ablage (nicht auf einen Chip) legt das gewählte Land zurück
  elTray.addEventListener('click', (ev) => {
    if (ev.target.closest(`.${NS}-chip`)) return;
    if (!selected) return;
    unplace(selected);
    selected = null;
    render();
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && selected) {
      selected = null;
      render();
    }
  });

  // -- HTML5 Drag & Drop ------------------------------------------------------
  elBody.addEventListener('dragstart', (ev) => {
    const src = ev.target.closest(`.${NS}-chip, .${NS}-cat-fill`);
    if (!src) return;
    ev.dataTransfer.setData('text/plain', src.dataset.code);
    ev.dataTransfer.effectAllowed = 'move';
    src.classList.add(`${NS}-dragging`);
  });

  elBody.addEventListener('dragend', clearDragMarks);

  function dropTarget(ev) {
    return ev.target.closest('.mat-slot') || (ev.target.closest(`#${NS}-tray`) ? elTray : null);
  }

  elBody.addEventListener('dragover', (ev) => {
    const target = dropTarget(ev);
    if (!target) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    if (!target.classList.contains(`${NS}-dropok`)) {
      root.querySelectorAll(`.${NS}-dropok`).forEach((el) => el.classList.remove(`${NS}-dropok`));
      target.classList.add(`${NS}-dropok`);
    }
  });

  elBody.addEventListener('dragleave', (ev) => {
    const target = dropTarget(ev);
    if (target && !target.contains(ev.relatedTarget)) target.classList.remove(`${NS}-dropok`);
  });

  elBody.addEventListener('drop', (ev) => {
    const target = dropTarget(ev);
    if (!target) return;
    ev.preventDefault();
    const code = ev.dataTransfer.getData('text/plain');
    if (!code || !countryByCode(code)) return;

    if (target === elTray) unplace(code);
    else place(code, target.dataset.cat);

    selected = null;
    render();
  });

  // ===========================================================================
  // Kopf-/Fußleisten-Buttons
  // ===========================================================================

  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'close') {
      ui.open = false;
      saveUI();
      applyUI();
    } else if (act === 'reset') {
      placements = {};
      selected = null;
      savePlacements();
      render();
    }
  });

  $('tab').addEventListener('click', () => {
    ui.open = true;
    saveUI();
    applyUI();
  });

  // -- Breite ziehen ----------------------------------------------------------
  $('grip').addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const grip = ev.currentTarget;
    grip.setPointerCapture(ev.pointerId);
    const onMove = (e) => {
      ui.width = clampWidth(window.innerWidth - e.clientX);
      applyUI();
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      saveUI();
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
  });

  // ===========================================================================
  // Overlays der Seite neben der Leiste zentrieren
  //
  // Klickt man im Spiel eine Flagge an, öffnet sich ein Dialog als
  // "fixed inset-0 … items-center justify-center" – also mittig im ganzen
  // Viewport, und damit zur Hälfte hinter der Leiste. Dasselbe gilt für die
  // übrigen Modals, den Toast und den Konfetti-Layer.
  //
  // Statt einzelne Klassennamen der Seite festzunageln, werden fixe Elemente
  // an ihrer Geometrie erkannt und bekommen eine Klasse, die sie über
  // --${NS}-shift einzieht bzw. verschiebt:
  //   - volle Viewport-Breite -> rechte Kante auf die Leiste ziehen
  //   - schmaler, aber mittig -> hängt die Box an left:50%, reicht ein
  //     margin-left von einer halben Leistenbreite; wird sie dagegen per
  //     "margin: auto" zwischen ihren Kanten zentriert, verschiebt ein
  //     margin-right von einer ganzen Leistenbreite genau diesen Raum
  // Die Klassen bleiben dauerhaft dran; ist die Leiste zu, ist --shift 0px.
  // ===========================================================================

  // Overlays landen fast immer direkt an <body> (React-Portale, Cookie-Banner);
  // der Rest der Seite ist Tailwind, dort steht "fixed" in der Klassenliste.
  const OVERLAY_SEL = '[class*="fixed"], [role="dialog"], [aria-modal="true"], dialog';
  const SHIFT_CLASSES = [`${NS}-shift-inset`, `${NS}-shift-offset`, `${NS}-shift-auto`];
  let overlayFrame = 0;

  function scanOverlays() {
    overlayFrame = 0;
    const vw = document.documentElement.clientWidth;
    const seen = new Set();

    for (const el of [...document.body.children, ...document.querySelectorAll(OVERLAY_SEL)]) {
      if (seen.has(el) || SHIFT_CLASSES.some((c) => el.classList.contains(c))) continue;
      seen.add(el);
      if (el.closest(`#${NS}-root`)) continue;

      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;

      if (r.left <= 1 && r.right >= vw - 1) {
        el.classList.add(`${NS}-shift-inset`);
      } else if (Math.abs((r.left + r.right) / 2 - vw / 2) <= 2) {
        // "margin: auto zwischen left und right" vs. "hängt an einer Kante"
        const auto = parseFloat(cs.marginLeft) > 0 && parseFloat(cs.marginRight) > 0;
        el.classList.add(auto ? `${NS}-shift-auto` : `${NS}-shift-offset`);
      }
    }
  }

  function queueOverlayScan() {
    if (!overlayFrame) overlayFrame = requestAnimationFrame(scanOverlays);
  }

  // Ein Klick im Spiel öffnet die Dialoge – da soll die Korrektur schon sitzen,
  // bevor das Overlay das erste Mal gezeichnet wird.
  document.addEventListener('click', queueOverlayScan, true);

  // ===========================================================================
  // Seite beobachten – React baut das Board bei jedem Zug neu auf
  // ===========================================================================

  let lastSignature = '';

  function sync() {
    const date = roundDate();
    if (date !== currentDate) {
      currentDate = date;
      selected = null;
      loadPlacements();
    }

    const nextCountries = scrapeCountries();
    const nextCategories = scrapeCategories();
    if (nextCountries.length < 2 || nextCategories.length < 2) return; // Board noch nicht da

    const signature = JSON.stringify([date, nextCountries.map((c) => c.code), nextCategories.map((c) => c.id)]);
    if (signature === lastSignature) return;

    lastSignature = signature;
    countries = nextCountries;
    categories = nextCategories;
    prunePlacements();
    render();
  }

  loadPlacements();
  applyUI();
  render();
  sync();
  scanOverlays();

  let pending = null;
  const observer = new MutationObserver((records) => {
    // Eigene DOM-Änderungen ignorieren, sonst dreht sich das im Kreis
    if (records.every((r) => r.target instanceof Element && r.target.closest(`#${NS}-root`))) return;
    queueOverlayScan();
    clearTimeout(pending);
    pending = setTimeout(sync, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // SPA-Navigation (Archiv <-> heute) mitbekommen
  window.addEventListener('popstate', () => setTimeout(sync, 300));

  // Bei kleinerem Fenster nachziehen, damit dem Spiel Platz bleibt
  window.addEventListener('resize', () => {
    applyUI();
    queueOverlayScan();
  });
})();
