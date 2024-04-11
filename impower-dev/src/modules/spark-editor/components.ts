import transformer from "../../../../packages/sparkle-style-transformer/src/index";
import sparklePatternsCSS from "../../../../packages/sparkle/src/styles/patterns/patterns.css";
import { ComponentSpec } from "../../../../packages/spec-component/src/spec";
import baseNormalize from "../../../../packages/spec-component/src/styles/normalize/normalize.css";
import Account from "./components/account/_account";
import AssetsFiles from "./components/assets-files/_assets-files";
import AssetsSpecs from "./components/assets-specs/_assets-specs";
import Assets from "./components/assets/_assets";
import Demo from "./components/demo/_demo";
import Details from "./components/details/_details";
import EditToggleButton from "./components/edit-toggle-button/_edit-toggle-button";
import FileAddButton from "./components/file-add-button/_file-add-button";
import FileEditorNavigation from "./components/file-editor-navigation/_file-editor-navigation";
import FileItem from "./components/file-item/_file-item";
import FileListBorder from "./components/file-list-border/_file-list-border";
import FileList from "./components/file-list/_file-list";
import FileOptionsButton from "./components/file-options-button/_file-options-button";
import FileUploadButton from "./components/file-upload-button/_file-upload-button";
import FooterNavigation from "./components/footer-navigation/_footer-navigation";
import HeaderMenuButton from "./components/header-menu-button/_header-menu-button";
import HeaderNavigation from "./components/header-navigation/_header-navigation";
import HeaderSyncConflictToolbar from "./components/header-sync-conflict-toolbar/_header-sync-conflict-toolbar";
import HeaderSyncToolbar from "./components/header-sync-toolbar/_header-sync-toolbar";
import HeaderTitleButton from "./components/header-title-button/_header-title-button";
import HeaderTitleCaption from "./components/header-title-caption/_header-title-caption";
import InteractionBlocker from "./components/interaction-blocker/_interaction-blocker";
import LogicList from "./components/logic-list/_logic-list";
import LogicScriptsEditor from "./components/logic-scripts-editor/_logic-scripts-editor";
import LogicScriptsList from "./components/logic-scripts-list/_logic-scripts-list";
import Logic from "./components/logic/_logic";
import MainPanel from "./components/main-panel/_main-panel";
import Notifications from "./components/notifications/_notifications";
import OptionButton from "./components/option-button/_option-button";
import PreviewGameToolbar from "./components/preview-game-toolbar/_preview-game-toolbar";
import PreviewGame from "./components/preview-game/_preview-game";
import PreviewOptionsDropdown from "./components/preview-mode-toggle/_preview-mode-toggle";
import PreviewPanel from "./components/preview-panel/_preview-panel";
import PreviewScreenplayToolbar from "./components/preview-screenplay-toolbar/_preview-screenplay-toolbar";
import PreviewScreenplay from "./components/preview-screenplay/_preview-screenplay";
import PreviewToggleButton from "./components/preview-toggle-button/_preview-toggle-button";
import Preview from "./components/preview/_preview";
import ScriptEditor from "./components/script-editor/_script-editor";
import ShareGame from "./components/share-game/_share-game";
import ShareProject from "./components/share-project/_share-project";
import ShareScreenplay from "./components/share-screenplay/_share-screenplay";
import Share from "./components/share/_share";
import Main from "./main/_spark-editor";
import normalize from "./styles/normalize/normalize.css";
import theme from "./styles/theme/theme.css";

const config = {
  patterns: [sparklePatternsCSS],
};

const style = <
  Props extends Record<string, unknown> = Record<string, unknown>,
  State extends Record<string, unknown> = Record<string, unknown>,
  Stores extends Record<string, any> = Record<string, any>,
  Context extends Record<string, unknown> = Record<string, unknown>,
  Graphics extends Record<string, string> = Record<string, string>,
  Selectors extends Record<string, null | string | string[]> = Record<
    string,
    null | string | string[]
  >
>(
  spec: ComponentSpec<Props, State, Stores, Context, Graphics, Selectors>
): ComponentSpec<Props, State, Stores, Context, Graphics, Selectors> => {
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
  { tag: "", css: normalize },
  { tag: "", css: theme },
  style(InteractionBlocker),
  style(OptionButton),
  style(FileOptionsButton),
  style(FileEditorNavigation),
  style(FileUploadButton),
  style(FileAddButton),
  style(FileItem),
  style(FileListBorder),
  style(FileList),
  style(ScriptEditor),
  style(PreviewGameToolbar),
  style(PreviewGame),
  style(PreviewScreenplayToolbar),
  style(PreviewScreenplay),
  style(Assets),
  style(AssetsFiles),
  style(AssetsSpecs),
  style(LogicScriptsEditor),
  style(LogicScriptsList),
  style(LogicList),
  style(Logic),
  style(Details),
  style(Share),
  style(ShareGame),
  style(ShareScreenplay),
  style(ShareProject),
  style(MainPanel),
  style(EditToggleButton),
  style(PreviewToggleButton),
  style(PreviewOptionsDropdown),
  style(Preview),
  style(PreviewPanel),
  style(Notifications),
  style(Account),
  style(HeaderSyncConflictToolbar),
  style(HeaderSyncToolbar),
  style(HeaderMenuButton),
  style(HeaderTitleButton),
  style(HeaderTitleCaption),
  style(HeaderNavigation),
  style(FooterNavigation),
  style(Main),
  style(Demo),
] as const;

export default components;
