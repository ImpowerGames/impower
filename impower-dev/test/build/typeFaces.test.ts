import { compile, optimize } from "@tailwindcss/node";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "../../src/public");
const IMPOWER_UI_SRC = path.resolve(HERE, "../../../packages/impower-ui/src");
const DOCUMENT_CSS = fs.readFileSync(path.join(PUBLIC, "document.css"), "utf-8");
const DOCUMENT_HTML = fs.readFileSync(path.join(PUBLIC, "document.html"), "utf-8");
const STYLE_CSS = fs.readFileSync(path.join(IMPOWER_UI_SRC, "style.css"), "utf-8");
const THEME_CSS = fs.readFileSync(path.join(IMPOWER_UI_SRC, "theme.css"), "utf-8");

type Face = Record<string, string>;

const faces = (): Face[] =>
  [...DOCUMENT_CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) =>
    Object.fromEntries(
      m[1]!
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const i = d.indexOf(":");
          return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
        }),
    ),
  );

const family = (name: string) =>
  faces().filter((f) => f["font-family"] === `"${name}"`);

const urls = (face: Face) =>
  [...(face["src"] ?? "").matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]!);

const utilities = async (candidates: string[]) => {
  const compiler = await compile(STYLE_CSS, {
    base: IMPOWER_UI_SRC,
    onDependency: () => {},
  });
  return optimize(compiler.build(candidates), { minify: false }).code;
};

describe("font stylesheet", () => {
  it("points every declared face at a file on disk", () => {
    const sources = faces().flatMap(urls);
    expect(sources.length).toBeGreaterThan(10);
    for (const src of sources) {
      expect(fs.existsSync(path.join(PUBLIC, src)), src).toBe(true);
    }
  });

  it("sets the interface in Open Sans with the tilde from Courier Prime Sans", () => {
    const ui = family("Folio UI");
    const open = ui.filter((f) => urls(f).some((u) => u.includes("open-sans")));
    expect(open.map((f) => f["font-weight"])).toEqual(["400", "600", "700"]);
    for (const f of open) {
      expect(f["unicode-range"]).toBe("U+0000-007D, U+007F-10FFFF");
    }
    const tilde = ui.filter((f) => f["unicode-range"] === "U+007E");
    expect(tilde.map((f) => [f["font-weight"], urls(f)[0]])).toEqual([
      ["400", "/fonts/courier-prime-sans.ttf"],
      ["600 700", "/fonts/courier-prime-sans-bold.ttf"],
    ]);
  });

  it("declares the four script faces and swaps every interface and script face", () => {
    const script = family("Courier Prime Sans");
    expect(script.map((f) => [f["font-style"] ?? "normal", f["font-weight"]])).toEqual([
      ["normal", "400"],
      ["normal", "600 700"],
      ["italic", "400"],
      ["italic", "600 700"],
    ]);
    for (const f of [...script, ...family("Folio UI")]) {
      expect(f["font-display"]).toBe("swap");
    }
  });

  it("metric-matches a local fallback for both families on Windows, macOS, Linux and ChromeOS", () => {
    const sources = {
      "Folio UI Fallback": ["Arial", "ArialMT", "Liberation Sans", "Arimo"],
      "Courier Prime Sans Fallback": [
        "Courier New",
        "CourierNewPSMT",
        "Liberation Mono",
        "Cousine",
      ],
    };
    for (const [name, locals] of Object.entries(sources)) {
      const [f] = family(name);
      expect(f?.["src"], name).toBe(locals.map((l) => `local("${l}")`).join(", "));
      expect(f?.["size-adjust"], name).toMatch(/%$/);
      expect(f?.["ascent-override"], name).toMatch(/%$/);
      expect(f?.["descent-override"], name).toMatch(/%$/);
    }
  });

  it("preloads every interface face from the origin", () => {
    for (const f of family("Folio UI").flatMap(urls)) {
      expect(DOCUMENT_HTML, f).toContain(`<link rel="preload" href="${f}"`);
    }
    expect(DOCUMENT_CSS + DOCUMENT_HTML).not.toMatch(/https?:\/\/[^"')]*font/i);
  });
});

describe("type utilities", () => {
  it("maps the families onto Tailwind's font utilities", async () => {
    const css = await utilities(["font-sans", "font-mono", "font-serif"]);
    expect(css).toMatch(/\.font-sans\s*\{\s*font-family:\s*var\(--font-ui\)/);
    expect(css).toMatch(/\.font-mono\s*\{\s*font-family:\s*var\(--font-script\)/);
    expect(css).toMatch(/\.font-serif\s*\{\s*font-family:\s*var\(--font-display\)/);
    expect(THEME_CSS).toMatch(/--font-ui:\s*"Folio UI", "Folio UI Fallback"/);
    expect(THEME_CSS).toMatch(
      /--font-script:\s*"Courier Prime Sans", "Courier Prime Sans Fallback"/,
    );
    expect(THEME_CSS).toMatch(/--font-display:\s*Georgia, "Times New Roman", serif/);
  });

  it("gives the eyebrow its size, leading, tracking and weight", async () => {
    const css = await utilities(["text-eyebrow"]);
    const rule = css.match(/\.text-eyebrow\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("font-size: 11px");
    expect(rule).toContain("line-height: var(--tw-leading, 1.5)");
    expect(rule).toContain("letter-spacing: var(--tw-tracking, .12em)");
    expect(rule).toContain("font-weight: var(--tw-font-weight, 700)");
  });
});

describe("script size", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    delete document.documentElement.dataset["layout"];
  });

  it("is 18px on the desktop layout and 16px otherwise, at 1.5", () => {
    const style = document.createElement("style");
    style.textContent = THEME_CSS;
    document.head.append(style);
    const root = document.documentElement;
    const read = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
    for (const [layout, size] of [
      ["desktop", "18px"],
      ["compact", "16px"],
      ["phone", "16px"],
    ] as const) {
      root.dataset["layout"] = layout;
      expect(read("--script-size"), layout).toBe(size);
      expect(read("--script-leading"), layout).toBe("1.5");
    }
  });
});
