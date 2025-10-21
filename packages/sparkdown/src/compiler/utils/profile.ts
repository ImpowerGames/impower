export const profile = (
  mark: "start" | "end",
  profilerId: string | undefined,
  method: string,
  uri: string = ""
) => {
  if (profilerId) {
    if (mark === "end") {
      performance.mark(`${profilerId} ${method} ${uri} end`);
      performance.measure(
        `${profilerId} ${method} ${uri}`.trim(),
        `${profilerId} ${method} ${uri} start`,
        `${profilerId} ${method} ${uri} end`
      );
    } else {
      performance.mark(`${profilerId} ${method} ${uri} start`);
    }
  }
};
