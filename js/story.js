// Story rendering and inline sound wiring

import { engine } from "./engine.js";

export function renderStory(text) {
  // Converts "(Link = /path/file.mp3)" into an inline play button
  const re = /\(\s*Link\s*=\s*([^)]+)\)/g;
  return (text || "").replace(re, (m, path) => {
    const src = (path || "").trim();
    return ` <button class="inline-sound" data-sound="${src.replaceAll('"', "&quot;")}">🔊</button>`;
  });
}

export function wireInlineSounds(container) {
  container.querySelectorAll(".inline-sound").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const src = btn.dataset.sound;
      if (src) engine.playEffect(src);
    });
  });
}