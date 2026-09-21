import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { AddCompilerFileMessage } from "../compiler/classes/messages/AddCompilerFileMessage";
import { CompileProgramMessage } from "../compiler/classes/messages/CompileProgramMessage";
import { PreviewCompileProgramMessage } from "../compiler/classes/messages/PreviewCompileProgramMessage";
import { CompilerInitializedMessage } from "../compiler/classes/messages/CompilerInitializedMessage";
import { CompilerInitializeMessage } from "../compiler/classes/messages/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "../compiler/classes/messages/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "../compiler/classes/messages/RemoveCompilerFileMessage";
import { SelectCompilerDocumentMessage } from "../compiler/classes/messages/SelectCompilerDocumentMessage";
import { UpdateCompilerDocumentMessage } from "../compiler/classes/messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "../compiler/classes/messages/UpdateCompilerFileMessage";
import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../compiler/types/SparkProgram";
import { programSummary } from "../compiler/utils/programSummary";
import { ProgramTransportEncoder } from "../workspace/utils/programTransport";

export interface SparkdownWorkerOptions {
  /** Whether to answer compiles, preview compiles and selections as a host
   *  that leaves each program in this worker expects: the program's summary
   *  (`programSummary`) and no checkpoint. A compile that asks for its
   *  program to be emitted is answered in full. */
  summarize?: () => boolean;
}

export function installSparkdownWorker(
  connection: MessageConnection,
  options: SparkdownWorkerOptions = {},
) {
  console.log("running sparkdown-compiler v1.0");

  const state = { compiler: new SparkdownCompiler() };
  // Pairs with the decoder in the SparkdownWorkspace on the other end of this
  // connection. Programs are encoded as their responses are sent, which is the
  // order the workspace receives and decodes them. A summary is not encoded,
  // and the workspace does not decode one.
  const transport = new ProgramTransportEncoder();
  // Whether the compile being answered produced a story, which a summary
  // reports in place of the compiled program.
  let producedStory = false;
  const noteStory = (params: { story?: unknown }) => {
    producedStory = params.story != null;
  };
  state.compiler.addEventListener("compiler/didCompile", noteStory);
  state.compiler.addEventListener("compiler/didPreviewCompile", noteStory);
  const answer = <R extends { program?: SparkProgram; checkpoint?: string }>(
    result: R,
    emit: boolean | undefined,
  ): R => {
    if (!result.program) {
      return result;
    }
    if (options.summarize?.() && !emit) {
      const { checkpoint: _checkpoint, ...rest } = result;
      return {
        ...rest,
        program: programSummary(result.program, producedStory),
      } as R;
    }
    return { ...result, program: transport.encode(result.program) };
  };

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
          state.compiler.configure(message.params),
        );
        return;
      }
      if (AddCompilerFileMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.addFile(message.params),
        );
        return;
      }
      if (UpdateCompilerFileMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.updateFile(message.params),
        );
        return;
      }
      if (RemoveCompilerFileMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.removeFile(message.params),
        );
        return;
      }
      if (UpdateCompilerDocumentMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          state.compiler.updateDocument(message.params),
        );
      }
      if (CompileProgramMessage.type.is(message)) {
        connection.sendResponse(message, () => {
          producedStory = false;
          const result = state.compiler.compile(message.params);
          return answer(result, message.params.emitCompiledProgram);
        });
        return;
      }
      if (PreviewCompileProgramMessage.type.is(message)) {
        connection.sendResponse(message, () => {
          producedStory = false;
          const result = state.compiler.previewCompile(message.params);
          return answer(result, false);
        });
        return;
      }
      if (SelectCompilerDocumentMessage.type.is(message)) {
        connection.sendResponse(message, () => {
          const result = state.compiler.selectDocument(message.params);
          if (options.summarize?.()) {
            const { checkpoint: _checkpoint, ...rest } = result;
            return rest;
          }
          return result;
        });
        return;
      }
    }
  });

  return state;
}
