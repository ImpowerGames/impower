import { FormattedText } from "../types/FormattedText";

export const getStyledHtml = (
  content: FormattedText[] | undefined,
  className = "",
  indent = ""
): string => {
  if (!content) {
    return "";
  }
  const alignedGroups: { align?: string; content: FormattedText[] }[] = [];
  content.forEach((textbox) => {
    const currGroup = alignedGroups.at(-1);
    if (currGroup && textbox.align === currGroup.align) {
      currGroup.content.push(textbox);
    } else {
      alignedGroups.push({
        align: textbox.align,
        content: [textbox],
      });
    }
  });

  let html = "";
  alignedGroups.forEach((alignedGroup) => {
    const classAttr = className ? ` class="${className}"` : "";
    const alignAttr =
      alignedGroup.align === "center" || alignedGroup.align === "right"
        ? ` align="${alignedGroup.align}"`
        : "";
    html += alignedGroup.content
      .map((c) => getLimitedHtml(c))
      .join("")
      .split("\n")
      .map((h) =>
        h ? `\n${indent}<p${classAttr}${alignAttr}>${h}</p>` : `\n${indent}<br>`
      )
      .join("");
  });
  return html.trim();
};

const getLimitedHtml = (textbox: FormattedText): string => {
  let text = textbox.text;
  if (textbox.italic) {
    text = `<i>${text}</i>`;
  }
  if (textbox.bold) {
    text = `<b>${text}</b>`;
  }
  if (textbox.underline) {
    text = `<u>${text}</u>`;
  }
  return text;
};
