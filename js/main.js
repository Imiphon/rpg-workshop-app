// App bootstrap: SW register, load chapters, menu, sliders, overlay, start
import { CHAPTER_VERSION, STATE } from "./state.js";
import { engine } from "./engine.js";
import { els, setMenu, toggleMenu } from "./dom.js";
import { goTo, goBack } from "./navigation.js";

// Register service worker (same condition as before)
if (
  "serviceWorker" in navigator &&
  !["localhost", "127.0.0.1"].includes(location.hostname)
) {
  try {
    navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.warn(e);
  }
}

// Sidebar close on outside click
document.addEventListener("click", (e) => {
  const isOpen = !els.menu.classList.contains("hidden");
  if (!isOpen) return;
  const insideMenu = els.menu.contains(e.target);
  const onBurger = e.target.closest("#burger");
  if (!insideMenu && !onBurger) setMenu(false);
});
// Sidebar close on ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});
// Burger
els.burger.addEventListener("click", () => toggleMenu());

// Init
window.addEventListener("load", async () => {
  // Load chapters with cache-buster
  try {
    // 1st try: with cache-buster
    let res = await fetch(
      `./chapters.json?v=${encodeURIComponent(CHAPTER_VERSION)}`,
      { cache: "no-store" }
    );
    //let res = await fetch(`chapters.json`, { cache: "no-store" });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(
        `chapters.json HTTP ${res.status} ${res.statusText}\n${t.slice(0, 200)}`
      );
    }
    STATE.chapters = await res.json();
  } catch (e) {
    console.error("Failed to load chapters.json", e);
    STATE.chapters = [];
  }

// Global Listener for Links with href="#..."
document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;

  const href = link.getAttribute("href");
  // handle only chapter anchors like "#08", "#17", ...
  if (!/^#\d+$/.test(href)) return;

  e.preventDefault();
  const id = parseInt(href.slice(1), 10);

  // optional: Menü schließen, wenn der Klick aus dem Text kommt
  setMenu(false);

  // navigate to chapter
  goTo(id, false);
});

  // Build chapter list
  els.chapterList.innerHTML = "";
  STATE.chapters.forEach((ch) => {
    const li = document.createElement("li");
    li.textContent = `#${String(ch.id).padStart(2, "0")} – ${
      ch.title || "Kapitel"
    }`;
    li.addEventListener("click", () => {
      setMenu(false);
      goTo(ch.id, false);
    });
    els.chapterList.appendChild(li);
  });

  // Volumes
  els.volAmb.addEventListener("input", (e) =>
    engine.setVolumes(e.target.value, null)
  );
  els.volFx.addEventListener("input", (e) =>
    engine.setVolumes(null, e.target.value)
  );

  // Back
  els.backBtn.addEventListener("click", goBack);

  // Overlay (autoplay gate)
  els.overlayStart.addEventListener("click", () => {
    els.overlay.classList.add("hidden");
    // iOS gesture unlock
    engine.playEffect("");
  });

  // Precache preference (optional SW message)
  els.precacheAll.addEventListener("change", () => {
    const val = els.precacheAll.checked ? "1" : "0";
    localStorage.setItem("precacheAll", val);
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "PRECACHE_ALL",
        value: els.precacheAll.checked,
      });
    }
  });
  els.precacheAll.checked = localStorage.getItem("precacheAll") === "1";

  function refreshMuteUI() {
    els.muteBtn.setAttribute("aria-pressed", String(engine.muted));
    els.muteBtn.textContent = engine.muted ? "🔇" : "🔊";
  }
  els.muteBtn.addEventListener("click", () => {
    engine.toggleMuted();
    refreshMuteUI();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m") {
      engine.toggleMuted();
      refreshMuteUI();
    }
  });
  refreshMuteUI();

  // Start at chapter with start=true, else #0, else first
  const start =
    STATE.chapters.find((c) => c.start) ||
    STATE.chapters.find((c) => c.id === 0) ||
    STATE.chapters[0];
  if (start) goTo(start.id, true);
});
