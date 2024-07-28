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
  CHARACTER_REGEX = /^(.*?)([ \t]*)([(][^()]*?[)])?([ \t]*)(\^|<|>)?([ \t]*)$/;

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
    if (b.checkpoint) {
      a.checkpoint = b.checkpoint;
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
    const defaultTarget = this._targetPrefixMap?.[""] || "";
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
        // @ CHARACTER NAME (parenthetical) >
        const match = characterDeclaration.match(this.CHARACTER_REGEX);
        const characterName = match?.[1] || "";
        const characterParenthetical = match?.[3] || "";
        const characterPosition = match?.[5] || "";
        const characterMap = (this.context?.["character"] as any) || {};
        const normalizedCharacterName =
          this.getCharacterIdentifier(characterName);
        const characterObj =
          characterMap?.[characterName] ||
          characterMap[normalizedCharacterName];
        const character = characterObj?.$name || normalizedCharacterName;
        options.character = character;
        options.position = characterPosition;
        if (characterName) {
          characterNameInstructions = parse(
            characterObj?.name || characterName,
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
    // >> causes the following text to display in a new text box.
    // (Each textbox requires player interaction to advance)
    const segments = content.split(">>");
    for (const segment of segments) {
      const segmentInstructions = parse(
        segment,
        target || defaultTarget,
        options
      );
      if (segmentInstructions.text) {
        if (characterParentheticalInstructions) {
          // prefix each textbox with character_parenthetical, if specified.
          this.merge(
            segmentInstructions,
            characterParentheticalInstructions,
            true
          );
        }
        if (characterNameInstructions) {
          // prefix each textbox with character_name, if specified.
          this.merge(segmentInstructions, characterNameInstructions, true);
        }
      }
      const lastTextbox = this._state.buffer.at(-1);
      if (lastTextbox && !lastTextbox?.text) {
        // If previous textbox did not actually contain any text, fold this result into it.
        this.merge(lastTextbox, segmentInstructions);
      } else {
        // Otherwise, add this result as a new textbox.
        this._state.buffer.push(segmentInstructions);
      }
    }
    if (choices?.length > 0) {
      // show choices after last textbox is done typing.
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
    return Boolean(this._state.buffer?.[0]?.text);
  }

  /**
   * Grabs the next set of instructions to execute.
   * @returns instructions to execute.
   */
  flush() {
    return this._state.buffer?.shift();
  }
}
