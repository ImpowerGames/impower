import transformer from "../../../../packages/sparkle-style-transformer/src/index";
import sparkleIconsCSS from "../../../../packages/sparkle/src/styles/icons/icons.css";
import sparklePatternsCSS from "../../../../packages/sparkle/src/styles/patterns/patterns.css";
import { ComponentSpec } from "../../../../packages/spec-component/src/spec";
import baseNormalize from "../../../../packages/spec-component/src/styles/normalize/normalize.css";
import Access from "./components/access/_access";
import Account from "./components/account/_account";
import Assets from "./components/assets/_assets";
import Audio from "./components/audio/_audio";
import Demo from "./components/demo/_demo";
import Details from "./components/details/_details";
import Displays from "./components/displays/_displays";
import FileAddButton from "./components/file-add-button/_file-add-button";
import FileEditorNavigation from "./components/file-editor-navigation/_file-editor-navigation";
import FileItem from "./components/file-item/_file-item";
import FileListBorder from "./components/file-list-border/_file-list-border";
import FileList from "./components/file-list/_file-list";
import FileOptionsButton from "./components/file-options-button/_file-options-button";
import FileUploadButton from "./components/file-upload-button/_file-upload-button";
import FooterNavigation from "./components/footer-navigation/_footer-navigation";
import Graphics from "./components/graphics/_graphics";
import HeaderMenuButton from "./components/header-menu-button/_header-menu-button";
import HeaderNavigation from "./components/header-navigation/_header-navigation";
import HeaderTitleButton from "./components/header-title-button/_header-title-button";
import HeaderTitleCaption from "./components/header-title-caption/_header-title-caption";
import InteractionBlocker from "./components/interaction-blocker/_interaction-blocker";
import LogicList from "./components/logic-list/_logic-list";
import LogicScriptsEditor from "./components/logic-scripts-editor/_logic-scripts-editor";
import LogicScriptsList from "./components/logic-scripts-list/_logic-scripts-list";
import Logic from "./components/logic/_logic";
import MainPanel from "./components/main-panel/_main-panel";
import Maps from "./components/maps/_maps";
import Music from "./components/music/_music";
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
import Setup from "./components/setup/_setup";
import Share from "./components/share/_share";
import Sounds from "./components/sounds/_sounds";
import Sprites from "./components/sprites/_sprites";
import Views from "./components/views/_views";
import Widgets from "./components/widgets/_widgets";
import Main from "./main/_spark-editor";
import {
  default as icons,
  default as iconsCSS,
} from "./styles/icons/icons.css";
import normalize from "./styles/normalize/normalize.css";
import theme from "./styles/theme/theme.css";

const config = {
  icons: [sparkleIconsCSS, iconsCSS],
  patterns: [sparklePatternsCSS],
};

const style = <
  Props extends Record<string, unknown> = Record<string, unknown>,
  State extends Record<string, unknown> = Record<string, unknown>,
  Stores extends Record<string, any> = Record<string, any>,
  Context extends Record<string, unknown> = Record<string, unknown>,
  Selectors extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >
>(
  spec: ComponentSpec<Props, State, Stores, Context, Selectors>
): ComponentSpec<Props, State, Stores, Context, Selectors> => {
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
  { tag: "", css: icons },
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
  style(LogicScriptsEditor),
  style(LogicScriptsList),
  style(LogicList),
  style(Logic),
  style(Maps),
  style(Sprites),
  style(Graphics),
  style(Widgets),
  style(Views),
  style(Displays),
  style(Music),
  style(Sounds),
  style(Audio),
  style(Access),
  style(Details),
  style(Share),
  style(Setup),
  style(Demo),
  style(MainPanel),
  style(PreviewToggleButton),
  style(PreviewOptionsDropdown),
  style(Preview),
  style(PreviewPanel),
  style(Notifications),
  style(Account),
  style(HeaderMenuButton),
  style(HeaderTitleButton),
  style(HeaderTitleCaption),
  style(HeaderNavigation),
  style(FooterNavigation),
  style(Main),
] as const;

export default components;
