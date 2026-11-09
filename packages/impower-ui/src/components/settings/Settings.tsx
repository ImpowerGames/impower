import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { announce } from "../../hooks/useAnnouncer";
import { cn } from "../../utils/cn";
import Button from "../button/Button";
import ChoiceGroup, { type ChoiceOption } from "../choice-group/ChoiceGroup";
import Select, { type SelectOption } from "../select/Select";
import Slider from "../slider/Slider";
import Switch from "../switch/Switch";
import TextField, { type TextFieldFont, type TextFieldWidth } from "../text-field/TextField";


export type SettingsSectionProps = {
  id: string;
  title: string;
  detail?: ComponentChildren;
  actions?: ComponentChildren;
  changed?: boolean;
  onReset?: () => void;
  class?: string;
  children?: ComponentChildren;
};

export function SettingsSection({
  id,
  title,
  detail,
  actions,
  changed = false,
  onReset,
  class: className,
  children,
}: SettingsSectionProps) {
  const reset = !!onReset && changed;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-settings-section
      class={cn("min-w-0 scroll-mt-4", className)}
    >
      <header class="mb-3.5">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 id={`${id}-title`} tabIndex={-1} class="m-0 text-[17px]/[1.4] font-semibold">
            {title}
          </h3>
          {(reset || actions) && (
            <div class="-my-2 -mr-2.5 ml-auto flex flex-none gap-1">
              {reset && (
                <Button variant="quiet" class="text-muted" data-reset-all onClick={onReset}>
                  Reset to defaults
                </Button>
              )}
              {actions}
            </div>
          )}
        </div>
        {detail && (
          <p class="mt-1.5 mb-0 max-w-[590px] text-[14px]/[1.6] text-muted">{detail}</p>
        )}
      </header>
      {children}
    </section>
  );
}

export type SettingsGroupProps = {
  legend?: string;
  note?: ComponentChildren;
  id?: string;
  hidden?: boolean;
  class?: string;
  children?: ComponentChildren;
};

export function SettingsGroup({ legend, note, id, hidden, class: className, children }: SettingsGroupProps) {
  return (
    <fieldset
      id={id}
      hidden={hidden}
      class={cn("m-0 mb-5 block min-w-0 scroll-mt-4 border-0 p-0 last:mb-0", className)}
    >
      {legend && <legend class="m-0 mb-2 p-0 text-[13px]/[1.5] font-semibold">{legend}</legend>}
      {note && <p class="-mt-0.5 mb-2.5 max-w-[590px] text-[13px]/[1.5] text-muted">{note}</p>}
      {children}
    </fieldset>
  );
}

export type SettingsListProps = {
  as?: "div" | "dl";
  class?: string;
  children?: ComponentChildren;
};

export function SettingsList({ as: Tag = "div", class: className, children }: SettingsListProps) {
  return (
    <Tag
      class={cn(
        "m-0 grid min-w-0 overflow-hidden rounded-[10px] border border-solid border-edge bg-panel",
        "[&>*+*]:border-t [&>*+*]:border-solid [&>*+*]:border-[color-mix(in_srgb,var(--edge)_60%,transparent)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export type FactRowProps = {
  term: string;
  multiline?: boolean;
  class?: string;
  children?: ComponentChildren;
};

export function FactRow({ term, multiline = false, class: className, children }: FactRowProps) {
  return (
    <div class={cn(settingsRowVariants(), "items-baseline", className)} data-fact-row>
      <dt class="flex-[0_0_88px] text-[12px]/[1.5] text-muted phone:basis-16">{term}</dt>
      <dd
        class={cn(
          "m-0 min-w-0 flex-1 text-[14px]/[1.5] [overflow-wrap:anywhere]",
          multiline && "whitespace-pre-line",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export const settingsRowVariants = cva(
  ["m-0 flex min-h-[52px] items-center gap-4 px-4 py-2.5", "phone:gap-3 phone:px-3.5"],
  {
    variants: {
      indent: {
        none: "",
        sub: "pl-10 phone:pl-[30px]",
      },
      wrap: {
        false: "",
        true: "@max-[560px]/page:flex-wrap",
      },
      interactive: {
        false: "",
        true: "cursor-pointer",
      },
      disabled: {
        false: "",
        true: "cursor-default",
      },
    },
    defaultVariants: {
      indent: "none",
      wrap: false,
      interactive: false,
      disabled: false,
    },
  },
);

export type SettingsRowVariantProps = VariantProps<typeof settingsRowVariants>;
export type SettingsRowIndent = NonNullable<SettingsRowVariantProps["indent"]>;

export type SettingsRowProps = Omit<SettingsRowVariantProps, "interactive"> & {
  id: string;
  name: ComponentChildren;
  detail?: ComponentChildren;
  icon?: ComponentChildren;
  control?: ComponentChildren;
  setting?: string;
  htmlFor?: string;
  changed?: boolean;
  onReset?: () => void;
  resetLabel?: string;
  class?: string;
};

const FOCUSABLE = "button:not([data-reset-row]), input, select, textarea, [tabindex]";

export function SettingsRow({
  id,
  name,
  detail,
  icon,
  control,
  setting,
  htmlFor,
  changed = false,
  onReset,
  resetLabel = typeof name === "string" ? `Reset ${name}` : undefined,
  indent,
  wrap,
  disabled,
  class: className,
}: SettingsRowProps) {
  const Tag = htmlFor ? "label" : "div";
  const row = useRef<HTMLDivElement & HTMLLabelElement>(null);
  const reset = () => {
    onReset?.();
    setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) {
        row.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      }
    }, 0);
  };
  return (
    <Tag
      ref={row}
      class={cn(
        settingsRowVariants({ indent, wrap, disabled, interactive: !!htmlFor && !disabled }),
        className,
      )}
      data-setting-row
      data-reset={setting}
      {...(htmlFor ? { for: htmlFor } : {})}
    >
      {icon && (
        <span class="size-[22px] flex-none text-accent [&_svg]:size-[22px]" aria-hidden="true">
          {icon}
        </span>
      )}
      <span
        class={cn(
          "min-w-0 flex-[1_1_200px]",
          "phone:basis-[140px]",
          wrap && "@max-[560px]/page:basis-full",
          disabled && "opacity-55",
        )}
      >
        <strong id={`${id}-name`} class="block text-[14px]/[1.4] font-semibold">
          {name}
        </strong>
        {detail && (
          <small id={`${id}-detail`} class="mt-0.5 block text-[13px]/[1.5] text-muted">
            {detail}
          </small>
        )}
      </span>
      {onReset && changed && !disabled && (
        <Button
          variant="quiet"
          class="-my-2 flex-none text-muted"
          data-reset-row
          aria-label={resetLabel}
          onClick={reset}
        >
          Reset
        </Button>
      )}
      {control}
    </Tag>
  );
}

type RowBase = {
  id: string;
  name: string;
  setting?: string;
  indent?: SettingsRowIndent;
  disabled?: boolean;
  class?: string;
};

function useAcceptedAnnouncement<T>(value: T, message: (accepted: T) => string): () => void {
  const latest = useRef(value);
  latest.current = value;
  const describe = useRef(message);
  describe.current = message;
  return () => {
    const before = latest.current;
    setTimeout(() => {
      const accepted = latest.current;
      if (accepted !== before) {
        announce(describe.current(accepted));
      }
    }, 0);
  };
}

const labelledBy = (id: string, detail: unknown) => ({
  "aria-labelledby": `${id}-name`,
  ...(detail ? { "aria-describedby": `${id}-detail` } : {}),
});

type ToggledDetail = { readonly on: string; readonly off: string };

const isToggledDetail = (detail: unknown): detail is ToggledDetail =>
  typeof detail === "object" && detail !== null && !Array.isArray(detail) && "on" in detail && "off" in detail;

export type SwitchRowProps = RowBase & {
  detail?: ComponentChildren | ToggledDetail;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function SwitchRow({
  id,
  name,
  detail,
  checked,
  onCheckedChange,
  setting,
  indent,
  disabled,
  class: className,
}: SwitchRowProps) {
  const text = isToggledDetail(detail) ? (checked ? detail.on : detail.off) : detail;
  const announceAccepted = useAcceptedAnnouncement(checked, (on) => `${name} ${on ? "on" : "off"}.`);
  return (
    <SettingsRow
      id={id}
      name={name}
      detail={text}
      setting={setting}
      indent={indent}
      disabled={disabled}
      htmlFor={`${id}-control`}
      class={className}
      control={
        <Switch
          id={`${id}-control`}
          checked={checked}
          disabled={disabled}
          {...labelledBy(id, text)}
          onCheckedChange={(next) => {
            onCheckedChange(next);
            announceAccepted();
          }}
        />
      }
    />
  );
}

export type SelectRowProps<V extends string = string> = RowBase & {
  detail?: string;
  options: readonly SelectOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
};

export function SelectRow<V extends string = string>({
  id,
  name,
  detail,
  options,
  value,
  onValueChange,
  setting,
  indent,
  disabled,
  class: className,
}: SelectRowProps<V>) {
  const announceAccepted = useAcceptedAnnouncement(
    value,
    (accepted) => `${name}: ${options.find((option) => option.value === accepted)?.label ?? accepted}.`,
  );
  return (
    <SettingsRow
      id={id}
      name={name}
      detail={detail}
      setting={setting}
      indent={indent}
      disabled={disabled}
      wrap
      htmlFor={`${id}-control`}
      class={className}
      control={
        <Select<V>
          id={`${id}-control`}
          class="max-w-[50%] phone:max-w-[46%] @max-[560px]/page:ml-auto"
          options={options}
          value={value}
          disabled={disabled}
          {...labelledBy(id, detail)}
          onValueChange={(next) => {
            onValueChange(next);
            announceAccepted();
          }}
        />
      }
    />
  );
}

export type TextRowProps = RowBase & {
  detail?: string;
  problem?: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  width?: Exclude<TextFieldWidth, "full">;
  font?: TextFieldFont;
  onValueChange: (value: string) => void;
  onCommit?: (value: string) => string | void;
};

export function TextRow({
  id,
  name,
  detail,
  problem,
  value,
  placeholder,
  maxLength = 40,
  width = "default",
  font,
  onValueChange,
  onCommit,
  setting,
  indent,
  disabled,
  class: className,
}: TextRowProps) {
  const wide = width === "wide";
  const shown = problem ?? detail;
  return (
    <SettingsRow
      id={id}
      name={name}
      detail={problem ? <span class="text-error" data-problem>{problem}</span> : detail}
      setting={setting}
      indent={indent}
      disabled={disabled}
      wrap={wide}
      htmlFor={`${id}-control`}
      class={className}
      control={
        <TextField
          id={`${id}-control`}
          width={width}
          font={font}
          class={cn(
            wide
              ? "max-w-[60%] @max-[560px]/page:w-full @max-[560px]/page:max-w-full"
              : `max-w-[50%] ${width === "short" ? "phone:w-[118px]" : "phone:w-32"}`,
          )}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={problem ? "true" : undefined}
          {...labelledBy(id, shown)}
          onValueChange={onValueChange}
          onCommit={(committed) => announce(onCommit?.(committed) || `${name}: ${committed}.`)}
        />
      }
    />
  );
}

export type SliderRowProps = RowBase & {
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: (value: number) => string;
  scale?: readonly [string, string];
  hint?: string;
  aside?: ComponentChildren;
  onValueChange: (value: number) => void;
};

export function SliderRow({
  id,
  name,
  value,
  min,
  max,
  step,
  valueText,
  scale,
  hint,
  aside,
  onValueChange,
  setting,
  disabled,
  class: className,
}: SliderRowProps) {
  return (
    <div
      class={cn(
        "grid items-center gap-x-7 gap-y-5 p-4",
        aside &&
          "grid-cols-[minmax(0,1fr)_256px] compact:grid-cols-1 phone:grid-cols-1 @max-[560px]/page:grid-cols-1",
        className,
      )}
      data-setting-row
      data-reset={setting}
    >
      <div class={cn("min-w-0", disabled && "opacity-55")}>
        <div class="flex min-h-9 items-center gap-2">
          <label id={`${id}-name`} for={`${id}-control`} class="text-[14px]/[1.4] font-semibold">
            {name}
          </label>
          <output for={`${id}-control`} class="ml-auto text-[13px] whitespace-nowrap text-accent">
            {valueText(value)}
          </output>
        </div>
        <Slider
          id={`${id}-control`}
          class="mt-0.5"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          valueText={valueText}
          aria-labelledby={`${id}-name`}
          {...(hint ? { "aria-describedby": `${id}-hint` } : {})}
          onValueChange={onValueChange}
        />
        {scale && (
          <div class="-mt-1 flex justify-between text-[12px] text-muted" aria-hidden="true">
            <span>{scale[0]}</span>
            <span>{scale[1]}</span>
          </div>
        )}
        {hint && (
          <p id={`${id}-hint`} class="mt-2.5 mb-0 text-[12px]/[1.6] text-muted">
            {hint}
          </p>
        )}
      </div>
      {aside && (
        <div class="min-w-0 compact:w-64 compact:max-w-full compact:justify-self-center phone:w-64 phone:max-w-full phone:justify-self-center @max-[560px]/page:w-64 @max-[560px]/page:max-w-full @max-[560px]/page:justify-self-center">
          {aside}
        </div>
      )}
    </div>
  );
}

export type ChoiceRowOption<V extends string = string> = ChoiceOption<V> & {
  readonly detail?: string;
};

export type ChoiceRowProps<V extends string = string> = RowBase & {
  group: string;
  options: readonly ChoiceRowOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
};

export function ChoiceRow<V extends string = string>({
  id,
  name,
  group,
  options,
  value,
  onValueChange,
  setting,
  indent,
  disabled,
  class: className,
}: ChoiceRowProps<V>) {
  const current = options.find((option) => option.value === value) ?? options[0];
  const announceAccepted = useAcceptedAnnouncement(
    value,
    (accepted) => `${name}: ${options.find((option) => option.value === accepted)?.label ?? accepted}.`,
  );
  return (
    <SettingsRow
      id={id}
      name={name}
      detail={current?.detail}
      setting={setting}
      indent={indent}
      disabled={disabled}
      wrap
      class={className}
      control={
        <ChoiceGroup<V>
          class="@max-[560px]/page:ml-auto"
          name={group}
          options={options}
          value={value}
          disabled={disabled}
          {...labelledBy(id, current?.detail)}
          onValueChange={(next) => {
            onValueChange(next);
            announceAccepted();
          }}
        />
      }
    />
  );
}

export type SettingsFootProps = {
  class?: string;
  children?: ComponentChildren;
};

export function SettingsFoot({ class: className, children }: SettingsFootProps) {
  return <div class={cn("mt-2 -ml-2.5 flex flex-wrap gap-x-2 gap-y-1", className)}>{children}</div>;
}

export type SettingsPlaceholderProps = Omit<SettingsSectionProps, "changed" | "onReset">;

export function SettingsPlaceholder({ children, ...props }: SettingsPlaceholderProps) {
  return (
    <SettingsSection {...props}>
      <SettingsList>
        <div data-settings-placeholder class="flex min-h-[52px] items-center px-4 py-2.5 text-[13px]/[1.5] text-muted">
          Coming in a later change
        </div>
      </SettingsList>
      {children}
    </SettingsSection>
  );
}
