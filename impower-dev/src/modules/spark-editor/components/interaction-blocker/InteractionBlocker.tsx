export const propDefaults = {
  hidden: true,
};
export type InteractionBlockerProps = Partial<typeof propDefaults>;

/**
 * Full-screen overlay shown when something is blocking user interaction
 * (e.g. heavy workspace operations). Currently always hidden by default —
 * the legacy code never toggled it via JS either. Kept around as a hook
 * for future "show this while X happens" flows.
 *
 * The spinner stays a legacy `<s-progress-circle>` for now — sparkle's
 * widget is fine and we don't have a Preact ProgressCircle primitive yet.
 */
export default function InteractionBlocker({
  hidden = true,
}: InteractionBlockerProps) {
  if (hidden) return null;
  return (
    <div class="fixed inset-0 z-[999999999] flex items-center justify-center bg-background/80">
      {/* @ts-expect-error legacy sparkle widget */}
      <s-progress-circle size="40" />
    </div>
  );
}
