import Access from "./components/access/access";
import AddFab from "./components/add-fab/add-fab";
import Audio from "./components/audio/audio";
import Demo from "./components/demo/demo";
import Details from "./components/details/details";
import Displays from "./components/displays/displays";
import Elements from "./components/elements/elements";
import FileButton from "./components/file-button/file-button";
import FooterNavigationSpacer from "./components/footer-navigation-spacer/footer-navigation-spacer";
import FooterNavigation from "./components/footer-navigation/footer-navigation";
import Graphics from "./components/graphics/graphics";
import GUI from "./components/gui/gui";
import HeaderNavigation from "./components/header-navigation/header-navigation";
import Logic from "./components/logic/logic";
import MainPanel from "./components/main-panel/main-panel";
import Maps from "./components/maps/maps";
import Music from "./components/music/music";
import Notifications from "./components/notifications/notifications";
import OptionButton from "./components/option-button/option-button";
import PreviewPanel from "./components/preview-panel/preview-panel";
import Setup from "./components/setup/setup";
import Share from "./components/share/share";
import Sounds from "./components/sounds/sounds";
import Sprites from "./components/sprites/sprites";
import Views from "./components/views/views";
import { ICONS_CSS } from "./styles/icons/icons";
import { THEME_CSS } from "./styles/theme/theme";

export const DEFAULT_SPARK_EDITOR_CONSTRUCTORS = {
  "se-option-button": OptionButton,
  "se-file-button": FileButton,
  "se-add-fab": AddFab,
  "se-logic": Logic,
  "se-maps": Maps,
  "se-sprites": Sprites,
  "se-graphics": Graphics,
  "se-views": Views,
  "se-elements": Elements,
  "se-displays": Displays,
  "se-music": Music,
  "se-sounds": Sounds,
  "se-audio": Audio,
  "se-access": Access,
  "se-details": Details,
  "se-share": Share,
  "se-setup": Setup,
  "se-demo": Demo,
  "se-main-panel": MainPanel,
  "se-preview-panel": PreviewPanel,
  "se-notifications": Notifications,
  "se-header-navigation": HeaderNavigation,
  "se-footer-navigation": FooterNavigation,
  "se-footer-navigation-spacer": FooterNavigationSpacer,
  "se-gui": GUI,
} as const;

export const DEFAULT_SPARK_EDITOR_STYLES = {
  theme: THEME_CSS,
  icons: ICONS_CSS,
};

export default abstract class SparkEditor {
  static async init(
    useShadowDom = true,
    styles = DEFAULT_SPARK_EDITOR_STYLES,
    constructors = DEFAULT_SPARK_EDITOR_CONSTRUCTORS,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor[]> {
    if (!document.adoptedStyleSheets) {
      document.adoptedStyleSheets = [];
    }
    document.adoptedStyleSheets.push(...Object.values(styles));
    return Promise.all(
      Object.entries(constructors).map(([k, v]) =>
        v.define(dependencies?.[k] || k, dependencies as any, useShadowDom)
      )
    );
  }
}
