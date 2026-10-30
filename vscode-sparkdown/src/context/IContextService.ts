import { commands, ExtensionContext, Position, TextDocument } from "vscode";
import { type IDisposable } from "../types/IDisposable";

interface IContextService extends IDisposable {
  onActivate(context: ExtensionContext): void;

  onDidChangeActiveTextEditor(
    document: TextDocument,
    cursorPos: Position,
  ): void;
  onDidChangeTextEditorSelection(
    document: TextDocument,
    cursorPos: Position,
  ): void;
}

export abstract class AbsContextService implements IContextService {
  public abstract readonly contextName: string;

  public abstract onActivate(context: ExtensionContext): void;
  public abstract dispose(): void;

  public abstract onDidChangeActiveTextEditor(
    document: TextDocument,
    cursorPos: Position,
  ): void;

  public abstract onDidChangeTextEditorSelection(
    document: TextDocument,
    cursorPos: Position,
  ): void;

  protected setState(state: any) {
    commands.executeCommand("setContext", this.contextName, state);
  }
}
