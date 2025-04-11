import { PathCommand } from "../types/Path";
import { absolutizePath } from "./absolutizePath";
import { normalizePath } from "./normalizePath";
import { parsePath } from "./parsePath";

export const getPathCommands = (d: string): PathCommand[] =>
  normalizePath(absolutizePath(parsePath(d)));
