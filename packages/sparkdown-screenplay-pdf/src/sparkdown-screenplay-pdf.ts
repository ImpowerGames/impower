import { buildPDF } from "./buildPDF";
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
        const arrayBuffer = await buildPDF(scripts, config, fonts, onProgress);
        postMessage({ jsonrpc: "2.0", method, id, result: arrayBuffer }, [
          arrayBuffer,
        ]);
      }
    }
  }
};
