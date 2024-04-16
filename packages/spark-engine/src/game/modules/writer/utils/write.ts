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

const SINGLE_MARKERS = ["|", "*", "_"];
const DOUBLE_MARKERS = ["~~", "::"];
const CHAR_REGEX =
  /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})|./gsu;

const MILLISECONDS_REGEX = /((?:\d*[.])?\d+)ms/;
const SECONDS_REGEX = /((?:\d*[.])?\d+)s/;

const isWhitespaceOrEmpty = (part: string) => {
  if (!part) {
    return true;
  }
  return isWhitespace(part);
};

const isNewline = (part: string) => {
  return part === "\n" || part === "\r" || part === "\r\n";
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

const getSeconds = (value: string): number | undefined => {
  const numValue = Number(value);
  if (!Number.isNaN(numValue)) {
    return numValue;
  }
  const msMatch = value.match(MILLISECONDS_REGEX);
  if (msMatch) {
    const msVal = msMatch[1];
    const msNumValue = Number(msVal);
    if (!Number.isNaN(msNumValue)) {
      return msNumValue / 1000;
    }
  }
  const sMatch = value.match(SECONDS_REGEX);
  if (sMatch) {
    const sVal = sMatch[1];
    const sNumValue = Number(sVal);
    if (!Number.isNaN(sNumValue)) {
      return sNumValue;
    }
  }
  return undefined;
};

const getArgumentTimeValue = (
  args: string[],
  name: string,
  context: GameContext
): number | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const arg = args[argIndex + 1];
  if (arg == null) {
    return undefined;
  }
  const result = context.system.evaluate(arg);
  if (typeof result === "number") {
    return result;
  }
  if (typeof result === "string") {
    return getSeconds(result);
  }
  return getSeconds(arg);
};

const getNumberValue = <T>(
  arg: string | undefined,
  defaultValue: T,
  context: GameContext
): number | T => {
  const numValue = Number(arg);
  if (!Number.isNaN(numValue)) {
    return numValue;
  }
  if (typeof arg === "string") {
    const result = context.system.evaluate(arg);
    if (typeof result === "number") {
      return result;
    }
  }
  return defaultValue;
};

const getArgumentNumberValue = (
  args: string[],
  name: string,
  context: GameContext
): number | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const arg = args[argIndex + 1];
  if (arg) {
    return getNumberValue(arg, undefined, context);
  }
  return undefined;
};

const getArgumentStringValue = (
  args: string[],
  name: string,
  context: GameContext
): string | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const arg = args[argIndex + 1];
  if (arg) {
    const result = context.system.evaluate(arg);
    if (typeof result === "string") {
      return result;
    }
  }
  return arg;
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

  const marks: [string][] = [];
  const textChunks: Chunk[] = [];
  let speedModifier = 1;
  let pitchModifier: number | undefined = undefined;
  const floatingIndexMap = new Map<[string], number>();
  const tremblingIndexMap = new Map<[string], number>();

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
    if (p.tag === "image_tag") {
      const chunk: Chunk = {
        tag: p.tag,
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
    if (p.tag === "audio_tag") {
      phrases.push({
        ...p,
        chunks: [
          {
            tag: p.tag,
            control: p.control,
            target: p.target,
            assets: p.assets,
            args: p.args,
            duration: 0,
            speed: 0,
          },
        ],
      });
      startNewPhrase();
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
      if (isNewline(text)) {
        marks.length = 0;
      }
      const chars = text.match(CHAR_REGEX);
      if (chars) {
        for (let i = 0; i < chars.length; ) {
          const char = chars[i] || "";
          const nextChar = chars[i + 1] || nextContent?.text?.[0] || "";
          if (!escaped) {
            if (char === "\\") {
              // escape char
              i += 1;
              escaped = true;
              continue;
            }
            if (char === "<") {
              let control = "";
              let arg = "";
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
              if (chars[i] === ">") {
                i += 1;
              }
              if (control) {
                if (control === "speed" || control === "s") {
                  speedModifier = getNumberValue(arg, 1, context);
                } else if (control === "pitch" || control === "p") {
                  pitchModifier = getNumberValue(arg, 0, context);
                } else if (control === "wait" || control === "w") {
                  const waitModifier = getNumberValue(arg, 0, context);
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
              continue;
            }
            if (
              SINGLE_MARKERS.includes(char) ||
              DOUBLE_MARKERS.includes(char + nextChar)
            ) {
              let mark = "";
              let m = i;
              while (chars[m] && chars[m] === char) {
                mark += chars[m];
                m += 1;
              }
              const lastMatchingMark = marks.findLast(([m]) => m === mark);
              if (lastMatchingMark) {
                if (marks.at(-1) !== lastMatchingMark) {
                  marks.pop();
                }
                marks.pop();
              } else {
                marks.push([mark]);
              }
              i += mark.length;
              continue;
            }
          }
          escaped = false;
          const activeCenteredMark = marks.findLast(([m]) => m.startsWith("|"));
          const activeUnderlineMark = marks.findLast(([m]) =>
            m.startsWith("_")
          );
          const activeBoldItalicMark = marks.findLast(([m]) =>
            m.startsWith("***")
          );
          const activeBoldMark = marks.findLast(([m]) => m.startsWith("**"));
          const activeItalicMark = marks.findLast(([m]) => m.startsWith("*"));
          const activeFloatingMark = marks.findLast(([m]) =>
            m.startsWith("~~")
          );
          const activeTremblingMark = marks.findLast(([m]) =>
            m.startsWith("::")
          );
          const isCentered = Boolean(activeCenteredMark);
          const isUnderlined = Boolean(activeUnderlineMark);
          const isItalicized =
            Boolean(activeBoldItalicMark) || Boolean(activeItalicMark);
          const isBolded =
            Boolean(activeBoldItalicMark) || Boolean(activeBoldMark);
          const voiced = Boolean(voicedMatcher?.test(char));

          // Determine offset from floating mark
          if (activeFloatingMark) {
            const floatingIndex = floatingIndexMap.get(activeFloatingMark);
            if (floatingIndex != null) {
              floatingIndexMap.set(activeFloatingMark, floatingIndex + 1);
            } else {
              floatingIndexMap.set(activeFloatingMark, 0);
            }
          }
          const floating = activeFloatingMark
            ? floatingIndexMap.get(activeFloatingMark)
            : 0;

          // Determine offset from trembling mark
          if (activeTremblingMark) {
            const tremblingIndex = tremblingIndexMap.get(activeTremblingMark);
            if (tremblingIndex != null) {
              tremblingIndexMap.set(activeTremblingMark, tremblingIndex + 1);
            } else {
              tremblingIndexMap.set(activeTremblingMark, 0);
            }
          }
          const trembling = activeTremblingMark
            ? tremblingIndexMap.get(activeTremblingMark)
            : 0;

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
          const pitch = pitchModifier;

          // Determine beep timing
          const charIndex = phraseUnpauseLength - 1;
          const voicedSyllable = charIndex % syllableLength === 0;
          const speedFloating = activeFloatingMark
            ? activeFloatingMark[0].length - 1
            : 1;
          const speedTrembling = activeTremblingMark
            ? activeTremblingMark[0].length - 1
            : 1;
          const speed = speedModifier / speedFloating / speedTrembling;
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
          i += 1;
        }
      }
    }
  });

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
            after: time,
          };
          result.button ??= {};
          result.button[target] ??= [];
          result.button[target]!.push(event);
        }
        if (c.text != null) {
          const event: TextEvent = { control: "show", text: c.text };
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

          // Floating animation
          if (c.floating) {
            event.with = "floating";
            event.withAfter = c.floating * animationOffset * -1;
          }
          // Trembling animation
          if (c.trembling) {
            event.with = "trembling";
            event.withAfter = c.trembling * animationOffset * -1;
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
          if (target && letterPause === 0) {
            const prevEvent = result.text[target]?.at(-1);
            if (prevEvent) {
              prevEvent.exit = time;
              prevEvent.style ??= {};
              prevEvent.style["position"] = "absolute";
              prevEvent.style["inset"] = "0";
            }
          }
          result.text[target] ??= [];
          result.text[target]!.push(event);
        }
        if (c.tag === "image_tag") {
          const event: ImageEvent = {
            control: c.control || "show",
            assets: c.assets,
          };
          if (time) {
            event.after = time;
          }
          if (fadeDuration) {
            event.over = fadeDuration;
          }
          if (c.args) {
            const withValue = getArgumentStringValue(c.args, "with", context);
            if (withValue) {
              event.with = withValue;
            }
            const afterValue = getArgumentTimeValue(c.args, "after", context);
            if (afterValue) {
              event.after = (event.after ?? 0) + afterValue;
            }
            const overValue = getArgumentTimeValue(c.args, "over", context);
            if (overValue) {
              event.over = overValue;
            }
            const toValue = getArgumentNumberValue(c.args, "to", context);
            if (toValue != null) {
              event.to = toValue;
            }
          }
          result.image ??= {};
          if (target && event.control === "show") {
            const prevEvent = result.image[target]?.at(-1);
            if (prevEvent) {
              prevEvent.exit = time;
              prevEvent.style ??= {};
              prevEvent.style["position"] = "absolute";
              prevEvent.style["inset"] = "0";
            }
          }
          result.image[target] ??= [];
          result.image[target]!.push(event);
        }
        if (c.tag === "audio_tag") {
          const event: AudioEvent = {
            control: c.control || "play",
            assets: c.assets,
          };
          if (time) {
            event.after = time;
          }
          if (c.args) {
            const afterValue = getArgumentTimeValue(c.args, "after", context);
            if (afterValue) {
              event.after = (event.after ?? 0) + afterValue;
            }
            const overValue = getArgumentTimeValue(c.args, "over", context);
            if (overValue) {
              event.over = overValue;
            }
            const unmuteValue = c.args.includes("unmute");
            if (unmuteValue) {
              event.to = 1;
            }
            const toValue = getArgumentNumberValue(c.args, "to", context);
            if (toValue != null) {
              event.to = toValue;
            }
            const muteValue = c.args.includes("mute");
            if (muteValue) {
              event.to = 0;
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
