import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import SparkdownScreenplayPreview from "@impower/sparkdown-document-views/src/modules/screenplay-preview/index.js";
import SparkdownScriptEditor from "@impower/sparkdown-document-views/src/modules/script-editor/index.js";
import Sparkle from "@impower/sparkle/src/index.js";
import extractAllSVGs from "../build/extractAllSVGs";
import SparkEditor from "../modules/spark-editor/index";
import icons from "../modules/spark-editor/styles/icons/icons.css";
import { Workspace } from "../modules/spark-editor/workspace/Workspace";

const load = async () => {
  const graphics: Record<string, string> = {};
  const svgs = extractAllSVGs("--theme-icon-", icons);
  Object.entries(svgs).forEach(([name, svg]) => {
    graphics[name] = svg;
  });
  await Promise.allSettled([
    Sparkle.init({ graphics }),
    SparkdownScriptEditor.init({
      languageServerWorker: Workspace.ls.worker,
      languageServerConnection: Workspace.ls.connection,
      graphics,
    }),
    SparkdownScreenplayPreview.init(),
    SparkEditor.init({ graphics }),
    SparkWebPlayer.init(),
  ]);
  // Once all web components (and their constructable stylesheets) are loaded,
  // the statically-generated stylesheet is no longer needed
  const ssgStyleSheetElement = document.querySelector('link[href="/ssg.css"]');
  if (ssgStyleSheetElement) {
    window.requestAnimationFrame(() => {
      document.documentElement.style["opacity"] = "1";
      ssgStyleSheetElement.remove();
    });
  }
};

load();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(
    (registration) => {
      console.log("Service worker registration successful:", registration);
    },
    (error) => {
      console.error(`Service worker registration failed: ${error}`);
    },
  );
  // TODO: Handle service worker refresh with Approach #4 instead of Approach #2:
  // https://redfin.engineering/how-to-fix-the-refresh-button-when-using-service-workers-a8e27af6df68
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });
} else {
  console.error("Service workers are not supported.");
}

document.addEventListener("DOMContentLoaded", () => {
  const myDiv = document.getElementById("bottom-toolbar");

  if (myDiv) {
    // Pass the element and an optional 10px buffer
    const avoider = new KeyboardAvoider(myDiv, 10);

    console.log("myDiv", myDiv);

    // If you ever remove the div dynamically, remember to clean up:
    // avoider.destroy();
  }
});

export class KeyboardAvoider {
  private element: HTMLElement;
  private offsetBuffer: number;

  /**
   * @param element The HTML element you want to fix above the keyboard.
   * @param offsetBuffer Optional extra padding (in px) above the keyboard.
   */
  constructor(element: HTMLElement, offsetBuffer: number = 0) {
    this.element = element;
    this.offsetBuffer = offsetBuffer;

    this.init();
  }

  private init(): void {
    if (!window.visualViewport) {
      console.warn("Visual Viewport API is not supported in this browser.");
      return;
    }

    // Bind the event listener to preserve the 'this' context
    window.visualViewport.addEventListener("resize", this.handleViewportChange);
    window.visualViewport.addEventListener("scroll", this.handleViewportChange);

    // Run once on initialization to set the initial state
    this.handleViewportChange();
  }

  private handleViewportChange = (): void => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Calculate how much of the layout viewport is covered by the keyboard
    // viewport.offsetTop handles cases where the user scrolls while the keyboard is open (especially on iOS)
    const offsetBottom =
      window.innerHeight - viewport.height - viewport.offsetTop;

    // If offsetBottom is greater than 0, the keyboard is likely open.
    // We apply the offset using `bottom`. (Alternatively, you could use transform: translateY for smoother animations)
    const finalOffset = Math.max(0, offsetBottom) + this.offsetBuffer;
    this.element.style.bottom = `${finalOffset}px`;
  };

  /**
   * Call this method when the element is removed from the DOM to prevent memory leaks.
   */
  public destroy(): void {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener(
        "resize",
        this.handleViewportChange,
      );
      window.visualViewport.removeEventListener(
        "scroll",
        this.handleViewportChange,
      );
    }
  }
}
