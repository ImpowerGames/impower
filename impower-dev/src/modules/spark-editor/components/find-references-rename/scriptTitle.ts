import type { SearchSnapshot } from "../../workspace/searchState";

export const scriptTitle = (uri: string) => {
  const base = uri.split("/").pop() ?? uri;
  if (base === "main.sd") {
    return "Main";
  }
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
};

export const fileTitle = (uri: string) => uri.split("/").pop() ?? uri;

export const searchTitle = ({ view, subject }: SearchSnapshot) =>
  view === "find"
    ? "Search"
    : view === "references"
      ? `References to ${subject?.name || "a name"}`
      : `Rename ${subject?.name || "a name"}`;
