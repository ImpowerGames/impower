import { IElement } from "../../ui";
import { Character } from "../types/Character";
import { Phrase } from "../types/Phrase";
import { Writer } from "../types/Writer";
import { stressPhrases } from "./stressPhrases";

const populateAndStyleElement = (
  spanEl: IElement,
  textContent: string,
  instant: boolean,
  style?: Record<string, string | null>
): IElement => {
  spanEl.style["opacity"] = instant ? "1" : "0";
  Object.entries(style || {}).forEach(([k, v]) => {
    spanEl.style[k as "all"] = v as string;
  });
  spanEl.textContent = textContent;
  return spanEl;
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
  const letterDelay = writer?.letterDelay ?? 0;
  const pauseScale = writer?.pauseScale ?? 1;
  const maxSyllableLength = character?.prosody?.maxSyllableLength || 0;
  const voicedRegex = new RegExp(character?.prosody?.voiced || "", "u");
  const yelledRegex = new RegExp(character?.prosody?.yelled || "", "u");
  const punctuationRegex = new RegExp(
    character?.prosody?.punctuation || "",
    "u"
  );

  const partEls: IElement[] = [];
  const phrases: Phrase[] = [];
  let consecutiveLettersLength = 0;
  let consecutiveDotLength = 0;
  let word = "";
  const splitContent = content.split("");
  const marks: [string, number][] = [];
  let spaceLength = 0;
  let phrasePauseLength = 0;
  let phraseUnpauseLength = 0;
  let firstSpaceSpan: IElement | undefined = undefined;
  const imageUrls = new Set<string>();
  const audioUrls = new Set<string>();
  let hideSpace = false;
  for (let i = 0; i < splitContent.length; ) {
    const part = splitContent[i] || "";
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
    const voiced = voicedRegex.test(part);
    const punctuation = punctuationRegex.test(part);
    if (part === " " || part === "\n" || part === "\r" || part === "\t") {
      word = "";
      spaceLength += 1;
      consecutiveLettersLength = 0;
      consecutiveDotLength = 0;
    } else {
      word += part;
      spaceLength = 0;
      if (part === ".") {
        consecutiveDotLength += 1;
      } else {
        consecutiveDotLength = 0;
      }
      if (voiced) {
        consecutiveLettersLength += 1;
      } else {
        consecutiveLettersLength = 0;
      }
    }
    const yelled = yelledRegex.test(word);
    const startOfEllipsis =
      consecutiveDotLength === 1 && tripleLookahead === "...";
    const ellipsis = startOfEllipsis || consecutiveDotLength > 1;
    const isWordPause = spaceLength === 1;
    const isPhrasePause = spaceLength > 1;
    const duration =
      isWordPause || isPhrasePause || yelled || punctuation
        ? letterDelay * pauseScale
        : letterDelay;
    if (isPhrasePause) {
      phrasePauseLength += 1;
      phraseUnpauseLength = 0;
      if (phrasePauseLength === 1) {
        // start pause phrase
        phrases.push({
          text: part,
          chunks: [
            {
              char: part,
              duration,
              element: span,
              startOfWord: false,
              startOfSyllable: false,
              startOfEllipsis,
              voiced,
              italicized,
              bolded,
              underlined,
              yelled,
              ellipsis,
              punctuation,
            },
          ],
        });
      } else {
        // continue pause phrase
        const currentPhrase = phrases[phrases.length - 1];
        if (currentPhrase) {
          currentPhrase.text += part;
          currentPhrase.chunks.push({
            char: part,
            duration,
            element: span,
            startOfWord: false,
            startOfSyllable: false,
            startOfEllipsis,
            voiced,
            italicized,
            bolded,
            underlined,
            yelled,
            ellipsis,
            punctuation,
          });
        }
      }
    } else {
      phrasePauseLength = 0;
      phraseUnpauseLength += 1;
      // determine beep
      const charIndex = consecutiveLettersLength - 1;
      const startOfSyllable =
        charIndex === 0 ||
        (charIndex > 0 && charIndex % maxSyllableLength === 0);
      const startOfWord = consecutiveLettersLength === 1;
      if (phraseUnpauseLength === 1) {
        // start voiced phrase
        phrases.push({
          text: part,
          chunks: [
            {
              char: part,
              duration,
              element: span,
              startOfWord,
              startOfSyllable,
              startOfEllipsis,
              voiced,
              italicized,
              bolded,
              underlined,
              yelled,
              ellipsis,
              punctuation,
            },
          ],
        });
      } else {
        // continue voiced phrase
        const currentPhrase = phrases[phrases.length - 1];
        if (currentPhrase) {
          currentPhrase.text += part;
          currentPhrase.chunks.push({
            char: part,
            duration,
            element: span,
            startOfWord,
            startOfSyllable,
            startOfEllipsis,
            voiced,
            italicized,
            bolded,
            underlined,
            yelled,
            ellipsis,
            punctuation,
          });
        }
      }
    }
    if (span) {
      partEls[i] = span;
    }
    if (spaceLength === 1) {
      firstSpaceSpan = span;
    }
    if ((isWordPause || isPhrasePause) && firstSpaceSpan && debug) {
      // color pause span (longer time = darker color)
      firstSpaceSpan.style["backgroundColor"] = `hsla(0, 100%, 50%, ${
        spaceLength / 5
      })`;
    }
    if (spaceLength > 0) {
      if (hideSpace) {
        if (firstSpaceSpan) {
          firstSpaceSpan.textContent = "";
        }
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

  stressPhrases(phrases, character, writer, instant, debug);

  return phrases;
};
