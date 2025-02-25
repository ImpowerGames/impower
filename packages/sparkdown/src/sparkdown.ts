import { SparkdownCompiler } from "./classes/SparkdownCompiler";
import { SparkProgram } from "./types/SparkProgram";
import { profile } from "./utils/profile";

const compiler = new SparkdownCompiler();

const doWork = <T>(
  method: string,
  id: string | number | null,
  uri: string,
  work: () => T,
  transfer?: (result: T) => ArrayBuffer | undefined
) => {
  profile("start", method, uri);
  const result = work();
  profile("start", "send " + method, uri);
  const transferable = transfer?.(result);
  const options = transferable ? [transferable] : {};
  postMessage({ jsonrpc: "2.0", method, id, result }, options);
  profile("end", "send " + method, uri);
  profile("end", method, uri);
  return result;
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
        doWork(method, id, uri, () => compiler.configure(params));
      }
      if (method === "compiler/addFile") {
        const uri = params.file.uri;
        doWork(method, id, uri, () => compiler.addFile(params));
      }
      if (method === "compiler/updateFile") {
        const uri = params.file.uri;
        doWork(method, id, uri, () => compiler.updateFile(params));
      }
      if (method === "compiler/updateDocument") {
        const uri = params.textDocument.uri;
        doWork(method, id, uri, () => compiler.updateDocument(params));
      }
      if (method === "compiler/removeFile") {
        const uri = params.file.uri;
        doWork(method, id, uri, () => compiler.removeFile(params));
      }
      if (method === "compiler/compile") {
        const uri = params.uri;
        doWork(
          method,
          id,
          uri,
          () => compiler.compile(params),
          (program: SparkProgram) => program.compiled
        );
      }
    }
  }
};
