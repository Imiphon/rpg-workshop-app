// Ambient / spells / claps / playback / NPC tiles
import { STATE } from "./state.js";
import { engine } from "./engine.js";
import { els, updateActiveAmbient } from "./dom.js"; //els=all relevant dom-elements
import { loadNpcManifest, prettifyLabel } from "./manifest.js";

export async function renderTilesForChapter(ch) {
  // Ambient buttons (chapter ambient + common set)
  const ambList = [
    ch.ambient,
    "amb-forest","amb-river","amb-glade","amb-field",
    "amb-gnom-city","amb-groschums","amb-squirrel","amb-mellots-wisper",
  ].filter((v, i, self) => v && self.indexOf(v) === i);

  els.ambientButtons.innerHTML = "";
  ambList.forEach((key) => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = key.replace(/^amb-/, "").replace(/-/g, " ");
    btn.dataset.key = key;
    btn.addEventListener("click", () => {
      const path = key.startsWith("/") ? key : STATE.ambientBase + key + ".mp3";
     path.playAmbient(path, key);
     STATE.lastAmbientKey = key;
      updateActiveAmbient(key);
    });
    els.ambientButtons.appendChild(btn);
  });
  updateActiveAmbient(ch.ambient);

  // Spells
  els.spellButtons.innerHTML = "";
  [
    { label: "Zauber gelungen", src: "./assets/audio/magic/success.mp3" },
    { label: "Zauber misslungen", src: "./assets/audio/magic/fail.mp3" },
  ].forEach((def) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = def.label;
    b.addEventListener("click", () => engine.playEffect(def.src));
    els.spellButtons.appendChild(b);
  });

  // Claps
  els.clapButtons.innerHTML = "";
  [
    { label: "Click 1", src: "./assets/audio/sp-effects/clave1.mp3" },
    { label: "Clap 2", src: "./assets/audio/sp-effects/clave2.mp3" },
    { label: "Clap 3", src: "./assets/audio/sp-effects/claps.mp3" },
  ].forEach((def) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = def.label;
    b.addEventListener("click", () => engine.playEffect(def.src));
    els.clapButtons.appendChild(b);
  });

  // Playback (interrupts ambient)
  els.playbackButtons.innerHTML = "";
  [
    { label: "Playback A", src: "./assets/audio/playbacks/melopoiia-trailer140404.mp3" },
    { label: "Playback B", src: "./assets/audio/playbacks/playback1.mp3" },
  ].forEach((def) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = def.label;
    b.addEventListener("click", () => engine.playPlayback(def.src));
    els.playbackButtons.appendChild(b);
  });

  // NPC tiles from manifest
  const manifest = await loadNpcManifest();
  const npcs = ch.npcs || [];
  const slots = [
    { titleEl: els.npc1Title, listEl: els.npc1Buttons },
    { titleEl: els.npc2Title, listEl: els.npc2Buttons },
    { titleEl: els.npc3Title, listEl: els.npc3Buttons },
  ];

  for (let i = 0; i < 3; i++) {
    const slot = slots[i];
    const npc = npcs[i];

    slot.titleEl.textContent = npc ? npc : `NPC ${i + 1}`;
    slot.listEl.innerHTML = "";
    if (!npc) continue;

    const files = manifest[npc] || [];
    if (!files.length) {
      const msg = document.createElement("div");
      msg.className = "muted";
      msg.textContent = "Keine Sounds gefunden.";
      slot.listEl.appendChild(msg);
      continue;
    }

    files.forEach((file) => {
      const src = `./assets/audio/characters/${npc}/${file}`;
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = ` ${prettifyLabel(file)}`;
      btn.addEventListener("click", () => engine.playEffect(src));
      slot.listEl.appendChild(btn);
    });
  }
}

export function collectChapterAssets(ch) {
  const assets = new Set();
  if (ch.ambient) {
    const ambPath = ch.ambient.startsWith("/")
      ? ch.ambient
      : STATE.ambientBase + ch.ambient + ".mp3";
    assets.add(ambPath);
  }
  const re = /\(\s*Link\s*=\s*([^)]+)\)/g;
  const text = ch.story?.text || "";
  let m;
  while ((m = re.exec(text))) assets.add((m[1] || "").trim());
  return Array.from(assets);
}