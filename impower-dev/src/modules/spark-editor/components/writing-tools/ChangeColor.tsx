import {
  colorValueOf,
  colorValueOfLspColor,
  formatColorValue,
  opacityOf,
  withColorOf,
  withOpacity,
  type ColorValue,
} from "@impower/codemirror-vscode-lsp-client/src/colorValue";
import {
  Button,
  ColorChips,
  ColorWell,
  Slider,
  TextField,
} from "@impower/impower-ui/components";
import type { Color } from "@impower/spark-editor-protocol/src/types";
import { useId, useRef, useState } from "preact/hooks";

export type ChangeColorOutcome = "applied" | "invalid" | "moved";

export type ChangeColorViewProps = {
  value: string;
  color: Color;
  colors: readonly string[];
  onUse: (value: string) => Promise<ChangeColorOutcome>;
};

const INVALID = "Write a color as # and six letters or digits, such as #f2c14e.";
const MOVED = "This color has changed in the script. Open Change color from it again.";

const percentText = (percent: number) => `${percent}%`;

const initialColor = (value: string, color: Color): ColorValue =>
  colorValueOf(value) ?? colorValueOfLspColor(color);

export function ChangeColorView({ value, color, colors, onUse }: ChangeColorViewProps) {
  const [current, setCurrent] = useState(() => initialColor(value, color));
  const [text, setText] = useState(() =>
    colorValueOf(value) ? value : formatColorValue(initialColor(value, color), value),
  );
  const [status, setStatus] = useState("");
  const fieldRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const opacityId = useId();
  const percent = opacityOf(current);

  const show = (next: ColorValue) => {
    setCurrent(next);
    setText(formatColorValue(next, value));
    setStatus("");
  };

  const onType = (typed: string) => {
    setText(typed);
    setStatus("");
    const parsed = colorValueOf(typed);
    if (parsed) setCurrent(parsed);
  };

  const refuse = (reason: string) => {
    setStatus(reason);
    fieldRef.current?.focus({ preventScroll: true });
  };

  const onSubmit = async (event: Event) => {
    event.preventDefault();
    const parsed = colorValueOf(text);
    if (!parsed) {
      refuse(INVALID);
      return;
    }
    const outcome = await onUse(formatColorValue(parsed, value));
    if (outcome === "invalid") refuse(INVALID);
    else if (outcome === "moved") refuse(MOVED);
  };

  return (
    <form
      class="grid grid-cols-[minmax(0,1fr)_auto] gap-3.5 p-4 compact:gap-2.5 compact:px-4 compact:py-3 phone:gap-2.5 phone:px-4 phone:py-3"
      onSubmit={onSubmit}
    >
      <div class="col-span-full flex items-center gap-3.5">
        <ColorWell
          value={current.rgb}
          label="Pick any color"
          onValueChange={(picked) => show(withColorOf(current, picked))}
        />
        <label for={fieldId} class="sr-only">
          Value
        </label>
        <TextField
          ref={fieldRef}
          id={fieldId}
          size="tall"
          width="full"
          font="mono"
          class="flex-1"
          autocapitalize="off"
          value={text}
          onValueChange={onType}
        />
      </div>
      <div class="col-span-full grid grid-cols-[auto_minmax(0,1fr)_3.2em] items-center gap-3">
        <label for={opacityId} class="text-[12px] text-muted">
          Opacity
        </label>
        <Slider
          id={opacityId}
          min={0}
          max={100}
          step={1}
          value={percent}
          valueText={percentText}
          onValueChange={(next) => show(withOpacity(current, next))}
        />
        <span aria-hidden="true" class="text-right text-[13px] tabular-nums">
          {percentText(percent)}
        </span>
      </div>
      {colors.length > 0 && (
        <>
          <p class="col-span-full m-0 text-[12px] text-muted compact:hidden phone:hidden">
            In this story
          </p>
          <ColorChips
            class="col-span-full compact:col-span-1 phone:col-span-1"
            label="Colors in this story"
            colors={colors}
            current={current.rgb}
            onSelect={(chosen) => show(withColorOf(current, chosen))}
          />
        </>
      )}
      <div class="col-span-full flex items-center justify-end gap-2 compact:col-span-1 compact:col-start-2 phone:col-span-1 phone:col-start-2">
        <Button type="submit" variant="primary">
          Use color
        </Button>
      </div>
      <p role="status" class="col-span-full m-0 text-[12px]/[1.6] text-muted empty:hidden">
        {status}
      </p>
    </form>
  );
}

export default ChangeColorView;
