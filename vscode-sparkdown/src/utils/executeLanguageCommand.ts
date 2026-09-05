import * as vscode from "vscode";
import { LSPAny } from "vscode-languageserver-protocol";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { bytesToBase64 } from "@impower/sparkdown/src/thumbnails/composeThumbnail";
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
 * The server runs in a worker and cannot `fetch` a workspace uri, and a hover
 * cannot render one either — so previews are inlined `data:` URIs built from
 * bytes read here. Base64 because the LSP transport is JSON.
 *
 * Two mechanisms independently break a workspace uri in a hover, so an
 * inlined `data:` uri is the only route that clears both. The markdown
 * sanitizer strips `vscode-vfs:`, `vscode-userdata:` and `vscode-resource:`
 * outright. It permits `file:`, but the workbench then declines to load it
 * ("Not allowed to load local resource"), leaving the attribute in place and
 * the image blank — the reason a `file:` src in a hover stopped working in
 * VS Code 1.58 (microsoft/vscode#128315).
 */
const getFileBytes = async (uri: string) => {
  const buffer = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
  return bytesToBase64(buffer);
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
