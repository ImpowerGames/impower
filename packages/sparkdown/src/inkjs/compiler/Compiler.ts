import { CompilerOptions } from "./CompilerOptions";
import { DebugSourceRange } from "./DebugSourceRange";
import { ErrorType } from "./Parser/ErrorType";
import { InkParser } from "./Parser/InkParser";
import { Story } from "../engine/Story";
import { Story as ParsedStory } from "./Parser/ParsedHierarchy/Story";
import { DebugMetadata } from "../engine/DebugMetadata";
import { StringValue } from "../engine/Value";
import { asOrNull } from "../engine/TypeAssertion";
import { SourceMetadata } from "../engine/Error";

export { CompilerOptions } from "./CompilerOptions";
export { InkParser } from "./Parser/InkParser";
export { StatementLevel } from "./Parser/StatementLevel";
export { JsonFileHandler } from "./FileHandler/JsonFileHandler";
export { InkList, Story } from "../engine/Story";

export class Compiler {
  private _errors: { message: string; source: SourceMetadata | null }[] = [];
  get errors(): { message: string; source: SourceMetadata | null }[] {
    return this._errors;
  }

  private _warnings: { message: string; source: SourceMetadata | null }[] = [];
  get warnings(): { message: string; source: SourceMetadata | null }[] {
    return this._warnings;
  }

  private _infos: { message: string; source: SourceMetadata | null }[] = [];
  get infos(): { message: string; source: SourceMetadata | null }[] {
    return this._infos;
  }

  private _inputString: string;
  get inputString(): string {
    return this._inputString;
  }

  private _options: CompilerOptions;
  get options(): CompilerOptions {
    return this._options;
  }

  private _parsedStory: ParsedStory | null = null;
  get parsedStory(): ParsedStory {
    if (!this._parsedStory) {
      throw new Error();
    }

    return this._parsedStory;
  }

  private _runtimeStory: Story | null = null;
  get runtimeStory(): Story {
    if (!this._runtimeStory) {
      throw new Error("Compilation failed.");
    }

    return this._runtimeStory;
  }

  private _parser: InkParser | null = null;
  get parser(): InkParser {
    if (!this._parser) {
      throw new Error();
    }

    return this._parser;
  }

  private _debugSourceRanges: DebugSourceRange[] = [];
  get debugSourceRanges(): DebugSourceRange[] {
    return this._debugSourceRanges;
  }

  constructor(inkSource: string, options: CompilerOptions | null = null) {
    this._inputString = inkSource;
    this._options = options || new CompilerOptions();
  }

  public readonly Compile = (): Story => {
    this._parser = new InkParser(
      this.inputString,
      this.options.sourceFilename || null,
      this.OnError,
      null,
      this.options.fileHandler
    );

    this._parsedStory = this.parser.ParseStory();

    if (this.errors.length === 0) {
      this.parsedStory.countAllVisits = this.options.countAllVisits;
      this._runtimeStory = this.parsedStory.ExportRuntime(this.OnError);
    } else {
      this._runtimeStory = null;
    }

    return this.runtimeStory;
  };

  public readonly RetrieveDebugSourceForLatestContent = (): void => {
    for (const outputObj of this.runtimeStory.state.outputStream) {
      const textContent = asOrNull(outputObj, StringValue);
      if (textContent !== null) {
        const range = new DebugSourceRange(
          textContent.value?.length || 0,
          textContent.debugMetadata,
          textContent.value || "unknown"
        );

        this.debugSourceRanges.push(range);
      }
    }
  };

  public readonly DebugMetadataForContentAtOffset = (
    offset: number
  ): DebugMetadata | null => {
    let currOffset = 0;

    let lastValidMetadata: DebugMetadata | null = null;
    for (const range of this.debugSourceRanges) {
      if (range.debugMetadata !== null) {
        lastValidMetadata = range.debugMetadata;
      }

      if (offset >= currOffset && offset < currOffset + range.length) {
        return lastValidMetadata;
      }

      currOffset += range.length;
    }

    return null;
  };

  public readonly OnError = (
    message: string,
    severity: ErrorType,
    source: SourceMetadata | null
  ) => {
    switch (severity) {
      case ErrorType.Info:
        this._infos.push({ message, source });
        break;

      case ErrorType.Warning:
        this._warnings.push({ message, source });
        break;

      case ErrorType.Error:
        this._errors.push({ message, source });
        break;
    }

    if (this.options.errorHandler !== null) {
      this.options.errorHandler(message, severity, source);
    }
  };
}
