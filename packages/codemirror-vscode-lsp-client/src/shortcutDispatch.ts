const DISPATCH: unique symbol = Symbol.for("impower.shortcutDispatch");

export interface EditorShortcutDispatch {
  handled?: string;
}

type Dispatched = { [DISPATCH]?: EditorShortcutDispatch };

export function noteEditorKeydown(event: Event): void {
  const marked = event as Event & Dispatched;
  marked[DISPATCH] ??= {};
}

export function noteShortcutHandled(event: Event, id: string): void {
  const marked = event as Event & Dispatched;
  const dispatch = (marked[DISPATCH] ??= {});
  dispatch.handled ??= id;
}

export function editorShortcutDispatch(
  event: object,
): EditorShortcutDispatch | undefined {
  return (event as Dispatched)[DISPATCH];
}
