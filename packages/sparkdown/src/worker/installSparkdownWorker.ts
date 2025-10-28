import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseError } from "@impower/jsonrpc/src/types/ResponseError";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import { AddCompilerFileMessage } from "../compiler/classes/messages/AddCompilerFileMessage";
import { CompileProgramMessage } from "../compiler/classes/messages/CompileProgramMessage";
import { CompilerInitializedMessage } from "../compiler/classes/messages/CompilerInitializedMessage";
import { CompilerInitializeMessage } from "../compiler/classes/messages/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "../compiler/classes/messages/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "../compiler/classes/messages/RemoveCompilerFileMessage";
import { SelectCompilerDocumentMessage } from "../compiler/classes/messages/SelectCompilerDocumentMessage";
import { UpdateCompilerDocumentMessage } from "../compiler/classes/messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "../compiler/classes/messages/UpdateCompilerFileMessage";
import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import { profile } from "../compiler/utils/profile";

export function installSparkdownWorker() {
  console.log("running sparkdown-compiler");

  const state = { compiler: new SparkdownCompiler() };

  const respond = <MessageMethod extends string, MessageParams, MessageResult>(
    message: RequestMessage<MessageMethod, MessageParams, MessageResult>,
    work: () => MessageResult,
    transfer?: (result: MessageResult) => ArrayBuffer | undefined
  ): void => {
    const method = message.method;
    const id = message.id;
    profile("start", state.compiler.profilerId, method);
    let result: MessageResult | undefined = undefined;
    let error: ResponseError | undefined = undefined;
    try {
      result = work?.();
    } catch (e) {
      if (typeof e === "object" && e) {
        if ("message" in e) {
          error = e as ResponseError;
        }
      }
    }
    profile("start", state.compiler.profilerId, "respond " + method);
    const transferable = result != null ? transfer?.(result) : undefined;
    const options = transferable ? [transferable] : {};
    const response: ResponseMessage<MessageMethod, MessageResult> = {
      jsonrpc: "2.0",
      method,
      id,
    };
    if (result !== undefined) {
      response.result = result;
    }
    if (error !== undefined) {
      response.error = error;
    }
    postMessage(response, options);
    profile("end", state.compiler.profilerId, "respond " + method);
    profile("end", state.compiler.profilerId, method);
  };

  const notify = <MessageMethod extends string, MessageParams>(
    messageType: MessageProtocolNotificationType<MessageMethod, MessageParams>,
    params: MessageParams
  ): void => {
    const notification = messageType.notification(params);
    postMessage(notification);
  };

  self.addEventListener("message", (e: MessageEvent) => {
    const message: {
      jsonrpc: string;
      method: string;
      id: number | string | null;
      params: any;
    } = e.data;
    if (message) {
      if (CompilerInitializeMessage.type.is(message)) {
        const { profilerId } = message.params;
        state.compiler.profilerId = profilerId;
        respond(message, () => ({}));
        notify(CompilerInitializedMessage.type, {});
      }
      if (ConfigureCompilerMessage.type.is(message)) {
        respond(message, () => state.compiler.configure(message.params));
      }
      if (AddCompilerFileMessage.type.is(message)) {
        respond(message, () => state.compiler.addFile(message.params));
      }
      if (UpdateCompilerFileMessage.type.is(message)) {
        respond(message, () => state.compiler.updateFile(message.params));
      }
      if (RemoveCompilerFileMessage.type.is(message)) {
        respond(message, () => state.compiler.removeFile(message.params));
      }
      if (UpdateCompilerDocumentMessage.type.is(message)) {
        respond(message, () => state.compiler.updateDocument(message.params));
      }
      if (CompileProgramMessage.type.is(message)) {
        respond(message, () => state.compiler.compile(message.params));
      }
      if (SelectCompilerDocumentMessage.type.is(message)) {
        respond(message, () => state.compiler.selectDocument(message.params));
      }
    }
  });
  return state;
}
