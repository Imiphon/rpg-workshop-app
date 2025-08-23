// NPC manifest loader (once, then cached)

import { CHAPTER_VERSION } from "./state.js";

const NPC_MANIFEST_URL = "./assets/audio/characters/manifest.json";
let NPC_MANIFEST = null;

export async function loadNpcManifest() {
  if (NPC_MANIFEST) return NPC_MANIFEST;
  try {
    // const res = await fetch(`${NPC_MANIFEST_URL}?v=${encodeURIComponent(CHAPTER_VERSION)}`, { cache: "no-cache" });
    const res = await fetch(`${NPC_MANIFEST_URL}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error(`Unexpected content-type: ${ct}`);
    NPC_MANIFEST = await res.json();
  } catch (e) {
    console.warn("NPC manifest missing or invalid, using empty manifest.", e);
    NPC_MANIFEST = {};
  }
  return NPC_MANIFEST;
}

export function prettifyLabel(filename) {
  // "laugh-evil2.mp3" -> "laugh evil2"
  return filename.replace(/\.mp3$/i, "").replace(/[-_]+/g, " ");
}