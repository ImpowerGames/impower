import * as fs from "fs";

export function fileToBase64(fspath: string) {
  const data = fs.readFileSync(fspath);
  return data.toString("base64");
}
