import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import "./styles.css";

export function mount(node: ReactNode) {
  createRoot(document.getElementById("root")!).render(node);
}
