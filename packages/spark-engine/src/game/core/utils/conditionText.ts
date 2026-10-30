export const conditionText = (line: string): string =>
  line
    .trim()
    .replace(/^(?:elseif|if|while|until)\s+/, "")
    .replace(/\s+(?:then|do)$/, "")
    .trim();
