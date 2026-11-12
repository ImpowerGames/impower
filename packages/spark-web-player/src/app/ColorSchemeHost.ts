import { COLOR_SCHEME_ATTRIBUTE } from "../../../spark-dom/src/utils/getStyleContent";
import type {
  ColorScheme,
  ColorSchemeSetting,
} from "../../../spark-engine/src/game/core/classes/messages/SetSimulatedColorSchemeMessage";

export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export class ColorSchemeHost {
  static for(root: HTMLElement): ColorSchemeHost {
    const holder = root as HTMLElement & { __sdColorScheme?: ColorSchemeHost };
    holder.__sdColorScheme ??= new ColorSchemeHost(root);
    return holder.__sdColorScheme;
  }

  protected root: HTMLElement;
  protected setting: ColorSchemeSetting = "system";
  protected simulated?: ColorScheme;
  protected device?: MediaQueryList;

  protected constructor(root: HTMLElement) {
    this.root = root;
  }

  get scheme(): ColorScheme {
    if (this.setting !== "system") {
      return this.setting;
    }
    return this.simulated ?? this.deviceScheme();
  }

  configure(setting: ColorSchemeSetting): void {
    this.setting = setting;
    this.apply();
  }

  simulate(scheme: ColorScheme): void {
    this.simulated = scheme;
    this.apply();
  }

  dispose(): void {
    this.device?.removeEventListener("change", this.apply);
    this.device = undefined;
  }

  protected deviceScheme(): ColorScheme {
    if (!this.device) {
      this.device = globalThis.matchMedia?.(DARK_SCHEME_QUERY);
      this.device?.addEventListener("change", this.apply);
    }
    return this.device?.matches ? "dark" : "light";
  }

  protected apply = (): void => {
    const scheme = this.scheme;
    if (this.root.getAttribute(COLOR_SCHEME_ATTRIBUTE) !== scheme) {
      this.root.setAttribute(COLOR_SCHEME_ATTRIBUTE, scheme);
    }
  };
}
