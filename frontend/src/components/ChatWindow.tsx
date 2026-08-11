import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ErrorBanner from './ErrorBanner';
import { useChat } from '../contexts/ChatContext';

export default function ChatWindow() {
  const { clearError } = useChat();

  return (
    <div className="chat-window">
      <div className="chat-messages-area">
        <MessageList />
      </div>
      <ErrorBanner onClose={clearError} />
      <div className="chat-input-area">
        <ChatInput />
        <p className="chat-hint">Shift+Enter for new line · Enter to send</p>
      </div>
    </div>
  );
}
