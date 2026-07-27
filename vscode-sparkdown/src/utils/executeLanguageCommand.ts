import * as vscode from "vscode";
import { LSPAny } from "vscode-languageserver-protocol";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { getEditor } from "./getEditor";
import { getOpenTextDocument } from "./getOpenTextDocument";

const getFileText = async (uri: string) => {
  const buffer = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
  const text = new TextDecoder("utf-8").decode(buffer);
  return text;
};

/**
 * Raw bytes as base64, for the language server's asset previews.
 *
 * The server runs in a worker and cannot `fetch` a workspace uri, and VS
 * Code's markdown sanitizer refuses any non-http(s) `<img src>` — so previews
 * there are inlined `data:` URIs built from bytes read here. Base64 because
 * the LSP transport is JSON.
 */
const getFileBytes = async (uri: string) => {
  const buffer = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...(buffer.subarray(i, i + CHUNK) as unknown as number[]),
    );
  }
  return btoa(binary);
};

const getFileSrc = (uri: string) => {
  if (SparkdownPreviewGamePanelManager.instance.panel?.webview) {
    return SparkdownPreviewGamePanelManager.instance.panel.webview
      .asWebviewUri(vscode.Uri.parse(uri))
      .toString();
  } else {
    return uri;
  }
};

const getFileVersion = async (uri: string) => {
  const doc = getEditor(uri)?.document ?? (await getOpenTextDocument(uri));
  if (doc) {
    return doc.version;
  }
  return null;
};

const getFileLanguageId = async (uri: string) => {
  const doc = getEditor(uri)?.document ?? (await getOpenTextDocument(uri));
  if (doc) {
    return doc.languageId;
  }
  return null;
};

export const executeLanguageCommand = async <T>(params: {
  command: string;
  arguments?: LSPAny[];
}): Promise<T | undefined> => {
  if (params.command === "sparkdown.getFileText") {
    const [uri] = params.arguments || [];
    if (uri && typeof uri === "string") {
      return getFileText(uri) as T;
    }
  }
  if (params.command === "sparkdown.getFileSrc") {
    const [uri] = params.arguments || [];
    if (uri && typeof uri === "string") {
      return getFileSrc(uri) as T;
    }
  }
  if (params.command === "sparkdown.getFileBytes") {
    const [uri] = params.arguments || [];
    if (uri && typeof uri === "string") {
      return getFileBytes(uri) as T;
    }
  }
  if (params.command === "sparkdown.getFileVersion") {
    const [uri] = params.arguments || [];
    if (uri && typeof uri === "string") {
      return getFileVersion(uri) as T;
    }
  }
  if (params.command === "sparkdown.getFileLanguageId") {
    const [uri] = params.arguments || [];
    if (uri && typeof uri === "string") {
      return getFileLanguageId(uri) as T;
    }
  }
  if (params.command === "sparkdown.inspect") {
    const [struct] = params.arguments || [];
    console.log(struct);
    return null as T;
  }
  return undefined;
};
