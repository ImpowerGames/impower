import { Create } from "../types/Create";
import { Metadata } from "../types/Metadata";

export const default_metadata: Create<Metadata> = (obj) => ({
  $type: "metadata",
  $name: "$default",
  ...obj,
  title: "",
  credit: "",
  author: "",
  source: "",
  notes: "",
  date: "",
  contact: "",
  revision: "",
  font: "",
  header: "",
  footer: "",
  watermark: "",
  tl: "",
  tc: "",
  tr: "",
  cc: "",
  bl: "",
  br: "",
});
