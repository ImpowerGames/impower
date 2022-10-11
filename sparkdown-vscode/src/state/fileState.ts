import * as vscode from "vscode";
import { SparkVariable } from "../../../sparkdown";

export const fileState: Record<
  string,
  { assets: Record<string, SparkVariable>; watcher: vscode.FileSystemWatcher }
> = {};
