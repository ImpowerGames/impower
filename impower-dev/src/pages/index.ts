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
  const myDiv = document.getElementById("fixed-bottom-toolbar");
  if (myDiv) {
    new MobileKeyboardAvoider(myDiv, true);
  }
});

export class MobileKeyboardAvoider {
  private element: HTMLElement;
  private isMobile: boolean;
  private isIOS: boolean;

  constructor(element: HTMLElement, hideOnDesktop: boolean) {
    this.element = element;
    // Mobile detection
    this.isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      navigator.maxTouchPoints > 0;

    // Simple iOS detection
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (hideOnDesktop && !this.isMobile) {
      element.hidden = true;
      element.style.display = "none";
    } else {
      this.init();
    }
  }

  private init(): void {
    if (!window.visualViewport) return;

    window.visualViewport.addEventListener("resize", this.updatePosition);
    window.visualViewport.addEventListener("scroll", this.updatePosition);

    this.updatePosition();
  }

  private updatePosition = (): void => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    if (this.isIOS) {
      /**
       * iOS FIX:
       * Instead of using 'bottom', we calculate the absolute 'top' position.
       * (Viewport Offset Top + Viewport Height) = The very bottom edge of the visible screen.
       * We subtract the element's height to pin it to that bottom edge.
       */
      const elementHeight = this.element.offsetHeight;
      const visibleBottom = viewport.offsetTop + viewport.height;

      // We use transform for maximum performance and to avoid layout thrashing
      this.element.style.top = "0px";
      this.element.style.bottom = "auto";
      this.element.style.transform = `translateY(${visibleBottom - elementHeight}px)`;
    } else {
      // Android usually handles 'bottom' resizing correctly
      const offsetBottom =
        window.innerHeight - viewport.height - viewport.offsetTop;
      this.element.style.bottom = `${Math.max(0, offsetBottom)}px`;
    }
  };
}
