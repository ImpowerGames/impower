import { getCharacterIdentifier } from "@impower/sparkdown/src/utils/getCharacterIdentifier";
import { Module } from "../../../core/classes/Module";
import {
  AudioInstruction,
  ImageInstruction,
  LoadInstruction,
  TextInstruction,
} from "../../../core/types/Instruction";
import type { Instructions } from "../../../core/types/Instructions";
import { getNumberValue } from "../../../core/utils/getNumberValue";
import { getTimeValue } from "../../../core/utils/getTimeValue";
import {
  InterpreterBuiltins,
  interpreterBuiltinDefinitions,
} from "../interpreterBuiltinDefinitions";
import { Chunk } from "../types/Chunk";
import { InstructionOptions } from "../types/InstructionOptions";
import { Phrase } from "../types/Phrase";
import { stressPhrases } from "../utils/stressPhrases";
import { Matcher } from "./helpers/Matcher";

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
  MARKERS = ["^", "*", "_", "~~", "::"];

  ASSET_CONTROL_KEYWORDS = [
    "show",
    "hide",
    "animate",
    "play",
    "stop",
    "fade",
    "queue",
    "await",
    "write",
  ];

  ASSET_VALUE_ARG_KEYWORDS = ["after", "over", "to", "with"];

  ASSET_FLAG_ARG_KEYWORDS = ["wait", "loop", "once", "mute", "unmute", "now"];

  ASSET_ARG_KEYWORDS = [
    ...this.ASSET_VALUE_ARG_KEYWORDS,
    ...this.ASSET_FLAG_ARG_KEYWORDS,
  ];

  CHAR_REGEX =
    /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})|./gsu;

  BREAK_BOX_REGEX = /[ \t]+[>][ \t]*$/m;

  CHARACTER_REGEX =
    /^(.*?)([ \t]*)([(][^()]*?[)])?([ \t]*)(?:(\[)([ \t]*)(.*?)([ \t]*)(\]))?([ \t]*)$/;

  PARENTHETICAL_REGEX =
    /^([ \t]*)((?:[=].*?[=]|[<].*?[>]|[ \t]*)*)([ \t]*)([(][^()]*?[)])([ \t]*)((?:[=].*?[=]|[<].*?[>]|[ \t]*)*)$/;

  WHITESPACE_REGEX = /[ \t\r\n]+/;

  TARGETED_TEXT_REGEX = /(.*?)((?<!\\)[:](?:$|[ ]+))((?:.|\r|\n)*)/;

  protected _targetPrefixMap: Record<string, string> = {};

  protected _characterNameMap: Record<string, string> = {};

  protected _targetPrefixes: string[] = [];

  override getBuiltins() {
    return interpreterBuiltinDefinitions();
  }

  override getStored() {
    return [];
  }

  override onInit() {
    this.setup();
  }

  setup() {
    this._characterNameMap = {};
    for (const [k, v] of Object.entries(this.context.character || {})) {
      const name = v.name;
      if (typeof name === "string") {
        this._characterNameMap[name] = k;
      }
    }
    this._targetPrefixMap = {};
    for (const [k, v] of Object.entries(
      this.context.config?.interpreter.directives || {}
    )) {
      this._targetPrefixMap[v] = k;
    }
    this._targetPrefixes = Object.keys(this._targetPrefixMap);
  }

  /**
   * Coalesce character name into a valid identifier that can be used to lookup the character in context
   * */
  getCharacterIdentifier(characterName: string): string {
    return getCharacterIdentifier(characterName);
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
    // Trim away indent.
    content = content.trimStart();

    if (content.startsWith("load ")) {
      const args = content.split(this.WHITESPACE_REGEX).slice(1);
      const loadInstructions: LoadInstruction[] = args
        .map((name) => ({ name }))
        .filter((a) => Boolean(a.name));
      const latest = this._state.buffer.at(-1);
      if (latest) {
        latest.load ??= [];
        latest.load.push(...loadInstructions);
      } else {
        this._state.buffer.push({ load: loadInstructions, end: 0 });
      }
      return;
    }

    // Determine the default target (if no prefix matches).
    const defaultTarget = this._targetPrefixMap?.[""] || "";

    const targetedMatch = content.match(this.TARGETED_TEXT_REGEX);
    const targetIdentifier = targetedMatch ? targetedMatch[1]! : "";
    content = targetedMatch ? targetedMatch[3]! : content;

    let target = this._targetPrefixMap[targetIdentifier] || defaultTarget;

    let characterNameInstructions: Instructions | undefined = undefined;
    let characterParentheticalInstructions: Instructions | undefined =
      undefined;
    // Parse fallback write target
    if (targetIdentifier && target === defaultTarget) {
      if (targetIdentifier.startsWith("@")) {
        // we are targeting a specific layer
        target = targetIdentifier.slice(1).trim();
      } else {
        // assume targetIdentifier is a character name
        const characterDeclaration = targetIdentifier;
        if (characterDeclaration) {
          // Character declaration can include name, parenthetical, and position.
          // @ CHARACTER NAME (parenthetical) [>]
          const match = characterDeclaration.match(this.CHARACTER_REGEX);
          const characterNameMatch = match?.[1] || "";
          const characterParentheticalMatch = match?.[3] || "";
          const characterPositionMatch = match?.[7] || "";
          const characterMap = this.context?.["character"] as any;
          const characterId = this._characterNameMap[characterNameMatch] || "";
          const characterObj =
            characterMap?.[characterNameMatch] || characterMap?.[characterId];
          const character = characterObj?.$name;
          const characterName =
            typeof characterObj?.name === "string"
              ? characterObj.name
              : characterNameMatch;
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
            characterNameInstructions = this.parse(
              characterName,
              "character_name",
              options
            );
          }
          if (characterParenthetical) {
            characterParentheticalInstructions = this.parse(
              characterParenthetical,
              "character_parenthetical",
              options
            );
          }
        }
      }
    }
    // Queue content
    if (content) {
      const contentBoxes = content.split(this.BREAK_BOX_REGEX);
      for (const contentBox of contentBoxes) {
        const contentInstructions = this.parse(
          contentBox,
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
          const choiceInstructions = this.parse(choice, `choice_${i}`, {
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
  shouldFlush(): boolean {
    // There are worlds to load.
    // Or there is text to display.
    // Or an event takes up time.
    return Boolean(
      this._state.buffer?.[0]?.load ||
        this._state.buffer?.[0]?.text ||
        Number(this._state.buffer?.[0]?.end) > 0
    );
  }

  /**
   * Grabs the next set of instructions to execute.
   * @returns instructions to execute.
   */
  flush() {
    return this._state.buffer?.shift();
  }

  protected isWhitespace(part: string | undefined) {
    if (!part) {
      return false;
    }
    for (let i = 0; i < part.length; i += 1) {
      const c = part[i]!;
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
        return false;
      }
    }
    return true;
  }

  protected isSpace(part: string | undefined) {
    if (!part) {
      return false;
    }
    for (let i = 0; i < part.length; i += 1) {
      const c = part[i]!;
      if (c !== " " && c !== "\t") {
        return false;
      }
    }
    return true;
  }

  protected isDash(part: string | undefined) {
    if (!part) {
      return false;
    }
    for (let i = 0; i < part.length; i += 1) {
      const c = part[i]!;
      if (c !== "-") {
        return false;
      }
    }
    return true;
  }

  protected lookupContextValue(
    type: string,
    name: string,
    ...fallbacks: string[]
  ) {
    const value = (this.context as any)?.[type]?.[name] as any;
    if (value) {
      return value;
    }
    for (let i = 0; i < fallbacks.length; i += 1) {
      const fallbackName = fallbacks[i] || "";
      const fallbackValue = (this.context as any)?.[type]?.[fallbackName];
      if (fallbackValue) {
        return fallbackValue;
      }
    }
    return (this.context as any)?.[type]?.["$default"];
  }

  protected lookupContextValueName(
    type: string,
    name: string,
    ...fallbacks: string[]
  ) {
    const value = (this.context as any)?.[type]?.[name];
    if (value) {
      return name;
    }
    for (let i = 0; i < fallbacks.length; i += 1) {
      const fallbackName = fallbacks[i] || "";
      const fallbackValue = (this.context as any)?.[type]?.[fallbackName];
      if (fallbackValue) {
        return fallbackName;
      }
    }
    return "$default";
  }

  protected getMinSynthDuration(synth: {
    envelope: {
      attack: number;
      decay: number;
      sustain: number;
      release: number;
    };
  }) {
    const synthEnvelope = synth?.envelope;
    return synthEnvelope
      ? (synthEnvelope.attack ?? 0) +
          (synthEnvelope.decay ?? 0) +
          (synthEnvelope.sustain ?? 0) +
          (synthEnvelope.release ?? 0)
      : 0;
  }

  protected createImageChunk(imageTagContent: string): Chunk {
    const defaultLayer =
      this.context?.config?.interpreter?.fallbacks?.layer || "portrait";
    const imageChunk = this.createAssetChunk(
      imageTagContent,
      "image",
      "show",
      defaultLayer
    );
    // Calculate how much time this command should take up
    const withEffectName =
      imageChunk.clauses?.["with"] || imageChunk.target || "";
    const afterDuration = imageChunk.clauses?.["after"];
    const overDuration = imageChunk.clauses?.["over"];
    const transition = (this.context as any)?.["transition"]?.[withEffectName];
    const animation = (this.context as any)?.["animation"]?.[withEffectName];
    const animationNames: string[] = [];
    if (transition) {
      for (const [k, v] of Object.entries(transition)) {
        if (!k.startsWith("$") && v) {
          if (typeof v === "string") {
            animationNames.push(v);
          } else if (
            typeof v === "object" &&
            "$name" in v &&
            typeof v?.$name === "string"
          ) {
            animationNames.push(v?.$name);
          }
        }
      }
    } else if (animation) {
      animationNames.push(animation.$name);
    } else if (imageChunk.control === "show") {
      animationNames.push("show");
    } else if (imageChunk.control === "hide") {
      animationNames.push("hide");
    }
    const allAnimations = animationNames.map(
      (name) => (this.context as any)?.["animation"]?.[name]
    );
    const maxAnimationDuration = Math.max(
      ...allAnimations.map((a) => getTimeValue(a?.timing?.duration) ?? 0)
    );
    // Add to duration
    if (imageChunk.clauses?.wait) {
      imageChunk.duration += afterDuration ?? 0;
      imageChunk.duration += overDuration ?? maxAnimationDuration ?? 0;
    }
    return imageChunk;
  }

  protected createAudioChunk(audioTagContent: string): Chunk {
    const defaultChannel =
      this.context?.config?.interpreter?.fallbacks?.channel || "sound";
    const audioChunk = this.createAssetChunk(
      audioTagContent,
      "audio",
      "play",
      defaultChannel
    );
    // Calculate how much time this command should take up
    const afterDuration = audioChunk.clauses?.["after"];
    const overDuration = audioChunk.clauses?.["over"];
    // Add to duration
    if (audioChunk.clauses?.wait) {
      audioChunk.duration += afterDuration ?? 0;
      audioChunk.duration += overDuration ?? 0;
    }
    return audioChunk;
  }

  protected createAssetChunk(
    assetTagContent: string,
    tag: string,
    defaultControl: string,
    defaultTarget: string
  ): Chunk {
    let parts = assetTagContent.replaceAll("\t", " ").split(" ");
    let control = defaultControl;
    let target = defaultTarget;
    const assets: string[] = [];
    const args: string[] = [];
    if (parts[0] && this.ASSET_CONTROL_KEYWORDS.includes(parts[0])) {
      control = parts[0];
      if (parts[1]) {
        target = parts[1];
      }
      parts = parts.slice(2);
    }
    let foundClauseKeyword = false;
    for (const part of parts) {
      if (this.ASSET_ARG_KEYWORDS.includes(part)) {
        foundClauseKeyword = true;
      }
      if (foundClauseKeyword) {
        args.push(part);
      } else {
        assets.push(...part.split("+"));
      }
    }
    const clauses: Record<string, unknown> = {};
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg) {
        if (this.ASSET_VALUE_ARG_KEYWORDS.includes(arg)) {
          i += 1;
          const value = args[i];
          if (arg === "after") {
            clauses[arg] = getTimeValue(value);
          }
          if (arg === "over") {
            clauses[arg] = getTimeValue(value);
          }
          if (arg === "to") {
            clauses[arg] = getNumberValue(value);
          }
          if (arg === "with") {
            clauses[arg] = value;
          }
        } else {
          clauses[arg] = true;
        }
      }
    }
    return {
      tag,
      control,
      target,
      assets,
      clauses,
      duration: 0,
      speed: 1,
    };
  }

  parse(
    content: string,
    target: string,
    options?: InstructionOptions
  ): Instructions {
    const allPhrases: Phrase[] = [];

    const textTarget = target;
    const delay = options?.delay || 0;
    const choice = options?.choice;
    const character = options?.character;
    const debug = this.context?.system.debugging;

    let uuids: string[] = [];
    let consecutiveLettersLength = 0;
    let word = "";
    let dashLength = 0;
    let spaceLength = 0;
    let phrasePauseLength = 0;
    let phraseUnpauseLength = 0;
    let escaped = false;
    let hidden = false;
    let raw = false;
    let currChunk: Chunk | undefined = undefined;

    const activeMarks: [string][] = [];
    let alignModifier = "";
    let speedModifier = 1;
    let pitchModifier: number | undefined = undefined;
    const wavyIndexMap = new Map<[string], number>();
    const shakyIndexMap = new Map<[string], number>();

    const startNewPhrase = () => {
      // Reset all inter-phrase trackers
      consecutiveLettersLength = 0;
      word = "";
      dashLength = 0;
      spaceLength = 0;
      phrasePauseLength = 0;
      phraseUnpauseLength = 0;
      currChunk = undefined;
      escaped = false;
    };

    const processLine = (textLine: string, textTarget: string) => {
      const linePhrases: Phrase[] = [];

      const typewriter = this.lookupContextValue("typewriter", textTarget);
      const typewriterSynth = this.lookupContextValue(
        "synth",
        textTarget,
        "typewriter"
      );
      const characterSynth = character
        ? this.lookupContextValue("synth", character, "character")
        : undefined;
      const synth = characterSynth ?? typewriterSynth;
      const minSynthDuration = this.getMinSynthDuration(synth);
      const letterPause = typewriter?.letter_pause ?? 0;
      const phrasePause = typewriter?.phrase_pause_scale ?? 1;
      const emDashPause = typewriter?.em_dash_pause_scale ?? 1;
      const stressPause = typewriter?.stressed_pause_scale ?? 1;
      const syllableLength = Math.max(
        typewriter?.min_syllable_length || 0,
        Math.round(minSynthDuration / letterPause)
      );
      const voicedMatcher = typewriter?.voiced
        ? new Matcher(typewriter?.voiced)
        : undefined;
      const yelledMatcher = typewriter?.yelled
        ? new Matcher(typewriter?.yelled)
        : undefined;

      activeMarks.length = 0;
      consecutiveLettersLength = 0;
      word = "";
      dashLength = 0;
      spaceLength = 0;
      phrasePauseLength = 0;
      phraseUnpauseLength = 0;
      currChunk = undefined;
      escaped = false;
      hidden = false;

      const chars = textLine.match(this.CHAR_REGEX);
      if (chars) {
        for (let i = 0; i < chars.length; ) {
          const char = chars[i] ?? "";
          const nextChar = chars[i + 1] ?? "";
          if (!escaped) {
            // Raw
            if (char === "`") {
              i += 1;
              raw = !raw;
              continue;
            }
            if (!raw) {
              // Escape
              if (char === "\\") {
                i += 1;
                escaped = true;
                continue;
              }
              // Image Tag
              if (char === "[" && nextChar === "[") {
                let imageTagContent = "";
                let closed = false;
                const startIndex = i;
                i += 2;
                while (i < chars.length) {
                  if (chars[i] === "]" && chars[i + 1] === "]") {
                    closed = true;
                    const imageChunk = this.createImageChunk(imageTagContent);
                    const phrase = {
                      target: imageChunk.target,
                      chunks: [imageChunk],
                    };
                    linePhrases.push(phrase);
                    allPhrases.push(phrase);
                    startNewPhrase();
                    i += 2;
                    // consume trailing whitespace
                    while (i < chars.length) {
                      if (!this.isSpace(chars[i])) {
                        break;
                      }
                      i += 1;
                    }
                    break;
                  }
                  imageTagContent += chars[i];
                  i += 1;
                }
                if (!closed) {
                  i = startIndex;
                  escaped = true;
                }
                continue;
              }
              // Audio Tag
              if (char === "(" && nextChar === "(") {
                let audioTagContent = "";
                let closed = false;
                const startIndex = i;
                i += 2;
                while (i < chars.length) {
                  if (chars[i] === ")" && chars[i + 1] === ")") {
                    closed = true;
                    const audioChunk = this.createAudioChunk(audioTagContent);
                    const phrase = {
                      target: audioChunk.target,
                      chunks: [audioChunk],
                    };
                    linePhrases.push(phrase);
                    allPhrases.push(phrase);
                    startNewPhrase();
                    i += 2;
                    // consume trailing whitespace
                    while (i < chars.length) {
                      if (!this.isSpace(chars[i])) {
                        break;
                      }
                      i += 1;
                    }
                    break;
                  }
                  audioTagContent += chars[i];
                  i += 1;
                }
                if (!closed) {
                  i = startIndex;
                  escaped = true;
                }
                continue;
              }
              // Text Tag
              if (char === "<" && !this.isWhitespace(chars[i + 1])) {
                let control = "";
                let arg = "";
                const startIndex = i;
                i += 1;
                while (chars[i] && chars[i] !== ">" && chars[i] !== ":") {
                  control += chars[i];
                  i += 1;
                }
                if (chars[i] === ":") {
                  i += 1;
                  while (chars[i] && chars[i] !== ">") {
                    arg += chars[i];
                    i += 1;
                  }
                }
                control = control.trimEnd();
                arg = arg.trim();
                const closed = chars[i] === ">";
                if (closed) {
                  i += 1;
                  if (control) {
                    if (control === "speed" || control === "s") {
                      speedModifier = getNumberValue(arg, 1);
                    } else if (control === "pitch" || control === "p") {
                      pitchModifier = getNumberValue(arg, 0);
                    } else if (control === "wait" || control === "w") {
                      const waitModifier = getNumberValue(arg, 0);
                      const waitChunk: Chunk = {
                        duration: waitModifier,
                        speed: 1,
                      };
                      if (!arg) {
                        // No wait duration was specified, so assume we are waiting until the user clicks
                        // (We take advantage of the fact that text chunks always require an interaction to advance.)
                        waitChunk.text = "";
                      }
                      const phrase = {
                        target: textTarget,
                        chunks: [waitChunk],
                      };
                      linePhrases.push(phrase);
                      allPhrases.push(phrase);
                      startNewPhrase();
                    } else if (control === "!") {
                      hidden = true;
                    } else if (control === "/!") {
                      hidden = false;
                    }
                  }
                } else {
                  i = startIndex;
                  escaped = true;
                }
                continue;
              }
              // Style Tag
              const styleMarker = this.MARKERS.find(
                (marker) =>
                  marker === chars.slice(i, i + marker.length).join("")
              );
              if (styleMarker) {
                let currentMarker = "";
                const startIndex = i;
                while (chars[i] && chars[i] === char) {
                  currentMarker += chars[i];
                  i += 1;
                }
                const lastMatchingMark =
                  activeMarks.findLast(
                    ([activeMarker]) => activeMarker === currentMarker
                  ) ||
                  activeMarks.findLast(
                    ([activeMarker]) =>
                      activeMarker.slice(0, styleMarker.length) ===
                      currentMarker.slice(0, styleMarker.length)
                  );
                if (lastMatchingMark) {
                  while (activeMarks.at(-1) !== lastMatchingMark) {
                    activeMarks.pop();
                  }
                  activeMarks.pop();
                  const [lastMatchingMarker] = lastMatchingMark;
                  i = startIndex + lastMatchingMarker.length;
                } else {
                  activeMarks.push([currentMarker]);
                }
                continue;
              }
            }
          }
          escaped = false;

          if (hidden) {
            if (char === "\n") {
              hidden = false;
            }
            i += 1;
            continue;
          }

          const activeCenteredMark = activeMarks.findLast(([m]) =>
            m.startsWith("^")
          );
          const activeUnderlineMark = activeMarks.findLast(([m]) =>
            m.startsWith("_")
          );
          const activeBoldItalicMark = activeMarks.findLast(([m]) =>
            m.startsWith("***")
          );
          const activeBoldMark = activeMarks.findLast(([m]) => m === "**");
          const activeItalicMark = activeMarks.findLast(([m]) => m === "*");
          const activeWavyMark = activeMarks.findLast(([m]) =>
            m.startsWith("~~")
          );
          const activeShakyMark = activeMarks.findLast(([m]) =>
            m.startsWith("::")
          );
          const isCentered = Boolean(activeCenteredMark);
          const isUnderlined = Boolean(activeUnderlineMark);
          const isItalicized =
            Boolean(activeBoldItalicMark) || Boolean(activeItalicMark);
          const isBolded =
            Boolean(activeBoldItalicMark) || Boolean(activeBoldMark);
          const voiced = Boolean(voicedMatcher?.test(char));

          // Determine offset from wavy mark
          if (activeWavyMark) {
            const wavyIndex = wavyIndexMap.get(activeWavyMark);
            if (wavyIndex != null) {
              wavyIndexMap.set(activeWavyMark, wavyIndex + 1);
            } else {
              wavyIndexMap.set(activeWavyMark, 1);
            }
          }
          const wavy = activeWavyMark ? wavyIndexMap.get(activeWavyMark) : 0;

          // Determine offset from shaky mark
          if (activeShakyMark) {
            const shakyIndex = shakyIndexMap.get(activeShakyMark);
            if (shakyIndex != null) {
              shakyIndexMap.set(activeShakyMark, shakyIndex + 1);
            } else {
              shakyIndexMap.set(activeShakyMark, 1);
            }
          }
          const shaky = activeShakyMark
            ? shakyIndexMap.get(activeShakyMark)
            : 0;

          if (this.isWhitespace(char)) {
            word = "";
            spaceLength += 1;
            consecutiveLettersLength = 0;
          } else {
            word += char;
            spaceLength = 0;
            if (voiced) {
              consecutiveLettersLength += 1;
            } else {
              consecutiveLettersLength = 0;
            }
          }

          if (this.isDash(char)) {
            dashLength += 1;
          } else {
            dashLength = 0;
          }

          const isYelled =
            Boolean(yelledMatcher?.test(word)) &&
            (Boolean(yelledMatcher?.test(nextChar)) || word.length > 1);
          const tilde = char === "~";
          const isEmDashBoundary =
            i >= 3 &&
            this.isSpace(chars[i - 3]) &&
            this.isDash(chars[i - 2]) &&
            this.isDash(chars[i - 1]) &&
            this.isSpace(chars[i]);
          const isPhraseBoundary = spaceLength > 1 || isEmDashBoundary;

          if (isPhraseBoundary) {
            phrasePauseLength += 1;
            phraseUnpauseLength = 0;
          } else {
            phrasePauseLength = 0;
            phraseUnpauseLength += 1;
          }
          // Determine beep pitch
          const yelled = isYelled ? 1 : 0;
          // centered level = number of `|`
          const centered =
            alignModifier === "center"
              ? 1
              : isCentered && activeCenteredMark
              ? activeCenteredMark.length
              : isCentered
              ? 1
              : 0;
          // italicized level = number of `*`
          const italicized = isItalicized ? 1 : 0;
          // bolded level = number of `*`
          const bolded =
            isBolded && activeBoldItalicMark
              ? activeBoldItalicMark.length
              : isBolded
              ? 2
              : 0;
          // underlined level = number of `_`
          const underlined =
            isUnderlined && activeUnderlineMark
              ? activeUnderlineMark.length
              : isUnderlined
              ? 1
              : 0;
          const pitch = pitchModifier;

          // Determine beep timing
          const charIndex = phraseUnpauseLength - 1;
          const voicedSyllable = charIndex % syllableLength === 0;
          const speedWavy = activeWavyMark ? activeWavyMark[0].length - 1 : 1;
          const speedShaky = activeShakyMark
            ? activeShakyMark[0].length - 1
            : 1;
          const speed = speedModifier / speedWavy / speedShaky;
          const isEmDashPause = isEmDashBoundary;
          const isPhrasePause = isPhraseBoundary;
          const isStressPause = Boolean(
            character &&
              spaceLength === 1 &&
              currChunk &&
              ((currChunk.bolded && !isBolded) ||
                (currChunk.italicized && !isItalicized) ||
                (currChunk.underlined && !isUnderlined) ||
                (currChunk.tilde && !tilde))
          );
          const duration: number =
            speed === 0
              ? 0
              : (isEmDashPause
                  ? letterPause * emDashPause
                  : isPhrasePause
                  ? letterPause * phrasePause
                  : isStressPause
                  ? letterPause * stressPause
                  : letterPause) / speed;

          if (phraseUnpauseLength === 1) {
            // start voiced phrase
            currChunk = {
              text: char,
              duration,
              speed,
              voicedSyllable,
              voiced,
              yelled,
              raw,
              centered,
              bolded,
              italicized,
              underlined,
              wavy,
              shaky,
              tilde,
              pitch,
            };
            const phrase = {
              target: textTarget,
              text: char,
              chunks: [currChunk],
            };
            linePhrases.push(phrase);
            allPhrases.push(phrase);
          } else {
            // continue voiced phrase
            const currentPhrase = linePhrases.at(-1);
            if (currentPhrase) {
              currentPhrase.text ??= "";
              currentPhrase.text += char;
              if (
                currChunk &&
                !currChunk.duration &&
                !this.isWhitespace(char) &&
                !this.isWhitespace(currChunk.text) &&
                bolded === currChunk.bolded &&
                italicized === currChunk.italicized &&
                underlined === currChunk.underlined &&
                wavy === currChunk.wavy &&
                shaky === currChunk.shaky &&
                speed === currChunk.speed
              ) {
                // No need to create new element, simply append char to previous chunk
                currChunk.text += char;
              } else {
                // Create new element and chunk
                currChunk = {
                  text: char,
                  duration,
                  speed,
                  voicedSyllable,
                  voiced,
                  yelled,
                  raw,
                  centered,
                  bolded,
                  italicized,
                  underlined,
                  wavy,
                  shaky,
                  tilde,
                  pitch,
                };
                currentPhrase.chunks ??= [];
                currentPhrase.chunks.push(currChunk);
              }
            }
          }
          i += 1;
        }
      }
      return linePhrases;
    };

    const lines = content?.trim().split("\n");
    for (let l = 0; l < lines.length; l += 1) {
      const line = lines[l]!?.trimStart();
      if (line.match(this.PARENTHETICAL_REGEX)) {
        alignModifier = "center";
        speedModifier = 0;
        processLine(line, textTarget);
        alignModifier = "";
        speedModifier = 1;
        continue;
      }
      const linePhrases = processLine(line, textTarget);
      if (l < lines.length - 1) {
        if (line) {
          const lastTextPhrase = linePhrases.findLast((p) => p.text);
          if (lastTextPhrase) {
            lastTextPhrase.text += "\n";
            lastTextPhrase.chunks ??= [];
            lastTextPhrase.chunks.push({ text: "\n", duration: 0, speed: 1 });
          }
        } else {
          allPhrases.push({
            target: textTarget,
            text: "\n",
            chunks: [{ text: "\n", duration: 0, speed: 1 }],
          });
        }
      }
    }

    allPhrases.forEach((phrase) => {
      const target = phrase.target || "";
      const typewriter = this.lookupContextValue("typewriter", target);
      const letterPause = typewriter?.letter_pause ?? 0;
      const interjectionPause = typewriter?.punctuated_pause_scale ?? 1;
      const punctuatedMatcher = typewriter?.punctuated
        ? new Matcher(typewriter?.punctuated)
        : undefined;
      // Erase any syllables that occur on any unvoiced chars at the end of phrases
      // (whitespace, punctuation, etc).
      if (phrase.chunks) {
        for (let c = phrase.chunks.length - 1; c >= 0; c -= 1) {
          const chunk = phrase.chunks[c]!;
          if (!chunk.voiced) {
            chunk.voicedSyllable = false;
          } else {
            break;
          }
        }
        // Voice any phrases that are entirely composed of ellipsis.
        if (phrase.text) {
          if (punctuatedMatcher?.test(phrase.text)) {
            const typewriterSynth = this.lookupContextValue(
              "synth",
              target,
              "typewriter"
            );
            const minSynthDuration = this.getMinSynthDuration(typewriterSynth);
            for (let c = 0; c < phrase.chunks.length; c += 1) {
              const chunk = phrase.chunks[c]!;
              if (chunk.text && !this.isWhitespace(chunk.text)) {
                chunk.punctuatedSyllable = true;
                chunk.duration = Math.max(
                  minSynthDuration,
                  letterPause * interjectionPause
                );
              }
            }
          }
        }
      }
    });

    if (character && !this.context?.system?.simulating) {
      stressPhrases(
        allPhrases,
        this.lookupContextValue("character", character)
      );
    }

    let time = delay;
    const result: Instructions = {
      end: 0,
    };
    if (uuids.length > 0) {
      result.uuids ??= [];
      result.uuids = uuids;
    }
    if (choice) {
      result.choices ??= [];
      result.choices.push(target);
    }
    const synthEvents: Record<
      string,
      { time?: number; speed?: number; bend?: number }[]
    > = {};
    allPhrases.forEach((phrase) => {
      const target = phrase.target || "";
      const typewriter = this.lookupContextValue("typewriter", target);
      const fadeDuration = typewriter?.fade_duration ?? 0;
      const letterPause = typewriter?.letter_pause ?? 0;
      const animationOffset = typewriter?.animation_offset ?? 0;
      if (phrase.chunks) {
        phrase.chunks.forEach((c) => {
          // Text Event
          if (c.text != null) {
            const event: TextInstruction = { control: "show", text: c.text };
            if (time) {
              event.after = time;
            }
            if (fadeDuration) {
              event.over = fadeDuration;
            }
            if (c.underlined) {
              event.style ??= {};
              event.style["text_decoration"] = "underline";
            }
            if (c.italicized) {
              event.style ??= {};
              event.style["font_style"] = "italic";
            }
            if (c.bolded) {
              event.style ??= {};
              event.style["font_weight"] = "bold";
            }
            if (c.centered) {
              event.style ??= {};
              event.style["text_align"] = "center";
            }
            if (c.raw) {
              event.style ??= {};
              event.style["white_space"] = "pre";
            }

            // Wavy animation
            if (c.wavy) {
              event.style ??= {};
              const animation = (this.context as any)?.animation?.["wavy"];
              if (animation) {
                event.style["display"] = "inline-block";
                event.style["animation_name"] = animation.$name;
                event.style["animation_timing_function"] =
                  animation.timing.easing;
                event.style["animation_iteration_count"] =
                  animation.timing.iterations;
                event.style["animation_duration"] = animation.timing.duration;
                event.style["animation_delay"] = c.wavy * animationOffset * -1;
              }
            }
            // Shaky animation
            if (c.shaky) {
              event.style ??= {};
              const animation = (this.context as any)?.animation?.["shaky"];
              if (animation) {
                event.style["display"] = "inline-block";
                event.style["animation_name"] = animation.$name;
                event.style["animation_timing_function"] =
                  animation.timing.easing;
                event.style["animation_iteration_count"] =
                  animation.timing.iterations;
                event.style["animation_duration"] = animation.timing.duration;
                event.style["animation_delay"] = c.shaky * animationOffset * -1;
              }
            }
            // Debug colorization
            if (debug) {
              if (c.duration > letterPause) {
                // color pauses (longer time = darker color)
                event.style ??= {};
                event.style["background_color"] = `hsla(0, 100%, 50%, ${
                  0.5 - letterPause / c.duration
                })`;
              }
              if (c.voicedSyllable) {
                // color beeps
                event.style ??= {};
                event.style["background_color"] = `hsl(185, 100%, 50%)`;
              }
            }
            result.text ??= {};
            result.text[target] ??= [];
            result.text[target]!.push(event);
          }
          // Image Event
          if (c.tag === "image") {
            const event: ImageInstruction = {
              control: (c.control || "show") as ImageInstruction["control"],
              assets: c.assets,
            };
            if (time) {
              event.after = time;
            }
            if (fadeDuration) {
              event.over = fadeDuration;
            }
            if (c.clauses) {
              const withValue = c.clauses?.with;
              if (withValue) {
                event.with = withValue;
              }
              const afterValue = c.clauses?.after;
              if (afterValue) {
                event.after = (event.after ?? 0) + afterValue;
              }
              const overValue = c.clauses?.over;
              if (overValue) {
                event.over = overValue;
              }
            }
            result.image ??= {};
            result.image[target] ??= [];
            result.image[target]!.push(event);
          }
          // Audio Event
          if (c.tag === "audio") {
            const event: AudioInstruction = {
              control: (c.control || "play") as AudioInstruction["control"],
              assets: c.assets,
            };
            if (time) {
              event.after = time;
            }
            if (c.clauses) {
              const afterValue = c.clauses?.after;
              if (afterValue) {
                event.after = (event.after ?? 0) + afterValue;
              }
              const overValue = c.clauses?.over;
              if (overValue) {
                event.over = overValue;
              }
              const unmuteValue = c.clauses?.unmute;
              if (unmuteValue) {
                event.fadeto = 1;
              }
              const toValue = c.clauses?.fadeto;
              if (toValue != null) {
                event.fadeto = toValue;
              }
              const muteValue = c.clauses?.mute;
              if (muteValue) {
                event.fadeto = 0;
              }
              const loopValue = c.clauses?.loop;
              if (loopValue) {
                event.loop = true;
              }
              const onceValue = c.clauses?.once;
              if (onceValue) {
                event.loop = false;
              }
              const nowValue = c.clauses?.now;
              if (nowValue) {
                event.now = nowValue;
              }
            }
            result.audio ??= {};
            result.audio[target] ??= [];
            result.audio[target]!.push(event);
          }
          // Synth Event
          if (c.duration) {
            if (c.punctuatedSyllable) {
              const synthName = this.lookupContextValueName(
                "synth",
                "typewriter"
              );
              synthEvents[synthName] ??= [];
              synthEvents[synthName]!.push({
                time,
                speed: c.speed ?? 1,
                bend: c.pitch ?? 0,
              });
            } else if (c.voicedSyllable) {
              const synthName = character
                ? this.lookupContextValueName("synth", character, "character")
                : this.lookupContextValueName(
                    "synth",
                    target || "",
                    "typewriter"
                  );
              synthEvents[synthName] ??= [];
              synthEvents[synthName]!.push({
                time,
                speed: c.speed ?? 1,
                bend: c.pitch ?? 0,
              });
            }
          }

          time += c.duration;
        });
      }
    });

    Object.entries(synthEvents).forEach(([synthName, tones]) => {
      result.audio ??= {};
      result.audio["typewriter"] ??= [];
      result.audio["typewriter"]!.push({
        control: "play",
        assets: [
          synthName +
            "~" +
            tones
              .map((tone) => `t${tone.time}s${tone.speed}b${tone.bend}`)
              .join("~"),
        ],
      });
    });

    result.end = time;

    return result;
  }
}
