import { useRef } from "react";

// A non-button combobox does not implicitly submit a form on Enter.
// Forward that key to the native form submit path without cancelling the event.
export default function useSelectKeyboard({ open, disabled = false, onOpen, onClose }) {
  const triggerRef = useRef(null);

  const closeAndFocusTrigger = () => {
    onClose();
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event) => {
    if (disabled || event.target !== event.currentTarget) return;

    if (event.key === "Enter" && !open) {
      const form = event.currentTarget.closest("form");
      const submit = form?.querySelector('button[type="submit"]:not(:disabled), input[type="submit"]:not(:disabled)');
      if (submit) form.requestSubmit(submit);
      return;
    }

    if (event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) onOpen();
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocusTrigger();
    }
  };

  return { triggerRef, closeAndFocusTrigger, handleTriggerKeyDown };
}
