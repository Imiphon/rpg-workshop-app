// Shared state & constants (ES module)
// All comments in English

export const CHAPTER_VERSION = "2025-08-12-01"; // bump when chapters.json changes

export const STATE = {
  chapters: [],
  currentId: null,
  history: [],
  ambientBase: "./assets/audio/ambient/",
  lastAmbientKey: null, 
};