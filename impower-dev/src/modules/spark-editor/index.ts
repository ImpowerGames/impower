import {
  DefineOptions,
  adoptAll,
  defineAll,
} from "../../../../packages/spec-component/src/component";
import Account from "./components/account/account";
import AssetsFiles from "./components/assets-files/assets-files";
import AssetsUrls from "./components/assets-urls/assets-urls";
import Assets from "./components/assets/assets";
import Demo from "./components/demo/demo";
import EditToggleButton from "./components/edit-toggle-button/edit-toggle-button";
import FileAddButton from "./components/file-add-button/file-add-button";
import FileDropzone from "./components/file-dropzone/file-dropzone";
import FileEditorNavigation from "./components/file-editor-navigation/file-editor-navigation";
import FileItem from "./components/file-item/file-item";
import FileListBorder from "./components/file-list-border/file-list-border";
import FileList from "./components/file-list/file-list";
import FileOptionsButton from "./components/file-options-button/file-options-button";
import FileUploadButton from "./components/file-upload-button/file-upload-button";
import HeaderMenuButton from "./components/header-menu-button/header-menu-button";
import HeaderNavigation from "./components/header-navigation/header-navigation";
import HeaderNavigationPlaceholder from "./components/header-navigation-placeholder/header-navigation-placeholder";
import HeaderSyncConflictToolbar from "./components/header-sync-conflict-toolbar/header-sync-conflict-toolbar";
import HeaderSyncToolbar from "./components/header-sync-toolbar/header-sync-toolbar";
import HeaderTitleButton from "./components/header-title-button/header-title-button";
import HeaderTitleCaption from "./components/header-title-caption/header-title-caption";
import InteractionBlocker from "./components/interaction-blocker/interaction-blocker";
import LogicDiagnosticsLabel from "./components/logic-diagnostics-label/logic-diagnostics-label";
import LogicList from "./components/logic-list/logic-list";
import LogicScriptEditor from "./components/logic-script-editor/logic-script-editor";
import LogicScriptsEditor from "./components/logic-scripts-editor/logic-scripts-editor";
import LogicScriptsList from "./components/logic-scripts-list/logic-scripts-list";
import Logic from "./components/logic/logic";
import MainWindow from "./components/main-window/main-window";
import Notifications from "./components/notifications/notifications";
import OptionButton from "./components/option-button/option-button";
import PreviewGameToolbar from "./components/preview-game-toolbar/preview-game-toolbar";
import PreviewGame from "./components/preview-game/preview-game";
import PreviewScreenplayToolbar from "./components/preview-screenplay-toolbar/preview-screenplay-toolbar";
import PreviewScreenplay from "./components/preview-screenplay/preview-screenplay";
import PreviewToggleButton from "./components/preview-toggle-button/preview-toggle-button";
import Preview from "./components/preview/preview";
import Scrollable from "./components/scrollable/scrollable";
import ShareGame from "./components/share-game/share-game";
import ShareScreenplay from "./components/share-screenplay/share-screenplay";
import Share from "./components/share/share";
import Main from "./main/spark-editor";
import icons from "./styles/icons/icons.css";
import theme from "./styles/theme/theme.css";

export const DEFAULT_SPARK_EDITOR_CONSTRUCTORS = [
  InteractionBlocker,
  Scrollable,
  OptionButton,
  FileOptionsButton,
  FileEditorNavigation,
  FileUploadButton,
  FileAddButton,
  FileItem,
  FileListBorder,
  FileList,
  FileDropzone,
  Assets,
  AssetsFiles,
  AssetsUrls,
  LogicDiagnosticsLabel,
  LogicScriptEditor,
  LogicScriptsEditor,
  LogicScriptsList,
  LogicList,
  Logic,
  Audio,
  Share,
  ShareGame,
  ShareScreenplay,
  Demo,
  MainWindow,
  PreviewGameToolbar,
  PreviewGame,
  PreviewScreenplayToolbar,
  PreviewScreenplay,
  PreviewToggleButton,
  EditToggleButton,
  Preview,
  Notifications,
  Account,
  HeaderSyncConflictToolbar,
  HeaderSyncToolbar,
  HeaderMenuButton,
  HeaderTitleButton,
  HeaderTitleCaption,
  HeaderNavigation,
  HeaderNavigationPlaceholder,
  Main,
] as const;

export const DEFAULT_SPARK_EDITOR_STYLES = {
  theme,
  icons,
} as const;

interface InitOptions extends DefineOptions {
  styles?: typeof DEFAULT_SPARK_EDITOR_STYLES;
  constructors?: typeof DEFAULT_SPARK_EDITOR_CONSTRUCTORS;
}

export default abstract class SparkEditor {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const styles = options?.styles ?? DEFAULT_SPARK_EDITOR_STYLES;
    const constructors =
      options?.constructors ?? DEFAULT_SPARK_EDITOR_CONSTRUCTORS;
    adoptAll(styles);
    return defineAll(constructors, options);
  }
}
