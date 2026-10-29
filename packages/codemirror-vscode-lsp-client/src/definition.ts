import { Command, EditorView, KeyBinding, keymap } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

function getDefinition(plugin: LSPPlugin, pos: number) {
  return plugin.client.request<
    lsp.DefinitionParams,
    lsp.Location | lsp.Location[] | null,
    typeof lsp.DefinitionRequest.method
  >("textDocument/definition", {
    textDocument: { uri: plugin.uri },
    position: plugin.toPosition(pos),
  });
}

function getDeclaration(plugin: LSPPlugin, pos: number) {
  return plugin.client.request<
    lsp.DeclarationParams,
    lsp.Location | lsp.Location[] | null,
    typeof lsp.DeclarationRequest.method
  >("textDocument/declaration", {
    textDocument: { uri: plugin.uri },
    position: plugin.toPosition(pos),
  });
}

function getTypeDefinition(plugin: LSPPlugin, pos: number) {
  return plugin.client.request<
    lsp.TypeDefinitionParams,
    lsp.Location | lsp.Location[] | null,
    typeof lsp.TypeDefinitionRequest.method
  >("textDocument/typeDefinition", {
    textDocument: { uri: plugin.uri },
    position: plugin.toPosition(pos),
  });
}

function getImplementation(plugin: LSPPlugin, pos: number) {
  return plugin.client.request<
    lsp.ImplementationParams,
    lsp.Location | lsp.Location[] | null,
    typeof lsp.ImplementationRequest.method
  >("textDocument/implementation", {
    textDocument: { uri: plugin.uri },
    position: plugin.toPosition(pos),
  });
}

function jumpToOrigin(
  view: EditorView,
  type: { get: typeof getDefinition; capability: keyof lsp.ServerCapabilities },
): boolean {
  const plugin = LSPPlugin.get(view);
  if (!plugin || plugin.client.hasCapability(type.capability) === false)
    return false;
  plugin.client.sync();
  type.get(plugin, view.state.selection.main.head).then(
    (response) => {
      if (!response) return;
      let loc = Array.isArray(response) ? response[0] : response;
      if (loc) {
        plugin.client.workspace.displayFile(
          { uri: loc.uri, selection: loc.range, takeFocus: false },
          "select.definition",
        );
      }
    },
    (error) => plugin.reportError("Find definition failed", error),
  );
  return true;
}

export const jumpToDefinition: Command = (view) =>
  jumpToOrigin(view, {
    get: getDefinition,
    capability: "definitionProvider",
  });

export const jumpToDeclaration: Command = (view) =>
  jumpToOrigin(view, {
    get: getDeclaration,
    capability: "declarationProvider",
  });

export const jumpToTypeDefinition: Command = (view) =>
  jumpToOrigin(view, {
    get: getTypeDefinition,
    capability: "typeDefinitionProvider",
  });

export const jumpToImplementation: Command = (view) =>
  jumpToOrigin(view, {
    get: getImplementation,
    capability: "implementationProvider",
  });

export const jumpToDefinitionKeymap: readonly KeyBinding[] = [
  { key: "F12", run: jumpToDefinition, preventDefault: true },
];

export function serverDefinitions(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        definition: {},
        declaration: {},
        implementation: {},
        typeDefinition: {},
      },
    },

    editorExtension: [keymap.of([...jumpToDefinitionKeymap])],
  };
}
