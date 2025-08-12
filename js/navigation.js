// Navigation between chapters
import { STATE } from "./state.js";
import { els } from "./dom.js";
import { renderStory, wireInlineSounds } from "./story.js";
import { renderTilesForChapter, collectChapterAssets } from "./tiles.js";
import { renderSolfegeButtons } from "./solfege.js";
import { engine } from "./engine.js";
import { updateActiveAmbient } from "./dom.js";

// Build a path from a logical ambient key (e.g. "amb-forest")
function ambientSrcFromKey(key) {
  if (!key) return null;
  return key.startsWith("/") ? key : `./assets/audio/ambient/${key}.mp3`;
}

// Called in goTo flow after resolved the chapter object.
export function applyAmbientForChapter(ch){
  const key = ch.ambient || null;
  if (!key) return; // nothing set -> keep whatever is playing

  // If the same logical ambient is already active, just update the highlight
  if (STATE.lastAmbientKey === key){
    updateActiveAmbient(key);
    return;
  }

  const path = key.startsWith("/") ? key : `${STATE.ambientBase}${key}.mp3`;
  engine.playAmbient(path, key);
  STATE.lastAmbientKey = key;
  updateActiveAmbient(key);
}

export function goTo(id) {
  const ch = STATE.chapters.find((c) => c.id === id);
  if (!ch) return;

  if (STATE.currentId != null) STATE.history.push(STATE.currentId);
  STATE.currentId = id;

  const ambKey = ch.ambient || ""; // z.B. "amb-forest"
  if (ambKey && ambKey !== STATE.lastAmbientKey) {
    const ambPath = ambKey.startsWith("/")
      ? ambKey
      : `${STATE.ambientBase}${ambKey}.mp3`;
    engine.playAmbient(ambPath, ambKey);
    STATE.lastAmbientKey = ambKey; // <- hier erneuern
    updateActiveAmbient(ambKey);
  } else if (!ambKey) {
    // no ambient?: nothing changes, but UI-Highlight maybe update
    updateActiveAmbient(STATE.lastAmbientKey);
  }

  // Title
  els.chapterTitle.textContent = `#${String(ch.id).padStart(2, "0")} – ${
    ch.title || ""
  }`;

  // Story + inline sounds
  els.chapterContent.innerHTML = renderStory(ch.story?.text || "");
  wireInlineSounds(els.chapterContent);

  // Chapter-specific UI: solfege buttons in chapter 8
  if (ch.id === 8) {
    renderSolfegeButtons(els.chapterContent);
  }

  // Story links
  els.chapterLinks.innerHTML = "";
  (ch.story?.links || []).forEach((l) => {
    const btn = document.createElement("button");
    btn.className = "link-btn";
    btn.textContent = l.label;
    btn.addEventListener("click", () => goTo(l.to));
    els.chapterLinks.appendChild(btn);
  });

  // Tiles (ambient, spells, claps, playback, NPCs)
  renderTilesForChapter(ch);

  // Optional: lazy-cache assets via SW
  if (navigator.serviceWorker?.controller) {
    const assets = collectChapterAssets(ch);
    navigator.serviceWorker.controller.postMessage({
      type: "CACHE_ASSETS",
      assets,
    });
  }
}

export function goBack() {
  const prev = STATE.history.pop();
  if (prev != null) goTo(prev);
}
