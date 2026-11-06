import type { FindTextOptions } from "@impower/spark-editor-protocol/src/protocols/workspace/FindTextMessage";
import type { Position, Range } from "vscode-languageserver-protocol";

export type SearchView = "find" | "references" | "rename";

export type FindOption = keyof Required<FindTextOptions>;

export type FindOptions = Record<FindOption, boolean>;

export interface SearchUse {
  uri: string;
  range: Range;
  lineText: string;
  declaration?: boolean;
}

export interface SearchGroup {
  uri: string;
  uses: SearchUse[];
}

export interface NameSubject {
  name: string;
  uri?: string;
  position?: Position;
  character: boolean;
}

export interface SearchPosition {
  index: number;
  total: number;
  scripts: number;
  current?: { uri: string; range: Range };
}

export const INITIAL_SEARCH_POSITION: SearchPosition = {
  index: 0,
  total: 0,
  scripts: 0,
};

export interface SearchSnapshot {
  open: boolean;
  view: SearchView;
  term: string;
  replacement: string;
  options: FindOptions;
  groups: SearchGroup[];
  total: number;
  error?: string;
  status: string;
  statusTone: "info" | "error";
  subject?: NameSubject;
  references: SearchGroup[];
  files: string[];
  renameName: string;
}

export const INITIAL_SEARCH: SearchSnapshot = {
  open: false,
  view: "find",
  term: "",
  replacement: "",
  options: { matchCase: false, wholeWord: false, regex: false },
  groups: [],
  total: 0,
  status: "",
  statusTone: "info",
  references: [],
  files: [],
  renameName: "",
};
