/** The condition a line holds, as a forced verdict names it: the line's text
 *  without its indent, its leading `if`, `elseif`, `while` or `until`, and
 *  its trailing `then` or `do`. The text is the line's, not an analysis of
 *  it: a line that is not one of those statements stays as it is. */
export const conditionText = (line: string): string =>
  line
    .trim()
    .replace(/^(?:elseif|if|while|until)\s+/, "")
    .replace(/\s+(?:then|do)$/, "")
    .trim();
