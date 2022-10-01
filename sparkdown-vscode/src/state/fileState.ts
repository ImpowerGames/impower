import * as vscode from "vscode";
import { SparkAsset } from "../../../sparkdown";

export const fileState: Record<
  string,
  { assets: Record<string, SparkAsset>; watcher: vscode.FileSystemWatcher }
> = {};
