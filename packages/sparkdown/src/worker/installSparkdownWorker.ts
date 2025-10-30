import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
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

export function installSparkdownWorker(connection: MessageConnection) {
  console.log("running sparkdown-compiler");

  const state = { compiler: new SparkdownCompiler() };

  connection.addEventListener("message", (e: MessageEvent) => {
    const message = e.data;
    if (message) {
      if (CompilerInitializeMessage.type.is(message)) {
        const { profilerId } = message.params;
        state.compiler.profilerId = profilerId;
        connection.sendResponse(message, {});
        connection.sendNotification(CompilerInitializedMessage.type, {});
        return;
      }
      if (ConfigureCompilerMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.configure(message.params)
        );
        return;
      }
      if (AddCompilerFileMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.addFile(message.params)
        );
        return;
      }
      if (UpdateCompilerFileMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.updateFile(message.params)
        );
        return;
      }
      if (RemoveCompilerFileMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.removeFile(message.params)
        );
        return;
      }
      if (UpdateCompilerDocumentMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.updateDocument(message.params)
        );
      }
      if (CompileProgramMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.compile(message.params)
        );
        return;
      }
      if (SelectCompilerDocumentMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.selectDocument(message.params)
        );
        return;
      }
    }
  });

  return state;
}
