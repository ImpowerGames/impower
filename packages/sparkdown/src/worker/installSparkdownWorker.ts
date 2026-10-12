import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { AddCompilerFileMessage } from "../compiler/classes/messages/AddCompilerFileMessage";
import { CompileProgramMessage } from "../compiler/classes/messages/CompileProgramMessage";
import { PreviewCompileProgramMessage } from "../compiler/classes/messages/PreviewCompileProgramMessage";
import { CompilerInitializedMessage } from "../compiler/classes/messages/CompilerInitializedMessage";
import { CompilerInitializeMessage } from "../compiler/classes/messages/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "../compiler/classes/messages/ConfigureCompilerMessage";
import { LocateProgramMessage } from "../compiler/classes/messages/LocateProgramMessage";
import { RemoveCompilerFileMessage } from "../compiler/classes/messages/RemoveCompilerFileMessage";
import { SelectCompilerDocumentMessage } from "../compiler/classes/messages/SelectCompilerDocumentMessage";
import { UpdateCompilerDocumentMessage } from "../compiler/classes/messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "../compiler/classes/messages/UpdateCompilerFileMessage";
import { SparkdownCompiler } from "../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../compiler/types/SparkProgram";
import { answerLocateQueries } from "../compiler/utils/programLocator";
import { programSummary } from "../compiler/utils/programSummary";
import { ProgramTransportEncoder } from "../workspace/utils/programTransport";

export interface SparkdownWorkerOptions {
  /** Answer compiles, preview compiles and selections as a host that leaves
   *  each program in this worker expects: the program's summary
   *  (`programSummary`) and no checkpoint. */
  summarize?: boolean;
}

export function installSparkdownWorker(
  connection: MessageConnection,
  options: SparkdownWorkerOptions = {},
) {
  console.log("running sparkdown-compiler v1.0");

  // Pairs with the decoder in the SparkdownWorkspace on the other end of this
  // connection. Programs are encoded as their responses are sent, which is the
  // order the workspace receives and decodes them. A summary is not encoded,
  // and the workspace does not decode one. `encodeProgram` is for a response
  // sent on this connection that carries a whole program the compiler did not
  // answer itself.
  const transport = new ProgramTransportEncoder();
  const state = {
    compiler: new SparkdownCompiler(),
    encodeProgram: (program: SparkProgram) => transport.encode(program),
  };
  // Whether the compile being answered produced a program that runs (its
  // statement chunks), which a summary reports in place of the compiled
  // program.
  let producedStory = false;
  // The last program compiled for each uri, which a host holding the
  // program's copy asks for its locations (`LocateProgramMessage`): the copy
  // leaves the statement chunks' root behind, by which a program compiled
  // with them is located. A preview compile's program is not kept.
  const compiledPrograms = new Map<string, SparkProgram>();
  const noteStory = (params: { produced: boolean }) => {
    producedStory = params.produced;
  };
  state.compiler.addEventListener("compiler/didCompile", noteStory);
  state.compiler.addEventListener("compiler/didPreviewCompile", noteStory);
  const answer = <R extends { program?: SparkProgram; checkpoint?: string }>(
    result: R,
  ): R => {
    if (!result.program) {
      return result;
    }
    if (options.summarize) {
      const { checkpoint: _checkpoint, ...rest } = result;
      return {
        ...rest,
        program: programSummary(result.program, producedStory),
      } as R;
    }
    return { ...result, program: state.encodeProgram(result.program) };
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
        connection.sendResponse(message, () => {
          const result = state.compiler.configure(message.params);
          // A configuration can replace the project's scripts: the programs
          // of scripts it no longer holds go with them.
          for (const uri of [...compiledPrograms.keys()]) {
            if (!state.compiler.documents.has(uri)) {
              compiledPrograms.delete(uri);
            }
          }
          return result;
        });
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
        // A removed script's program, and its root, go with it.
        compiledPrograms.delete(message.params.file.uri);
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
          if (result.program?.uri) {
            compiledPrograms.set(result.program.uri, result.program);
          }
          return answer(result);
        });
        return;
      }
      if (PreviewCompileProgramMessage.type.is(message)) {
        connection.sendResponse(message, () => {
          producedStory = false;
          const result = state.compiler.previewCompile(message.params);
          return answer(result);
        });
        return;
      }
      if (LocateProgramMessage.type.is(message)) {
        connection.sendResponse(message, () =>
          answerLocateQueries(
            compiledPrograms.get(message.params.program),
            message.params.queries,
          ),
        );
        return;
      }
      if (SelectCompilerDocumentMessage.type.is(message)) {
        connection.sendResponse(message, () => {
          const result = state.compiler.selectDocument(message.params);
          if (options.summarize) {
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
