import { PrintProfile } from "../types/PrintProfile";

const USLETTER: PrintProfile = {
  paper_size: "letter",
  page_width: 8.5,
  page_height: 11,
  top_margin: 1,
  bottom_margin: 1,
  left_margin: 1.5,
  right_margin: 1,
  font_size: 12,
  color: "#000000",
  line_spacing: 1,
  page_number_top_margin: 0.5,
  page_footer_bottom_margin: 0.5,
  settings: {
    knot: {
      left_margin: 1,
      right_margin: 1,
      color: "#555555",
      level_indent: 0.2,
    },
    stitch: {
      left_margin: 1,
      right_margin: 1,
      color: "#555555",
      level_indent: 0.2,
    },
    scene: {
      left_margin: 1.5,
      right_margin: 1,
    },
    transition: {
      left_margin: 1.5,
      right_margin: 1,
      align: "right",
    },
    action: {
      left_margin: 1.5,
      right_margin: 1,
    },
    dialogue_character: {
      left_margin: 3.7,
      right_margin: 1,
      dual_first_left_margin: 2.75,
      dual_first_right_margin: 4,
      dual_second_left_margin: 5.75,
      dual_second_right_margin: 1,
    },
    dialogue_parenthetical: {
      left_margin: 3.1,
      right_margin: 1,
      dual_first_left_margin: 2.25,
      dual_first_right_margin: 4,
      dual_second_left_margin: 5.25,
      dual_second_right_margin: 1,
    },
    dialogue_content: {
      left_margin: 2.5,
      right_margin: 2,
      dual_first_left_margin: 2,
      dual_first_right_margin: 4,
      dual_second_left_margin: 5,
      dual_second_right_margin: 1,
    },
    dialogue_more: {
      left_margin: 3.7,
      right_margin: 1,
    },
    choice: {
      left_margin: 1.5,
      right_margin: 1,
    },
  },
};

const A4: PrintProfile = {
  ...JSON.parse(JSON.stringify(USLETTER)),
  paper_size: "a4",
  page_width: 8.27,
  page_height: 11.7,
};

export const PRINT_PROFILES: Record<"usletter" | "a4", PrintProfile> &
  Record<string, PrintProfile> = {
  usletter: USLETTER,
  a4: A4,
};
