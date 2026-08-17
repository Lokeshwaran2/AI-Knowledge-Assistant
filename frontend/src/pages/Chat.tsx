import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Menu, ShieldCheck } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import { useChat } from '../contexts/ChatContext';

export default function Chat() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const {
    messages,
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
    if (activeConversationId && !id && messages.length > 0) {
      navigate(`/chat/${activeConversationId}`, { replace: true });
    }
  }, [activeConversationId, id, messages.length, navigate]);

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
              aria-label="Open Navigation Drawer"
            >
              <Menu size={20} />
            </button>
            <h2>AI Knowledge Assistant</h2>
          </div>
          <span className="chat-badge">
            <ShieldCheck size={14} /> Grounded · Context-only answers
          </span>
        </header>

        <ChatWindow />
      </div>
    </div>
  );
}

