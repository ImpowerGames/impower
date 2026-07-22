import EmojiSvgProvider from "./EmojiSvgProvider";

/**
 * Builds an HTML emoji inliner that embeds ONLY the emoji actually used by a
 * script, as vector SVG — the equivalent of a per-export font subset without
 * needing to subset the (color) font itself (fontkit can't subset COLR/SVG).
 *
 * Each unique emoji becomes one CSS rule carrying its own `data:` SVG document,
 * referenced by class, so a repeated emoji costs nothing extra. The real emoji
 * character stays in the DOM at `opacity:0` (invisible but still selectable and
 * copy-pasteable, and it reserves the correct width); our vector art is painted
 * on top via `::after`. `color:transparent` would NOT work here — color-emoji
 * fonts ignore `color` — but `opacity` applies to everything.
 */

export interface EmojiHtmlInliner {
  /** Replace emoji clusters in already-generated screenplay HTML. */
  inline(html: string): string;
  /** `<style>` block for the emoji used so far; "" if none. Call after inline. */
  styleAndDefs(): string;
}

let EMOJI_REGEX: RegExp | null = null;
try {
  EMOJI_REGEX = /\p{RGI_Emoji}/gv;
} catch {
  EMOJI_REGEX = null;
}

const BASE_CSS = `.spark-emoji{position:relative;display:inline-block;line-height:inherit;vertical-align:middle}
.spark-emoji>.spark-emoji-char{opacity:0}
.spark-emoji::after{content:"";position:absolute;inset:0;background-position:center;background-size:contain;background-repeat:no-repeat}`;

const svgToDataUrl = (svg: string): string =>
  // encodeURIComponent escapes ", #, <, > etc., so the result is safe inside a
  // double-quoted CSS url(). Gradient url(#id) parens survive (harmless in a
  // quoted string) and every emoji's SVG is its own document, so ids never clash.
  `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

export const createEmojiHtmlInliner = (
  fontData: ArrayBuffer | Uint8Array,
): EmojiHtmlInliner | undefined => {
  if (!EMOJI_REGEX) {
    return undefined;
  }
  let provider: EmojiSvgProvider;
  try {
    provider = new EmojiSvgProvider(fontData);
  } catch {
    return undefined;
  }
  if (!provider.hasSvg) {
    return undefined;
  }

  const usedCss = new Map<number, string>();

  const inline = (html: string): string => {
    EMOJI_REGEX!.lastIndex = 0;
    return html.replace(EMOJI_REGEX!, (cluster) => {
      const run = provider.getEmojiRun(cluster);
      // Only handle clusters that resolve to a single drawable glyph; leave
      // anything unusual as plain text (falls back to the OS emoji font).
      if (run.glyphs.length !== 1) {
        return cluster;
      }
      const g = run.glyphs[0]!;
      if (!g.svg) {
        return cluster;
      }
      if (!usedCss.has(g.id)) {
        usedCss.set(
          g.id,
          `.spark-emoji.se-${g.id}::after{background-image:${svgToDataUrl(g.svg)}}`,
        );
      }
      return `<span class="spark-emoji se-${g.id}"><span class="spark-emoji-char">${cluster}</span></span>`;
    });
  };

  const styleAndDefs = (): string => {
    if (usedCss.size === 0) {
      return "";
    }
    return `<style>\n${BASE_CSS}\n${[...usedCss.values()].join("\n")}\n</style>`;
  };

  return { inline, styleAndDefs };
};
