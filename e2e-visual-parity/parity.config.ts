import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

/**
 * The two stacks under comparison. Dedicated ports (8090/8091) so the harness
 * never collides with the dev servers commonly running on 8080/8081.
 *
 *   baseline = ../impower (web components, `main`)
 *   port     = this repo's impower-dev (Preact)
 *
 * Both are served as production builds via `node ./out/api/index.js`
 * (`npm run start`), which reads `PORT` from the environment.
 */
export const BASELINE = {
  name: "baseline" as const,
  cwd: path.resolve(repoRoot, "../impower/impower-dev"),
  port: 8090,
  origin: "http://localhost:8090",
};

export const PORT = {
  name: "port" as const,
  cwd: path.resolve(repoRoot, "impower-dev"),
  port: 8091,
  origin: "http://localhost:8091",
};

export type Stack = typeof BASELINE | typeof PORT;
export const STACKS: Stack[] = [BASELINE, PORT];

/** Desktop viewport (the default gated layout). */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
/** Mobile viewport (<960px) — the collapsed single-pane layout where the
 *  preview-toggle button and other responsive-only chrome appear. */
export const MOBILE_VIEWPORT = { width: 390, height: 844 };

/** Context options shared by both A/B contexts (mirrors playwright.config `use`). */
export const CONTEXT_OPTS = {
  viewport: DESKTOP_VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: "dark" as const,
  reducedMotion: "reduce" as const,
  forcedColors: "none" as const,
  locale: "en-US",
  timezoneId: "UTC",
  // Block the service worker: pages/index.ts reloads the page on the SW
  // `controllerchange`, which races our seeding reload (frame detached) and
  // adds cache nondeterminism. The app works fine without it.
  serviceWorkers: "block" as const,
};

/** Default pixel-diff gates (§7). */
export const PIXEL = {
  /** pixelmatch per-pixel sensitivity — 0.1 tolerates AA/sub-pixel font rendering. */
  threshold: 0.1,
  includeAA: false,
  /** default per-checkpoint mismatch-ratio gate (0.5% of unmasked pixels). */
  maxDiffRatio: 0.005,
};

/** Base computed-style property set read for every probe (§8). */
export const BASE_PROPS = [
  "display", "position", "boxSizing",
  "width", "height", "minWidth", "minHeight",
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "flexDirection", "flexBasis", "flexGrow", "flexShrink",
  "alignItems", "justifyContent", "gap",
  "color", "backgroundColor", "opacity",
  "fontFamily", "fontSize", "fontWeight", "lineHeight",
  "letterSpacing", "textAlign", "textTransform",
  // All four border widths — a left/right/bottom-only change (e.g. an
  // outline-thickness regression) hides if we read only the top edge.
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderColor", "borderStyle", "borderRadius",
  "boxShadow", "transform", "zIndex", "overflow",
];

/** Where per-checkpoint artifacts land. */
export const REPORT_DIR = path.resolve(here, "report");
export const ARTIFACTS_DIR = path.resolve(REPORT_DIR, "artifacts");
