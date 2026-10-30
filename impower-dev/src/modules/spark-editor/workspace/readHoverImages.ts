import { marked } from "marked";
import type { Hover } from "@impower/spark-editor-protocol/src/types";
import type { HoverResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/HoverMessage";

export async function readHoverImages(
  hover: Hover | null,
  resolveSrc: (uri: string) => Promise<string | undefined>,
  createImage: () => HTMLImageElement = () => new Image(),
): Promise<HoverResult | null> {
  if (!hover) return null;
  const parts = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
  const sources: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string" && ("language" in part || part.kind === "plaintext")) continue;
    const markdown = typeof part === "string" ? part : part.value;
    const template = document.createElement("template");
    template.innerHTML = marked.parse(markdown, { async: false });
    for (const image of template.content.querySelectorAll("img[src]")) {
      const source = image.getAttribute("src");
      if (source) sources.push(source);
    }
  }
  const images = await Promise.all(sources.map(async (source) => {
    const src = source.startsWith("file://") ? await resolveSrc(source) : source;
    if (!src) return { src: source, naturalWidth: 0, naturalHeight: 0, loaded: false };
    return new Promise<{ src: string; naturalWidth: number; naturalHeight: number; loaded: boolean }>((resolve) => {
      const image = createImage();
      const finish = (loaded: boolean) => {
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve({ src, naturalWidth: loaded ? image.naturalWidth : 0, naturalHeight: loaded ? image.naturalHeight : 0, loaded });
        if (!loaded) image.removeAttribute("src");
      };
      const timer = setTimeout(() => finish(false), 5000);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = src;
    });
  }));
  return { ...hover, images };
}
