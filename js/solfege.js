// Solfege buttons (chapter 8)

import { engine } from "./engine.js";

export const SOLFEGE_NAMES = [
  "Do","Di-Ra","Re","Ri-Mu","Mi-Fu","Fa","Fe-Su","So","Si-Lo","La","Li-Tu","Ti","Do2",
];

// Creates button row; optionally replaces a paragraph that starts with given text
export function renderSolfegeButtons(targetEl, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "solfege-wrap";

  SOLFEGE_NAMES.forEach((label) => {
    const btn = document.createElement("button");
    btn.className = "solf-btn";
    if((label !== "Di-Ra")&&(label !== "Ri-Mu")&&(label !== "Fe-Su")&&(label !== "Si-Lo")&&(label !== "Li-Tu")){
      btn.className = "";
    }
    btn.textContent = label;
    const file = encodeURIComponent(label) + ".mp3";
    const src = `./assets/audio/chromatic-solf/${file}`;
    btn.addEventListener("click", () => engine.playEffect(src));
    wrap.appendChild(btn);
  });

  if (opts.replaceParagraphTextStart) {
    const paras = targetEl.querySelectorAll("p");
    for (const p of paras) {
      if (p.textContent.trim().startsWith(opts.replaceParagraphTextStart)) {
        p.replaceWith(wrap);
        return;
      }
    }
  }

  targetEl.appendChild(wrap);
}