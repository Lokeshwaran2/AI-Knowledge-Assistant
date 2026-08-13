import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { formatTimeAgo } from '../utils/dateFormatter';
import ConfirmModal from './ConfirmModal';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const {
    conversations,
    startNewConversation,
    deleteConversation,
    activeConversationId,
  } = useChat();

  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
  }, [isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  const handleNewChat = () => {
    startNewConversation();
    navigate('/chat');
    if (onMobileClose) onMobileClose();
  };

  const handleOpenConversation = (id: string) => {
    navigate(`/chat/${id}`);
    if (onMobileClose) onMobileClose();
  };

  const promptDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingConvId(id);
  };

  const confirmDelete = async () => {
    if (!deletingConvId) return;
    setIsDeleting(true);
    try {
      await deleteConversation(deletingConvId);
    } finally {
      setIsDeleting(false);
      setDeletingConvId(null);
    }
  };

  const deletingConv = conversations.find((c) => c.id === deletingConvId);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={onMobileClose} />
      )}

      {/* Delete Conversation Confirm Modal Wizard */}
      <ConfirmModal
        isOpen={!!deletingConvId}
        title="Delete Conversation"
        message={`Are you sure you want to delete "${deletingConv?.title || 'this conversation'}"? This action cannot be undone.`}
        confirmText="Delete Conversation"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingConvId(null)}
      />

      <aside
        className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${
          mobileOpen ? 'mobile-open' : ''
        }`}
      >
        {/* Header */}
        <div className="sidebar-header">
          {!isCollapsed ? (
            <>
              <div className="sidebar-brand-group" onClick={() => navigate('/dashboard')}>
                <span className="sidebar-logo">🧠</span>
                <span className="sidebar-brand">KnowledgeAI</span>
              </div>
              <button
                className="sidebar-collapse-btn"
                onClick={toggleCollapse}
                title="Minimize Sidebar"
              >
                ◀
              </button>
            </>
          ) : (
            <div className="sidebar-header-collapsed">
              <span className="sidebar-logo" onClick={() => navigate('/dashboard')} title="KnowledgeAI">🧠</span>
              <button
                className="sidebar-collapse-btn"
                onClick={toggleCollapse}
                title="Expand Sidebar"
              >
                ▶
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="sidebar-actions">
          <button
            id="new-chat-btn"
            className="btn-primary sidebar-new-chat"
            onClick={handleNewChat}
            title={isCollapsed ? 'New Chat' : undefined}
          >
            <span className="btn-icon">+</span>
            {!isCollapsed && <span className="btn-text">New Chat</span>}
          </button>

          {isDashboard ? (
            <button
              className="btn-secondary sidebar-nav-btn"
              onClick={() => {
                navigate('/chat');
                if (onMobileClose) onMobileClose();
              }}
              title={isCollapsed ? 'Go to Chat' : undefined}
            >
              <span className="btn-icon">💬</span>
              {!isCollapsed && <span className="btn-text">Go to Chat</span>}
            </button>
          ) : (
            <button
              className="btn-secondary sidebar-nav-btn"
              onClick={() => {
                navigate('/dashboard');
                if (onMobileClose) onMobileClose();
              }}
              title={isCollapsed ? 'Dashboard' : undefined}
            >
              <span className="btn-icon">←</span>
              {!isCollapsed && <span className="btn-text">Dashboard</span>}
            </button>
          )}
        </div>

        {/* Conversation History */}
        <div className="sidebar-section">
          {!isCollapsed && <h3>HISTORY</h3>}
          {conversations.length === 0 ? (
            !isCollapsed && <p className="sidebar-empty">No history yet</p>
          ) : (
            <ul className="conversation-list">
              {conversations.map((c) => {
                const isActive = activeConversationId === c.id;
                const timeAgo = formatTimeAgo(c.last_accessed_at || c.created_at);

                return (
                  <li key={c.id}>
                    <div
                      className={`conversation-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleOpenConversation(c.id)}
                      title={`${c.title} · ${timeAgo}`}
                    >
                      <span className="conv-icon">💬</span>
                      {!isCollapsed && (
                        <div className="conv-details">
                          <span className="conv-title">{c.title}</span>
                          <span className="conv-meta">{timeAgo}</span>
                        </div>
                      )}
                      {!isCollapsed && (
                        <button
                          className="conv-delete-btn"
                          onClick={(e) => promptDelete(e, c.id)}
                          title="Delete Conversation"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          {!isCollapsed ? (
            <>
              <div className="user-profile" title={user?.email}>
                <span className="user-avatar">{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
                <span className="user-email">{user?.email}</span>
              </div>
              <button
                id="sidebar-logout-button"
                onClick={logout}
                className="logout-btn"
                title="Sign Out"
              >
                Sign Out
              </button>
            </>
          ) : (
            <div className="sidebar-footer-collapsed">
              <span className="user-avatar" title={user?.email}>
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
              <button
                onClick={logout}
                className="logout-btn-icon"
                title={`Sign Out (${user?.email})`}
              >
                🚪
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
