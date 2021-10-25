import { FileContentType } from "./fileContentType";

export type FileType =
  | FileContentType
  | "application/*"
  | "audio/*"
  | "image/*"
  | "interface/*"
  | "message/*"
  | "text/*"
  | "video/*"
  | "image/png,image/jpeg";
