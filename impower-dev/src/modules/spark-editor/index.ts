import { SparkdownScreenplayPreviewElement } from "@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview.elem";
import { SparkEditorElement } from "./main/SparkEditor.elem";
import { MainWindowElement } from "./components/main-window/MainWindow.elem";
import { PreviewElement } from "./components/preview/Preview.elem";
import { PreviewToggleButtonElement } from "./components/preview-toggle-button/PreviewToggleButton.elem";
import { AssetsElement } from "./components/assets/Assets.elem";
import { FileDropzoneElement } from "./components/file-dropzone/FileDropzone.elem";
import { InteractionBlockerElement } from "./components/interaction-blocker/InteractionBlocker.elem";
import { LogicElement } from "./components/logic/Logic.elem";
import { LogicScriptEditorElement } from "./components/logic-script-editor/LogicScriptEditor.elem";
import { LogicScriptsEditorElement } from "./components/logic-scripts-editor/LogicScriptsEditor.elem";
import { NotificationsElement } from "./components/notifications/Notifications.elem";
import { PreviewGameElement } from "./components/preview-game/PreviewGame.elem";
import { PreviewGameToolbarElement } from "./components/preview-game-toolbar/PreviewGameToolbar.elem";
import { PreviewScreenplayElement } from "./components/preview-screenplay/PreviewScreenplay.elem";
import { ShareElement } from "./components/share/Share.elem";
import {
  DefineOptions,
  adoptAll,
  defineAll,
} from "../../../../packages/spec-component/src/component";
import editorIcons from "./styles/icons/icons.css";
import editorTheme from "./styles/theme/theme.css";

export const DEFAULT_SPARK_EDITOR_CONSTRUCTORS = [] as const;

export const DEFAULT_SPARK_EDITOR_STYLES = {
  editorTheme,
  editorIcons,
} as const;

interface InitOptions extends DefineOptions {
  styles?: typeof DEFAULT_SPARK_EDITOR_STYLES;
  constructors?: typeof DEFAULT_SPARK_EDITOR_CONSTRUCTORS;
}

export default abstract class SparkEditor {
  static async init(
    options?: InitOptions,
  ): Promise<CustomElementConstructor[]> {
    const styles = options?.styles ?? DEFAULT_SPARK_EDITOR_STYLES;
    const constructors =
      options?.constructors ?? DEFAULT_SPARK_EDITOR_CONSTRUCTORS;
    adoptAll(styles);
    // Register preact-custom-element-based big blocks alongside the legacy
    // spec-component constructors. These classes don't auto-register on
    // import — callers opt in via `.register()`.
    await SparkdownScreenplayPreviewElement.register();
    await SparkEditorElement.register();
    await MainWindowElement.register();
    await PreviewElement.register();
    await PreviewToggleButtonElement.register();
    await ShareElement.register();
    await AssetsElement.register();
    await LogicElement.register();
    await LogicScriptEditorElement.register();
    await LogicScriptsEditorElement.register();
    await InteractionBlockerElement.register();
    await NotificationsElement.register();
    await FileDropzoneElement.register();
    await PreviewScreenplayElement.register();
    await PreviewGameToolbarElement.register();
    await PreviewGameElement.register();
    return defineAll(constructors, options);
  }
}
