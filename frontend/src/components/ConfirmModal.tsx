import { useEffect } from 'react';
import { Trash2, AlertTriangle, AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => !isLoading && onCancel()}
      aria-hidden="true"
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-message"
      >
        <div className={`modal-icon-badge ${variant}`}>
          {variant === 'danger' ? (
            <Trash2 size={24} />
          ) : variant === 'warning' ? (
            <AlertTriangle size={24} />
          ) : (
            <AlertCircle size={24} />
          )}
        </div>

        <h3 id="modal-title" className="modal-title">
          {title}
        </h3>
        <p id="modal-message" className="modal-message">
          {message}
        </p>

        <div className="modal-actions">
          <button
            className="btn-secondary"
            onClick={onCancel}
            disabled={isLoading}
            type="button"
          >
            {cancelText}
          </button>
          <button
            className={`btn-modal-confirm ${variant}`}
            onClick={onConfirm}
            disabled={isLoading}
            type="button"
          >
            {isLoading ? (
              <span className="btn-loading">
                <span className="spinner-sm"></span> Processing…
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

