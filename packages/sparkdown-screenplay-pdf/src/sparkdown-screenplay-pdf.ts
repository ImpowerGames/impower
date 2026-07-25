import ScreenplayParser from "@impower/sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayHtmlData } from "@impower/sparkdown-screenplay/src/utils/generateScreenplayHtmlData";
import { buildPDF } from "./buildPDF";
import { createEmojiHtmlInliner } from "./emoji/emojiHtml";
export { buildPDF };

onmessage = async (e) => {
  const message = e.data;
  if (message) {
    const method = message.method;
    const params = message.params;
    const id = message.id;
    if (params) {
      const scripts = params.scripts;
      const config = params.config;
      const fonts = params.fonts;
      const workDoneToken = params.workDoneToken;
      if (scripts && fonts) {
        const onProgress = (value: {
          kind: string;
          title: string;
          cancellable: boolean;
          message?: string;
          percentage?: number;
        }) => {
          postMessage({
            jsonrpc: "2.0",
            method: `${method}/progress`,
            params: {
              token: workDoneToken,
              value,
            },
          });
        };
        if (method === "workspace/exportHTML") {
          // Runs here (not on the main thread) so fontkit's Buffer shim is
          // available to embed only the emoji the script uses as inline SVG.
          try {
            const parser = new ScreenplayParser();
            const tokens = parser.parseAll(scripts);
            const emoji = fonts.emoji
              ? createEmojiHtmlInliner(fonts.emoji)
              : undefined;
            const html = generateScreenplayHtmlData(
              tokens,
              config,
              fonts,
              emoji,
            );
            postMessage({ jsonrpc: "2.0", method, id, result: html });
          } catch (err) {
            postMessage({
              jsonrpc: "2.0",
              method,
              id,
              error: {
                code: -32000,
                message: err instanceof Error ? err.message : String(err),
                data: err instanceof Error ? err.stack : undefined,
              },
            });
          }
        } else {
          const arrayBuffer = await buildPDF(
            scripts,
            config,
            fonts,
            onProgress,
          );
          postMessage({ jsonrpc: "2.0", method, id, result: arrayBuffer }, [
            arrayBuffer,
          ]);
        }
      }
    }
  }
};
