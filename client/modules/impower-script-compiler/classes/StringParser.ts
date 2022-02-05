import { StringBuilder } from "../../impower-script-engine";
import { ErrorHandler } from "../types/ErrorHandler";
import { IStringParser } from "../types/IStringParser";
import { ParseRule } from "../types/ParseRule";
import { SpecificParseRule } from "../types/SpecificParseRule";
import { CharacterSet } from "./CharacterSet";
import { ParsedObject } from "./ParsedHierarchy/ParsedObject";
import { StringParserElement } from "./StringParserElement";
import { StringParserState } from "./StringParserState";

export class StringParser implements IStringParser {
  static ParseSuccess: unknown = null;

  static numbersCharacterSet: CharacterSet = new CharacterSet("0123456789");

  state: StringParserState;

  hadError: boolean;

  inputString: string;

  protected errorHandler: ErrorHandler;

  private _chars: string;

  get currentCharacter(): string {
    if (this.index >= 0 && this.remainingLength > 0) {
      return this._chars[this.index];
    }
    return String.fromCharCode(0);
  }

  get endOfInput(): boolean {
    return this.index >= this._chars.length;
  }

  get remainingString(): string {
    return this._chars.substring(this.index);
  }

  get remainingLength(): number {
    return this._chars.length - this.index;
  }

  get lineIndex(): number {
    return this.state.lineIndex;
  }

  set lineIndex(value: number) {
    this.state.lineIndex = value;
  }

  get characterInLineIndex(): number {
    return this.state.characterInLineIndex;
  }

  set characterInLineIndex(value: number) {
    this.state.characterInLineIndex = value;
  }

  get index(): number {
    return this.state.characterIndex;
  }

  set index(value: number) {
    // If we want subclass parsers to be able to set the index directly,
    // then we would need to know what the lineIndex of the new
    // index would be - would we have to step through manually
    // counting the newlines to do so?
    this.state.characterIndex = value;
  }

  constructor(str?: string) {
    str = this.PreProcessInputString(str);

    this.state = new StringParserState();

    if (str || str === "") {
      this._chars = str;
    } else {
      this._chars = String.fromCharCode(0);
    }

    this.inputString = str;
  }

  // Don't do anything by default, but provide ability for subclasses
  // to manipulate the string before it's used as input (converted to a char array)
  protected PreProcessInputString(str: string): string {
    return str;
  }

  //--------------------------------
  // Parse state
  //--------------------------------

  protected BeginRule(): number {
    return this.state.Push();
  }

  protected FailRule(expectedRuleId: number): unknown {
    this.state.Pop(expectedRuleId);
    return null;
  }

  protected CancelRule(expectedRuleId: number): void {
    this.state.Pop(expectedRuleId);
  }

  protected SucceedRule(expectedRuleId: number, result?: unknown): unknown {
    // Get state at point where this rule stared evaluating
    const stateAtSucceedRule = this.state.Peek(expectedRuleId);
    const stateAtBeginRule = this.state.PeekPenultimate();

    // Allow subclass to receive callback
    this.RuleDidSucceed(result, stateAtBeginRule, stateAtSucceedRule);

    // Flatten state stack so that we maintain the same values,
    // but remove one level in the stack.
    this.state.Squash();

    if (!result) {
      result = StringParser.ParseSuccess;
    }

    return result;
  }

  protected RuleDidSucceed(
    _result: unknown,
    _startState: StringParserElement,
    _endState: StringParserElement
  ): void {
    // NoOp
  }

  protected Expect(
    rule: ParseRule,
    message?: string,
    recoveryRule?: ParseRule
  ): unknown {
    let result = this.ParseObject(rule);
    if (!result) {
      if (message == null) {
        message = "rule";
      }

      let butSaw: string;
      const lineRemainder = this.LineRemainder();
      if (lineRemainder == null || lineRemainder.length === 0) {
        butSaw = "end of line";
      } else {
        butSaw = `'${lineRemainder}'`;
      }

      this.Error(`Expected ${message} but saw ${butSaw}`);

      if (recoveryRule) {
        result = recoveryRule();
      }
    }
    return result;
  }

  protected Error(message: string, isWarning = false): void {
    this.ErrorOnLine(message, this.lineIndex + 1, isWarning);
  }

  protected ErrorWithParsedObject(
    message: string,
    result: ParsedObject,
    isWarning = false
  ): void {
    this.ErrorOnLine(message, result.debugMetadata.startLineNumber, isWarning);
  }

  protected ErrorOnLine(
    message: string,
    lineNumber: number,
    isWarning: boolean
  ): void {
    if (!this.state.errorReportedAlreadyInScope) {
      const errorType = isWarning ? "Warning" : "Error";

      if (this.errorHandler == null) {
        throw new Error(`${errorType} on line ${lineNumber}: ${message}`);
      } else {
        this.errorHandler(message, this.index, lineNumber - 1, isWarning);
      }

      this.state.NoteErrorReported();
    }

    if (!isWarning) {
      this.hadError = true;
    }
  }

  protected Warning(message: string): void {
    this.Error(message, true);
  }

  LineRemainder(): string {
    return String(this.Peek(() => this.ParseUntilCharactersFromString("\n\r")));
  }

  SetFlag(flag: number, trueOrFalse: boolean): void {
    if (trueOrFalse) {
      this.state.customFlags |= flag;
    } else {
      this.state.customFlags &= ~flag;
    }
  }

  GetFlag(flag: number): boolean {
    return (this.state.customFlags & flag) !== 0;
  }

  //--------------------------------
  // Structuring
  //--------------------------------

  ParseObject(rule: ParseRule): unknown {
    const ruleId = this.BeginRule();

    const stackHeightBefore = this.state.stackHeight;

    const result = rule();

    if (stackHeightBefore !== this.state.stackHeight) {
      throw new Error("Mismatched Begin/Fail/Succeed rules");
    }

    if (result == null) return this.FailRule(ruleId);

    this.SucceedRule(ruleId, result);
    return result;
  }

  ParseRule<T>(rule: SpecificParseRule<T>): T {
    const ruleId = this.BeginRule();

    const result = rule() as T;
    if (result == null) {
      this.FailRule(ruleId);
      return null;
    }

    this.SucceedRule(ruleId, result);
    return result;
  }

  OneOf(...array: ParseRule[]): unknown {
    for (let i = 0; i < array.length; i += 1) {
      const rule = array[i];
      const result = this.ParseObject(rule);
      if (result != null) {
        return result;
      }
    }

    return null;
  }

  OneOrMore(rule: ParseRule): unknown[] {
    const results = [];

    let result: unknown = null;
    do {
      result = this.ParseObject(rule);
      if (result != null) {
        results.push(result);
      }
    } while (result != null);

    if (results.length > 0) {
      return results;
    }
    return null;
  }

  Optional(rule: ParseRule): ParseRule {
    return (): unknown => {
      let result = this.ParseObject(rule);
      if (result == null) {
        result = StringParser.ParseSuccess;
      }
      return result;
    };
  }

  // Return ParseSuccess instead the real result so that it gets excluded
  // from result arrays (e.g. Interleave)
  Exclude(rule: ParseRule): ParseRule {
    return (): unknown => {
      const result = this.ParseObject(rule);
      if (result == null) {
        return null;
      }
      return StringParser.ParseSuccess;
    };
  }

  // Combination of both of the above
  OptionalExclude(rule: ParseRule): ParseRule {
    return (): unknown => {
      this.ParseObject(rule);
      return StringParser.ParseSuccess;
    };
  }

  // Convenience method for creating more readable ParseString rules that can be combined
  // in other structuring rules (like OneOf etc)
  // e.g. OneOf(String("one"), String("two"))
  protected String(str: string): ParseRule {
    return (): unknown => this.ParseString(str);
  }

  private TryAddResultToList<T>(
    result: unknown,
    list: T[],
    flatten = true
  ): void {
    if (result === StringParser.ParseSuccess) {
      return;
    }

    if (flatten) {
      const resultCollection = result;
      if (Array.isArray(resultCollection)) {
        resultCollection.forEach((obj) => {
          list.push(obj as T);
        });
        return;
      }
    }

    list.push(result as T);
  }

  Interleave<T>(
    ruleA: ParseRule,
    ruleB: ParseRule,
    untilTerminator: ParseRule = null,
    flatten = true
  ): T[] {
    const ruleId = this.BeginRule();

    const results = [];

    // First outer padding
    const firstA = this.ParseObject(ruleA);
    if (firstA == null) {
      return this.FailRule(ruleId) as T[];
    }
    this.TryAddResultToList(firstA, results, flatten);

    let lastMainResult = null;
    let outerResult = null;
    do {
      // "until" condition hit?
      if (untilTerminator != null && this.Peek(untilTerminator) != null) {
        break;
      }

      // Main inner
      lastMainResult = this.ParseObject(ruleB);
      if (lastMainResult == null) {
        break;
      } else {
        this.TryAddResultToList(lastMainResult, results, flatten);
      }

      // Outer result (i.e. last A in ABA)
      outerResult = null;
      if (lastMainResult != null) {
        outerResult = this.ParseObject(ruleA);
        if (outerResult == null) {
          break;
        } else {
          this.TryAddResultToList(outerResult, results, flatten);
        }
      }

      // Stop if there are no results, or if both are the placeholder "ParseSuccess" (i.e. Optional success rather than a true value)
    } while (
      (lastMainResult != null || outerResult != null) &&
      !(
        lastMainResult === StringParser.ParseSuccess &&
        outerResult === StringParser.ParseSuccess
      ) &&
      this.remainingLength > 0
    );

    if (results.length === 0) {
      return this.FailRule(ruleId) as T[];
    }

    return this.SucceedRule(ruleId, results) as T[];
  }

  //--------------------------------
  // Basic string parsing
  //--------------------------------

  ParseString(str: string): string {
    if (str.length > this.remainingLength) {
      return null;
    }

    const ruleId = this.BeginRule();

    // Optimisation from profiling:
    // Store in temporary local variables
    // since they're properties that would have to access
    // the rule stack every time otherwise.
    let i = this.index;
    let cli = this.characterInLineIndex;
    let li = this.lineIndex;

    let success = true;
    for (let s = 0; s < str.length; s += 1) {
      const c = str[s];
      if (this._chars[i] !== c) {
        success = false;
        break;
      }
      if (c === "\n") {
        li += 1;
        cli = -1;
      }
      i += 1;
      cli += 1;
    }

    this.index = i;
    this.characterInLineIndex = cli;
    this.lineIndex = li;

    if (success) {
      return String(this.SucceedRule(ruleId, str));
    }
    return String(this.FailRule(ruleId));
  }

  ParseSingleCharacter(): string {
    if (this.remainingLength > 0) {
      const c = this._chars[this.index];
      if (c === "\n") {
        this.lineIndex += 1;
        this.characterInLineIndex = -1;
      }
      this.index += 1;
      this.characterInLineIndex += 1;
      return c;
    }
    return String.fromCharCode(0);
  }

  ParseUntilCharactersFromString(str: string, maxCount = -1): string {
    return this.ParseCharactersFromString(str, maxCount, false);
  }

  ParseUntilCharactersFromCharSet(
    charSet: CharacterSet,
    maxCount = -1
  ): string {
    return this.ParseCharactersFromCharSet(charSet, maxCount, false);
  }

  ParseCharactersFromString(
    str: string,
    maxCount = -1,
    shouldIncludeChars = true
  ): string {
    return this.ParseCharactersFromCharSet(
      new CharacterSet(str),
      maxCount,
      shouldIncludeChars
    );
  }

  ParseCharactersFromCharSet(
    charSet: CharacterSet,
    maxCount = -1,
    shouldIncludeChars = true
  ): string {
    if (maxCount === -1) {
      maxCount = Number.MAX_SAFE_INTEGER;
    }

    const startIndex = this.index;

    // Optimisation from profiling:
    // Store in temporary local variables
    // since they're properties that would have to access
    // the rule stack every time otherwise.
    let i = this.index;
    let cli = this.characterInLineIndex;
    let li = this.lineIndex;

    let count = 0;
    while (
      i < this._chars.length &&
      charSet.includes(this._chars[i]) === shouldIncludeChars &&
      count < maxCount
    ) {
      if (this._chars[i] === "\n") {
        li += 1;
        cli = -1;
      }
      i += 1;
      cli += 1;
      count += 1;
    }

    this.index = i;
    this.characterInLineIndex = cli;
    this.lineIndex = li;

    const lastCharIndex = this.index;
    if (lastCharIndex > startIndex) {
      return this._chars.substring(startIndex, lastCharIndex);
    }
    return null;
  }

  Peek(rule: ParseRule): unknown {
    const ruleId = this.BeginRule();
    const result = rule();
    this.CancelRule(ruleId);
    return result;
  }

  ParseUntil(
    stopRule: ParseRule,
    pauseCharacters: CharacterSet = null,
    endCharacters: CharacterSet = null
  ): string {
    const ruleId = this.BeginRule();

    const pauseAndEnd = new CharacterSet();
    if (pauseCharacters != null) {
      pauseAndEnd.UnionWith(pauseCharacters);
    }
    if (endCharacters != null) {
      pauseAndEnd.UnionWith(endCharacters);
    }

    const parsedString = new StringBuilder();
    let ruleResultAtPause = null;

    // Keep attempting to parse strings up to the pause (and end) points.
    //  - At each of the pause points, attempt to parse according to the rule
    //  - When the end point is reached (or EOF), we're done
    do {
      // TODO: Perhaps if no pause or end characters are passed, we should check *every* character for stopRule?
      const partialParsedString =
        this.ParseUntilCharactersFromCharSet(pauseAndEnd);
      if (partialParsedString != null) {
        parsedString.Append(partialParsedString);
      }

      // Attempt to run the parse rule at this pause point
      ruleResultAtPause = this.Peek(stopRule);

      // Rule completed - we're done
      if (ruleResultAtPause != null) {
        break;
      } else {
        if (this.endOfInput) {
          break;
        }

        // Reached a pause point, but rule failed. Step past and continue parsing string
        const pauseCharacter = this.currentCharacter;
        if (
          pauseCharacters != null &&
          pauseCharacters.includes(pauseCharacter)
        ) {
          parsedString.Append(pauseCharacter);
          if (pauseCharacter === "\n") {
            this.lineIndex += 1;
            this.characterInLineIndex = -1;
          }
          this.index += 1;
          this.characterInLineIndex += 1;
        } else {
          break;
        }
      }
    } while (!this.endOfInput);

    if (parsedString.Length > 0) {
      return String(this.SucceedRule(ruleId, parsedString.ToString()));
    }
    return String(this.FailRule(ruleId));
  }

  // No need to Begin/End rule since we never parse a newline, so keeping oldIndex is good enough
  ParseInt(): number {
    const oldIndex = this.index;
    const oldCharacterInLineIndex = this.characterInLineIndex;

    const negative = this.ParseString("-") != null;

    // Optional whitespace
    this.ParseCharactersFromString(" \t");

    const parsedString = this.ParseCharactersFromCharSet(
      StringParser.numbersCharacterSet
    );
    if (parsedString == null) {
      // Roll back and fail
      this.index = oldIndex;
      this.characterInLineIndex = oldCharacterInLineIndex;
      return null;
    }

    const parsedInt = Number(parsedString);
    if (!Number.isNaN(parsedInt)) {
      return negative ? -parsedInt : parsedInt;
    }

    this.Error(
      `Failed to read integer value: ${parsedString}. Perhaps it's out of the range of acceptable numbers ink supports? (${Number.MIN_SAFE_INTEGER} to ${Number.MAX_SAFE_INTEGER})`
    );
    return null;
  }

  // No need to Begin/End rule since we never parse a newline, so keeping oldIndex is good enough
  ParseFloat(): number {
    const oldIndex = this.index;
    const oldCharacterInLineIndex = this.characterInLineIndex;

    const leadingInt = this.ParseInt();
    if (leadingInt != null) {
      if (this.ParseString(".") != null) {
        const afterDecimalPointStr = this.ParseCharactersFromCharSet(
          StringParser.numbersCharacterSet
        );
        return Number(`${leadingInt}.${afterDecimalPointStr}`);
      }
    }

    // Roll back and fail
    this.index = oldIndex;
    this.characterInLineIndex = oldCharacterInLineIndex;
    return null;
  }

  // You probably want "endOfLine", since it handles endOfFile too.
  protected ParseNewline(): string {
    const ruleId = this.BeginRule();

    // Optional \r, definite \n to support Windows (\r\n) and Mac/Unix (\n)
    // 2nd May 2016: Always collapse \r\n to just \n
    this.ParseString("\r");

    if (this.ParseString("\n") == null) {
      return String(this.FailRule(ruleId));
    }
    return String(this.SucceedRule(ruleId, "\n"));
  }
}
