export const profile = (
  mark: "start" | "end",
  profilerId: string | undefined,
  method: string
) => {
  if (profilerId) {
    const measureName = `${profilerId} ${method}`;
    const startMark = `${measureName} start`;
    const endMark = `${measureName} end`;
    if (mark === "end") {
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);
    } else {
      performance.mark(startMark);
    }
  }
};
