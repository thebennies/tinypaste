import MarkdownIt from "npm:markdown-it@14.1.0";
import markdownItAbbr from "npm:markdown-it-abbr@2.0.0";
import markdownItDeflist from "npm:markdown-it-deflist@3.0.0";
import markdownItFootnote from "npm:markdown-it-footnote@4.0.0";
import markdownItIns from "npm:markdown-it-ins@4.0.0";
import markdownItKatex from "npm:markdown-it-katex@2.0.3";
import markdownItMark from "npm:markdown-it-mark@4.0.0";
import markdownItSub from "npm:markdown-it-sub@2.0.0";
import markdownItSup from "npm:markdown-it-sup@2.0.0";
import markdownItTaskLists from "npm:markdown-it-task-lists@2.1.1";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})
  .use(markdownItAbbr)
  .use(markdownItDeflist)
  .use(markdownItFootnote)
  .use(markdownItIns)
  .use(markdownItKatex)
  .use(markdownItMark)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItTaskLists, { enabled: false });

const defaultFence = md.renderer.rules.fence;

md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0].toLowerCase();

  if (language === "mermaid" || language === "mmd") {
    return `<figure class="mermaid-diagram" data-mermaid><pre class="mermaid-source">${
      escapeHtml(token.content)
    }</pre></figure>`;
  }

  return defaultFence(tokens, index, options, env, self);
};

export function renderMarkdown(markdown) {
  return md.render(markdown);
}
