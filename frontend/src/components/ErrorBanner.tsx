import { useEffect } from 'react';
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
    <div className="error-banner" role="alert">
      <span>⚠️ {error}</span>
      <button onClick={() => { clearError(); onClose(); }} className="error-close">✕</button>
    </div>
  );
}
