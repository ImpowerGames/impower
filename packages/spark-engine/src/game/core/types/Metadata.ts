import { Reference } from "./Reference";

export interface Metadata extends Reference<"metadata"> {
  title: string;
  credit: string;
  author: string;
  source: string;
  notes: string;
  date: string;
  contact: string;
  revision: string;
  font: string;
  header: string;
  footer: string;
  watermark: string;
  tl: string;
  tc: string;
  tr: string;
  cc: string;
  bl: string;
  br: string;
}
