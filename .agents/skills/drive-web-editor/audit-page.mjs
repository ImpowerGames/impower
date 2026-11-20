export function auditScan({ parts, coarse, minTarget }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const colors = new Map();
  const rgba = (value) => {
    if (colors.has(value)) return colors.get(value);
    context.globalCompositeOperation = "copy";
    context.fillStyle = "rgba(0, 0, 0, 0)";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    const out = { r, g, b, a: a / 255 };
    colors.set(value, out);
    return out;
  };
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
    return { r: mix("r"), g: mix("g"), b: mix("b"), a };
  };
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  const describe = (el) => {
    const parts = [];
    for (let node = el, depth = 0; node && node.nodeType === 1 && depth < 4; node = node.parentElement, depth++) {
      let part = node.localName;
      if (node.id && !/^radix-|^:r/.test(node.id)) part += `#${node.id}`;
      const role = node.getAttribute("role");
      if (role) part += `[role=${role}]`;
      const label = node.getAttribute("aria-label");
      if (label) part += `[aria-label="${label.slice(0, 40)}"]`;
      parts.unshift(part);
      if (node.id || label) break;
    }
    return parts.join(" > ");
  };
  const nameOf = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.getAttribute("placeholder") || el.value || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const region = (el) => {
    if (el.closest(".cm-content, .cm-gutters")) return "script";
    const landmark = el.closest('[role="dialog"], [role="menu"], [role="listbox"], aside, nav, header, main, footer');
    if (!landmark) return "page";
    return landmark.getAttribute("aria-label") || landmark.getAttribute("role") || landmark.localName;
  };
  const inViewport = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  const shown = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
  const exempt = (el) => !!el.closest(':disabled, [aria-disabled="true"], [inert], [aria-hidden="true"]');

  const backdrop = (el) => {
    let color = { r: 0, g: 0, b: 0, a: 0 };
    let opacity = 1;
    let unresolved = null;
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      if (style.backgroundImage !== "none" && !unresolved) unresolved = `${describe(node)} has a background image`;
      const layer = rgba(style.backgroundColor);
      if (layer.a > 0) layers.push(layer);
      if (layer.a >= 0.999) break;
    }
    const base = layers.length && layers.at(-1).a >= 0.999 ? null : rgba(getComputedStyle(document.documentElement).backgroundColor);
    color = base && base.a > 0 ? base : { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) color = over(layer, color);
    return { color, opacity, unresolved };
  };

  const out = { contrast: [], targets: [], strings: [], lists: [], liveRegions: [] };

  if (parts.includes("contrast")) {
    const seen = new Set();
    const push = (entry) => {
      const key = `${entry.kind}|${entry.fg}|${entry.bg}|${entry.where}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.contrast.push(entry);
    };
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("iframe, script, style, template, noscript")) continue;
      if (exempt(el)) continue;
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      const isIcon = el.localName === "svg" && !el.parentElement.closest("svg");
      const isControl = el.matches('input:not([type="hidden"]):not([type="range"]), textarea, select, [role="switch"], [role="checkbox"], [role="radio"]');
      if (!text && !isIcon && !isControl) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2 || !shown(el)) continue;
      const style = getComputedStyle(el);
      const back = backdrop(isIcon ? el.parentElement : el);
      const where = `${region(el)}: ${describe(el)}`;
      if (text) {
        if (style.color === "transparent" || Number(style.opacity) === 0) continue;
        const fg = rgba(style.color);
        const effective = over({ ...fg, a: fg.a * back.opacity }, back.color);
        const size = parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        const value = ratio(effective, back.color);
        push({ kind: "text", where, sample: text.slice(0, 40), fg: hex(effective), bg: hex(back.color), ratio: Math.round(value * 100) / 100, needs: large ? 3 : 4.5, unresolved: back.unresolved, script: region(el) === "script" });
      } else if (isIcon) {
        const paint = [style.stroke, style.fill].find((v) => v && v !== "none" && !/^url/.test(v)) ?? style.color;
        const fg = rgba(paint);
        if (fg.a === 0) continue;
        const effective = over({ ...fg, a: fg.a * back.opacity }, back.color);
        push({ kind: "icon", where, sample: nameOf(el.closest("button, a, [role]") ?? el), fg: hex(effective), bg: hex(back.color), ratio: Math.round(ratio(effective, back.color) * 100) / 100, needs: 3, unresolved: back.unresolved });
      } else {
        let best = null;
        for (let box = el, depth = 0; box && box !== document.body && depth < 4; box = box.parentElement, depth++) {
          const r = box.getBoundingClientRect();
          if (depth && (r.left < rect.left - 64 || r.right > rect.right + 64 || r.top < rect.top - 16 || r.bottom > rect.bottom + 16)) break;
          const s = getComputedStyle(box);
          const around = backdrop(box.parentElement).color;
          const fill = over(rgba(s.backgroundColor), around);
          const edges = ["Top", "Right", "Bottom", "Left"].filter((side) => parseFloat(s[`border${side}Width`]) >= 1 && s[`border${side}Style`] !== "none").map((side) => over(rgba(s[`border${side}Color`]), around));
          for (const paint of [fill, ...edges]) {
            const value = ratio(paint, around);
            if (value > 1.01 && (!best || value > best.value)) best = { value, paint, around };
          }
        }
        if (!best) {
          push({ kind: "control", where, sample: nameOf(el), fg: "none", bg: "none", ratio: null, needs: 3, unresolved: "no boundary is drawn" });
          continue;
        }
        push({ kind: "control", where, sample: nameOf(el), fg: hex(best.paint), bg: hex(best.around), ratio: Math.round(best.value * 100) / 100, needs: 3, unresolved: null });
      }
    }
  }

  if (parts.includes("targets") && coarse) {
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="link"], [role="slider"], [role="treeitem"], [tabindex]:not([tabindex="-1"])';
    const seen = new Set();
    const scrolled = [...document.querySelectorAll("*")].filter((n) => n.scrollTop || n.scrollLeft).map((n) => [n, n.scrollTop, n.scrollLeft]);
    const restore = () => {
      for (const n of document.querySelectorAll("*")) if (n.scrollTop || n.scrollLeft) n.scrollTo({ top: 0, left: 0, behavior: "instant" });
      for (const [n, top, left] of scrolled) n.scrollTo({ top, left, behavior: "instant" });
    };
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest(".cm-content") || exempt(el)) continue;
      const inner = el.parentElement?.closest(selector);
      if (inner && !el.matches('input, select, textarea')) continue;
      if (!shown(el)) continue;
      let rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      rect = el.getBoundingClientRect();
      if (!inViewport(rect)) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const label = el.closest("label") ?? el.labels?.[0] ?? null;
      const hits = (x, y) => {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
        const hit = document.elementFromPoint(x, y);
        if (!hit) return false;
        if (hit === el || el.contains(hit)) return true;
        if (!label || !(hit === label || label.contains(hit))) return false;
        const control = hit.closest(selector);
        return !control || control === el || !label.contains(control);
      };
      if (!hits(cx, cy)) continue;
      const reach = (dx, dy) => {
        let n = 0;
        while (n < minTarget && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
        return n;
      };
      const width = Math.min(reach(-1, 0) + reach(1, 0) + 1, minTarget);
      const height = Math.min(reach(0, -1) + reach(0, 1) + 1, minTarget);
      const key = describe(el);
      if (seen.has(key)) continue;
      seen.add(key);
      out.targets.push({ where: `${region(el)}: ${key}`, name: nameOf(el), box: `${Math.round(rect.width)}x${Math.round(rect.height)}`, hit: `${width}x${height}`, ok: width >= minTarget && height >= minTarget });
    }
    restore();
  }

  if (parts.includes("copy")) {
    const seen = new Set();
    const add = (text, el, source) => {
      const value = text.trim().replace(/\s+/g, " ");
      if (!value || !/[A-Za-z]/.test(value) || value.length > 160) return;
      const key = `${value}|${source}`;
      if (seen.has(key)) return;
      seen.add(key);
      const role = el.closest('button, a, [role="button"], [role="menuitem"], [role="tab"], [role="option"], h1, h2, h3, h4, label, legend, [role="heading"]');
      out.strings.push({ text: value, source, role: role ? role.getAttribute("role") || role.localName : null, where: describe(el) });
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || el.closest(".cm-content, .cm-gutters, script, style, template, noscript, [data-audit-skip]")) continue;
      if (!shown(el)) continue;
      add(node.textContent, el, "text");
    }
    for (const el of document.querySelectorAll("[aria-label], [title], [placeholder], img[alt], [aria-description]")) {
      if (el.closest(".cm-content, .cm-gutters")) continue;
      for (const attr of ["aria-label", "title", "placeholder", "alt", "aria-description"]) {
        const value = el.getAttribute(attr);
        if (value) add(value, el, attr);
      }
    }
  }

  if (parts.includes("structure")) {
    for (const el of document.querySelectorAll('[role="list"], ul, ol, [role="listbox"], [role="tree"], [role="grid"], [role="table"], table, [role="tablist"], [role="menu"]')) {
      if (!shown(el) || el.closest(".cm-content")) continue;
      const role = el.getAttribute("role") || ({ ul: "list", ol: "list", table: "table" })[el.localName];
      const items = el.querySelectorAll(':scope > li, :scope > [role="listitem"], :scope > [role="option"], [role="treeitem"], [role="row"], :scope > [role="tab"], [role="menuitem"]').length;
      out.lists.push({ role, label: el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.innerText?.trim() || null, items, where: describe(el) });
    }
    for (const el of document.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"], [role="timer"], output')) {
      if (el.closest(".cm-content")) continue;
      out.liveRegions.push({ role: el.getAttribute("role") || `${el.localName}[aria-live=${el.getAttribute("aria-live")}]`, live: el.getAttribute("aria-live") || null, atomic: el.getAttribute("aria-atomic"), text: el.innerText?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "", label: el.getAttribute("aria-label") || el.innerText?.trim().replace(/\s+/g, " ").slice(0, 30) || null, where: describe(el) });
    }
  }
  return out;
}

export function tokenPairs({ themes, pairs }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (value) => {
    context.globalCompositeOperation = "copy";
    context.fillStyle = "rgba(0, 0, 0, 0)";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const over = (top, bottom) => {
    const mix = (k) => top[k] * top.a + bottom[k] * (1 - top.a);
    return { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
  };
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const out = {};
  for (const theme of themes) {
    const probe = document.createElement("div");
    probe.dataset.theme = theme.id;
    if (theme.surfaces) probe.dataset.surfaces = theme.surfaces;
    if (theme.syntax) probe.dataset.syntax = theme.syntax;
    probe.style.display = "none";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const resolve = (name) => {
      const holder = document.createElement("span");
      holder.style.color = `var(${name})`;
      probe.append(holder);
      const value = getComputedStyle(holder).color;
      holder.remove();
      return style.getPropertyValue(name).trim() ? rgba(value) : null;
    };
    out[theme.id] = pairs.map(([text, on]) => {
      const fg = resolve(text);
      const bgRaw = resolve(on);
      if (!fg || !bgRaw) return null;
      const bg = bgRaw.a < 1 ? over(bgRaw, resolve("--bg") ?? { r: 0, g: 0, b: 0, a: 1 }) : bgRaw;
      return Math.round(ratio(over(fg, bg), bg) * 100) / 100;
    });
    probe.remove();
  }
  return out;
}

export function focusState() {
  let el = document.activeElement;
  let frame = null;
  while (el?.localName === "iframe") {
    frame = el;
    try {
      el = el.contentDocument?.activeElement ?? null;
    } catch {
      break;
    }
  }
  if (!el || el === document.body) return { key: "body", body: true };
  if (frame && el.ownerDocument !== document) {
    return { key: `iframe:${frame.title || frame.id}`, tag: "iframe", role: "frame", name: frame.title || frame.getAttribute("aria-label") || "", insideFrame: true, visible: null, native: true };
  }
  const describe = (node) => {
    const parts = [];
    for (let n = node, d = 0; n && n.nodeType === 1 && d < 4; n = n.parentElement, d++) {
      let part = n.localName;
      if (n.id && !/^radix-|^:r/.test(n.id)) part += `#${n.id}`;
      const role = n.getAttribute("role");
      if (role) part += `[role=${role}]`;
      const label = n.getAttribute("aria-label");
      if (label) part += `[aria-label="${label.slice(0, 40)}"]`;
      parts.unshift(part);
      if (n.id || label) break;
    }
    return parts.join(" > ");
  };
  const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const role = el.getAttribute("role") || el.localName;
  const native = el.matches('button, a[href], input, select, textarea, summary, [contenteditable="true"], iframe');
  const scrollable = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  const watched = (node, pseudo) => {
    const s = getComputedStyle(node, pseudo);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.backgroundColor, s.color, s.textDecorationLine].join("|");
  };
  const targets = [[el, null], [el, "::before"], [el, "::after"], [el.parentElement, null], [el.parentElement?.parentElement, null]].filter(([n]) => n);
  const focused = targets.map(([n, p]) => watched(n, p));
  const focusVisible = el.matches(":focus-visible");
  const rect = el.getBoundingClientRect();
  el.blur();
  const blurred = targets.map(([n, p]) => watched(n, p));
  el.focus({ preventScroll: true });
  const caret = el.matches(".cm-content") && !!el.closest(".cm-editor")?.querySelector(".cm-cursor");
  const changed = caret || focused.some((v, i) => v !== blurred[i]);
  const s = getComputedStyle(el);
  const ring = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
  return {
    key: describe(el),
    tag: el.localName,
    role,
    name,
    native,
    custom: !native && !el.getAttribute("role") && !scrollable,
    scrollRegion: !native && scrollable,
    inEditor: !!el.closest(".cm-editor"),
    focusVisible,
    visible: changed,
    caret,
    ring,
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
  };
}

export function motionRecorder() {
  if (window.__auditMotion) return;
  const log = [];
  window.__auditMotion = log;
  const describe = (el) => {
    if (!(el instanceof Element)) return String(el);
    const parts = [];
    for (let n = el, d = 0; n && n.nodeType === 1 && d < 3; n = n.parentElement, d++) {
      let part = n.localName;
      const role = n.getAttribute("role");
      if (role) part += `[role=${role}]`;
      const label = n.getAttribute("aria-label");
      if (label) part += `[aria-label="${label.slice(0, 40)}"]`;
      const data = [...n.attributes].find((a) => a.name.startsWith("data-") && !a.name.startsWith("data-state"));
      if (data) part += `[${data.name}]`;
      if (!d && typeof n.className === "string" && n.className) part += `.${n.className.trim().split(/\s+/).slice(0, 4).join(".")}`;
      parts.unshift(part);
      if (label) break;
    }
    return parts.join(" > ");
  };
  const progress = (el) => el instanceof Element && !!el.closest('[role="progressbar"], progress, [data-progress], [data-loading-bar]');
  const duration = (text) => Math.max(0, ...String(text).split(",").map((v) => (v.trim().endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000) || 0));
  document.addEventListener("transitionrun", (e) => {
    const s = getComputedStyle(e.target);
    log.push({ kind: "transition", name: e.propertyName, target: describe(e.target), ms: duration(s.transitionDuration), progress: progress(e.target), route: location.hash });
  }, true);
  document.addEventListener("animationstart", (e) => {
    const s = getComputedStyle(e.target);
    log.push({ kind: "animation", name: e.animationName, target: describe(e.target), ms: duration(s.animationDuration), progress: progress(e.target), route: location.hash });
  }, true);
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const ms = typeof options === "number" ? options : Number(options?.duration ?? 0);
    log.push({ kind: "web-animation", name: options?.id ?? "", target: describe(this), ms, progress: progress(this), route: location.hash });
    return animate.call(this, keyframes, options);
  };
  if (document.startViewTransition) {
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      log.push({ kind: "view-transition", name: "", target: "document", ms: null, progress: false, route: location.hash });
      return start(...args);
    };
  }
}
