export const profile = (mark: "start" | "end", method: string, uri: string) => {
  if (mark === "end") {
    performance.mark(`${method} ${uri} end`);
    performance.measure(
      `${method} ${uri}`,
      `${method} ${uri} start`,
      `${method} ${uri} end`
    );
  } else {
    performance.mark(`${method} ${uri} start`);
  }
};
