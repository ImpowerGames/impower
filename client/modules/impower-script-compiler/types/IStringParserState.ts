export interface IStringParserState {
  lineIndex: number;
  characterIndex: number;
  characterInLineIndex: number;
  customFlags: number;
  errorReportedAlreadyInScope: boolean;
  stackHeight: number;
}
