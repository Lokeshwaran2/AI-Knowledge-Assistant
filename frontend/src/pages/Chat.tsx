import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import { useChat } from '../contexts/ChatContext';

export default function Chat() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const {
    activeConversationId,
    loadConversation,
    startNewConversation,
    fetchConversations,
  } = useChat();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Auto fetch conversation list on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Sync URL route parameter :id with active conversation state
  useEffect(() => {
    if (id) {
      if (id !== activeConversationId) {
        loadConversation(id);
      }
    } else {
      if (activeConversationId) {
        startNewConversation();
      }
    }
  }, [id]);

  // When a new conversation gets created by sending a message, update URL to /chat/:newId
  useEffect(() => {
    if (activeConversationId && !id) {
      navigate(`/chat/${activeConversationId}`, { replace: true });
    }
  }, [activeConversationId, id, navigate]);

  return (
    <div className="chat-page">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Chat area */}
      <div className="chat-main">
        <header className="chat-header">
          <div className="chat-header-left">
            <button
              className="mobile-hamburger-btn"
              onClick={() => setMobileSidebarOpen(true)}
              title="Open Menu"
            >
              ☰
            </button>
            <h2>AI Knowledge Assistant</h2>
          </div>
          <span className="chat-badge">🔒 Grounded · Context-only answers</span>
        </header>

        <ChatWindow />
      </div>
    </div>
  );
}
