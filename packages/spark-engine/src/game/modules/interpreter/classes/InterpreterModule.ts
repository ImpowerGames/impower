import { Module } from "../../../core/classes/Module";
import type { Instructions } from "../../../core/types/Instructions";
import { InstructionOptions, parse } from "../utils/parse";
import {
  WriterBuiltins as InterpreterBuiltins,
  interpreterBuiltins,
} from "../interpreterBuiltins";

export interface InterpreterConfig {}

export interface InterpreterState {
  buffer?: Instructions[];
}

export interface InterpreterMessageMap extends Record<string, any> {}

export class InterpreterModule extends Module<
  InterpreterState,
  InterpreterMessageMap,
  InterpreterBuiltins
> {
  CHARACTER_REGEX =
    /^(.*?)([ \t]*)([(][^()]*?[)])?([ \t]*)(?:(\[)([ \t]*)(.*?)([ \t]*)(\]))?([ \t]*)$/;

  KEYWORD_TERMINATOR_CHARS = [undefined, "", " ", "\t", "\r", "\n"];

  protected _targetPrefixMap: Record<string, string> = {};

  protected _targetPrefixes: string[] = [];

  override getBuiltins() {
    return interpreterBuiltins();
  }

  override getStored() {
    return [];
  }

  override async onInit(): Promise<void> {
    this.setup();
  }

  setup() {
    this._targetPrefixMap = {};
    for (const [k, v] of Object.entries(
      this.context.config.interpreter.directives
    )) {
      this._targetPrefixMap[v] = k;
    }
    this._targetPrefixes = Object.keys(this._targetPrefixMap);
  }

  /**
   * Coalesce character name into a valid identifier that can be used to lookup the character in context
   * */
  getCharacterIdentifier(characterName: string): string {
    return characterName
      .replace(/([ ])/g, "_")
      .replace(/([.'"`])/g, "")
      .toLowerCase();
  }

  /**
   * Merge a set of instructions into an existing set of instructions
   * @param a the existing set of instructions
   * @param b the instructions to merge into the existing set
   * @param prefix If true, instructions will be prepended to the front of the sequence.
   */
  merge(a: Instructions, b: Instructions, prefix = false): void {
    if (a.text || b.text) {
      a.text ??= {};
      if (b.text) {
        for (const [k, v] of Object.entries(b.text)) {
          a.text[k] ??= [];
          if (prefix) {
            a.text[k]!.unshift(...v);
          } else {
            a.text[k]!.push(...v);
          }
        }
      }
    }
    if (a.audio || b.audio) {
      a.audio ??= {};
      if (b.audio) {
        for (const [k, v] of Object.entries(b.audio)) {
          a.audio[k] ??= [];
          if (prefix) {
            a.audio[k]!.unshift(...v);
          } else {
            a.audio[k]!.push(...v);
          }
        }
      }
    }
    if (a.image || b.image) {
      a.image ??= {};
      if (b.image) {
        for (const [k, v] of Object.entries(b.image)) {
          a.image[k] ??= [];
          if (prefix) {
            a.image[k]!.unshift(...v);
          } else {
            a.image[k]!.push(...v);
          }
        }
      }
    }
    if (b.end > a.end) {
      a.end = b.end;
    }
    if (b.choices) {
      a.choices ??= [];
      if (prefix) {
        a.choices.unshift(...b.choices);
      } else {
        a.choices.push(...b.choices);
      }
    }
    if (b.uuids) {
      a.uuids ??= [];
      if (prefix) {
        a.uuids.unshift(...b.uuids);
      } else {
        a.uuids.push(...b.uuids);
      }
    }
  }

  /**
   * Parse content and choices into sequences of instructions
   * and queue these instructions to be executed later.
   * @param content current text to queue
   * @param choices choices to queue
   */
  queue(content: string, choices: string[]): void {
    this._state.buffer ??= [];
    const options: InstructionOptions = {};
    options.context = this.context;
    // Trim away indent.
    content = content.trimStart();
    // Determine the default target (if no prefix matches).
    const defaultTarget =
      this._targetPrefixMap?.["!"] || this._targetPrefixMap?.[""] || "";
    // Check if content starts with a target prefix symbol.
    const targetPrefix = this._targetPrefixes.find(
      (p) => p && content.startsWith(p)
    );
    const target =
      targetPrefix &&
      // (prefix symbol must be followed by space or end-of-line).
      this.KEYWORD_TERMINATOR_CHARS.includes(content[targetPrefix.length])
        ? this._targetPrefixMap[targetPrefix]
        : undefined;
    if (target && targetPrefix) {
      // Trim away starting prefix symbol.
      content = content.slice(targetPrefix.length);
    }
    let characterNameInstructions: Instructions | undefined = undefined;
    let characterParentheticalInstructions: Instructions | undefined =
      undefined;
    // Parse dialogue character
    if (target === "dialogue") {
      const nextColonIndex = content.indexOf(":");
      const nextNewlineIndex = content.indexOf("\n");
      // Character is everything after @ until the next colon or the end-of-line.
      // @ CHARACTER NAME: This is dialogue.
      const characterTerminatorIndex =
        nextColonIndex >= 0
          ? nextColonIndex
          : nextNewlineIndex >= 0
          ? nextNewlineIndex
          : content.length;
      const characterDeclaration = content
        .slice(0, characterTerminatorIndex)
        .trim();
      if (characterDeclaration) {
        // Character declaration can include name, parenthetical, and position.
        // @ CHARACTER NAME (parenthetical) [>]
        const match = characterDeclaration.match(this.CHARACTER_REGEX);
        const characterNameMatch = match?.[1] || "";
        const characterParentheticalMatch = match?.[3] || "";
        const characterPositionMatch = match?.[7] || "";
        const characterMap = (this.context?.["character"] as any) || {};
        const normalizedCharacterName =
          this.getCharacterIdentifier(characterNameMatch);
        const characterObj =
          characterMap?.[characterNameMatch] ||
          characterMap[normalizedCharacterName];
        const character = characterObj?.$name || normalizedCharacterName;
        const characterName = characterObj?.name || characterNameMatch;
        const characterParenthetical = characterParentheticalMatch;
        const position =
          characterPositionMatch === "<"
            ? "left"
            : characterPositionMatch === ">"
            ? "right"
            : characterPositionMatch;
        options.character = character;
        options.position = position;
        if (characterName) {
          characterNameInstructions = parse(
            characterName,
            "character_name",
            options
          );
        }
        if (characterParenthetical) {
          characterParentheticalInstructions = parse(
            characterParenthetical,
            "character_parenthetical",
            options
          );
        }
      }
      // Trim away character declaration
      content = content.slice(characterTerminatorIndex + 1).trimStart();
    }
    // Queue content
    if (content) {
      const contentInstructions = parse(
        content,
        target || defaultTarget,
        options
      );
      if (contentInstructions.text) {
        if (characterParentheticalInstructions) {
          // prefix each textbox with character_parenthetical, if specified.
          this.merge(
            contentInstructions,
            characterParentheticalInstructions,
            true
          );
        }
        if (characterNameInstructions) {
          // prefix each textbox with character_name, if specified.
          this.merge(contentInstructions, characterNameInstructions, true);
        }
      }
      const lastTextbox = this._state.buffer.at(-1);
      if (lastTextbox && !lastTextbox?.text) {
        // If previous textbox did not actually contain any text, fold this result into it.
        this.merge(lastTextbox, contentInstructions);
      } else {
        // Otherwise, add this result as a new textbox.
        this._state.buffer.push(contentInstructions);
      }
    }
    // Show choices after last textbox is done typing.
    if (choices?.length > 0) {
      let lastTextbox = this._state.buffer?.at(-1);
      if (!lastTextbox) {
        lastTextbox = { end: 0 };
        this._state.buffer.push(lastTextbox);
      }
      if (choices) {
        for (let i = 0; i < choices.length; i += 1) {
          const choice = choices[i]!;
          const choiceInstructions = parse(choice, `choice_${i}`, {
            ...options,
            delay: lastTextbox.end,
            choice: true,
          });
          this.merge(lastTextbox, choiceInstructions);
        }
      }
    }
  }

  /**
   * Whether or not there is a textbox or choices to display.
   * (Flow should continue until text can be flushed.)
   * @returns True if there is queued text to be flushed to screen, otherwise False.
   */
  canFlush(): boolean {
    // There is text to display.
    // Or we are in preview mode and there is an image to display
    return Boolean(
      this._state.buffer?.[0]?.text ||
        (this.context.system.previewing && this._state.buffer?.[0]?.image)
    );
  }

  /**
   * Grabs the next set of instructions to execute.
   * @returns instructions to execute.
   */
  flush() {
    return this._state.buffer?.shift();
  }
}
