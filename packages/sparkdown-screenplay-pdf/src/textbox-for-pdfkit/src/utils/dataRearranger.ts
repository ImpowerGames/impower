import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";

export const normalizeTexts = (
  textArray: FormattedText[],
  textboxStyle: TextOptions,
) => {

  const normalizedTexts = textArray.flatMap((textInput) => {
    const textWithLineHeight = normalizeLineHeight(textInput, textboxStyle);
    const normalizedTextWithLinebreaks = {
      ...textboxStyle,
      newLine: false,
      ...textWithLineHeight,
    };
    return normalizeLinebreaks(normalizedTextWithLinebreaks);
  });
  return normalizedTexts;
};

export const normalizeLineHeight = (
  text: FormattedText,
  textboxStyle: TextOptions,
) => {
  if (text.lineHeight != null) {
    if (text.fontSize != null) {
      return { ...text, lineHeight: text.lineHeight * text.fontSize };
    } else {
      if (textboxStyle.fontSize != null) {
        return { ...text, lineHeight: text.lineHeight * textboxStyle.fontSize };
      }
    }
  } else {
    if (textboxStyle.lineHeight != null && textboxStyle.fontSize != null) {
      return {
        ...text,
        lineHeight: textboxStyle.lineHeight * textboxStyle.fontSize,
      };
    }
  }
  return text;
};

export const normalizeLinebreaks = (
  normalizedTextWithLinebreaks: FormattedText,
) => {
  const lineBreakedText = normalizedTextWithLinebreaks.text.split("\n");
  if (lineBreakedText.length === 0) return normalizedTextWithLinebreaks;
  return lineBreakedText.map((textFraction, index) => {
    if (index === 0)
      return { ...normalizedTextWithLinebreaks, text: textFraction };
    return {
      ...normalizedTextWithLinebreaks,
      text: textFraction,
      newLine: true,
    };
  });
};

export const summarizeParagraphs = (normalizedTexts: FormattedText[]) => {
  const paragraphs = [];
  let paragraph: FormattedText[] = [];
  normalizedTexts.forEach((text, index) => {
    if (text.newLine && index != 0) {
      paragraphs.push(paragraph);
      paragraph = [];
    }
    paragraph.push(text);
  });
  if (paragraph.length !== 0) paragraphs.push(paragraph);
  return paragraphs;
};

export const createLine = (texts: FormattedText[]) => {
  let lineHeight = 0;
  let width = 0;
  let align = texts[0]?.align;
  const lineTexts = texts.map((text) => {
    const newText = { ...text };
    if (newText.lineHeight != null && newText.lineHeight > lineHeight) {
      lineHeight = newText.lineHeight;
    }
    if (newText.width != null) {
      width += newText.width;
    }
    delete newText.lineHeight;
    delete newText.align;
    return newText;
  });
  const line = {
    align: align,
    width: width,
    lineHeight: lineHeight,
    texts: lineTexts,
  };
  return line;
};
