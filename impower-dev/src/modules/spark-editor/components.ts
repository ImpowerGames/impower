import transformer from "../../../../packages/sparkle-style-transformer/src/index";
import sparklePatternsCSS from "../../../../packages/sparkle/src/styles/patterns/patterns.css";
import { ComponentSpec } from "../../../../packages/spec-component/src/spec";
import baseNormalize from "../../../../packages/spec-component/src/styles/normalize/normalize.css";
import Account from "./components/account/_account";
import AssetsFiles from "./components/assets-files/_assets-files";
import AssetsUrls from "./components/assets-urls/_assets-urls";
import Demo from "./components/demo/_demo";
import FileAddButton from "./components/file-add-button/_file-add-button";
import FileDropzone from "./components/file-dropzone/_file-dropzone";
import FileEditorNavigation from "./components/file-editor-navigation/_file-editor-navigation";
import FileItem from "./components/file-item/_file-item";
import FileListBorder from "./components/file-list-border/_file-list-border";
import FileList from "./components/file-list/_file-list";
import FileOptionsButton from "./components/file-options-button/_file-options-button";
import FileUploadButton from "./components/file-upload-button/_file-upload-button";
import HeaderMenuButton from "./components/header-menu-button/_header-menu-button";
import HeaderNavigationPlaceholder from "./components/header-navigation-placeholder/_header-navigation-placeholder";
import HeaderSyncConflictToolbar from "./components/header-sync-conflict-toolbar/_header-sync-conflict-toolbar";
import HeaderSyncToolbar from "./components/header-sync-toolbar/_header-sync-toolbar";
import HeaderTitleButton from "./components/header-title-button/_header-title-button";
import HeaderTitleCaption from "./components/header-title-caption/_header-title-caption";
import InteractionBlocker from "./components/interaction-blocker/_interaction-blocker";
import LogicDiagnosticsLabel from "./components/logic-diagnostics-label/_logic-diagnostics-label";
import LogicScriptEditor from "./components/logic-script-editor/_logic-script-editor";
import LogicScriptsEditor from "./components/logic-scripts-editor/_logic-scripts-editor";
import LogicScriptsList from "./components/logic-scripts-list/_logic-scripts-list";
import Notifications from "./components/notifications/_notifications";
import OptionButton from "./components/option-button/_option-button";
import PreviewGameToolbar from "./components/preview-game-toolbar/_preview-game-toolbar";
import PreviewGame from "./components/preview-game/_preview-game";
import PreviewScreenplayToolbar from "./components/preview-screenplay-toolbar/_preview-screenplay-toolbar";
import PreviewScreenplay from "./components/preview-screenplay/_preview-screenplay";
import Scrollable from "./components/scrollable/_scrollable";
import Main from "./main/_spark-editor";
import editorNormalize from "./styles/normalize/normalize.css";
import editorTheme from "./styles/theme/theme.css";

const config = {
  patterns: [sparklePatternsCSS],
};

const style = <
  Props extends Record<string, unknown> = Record<string, unknown>,
  Stores extends Record<string, any> = Record<string, any>,
  Context extends Record<string, unknown> = Record<string, unknown>,
  Graphics extends Record<string, string> = Record<string, string>,
  Selectors extends Record<string, null | string | string[]> = Record<
    string,
    null | string | string[]
  >,
>(
  spec: ComponentSpec<Props, Stores, Context, Graphics, Selectors>,
): ComponentSpec<Props, Stores, Context, Graphics, Selectors> => {
  return {
    ...spec,
    html: (args) => {
      const content = spec.html(args);
      return transformer(content, config);
    },
  };
};

const components = [
  { tag: "", css: baseNormalize },
  { tag: "", css: editorNormalize },
  { tag: "", css: editorTheme },
  style(InteractionBlocker),
  style(Scrollable),
  style(OptionButton),
  style(FileOptionsButton),
  style(FileEditorNavigation),
  style(FileUploadButton),
  style(FileAddButton),
  style(FileItem),
  style(FileListBorder),
  style(FileList),
  style(FileDropzone),
  style(PreviewGameToolbar),
  style(PreviewGame),
  style(PreviewScreenplayToolbar),
  style(PreviewScreenplay),
  style(AssetsFiles),
  style(AssetsUrls),
  style(LogicDiagnosticsLabel),
  style(LogicScriptEditor),
  style(LogicScriptsEditor),
  style(LogicScriptsList),
  style(Notifications),
  style(Account),
  style(HeaderSyncConflictToolbar),
  style(HeaderSyncToolbar),
  style(HeaderMenuButton),
  style(HeaderTitleButton),
  style(HeaderTitleCaption),
  style(HeaderNavigationPlaceholder),
  style(Main),
  style(Demo),
] as const;

export default components;
