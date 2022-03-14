export interface FountainAction {
  /**
    The label to show to the user. Should be relatively short.
    */
  name: string;
  focus?: number;
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
