import { SparkdownCompiler } from "./classes/SparkdownCompiler";
import { profile } from "./utils/profile";

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
        const uri = "";
        profile("start", method, uri);
        const result = compiler.configure(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile("end", method, uri);
      }
      if (method === "compiler/addFile") {
        const uri = params.file.uri;
        profile("start", method, uri);
        const result = compiler.addFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile("end", method, uri);
      }
      if (method === "compiler/updateFile") {
        const uri = params.file.uri;
        profile("start", method, uri);
        const result = compiler.updateFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile("end", method, uri);
      }
      if (method === "compiler/updateDocument") {
        const uri = params.textDocument.uri;
        profile("start", method, uri);
        const result = compiler.updateDocument(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile("end", method, uri);
      }
      if (method === "compiler/removeFile") {
        const uri = params.file.uri;
        profile("start", method, uri);
        const result = compiler.removeFile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile("end", method, uri);
      }
      if (method === "compiler/compile") {
        const uri = params.uri;
        profile("start", method, uri);
        const result = compiler.compile(params);
        postMessage({ jsonrpc: "2.0", method, id, result });
        profile("end", method, uri);
      }
    }
  }
};
