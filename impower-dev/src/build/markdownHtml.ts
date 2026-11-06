import fs from "fs";
import { marked } from "marked";

const SUFFIX = "?html";

type PluginContext = {
  resolve(
    source: string,
    importer: string | undefined,
    options: { skipSelf: boolean },
  ): Promise<{ id: string } | null>;
  addWatchFile(id: string): void;
};

export const renderMarkdown = (markdown: string): string =>
  marked.parse(markdown, { async: false, gfm: true });

export const markdownHtmlPlugin = () => ({
  name: "impower-markdown-html",
  enforce: "pre" as const,
  async resolveId(
    this: PluginContext,
    source: string,
    importer: string | undefined,
  ) {
    if (!source.endsWith(`.md${SUFFIX}`)) return null;
    const resolved = await this.resolve(
      source.slice(0, -SUFFIX.length),
      importer,
      { skipSelf: true },
    );
    return resolved ? `${resolved.id}${SUFFIX}` : null;
  },
  load(this: PluginContext, id: string) {
    if (!id.endsWith(`.md${SUFFIX}`)) return null;
    const file = id.slice(0, -SUFFIX.length);
    this.addWatchFile(file);
    const html = renderMarkdown(fs.readFileSync(file, "utf8"));
    return `export default ${JSON.stringify(html)};`;
  },
});
