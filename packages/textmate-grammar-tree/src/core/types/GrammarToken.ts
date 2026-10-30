import type { ParserAction } from "./ParserAction";

export type GrammarToken = [
  id: number | null,
  from: number,
  to: number,
  open?: ParserAction,
  close?: ParserAction,
];
