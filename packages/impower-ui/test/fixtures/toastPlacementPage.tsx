import { render } from "preact";
import Toast from "../../src/components/toast/Toast";

const [left, width] = location.hash.slice(1).split(",").map(Number);
document.documentElement.style.setProperty("--toast-left", `${left}px`);
document.documentElement.style.setProperty("--toast-width", `${width}px`);

const root = document.body.appendChild(document.createElement("div"));
render(
  <Toast open message="Deleted chapter_3_with_a_long_name.sd" actionLabel="Undo" onAction={() => {}} onDismiss={() => {}} />,
  root,
);
