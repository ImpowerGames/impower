import { GameContext } from "../../../core/types/GameContext";
import {
  AudioEvent,
  ButtonEvent,
  ImageEvent,
  TextEvent,
} from "../../../core/types/SequenceEvent";
import { Matcher } from "../classes/Matcher";
import { Chunk } from "../types/Chunk";
import { Phrase } from "../types/Phrase";
import { WriteResult } from "../types/WriteResult";
import { stressPhrases } from "./stressPhrases";

const SINGLE_MARKERS = ["|", "*", "_", "^"];
const DOUBLE_MARKERS = ["~~", "::"];
const MILLISECONDS_REGEX = /((?:\d*[.])?\d+)ms/;
const SECONDS_REGEX = /((?:\d*[.])?\d+)s/;
const CHAR_REGEX =
  /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})|./gsu;

const isWhitespaceOrEmpty = (part: string) => {
  if (!part) {
    return true;
  }
  return isWhitespace(part);
};

const isWhitespace = (part: string) => {
  if (!part) {
    return false;
  }
  for (let i = 0; i < part.length; i += 1) {
    const c = part[i]!;
    if (c !== " " && c !== "\n" && c !== "\r" && c !== "\t") {
      return false;
    }
  }
  return true;
};

const containsNewline = (part: string | undefined) => {
  if (!part) {
    return false;
  }
  for (let i = 0; i < part.length; i += 1) {
    const c = part[i]!;
    if (c === "\n" || c === "\r") {
      return true;
    }
  }
  return false;
};

const isDash = (part: string) => {
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
};

const getValue = (
  context: GameContext | undefined,
  type: string,
  name: string,
  ...fallbacks: string[]
) => {
  const value = context?.[type]?.[name];
  if (value) {
    return value;
  }
  for (let i = 0; i < fallbacks.length; i += 1) {
    const fallbackName = fallbacks[i] || "";
    const fallbackValue = context?.[type]?.[fallbackName];
    if (fallbackValue) {
      return fallbackValue;
    }
  }
  return context?.[type]?.["default"];
};

const getValueName = (
  context: GameContext | undefined,
  type: string,
  name: string,
  ...fallbacks: string[]
) => {
  const value = context?.[type]?.[name];
  if (value) {
    return name;
  }
  for (let i = 0; i < fallbacks.length; i += 1) {
    const fallbackName = fallbacks[i] || "";
    const fallbackValue = context?.[type]?.[fallbackName];
    if (fallbackValue) {
      return fallbackName;
    }
  }
  return "default";
};

const getInstanceName = (
  target: string,
  instanceNumber: number | undefined
): string => {
  if (instanceNumber != null) {
    return `${target} ${instanceNumber}`;
  }
  return target;
};

const getArgumentTimeValue = (
  args: string[],
  name: string
): number | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const val = args[argIndex + 1];
  if (val == null) {
    return undefined;
  }
  const numValue = Number(val);
  if (!Number.isNaN(numValue)) {
    return numValue;
  }
  const msMatch = val.match(MILLISECONDS_REGEX);
  if (msMatch) {
    const msVal = msMatch[1];
    const msNumValue = Number(msVal);
    if (!Number.isNaN(msNumValue)) {
      return msNumValue / 1000;
    }
  }
  const sMatch = val.match(SECONDS_REGEX);
  if (sMatch) {
    const sVal = sMatch[1];
    const sNumValue = Number(sVal);
    if (!Number.isNaN(sNumValue)) {
      return sNumValue;
    }
  }
  return undefined;
};

const isNumberValue = (arg: string | undefined): boolean => {
  const numValue = Number(arg);
  if (numValue == null || Number.isNaN(numValue)) {
    return false;
  }
  return true;
};

const getNumberValue = (
  arg: string | undefined,
  defaultValue: number
): number => {
  const numValue = Number(arg);
  if (numValue == null || Number.isNaN(numValue)) {
    return defaultValue;
  }
  return numValue;
};

const getArgumentNumberValue = (
  args: string[],
  name: string
): number | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const numValue = Number(args[argIndex + 1]);
  if (Number.isNaN(numValue)) {
    return undefined;
  }
  return numValue;
};

const getArgumentStringValue = (
  args: string[],
  name: string
): string | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  return args[argIndex + 1];
};

const getMinSynthDuration = (synth: {
  envelope: { attack: number; decay: number; sustain: number; release: number };
}) => {
  const synthEnvelope = synth?.envelope;
  return synthEnvelope
    ? (synthEnvelope.attack ?? 0) +
        (synthEnvelope.decay ?? 0) +
        (synthEnvelope.sustain ?? 0) +
        (synthEnvelope.release ?? 0)
    : 0;
};

const getNextLineIndex = (index: number, textChunks: Chunk[]) => {
  for (let i = index; i < textChunks.length; i += 1) {
    if (containsNewline(textChunks[i]?.text)) {
      return i;
    }
  }
  return undefined;
};

const invalidateOpenMarks = (
  marks: [string, number][],
  textChunks: Chunk[]
) => {
  // Invalidate any leftover open markers
  if (marks.length > 0) {
    while (marks.length > 0) {
      const [lastMark, lastMarkIndex] = marks[marks.length - 1]! || [];
      const prevTextChunk = textChunks[lastMarkIndex - 1];
      const isLineStart =
        !prevTextChunk || !containsNewline(prevTextChunk?.text);
      const nextLineIndex = getNextLineIndex(lastMarkIndex, textChunks);
      const invalid = textChunks
        .slice(lastMarkIndex, nextLineIndex)
        .map((x) => x);
      invalid.forEach((c) => {
        if (lastMark.startsWith("|")) {
          c.centered = 0;
        } else if (lastMark.startsWith("***")) {
          c.bolded = 0;
          c.italicized = 0;
        } else if (lastMark.startsWith("**")) {
          c.bolded = 0;
        } else if (lastMark.startsWith("*")) {
          c.italicized = 0;
        } else if (lastMark.startsWith("_")) {
          c.underlined = 0;
        } else if (!isLineStart && lastMark.startsWith("^")) {
          c.pitch = 0;
        } else if (!isLineStart && lastMark.startsWith("~")) {
          c.floating = 0;
        } else if (!isLineStart && lastMark.startsWith(":")) {
          c.trembling = 0;
        }
      });
      marks.pop();
    }
  }
};

const getAnimationStyle = (animationName: string, context: GameContext) => {
  const style: Record<string, string | null> = {};
  style["animation_name"] = animationName;
  const animationTimingFunction =
    context["animation"]?.[animationName]?.["style"]?.[
      "animation_timing_function"
    ];
  if (animationTimingFunction) {
    style["animation_timing_function"] = animationTimingFunction;
  }
  const animationDuration =
    context["animation"]?.[animationName]?.["style"]?.["animation_duration"];
  if (animationDuration) {
    style["animation_duration"] = animationDuration;
  }
  const animationIterationCount =
    context["animation"]?.[animationName]?.["style"]?.[
      "animation_iteration_count"
    ];
  if (animationIterationCount) {
    style["animation_iteration_count"] = animationIterationCount;
  }
  return style;
};

export interface WriteOptions {
  character?: string;
  instant?: boolean;
  debug?: boolean;
}

export const write = (
  content: Phrase[],
  context: GameContext,
  options?: WriteOptions
): WriteResult => {
  const phrases: Phrase[] = [];

  const character = options?.character;
  const instant = options?.instant;
  const debug = options?.debug;

  let prevTarget = "";

  let consecutiveLettersLength = 0;
  let word = "";
  let dashLength = 0;
  let spaceLength = 0;
  let phrasePauseLength = 0;
  let phraseUnpauseLength = 0;
  let escaped = false;
  let currChunk: Chunk | undefined = undefined;

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

  const marks: [string, number][] = [];
  const textChunks: Chunk[] = [];
  let speedModifier = 1;

  content.forEach((p, contentIndex) => {
    const target = p.target || "";
    const writer = getValue(context, "writer", target);
    const writerSynth = getValue(context, "synth", target, "writer");
    const characterSynth = character
      ? getValue(context, "synth", character, "character")
      : undefined;
    const synth = characterSynth ?? writerSynth;
    const minSynthDuration = getMinSynthDuration(synth);
    const letterPause = writer?.letter_pause ?? 0;
    const phrasePause = writer?.phrase_pause_scale ?? 1;
    const emDashPause = writer?.em_dash_pause_scale ?? 1;
    const stressPause = writer?.stressed_pause_scale ?? 1;
    const syllableLength = Math.max(
      writer?.min_syllable_length || 0,
      Math.round(minSynthDuration / letterPause)
    );
    const voicedMatcher = writer?.voiced
      ? new Matcher(writer?.voiced)
      : undefined;
    const yelledMatcher = writer?.yelled
      ? new Matcher(writer?.yelled)
      : undefined;
    const skippedMatcher = writer?.skipped
      ? new Matcher(writer?.skipped)
      : undefined;

    const nextContent = content[contentIndex + 1];
    if (p.button) {
      const chunk: Chunk = {
        target: p.target,
        instance: p.instance,
        button: p.button,
        duration: 0,
        speed: 0,
      };
      phrases.push({
        ...p,
        chunks: [chunk],
      });
      startNewPhrase();
    }
    if (p.tag === "image") {
      const chunk: Chunk = {
        tag: p.tag,
        instance: p.instance,
        control: p.control,
        target: p.target,
        assets: p.assets,
        args: p.args,
        duration: 0,
        speed: 0,
      };
      phrases.push({
        ...p,
        chunks: [chunk],
      });
      startNewPhrase();
    }
    if (p.tag === "audio") {
      phrases.push({
        ...p,
        chunks: [
          {
            tag: p.tag,
            control: p.control,
            target: p.target,
            instance: p.instance,
            assets: p.assets,
            args: p.args,
            duration: 0,
            speed: 0,
          },
        ],
      });
      startNewPhrase();
    }
    if (p.tag === "style") {
      if (isNumberValue(p.control)) {
        speedModifier = getNumberValue(p.control, 1);
      } else if (p.control === "speed" || p.control === "s") {
        speedModifier = getNumberValue(p.args?.[0], 1);
      } else if (p.control === "wait" || p.control === "w") {
        const waitModifier = getNumberValue(p.args?.[0], 0);
        phrases.push({
          ...p,
          chunks: [
            {
              tag: p.tag,
              duration: waitModifier,
              speed: 1,
            },
          ],
        });
      }
    }
    const text = p.text;
    if (text != null) {
      if (skippedMatcher && skippedMatcher.test(text)) {
        return;
      }
      const target = p.target || "";
      if (target !== prevTarget || p.button) {
        prevTarget = target;
        startNewPhrase();
      }
      const chars = text.match(CHAR_REGEX);
      if (chars) {
        for (let i = 0; i < chars.length; ) {
          const char = chars[i] || "";
          const nextChar = chars[i + 1] || nextContent?.text?.[0] || "";
          const lastMark = marks[marks.length - 1]?.[0];
          if (!escaped) {
            if (char === "\\") {
              // escape char
              i += 1;
              escaped = true;
              continue;
            }
            if (
              SINGLE_MARKERS.includes(char) ||
              DOUBLE_MARKERS.includes(char + nextChar)
            ) {
              let mark = "";
              let m = i;
              while (chars[m] === char) {
                mark += chars[m];
                m += 1;
              }
              if (lastMark === mark) {
                marks.pop();
              } else {
                marks.push([mark, textChunks.length - 1]);
              }
              i += mark.length;
              continue;
            }
          }
          escaped = false;
          const markers = marks.map(([mark]) => mark);
          const activeCenteredMark = markers.find((m) => m.startsWith("|"));
          const activeBoldItalicMark = markers.find((m) => m.startsWith("***"));
          const activeUnderlineMark = markers.find((m) => m.startsWith("_"));
          const activePitchUpMark = markers.find((m) => m.startsWith("^"));
          const activeFloatingMark = markers.find((m) => m.startsWith("~~"));
          const activeTremblingMark = markers.find((m) => m.startsWith("::"));
          const isCentered = Boolean(activeCenteredMark);
          const hasBoldItalicMark = Boolean(activeBoldItalicMark);
          const isUnderlined = Boolean(activeUnderlineMark);
          const hasBoldMark = markers.includes("**");
          const hasItalicMark = markers.includes("*");
          const isItalicized = hasBoldItalicMark || hasItalicMark;
          const isBolded = hasBoldItalicMark || hasBoldMark;
          const voiced = Boolean(voicedMatcher?.test(char));

          if (isWhitespace(char)) {
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
          if (isDash(char)) {
            dashLength += 1;
          } else {
            dashLength = 0;
          }
          const isYelled =
            Boolean(yelledMatcher?.test(word)) &&
            (Boolean(yelledMatcher?.test(nextChar)) || word.length > 1);
          const tilde = char === "~";
          const isEmDashBoundary = dashLength > 1;
          const emDash =
            isEmDashBoundary ||
            (isDash(char) &&
              (isWhitespaceOrEmpty(nextChar) || isDash(nextChar)));
          const isPhraseBoundary = spaceLength > 1;

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
            isCentered && activeCenteredMark
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
          // floating level = number of `~`
          const floating = activeFloatingMark
            ? activeFloatingMark.length - 1
            : 0;
          // trembling level = number of `=`
          const trembling = activeTremblingMark
            ? activeTremblingMark.length - 1
            : 0;
          // stress level = number of `^`
          const pitch = activePitchUpMark ? activePitchUpMark.length : 0;

          // Determine beep timing
          const charIndex = phraseUnpauseLength - 1;
          const voicedSyllable = charIndex % syllableLength === 0;
          const speedFloating = floating ? floating : 1;
          const speedTrembling = trembling ? trembling : 1;
          const speed = (1 * speedModifier) / speedFloating / speedTrembling;
          const isPhrasePause = isPhraseBoundary;
          const isEmDashPause = currChunk && currChunk.emDash && !emDash;
          const isStressPause: boolean = Boolean(
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
              : (isPhrasePause
                  ? letterPause * phrasePause
                  : isEmDashPause
                  ? letterPause * emDashPause
                  : isStressPause
                  ? letterPause * stressPause
                  : letterPause) / speed;

          if (phraseUnpauseLength === 1) {
            // start voiced phrase
            currChunk = {
              target: p.target,
              instance: p.instance,
              button: p.button,
              text: char,
              args: p.args,
              duration,
              speed,
              voicedSyllable,
              voiced,
              yelled,
              centered,
              bolded,
              italicized,
              underlined,
              floating,
              trembling,
              emDash,
              tilde,
              pitch,
            };
            textChunks.push(currChunk);
            phrases.push({
              ...p,
              text: char,
              chunks: [currChunk],
            });
          } else {
            // continue voiced phrase
            const currentPhrase = phrases.at(-1);
            if (currentPhrase) {
              currentPhrase.text ??= "";
              currentPhrase.text += char;
              if (
                currChunk &&
                !currChunk.duration &&
                bolded === currChunk.bolded &&
                italicized === currChunk.italicized &&
                underlined === currChunk.underlined &&
                floating === currChunk.floating &&
                trembling === currChunk.trembling &&
                speed === currChunk.speed
              ) {
                // No need to create new element, simply append char to previous chunk
                currChunk.text += char;
              } else {
                // Create new element and chunk
                currChunk = {
                  target: p.target,
                  instance: p.instance,
                  button: p.button,
                  text: char,
                  args: p.args,
                  duration,
                  speed,
                  voicedSyllable,
                  voiced,
                  yelled,
                  centered,
                  bolded,
                  italicized,
                  underlined,
                  floating,
                  trembling,
                  emDash,
                  tilde,
                  pitch,
                };
                textChunks.push(currChunk);
                currentPhrase.chunks ??= [];
                currentPhrase.chunks.push(currChunk);
              }
            }
          }
          if (containsNewline(char)) {
            invalidateOpenMarks(marks, textChunks);
          }
          i += 1;
        }
      }
    }
  });

  invalidateOpenMarks(marks, textChunks);

  phrases.forEach((phrase) => {
    const target = phrase.target || "";
    const writer = getValue(context, "writer", target);
    const letterPause = writer?.letter_pause ?? 0;
    const interjectionPause = writer?.punctuated_pause_scale ?? 1;
    const punctuatedMatcher = writer?.punctuated
      ? new Matcher(writer?.punctuated)
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
          const writerSynth = getValue(context, "synth", target, "writer");
          const minSynthDuration = getMinSynthDuration(writerSynth);
          for (let c = 0; c < phrase.chunks.length; c += 1) {
            const chunk = phrase.chunks[c]!;
            if (chunk.text && !isWhitespace(chunk.text)) {
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

  if (character && !instant && !context.system?.simulating) {
    stressPhrases(phrases, getValue(context, "character", character));
  }

  let time = 0;
  const result: WriteResult = {
    button: {},
    text: {},
    image: {},
    audio: {},
    end: 0,
  };
  const synthEvents: Record<
    string,
    { time?: number; speed?: number; bend?: number }[]
  > = {};
  phrases.forEach((phrase) => {
    let floatingIndex = 0;
    let tremblingIndex = 0;
    const target = phrase.target || "";
    const writer = getValue(context, "writer", target);
    const fadeDuration = writer?.fade_duration ?? 0;
    const letterPause = writer?.letter_pause ?? 0;
    const animationOffset = writer?.animation_offset ?? 0;
    if (phrase.chunks) {
      phrase.chunks.forEach((c) => {
        if (c.button != null) {
          const event: ButtonEvent = {
            button: c.button,
            instance: c.instance ?? 0,
            after: time,
          };
          result.button ??= {};
          result.button[target] ??= [];
          result.button[target]!.push(event);
        }
        if (c.text != null) {
          const event: TextEvent = { text: c.text };
          if (time) {
            event.after = time;
          }
          if (fadeDuration) {
            event.over = fadeDuration;
          }
          if (c.instance) {
            event.instance = c.instance;
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

          // Floating animation
          if (c.floating) {
            event.style ??= {};
            event.style = {
              ...event.style,
              ...getAnimationStyle("floating", context),
            };
            event.style["animation_delay"] = `${
              floatingIndex * animationOffset * -1
            }s`;
          }
          if (c.floating) {
            floatingIndex += 1;
          } else {
            floatingIndex = 0;
          }
          // Trembling animation
          if (c.trembling) {
            event.style ??= {};
            event.style = {
              ...event.style,
              ...getAnimationStyle("trembling", context),
            };
            event.style["animation_delay"] = `${
              tremblingIndex * animationOffset * -1
            }s`;
          }
          if (c.trembling) {
            tremblingIndex += 1;
          } else {
            tremblingIndex = 0;
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
          const key = getInstanceName(target, event.instance);
          if (key && !c.instance && letterPause === 0) {
            const prevEvent = result.text[key]?.at(-1);
            if (prevEvent) {
              prevEvent.exit = time;
            }
          }
          result.text[key] ??= [];
          result.text[key]!.push(event);
        }
        if (c.tag === "image") {
          const event: ImageEvent = {
            control: c.control || "show",
            assets: c.assets,
          };
          if (c.instance) {
            event.instance = c.instance;
          }
          if (time) {
            event.after = time;
          }
          if (fadeDuration) {
            event.over = fadeDuration;
          }
          if (c.args) {
            const withValue = getArgumentStringValue(c.args, "with");
            if (withValue) {
              event.with = withValue;
            }
            const afterValue = getArgumentTimeValue(c.args, "after");
            if (afterValue) {
              event.after = (event.after ?? 0) + afterValue;
            }
            const overValue = getArgumentTimeValue(c.args, "over");
            if (overValue) {
              event.over = overValue;
            }
          }
          result.image ??= {};
          const key = getInstanceName(target, event.instance);
          if (key && !c.instance) {
            const prevEvent = result.image[key]?.at(-1);
            if (prevEvent) {
              prevEvent.exit = time;
            }
          }
          result.image[key] ??= [];
          result.image[key]!.push(event);
        }
        if (c.tag === "audio") {
          const event: AudioEvent = {
            control: c.control || "play",
            assets: c.assets,
          };
          if (c.instance) {
            event.instance = c.instance;
          }
          if (time) {
            event.after = time;
          }
          if (c.args) {
            const afterValue = getArgumentTimeValue(c.args, "after");
            if (afterValue) {
              event.after = (event.after ?? 0) + afterValue;
            }
            const overValue = getArgumentTimeValue(c.args, "over");
            if (overValue) {
              event.over = overValue;
            }
            const unmuteValue = c.args.includes("unmute");
            if (unmuteValue) {
              event.gain = 1;
            }
            const toValue = getArgumentNumberValue(c.args, "to");
            if (toValue != null) {
              event.gain = toValue;
            }
            const muteValue = c.args.includes("mute");
            if (muteValue) {
              event.gain = 0;
            }
            const loopValue = c.args.includes("loop");
            if (loopValue) {
              event.loop = true;
            }
            const noloopValue = c.args.includes("noloop");
            if (noloopValue) {
              event.loop = false;
            }
            const nowValue = c.args.includes("now");
            if (nowValue) {
              event.now = nowValue;
            }
          }
          result.audio ??= {};
          result.audio[target] ??= [];
          result.audio[target]!.push(event);
        }
        if (c.duration && !instant) {
          if (c.punctuatedSyllable) {
            const synthName = getValueName(context, "synth", "writer");
            synthEvents[synthName] ??= [];
            synthEvents[synthName]!.push({
              time,
              speed: c.speed ?? 1,
              bend: c.pitch ?? 0,
            });
          } else if (c.voicedSyllable) {
            const synthName = character
              ? getValueName(context, "synth", character, "character")
              : getValueName(context, "synth", c.target || "", "writer");
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
    result.audio["writer"] ??= [];
    result.audio["writer"]!.push({
      control: "play",
      assets: [
        synthName +
          "-" +
          tones
            .map((tone) => `t${tone.time}s${tone.speed}b${tone.bend}`)
            .join("-"),
      ],
    });
  });

  result.end = time;

  return result;
};
