import { toast } from "react-hot-toast";

export function showDateMoveToast({ message, undoLabel, onUndo, duration = 8000 }) {
  return toast.success((item) => (
    <span className="toast-undo">
      <span>{message}</span>
      <button
        type="button"
        onClick={() => {
          toast.dismiss(item.id);
          onUndo();
        }}
      >
        {undoLabel}
      </button>
    </span>
  ), { duration });
}
