export const roundToNearestStep = (n: number, step: number): number => {
  const rounded = Math.round(n / step) * step;
  if (step !== undefined) {
    const stepFractionDigits = step.toString().split(".")[1]?.length || 0;
    return Number(rounded.toFixed(stepFractionDigits));
  }
  return Number(rounded.toString());
};
