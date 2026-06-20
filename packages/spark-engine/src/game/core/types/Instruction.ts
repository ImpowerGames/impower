export interface IInstruction {
  control?: string;
  after?: number;
  over?: number;
  ease?: string;
  wait?: boolean;
}

export interface LoadInstruction extends IInstruction {
  name: string;
}

export interface TextInstruction extends IInstruction {
  text: string;
  style?: {
    position?: string;
    inset?: string;
    text_decoration?: string;
    font_style?: string;
    font_weight?: string;
    text_align?: string;
    white_space?: string;
    background_color?: string;
    display?: string;
    animation_name?: string;
    animation_timing_function?: string;
    animation_iteration_count?: string | number;
    animation_duration?: string | number;
    animation_delay?: string | number;
  };
}

export interface ImageInstruction extends IInstruction {
  control: "show" | "hide" | "animate";
  assets?: string[];
  with?: string;
  style?: {
    position?: string;
    inset?: string;
  };
}

export interface AudioInstruction extends IInstruction {
  control: "play" | "start" | "stop" | "fade" | "queue" | "await";
  assets?: string[];
  now?: boolean;
  loop?: boolean;
  to?: number;
}

export interface LayoutInstruction extends IInstruction {
  control: "open" | "close" | "navigate";
  /** The layout to mount (`open`), tear down (`close`), or navigate TO
   *  (`navigate` — the destination after `to`). May be empty for an incomplete
   *  `[[navigate <screen>]]` (the LSP warns; the runtime no-ops). */
  name: string;
  /** For `navigate` (`[[navigate <screen> to <layout>]]`): the screen to route
   *  within. Closing is scoped to open layouts in this screen; layouts in other
   *  screens (and uncategorized layouts) are left untouched. */
  screen?: string;
  /** The enter/exit animation/transition name (`with` clause). */
  with?: string;
}

export type Instruction =
  | TextInstruction
  | ImageInstruction
  | AudioInstruction
  | LayoutInstruction;
