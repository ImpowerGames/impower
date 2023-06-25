import { EditorView, WidgetType } from "@codemirror/view";

export const WRAPPER_CLASS_NAME = "cm-color-picker-wrapper";

export const BACKGROUND_CLASS_NAME = "cm-color-picker-background";

export const COLOR_SUPPORT_WIDGET_THEME = EditorView.baseTheme({
  [`.${WRAPPER_CLASS_NAME}`]: {
    display: "inline-block",
    justifyContent: "center",
    alignItems: "center",
    outline: "1px solid #eee",
    margin: "0 0.3em",
    height: "0.7em",
    width: "0.7em",
    transform: "translateY(1px)",
    backgroundColor: "black",
    position: "relative",
  },
  [`.${BACKGROUND_CLASS_NAME}`]: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  [`.${WRAPPER_CLASS_NAME} input[type="color"]`]: {
    cursor: "pointer",
    height: "100%",
    width: "100%",
    opacity: 0,
    padding: 0,
    border: "none",
    "&::-webkit-color-swatch-wrapper": {
      padding: 0,
      border: "none",
    },
    "&::-webkit-color-swatch": {
      padding: 0,
      border: "none",
    },
  },
});

interface PickerState {
  from: number;
  to: number;
  color: string;
}

export default class ColorSupportWidget extends WidgetType {
  private readonly state: PickerState;

  constructor(state: PickerState) {
    super();
    this.state = state;
  }

  override eq(other: ColorSupportWidget) {
    return (
      other.state.color === this.state.color &&
      other.state.from === this.state.from &&
      other.state.to === this.state.to
    );
  }

  override toDOM() {
    // TODO: Implement color picker that matches VSCode's color picker features
    // const picker = document.createElement("input");
    // picker.type = "color";
    // picker.value = this.state.color;

    const backgroundSpan = document.createElement("span");
    // backgroundSpan.appendChild(picker);
    backgroundSpan.className = BACKGROUND_CLASS_NAME;
    backgroundSpan.style.backgroundColor = this.state.color;

    const wrapper = document.createElement("span");
    wrapper.appendChild(backgroundSpan);
    wrapper.className = WRAPPER_CLASS_NAME;
    wrapper.style.backgroundColor = this.state.color;

    return wrapper;
  }

  override ignoreEvent() {
    return false;
  }
}
