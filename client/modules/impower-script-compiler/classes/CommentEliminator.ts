import { CharacterSet } from "./CharacterSet";
import { StringParser } from "./StringParser";

/// <summary>
/// Pre-pass before main ink parser runs. It actually performs two main tasks:
///  - comment elimination to simplify the parse rules in the main parser
///  - Conversion of Windows line endings (\r\n) to the simpler Unix style (\n), so
///    we don't have to worry about them later.
/// </summary>
export class CommentEliminator extends StringParser {
  private _commentOrNewlineStartCharacter = new CharacterSet("/\r\n");

  private _commentBlockEndCharacter = new CharacterSet("*");

  private _newlineCharacters = new CharacterSet("\n\r");

  public Process(): string {
    // Make both comments and non-comments optional to handle trivial empty file case (or *only* comments)
    const stringList = this.Interleave<string>(
      this.Optional(this.CommentsAndNewlines),
      this.Optional(this.Main)
    );

    if (stringList != null) {
      return stringList.join(``);
    }
    return null;
  }

  private Main(): string {
    return this.ParseUntil(
      this.CommentsAndNewlines,
      this._commentOrNewlineStartCharacter,
      null
    );
  }

  private CommentsAndNewlines(): string {
    const newlines = this.Interleave<string>(
      this.Optional(this.ParseNewline),
      this.Optional(this.ParseSingleComment)
    );

    if (newlines != null) {
      return newlines.join(``);
    }
    return null;
  }

  // Valid comments always return either an empty string or pure newlines,
  // which we want to keep so that line numbers stay the same
  private ParseSingleComment(): string {
    return this.OneOf(this.EndOfLineComment, this.BlockComment) as string;
  }

  private EndOfLineComment(): string {
    if (this.ParseString("//") == null) {
      return null;
    }

    this.ParseUntilCharactersFromCharSet(this._newlineCharacters);

    return "";
  }

  private BlockComment(): string {
    if (this.ParseString("/*") == null) {
      return null;
    }

    const startLineIndex = this.lineIndex;

    const commentResult = this.ParseUntil(
      this.String("*/"),
      this._commentBlockEndCharacter,
      null
    );

    if (!this.endOfInput) {
      this.ParseString("*/");
    }

    // Count the number of lines that were inside the block, and replicate them as newlines
    // so that the line indexing still works from the original source
    if (commentResult != null) {
      const newlineCount = this.lineIndex - startLineIndex;
      let newString = "";
      for (let i = 0; i < newlineCount; i += 1) {
        newString += "\n";
      }
      return newString;
    }

    // No comment at all

    return null;
  }
}
