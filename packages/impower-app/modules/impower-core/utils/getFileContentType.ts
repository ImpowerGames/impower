import { FileExtension } from "../types/enums/fileExtension";

export type FileContentType =
  | "audio/mid"
  | "audio/mpeg"
  | "audio/wav"
  | "image/bmp"
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/svg+xml"
  | "text/css"
  | "text/html"
  | "text/plain"
  | "text/xml"
  | "video/avi"
  | "video/mp4";

const fileContentTypes: { [extension in FileExtension]: FileContentType } = {
  mid: "audio/mid",
  midi: "audio/mid",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  wave: "audio/wav",
  bmp: "image/bmp",
  dib: "image/bmp",
  gif: "image/gif",
  jfif: "image/jpeg",
  jpe: "image/jpeg",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  css: "text/css",
  htm: "text/html",
  html: "text/html",
  txt: "text/plain",
  xml: "text/xml",
  avi: "video/avi",
  mp4: "video/mp4",
  mp4v: "video/mp4",
};

const getFileContentType = (ext: string): FileContentType => {
  return fileContentTypes[ext];
};

export default getFileContentType;
