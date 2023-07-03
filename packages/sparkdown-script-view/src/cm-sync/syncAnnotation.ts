import { Annotation } from "@codemirror/state";

const syncAnnotation = Annotation.define<boolean>();

export default syncAnnotation;
