import { AddCompilerFileMessage } from "../compiler/classes/messages/AddCompilerFileMessage";
import { CompileProgramMessage } from "../compiler/classes/messages/CompileProgramMessage";
import { CompilerInitializedMessage } from "../compiler/classes/messages/CompilerInitializedMessage";
import { CompilerInitializeMessage } from "../compiler/classes/messages/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "../compiler/classes/messages/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "../compiler/classes/messages/RemoveCompilerFileMessage";
import { UpdateCompilerDocumentMessage } from "../compiler/classes/messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "../compiler/classes/messages/UpdateCompilerFileMessage";
import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import { profile } from "../compiler/utils/profile";

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
      if (method === CompilerInitializeMessage.method) {
        const uri = "";
        respond(method, id, uri, () => ({}));
        respond(CompilerInitializedMessage.method);
      }
      if (method === ConfigureCompilerMessage.method) {
        const uri = "";
        respond(method, id, uri, () => compiler.configure(params));
      }
      if (method === AddCompilerFileMessage.method) {
        const uri = params.file.uri;
        respond(method, id, uri, () => compiler.addFile(params));
      }
      if (method === UpdateCompilerFileMessage.method) {
        const uri = params.file.uri;
        respond(method, id, uri, () => compiler.updateFile(params));
      }
      if (method === RemoveCompilerFileMessage.method) {
        const uri = params.file.uri;
        respond(method, id, uri, () => compiler.removeFile(params));
      }
      if (method === UpdateCompilerDocumentMessage.method) {
        const uri = params.textDocument.uri;
        respond(method, id, uri, () => compiler.updateDocument(params));
      }
      if (method === CompileProgramMessage.method) {
        const uri = params.uri;
        respond(method, id, uri, () => compiler.compile(params));
      }
    }
  }
};

export default "";
