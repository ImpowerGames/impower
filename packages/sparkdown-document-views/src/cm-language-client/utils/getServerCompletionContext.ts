import { CompletionContext as ClientCompletionContext } from "@codemirror/autocomplete";
import { historyField } from "@codemirror/commands";
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
  let triggerCharacter = line.text[context.pos - line.from - 1];
  const historyState = context.state.field<{ prevUserEvent: string }>(
    historyField
  );
  if (
    context.explicit &&
    serverCapabilities?.completionProvider?.triggerCharacters?.includes(
      context.state.lineBreak
    ) &&
    historyState.prevUserEvent === "input"
  ) {
    // Handle startCompletion from onEnterRules
    triggerKind = CompletionTriggerKind.TriggerCharacter;
    triggerCharacter = context.state.lineBreak;
  } else if (
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
