import SparkdownCompiler from "./classes/SparkdownCompiler";

const compiler = new SparkdownCompiler();

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
        const result = compiler.configure(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
      if (method === "compiler/addFile") {
        const uri = params.uri;
        const file = params.file;
        const result = compiler.addFile(uri, file);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
      if (method === "compiler/updateFile") {
        const uri = params.uri;
        const file = params.file;
        const result = compiler.updateFile(uri, file);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
      if (method === "compiler/removeFile") {
        const uri = params.uri;
        const result = compiler.removeFile(uri);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
      if (method === "compiler/compile") {
        const uri = params.uri;
        const result = compiler.compile(uri);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
    }
  }
};
