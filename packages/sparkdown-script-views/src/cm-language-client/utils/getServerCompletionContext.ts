import { CompletionContext as ClientCompletionContext } from "@codemirror/autocomplete";
import { CompletionTriggerKind } from "../../../../spark-editor-protocol/src/enums/CompletionTriggerKind";
import {
  ServerCapabilities,
  CompletionContext as ServerCompletionContext,
} from "../../../../spark-editor-protocol/src/types";

export const getServerCompletionContext = (
  serverCapabilities: ServerCapabilities<any> | undefined,
  context: ClientCompletionContext
): ServerCompletionContext | null => {
  const line = context.state.doc.lineAt(context.pos);
  let triggerKind: CompletionTriggerKind = CompletionTriggerKind.Invoked;
  let triggerCharacter: string | undefined;
  if (
    !context.explicit &&
    serverCapabilities?.completionProvider?.triggerCharacters?.includes(
      line.text[context.pos - line.from - 1]!
    )
  ) {
    triggerKind = CompletionTriggerKind.TriggerCharacter;
    triggerCharacter = line.text[context.pos - line.from - 1];
  }
  if (
    triggerKind === CompletionTriggerKind.Invoked &&
    !context.matchBefore(/\w+$/)
  ) {
    return null;
  }
  return { triggerKind, triggerCharacter };
};
