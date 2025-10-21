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
  profile("start", compiler.profilerId, method, uri);
  const result = work?.();
  profile("start", compiler.profilerId, "send " + method, uri);
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
  profile("end", compiler.profilerId, "send " + method, uri);
  profile("end", compiler.profilerId, method, uri);
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
    if (CompilerInitializeMessage.type.is(message)) {
      const { profilerId } = message.params;
      compiler.profilerId = profilerId;
      const uri = "";
      respond(message.method, message.id, uri, () => ({}));
      respond(CompilerInitializedMessage.method);
    }
    if (ConfigureCompilerMessage.type.is(message)) {
      const uri = "";
      respond(message.method, message.id, uri, () =>
        compiler.configure(message.params)
      );
    }
    if (AddCompilerFileMessage.type.is(message)) {
      const uri = message.params.file.uri;
      respond(message.method, message.id, uri, () =>
        compiler.addFile(message.params)
      );
    }
    if (UpdateCompilerFileMessage.type.is(message)) {
      const uri = message.params.file.uri;
      respond(message.method, message.id, uri, () =>
        compiler.updateFile(message.params)
      );
    }
    if (RemoveCompilerFileMessage.type.is(message)) {
      const uri = message.params.file.uri;
      respond(message.method, message.id, uri, () =>
        compiler.removeFile(message.params)
      );
    }
    if (UpdateCompilerDocumentMessage.type.is(message)) {
      const uri = message.params.textDocument.uri;
      respond(message.method, message.id, uri, () =>
        compiler.updateDocument(message.params)
      );
    }
    if (CompileProgramMessage.type.is(message)) {
      const uri = message.params.uri;
      respond(message.method, message.id, uri, () =>
        compiler.compile(message.params)
      );
    }
  }
};

export default "";
