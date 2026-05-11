(() => {
  const diagrams = Array.from(document.querySelectorAll("[data-mermaid]"));
  let overlay = null;
  let overlayController = null;
  let overlayPanZoom = null;

  if (!diagrams.length) return;

  if (!window.mermaid) {
    for (const diagram of diagrams) diagram.classList.add("mermaid-error");
    return;
  }

  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      background: "#ffffff",
      mainBkg: "#fdf2f8",
      primaryColor: "#fdf2f8",
      primaryTextColor: "#111827",
      primaryBorderColor: "#ea4c89",
      lineColor: "#6b7280",
      secondaryColor: "#f9fafb",
      tertiaryColor: "#f9fafb",
    },
  });

  function contentSize(content) {
    const svg = content.querySelector("svg");
    if (!svg) return { width: 800, height: 480 };

    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    const width = viewBox && viewBox.width ? viewBox.width : Number.parseFloat(svg.getAttribute("width")) || 800;
    const height = viewBox && viewBox.height ? viewBox.height : Number.parseFloat(svg.getAttribute("height")) || 480;
    return { width, height };
  }

  function normalizeSvg(content) {
    const svg = content.querySelector("svg");
    if (!svg) return;

    svg.removeAttribute("style");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  function setFrameHeight(frame, content) {
    const padding = 12;
    const { width, height } = contentSize(content);
    const fitScale = Math.min(1, (frame.clientWidth - padding * 2) / width);

    frame.style.height = Math.round(Math.min(window.innerHeight * 0.72, Math.max(240, height * fitScale + padding * 2))) + "px";
  }

  function fitPanZoom(frame, content, panZoom, dynamicHeight) {
    if (dynamicHeight) setFrameHeight(frame, content);

    try {
      panZoom.resize();
      panZoom.fit();
      panZoom.center();
    } catch {}
  }

  function resetPanZoom(panZoom) {
    try {
      panZoom.resetZoom();
      panZoom.fit();
      panZoom.center();
    } catch {}
  }

  function destroyPanZoom(panZoom) {
    if (!panZoom) return;

    try {
      panZoom.destroy();
    } catch {}
  }

  function attachPanZoom(frame, content, options = {}) {
    const dynamicHeight = Boolean(options.dynamicHeight);
    const listenerOptions = options.signal
      ? { signal: options.signal }
      : undefined;
    const svg = content.querySelector("svg");

    frame.tabIndex = 0;
    frame.setAttribute("role", "img");
    frame.setAttribute("aria-label", "Mermaid diagram. Drag to pan. Wheel or pinch to zoom. Double-click or double-tap to reset.");

    if (dynamicHeight) setFrameHeight(frame, content);
    normalizeSvg(content);

    if (!svg || typeof window.svgPanZoom !== "function") {
      return null;
    }

    const panZoom = window.svgPanZoom(svg, {
      zoomEnabled: true,
      controlIconsEnabled: false,
      fit: true,
      center: true,
      contain: false,
      minZoom: 0.2,
      maxZoom: 12,
      zoomScaleSensitivity: 0.35,
      dblClickZoomEnabled: false,
      mouseWheelZoomEnabled: true,
    });

    const refit = () => fitPanZoom(frame, content, panZoom, dynamicHeight);
    const releaseGrab = () => frame.classList.remove("is-grabbing");

    requestAnimationFrame(refit);
    window.addEventListener("resize", refit, listenerOptions);
    frame.addEventListener("mousedown", () => frame.classList.add("is-grabbing"), listenerOptions);
    frame.addEventListener("mouseup", releaseGrab, listenerOptions);
    frame.addEventListener("mouseleave", releaseGrab, listenerOptions);
    svg.addEventListener("dblclick", (event) => {
      event.preventDefault();
      resetPanZoom(panZoom);
    }, listenerOptions);

    frame.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        panZoom.zoomBy(1.2);
      }

      if (event.key === "-") {
        event.preventDefault();
        panZoom.zoomBy(1 / 1.2);
      }

      if (event.key === "0" || event.key === "Escape") {
        event.preventDefault();
        resetPanZoom(panZoom);
      }
    }, listenerOptions);

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        destroyPanZoom(panZoom);
      }, { once: true });
    }

    return panZoom;
  }

  function closeFullscreen() {
    if (!overlay) return;

    const panZoom = overlayPanZoom;
    overlayPanZoom = null;

    if (overlayController) {
      overlayController.abort();
      overlayController = null;
    } else {
      destroyPanZoom(panZoom);
    }

    overlay.hidden = true;
    overlay.querySelector(".mermaid-fullscreen-frame").replaceChildren();
  }

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "mermaid-fullscreen";
    overlay.hidden = true;
    overlay.innerHTML = '<div class="mermaid-fullscreen-bar"><button class="mermaid-close" type="button">close</button></div><div class="mermaid-fullscreen-frame"></div>';
    document.body.append(overlay);

    overlay.querySelector(".mermaid-close").addEventListener("click", closeFullscreen);

    document.addEventListener("keydown", (event) => {
      if (!overlay.hidden && event.key === "Escape") {
        closeFullscreen();
      }
    });

    return overlay;
  }

  function openFullscreen(svgHtml) {
    const currentOverlay = ensureOverlay();
    const frame = currentOverlay.querySelector(".mermaid-fullscreen-frame");
    const content = document.createElement("div");

    if (overlayController) {
      overlayController.abort();
      overlayController = null;
      overlayPanZoom = null;
    }

    overlayController = new AbortController();
    content.className = "mermaid-content";
    content.innerHTML = svgHtml;
    frame.replaceChildren(content);
    currentOverlay.hidden = false;
    overlayPanZoom = attachPanZoom(frame, content, {
      dynamicHeight: false,
      signal: overlayController.signal,
    });
    frame.focus();
  }

  async function renderDiagram(diagram, index) {
    const source = diagram.querySelector(".mermaid-source")?.textContent || "";
    const frame = document.createElement("div");
    const content = document.createElement("div");
    const open = document.createElement("button");

    frame.className = "mermaid-frame";
    content.className = "mermaid-content";
    open.className = "mermaid-open";
    open.type = "button";
    open.textContent = "open";
    open.setAttribute("aria-label", "Open Mermaid diagram fullscreen");
    frame.append(content);
    diagram.replaceChildren(open, frame);

    try {
      const result = await window.mermaid.render("mermaid-" + Date.now() + "-" + index, source);
      const svgHtml = result.svg;
      content.innerHTML = svgHtml;
      attachPanZoom(frame, content, { dynamicHeight: true });
      open.addEventListener("click", () => openFullscreen(svgHtml));
    } catch {
      const pre = document.createElement("pre");
      pre.className = "mermaid-error";
      pre.textContent = source;
      diagram.replaceChildren(pre);
    }
  }

  diagrams.forEach((diagram, index) => renderDiagram(diagram, index));
})();
