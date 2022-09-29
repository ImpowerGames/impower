import { PrintProfile } from "../types/PrintProfile";

const A4_DEFAULT_MAX = 58;
const US_DEFAULT_MAX = 61;

const a4: PrintProfile = {
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
  scene: {
    feed: 1.5,
    max: A4_DEFAULT_MAX,
  },
  action: {
    feed: 1.5,
    max: A4_DEFAULT_MAX,
  },
  shot: {
    feed: 1.5,
    max: A4_DEFAULT_MAX,
  },
  character: {
    feed: 3.5,
    max: 33,
  },
  more: {
    feed: 3.5,
    max: 33,
  },
  parenthetical: {
    feed: 3,
    max: 26,
  },
  dialogue: {
    feed: 2.5,
    max: 36,
  },
  transition: {
    feed: 0,
    max: A4_DEFAULT_MAX,
  },
  centered: {
    feed: 1.5,
    style: "center",
    max: A4_DEFAULT_MAX,
  },
  synopsis: {
    feed: 0.5,
    max: A4_DEFAULT_MAX,
    italic: true,
    color: "#888888",
    padding: 0,
    feed_with_last_section: true,
  },
  section: {
    feed: 0.5,
    max: A4_DEFAULT_MAX,
    color: "#555555",
    level_indent: 0.2,
  },
  note: {
    feed: 1.5,
    max: A4_DEFAULT_MAX,
    color: "#888888",
    italic: true,
  },
};

const usletter: PrintProfile = {
  ...JSON.parse(JSON.stringify(a4)),
  paper_size: "letter",
  lines_per_page: 55,
  page_width: 8.5,
  page_height: 11,
  scene: {
    ...a4.scene,
    max: US_DEFAULT_MAX,
  },
  action: {
    ...a4.action,
    max: US_DEFAULT_MAX,
  },
  shot: {
    ...a4.shot,
    max: US_DEFAULT_MAX,
  },
  transition: {
    ...a4.transition,
    max: US_DEFAULT_MAX,
  },
  section: {
    ...a4.section,
    max: US_DEFAULT_MAX,
  },
  synopsis: {
    ...a4.synopsis,
    max: US_DEFAULT_MAX,
  },
};

export const printProfiles: { [key: string]: PrintProfile } = {
  a4,
  usletter,
};
