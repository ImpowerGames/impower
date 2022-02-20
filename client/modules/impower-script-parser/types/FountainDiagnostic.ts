export interface FountainAction {
  /**
    The label to show to the user. Should be relatively short.
    */
  name: string;
  /**
    The function to call when the user activates this action. Is
    given the diagnostic's _current_ position, which may have
    changed since the creation of the diagnostic due to editing.
    */
  apply: (view: unknown, from: number, to: number) => void;
}

export interface FountainDiagnostic {
  /**
    The start position of the relevant text.
    */
  from: number;
  /**
    The end position. May be equal to `from`, though actually
    covering text is preferable.
    */
  to: number;
  /**
    The severity of the problem. This will influence how it is
    displayed.
    */
  severity: "info" | "warning" | "error";
  /**
    An optional source string indicating where the diagnostic is
    coming from. You can put the name of your linter here, if
    applicable.
    */
  source?: string;
  /**
    The message associated with this diagnostic.
    */
  message: string;
  /**
    An optional array of actions that can be taken on this
    diagnostic.
    */
  actions?: readonly FountainAction[];
}
