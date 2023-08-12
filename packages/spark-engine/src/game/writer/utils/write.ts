import { IElement } from "../../ui";
import { Character } from "../types/Character";
import { Chunk } from "../types/Chunk";
import { Phrase } from "../types/Phrase";
import { Writer } from "../types/Writer";
import { stressPhrases } from "./stressPhrases";

const populateAndStyleElement = (
  spanEl: IElement,
  textContent: string,
  instant: boolean,
  style?: Record<string, string | null>
): IElement => {
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
  content: string,
  valueMap: Record<string, unknown>,
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
  const phrasePause = writer?.phrasePauseScale ?? 1;
  const stressPause = writer?.stressPauseScale ?? 1;
  const yellPause = writer?.yellPauseScale ?? 1;
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

  const partEls: IElement[] = [];
  const phrases: Phrase[] = [];
  let consecutiveLettersLength = 0;
  let word = "";
  const splitContent = content.split("");
  const marks: [string, number][] = [];
  let dashLength = 0;
  let spaceLength = 0;
  let phrasePauseLength = 0;
  let phraseUnpauseLength = 0;
  const imageUrls = new Set<string>();
  const audioUrls = new Set<string>();
  let hideSpace = false;
  let currChunk: Chunk | undefined = undefined;
  for (let i = 0; i < splitContent.length; ) {
    const part = splitContent[i] || "";
    const nextPart = splitContent[i + 1] || "";
    const lastMark = marks[marks.length - 1]?.[0];
    const doubleLookahead = splitContent.slice(i, i + 2).join("");
    const tripleLookahead = splitContent.slice(i, i + 3).join("");
    if (tripleLookahead === "***") {
      if (lastMark === "***") {
        marks.pop();
      } else {
        marks.push(["***", i]);
      }
      i += 3;
      continue;
    }
    if (doubleLookahead === "**") {
      if (lastMark === "**") {
        marks.pop();
      } else {
        marks.push(["**", i]);
      }
      i += 2;
      continue;
    }
    if (doubleLookahead === "[[") {
      i += 2;
      const from = i;
      while (
        i < splitContent.length &&
        splitContent.slice(i, i + 2).join("") !== "]]"
      ) {
        i += 1;
      }
      const to = i;
      const portraitName = splitContent.slice(from, to).join("");
      const portraitUrl = valueMap?.[portraitName] as string;
      if (portraitUrl) {
        imageUrls.add(portraitUrl);
      }
      i += 2;
      continue;
    }
    if (doubleLookahead === "((") {
      i += 2;
      const from = i;
      while (
        i < splitContent.length &&
        splitContent.slice(i, i + 2).join("") !== "))"
      ) {
        i += 1;
      }
      const to = i;
      const audioName = splitContent.slice(from, to).join("");
      const audioUrl = valueMap?.[audioName] as string;
      if (audioUrl) {
        audioUrls.add(audioUrl);
      }
      i += 2;
      continue;
    }
    if (part === "|") {
      i += 1;
      hideSpace = true;
      continue;
    }
    if (part === "*") {
      if (lastMark === "*") {
        marks.pop();
      } else {
        marks.push([part, i]);
      }
      i += 1;
      continue;
    }
    if (part === "_") {
      if (lastMark === "_") {
        marks.pop();
      } else {
        marks.push([part, i]);
      }
      i += 1;
      continue;
    }
    const markers = marks.map((x) => x[0]);
    const underlined = markers.includes("_");
    const isBoldedAndItalicized = markers.includes("***");
    const isBolded = markers.includes("**");
    const isItalicized = markers.includes("*");
    const italicized = isBoldedAndItalicized || isItalicized;
    const bolded = isBoldedAndItalicized || isBolded;
    const style = {
      textDecoration: underlined ? "underline" : null,
      fontStyle: italicized ? "italic" : null,
      fontWeight: bolded ? "bold" : null,
      whiteSpace: part === "\n" ? "pre-wrap" : null,
    };
    const span = onCreateElement?.();
    if (span) {
      populateAndStyleElement(span, part || "", instant, style);
    }
    const voiced = Boolean(voicedRegex?.test(part));
    if (isWhitespace(part)) {
      word = "";
      spaceLength += 1;
      consecutiveLettersLength = 0;
    } else {
      word += part;
      spaceLength = 0;
      if (voiced) {
        consecutiveLettersLength += 1;
      } else {
        consecutiveLettersLength = 0;
      }
    }
    if (isDash(part)) {
      dashLength += 1;
    } else {
      dashLength = 0;
    }
    const yelled =
      Boolean(yelledRegex?.test(word)) &&
      (Boolean(yelledRegex?.test(nextPart)) || word.length > 1);
    const tilde = part === "~";
    const isEmDashBoundary = dashLength > 1;
    const emDash = isEmDashBoundary || isDash(doubleLookahead);
    const isPhraseBoundary =
      spaceLength > 1 || (currChunk && currChunk.emDash && !emDash);
    const isPhrasePause = isPhraseBoundary || isWhitespace(doubleLookahead);
    const isStressPause: boolean = Boolean(
      character &&
        spaceLength === 1 &&
        !isPhrasePause &&
        currChunk &&
        ((currChunk.underlined && !underlined) ||
          (currChunk.bolded && !bolded) ||
          (currChunk.italicized && !italicized) ||
          (currChunk.tilde && !tilde))
    );
    const isYellPause: boolean = Boolean(
      character &&
        spaceLength === 1 &&
        !isPhrasePause &&
        currChunk &&
        currChunk.yelled &&
        !yelled
    );

    const duration: number = isPhrasePause
      ? letterDelay * phrasePause
      : isYellPause
      ? letterDelay * yellPause
      : isStressPause
      ? letterDelay * stressPause
      : letterDelay;

    if (isPhraseBoundary) {
      phrasePauseLength += 1;
      phraseUnpauseLength = 0;
    } else {
      phrasePauseLength = 0;
      phraseUnpauseLength += 1;
    }
    // determine beep
    const charIndex = phraseUnpauseLength - 1;
    const startOfSyllable = charIndex % syllableLength === 0;
    const startOfWord = consecutiveLettersLength === 1;
    if (phraseUnpauseLength === 1) {
      // start voiced phrase
      currChunk = {
        char: part,
        duration,
        element: span,
        startOfWord,
        startOfSyllable,
        voiced,
        yelled,
        italicized,
        bolded,
        underlined,
        emDash,
        tilde,
        punctuated: false,
        sustained: false,
      };
      phrases.push({
        text: part,
        chunks: [currChunk],
      });
    } else {
      // continue voiced phrase
      const currentPhrase = phrases[phrases.length - 1];
      if (currentPhrase) {
        currentPhrase.text += part;
        currChunk = {
          char: part,
          duration,
          element: span,
          startOfWord,
          startOfSyllable,
          voiced,
          yelled,
          italicized,
          bolded,
          underlined,
          emDash,
          tilde,
          punctuated: false,
          sustained: false,
        };
        currentPhrase.chunks.push(currChunk);
      }
    }
    if (span) {
      partEls[i] = span;
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
      const [lastMark, lastMarkIndex] = marks[marks.length - 1] || [];
      const invalidStyleEls = partEls.slice(lastMarkIndex).map((x) => x);
      invalidStyleEls.forEach((e) => {
        if (lastMark === "***") {
          e.style["fontWeight"] = null;
          e.style["fontStyle"] = null;
        }
        if (lastMark === "**") {
          e.style["fontWeight"] = null;
        }
        if (lastMark === "*") {
          e.style["fontStyle"] = null;
        }
        if (lastMark === "_") {
          e.style["textDecoration"] = null;
        }
      });
      marks.pop();
    }
  }
  phrases.forEach((phrase) => {
    // Erase any syllables that occur on any unvoiced chars at the end of phrases
    // (whitespace, punctuation, etc).
    for (let c = phrase.chunks.length - 1; c >= 0; c -= 1) {
      const chunk = phrase.chunks[c]!;
      if (!chunk.voiced) {
        chunk.startOfSyllable = false;
      } else {
        break;
      }
    }
    // Voice any phrases that are entirely composed of ellipsis.
    if (punctuatedRegex?.test(phrase.text)) {
      for (let c = 0; c < phrase.chunks.length; c += 1) {
        const chunk = phrase.chunks[c]!;
        if (!isWhitespace(chunk.char)) {
          chunk.punctuated = true;
          chunk.duration = letterDelay * punctuatePause;
        }
      }
    }
  });

  if (character) {
    stressPhrases(phrases, character);
  }

  const letterFadeDuration = writer?.fadeDuration ?? 0;
  let time = 0;
  phrases.forEach((phrase) => {
    phrase.chunks.forEach((c) => {
      c.time = time;
      if (c.element) {
        c.element.style["transition"] = instant
          ? "none"
          : `opacity ${letterFadeDuration}s linear ${c.time}s`;
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
  });

  return phrases;
};
