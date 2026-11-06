import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import MessageEntry, {
  MESSAGE_ENTRY_ROW_HEIGHT,
  type MessageEntryFit,
  type MessageEntrySeverity,
} from "./MessageEntry";

const SEVERITIES: Record<MessageEntrySeverity, string> = {
  error: "Error · ",
  warning: "Warning · ",
  info: "Note · ",
};

const FITS: Record<MessageEntryFit, string> = {
  flow: "Flow: wraps in full (the Problems to fix dialog)",
  row: `Row: a fixed-height virtual row (${MESSAGE_ENTRY_ROW_HEIGHT.message}px with a message, ${MESSAGE_ENTRY_ROW_HEIGHT.plain}px without); the title fades at the edge and the message clamps to two lines`,
};

const MESSAGE =
  "sfx_jukebox_coin_clink is not in your assets yet. Add the sound or choose one you already have, or rename it to one the project holds.";

function MessageEntryDemo() {
  return (
    <div class="max-w-md space-y-6">
      {(Object.keys(FITS) as MessageEntryFit[]).map((fit) => (
        <GalleryRow key={fit} label={FITS[fit]}>
          <div class="rounded-card border border-edge bg-paper px-1">
            {(Object.keys(SEVERITIES) as MessageEntrySeverity[]).map((severity) => (
              <div key={severity} class={fit === "row" ? "h-[114px]" : undefined}>
                <MessageEntry
                  fit={fit}
                  severity={severity}
                  prefix={SEVERITIES[severity]}
                  title="Sound not found in the project's asset folders"
                  message={MESSAGE}
                  location="Line 46"
                  locationLabel="Open Line 46"
                  onJump={() => {}}
                />
              </div>
            ))}
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label="Played: a path and line, the time at the right, no message">
        <div class="rounded-card border border-edge bg-paper px-1">
          <MessageEntry
            severity="error"
            prefix="Error · "
            title="Divide by zero"
            location="scripts/chapter_2.sd:17"
            onJump={() => {}}
            time={{ label: "10:15:30", dateTime: "2026-11-06T10:15:30.000Z" }}
          />
        </div>
      </GalleryRow>
    </div>
  );
}

export const messageEntryGallery: GalleryEntry = {
  title: "MessageEntry",
  exports: ["MessageEntry", "messageEntryVariants", "messageEntryGlyphVariants", "MESSAGE_ENTRY_ROW_HEIGHT"],
  Demo: MessageEntryDemo,
};
