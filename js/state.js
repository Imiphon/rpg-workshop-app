// Shared state & constants (ES module)
// All comments in English

export const CHAPTER_VERSION = "2025-08-23-01"; // bump when chapters.json changes
// export const CHAPTER_VERSION = "";

export const STATE = {
  chapters: [],
  currentId: null,
  history: [],
  ambientBase: "./assets/audio/ambient/",
  lastAmbientKey: null, 
};