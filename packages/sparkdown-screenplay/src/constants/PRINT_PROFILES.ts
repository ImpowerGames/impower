import { PrintProfile } from "../types/PrintProfile";

const A4_DEFAULT_MAX = 58;
const USLETTER_DEFAULT_MAX = 61;

const A4: PrintProfile = {
  paper_size: "a4",
  font_size: 12,
  lines_per_page: 57,
  top_margin: 1.0,
  page_width: 8.27,
  page_height: 11.7,
  left_margin: 1.5,
  right_margin: 1,
  font_width: 0.1,
  font_height: 0.1667,
  line_spacing: 1,
  page_number_top_margin: 0.5,
  dual_max_factor: 0.75,
  title_page: {
    top_start: 3.5,
    left_side: ["notes", "copyright"],
    right_side: ["draft_date", "date", "contact", "contact_info", "revision"],
  },
  settings: {
    chunk: {
      feed: 0.5,
      max: A4_DEFAULT_MAX,
      italic: true,
      color: "#888888",
      padding: 0,
      feed_with_last_section: true,
    },
    section: {
      feed: 1.0,
      max: A4_DEFAULT_MAX,
      color: "#555555",
      level_indent: 0.2,
    },
    scene: {
      feed: 1.5,
      max: A4_DEFAULT_MAX,
    },
    transition: {
      feed: 0,
      max: A4_DEFAULT_MAX,
      align: "right",
    },
    action: {
      feed: 1.5,
      max: A4_DEFAULT_MAX,
    },
    dialogue_character_name: {
      feed: 3.5,
      max: 33,
    },
    dialogue_line_parenthetical: {
      feed: 3,
      max: 26,
    },
    dialogue: {
      feed: 2.5,
      max: 36,
    },
    more: {
      feed: 3.5,
      max: 33,
    },
    note: {
      feed: 1.5,
      max: A4_DEFAULT_MAX,
      color: "#888888",
      italic: true,
    },
  },
};

const USLETTER: PrintProfile = {
  ...JSON.parse(JSON.stringify(A4)),
  paper_size: "letter",
  lines_per_page: 55,
  page_width: 8.5,
  page_height: 11,
  settings: {
    ...JSON.parse(JSON.stringify(A4.settings)),
    chunk: {
      ...A4.settings.chunk,
      max: USLETTER_DEFAULT_MAX,
    },
    section: {
      ...A4.settings.section,
      max: USLETTER_DEFAULT_MAX,
    },
    scene: {
      ...A4.settings.scene,
      max: USLETTER_DEFAULT_MAX,
    },
    transition: {
      ...A4.settings.transition,
      max: USLETTER_DEFAULT_MAX,
    },
    action: {
      ...A4.settings.action,
      max: USLETTER_DEFAULT_MAX,
    },
  },
};

export const PRINT_PROFILES: Record<"a4" | "usletter", PrintProfile> &
  Record<string, PrintProfile> = {
  a4: A4,
  usletter: USLETTER,
};
