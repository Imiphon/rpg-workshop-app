// Lightweight Chapters Editor (client-side)
// Comments in English; minimal footprint; no existing names overridden.

import { STATE } from "./state.js";
import { goTo } from "./navigation.js";

/** 
 * IMPORTANT:
 * Set your password at build-time by defining window.CHAPTERS_EDITOR_PASSWORD
 * e.g. in index.html before this script OR adjust the default here.
 */
const PASSWORD_SOURCE =
  typeof window !== "undefined" && window.CHAPTERS_EDITOR_PASSWORD
    ? window.CHAPTERS_EDITOR_PASSWORD
    : "change-me";

// Internal editor state (kept local to this module)
const edState = {
  open: false,
  shadow: null,
  root: null,
  currentId: null,
  draft: null,          // deep copy of STATE.chapters for editing
  undoStack: [],
  redoStack: [],
};

// Safeguard: create once
function ensureRoot() {
  if (edState.root) return;

  // Create host container in light DOM so global CSS applies
  const host = document.createElement("div");
  host.id = "chapters-editor";
  document.body.appendChild(host);

  // Build structure directly in light DOM (no Shadow DOM)
  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `
    <div class="header">
      <strong>Chapters</strong>
      <button class="btn ghost" id="close-btn">Close ✕</button>
    </div>
    <div class="toolbar">
      <input type="search" id="search" placeholder="Search by id/title">
      <button class="btn" id="add-ch">+ Add</button>
      <button class="btn" id="import-btn">Import</button>
      <button class="btn" id="export-btn">Export</button>
    </div>
    <div class="list" id="list"></div>
    <div class="footer">
      <div class="dim" id="stats"></div>
      <div>
        <button class="btn" id="undo-btn">Undo</button>
        <button class="btn" id="redo-btn">Redo</button>
      </div>
    </div>
  `;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `
    <div class="header">
      <strong id="detail-title">Details</strong>
      <div>
        <button class="btn" id="preview-btn">Preview</button>
        <button class="btn danger" id="delete-btn">Delete</button>
      </div>
    </div>
    <div id="errors" class="errors"></div>
    <div id="detail"></div>
  `;

  wrap.appendChild(left);
  wrap.appendChild(right);
  host.appendChild(wrap);

  // Wire controls (scope all selectors to the host to avoid collisions)
  host.querySelector("#close-btn").addEventListener("click", closeEditor);
  host.querySelector("#add-ch").addEventListener("click", addChapter);
  host.querySelector("#import-btn").addEventListener("click", importJSON);
  host.querySelector("#export-btn").addEventListener("click", exportJSON);
  host.querySelector("#undo-btn").addEventListener("click", undo);
  host.querySelector("#redo-btn").addEventListener("click", redo);
  host.querySelector("#preview-btn").addEventListener("click", preview);
  host.querySelector("#delete-btn").addEventListener("click", removeChapter);
  host.querySelector("#search").addEventListener("input", renderList);

  edState.root = host;
}


function openEditor() {
  if (edState.open) return;
  if (!STATE.chapters || !Array.isArray(STATE.chapters) || !STATE.chapters.length) {
    alert("Chapters are not loaded yet.");
    return;
  }
  // Password gate
  const pass = prompt("Enter editor password:");
  if (pass !== PASSWORD_SOURCE) {
    alert("Wrong password.");
    return;
  }
  ensureRoot();
  edState.root.style.display = "block";
  edState.open = true;
  // work on a deep copy
  edState.draft = JSON.parse(JSON.stringify(STATE.chapters));
  edState.currentId = edState.draft[0]?.id ?? null;
  edState.undoStack = [];
  edState.redoStack = [];
  renderList();
  renderDetail();
}

function closeEditor() {
  if (!edState.open) return;
  edState.open = false;
  edState.root.style.display = "none";
}

// Public API: attach global opener (console use)
window.openChaptersEditor = openEditor;

// Rendering helpers
function renderList() {
  const list = edState.root.querySelector("#list");
  const stats = edState.root.querySelector("#stats");
  const q = edState.root.querySelector("#search").value.toLowerCase();

  const rows = edState.draft
    .filter(ch => {
      const t = String(ch.title ?? "").toLowerCase();
      const idStr = String(ch.id ?? "");
      return !q || t.includes(q) || idStr.includes(q);
    })
    .map(ch => {
      const row = document.createElement("div");
      row.className = "row" + (ch.id === edState.currentId ? " active" : "");
      row.innerHTML = `
        <span>${escapeHtml(ch.title ?? "(untitled)")} <span class="tags">#${ch.id}</span></span>
        <span class="tags">${escapeHtml(ch.ambient ?? "")}</span>
      `;
      row.addEventListener("click", () => {
        edState.currentId = ch.id;
        renderList();
        renderDetail();
      });
      return row;
    });

  list.innerHTML = "";
  rows.forEach(r => list.appendChild(r));
  stats.textContent = `${edState.draft.length} chapters`;
}

function renderDetail() {
  const mount = edState.root.querySelector("#detail");
  const errors = edState.root.querySelector("#errors");
  mount.innerHTML = "";
  errors.textContent = "";

  const ch = edState.draft.find(c => c.id === edState.currentId);
  if (!ch) {
    mount.innerHTML = `<div class="dim">No selection</div>`;
    return;
  }

  // Build fields using existing keys (id, title, ambient, npc*, story.text, story.links[])
  const frag = document.createDocumentFragment();

  frag.appendChild(field("ID (number)", ch.id, (v) => setValue(ch, "id", v === "" ? null : Number(v))));
  frag.appendChild(field("Title", ch.title ?? "", (v) => setValue(ch, "title", v)));
  frag.appendChild(field("Ambient key", ch.ambient ?? "", (v) => setValue(ch, "ambient", v)));

  // NPC titles (if present)
  ["npc1Title","npc2Title","npc3Title"].forEach(k => {
    if (k in ch || true) { // show even if missing, to allow adding
      frag.appendChild(field(k, ch[k] ?? "", (v) => setValue(ch, k, v)));
    }
  });

  // Story text
  const story = (ch.story ||= {});
  const textArea = textareaField("Story text (HTML allowed)", story.text ?? "", (v) => {
    story.text = v;
    pushUndo();
  });
  frag.appendChild(textArea);

  // Links list
  const linksWrap = document.createElement("div");
  linksWrap.className = "field";
  const lbl = document.createElement("label");
  lbl.textContent = "Links (label → to)";
  linksWrap.appendChild(lbl);

  const linksBox = document.createElement("div");
  linksBox.className = "links";
  (story.links ||= []).forEach((lnk, idx) => {
    const row = document.createElement("div");
    row.className = "link-row";
    const labelInput = input(lnk.label ?? "", (v) => {
      lnk.label = v;
      pushUndo();
    });
    const toInput = input(String(lnk.to ?? ""), (v) => {
      lnk.to = v === "" ? null : Number(v);
      pushUndo();
    });
    const delBtn = button("✕", "btn", () => {
      story.links.splice(idx, 1);
      pushUndo();
      renderDetail();
    });
    row.appendChild(labelInput);
    row.appendChild(toInput);
    row.appendChild(delBtn);
    linksBox.appendChild(row);
  });

  const addLinkBtn = button("+ Add link", "btn", () => {
    (story.links ||= []).push({ label: "Weiter", to: ch.id });
    pushUndo();
    renderDetail();
  });

  linksWrap.appendChild(linksBox);
  linksWrap.appendChild(addLinkBtn);
  frag.appendChild(linksWrap);

  // Validation
  const errs = validateDraft();
  if (errs.length) errors.textContent = errs.join("\n");

  // Mount
  mount.appendChild(frag);
}

function setValue(obj, key, val) {
  if (obj[key] === val) return;
  obj[key] = val;
  pushUndo();
  renderList();
}

// Field builders
function field(labelText, value, onInput) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("label");
  lab.textContent = labelText;
  const inp = input(value, onInput);
  wrap.appendChild(lab);
  wrap.appendChild(inp);
  return wrap;
}

function textareaField(labelText, value, onInput) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const lab = document.createElement("label");
  lab.textContent = labelText;
  const ta = document.createElement("textarea");
  ta.value = value ?? "";
  ta.rows = 10;
  ta.addEventListener("input", () => onInput(ta.value));
  wrap.appendChild(lab);
  wrap.appendChild(ta);
  return wrap;
}

function input(value, onInput) {
  const el = document.createElement("input");
  el.value = value ?? "";
  el.addEventListener("input", () => onInput(el.value));
  return el;
}

function button(label, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// CRUD
function addChapter() {
  const nextId = suggestNextId();
  edState.draft.push({
    id: nextId,
    title: "New Chapter",
    ambient: "",
    npc1Title: "",
    npc2Title: "",
    npc3Title: "",
    story: { text: "", links: [] },
  });
  edState.currentId = nextId;
  pushUndo();
  renderList();
  renderDetail();
}

function removeChapter() {
  if (edState.currentId == null) return;
  if (!confirm("Delete this chapter?")) return;
  const i = edState.draft.findIndex(c => c.id === edState.currentId);
  if (i >= 0) {
    edState.draft.splice(i, 1);
    pushUndo();
    edState.currentId = edState.draft[0]?.id ?? null;
    renderList();
    renderDetail();
  }
}

// Undo/Redo
function pushUndo() {
  edState.undoStack.push(JSON.stringify(edState.draft));
  // prune
  if (edState.undoStack.length > 50) edState.undoStack.shift();
  // clear redo on new action
  edState.redoStack.length = 0;
}

function undo() {
  if (!edState.undoStack.length) return;
  const last = edState.undoStack.pop();
  edState.redoStack.push(JSON.stringify(edState.draft));
  edState.draft = JSON.parse(last);
  renderList();
  renderDetail();
}

function redo() {
  if (!edState.redoStack.length) return;
  const next = edState.redoStack.pop();
  edState.undoStack.push(JSON.stringify(edState.draft));
  edState.draft = JSON.parse(next);
  renderList();
  renderDetail();
}

// Import/Export
function exportJSON() {
  const errs = validateDraft();
  if (errs.length) {
    if (!confirm("There are validation warnings. Export anyway?")) return;
  }
  const blob = new Blob([JSON.stringify(edState.draft, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chapters.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data)) {
          alert("Invalid JSON: expected an array of chapters.");
          return;
        }
        edState.draft = data;
        edState.currentId = edState.draft[0]?.id ?? null;
        edState.undoStack = [];
        edState.redoStack = [];
        renderList();
        renderDetail();
      } catch (e) {
        alert("Failed to parse JSON.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Preview in running app
function preview() {
  const ch = edState.draft.find(c => c.id === edState.currentId);
  if (!ch) return;
  // Temporarily replace STATE.chapters for preview session
  STATE.chapters = edState.draft;
  try {
    goTo(ch.id, true);
  } catch (e) {
    console.warn(e);
    alert("Preview failed. See console for details.");
  }
}

// Utils
function validateDraft() {
  const errs = [];
  const ids = new Set();
  const allIds = new Set();
  edState.draft.forEach(c => allIds.add(c.id));

  edState.draft.forEach(c => {
    if (c.id == null || Number.isNaN(Number(c.id))) errs.push(`Chapter with missing/invalid id: ${JSON.stringify(c.title)}`);
    if (ids.has(c.id)) errs.push(`Duplicate id: ${c.id}`);
    ids.add(c.id);

    if (!c.title || !String(c.title).trim()) errs.push(`Missing title for #${c.id}`);

    const links = (c.story?.links) || [];
    links.forEach((lnk, i) => {
      if (!lnk || typeof lnk !== "object") errs.push(`Invalid link at #${c.id}[${i}]`);
      if (!("label" in lnk)) errs.push(`Link missing label at #${c.id}[${i}]`);
      if (!("to" in lnk)) errs.push(`Link missing 'to' at #${c.id}[${i}]`);
      if (!allIds.has(lnk.to)) errs.push(`Link to non-existing id ${lnk.to} from #${c.id}`);
    });
  });
  return errs;
}

function suggestNextId() {
  const max = edState.draft.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
  return max + 1;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
