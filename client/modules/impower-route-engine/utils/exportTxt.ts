import { downloadFile } from "./downloadFile";

export const exportTxt = (name: string, script: string): void => {
  downloadFile(`${name}.txt`, "text/plain", script);
};
