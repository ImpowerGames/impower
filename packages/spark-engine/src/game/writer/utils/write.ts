import { IElement } from "../../ui";
import { Character } from "../types/Character";
import { Chunk } from "../types/Chunk";
import { Phrase } from "../types/Phrase";
import { Writer } from "../types/Writer";
import { stressPhrases } from "./stressPhrases";

const SINGLE_MARKERS = ["*", "_", "^"];

const DOUBLE_MARKERS = ["~~", "==", "//", "\\\\", "::"];

const populateAndStyleElement = (
  spanEl: IElement,
  textContent: string,
  instant: boolean,
  style?: Record<string, string | null>
): IElement => {
  spanEl.style["position"] = "relative";
  spanEl.style["display"] = "none";
  spanEl.style["opacity"] = instant ? "1" : "0";
  Object.entries(style || {}).forEach(([k, v]) => {
    spanEl.style[k as "all"] = v as string;
  });
  spanEl.textContent = textContent;
  return spanEl;
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

export const write = (
  content: Phrase[],
  writer: Writer | undefined,
  character: Character | undefined,
  instant = false,
  debug?: boolean,
  onCreateElement?: () => IElement
): Phrase[] => {
  const beepSound = character?.voiceSound || writer?.clackSound;
  const beepEnvelope = beepSound?.envelope;
  const beepDuration = beepEnvelope
    ? (beepEnvelope.attack ?? 0) +
      (beepEnvelope.decay ?? 0) +
      (beepEnvelope.sustain ?? 0) +
      (beepEnvelope.release ?? 0)
    : 0;
  const letterDelay = writer?.letterDelay ?? 0;
  const animationOffset = writer?.animationOffset ?? 0;
  const floatingAnimation = writer?.floatingAnimation;
  const tremblingAnimation = writer?.tremblingAnimation;
  const phrasePause = writer?.phrasePauseScale ?? 1;
  const emDashPause = writer?.emDashPauseScale ?? 1;
  const stressPause = writer?.stressPauseScale ?? 1;
  const punctuatePause = writer?.punctuatePauseScale ?? 1;
  const syllableLength = Math.max(
    writer?.minSyllableLength || 0,
    Math.round(beepDuration / letterDelay)
  );
  const voicedRegex = writer?.voiced
    ? new RegExp(writer?.voiced, "u")
    : undefined;
  const yelledRegex = writer?.yelled
    ? new RegExp(writer?.yelled, "u")
    : undefined;
  const punctuatedRegex = writer?.punctuated
    ? new RegExp(writer?.punctuated, "u")
    : undefined;

  const result: Phrase[] = [];

  let prevLayer = "";

  let consecutiveLettersLength = 0;
  let word = "";
  let dashLength = 0;
  let spaceLength = 0;
  let phrasePauseLength = 0;
  let phraseUnpauseLength = 0;
  let hideSpace = false;
  let escaped = false;
  let currChunk: Chunk | undefined = undefined;

  content.forEach((p) => {
    const writeInstantly = Boolean(instant || p.instant);
    const image = p.image;
    if (image) {
      result.push({ ...p });
    }
    const audio = p.audio;
    if (audio) {
      result.push({ ...p });
    }
    const text = p.text;
    if (text) {
      const layer = p.layer || "";
      if (layer !== prevLayer || layer === "Choice") {
        prevLayer = layer;
        // Reset all inter-phrase trackers
        consecutiveLettersLength = 0;
        word = "";
        dashLength = 0;
        spaceLength = 0;
        phrasePauseLength = 0;
        phraseUnpauseLength = 0;
        hideSpace = false;
        currChunk = undefined;
        escaped = false;
      }
      const marks: [string, number][] = [];
      const partEls: IElement[] = [];
      const chars = text.split("");
      for (let i = 0; i < chars.length; ) {
        const char = chars[i] || "";
        const nextPart = chars[i + 1] || "";
        const lastMark = marks[marks.length - 1]?.[0];
        const doubleLookahead = chars.slice(i, i + 2).join("");
        if (!escaped) {
          if (char === "\\") {
            // escape char
            i += 1;
            escaped = true;
            continue;
          }
          if (SINGLE_MARKERS.includes(char)) {
            let mark = "";
            let m = i;
            while (chars[m] === char) {
              mark += chars[m];
              m += 1;
            }
            if (lastMark === mark) {
              marks.pop();
            } else {
              marks.push([mark, i]);
            }
            i += mark.length;
            continue;
          }
          if (DOUBLE_MARKERS.includes(doubleLookahead)) {
            let mark = "";
            let m = i;
            while (chars[m] === char) {
              mark += chars[m];
              m += 1;
            }
            if (lastMark === mark) {
              marks.pop();
            } else {
              marks.push([mark, i]);
            }
            i += mark.length;
            continue;
          }
          if (char === "|") {
            i += 1;
            hideSpace = true;
            continue;
          }
        }
        escaped = false;
        const markers = marks.map((x) => x[0]);
        const activeBoldItalicMark = markers.find((m) => m.startsWith("***"));
        const activeUnderlineMark = markers.find((m) => m.startsWith("_"));
        const activePitchUpMark = markers.find((m) => m.startsWith("^"));
        const activeFloatingMark = markers.find((m) => m.startsWith("~~"));
        const activeTremblingMark = markers.find((m) => m.startsWith("=="));
        const activeFasterMark = markers.find((m) => m.startsWith("//"));
        const activeSlowerMark = markers.find((m) => m.startsWith("\\\\"));
        const activeInstantMark = markers.find((m) => m.startsWith("::"));
        const hasBoldItalicMark = Boolean(activeBoldItalicMark);
        const isUnderlined = Boolean(activeUnderlineMark);
        const hasBoldMark = markers.includes("**");
        const hasItalicMark = markers.includes("*");
        const isItalicized = hasBoldItalicMark || hasItalicMark;
        const isBolded = hasBoldItalicMark || hasBoldMark;
        const style = {
          textDecoration: isUnderlined ? "underline" : null,
          fontStyle: isItalicized ? "italic" : null,
          fontWeight: isBolded ? "bold" : null,
          whiteSpace: char === "\n" ? "pre-wrap" : null,
        };
        const span = onCreateElement?.();
        if (span) {
          populateAndStyleElement(span, char || "", writeInstantly, style);
        }
        const voiced = Boolean(voicedRegex?.test(char));
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
          Boolean(yelledRegex?.test(word)) &&
          (Boolean(yelledRegex?.test(nextPart)) || word.length > 1);
        const tilde = char === "~";
        const isEmDashBoundary = dashLength > 1;
        const emDash = isEmDashBoundary || isDash(doubleLookahead);
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
        const startOfSyllable = charIndex % syllableLength === 0;
        const startOfWord = consecutiveLettersLength === 1;
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
        const isPhrasePause = isPhraseBoundary || isWhitespace(doubleLookahead);
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
          (isPhrasePause
            ? letterDelay * phrasePause
            : isEmDashPause
            ? letterDelay * emDashPause
            : isStressPause
            ? letterDelay * stressPause
            : letterDelay) / speed;

        if (phraseUnpauseLength === 1) {
          // start voiced phrase
          currChunk = {
            char,
            duration,
            speed,
            element: span,
            startOfWord,
            startOfSyllable,
            voiced,
            yelled,
            bolded,
            italicized,
            underlined,
            floating,
            trembling,
            emDash,
            tilde,
            pitch,
            punctuated: false,
            sustained: false,
          };
          result.push({
            ...p,
            text: char,
            chunks: [currChunk],
          });
        } else {
          // continue voiced phrase
          const currentPhrase = result[result.length - 1];
          if (currentPhrase) {
            currentPhrase.text ??= "";
            currentPhrase.text += char;
            currChunk = {
              char,
              duration,
              speed,
              element: span,
              startOfWord,
              startOfSyllable,
              voiced,
              yelled,
              bolded,
              italicized,
              underlined,
              floating,
              trembling,
              emDash,
              tilde,
              pitch,
              punctuated: false,
              sustained: false,
            };
            currentPhrase.chunks ??= [];
            currentPhrase.chunks.push(currChunk);
          }
        }
        if (span) {
          partEls.push(span);
        }
        if (spaceLength > 0) {
          if (hideSpace) {
            if (span) {
              span.textContent = "";
            }
          }
        } else {
          hideSpace = false;
        }
        i += 1;
      }
      // Invalidate any leftover open markers
      if (marks.length > 0) {
        while (marks.length > 0) {
          const [lastMark, lastMarkIndex] = marks[marks.length - 1]! || [];
          const invalidStyleEls = partEls.slice(lastMarkIndex).map((x) => x);
          invalidStyleEls.forEach((e) => {
            if (lastMark.startsWith("***")) {
              e.style["fontWeight"] = null;
              e.style["fontStyle"] = null;
            }
            if (lastMark.startsWith("**")) {
              e.style["fontWeight"] = null;
            }
            if (lastMark.startsWith("*")) {
              e.style["fontStyle"] = null;
            }
            if (lastMark.startsWith("_")) {
              e.style["textDecoration"] = null;
            }
          });
          marks.pop();
        }
      }
    }
  });
  result.forEach((phrase) => {
    // Erase any syllables that occur on any unvoiced chars at the end of phrases
    // (whitespace, punctuation, etc).
    if (phrase.chunks) {
      for (let c = phrase.chunks.length - 1; c >= 0; c -= 1) {
        const chunk = phrase.chunks[c]!;
        if (!chunk.voiced) {
          chunk.startOfSyllable = false;
        } else {
          break;
        }
      }
      // Voice any phrases that are entirely composed of punctuation.
      if (phrase.text) {
        if (punctuatedRegex?.test(phrase.text)) {
          for (let c = 0; c < phrase.chunks.length; c += 1) {
            const chunk = phrase.chunks[c]!;
            if (!isWhitespace(chunk.char)) {
              chunk.punctuated = true;
              chunk.duration = letterDelay * punctuatePause;
            }
          }
        }
      }
    }
  });

  if (character) {
    stressPhrases(result, character);
  }

  const letterFadeDuration = writer?.fadeDuration ?? 0;
  let time = 0;
  let floatingIndex = 0;
  let tremblingIndex = 0;
  result.forEach((phrase) => {
    const writeInstantly = Boolean(instant || phrase.instant);
    if (phrase.chunks) {
      phrase.chunks.forEach((c) => {
        c.time = time;
        if (c.element) {
          c.element.style["transition"] = writeInstantly
            ? "none"
            : `opacity ${letterFadeDuration}s linear ${c.time}s`;
          if (c.floating && floatingAnimation) {
            c.element.style["animation"] = floatingAnimation;
            c.element.style["animation-delay"] = `${
              floatingIndex * animationOffset
            }s`;
          }
          if (c.floating) {
            floatingIndex += 1;
          } else {
            floatingIndex = 0;
          }
          if (c.trembling && tremblingAnimation) {
            c.element.style["animation"] = tremblingAnimation;
            c.element.style["animation-delay"] = `${
              tremblingIndex * animationOffset
            }s`;
          }
          if (c.trembling) {
            tremblingIndex += 1;
          } else {
            tremblingIndex = 0;
          }
        }
        time += c.duration;

        if (debug) {
          if (c.element) {
            if (c.duration > letterDelay) {
              // color pauses (longer time = darker color)
              c.element.style["backgroundColor"] = `hsla(0, 100%, 50%, ${
                0.5 - letterDelay / c.duration
              })`;
            }
            if (c.startOfSyllable) {
              // color beeps
              c.element.style["backgroundColor"] = `hsl(185, 100%, 50%)`;
            }
          }
        }
      });
    }
  });

  return result;
};
