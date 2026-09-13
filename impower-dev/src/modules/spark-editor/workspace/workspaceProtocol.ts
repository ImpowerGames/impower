import { ProtocolObserver, sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DiagnosticsSettledMessage, DidSettleDiagnosticsMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DiagnosticsSettledMessage";
import { DocumentDiagnosticMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DocumentDiagnosticMessage";
import { HoverMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/HoverMessage";
import { ReadFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage";
import { ReadDirectoryFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage";
import { UnzipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/UnzipFilesMessage";
import { WillCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillCreateFilesMessage";
import { WillDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";
import { readSettledDiagnostics } from "./readSettledDiagnostics";
import { readHoverImages } from "./readHoverImages";
import { Workspace } from "./Workspace";
import type { DocumentDiagnosticReport, Hover } from "@impower/spark-editor-protocol/src/types";

/** The same page bus used by editor controls, available without a dev bridge. */
export function registerWorkspaceProtocol() {
  const observer = new ProtocolObserver();
  observer.onRequest(DiagnosticsSettledMessage.type, async (message) => {
    try {
      await Workspace.ls.initialization();
      const result = await readSettledDiagnostics(message.params, (method, params) => Workspace.ls.connection.sendRequest(method, params));
      sendProtocolMessage(DidSettleDiagnosticsMessage.type.notification(result));
      return DiagnosticsSettledMessage.type.response(message.id, result);
    } catch (error) {
      return DiagnosticsSettledMessage.type.error(message.id, { code: -32603, message: String(error) });
    }
  });
  observer.onRequest(DocumentDiagnosticMessage.type, async (message) => {
    try {
      await Workspace.ls.initialization();
      const result = await Workspace.ls.connection.sendRequest<DocumentDiagnosticReport>(DocumentDiagnosticMessage.method, message.params);
      return DocumentDiagnosticMessage.type.response(message.id, result);
    } catch (error) {
      return DocumentDiagnosticMessage.type.error(message.id, { code: -32603, message: String(error) });
    }
  });
  observer.onRequest(HoverMessage.type, async (message) => {
    try {
      await Workspace.ls.initialization();
      const result = await Workspace.ls.connection.sendRequest<Hover | null>(HoverMessage.method, message.params);
      return HoverMessage.type.response(message.id, await readHoverImages(result, (uri) => Workspace.fs.getFileSrc(uri)));
    } catch (error) {
      return HoverMessage.type.error(message.id, { code: -32603, message: String(error) });
    }
  });
  observer.onRequest(ReadFileMessage.type, async (m) => {
    try { return ReadFileMessage.type.response(m.id, await Workspace.fs.readFile(m.params)); }
    catch (e) { return ReadFileMessage.type.error(m.id, { code: -32603, message: String(e) }); }
  });
  observer.onRequest(ReadDirectoryFilesMessage.type, async (m) => {
    try { return ReadDirectoryFilesMessage.type.response(m.id, await Workspace.fs.readDirectoryFiles(m.params)); }
    catch (e) { return ReadDirectoryFilesMessage.type.error(m.id, { code: -32603, message: String(e) }); }
  });
  observer.onRequest(UnzipFilesMessage.type, async (m) => {
    try { return UnzipFilesMessage.type.response(m.id, await Workspace.fs.unzipFiles(m.params)); }
    catch (e) { return UnzipFilesMessage.type.error(m.id, { code: -32603, message: String(e) }); }
  });
  observer.onRequest(WillCreateFilesMessage.type, async (m) => {
    try { return WillCreateFilesMessage.type.response(m.id, await Workspace.fs.createFiles(m.params)); }
    catch (e) { return WillCreateFilesMessage.type.error(m.id, { code: -32603, message: String(e) }); }
  });
  observer.onRequest(WillDeleteFilesMessage.type, async (m) => {
    try { return WillDeleteFilesMessage.type.response(m.id, await Workspace.fs.deleteFiles(m.params)); }
    catch (e) { return WillDeleteFilesMessage.type.error(m.id, { code: -32603, message: String(e) }); }
  });
  return () => observer.dispose();
}
