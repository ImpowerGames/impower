const getCssEase = (value: string | null, defaultValue = "linear"): string => {
  if (!value) {
    return defaultValue;
  }
  if (
    value === "none" ||
    value === "linear" ||
    value === "ease" ||
    value === "ease-in" ||
    value === "ease-out" ||
    value === "ease-in-out" ||
    value === "step-start" ||
    value === "step-end" ||
    value.startsWith("var(") ||
    value.startsWith("cubic-bezier(") ||
    value.startsWith("steps(")
  ) {
    return value;
  }
  const [ease, outgoing, incoming] = value.split("-");
  const outgoingPercent = Number(outgoing);
  const incomingPercent = Number(incoming);
  if (
    ease === "ease" &&
    !Number.isNaN(outgoingPercent) &&
    !Number.isNaN(incomingPercent)
  ) {
    const x1 = outgoingPercent / 100;
    const x2 = 1 - incomingPercent / 100;
    return `cubic-bezier(${x1}, 0, ${x2}, 1)`;
  }
  return `var(--s-easing-${value})`;
};

export default getCssEase;
