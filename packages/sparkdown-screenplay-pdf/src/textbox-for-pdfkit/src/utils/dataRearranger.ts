import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";

export const normalizeTexts = (
  textArray: FormattedText[],
  textboxStyle: TextOptions
) => {
  /* 
      This function adds default values to every text object. This is necessary
      that all lines can be added with correct styling later.
      Also it checks whether linebreaks with '\n' are inside the text.
      If there are any it handles this using normalizedLinebreak function.
  */

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
  textboxStyle: TextOptions
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
    // If there is no line height specified, it just gets the standard textbox Line Height
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
  normalizedTextWithLinebreaks: FormattedText
) => {
  /* 
      This function checks whether linebreaks with '\n' are inside the text. 
      If there are any it creates a new object with "newline=true"
    */
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
  /*
    After linebreaks are normalized, it is quite easy to summarize
    the paragraphs. Paragraphs are neccessary, because they need to be
    line wrapped as a whole. Every "newline" is a sign for a paragraph
    end.
   */
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
  /* 
    This function turns arrays of lines into an object.
    It checks every text part of the line and summarizes
    the styling inside the object --> This is needed to
    position the line on the PDF correctly.
   */
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
