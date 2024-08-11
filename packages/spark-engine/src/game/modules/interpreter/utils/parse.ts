import { GameContext } from "../../../core/types/GameContext";
import {
  AudioInstruction,
  ImageInstruction,
  TextInstruction,
} from "../../../core/types/Instruction";
import { Instructions } from "../../../core/types/Instructions";
import { Matcher } from "../classes/helpers/Matcher";
import { Chunk } from "../types/Chunk";
import { Phrase } from "../types/Phrase";
import { stressPhrases } from "./stressPhrases";

const MARKERS = ["^", "*", "_", "~~", "::"];
const CHAR_REGEX =
  /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})|./gsu;
const PARENTHETICAL_REGEX =
  /^([ \t]*)((?:[=].*?[=]|[<].*?[>]|[ \t]*)*)([ \t]*)([(][^()]*?[)])([ \t]*)$/;
const ASSET_CONTROL_KEYWORDS = [
  "show",
  "hide",
  "play",
  "stop",
  "fade",
  "write",
  "animate",
];
const ASSET_ARG_KEYWORDS = [
  "to",
  "after",
  "with",
  "over",
  "now",
  "loop",
  "noloop",
  "mute",
  "unmute",
];

const MILLISECONDS_REGEX = /((?:\d*[.])?\d+)ms/;
const SECONDS_REGEX = /((?:\d*[.])?\d+)s/;

const isWhitespace = (part: string | undefined) => {
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
};

const isWhitespaceOrEmpty = (part: string | undefined) => {
  if (!part) {
    return true;
  }
  return isWhitespace(part);
};

const isSpace = (part: string | undefined) => {
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
  name: string
): number | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const arg = args[argIndex + 1];
  if (arg == null) {
    return undefined;
  }
  const num = Number(arg);
  if (!Number.isNaN(num)) {
    return num;
  }
  if (typeof arg === "string") {
    return getSeconds(arg);
  }
  return getSeconds(arg);
};

const getNumberValue = <T>(
  arg: string | undefined,
  defaultValue: T
): number | T => {
  const numValue = Number(arg);
  if (!Number.isNaN(numValue)) {
    return numValue;
  }
  return defaultValue;
};

const getArgumentNumberValue = (
  args: string[],
  name: string
): number | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const arg = args[argIndex + 1];
  if (arg) {
    return getNumberValue(arg, undefined);
  }
  return undefined;
};

const getArgumentStringValue = (
  args: string[],
  name: string
): string | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const arg = args[argIndex + 1];
  if (arg) {
    if (typeof arg === "string") {
      return arg;
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

const createImageChunk = (imageTagContent: string) => {
  return createAssetChunk(imageTagContent, "image", "show", "portrait");
};

const createAudioChunk = (audioTagContent: string) => {
  return createAssetChunk(audioTagContent, "audio", "play", "sound");
};

const createAssetChunk = (
  assetTagContent: string,
  tag: string,
  defaultControl: string,
  defaultTarget: string
) => {
  const parts = assetTagContent.replaceAll("\t", " ").split(" ");
  let control = defaultControl;
  let target = defaultTarget;
  const assets: string[] = [];
  const args: string[] = [];
  if (parts[0]) {
    if (ASSET_CONTROL_KEYWORDS.includes(parts[0])) {
      control = parts[0];
      if (parts[1]) {
        target = parts[1];
      }
      if (parts[2]) {
        if (ASSET_ARG_KEYWORDS.includes(parts[2])) {
          args.push(...parts.slice(2));
        } else {
          assets.push(...parts[2].split("+"));
          args.push(...parts.slice(3));
        }
      }
    } else {
      assets.push(...parts[0].split("+"));
      args.push(...parts.slice(1));
    }
  }
  return {
    tag,
    control,
    target,
    assets,
    args,
    duration: 0,
    speed: 1,
  };
};

export interface InstructionOptions {
  delay?: number;
  choice?: boolean;
  character?: string;
  position?: string;
  context?: GameContext;
}

export const parse = (
  content: string,
  target: string,
  options?: InstructionOptions
): Instructions => {
  const allPhrases: Phrase[] = [];

  const textTarget = target;
  const delay = options?.delay || 0;
  const choice = options?.choice;
  const context = options?.context;
  const debug = context?.system.debugging;
  let character: string | undefined = options?.character;

  const textTargetPrefixMap: Record<string, string> = {};
  const textTargetPrefixKeys: string[] = [];
  for (const [k, v] of Object.entries(context?.["writer"] || {})) {
    if (
      typeof v === "object" &&
      v &&
      "prefix" in v &&
      typeof v.prefix === "string"
    ) {
      textTargetPrefixMap[v.prefix] = k;
      textTargetPrefixKeys.push(v.prefix);
    }
  }
  let uuids: string[] = [];
  let consecutiveLettersLength = 0;
  let word = "";
  let dashLength = 0;
  let spaceLength = 0;
  let phrasePauseLength = 0;
  let phraseUnpauseLength = 0;
  let escaped = false;
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

    const writer = getValue(context, "writer", textTarget);
    const writerSynth = getValue(context, "synth", textTarget, "writer");
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

    activeMarks.length = 0;
    consecutiveLettersLength = 0;
    word = "";
    dashLength = 0;
    spaceLength = 0;
    phrasePauseLength = 0;
    phraseUnpauseLength = 0;
    currChunk = undefined;
    escaped = false;

    const chars = textLine.match(CHAR_REGEX);
    if (chars) {
      for (let i = 0; i < chars.length; ) {
        const char = chars[i] ?? "";
        const nextChar = chars[i + 1] ?? "";
        if (!escaped) {
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
                const imageChunk = createImageChunk(imageTagContent);
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
                  if (!isSpace(chars[i])) {
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
                const audioChunk = createAudioChunk(audioTagContent);
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
                  if (!isSpace(chars[i])) {
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
          if (char === "<") {
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
                  const phrase = {
                    target: textTarget,
                    chunks: [
                      {
                        tag: "text",
                        duration: waitModifier,
                        speed: 1,
                      },
                    ],
                  };
                  linePhrases.push(phrase);
                  allPhrases.push(phrase);
                  startNewPhrase();
                } else if (control === "!") {
                  // Ignore everything until the end of the line
                  while (chars[i] && chars[i] !== "\n") {
                    i += 1;
                  }
                }
              }
            } else {
              i = startIndex;
              escaped = true;
            }
            continue;
          }
          // Flow Tag
          if (char === "=") {
            let id = "";
            const startIndex = i;
            i += 1;
            while (chars[i] && chars[i] !== "=") {
              id += chars[i];
              i += 1;
            }
            const closed = chars[i] === "=";
            if (closed) {
              i += 1;
              if (id) {
                uuids.push(id);
              }
              // consume trailing whitespace
              while (i < chars.length) {
                if (!isSpace(chars[i])) {
                  break;
                }
                i += 1;
              }
            } else {
              i = startIndex;
              escaped = true;
            }
            continue;
          }
          // Break Tag
          if (char === "+") {
            i += 1;
            continue;
          }
          // Style Tag
          const styleMarker = MARKERS.find(
            (marker) => marker === chars.slice(i, i + marker.length).join("")
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
        escaped = false;

        const activeCenteredMark = activeMarks.findLast(([m]) =>
          m.startsWith("^")
        );
        const activeUnderlineMark = activeMarks.findLast(([m]) =>
          m.startsWith("_")
        );
        const activeBoldItalicMark = activeMarks.findLast(([m]) =>
          m.startsWith("***")
        );
        const activeBoldMark = activeMarks.findLast(([m]) =>
          m.startsWith("**")
        );
        const activeItalicMark = activeMarks.findLast(([m]) =>
          m.startsWith("*")
        );
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
        const shaky = activeShakyMark ? shakyIndexMap.get(activeShakyMark) : 0;

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
        const speedShaky = activeShakyMark ? activeShakyMark[0].length - 1 : 1;
        const speed = speedModifier / speedWavy / speedShaky;
        const isPhrasePause = isPhraseBoundary;
        const isEmDashPause = currChunk && currChunk.emDash && !emDash;
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
            text: char,
            duration,
            speed,
            voicedSyllable,
            voiced,
            yelled,
            centered,
            bolded,
            italicized,
            underlined,
            wavy,
            shaky,
            emDash,
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
                centered,
                bolded,
                italicized,
                underlined,
                wavy,
                shaky,
                emDash,
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
    if (line.match(PARENTHETICAL_REGEX)) {
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

  if (character && !context?.system?.simulating) {
    stressPhrases(allPhrases, getValue(context, "character", character));
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
    const writer = getValue(context, "writer", target);
    const fadeDuration = writer?.fade_duration ?? 0;
    const letterPause = writer?.letter_pause ?? 0;
    const animationOffset = writer?.animation_offset ?? 0;
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

          // Wavy animation
          if (c.wavy) {
            event.with = "wavy";
            event.withAfter = c.wavy * animationOffset * -1;
          }
          // Shaky animation
          if (c.shaky) {
            event.with = "shaky";
            event.withAfter = c.shaky * animationOffset * -1;
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
        // Image Event
        if (c.tag === "image") {
          const event: ImageInstruction = {
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
            const toValue = getArgumentNumberValue(c.args, "to");
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
        // Audio Event
        if (c.tag === "audio") {
          const event: AudioInstruction = {
            control: c.control || "play",
            assets: c.assets,
          };
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
              event.to = 1;
            }
            const toValue = getArgumentNumberValue(c.args, "to");
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
        // Synth Event
        if (c.duration) {
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
              : getValueName(context, "synth", target || "", "writer");
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
