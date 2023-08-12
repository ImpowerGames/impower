import transformer from "../../../../packages/sparkle-style-transformer/src/index";
import sparkleIconsCSS from "../../../../packages/sparkle/src/styles/icons/icons.css";
import sparklePatternsCSS from "../../../../packages/sparkle/src/styles/patterns/patterns.css";
import Access from "./components/access/_access";
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
import HeaderNavigation from "./components/header-navigation/_header-navigation";
import HeaderTitleButton from "./components/header-title-button/_header-title-button";
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
import coreCSS from "./styles/core/core.css";
import Icons from "./styles/icons/_icons";
import iconsCSS from "./styles/icons/icons.css";
import Normalize from "./styles/normalize/_normalize";
import Theme from "./styles/theme/_theme";

const config = {
  icons: [sparkleIconsCSS, iconsCSS],
  patterns: [sparklePatternsCSS],
};

type Component = (state: any) => { html?: string; css?: string };

const style = (component: Component): Component => {
  return (state: any) => {
    const data = component(state);
    const html = data.html ? transformer(data.html, config) : data.html;
    const css = data.css || coreCSS;
    return { html, css };
  };
};

const components = {
  "se-icons": Icons,
  "se-theme": Theme,
  "se-normalize": Normalize,
  "se-option-button": style(OptionButton),
  "se-file-options-button": style(FileOptionsButton),
  "se-file-editor-navigation": style(FileEditorNavigation),
  "se-file-upload-button": style(FileUploadButton),
  "se-file-add-button": style(FileAddButton),
  "se-file-item": style(FileItem),
  "se-file-list-border": style(FileListBorder),
  "se-file-list": style(FileList),
  "se-script-editor": style(ScriptEditor),
  "se-preview-game-toolbar": style(PreviewGameToolbar),
  "se-preview-game": style(PreviewGame),
  "se-preview-screenplay-toolbar": style(PreviewScreenplayToolbar),
  "se-preview-screenplay": style(PreviewScreenplay),
  "se-assets": style(Assets),
  "se-logic-scripts-editor": style(LogicScriptsEditor),
  "se-logic-scripts-list": style(LogicScriptsList),
  "se-logic-list": style(LogicList),
  "se-logic": style(Logic),
  "se-maps": style(Maps),
  "se-sprites": style(Sprites),
  "se-graphics": style(Graphics),
  "se-widgets": style(Widgets),
  "se-views": style(Views),
  "se-displays": style(Displays),
  "se-music": style(Music),
  "se-sounds": style(Sounds),
  "se-audio": style(Audio),
  "se-access": style(Access),
  "se-details": style(Details),
  "se-share": style(Share),
  "se-setup": style(Setup),
  "se-demo": style(Demo),
  "se-main-panel": style(MainPanel),
  "se-preview-toggle-button": style(PreviewToggleButton),
  "se-preview-mode-toggle": style(PreviewOptionsDropdown),
  "se-preview": style(Preview),
  "se-preview-panel": style(PreviewPanel),
  "se-notifications": style(Notifications),
  "se-header-title-button": style(HeaderTitleButton),
  "se-header-navigation": style(HeaderNavigation),
  "se-footer-navigation": style(FooterNavigation),
  "spark-editor": style(Main),
} as const;

export default components;
