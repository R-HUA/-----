import type { ReactNode } from "react";

export function ConfirmButton({ children, onConfirm, className }: { children: ReactNode; onConfirm: () => void; className?: string }) {
  return (
    <button
      className={className}
      onClick={() => {
        if (window.confirm("Confirm this action?")) {
          onConfirm();
        }
      }}
    >
      {children}
    </button>
  );
}
