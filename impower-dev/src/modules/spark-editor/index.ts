import {
  adoptAll,
  defineAll,
} from "../../../../packages/spec-component/src/component";
import Access from "./components/access/access";
import Account from "./components/account/account";
import Assets from "./components/assets/assets";
import Audio from "./components/audio/audio";
import Demo from "./components/demo/demo";
import Details from "./components/details/details";
import Displays from "./components/displays/displays";
import FileAddButton from "./components/file-add-button/file-add-button";
import FileEditorNavigation from "./components/file-editor-navigation/file-editor-navigation";
import FileItem from "./components/file-item/file-item";
import FileListBorder from "./components/file-list-border/file-list-border";
import FileList from "./components/file-list/file-list";
import FileOptionsButton from "./components/file-options-button/file-options-button";
import FileUploadButton from "./components/file-upload-button/file-upload-button";
import FooterNavigation from "./components/footer-navigation/footer-navigation";
import Graphics from "./components/graphics/graphics";
import HeaderMenuButton from "./components/header-menu-button/header-menu-button";
import HeaderNavigation from "./components/header-navigation/header-navigation";
import HeaderSyncConflictToolbar from "./components/header-sync-conflict-toolbar/header-sync-conflict-toolbar";
import HeaderSyncToolbar from "./components/header-sync-toolbar/header-sync-toolbar";
import HeaderTitleButton from "./components/header-title-button/header-title-button";
import HeaderTitleCaption from "./components/header-title-caption/header-title-caption";
import InteractionBlocker from "./components/interaction-blocker/interaction-blocker";
import LogicList from "./components/logic-list/logic-list";
import LogicScriptsEditor from "./components/logic-scripts-editor/logic-scripts-editor";
import LogicScriptsList from "./components/logic-scripts-list/logic-scripts-list";
import Logic from "./components/logic/logic";
import MainPanel from "./components/main-panel/main-panel";
import Maps from "./components/maps/maps";
import Music from "./components/music/music";
import Notifications from "./components/notifications/notifications";
import OptionButton from "./components/option-button/option-button";
import PreviewGameToolbar from "./components/preview-game-toolbar/preview-game-toolbar";
import PreviewGame from "./components/preview-game/preview-game";
import PreviewOptionsDropdown from "./components/preview-mode-toggle/preview-mode-toggle";
import PreviewPanel from "./components/preview-panel/preview-panel";
import PreviewScreenplayToolbar from "./components/preview-screenplay-toolbar/preview-screenplay-toolbar";
import PreviewScreenplay from "./components/preview-screenplay/preview-screenplay";
import PreviewToggleButton from "./components/preview-toggle-button/preview-toggle-button";
import Preview from "./components/preview/preview";
import ScriptEditor from "./components/script-editor/script-editor";
import Setup from "./components/setup/setup";
import Share from "./components/share/share";
import Sounds from "./components/sounds/sounds";
import Sprites from "./components/sprites/sprites";
import Views from "./components/views/views";
import Widgets from "./components/widgets/widgets";
import Main from "./main/spark-editor";
import icons from "./styles/icons/icons.css";
import theme from "./styles/theme/theme.css";

export const DEFAULT_SPARK_EDITOR_CONSTRUCTORS = [
  InteractionBlocker,
  OptionButton,
  FileOptionsButton,
  FileEditorNavigation,
  FileUploadButton,
  FileAddButton,
  FileItem,
  FileListBorder,
  FileList,
  ScriptEditor,
  Assets,
  LogicScriptsEditor,
  LogicScriptsList,
  LogicList,
  Logic,
  Maps,
  Sprites,
  Graphics,
  Widgets,
  Views,
  Displays,
  Music,
  Sounds,
  Audio,
  Access,
  Details,
  Share,
  Setup,
  Demo,
  MainPanel,
  PreviewGameToolbar,
  PreviewGame,
  PreviewScreenplayToolbar,
  PreviewScreenplay,
  PreviewOptionsDropdown,
  PreviewToggleButton,
  Preview,
  PreviewPanel,
  Notifications,
  Account,
  HeaderSyncConflictToolbar,
  HeaderSyncToolbar,
  HeaderMenuButton,
  HeaderTitleButton,
  HeaderTitleCaption,
  HeaderNavigation,
  FooterNavigation,
  Main,
] as const;

export const DEFAULT_SPARK_EDITOR_STYLES = {
  theme,
  icons,
} as const;

interface InitOptions {
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
    return defineAll(constructors);
  }
}
