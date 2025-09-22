import { CompletionContext as ClientCompletionContext } from "@codemirror/autocomplete";
import { CompletionTriggerKind } from "@impower/spark-editor-protocol/src/enums/CompletionTriggerKind";
import {
  ServerCapabilities,
  CompletionContext as ServerCompletionContext,
} from "@impower/spark-editor-protocol/src/types";

export const getServerCompletionContext = (
  serverCapabilities: ServerCapabilities<any> | undefined,
  context: ClientCompletionContext
): ServerCompletionContext | null => {
  const line = context.state.doc.lineAt(context.pos);
  let triggerKind: CompletionTriggerKind = CompletionTriggerKind.Invoked;
  let triggerCharacter = line.text[context.pos - line.from - 1];
  if (
    !context.explicit &&
    triggerCharacter &&
    serverCapabilities?.completionProvider?.triggerCharacters?.includes(
      triggerCharacter
    )
  ) {
    triggerKind = CompletionTriggerKind.TriggerCharacter;
  }
  if (triggerKind === CompletionTriggerKind.Invoked) {
    triggerCharacter = undefined;
  }
  return { triggerKind, triggerCharacter };
};
