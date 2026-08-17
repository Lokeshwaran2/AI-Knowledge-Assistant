import { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';

interface Props {
  onClose: () => void;
}

export default function ErrorBanner({ onClose }: Props) {
  const { error, clearError } = useChat();

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError, onClose]);

  if (!error) return null;

  return (
    <div className="error-banner" role="alert" aria-live="assertive">
      <AlertCircle size={16} />
      <span>{error}</span>
      <button
        onClick={() => {
          clearError();
          onClose();
        }}
        className="error-close"
        aria-label="Dismiss error"
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

