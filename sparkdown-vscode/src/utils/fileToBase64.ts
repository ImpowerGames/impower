export const fileToBase64 = (fspath: string): string | undefined => {
  const fs = require("fs");
  if (!fs) {
    return;
  }
  const data = fs.readFileSync(fspath);
  return data.toString("base64");
};
