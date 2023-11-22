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
  let triggerCharacter = line.text[context.pos - line.from - 1]!;
  if (
    context.explicit &&
    serverCapabilities?.completionProvider?.triggerCharacters?.includes(
      context.state.lineBreak
    ) &&
    !triggerCharacter?.trim()
  ) {
    // Handle startCompletion from onEnterRules
    triggerKind = CompletionTriggerKind.TriggerCharacter;
    triggerCharacter = context.state.lineBreak;
  } else if (
    !context.explicit &&
    serverCapabilities?.completionProvider?.triggerCharacters?.includes(
      triggerCharacter
    )
  ) {
    //
    triggerKind = CompletionTriggerKind.TriggerCharacter;
  }
  if (
    triggerKind === CompletionTriggerKind.Invoked &&
    !context.matchBefore(/\w+$/)
  ) {
    return null;
  }
  return { triggerKind, triggerCharacter };
};
