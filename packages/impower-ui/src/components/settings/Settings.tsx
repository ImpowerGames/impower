import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { announce } from "../../hooks/useAnnouncer";
import { cn } from "../../utils/cn";
import Button from "../button/Button";
import ChoiceGroup, { type ChoiceOption } from "../choice-group/ChoiceGroup";
import Select, { type SelectOption } from "../select/Select";
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
  class?: string;
  children?: ComponentChildren;
};

export function SettingsList({ class: className, children }: SettingsListProps) {
  return (
    <div
      class={cn(
        "grid min-w-0 overflow-hidden rounded-[10px] border border-solid border-edge bg-panel",
        "[&>*+*]:border-t [&>*+*]:border-solid [&>*+*]:border-[color-mix(in_srgb,var(--edge)_60%,transparent)]",
        className,
      )}
    >
      {children}
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
  value: string;
  placeholder?: string;
  maxLength?: number;
  width?: Exclude<TextFieldWidth, "full">;
  font?: TextFieldFont;
  onValueChange: (value: string) => void;
};

export function TextRow({
  id,
  name,
  detail,
  value,
  placeholder,
  maxLength = 40,
  width = "default",
  font,
  onValueChange,
  setting,
  indent,
  disabled,
  class: className,
}: TextRowProps) {
  const wide = width === "wide";
  return (
    <SettingsRow
      id={id}
      name={name}
      detail={detail}
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
          {...labelledBy(id, detail)}
          onValueChange={onValueChange}
          onCommit={(committed) => announce(`${name}: ${committed}.`)}
        />
      }
    />
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
