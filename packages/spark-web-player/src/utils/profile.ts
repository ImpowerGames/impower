export const profile = (mark: "start" | "end", method: string) => {
  if (mark === "end") {
    performance.mark(`${method} end`);
    performance.measure(`${method}`.trim(), `${method} start`, `${method} end`);
  } else {
    performance.mark(`${method} start`);
  }
};
