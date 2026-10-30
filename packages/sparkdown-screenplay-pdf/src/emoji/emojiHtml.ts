import EmojiSvgProvider from "./EmojiSvgProvider";

export interface EmojiHtmlInliner {
  inline(html: string): string;
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
