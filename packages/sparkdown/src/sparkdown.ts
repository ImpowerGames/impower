import { SparkdownCompiler } from "./classes/SparkdownCompiler";

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
        const result = compiler.addFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
      if (method === "compiler/updateFile") {
        const result = compiler.updateFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
      if (method === "compiler/updateDocument") {
        const result = compiler.updateDocument(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
      if (method === "compiler/removeFile") {
        const result = compiler.removeFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
      if (method === "compiler/compile") {
        const result = compiler.compile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
      }
    }
  }
};
