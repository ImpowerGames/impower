import { Button, type IconComponent } from "@impower/impower-ui/components";

const TONES = {
  muted: "text-muted",
  ink: "text-ink",
  accent: "text-accent",
} as const;

export type ControlTone = keyof typeof TONES;

export function ControlButton({
  label,
  icon: Icon,
  disabled,
  reason,
  title,
  pressed,
  tone = "muted",
  onClick,
}: {
  label: string;
  icon: IconComponent;
  disabled?: boolean;
  reason?: string;
  title?: string;
  pressed?: boolean;
  tone?: ControlTone;
  onClick: () => void;
}) {
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label={label}
      title={reason ?? title ?? label}
      aria-pressed={pressed}
      aria-disabled={reason ? true : undefined}
      disabled={disabled}
      onClick={reason ? undefined : onClick}
      class={`${pressed ? TONES.accent : TONES[tone]} aria-disabled:cursor-default aria-disabled:opacity-40`}
    >
      <Icon />
    </Button>
  );
}
