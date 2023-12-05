import { IElement } from "../../ui";
import Matcher from "../classes/Matcher";
import { Character } from "../specs/Character";
import { Writer } from "../specs/Writer";
import { Chunk } from "../types/Chunk";
import { Phrase } from "../types/Phrase";
import { stressPhrases } from "./stressPhrases";

const SINGLE_MARKERS = ["*", "_", "^", "|"];

const DOUBLE_MARKERS = ["~~", "==", ">>", "<<", "::"];

const populateAndStyleElement = (
  spanEl: IElement,
  textContent: string,
  style?: Record<string, string | null>
): IElement => {
  Object.entries(style || {}).forEach(([k, v]) => {
    spanEl.style[k as "all"] = v as string;
  });
  spanEl.textContent = textContent;
  return spanEl;
};

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
  const beepSound = character?.synth || writer?.synth;
  const beepEnvelope = beepSound?.envelope;
  const beepDuration = beepEnvelope
    ? (beepEnvelope.attack ?? 0) +
      (beepEnvelope.decay ?? 0) +
      (beepEnvelope.sustain ?? 0) +
      (beepEnvelope.release ?? 0)
    : 0;
  const letterDelay = writer?.letter_pause ?? 0;
  const animationOffset = writer?.animation_offset ?? 0;
  const floatingAnimation = writer?.floating_animation;
  const tremblingAnimation = writer?.trembling_animation;
  const phrasePause = writer?.phrase_pause_scale ?? 1;
  const emDashPause = writer?.em_dash_pause_scale ?? 1;
  const stressPause = writer?.stressed_pause_scale ?? 1;
  const interjectionPause = writer?.punctuated_pause_scale ?? 1;
  const syllableLength = Math.max(
    writer?.min_syllable_length || 0,
    Math.round(beepDuration / letterDelay)
  );
  const voicedMatcher = writer?.voiced
    ? new Matcher(writer?.voiced)
    : undefined;
  const yelledMatcher = writer?.yelled
    ? new Matcher(writer?.yelled)
    : undefined;
  const punctuatedMatcher = writer?.punctuated
    ? new Matcher(writer?.punctuated)
    : undefined;
  const skippedMatcher = writer?.skipped
    ? new Matcher(writer?.skipped)
    : undefined;

  const result: Phrase[] = [];

  let prevTarget = "";

  let consecutiveLettersLength = 0;
  let word = "";
  let dashLength = 0;
  let spaceLength = 0;
  let phrasePauseLength = 0;
  let phraseUnpauseLength = 0;
  let escaped = false;
  let wrapper: IElement | undefined = undefined;
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
    wrapper = undefined;
  };

  const imageLayerChunks: Record<string, Chunk[]> = {};

  content.forEach((p, contentIndex) => {
    if (p.ignore) {
      return;
    }
    const nextContent = content[contentIndex + 1];
    const image = p.image;
    if (image) {
      const target = p.target ?? "Portrait";
      const spanEl = onCreateElement?.();
      if (spanEl) {
        const spanStyle = {
          opacity: "0",
          willChange: "opacity",
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
        };
        populateAndStyleElement(spanEl, "", spanStyle);
      }
      const imageEl = onCreateElement?.();
      if (imageEl) {
        const imageStyle = {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          backgroundSize: "auto 100%",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: "1",
          pointerEvents: "none",
          willChange: "opacity",
        };
        populateAndStyleElement(imageEl, "", imageStyle);
      }
      const chunk: Chunk = {
        char: "",
        duration: 0,
        speed: 0,
        element: spanEl,
        image: imageEl,
      };
      imageLayerChunks[target] ??= [];
      imageLayerChunks[target]?.push(chunk);
      result.push({
        ...p,
        chunks: [chunk],
      });
      startNewPhrase();
    }
    const audio = p.audio;
    if (audio) {
      result.push({
        ...p,
        chunks: [{ char: "", duration: 0, speed: 0 }],
      });
      startNewPhrase();
    }
    const text = p.text;
    if (text) {
      if (skippedMatcher && skippedMatcher.test(text)) {
        return;
      }
      const target = p.target || "";
      if (target !== prevTarget || target === "choice") {
        prevTarget = target;
        startNewPhrase();
      }
      const marks: [string, number][] = [];
      const partEls: IElement[] = [];
      const chars = text.split("");
      for (let i = 0; i < chars.length; ) {
        const char = chars[i] || "";
        const nextChar = chars[i + 1] || nextContent?.text?.[0] || "";
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
        }
        escaped = false;
        const markers = marks.map((x) => x[0]);
        const activeCenteredMark = markers.find((m) => m.startsWith("|"));
        const activeBoldItalicMark = markers.find((m) => m.startsWith("***"));
        const activeUnderlineMark = markers.find((m) => m.startsWith("_"));
        const activePitchUpMark = markers.find((m) => m.startsWith("^"));
        const activeFloatingMark = markers.find((m) => m.startsWith("~~"));
        const activeTremblingMark = markers.find((m) => m.startsWith("=="));
        const activeFasterMark = markers.find((m) => m.startsWith(">>"));
        const activeSlowerMark = markers.find((m) => m.startsWith("<<"));
        const activeInstantMark = markers.find((m) => m.startsWith("::"));
        const isCentered = Boolean(activeCenteredMark);
        const hasBoldItalicMark = Boolean(activeBoldItalicMark);
        const isUnderlined = Boolean(activeUnderlineMark);
        const hasBoldMark = markers.includes("**");
        const hasItalicMark = markers.includes("*");
        const isItalicized = hasBoldItalicMark || hasItalicMark;
        const isBolded = hasBoldItalicMark || hasBoldMark;
        const style = {
          opacity: instant || p.speed === 0 ? "1" : "0",
          willChange: "opacity",
          position: "relative",
          textDecoration: isUnderlined ? "underline" : null,
          fontStyle: isItalicized ? "italic" : null,
          fontWeight: isBolded ? "bold" : null,
          whiteSpace: char === "\n" ? "pre-wrap" : null,
          textAlign: "center",
        };
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
        const startOfSyllable = charIndex % syllableLength === 0;
        const startOfWord = consecutiveLettersLength === 1;
        const speedFaster = activeFasterMark?.length ?? 1;
        const speedSlower = activeSlowerMark?.length ?? 1;
        const speedInstant = activeInstantMark ? 0 : 1;
        const speedFloating = floating ? floating : 1;
        const speedTrembling = trembling ? trembling : 1;
        const speed =
          p.speed === 0
            ? 0
            : (1 * speedInstant * speedFaster) /
              speedSlower /
              speedFloating /
              speedTrembling /
              (p.speed ?? 1);
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
                ? letterDelay * phrasePause
                : isEmDashPause
                ? letterDelay * emDashPause
                : isStressPause
                ? letterDelay * stressPause
                : letterDelay) / speed;

        // create wrapper element for centered chunks
        if (isCentered) {
          if (!currChunk?.centered) {
            wrapper = onCreateElement?.();
            if (wrapper) {
              wrapper.style["display"] = "block";
              wrapper.style["textAlign"] = "center";
            }
          }
        } else {
          wrapper = undefined;
        }

        if (phraseUnpauseLength === 1) {
          // start voiced phrase
          const span = onCreateElement?.();
          if (span) {
            populateAndStyleElement(span, char, style);
            partEls.push(span);
          }
          currChunk = {
            char,
            duration,
            speed,
            startOfWord,
            startOfSyllable,
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
            punctuated: false,
            sustained: false,
            wrapper,
            element: span,
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
            if (
              !speed &&
              !duration &&
              currChunk?.element &&
              bolded === currChunk?.bolded &&
              italicized === currChunk?.italicized &&
              underlined === currChunk?.underlined &&
              floating === currChunk?.floating &&
              trembling === currChunk?.trembling
            ) {
              // No need to create new element, simply append char to previous chunk
              currChunk.char += char;
              currChunk.element.textContent += char;
            } else {
              // Create new element and chunk
              const span = onCreateElement?.();
              if (span) {
                populateAndStyleElement(span, char, style);
                partEls.push(span);
              }
              currChunk = {
                char,
                duration,
                speed,
                startOfWord,
                startOfSyllable,
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
                punctuated: false,
                sustained: false,
                wrapper,
                element: span,
              };
              currentPhrase.chunks ??= [];
              currentPhrase.chunks.push(currChunk);
            }
          }
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
      // Voice any phrases that are entirely composed of ellipsis.
      if (phrase.text) {
        if (punctuatedMatcher?.test(phrase.text)) {
          for (let c = 0; c < phrase.chunks.length; c += 1) {
            const chunk = phrase.chunks[c]!;
            if (!isWhitespace(chunk.char)) {
              chunk.punctuated = true;
              chunk.duration = letterDelay * interjectionPause;
            }
          }
        }
      }
    }
  });

  if (character) {
    stressPhrases(result, character);
  }

  const letterFadeDuration = writer?.letter_fade_duration ?? 0;
  let time = 0;
  let floatingIndex = 0;
  let tremblingIndex = 0;
  result.forEach((phrase) => {
    if (phrase.chunks) {
      phrase.chunks.forEach((c) => {
        c.time = time;
        if (c.element) {
          const fadeDuration = c.char ? letterFadeDuration : 0;
          c.element.style["transition"] = instant
            ? "none"
            : `opacity ${fadeDuration}s linear ${c.time}s`;
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
