import { Component } from "../../../../../../packages/spec-component/src/component";
import spec from "./_scrollable";

export default class Scrollable extends Component(spec) {}

declare global {
  interface HTMLElementTagNameMap {
    "se-scrollable": Scrollable;
  }
}
