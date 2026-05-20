export const propDefaults = {};
export type NotificationsProps = Partial<typeof propDefaults>;

/**
 * Toast notification container. Wraps sparkle's `<s-toast-stack>` which
 * handles the actual queue, stacking, dismiss animation, etc. Kept as
 * legacy because the toast machinery is already accessibility-correct
 * (ARIA live region + role=status) and porting it is outside this pass.
 *
 * The host CSS just gives us a positioned container above the rest of
 * the UI; the toast-stack's own absolute positioning does the work.
 */
const HOST_STYLE = `
  se-notifications {
    display: block;
    position: relative;
    overflow-y: visible;
  }
`;

export default function Notifications(_props: NotificationsProps) {
  return (
    <>
      <style>{HOST_STYLE}</style>
      {/* @ts-expect-error legacy sparkle widget */}
      <s-toast-stack />
    </>
  );
}
