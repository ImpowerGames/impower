import STYLES from "../../spark-element/src/caches/STYLE_CACHE";
import Access from "./components/access/access";
import AddFab from "./components/add-fab/add-fab";
import Audio from "./components/audio/audio";
import Demo from "./components/demo/demo";
import Details from "./components/details/details";
import Displays from "./components/displays/displays";
import FileButton from "./components/file-button/file-button";
import FileList from "./components/file-list/file-list";
import FooterNavigation from "./components/footer-navigation/footer-navigation";
import GamePreview from "./components/game-preview/game-preview";
import Graphics from "./components/graphics/graphics";
import HeaderNavigation from "./components/header-navigation/header-navigation";
import Logic from "./components/logic/logic";
import MainPanel from "./components/main-panel/main-panel";
import Maps from "./components/maps/maps";
import Music from "./components/music/music";
import Notifications from "./components/notifications/notifications";
import OptionButton from "./components/option-button/option-button";
import PreviewPanel from "./components/preview-panel/preview-panel";
import ScreenplayPreview from "./components/screenplay-preview/screenplay-preview";
import ScriptEditor from "./components/script-editor/script-editor";
import Scripts from "./components/scripts/scripts";
import Setup from "./components/setup/setup";
import Share from "./components/share/share";
import Sounds from "./components/sounds/sounds";
import Sprites from "./components/sprites/sprites";
import Views from "./components/views/views";
import Widgets from "./components/widgets/widgets";
import Main from "./main/spark-editor";
import icons from "./styles/icons/icons.css";
import theme from "./styles/theme/theme.css";

export const DEFAULT_SPARK_EDITOR_CONSTRUCTORS = {
  "se-option-button": OptionButton,
  "se-file-button": FileButton,
  "se-file-list": FileList,
  "se-add-fab": AddFab,
  "se-script-editor": ScriptEditor,
  "se-game-preview": GamePreview,
  "se-screenplay-preview": ScreenplayPreview,
  "se-scripts": Scripts,
  "se-logic": Logic,
  "se-maps": Maps,
  "se-sprites": Sprites,
  "se-graphics": Graphics,
  "se-widgets": Widgets,
  "se-views": Views,
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
  "spark-editor": Main,
} as const;

export const DEFAULT_SPARK_EDITOR_STYLES = {
  theme,
  icons,
} as const;

interface InitOptions {
  useShadowDom?: boolean;
  styles?: typeof DEFAULT_SPARK_EDITOR_STYLES;
  constructors?: typeof DEFAULT_SPARK_EDITOR_CONSTRUCTORS;
  dependencies?: Record<string, string>;
}

export default abstract class SparkEditor {
  static async init(
    options?: InitOptions
  ): Promise<CustomElementConstructor[]> {
    const useShadowDom = options?.useShadowDom ?? true;
    const styles = options?.styles ?? DEFAULT_SPARK_EDITOR_STYLES;
    const constructors =
      options?.constructors ?? DEFAULT_SPARK_EDITOR_CONSTRUCTORS;
    const dependencies = options?.dependencies ?? {};
    Object.values(styles).forEach((css) => {
      STYLES.adopt(document, css);
    });
    return Promise.all(
      Object.entries(constructors).map(([k, v]) =>
        v.define(dependencies?.[k] || k, dependencies as any, useShadowDom)
      )
    );
  }
}
