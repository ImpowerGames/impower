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
const DOUBLE_MARKERS = ["~~", "::", "==", ">>", "<<"];

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

const getArgumentValue = (args: string[], name: string): number | undefined => {
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
    if (p.image != null) {
      const chunk: Chunk = {
        target: p.target,
        instance: p.instance,
        image: p.image,
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
    if (p.audio != null) {
      phrases.push({
        ...p,
        chunks: [
          {
            target: p.target,
            instance: p.instance,
            audio: p.audio,
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
      const chars = text.split("");
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
        const activeInstantMark = markers.find((m) => m.startsWith("=="));
        const activeFasterMark = markers.find((m) => m.startsWith(">>"));
        const activeSlowerMark = markers.find((m) => m.startsWith("<<"));
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
          (isDash(char) && (isWhitespaceOrEmpty(nextChar) || isDash(nextChar)));
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
        const floating = activeFloatingMark ? activeFloatingMark.length : 0;
        // trembling level = number of `=`
        const trembling = activeTremblingMark ? activeTremblingMark.length : 0;
        // stress level = number of `^`
        const pitch = activePitchUpMark ? activePitchUpMark.length : 0;

        // Determine beep timing
        const charIndex = phraseUnpauseLength - 1;
        const voicedSyllable = charIndex % syllableLength === 0;
        const speedFaster = activeFasterMark?.length ?? 1;
        const speedSlower = activeSlowerMark?.length ?? 1;
        const speedInstant = activeInstantMark ? 0 : 1;
        const speedFloating = floating ? floating : 1;
        const speedTrembling = trembling ? trembling : 1;
        const speed =
          (1 * speedInstant * speedFaster) /
          speedSlower /
          speedFloating /
          speedTrembling;
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
              trembling === currChunk.trembling
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
    const floatingAnimation = writer?.floating_animation;
    const tremblingAnimation = writer?.trembling_animation;
    if (phrase.chunks) {
      phrase.chunks.forEach((c) => {
        if (c.button != null) {
          const buttonEvent: ButtonEvent = {
            button: c.button,
            instance: c.instance ?? 0,
            enter: time,
          };
          result.button ??= {};
          result.button[target] ??= [];
          result.button[target]!.push(buttonEvent);
        }
        if (c.text != null) {
          const textEvent: TextEvent = { text: c.text };
          if (time) {
            textEvent.enter = time;
          }
          if (fadeDuration) {
            textEvent.fade = fadeDuration;
          }
          if (c.instance) {
            textEvent.instance = c.instance;
          }
          if (c.underlined) {
            textEvent.params ??= {};
            textEvent.params["text-decoration"] = "underline";
          }
          if (c.italicized) {
            textEvent.params ??= {};
            textEvent.params["font-style"] = "italic";
          }
          if (c.bolded) {
            textEvent.params ??= {};
            textEvent.params["font-weight"] = "bold";
          }
          if (c.centered) {
            textEvent.params ??= {};
            textEvent.params["text-align"] = "center";
          }

          // Floating animation
          if (c.floating && floatingAnimation) {
            textEvent.params ??= {};
            textEvent.params["position"] = "relative";
            textEvent.params["animation"] = floatingAnimation;
            textEvent.params["animation-delay"] = `${
              floatingIndex * animationOffset * -1
            }s`;
          }
          if (c.floating) {
            floatingIndex += 1;
          } else {
            floatingIndex = 0;
          }
          // Trembling animation
          if (c.trembling && tremblingAnimation) {
            textEvent.params ??= {};
            textEvent.params["position"] = "relative";
            textEvent.params["animation"] = tremblingAnimation;
            textEvent.params["animation-delay"] = `${
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
              textEvent.params ??= {};
              textEvent.params["background-color"] = `hsla(0, 100%, 50%, ${
                0.5 - letterPause / c.duration
              })`;
            }
            if (c.voicedSyllable) {
              // color beeps
              textEvent.params ??= {};
              textEvent.params["background-color"] = `hsl(185, 100%, 50%)`;
            }
          }
          result.text ??= {};
          const key = getInstanceName(target, textEvent.instance);
          if (key && !c.instance && letterPause === 0) {
            const prevEvent = result.text[key]?.at(-1);
            if (prevEvent) {
              prevEvent.exit = time;
            }
          }
          result.text[key] ??= [];
          result.text[key]!.push(textEvent);
        }
        if (c.image != null) {
          const imageEvent: ImageEvent = { image: c.image };
          if (time) {
            imageEvent.enter = time;
          }
          if (fadeDuration) {
            imageEvent.fade = fadeDuration;
          }
          if (c.instance) {
            imageEvent.instance = c.instance;
          }
          result.image ??= {};
          const key = getInstanceName(target, imageEvent.instance);
          if (key && !c.instance) {
            const prevEvent = result.image[key]?.at(-1);
            if (prevEvent) {
              prevEvent.exit = time;
            }
          }
          result.image[key] ??= [];
          result.image[key]!.push(imageEvent);
        }
        if (c.audio != null) {
          const audioEvent: AudioEvent = { audio: c.audio };
          if (time) {
            audioEvent.enter = time;
          }
          if (c.instance) {
            audioEvent.instance = c.instance;
          }
          if (c.args) {
            if (c.args.includes("load")) {
              audioEvent.params ??= {};
              audioEvent.params.load = true;
            }
            if (c.args.includes("unload")) {
              audioEvent.params ??= {};
              audioEvent.params.unload = true;
            }
            if (c.args.includes("start")) {
              audioEvent.params ??= {};
              audioEvent.params.start = true;
            }
            if (c.args.includes("stop")) {
              audioEvent.params ??= {};
              audioEvent.params.stop = true;
            }
            if (c.args.includes("schedule")) {
              audioEvent.params ??= {};
              audioEvent.params.schedule = true;
            }
            if (c.args.includes("mute")) {
              audioEvent.params ??= {};
              audioEvent.params.mute = true;
            }
            if (c.args.includes("unmute")) {
              audioEvent.params ??= {};
              audioEvent.params.unmute = true;
            }
            if (c.args.includes("loop")) {
              audioEvent.params ??= {};
              audioEvent.params.loop = true;
            }
            if (c.args.includes("noloop")) {
              audioEvent.params ??= {};
              audioEvent.params.noloop = true;
            }
            const volume = getArgumentValue(c.args, "volume");
            if (volume != null) {
              audioEvent.params ??= {};
              audioEvent.params.volume = volume;
            }
            const after = getArgumentValue(c.args, "after");
            if (after) {
              audioEvent.params ??= {};
              audioEvent.params.after = after;
            }
            const over = getArgumentValue(c.args, "over");
            if (over) {
              audioEvent.params ??= {};
              audioEvent.params.over = over;
            }
          }
          result.audio ??= {};
          result.audio[target] ??= [];
          result.audio[target]!.push(audioEvent);
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
      audio: [
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
