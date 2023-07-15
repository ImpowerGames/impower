import transformer from "../../sparkle-style-transformer/src/index";
import sparkleIconsCSS from "../../sparkle/src/styles/icons/icons.css";
import sparklePatternsCSS from "../../sparkle/src/styles/patterns/patterns.css";
import Access from "./components/access/_access";
import AddFab from "./components/add-fab/_add-fab";
import Audio from "./components/audio/_audio";
import Demo from "./components/demo/_demo";
import Details from "./components/details/_details";
import Displays from "./components/displays/_displays";
import FileButton from "./components/file-button/_file-button";
import FileList from "./components/file-list/_file-list";
import FooterNavigation from "./components/footer-navigation/_footer-navigation";
import GamePreview from "./components/game-preview/_game-preview";
import Graphics from "./components/graphics/_graphics";
import HeaderNavigation from "./components/header-navigation/_header-navigation";
import Logic from "./components/logic/_logic";
import MainPanel from "./components/main-panel/_main-panel";
import Maps from "./components/maps/_maps";
import Music from "./components/music/_music";
import Notifications from "./components/notifications/_notifications";
import OptionButton from "./components/option-button/_option-button";
import PreviewPanel from "./components/preview-panel/_preview-panel";
import Preview from "./components/preview/_preview";
import ScreenplayPreview from "./components/screenplay-preview/_screenplay-preview";
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

type Component = () => { html?: string; css?: string };

const style = (component: Component): Component => {
  const data = component();
  const html = data.html ? transformer(data.html, config) : data.html;
  const css = data.css || coreCSS;
  return () => {
    return { html, css };
  };
};

const components = {
  "se-icons": Icons,
  "se-theme": Theme,
  "se-normalize": Normalize,
  "se-option-button": style(OptionButton),
  "se-file-button": style(FileButton),
  "se-file-list": style(FileList),
  "se-add-fab": style(AddFab),
  "se-script-editor": style(ScriptEditor),
  "se-game-preview": style(GamePreview),
  "se-screenplay-preview": style(ScreenplayPreview),
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
  "se-preview": style(Preview),
  "se-preview-panel": style(PreviewPanel),
  "se-notifications": style(Notifications),
  "se-header-navigation": style(HeaderNavigation),
  "se-footer-navigation": style(FooterNavigation),
  "spark-editor": style(Main),
} as const;

export default components;
