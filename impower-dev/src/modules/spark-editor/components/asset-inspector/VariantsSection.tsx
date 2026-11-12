import {
  Button,
  ChevronDownIcon,
  ChoiceGroup,
  CopyIcon,
  DropdownContent,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownTrigger,
  WheelSheet,
} from "@impower/impower-ui/components";
import { useCoarsePointer } from "@impower/impower-ui/layout";
import type { RefObject } from "preact";
import { useId, useRef, useState } from "preact/hooks";
import type { ImageStack } from "../../utils/imageStacks";
import {
  chosenIn,
  groupLabel,
  isChanged,
  optionLabel,
  referenceOf,
  testerGroups,
  variantOf,
  type TesterGroup,
  type VariantForm,
  type VariantSelection,
} from "../../utils/imageVariants";
import { showSnackbar } from "../../utils/snackbar";
import Section from "./Section";

const FORMS = [
  { value: "portrait", label: "Portrait" },
  { value: "backdrop", label: "Backdrop" },
] as const;

export type VariantsSectionProps = {
  stack: ImageStack;
  selection: VariantSelection;
  form: VariantForm;
  onSelect: (selection: VariantSelection) => void;
  onPreview: (selection: VariantSelection | null) => void;
  onForm: (form: VariantForm) => void;
  sheetContainer: RefObject<HTMLElement>;
};

function GroupMenu({
  group,
  value,
  onPick,
  onPreview,
  sheetContainer,
}: {
  group: TesterGroup;
  value: string;
  sheetContainer: RefObject<HTMLElement>;
  onPick: (value: string) => void;
  onPreview: (value: string | null) => void;
}) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const name = groupLabel(group);
  const button = useRef<HTMLButtonElement | null>(null);
  const trigger = (
    <Button
      ref={button}
      size="compact"
      class={value === group.default ? "min-w-0 justify-between" : "min-w-0 justify-between text-accent"}
      aria-label={`${name}: ${optionLabel(value)}`}
      data-variant-group={group.key}
      {...(coarse ? { "aria-haspopup": "dialog" as const, onClick: () => setOpen(true) } : {})}
    >
      <span class="truncate">{optionLabel(value)}</span>
      <ChevronDownIcon class="text-muted" />
    </Button>
  );
  if (coarse) {
    return (
      <>
        {trigger}
        <WheelSheet
          container={sheetContainer}
          returnFocus={() => button.current}
          open={open}
          title={name}
          options={group.options.map((option) => ({
            value: option,
            label: optionLabel(option),
            ...(option === group.default ? { hint: "Default" } : {}),
          }))}
          value={value}
          onPreview={onPreview}
          onChoose={(picked) => {
            setOpen(false);
            onPick(picked);
          }}
          onCancel={() => {
            setOpen(false);
            onPreview(null);
          }}
        />
      </>
    );
  }
  return (
    <DropdownRoot onOpenChange={(next) => !next && onPreview(null)}>
      <DropdownTrigger asChild>{trigger}</DropdownTrigger>
      <DropdownContent align="end" class="min-w-[180px]">
        <DropdownRadioGroup value={value} onValueChange={onPick} label={name}>
          {group.options.map((option) => (
            <DropdownRadioItem
              key={option}
              value={option}
              indicator="end"
              onFocus={() => onPreview(option)}
              onPointerEnter={() => onPreview(option)}
            >
              <span class="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                {optionLabel(option)}
                {option === group.default ? <small class="text-[11px] font-normal text-muted">Default</small> : null}
              </span>
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </DropdownRoot>
  );
}

export default function VariantsSection({
  stack,
  selection,
  form,
  onSelect,
  onPreview,
  onForm,
  sheetContainer,
}: VariantsSectionProps) {
  const formLabel = useId();
  const groups = testerGroups(stack, selection);
  const reference = referenceOf(variantOf(stack, selection), form);
  const copy = () =>
    void navigator.clipboard.writeText(reference).then(
      () => showSnackbar({ message: "Copied." }),
      () => showSnackbar({ message: "Couldn't copy. Select the reference and copy it." }),
    );
  return (
    <Section
      title="Variants"
      label="Variants"
      aside={
        isChanged(stack, selection) ? (
          <Button variant="quiet" size="compact" class="-my-3 text-accent" data-variant-reset onClick={() => onSelect({})}>
            Reset
          </Button>
        ) : undefined
      }
    >
      <div class="grid gap-3">
        {groups.length > 0 && (
          <div class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
            {groups.map((group) => (
              <div key={group.key} class="contents">
                <span class="truncate text-[13px] text-muted">{groupLabel(group)}</span>
                <GroupMenu
                  sheetContainer={sheetContainer}
                  group={group}
                  value={chosenIn(group, selection)}
                  onPick={(value) => {
                    onPreview(null);
                    onSelect({ ...selection, [group.key]: value });
                  }}
                  onPreview={(value) => onPreview(value === null ? null : { ...selection, [group.key]: value })}
                />
              </div>
            ))}
          </div>
        )}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span id={formLabel} class="text-[13px] text-muted">
            Show as
          </span>
          <ChoiceGroup
            name={`${formLabel}-form`}
            aria-labelledby={formLabel}
            options={FORMS}
            value={form}
            onValueChange={onForm}
          />
        </div>
        <div class="flex items-center gap-2 rounded-control border border-edge bg-bg py-1 pr-1 pl-3">
          <code
            class="min-w-0 flex-1 font-mono text-[13px]/[1.5] break-all text-ink select-text"
            data-variant-reference
          >
            {reference}
          </code>
          <Button variant="quiet" size="compact" data-variant-copy onClick={copy}>
            <CopyIcon />
            Copy
          </Button>
        </div>
      </div>
    </Section>
  );
}
