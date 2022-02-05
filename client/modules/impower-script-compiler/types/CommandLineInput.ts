export interface CommandLineInput {
  isHelp: boolean;
  isExit: boolean;
  choiceInput: number;
  debugSource: number;
  debugPathLookup: string;
  userImmediateModeStatement: unknown;
}
