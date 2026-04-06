import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "@/App.css";
import "@/frosted-glass.css";
import App from "@/App.tsx";
import { Toaster } from "@/components/ui/sonner";

const preventTextSelection = () => {
  const isInputElement = (element: HTMLElement | null): boolean => {
    if (!element) return false;
    const tagName = element.tagName;
    return (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      element.isContentEditable === true
    );
  };

  const isAllowCopyElement = (element: HTMLElement | null): boolean => {
    if (!element) return false;
    let current: HTMLElement | null = element;
    while (current) {
      if (current.dataset.allowCopy === "true") {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  };

  document.addEventListener("selectstart", (e) => {
    const target = e.target as HTMLElement;
    if (isInputElement(target) || isAllowCopyElement(target)) {
      return;
    }
    e.preventDefault();
  });

  document.addEventListener("copy", (e) => {
    const selection = window.getSelection();
    const activeElement = document.activeElement as HTMLElement;
    const target = e.target as HTMLElement;

    if (
      isInputElement(activeElement) ||
      isAllowCopyElement(target) ||
      (selection &&
        selection.rangeCount > 0 &&
        (isInputElement(selection.anchorNode?.parentElement as HTMLElement) ||
          isAllowCopyElement(
            selection.anchorNode?.parentElement as HTMLElement,
          )))
    ) {
      return;
    }

    e.preventDefault();
    e.clipboardData?.setData("text/plain", "");
  });

  document.addEventListener("cut", (e) => {
    const selection = window.getSelection();
    const activeElement = document.activeElement as HTMLElement;
    const target = e.target as HTMLElement;

    if (
      isInputElement(activeElement) ||
      isAllowCopyElement(target) ||
      (selection &&
        selection.rangeCount > 0 &&
        (isInputElement(selection.anchorNode?.parentElement as HTMLElement) ||
          isAllowCopyElement(
            selection.anchorNode?.parentElement as HTMLElement,
          )))
    ) {
      return;
    }

    e.preventDefault();
    e.clipboardData?.setData("text/plain", "");
  });
};

preventTextSelection();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
);
