import {
  Container,
  DebugMetadata,
  ErrorType,
  isStringValue,
  Path,
  Story,
} from "../../impower-script-engine";
import { CommandLineInput } from "../types/CommandLineInput";
import { CommandLineInputResult } from "../types/CommandLineInputResult";
import { CompilerOptions } from "../types/CompilerOptions";
import { DebugSourceRange } from "../types/DebugSourceRange";
import { ImpowerParser } from "./ImpowerParser";
import { ParsedDivert } from "./ParsedHierarchy/ParsedDivert";
import { ParsedExpression } from "./ParsedHierarchy/ParsedExpression";
import { ParsedObject } from "./ParsedHierarchy/ParsedObject";
import { ParsedStory } from "./ParsedHierarchy/ParsedStory";
import { ParsedVariableAssignment } from "./ParsedHierarchy/ParsedVariableAssignment";

const DEFAULT_COMPILER_OPTIONS: CompilerOptions = {
  sourceFilename: null,
  countAllVisits: true,
  errorHandler: null,
};

export class Compiler {
  _options: CompilerOptions = DEFAULT_COMPILER_OPTIONS;

  _parser: ImpowerParser;

  _parsedStory: ParsedStory;

  _runtimeStory: Story;

  _hadParseError = false;

  _debugSourceRanges: Array<DebugSourceRange> = new Array<DebugSourceRange>();

  public get parsedStory(): ParsedStory {
    return this._parsedStory;
  }

  constructor(options: CompilerOptions = DEFAULT_COMPILER_OPTIONS) {
    this._options = options;
  }

  public Parse(inputString: string): ParsedStory {
    this._parser = new ImpowerParser(
      inputString,
      this._options.sourceFilename,
      this.OnParseError
    );
    this._parsedStory = this._parser.Parse();
    return this._parsedStory;
  }

  public Compile(inputString: string): Story {
    this.Parse(inputString);
    if (this._parsedStory != null && !this._hadParseError) {
      this._parsedStory.countAllVisits = this._options.countAllVisits;
      this._runtimeStory = this._parsedStory.ExportRuntime(
        this._options?.errorHandler
      );
    } else {
      this._runtimeStory = null;
    }
    return this._runtimeStory;
  }

  public HandleInput(inputResult: CommandLineInput): CommandLineInputResult {
    const result: CommandLineInputResult = {
      requestsExit: false,
      choiceIdx: -1,
      divertedPath: null,
      output: null,
    };
    // Request for debug source line number
    if (inputResult.debugSource != null) {
      const offset = <number>(<unknown>inputResult.debugSource);
      const dm = this.DebugMetadataForContentAtOffset(offset);
      if (dm != null) result.output = `DebugSource: ${dm.toString()}`;
      else result.output = `DebugSource: Unknown source`;
    }
    // Request for runtime path lookup (to line number)
    else if (inputResult.debugPathLookup != null) {
      const pathStr = inputResult.debugPathLookup;
      const contentResult = this._runtimeStory.ContentAtPath(new Path(pathStr));
      const dm = contentResult.obj.debugMetadata;
      if (dm != null) result.output = `DebugSource: ${dm.toString()}`;
      else result.output = `DebugSource: Unknown source`;
    }
    // User entered some ink
    else if (inputResult.userImmediateModeStatement != null) {
      const parsedObj = inputResult.userImmediateModeStatement;
      return this.ExecuteImmediateStatement(parsedObj as ParsedObject);
    } else {
      return null;
    }
    return result;
  }

  ExecuteImmediateStatement(parsedObj: ParsedObject): CommandLineInputResult {
    const result: CommandLineInputResult = {
      requestsExit: false,
      choiceIdx: -1,
      divertedPath: null,
      output: null,
    };
    // Variable assignment: create in ParsedStory as well as the Story
    // so that we don't get an error message during reference resolution
    if (parsedObj instanceof ParsedVariableAssignment) {
      const varAssign = <ParsedVariableAssignment>(<unknown>parsedObj);
      if (varAssign.isNewTemporaryDeclaration) {
        this._parsedStory.TryAddNewVariableDeclaration(varAssign);
      }
    }
    parsedObj.parent = this._parsedStory;
    const runtimeObj = parsedObj.runtimeObject;
    parsedObj.ResolveReferences(this._parsedStory);
    if (!this._parsedStory.hadError) {
      // Divert
      if (parsedObj instanceof ParsedDivert) {
        const parsedDivert = parsedObj;
        result.divertedPath = parsedDivert.runtimeDivert.targetPath.toString();
      }
      // Expression or variable assignment
      else if (
        parsedObj instanceof ParsedExpression ||
        parsedObj instanceof ParsedVariableAssignment
      ) {
        const evalResult = this._runtimeStory.EvaluateExpression(
          <Container>(<unknown>runtimeObj)
        );
        if (evalResult != null) {
          result.output = evalResult.toString();
        }
      }
    } else {
      this._parsedStory.ResetError();
    }
    return result;
  }

  public RetrieveDebugSourceForLatestContent(): void {
    for (
      let outputObj_index_ = 0,
        outputObj_source_ = this._runtimeStory.state.outputStream;
      outputObj_index_ < outputObj_source_.length;
      outputObj_index_ += 1
    ) {
      const outputObj = outputObj_source_[outputObj_index_];
      const textContent = outputObj;
      if (isStringValue(textContent)) {
        const range = {
          length: 0,
          debugMetadata: null,
          text: null,
        };
        range.length = textContent.value.length;
        range.debugMetadata = textContent.debugMetadata;
        range.text = textContent.value;
        this._debugSourceRanges.push(range);
      }
    }
  }

  DebugMetadataForContentAtOffset(offset: number): DebugMetadata {
    let currOffset = 0;
    let lastValidMetadata: DebugMetadata = null;
    for (
      let range_index_ = 0, range_source_ = this._debugSourceRanges;
      range_index_ < range_source_.length;
      range_index_ += 1
    ) {
      const range = range_source_[range_index_];
      if (range.debugMetadata != null) lastValidMetadata = range.debugMetadata;
      if (offset >= currOffset && offset < currOffset + range.length)
        return lastValidMetadata;
      currOffset += range.length;
    }
    return null;
  }

  // Need to wrap the error handler so that we know
  // when there was a critical error between parse and codegen stages
  OnParseError(message: string, errorType: ErrorType): void {
    if (errorType === ErrorType.Error) {
      this._hadParseError = true;
    }
    if (this._options?.errorHandler != null) {
      this._options?.errorHandler(message, errorType);
    } else {
      console.error(message);
    }
  }
}
