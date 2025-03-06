import { SparkdownCompiler } from "./classes/SparkdownCompiler";
import { profile } from "./utils/profile";

console.log("running sparkdown-compiler");

const compiler = new SparkdownCompiler();

const respond = <T>(
  method: string,
  id?: string | number | null,
  uri?: string,
  work?: () => T,
  transfer?: (result: T) => ArrayBuffer | undefined
) => {
  profile("start", method, uri);
  const result = work?.();
  profile("start", "send " + method, uri);
  const transferable = result != null ? transfer?.(result) : undefined;
  const options = transferable ? [transferable] : {};
  const message: {
    jsonrpc: "2.0";
    method: string;
    id?: string | number;
    result?: T;
  } = { jsonrpc: "2.0", method };
  if (id && result) {
    message.id = id;
    message.result = result;
  }
  postMessage(message, options);
  profile("end", "send " + method, uri);
  profile("end", method, uri);
  return result;
};

respond("compiler/initialized");

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
        respond(method, id, uri, () => compiler.configure(params));
      }
      if (method === "compiler/addFile") {
        const uri = params.file.uri;
        respond(method, id, uri, () => compiler.addFile(params));
      }
      if (method === "compiler/updateFile") {
        const uri = params.file.uri;
        respond(method, id, uri, () => compiler.updateFile(params));
      }
      if (method === "compiler/updateDocument") {
        const uri = params.textDocument.uri;
        respond(method, id, uri, () => compiler.updateDocument(params));
      }
      if (method === "compiler/removeFile") {
        const uri = params.file.uri;
        respond(method, id, uri, () => compiler.removeFile(params));
      }
      if (method === "compiler/compile") {
        const uri = params.uri;
        respond(method, id, uri, () => compiler.compile(params));
      }
    }
  }
};
