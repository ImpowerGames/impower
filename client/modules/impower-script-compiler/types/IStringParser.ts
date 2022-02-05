import { IStringParserState } from "./IStringParserState";

export interface IStringParser {
  currentCharacter: string;
  state: IStringParserState;
  hadError: boolean;
  endOfInput: boolean;
  remainingString: string;
  remainingLength: number;
  inputString: string;
  lineIndex: number;
  characterInLineIndex: number;
  index: number;
}
