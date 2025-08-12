// DOM references and small UI helpers

export const els = {
  burger: document.getElementById("burger"),
  menu: document.getElementById("menu"),
  chapterList: document.getElementById("chapter-list"),
  chapterTitle: document.getElementById("chapter-title"),
  chapterContent: document.getElementById("chapter-content"),
  chapterLinks: document.getElementById("chapter-links"),
  backBtn: document.getElementById("back-btn"),
  ambientButtons: document.getElementById("ambient-buttons"),
  spellButtons: document.getElementById("spell-buttons"),
  clapButtons: document.getElementById("clap-buttons"),
  playbackButtons: document.getElementById("playback-buttons"),
  npc1Title: document.getElementById("npc1-title"),
  npc2Title: document.getElementById("npc2-title"),
  npc3Title: document.getElementById("npc3-title"),
  npc1Buttons: document.getElementById("npc1-buttons"),
  npc2Buttons: document.getElementById("npc2-buttons"),
  npc3Buttons: document.getElementById("npc3-buttons"),
  overlay: document.getElementById("overlay"),
  overlayStart: document.getElementById("overlay-start"),
  volAmb: document.getElementById("vol-amb"),
  volFx: document.getElementById("vol-fx"),
  precacheAll: document.getElementById("precache-all"),
  volAmb: document.getElementById("vol-amb"),
  volFx: document.getElementById("vol-fx"),
  precacheAll: document.getElementById("precache-all"),
  muteBtn: document.getElementById("mute-btn"),
};

export function setMenu(open) {
  els.menu.classList.toggle("hidden", !open);
  els.menu.setAttribute("aria-hidden", String(!open));
}

export function toggleMenu() {
  const isHidden = els.menu.classList.contains("hidden");
  setMenu(isHidden);
}

export function updateActiveAmbient(key) {
  Array.from(els.ambientButtons.children).forEach((b) => {
    b.classList.toggle("active", b.dataset.key === key);
  });
}
