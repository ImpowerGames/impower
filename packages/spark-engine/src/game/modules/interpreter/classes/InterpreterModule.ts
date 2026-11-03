import { getCharacterIdentifier } from "@impower/sparkdown/src/compiler/utils/getCharacterIdentifier";
import { ObjectValue } from "@impower/sparkdown/src/runtime/Value";
import { Module } from "../../../core/classes/Module";
import type {
AudioInstruction,
CutsceneInstruction,
ImageInstruction,
LoadInstruction,
LayoutInstruction,
TextInstruction,
} from "../../../core/types/Instruction";
import type { Instructions } from "../../../core/types/Instructions";
import { getNumberValue } from "../../../core/utils/getNumberValue";
import { getTimeValue } from "../../../core/utils/getTimeValue";
import {
  type InterpreterBuiltins,
  interpreterBuiltinDefinitions,
} from "../interpreterBuiltinDefinitions";
import type { Chunk } from "../types/Chunk";
import type { InstructionOptions } from "../types/InstructionOptions";
import type { Phrase } from "../types/Phrase";
import { stressPhrases } from "../utils/stressPhrases";
import { Matcher } from "./helpers/Matcher";

export interface InterpreterConfig {}

export interface InterpreterState {
  buffer?: Instructions[];
  box?: ShownBox;
}

export interface Cue {
  name: string;
  parenthetical: string;
  position: string;
  character?: string;
}

export interface ShownBox {
  target: string;
  cue?: Cue;
  text: TextInstruction[];
}

export interface InterpreterMessageMap extends Record<string, any> {}

export class InterpreterModule extends Module<
  InterpreterState,
  InterpreterMessageMap,
  InterpreterBuiltins
> {
  MARKERS = ["^", "*", "_", "~~", "::"];

  CONTROL_TAGS = ["speed", "pitch", "p", "wait", "w", "!", "/!"];

  RICH_TEXT_TAGS = [
    "b",
    "i",
    "u",
    "s",
    "uppercase",
    "allcaps",
    "lowercase",
    "smallcaps",
    "nobr",
    "color",
    "mark",
    "size",
    "align",
    "alpha",
    "font-weight",
    "line-height",
    "cspace",
    "voffset",
    "indent",
    "sub",
    "sup",
    "br",
    "noparse",
  ];

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
    "open",
    "close",
    "navigate",
    "load",
  ];

  LAYOUT_CONTROL_KEYWORDS = ["open", "close", "navigate"];

  LOAD_CONTROL_KEYWORDS = ["load"];

  MOVIE_CONTROL_KEYWORDS = ["play"];

  ASSET_VALUE_ARG_KEYWORDS = ["after", "over", "to", "with", "ease"];

  ASSET_FLAG_ARG_KEYWORDS = ["wait", "loop", "once", "mute", "unmute", "now"];

  ASSET_ARG_KEYWORDS = [
    ...this.ASSET_VALUE_ARG_KEYWORDS,
    ...this.ASSET_FLAG_ARG_KEYWORDS,
  ];

  CHAR_REGEX =
    /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})|./gsu;

  CHARACTER_REGEX =
    /^(.*?)([ \t]*)([(][^()]*?[)])?([ \t]*)(?:(\[)([ \t]*)(.*?)([ \t]*)(\]))?([ \t]*)$/;

  PARENTHETICAL_REGEX =
    /^([ \t]*)((?:[=].*?[=]|[<].*?[>]|[ \t]*)*)([ \t]*)([(][^()]*?[)])([ \t]*)((?:[=].*?[=]|[<].*?[>]|[ \t]*)*)$/;

  WHITESPACE_REGEX = /[ \t\r\n]+/;

  ASSET_LINE_REGEX = /^[ \t]*(?:(?:\[\[.*?\]\]|\(\(.*?\)\))[ \t]*)+$/;

  protected _targetPrefixMap: Record<string, string> = {};

  protected _characterNameMap: Record<string, string> = {};

  protected _matcherCache = new Map<string, Matcher>();

  protected _routing?: { target: string; character?: string; group?: string };

  protected getMatcher(pattern: string | undefined): Matcher | undefined {
    if (!pattern) {
      return undefined;
    }
    let matcher = this._matcherCache.get(pattern);
    if (!matcher) {
      matcher = new Matcher(pattern);
      this._matcherCache.set(pattern, matcher);
    }
    return matcher;
  }

  override getBuiltins() {
    return interpreterBuiltinDefinitions();
  }

  override getStored() {
    return [];
  }

  override onInit() {
    this.setup();
  }

  override onProgramUpdate() {
    this.setup();
    delete this._routing;
    delete this._state.box;
  }

  setup() {
    this._characterNameMap = {};
    for (const [k, v] of Object.entries(this.context.character || {})) {
      const name = v.name;
      if (typeof name === "string" && name) {
        this._characterNameMap[name] = k;
      }
    }
    this._targetPrefixMap = {};
    for (const [k, v] of Object.entries(
      this.context.config?.interpreter.directives || {},
    )) {
      this._targetPrefixMap[v] = k;
    }
  }

  getCharacterIdentifier(characterName: string): string {
    return getCharacterIdentifier(characterName);
  }

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
    if (a.layout || b.layout) {
      a.layout ??= {};
      if (b.layout) {
        for (const [k, v] of Object.entries(b.layout)) {
          a.layout[k] ??= [];
          if (prefix) {
            a.layout[k]!.unshift(...v);
          } else {
            a.layout[k]!.push(...v);
          }
        }
      }
    }
    if (b.load) {
      a.load ??= [];
      if (prefix) {
        a.load.unshift(...b.load);
      } else {
        a.load.push(...b.load);
      }
    }
    if (b.cutscene) {
      a.cutscene ??= [];
      if (prefix) {
        a.cutscene.unshift(...b.cutscene);
      } else {
        a.cutscene.push(...b.cutscene);
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

  protected loadBeat(load: LoadInstruction[]): Instructions {
    const beat: Instructions = { load, end: 0 };
    if (this._state.box) beat.extended = {};
    return beat;
  }

  protected cutsceneBeat(cutscene: CutsceneInstruction): Instructions {
    const beat: Instructions = { cutscene: [cutscene], end: 0 };
    if (this._state.box) beat.extended = {};
    return beat;
  }

  protected resolveCue(characterDeclaration: string): Cue {
    const match = characterDeclaration.match(this.CHARACTER_REGEX);
    const characterNameMatch = match?.[1] || "";
    const characterParentheticalMatch = match?.[3] || "";
    const characterPositionMatch = match?.[7] || "";
    const characterMap = this.context?.["character"] as any;
    const characterId = this._characterNameMap[characterNameMatch] || "";
    const characterObj =
      characterMap?.[characterNameMatch] || characterMap?.[characterId];
    const characterName =
      typeof characterObj?.name === "string" && characterObj.name
        ? characterObj.name
        : characterNameMatch;
    const position =
      characterPositionMatch === "<"
        ? "left"
        : characterPositionMatch === ">"
          ? "right"
          : characterPositionMatch;
    return {
      name: characterName,
      parenthetical: characterParentheticalMatch,
      position,
      character: characterObj?.$name,
    };
  }

  protected liftParenthetical(
    content: string,
  ): { parenthetical: string; rest: string } | null {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (!line.trim() || this.ASSET_LINE_REGEX.test(line)) {
        continue;
      }
      const match = line.match(this.PARENTHETICAL_REGEX);
      if (!match) {
        return null;
      }
      lines.splice(i, 1);
      return { parenthetical: match[4] || "", rest: lines.join("\n") };
    }
    return null;
  }

  protected appendBeat(
    target: string,
    characterDeclaration: string | undefined,
    content: string,
    choices: string[],
    pause = false,
    extend?: { spaces: string },
  ): void {
    this._state.buffer ??= [];
    const defaultTarget = this._targetPrefixMap?.[""] || "";
    const box = this._state.box;
    const ownCue = characterDeclaration
      ? this.resolveCue(characterDeclaration)
      : undefined;
    let boxContent = content;
    let boxCue = box?.cue;
    let lifted: { parenthetical: string; rest: string } | null = null;
    if (box?.cue) {
      lifted = this.liftParenthetical(content);
      if (lifted) boxContent = lifted.rest;
      const speaks = Boolean(ownCue?.name);
      boxCue = {
        name: speaks ? ownCue!.name : box.cue.name,
        position: speaks ? ownCue!.position : box.cue.position,
        character: speaks ? ownCue!.character : box.cue.character,
        parenthetical:
          ownCue?.parenthetical || lifted?.parenthetical || box.cue.parenthetical,
      };
    }
    const boxTarget = box?.target ?? "";
    const typedBy = box?.cue ? boxCue : ownCue;
    const boxInstructions =
      box && (boxContent || pause || lifted)
        ? this.parse(boxContent, boxTarget, {
            character: typedBy?.character,
            position: typedBy?.position,
          })
        : undefined;
    const carries = Boolean(
      box &&
        (boxInstructions?.text ||
          pause ||
          lifted ||
          (box.cue && ownCue?.name)),
    );
    const textTarget = carries ? boxTarget : target || defaultTarget;
    const cue = carries ? boxCue : ownCue;
    const options: InstructionOptions = {};
    let characterNameInstructions: Instructions | undefined = undefined;
    let characterParentheticalInstructions: Instructions | undefined =
      undefined;
    if (cue) {
      options.character = cue.character;
      options.position = cue.position;
      if (cue.name) {
        characterNameInstructions = this.parse(
          cue.name,
          "character_name",
          options,
        );
      }
      if (cue.parenthetical) {
        characterParentheticalInstructions = this.parse(
          cue.parenthetical,
          "character_parenthetical",
          options,
        );
      }
    }
    if (content || pause) {
      const contentInstructions =
        boxInstructions ?? this.parse(content, textTarget, options);
      if (pause && !contentInstructions.text) {
        contentInstructions.text = { [textTarget]: [] };
      }
      if (carries && box) {
        const text = (contentInstructions.text ??= {});
        text[textTarget] = [...box.text, ...(text[textTarget] ?? [])];
        const extended: Record<string, number> = {
          [textTarget]: box.text.length,
        };
        if (cue?.name && cue.name === box.cue?.name) {
          extended["character_name"] =
            characterNameInstructions?.text?.["character_name"]?.length ?? 0;
        }
        if (
          cue?.parenthetical &&
          cue.parenthetical === box.cue?.parenthetical
        ) {
          extended["character_parenthetical"] =
            characterParentheticalInstructions?.text?.[
              "character_parenthetical"
            ]?.length ?? 0;
        }
        contentInstructions.extended = extended;
      } else if (box) {
        contentInstructions.extended = {};
      }
      if (contentInstructions.text) {
        if (characterParentheticalInstructions) {
          this.merge(
            contentInstructions,
            characterParentheticalInstructions,
            true,
          );
        }
        if (characterNameInstructions) {
          this.merge(contentInstructions, characterNameInstructions, true);
        }
      }
      const loads = contentInstructions.load;
      delete contentInstructions.load;
      const cutscenes = contentInstructions.cutscene;
      delete contentInstructions.cutscene;
      const hasOtherContent =
        contentInstructions.text ||
        contentInstructions.image ||
        contentInstructions.audio ||
        contentInstructions.layout ||
        Number(contentInstructions.end) > 0;
      if ((!loads && !cutscenes) || hasOtherContent) {
        const lastTextbox = this._state.buffer.at(-1);
        if (
          lastTextbox &&
          !lastTextbox?.text &&
          !lastTextbox?.load &&
          !lastTextbox?.cutscene
        ) {
          this.merge(lastTextbox, contentInstructions);
          if (contentInstructions.extended) {
            lastTextbox.extended = contentInstructions.extended;
          } else {
            delete lastTextbox.extended;
          }
        } else {
          this._state.buffer.push(contentInstructions);
        }
      }
      if (loads) {
        this._state.buffer.push(this.loadBeat(loads));
      }
      for (const cutscene of cutscenes ?? []) {
        this._state.buffer.push(this.cutsceneBeat(cutscene));
      }
      if (extend) {
        const shown = (contentInstructions.text?.[textTarget] ?? []).map(
          (event) => {
            const copy = { ...event };
            delete copy.after;
            delete copy.over;
            return copy;
          },
        );
        for (const space of extend.spaces) {
          shown.push({ control: "show", text: space });
        }
        this._state.box = { target: textTarget, text: shown };
        if (cue) this._state.box.cue = cue;
      } else if (contentInstructions.text) {
        delete this._state.box;
      }
    }
    if (choices?.length > 0) {
      delete this._state.box;
      let lastTextbox = this._state.buffer?.at(-1);
      if (!lastTextbox) {
        lastTextbox = { end: 0 };
        this._state.buffer.push(lastTextbox);
      }
      for (let i = 0; i < choices.length; i += 1) {
        const choice = choices[i]!;
        const choiceInstructions = this.parse(choice, `choice ${i}`, {
          ...options,
          delay: lastTextbox.end,
          choice: true,
        });
        this.merge(lastTextbox, choiceInstructions);
      }
    }
  }

  queue(tables: ObjectValue[], choices: string[], content: string): void {
    const read = (table: ObjectValue | undefined, key: string): unknown =>
      (table?.value?.get(key) as { value?: unknown } | undefined)?.value;
    if (tables.some((table) => typeof read(table, "load") === "string")) {
      const tableText = (table: ObjectValue) => {
        const text = read(table, "text");
        return typeof text === "string" ? text : "";
      };
      this._state.buffer ??= [];
      let before: ObjectValue[] = [];
      let load: string | null = null;
      const flush = () => {
        const text = before.map(tableText).join("");
        if (load === null) {
          if (before.length > 0) this.queue(before, [], text);
        } else {
          const loadInstructions: LoadInstruction[] = `${load}${text}`
            .split(this.WHITESPACE_REGEX)
            .filter(Boolean)
            .map((name) => ({ name }));
          this._state.buffer!.push(this.loadBeat(loadInstructions));
        }
        before = [];
      };
      for (const table of tables) {
        const next = read(table, "load");
        if (typeof next === "string") {
          flush();
          load = next;
        } else {
          before.push(table);
        }
      }
      flush();
      if (choices.length > 0) {
        this.appendBeat("", undefined, "", choices);
      }
      return;
    }
    const pause = tables.some((table) => read(table, "pause") === true);
    if (read(tables[0], "continues") !== true) {
      delete this._state.box;
    }
    const routed = tables.find((table) => {
      const target = read(table, "target");
      return typeof target === "string" && target;
    });
    const groupOf = (table: ObjectValue | undefined): string | undefined => {
      const group = read(table, "group");
      return typeof group === "string" ? group : undefined;
    };
    const inheritGroup = groupOf(
      tables.find((table) => read(table, "inherit") === true),
    );
    const group = tables.map(groupOf).filter((value) => value != null).at(-1);
    const remembered = this._routing;
    const inherits =
      inheritGroup != null && remembered?.group === inheritGroup;
    let routing: { target: string; character?: string } = { target: "" };
    if (inherits) {
      routing = { target: remembered!.target };
      if (remembered!.character) routing.character = remembered!.character;
    } else if (routed) {
      const characterRaw = read(routed, "character");
      routing = { target: read(routed, "target") as string };
      if (typeof characterRaw === "string" && characterRaw) {
        routing.character = characterRaw;
      }
    }
    if (tables.length > 0) {
      this._routing = group == null ? routing : { ...routing, group };
    }
    const extending = tables.findLast((table) => read(table, "extend") === true);
    const extendText = read(extending, "text");
    this.appendBeat(
      routing.target,
      routing.character,
      content,
      choices,
      pause,
      extending
        ? {
            spaces:
              typeof extendText === "string"
                ? (/[ \t]*$/.exec(extendText)?.[0] ?? "")
                : "",
          }
        : undefined,
    );
  }

  shouldFlush(): boolean {
    return Boolean(
      this._state.buffer?.[0]?.load ||
      this._state.buffer?.[0]?.cutscene ||
      this._state.buffer?.[0]?.text ||
      this._state.buffer?.[0]?.layout ||
      Number(this._state.buffer?.[0]?.end) > 0 ||
      this._state.buffer?.some((b) => b.load || b.cutscene),
    );
  }

  get hasQueuedBeats(): boolean {
    return (this._state.buffer?.length ?? 0) > 0;
  }

  requeue(instructions: Instructions): void {
    this._state.buffer ??= [];
    this._state.buffer.unshift(instructions);
  }

  flush() {
    return this._state.buffer?.shift();
  }

  clearQueuedBeats(): void {
    this._state.buffer = [];
    delete this._routing;
    delete this._state.box;
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

  protected getMinSynthDuration(synth: { envelope?: Record<string, number> }) {
    const synthEnvelope = synth?.envelope;
    return synthEnvelope
      ? (synthEnvelope["attack"] ?? 0) +
          (synthEnvelope["decay"] ?? 0) +
          (synthEnvelope["sustain"] ?? 0) +
          (synthEnvelope["release"] ?? 0)
      : 0;
  }

  protected createImageChunk(imageTagContent: string): Chunk {
    const defaultLayer =
      this.context?.config?.interpreter?.fallbacks?.layer || "portrait";
    const imageChunk = this.createAssetChunk(
      imageTagContent,
      "image",
      "show",
      defaultLayer,
    );
    if (imageChunk.control !== "hide" && imageChunk.assets?.length) {
      this._game.module?.assets?.notice("image", imageChunk.assets);
    }
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
      (name) => (this.context as any)?.["animation"]?.[name],
    );
    const maxAnimationDuration = Math.max(
      ...allAnimations.map((a) => getTimeValue(a?.timing?.duration) ?? 0),
    );
    if (imageChunk.clauses?.wait) {
      imageChunk.duration += afterDuration ?? 0;
      imageChunk.duration += overDuration ?? maxAnimationDuration ?? 0;
    }
    return imageChunk;
  }

  protected createLayoutChunk(layoutTagContent: string): Chunk {
    const verb = layoutTagContent.replaceAll("\t", " ").trim().split(" ")[0];
    const layoutChunk =
      verb === "navigate"
        ? this.createNavigateChunk(layoutTagContent)
        :
          this.createAssetChunk(layoutTagContent, "layout", "open", "");
    this.applyScreenWaitDuration(layoutChunk);
    return layoutChunk;
  }

  protected createNavigateChunk(navigateTagContent: string): Chunk {
    const tokens = navigateTagContent
      .replaceAll("\t", " ")
      .split(" ")
      .filter((t) => t !== "");
    let screen = "";
    let destination = "";
    let i = 1;
    if (tokens[i] && !this.ASSET_ARG_KEYWORDS.includes(tokens[i]!)) {
      screen = tokens[i]!;
      i += 1;
    }
    if (tokens[i] === "to") {
      i += 1;
      if (tokens[i] && !this.ASSET_ARG_KEYWORDS.includes(tokens[i]!)) {
        destination = tokens[i]!;
        i += 1;
      }
    }
    const clauses = this.parseAssetClauses(tokens.slice(i));
    return {
      tag: "layout",
      control: "navigate",
      target: screen,
      assets: destination ? [destination] : [],
      clauses,
      duration: 0,
      speed: 1,
    };
  }

  protected createLoadChunk(loadTagContent: string): Chunk {
    return this.createAssetChunk(loadTagContent, "load", "load", "");
  }

  protected createCutsceneChunk(cutsceneTagContent: string): Chunk {
    const cutsceneChunk = this.createAssetChunk(
      cutsceneTagContent,
      "cutscene",
      "play",
      "",
    );
    if (cutsceneChunk.target) {
      this._game.module?.assets?.notice("image", [cutsceneChunk.target]);
    }
    return cutsceneChunk;
  }

  protected applyScreenWaitDuration(screenChunk: Chunk): void {
    const withEffectName =
      screenChunk.clauses?.["with"] || screenChunk.target || "";
    const afterDuration = screenChunk.clauses?.["after"];
    const overDuration = screenChunk.clauses?.["over"];
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
    }
    const allAnimations = animationNames.map(
      (name) => (this.context as any)?.["animation"]?.[name],
    );
    const maxAnimationDuration = allAnimations.length
      ? Math.max(
          ...allAnimations.map((a) => getTimeValue(a?.timing?.duration) ?? 0),
        )
      : 0;
    if (screenChunk.clauses?.wait) {
      screenChunk.duration += afterDuration ?? 0;
      screenChunk.duration += overDuration ?? maxAnimationDuration ?? 0;
    }
  }

  protected createAudioChunk(audioTagContent: string): Chunk {
    const defaultChannel =
      this.context?.config?.interpreter?.fallbacks?.channel || "sound";
    const audioChunk = this.createAssetChunk(
      audioTagContent,
      "audio",
      "play",
      defaultChannel,
    );
    if (
      (audioChunk.control === "play" || audioChunk.control === "queue") &&
      audioChunk.assets?.length
    ) {
      this._game.module?.assets?.notice("audio", audioChunk.assets);
    }
    const afterDuration = audioChunk.clauses?.["after"];
    const overDuration = audioChunk.clauses?.["over"];
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
    defaultTarget: string,
  ): Chunk {
    let parts = assetTagContent
      .replaceAll("\t", " ")
      .split(" ")
      .filter((part) => part !== "");
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
        for (const a of part.split("+")) {
          if (a) {
            assets.push(a);
          }
        }
      }
    }
    const clauses = this.parseAssetClauses(args);
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

  protected parseAssetClauses(args: string[]): Record<string, unknown> {
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
          if (arg === "ease") {
            clauses[arg] = value;
          }
        } else {
          clauses[arg] = true;
        }
      }
    }
    return clauses;
  }

  parse(
    content: string,
    target: string,
    options?: InstructionOptions,
  ): Instructions {
    const allPhrases: Phrase[] = [];

    const textTarget = target;
    const character = options?.character;

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
        "typewriter",
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
        Math.round(minSynthDuration / letterPause),
      );
      const voicedMatcher = this.getMatcher(typewriter?.voiced);
      const yelledMatcher = this.getMatcher(typewriter?.yelled);

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
            if (char === "`") {
              i += 1;
              raw = !raw;
              continue;
            }
            if (!raw) {
              if (char === "\\") {
                i += 1;
                escaped = true;
                continue;
              }
              if (char === "[" && nextChar === "[") {
                let imageTagContent = "";
                let closed = false;
                const startIndex = i;
                i += 2;
                while (i < chars.length) {
                  if (chars[i] === "]" && chars[i + 1] === "]") {
                    closed = true;
                    const verb = imageTagContent
                      .replaceAll("\t", " ")
                      .trimStart()
                      .split(" ")[0];
                    const isScreenDirective =
                      !!verb && this.LAYOUT_CONTROL_KEYWORDS.includes(verb);
                    const isLoadDirective =
                      !!verb && this.LOAD_CONTROL_KEYWORDS.includes(verb);
                    const isCutsceneDirective =
                      !!verb && this.MOVIE_CONTROL_KEYWORDS.includes(verb);
                    const directiveChunk = isLoadDirective
                      ? this.createLoadChunk(imageTagContent)
                      : isScreenDirective
                        ? this.createLayoutChunk(imageTagContent)
                        : isCutsceneDirective
                          ? this.createCutsceneChunk(imageTagContent)
                          : this.createImageChunk(imageTagContent);
                    const phrase = {
                      target: directiveChunk.target,
                      chunks: [directiveChunk],
                    };
                    linePhrases.push(phrase);
                    allPhrases.push(phrase);
                    startNewPhrase();
                    i += 2;
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
              if (char === "<" && !this.isWhitespace(chars[i + 1])) {
                let control = "";
                let arg = "";
                const startIndex = i;
                i += 1;
                while (
                  chars[i] &&
                  chars[i] !== ">" &&
                  chars[i] !== ":" &&
                  chars[i] !== "="
                ) {
                  control += chars[i];
                  i += 1;
                }
                if (chars[i] === ":" || chars[i] === "=") {
                  i += 1;
                  while (chars[i] && chars[i] !== ">") {
                    arg += chars[i];
                    i += 1;
                  }
                }
                control = control.trimEnd();
                arg = arg.trim();
                const closed = chars[i] === ">";
                const name = (control.split(/\s/)[0] ?? "").replace(/^\//, "");
                const known =
                  this.CONTROL_TAGS.includes(name) ||
                  this.RICH_TEXT_TAGS.includes(name.toLowerCase());
                if (closed && known) {
                  i += 1;
                  if (control) {
                    if (control === "speed") {
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
              const styleMarker = this.MARKERS.find(
                (marker) =>
                  marker === chars.slice(i, i + marker.length).join(""),
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
                    ([activeMarker]) => activeMarker === currentMarker,
                  ) ||
                  activeMarks.findLast(
                    ([activeMarker]) =>
                      activeMarker.slice(0, styleMarker.length) ===
                      currentMarker.slice(0, styleMarker.length),
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
            m.startsWith("^"),
          );
          const activeUnderlineMark = activeMarks.findLast(([m]) =>
            m.startsWith("_"),
          );
          const activeBoldItalicMark = activeMarks.findLast(([m]) =>
            m.startsWith("***"),
          );
          const activeBoldMark = activeMarks.findLast(([m]) => m === "**");
          const activeItalicMark = activeMarks.findLast(([m]) => m === "*");
          const activeWavyMark = activeMarks.findLast(([m]) =>
            m.startsWith("~~"),
          );
          const activeShakyMark = activeMarks.findLast(([m]) =>
            m.startsWith("::"),
          );
          const isCentered = Boolean(activeCenteredMark);
          const isUnderlined = Boolean(activeUnderlineMark);
          const isItalicized =
            Boolean(activeBoldItalicMark) || Boolean(activeItalicMark);
          const isBolded =
            Boolean(activeBoldItalicMark) || Boolean(activeBoldMark);
          const voiced = Boolean(voicedMatcher?.test(char));

          if (activeWavyMark) {
            const wavyIndex = wavyIndexMap.get(activeWavyMark);
            if (wavyIndex != null) {
              wavyIndexMap.set(activeWavyMark, wavyIndex + 1);
            } else {
              wavyIndexMap.set(activeWavyMark, 1);
            }
          }
          const wavy = activeWavyMark ? wavyIndexMap.get(activeWavyMark) : 0;

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
          const yelled = isYelled ? 1 : 0;
          const centered =
            alignModifier === "center"
              ? 1
              : isCentered && activeCenteredMark
                ? activeCenteredMark.length
                : isCentered
                  ? 1
                  : 0;
          const italicized = isItalicized ? 1 : 0;
          const bolded =
            isBolded && activeBoldItalicMark
              ? activeBoldItalicMark.length
              : isBolded
                ? 2
                : 0;
          const underlined =
            isUnderlined && activeUnderlineMark
              ? activeUnderlineMark.length
              : isUnderlined
                ? 1
                : 0;
          const pitch = pitchModifier;

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
              (currChunk.tilde && !tilde)),
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
                currChunk.text += char;
              } else {
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

    return this.chunksToInstructions(allPhrases, uuids, target, options);
  }

  protected chunksToInstructions(
    allPhrases: Phrase[],
    uuids: string[],
    target: string,
    options?: InstructionOptions,
  ): Instructions {
    const delay = options?.delay || 0;
    const choice = options?.choice;
    const character = options?.character;
    const debug = this.context?.system.debugging;
    for (const phrase of allPhrases) {
      const target = phrase.target || "";
      const typewriter = this.lookupContextValue("typewriter", target);
      const letterPause = typewriter?.letter_pause ?? 0;
      const interjectionPause = typewriter?.punctuated_pause_scale ?? 1;
      const punctuatedMatcher = this.getMatcher(typewriter?.punctuated);
      if (phrase.chunks) {
        for (let c = phrase.chunks.length - 1; c >= 0; c -= 1) {
          const chunk = phrase.chunks[c]!;
          if (!chunk.voiced) {
            chunk.voicedSyllable = false;
          } else {
            break;
          }
        }
        if (phrase.text) {
          if (punctuatedMatcher?.test(phrase.text)) {
            const typewriterSynth = this.lookupContextValue(
              "synth",
              target,
              "typewriter",
            );
            const minSynthDuration = this.getMinSynthDuration(typewriterSynth);
            for (let c = 0; c < phrase.chunks.length; c += 1) {
              const chunk = phrase.chunks[c]!;
              if (chunk.text && !this.isWhitespace(chunk.text)) {
                chunk.punctuatedSyllable = true;
                chunk.duration = Math.max(
                  minSynthDuration,
                  letterPause * interjectionPause,
                );
              }
            }
          }
        }
      }
    }

    if (character && !this.context?.system?.simulating) {
      const prosody = this.lookupContextValue("prosody", character);
      const inflection = this.lookupContextValue("inflection", character);
      stressPhrases(allPhrases, prosody, inflection);
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
    for (const phrase of allPhrases) {
      const target = phrase.target || "";
      const typewriter = this.lookupContextValue("typewriter", target);
      const fadeDuration = typewriter?.fade_duration ?? 0;
      const letterPause = typewriter?.letter_pause ?? 0;
      const animationOffset = typewriter?.animation_offset ?? 0;
      if (phrase.chunks) {
        for (const c of phrase.chunks) {
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
            if (debug) {
              if (c.duration > letterPause) {
                event.style ??= {};
                event.style["background_color"] = `hsla(0, 100%, 50%, ${
                  0.5 - letterPause / c.duration
                })`;
              }
              if (c.voicedSyllable) {
                event.style ??= {};
                event.style["background_color"] = `hsl(185, 100%, 50%)`;
              }
            }
            result.text ??= {};
            result.text[target] ??= [];
            result.text[target]!.push(event);
          }
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
              if (withValue != null) {
                event.with = withValue;
              }
              const afterValue = c.clauses?.after;
              if (afterValue != null) {
                event.after = (event.after ?? 0) + afterValue;
              }
              const overValue = c.clauses?.over;
              if (overValue != null) {
                event.over = overValue;
              }
              const easeValue = c.clauses?.ease;
              if (easeValue != null) {
                event.ease = easeValue;
              }
              if (c.clauses?.loop) {
                event.loop = true;
              }
              if (c.clauses?.once) {
                event.once = true;
              }
              if (c.clauses?.mute) {
                event.mute = true;
              }
            }
            result.image ??= {};
            result.image[target] ??= [];
            result.image[target]!.push(event);
          }
          if (c.tag === "load") {
            const names = [c.target, ...(c.assets ?? [])].filter(
              (name): name is string => Boolean(name),
            );
            for (const name of names) {
              const event: LoadInstruction = { name };
              const withValue = c.clauses?.with;
              if (withValue != null) {
                event.with = withValue;
              }
              result.load ??= [];
              result.load.push(event);
            }
          }
          if (c.tag === "cutscene" && c.target) {
            const event: CutsceneInstruction = { name: c.target };
            if (c.clauses?.loop) {
              event.loop = true;
            }
            if (c.clauses?.mute) {
              event.mute = true;
            }
            const withValue = c.clauses?.with;
            if (withValue != null) {
              event.with = withValue;
            }
            result.cutscene ??= [];
            result.cutscene.push(event);
          }
          if (c.tag === "layout") {
            const isNavigate = c.control === "navigate";
            const screen = isNavigate ? c.target || "" : "";
            const layoutName = isNavigate
              ? c.assets?.[0] || ""
              : c.target || "";
            if (layoutName || screen) {
              const event: LayoutInstruction = {
                control: (c.control || "open") as LayoutInstruction["control"],
                name: layoutName,
              };
              if (screen) {
                event.screen = screen;
              }
              if (time) {
                event.after = time;
              }
              if (c.clauses) {
                const withValue = c.clauses?.with;
                if (withValue != null) {
                  event.with = withValue;
                }
                const afterValue = c.clauses?.after;
                if (afterValue != null) {
                  event.after = (event.after ?? 0) + afterValue;
                }
                const overValue = c.clauses?.over;
                if (overValue != null) {
                  event.over = overValue;
                }
                const easeValue = c.clauses?.ease;
                if (easeValue != null) {
                  event.ease = easeValue;
                }
                const waitValue = c.clauses?.wait;
                if (waitValue) {
                  event.wait = true;
                }
              }
              const key = layoutName || screen;
              result.layout ??= {};
              result.layout[key] ??= [];
              result.layout[key]!.push(event);
            }
          }
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
                event.to = 1;
              }
              const toValue = c.clauses?.to;
              if (toValue != null) {
                event.to = toValue;
              }
              const muteValue = c.clauses?.mute;
              if (muteValue) {
                event.to = 0;
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
          if (c.duration) {
            if (c.punctuatedSyllable) {
              const synthName = this.lookupContextValueName(
                "synth",
                "typewriter",
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
                    "typewriter",
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
        }
      }
    }

    for (const [synthName, tones] of Object.entries(synthEvents)) {
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
    }

    result.end = time;

    return result;
  }
}
