import { SparkdownCompiler } from "./classes/SparkdownCompiler";

const compiler = new SparkdownCompiler();

const profile = (method: string, uri: string, mark: "start" | "end") => {
  if (mark === "end") {
    performance.mark(`${method} ${uri} end`);
    performance.measure(
      `${method} ${uri}`,
      `${method} ${uri} start`,
      `${method} ${uri} end`
    );
  } else {
    performance.mark(`${method} ${uri} start`);
  }
};

onmessage = async (e) => {
  const message: {
    jsonrpc: string;
    method: string;
    id: number | string | null;
    params: any;
  } = e.data;
  if (message) {
    const method = message.method;
    const params = message.params;
    const id = message.id;
    if (params) {
      if (method === "compiler/configure") {
        const uri = "";
        profile(method, uri, "start");
        const result = compiler.configure(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile(method, uri, "end");
      }
      if (method === "compiler/addFile") {
        const uri = params.file.uri;
        profile(method, uri, "start");
        const result = compiler.addFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile(method, uri, "end");
      }
      if (method === "compiler/updateFile") {
        const uri = params.file.uri;
        profile(method, uri, "start");
        const result = compiler.updateFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile(method, uri, "end");
      }
      if (method === "compiler/updateDocument") {
        const uri = params.textDocument.uri;
        profile(method, uri, "start");
        const result = compiler.updateDocument(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile(method, uri, "end");
      }
      if (method === "compiler/removeFile") {
        const uri = params.file.uri;
        profile(method, uri, "start");
        const result = compiler.removeFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile(method, uri, "end");
      }
      if (method === "compiler/compile") {
        const uri = params.uri;
        profile(method, uri, "start");
        const result = compiler.compile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile(method, uri, "end");
      }
    }
  }
};
