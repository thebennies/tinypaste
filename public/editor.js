import MarkdownIt from "https://esm.sh/markdown-it@14.1.0";
import markdownItAbbr from "https://esm.sh/markdown-it-abbr@2.0.0";
import markdownItDeflist from "https://esm.sh/markdown-it-deflist@3.0.0";
import markdownItFootnote from "https://esm.sh/markdown-it-footnote@4.0.0";
import markdownItIns from "https://esm.sh/markdown-it-ins@4.0.0";
import markdownItKatex from "https://esm.sh/markdown-it-katex@2.0.3";
import markdownItMark from "https://esm.sh/markdown-it-mark@4.0.0";
import markdownItSub from "https://esm.sh/markdown-it-sub@2.0.0";
import markdownItSup from "https://esm.sh/markdown-it-sup@2.0.0";
import markdownItTaskLists from "https://esm.sh/markdown-it-task-lists@2.1.1";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(markdownItAbbr)
  .use(markdownItDeflist)
  .use(markdownItFootnote)
  .use(markdownItIns)
  .use(markdownItKatex)
  .use(markdownItMark)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItTaskLists, { enabled: false });

const DRAFT_KEY = "tinypaste:draft";
const CONFIRM_MS = 3000;

const textarea = document.getElementById("markdown");
const preview = document.getElementById("preview");
const publishBtn = document.getElementById("publish");
const form = document.getElementById("editor-form");
const ttlSelect = document.getElementById("ttl");

function render(value) {
  preview.innerHTML = value.trim() ? md.render(value) : "";
}

const remixId = new URLSearchParams(location.search).get("remix");
if (remixId) {
  history.replaceState(null, "", "/");
  fetch("/" + remixId + ".md")
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error("not found"))))
    .then((text) => {
      textarea.value = text;
      localStorage.setItem(DRAFT_KEY, text);
      render(text);
      publishBtn.disabled = false;
    })
    .catch(() => setError("Could not load paste for remix."));
} else {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved) {
    textarea.value = saved;
    render(saved);
  }
}

publishBtn.disabled = !textarea.value.trim();

let debounceTimer = null;
let confirmTimer = null;
let confirming = false;

textarea.addEventListener("input", () => {
  const value = textarea.value;
  publishBtn.disabled = !value.trim();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    localStorage.setItem(DRAFT_KEY, value);
    render(value);
  }, 300);
});

publishBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (!confirming) {
    confirming = true;
    publishBtn.textContent = "Confirm — this will be public";
    publishBtn.dataset.state = "confirming";
    confirmTimer = setTimeout(() => {
      confirming = false;
      publishBtn.textContent = "Publish";
      delete publishBtn.dataset.state;
    }, CONFIRM_MS);
  } else {
    clearTimeout(confirmTimer);
    confirming = false;
    publish();
  }
});

async function publish() {
  const markdown = textarea.value.trim();
  if (!markdown) return;
  publishBtn.textContent = "Publishing…";
  publishBtn.disabled = true;
  delete publishBtn.dataset.state;
  try {
    const ttl = ttlSelect?.value || "";
    const res = await fetch("/api/pastes" + (ttl ? "?ttl=" + ttl : ""), {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: markdown,
    });
    if (!res.ok) {
      const text = await res.text();
      let msg;
      try { msg = JSON.parse(text).error; } catch { msg = text.trim(); }
      throw new Error(msg || "HTTP " + res.status);
    }
    const id = (await res.text()).trim().split("/").pop();
    localStorage.removeItem(DRAFT_KEY);
    location.href = "/" + id;
  } catch (err) {
    setError(err.message);
    publishBtn.textContent = "Publish";
    publishBtn.disabled = false;
  }
}

function setError(msg) {
  let el = document.getElementById("editor-error");
  if (!el) {
    el = document.createElement("p");
    el.id = "editor-error";
    el.className = "error";
    el.setAttribute("role", "alert");
    form.prepend(el);
  }
  el.textContent = msg;
}
