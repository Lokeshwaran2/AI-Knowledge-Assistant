import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Brain,
  Plus,
  MessageSquare,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Sun,
  Moon,
} from 'lucide-react';
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

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('app_theme') as 'light' | 'dark') || 'light';
  });

  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // On mobile drawer, ensure sidebar is rendered in full expanded mode
  const effectiveCollapsed = isCollapsed && !mobileOpen;

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
  }, [isCollapsed]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Handle escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen && onMobileClose) {
        onMobileClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onMobileClose]);

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
        <div
          className="sidebar-backdrop"
          onClick={onMobileClose}
          aria-hidden="true"
        />
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
        className={`sidebar ${effectiveCollapsed ? 'collapsed' : ''} ${
          mobileOpen ? 'mobile-open' : ''
        }`}
        aria-label="Application Sidebar Navigation"
      >
        {/* Header */}
        <div className="sidebar-header">
          {!effectiveCollapsed ? (
            <>
              <div
                className="sidebar-brand-group"
                onClick={() => navigate('/dashboard')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate('/dashboard')}
              >
                <div className="sidebar-logo-icon">
                  <Brain size={20} />
                </div>
                <span className="sidebar-brand">KnowledgeAI</span>
              </div>
              <div className="sidebar-header-actions">
                <button
                  className="sidebar-theme-btn"
                  onClick={toggleTheme}
                  title={`Switch to ${theme === 'light' ? 'Dark' : 'Emerald Light'} Mode`}
                  aria-label="Toggle Theme"
                >
                  {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                </button>
                <button
                  className="sidebar-collapse-btn"
                  onClick={toggleCollapse}
                  title="Collapse Sidebar"
                  aria-label="Collapse Sidebar"
                >
                  <PanelLeftClose size={18} />
                </button>
              </div>
            </>
          ) : (
            <div className="sidebar-header-collapsed">
              <div
                className="sidebar-logo-icon"
                onClick={() => navigate('/dashboard')}
                title="KnowledgeAI Dashboard"
                role="button"
                tabIndex={0}
              >
                <Brain size={18} />
              </div>
              <button
                className="sidebar-theme-btn"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Emerald Light'} Mode`}
                aria-label="Toggle Theme"
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button
                className="sidebar-collapse-btn"
                onClick={toggleCollapse}
                title="Expand Sidebar"
                aria-label="Expand Sidebar"
              >
                <PanelLeft size={18} />
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
            title={effectiveCollapsed ? 'New Chat' : undefined}
            aria-label="Start New Chat"
          >
            <span className="btn-icon">
              <Plus size={18} />
            </span>
            {!effectiveCollapsed && <span className="btn-text">New Chat</span>}
          </button>

          {isDashboard ? (
            <button
              className="btn-secondary sidebar-nav-btn"
              onClick={() => {
                navigate('/chat');
                if (onMobileClose) onMobileClose();
              }}
              title={effectiveCollapsed ? 'Go to Chat' : undefined}
              aria-label="Navigate to Chat"
            >
              <span className="btn-icon">
                <MessageSquare size={18} />
              </span>
              {!effectiveCollapsed && <span className="btn-text">Go to Chat</span>}
            </button>
          ) : (
            <button
              className="btn-secondary sidebar-nav-btn"
              onClick={() => {
                navigate('/dashboard');
                if (onMobileClose) onMobileClose();
              }}
              title={effectiveCollapsed ? 'Dashboard' : undefined}
              aria-label="Navigate to Dashboard"
            >
              <span className="btn-icon">
                <LayoutDashboard size={18} />
              </span>
              {!effectiveCollapsed && <span className="btn-text">Dashboard</span>}
            </button>
          )}
        </div>

        {/* Conversation History */}
        <div className="sidebar-section">
          {!effectiveCollapsed && <h3>HISTORY</h3>}
          {conversations.length === 0 ? (
            !effectiveCollapsed && <p className="sidebar-empty">No history yet</p>
          ) : (
            <ul className="conversation-list" role="list">
              {conversations.map((c) => {
                const isActive = activeConversationId === c.id;
                const timeAgo = formatTimeAgo(c.last_accessed_at || c.created_at);

                return (
                  <li key={c.id}>
                    <div
                      className={`conversation-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleOpenConversation(c.id)}
                      title={`${c.title} · ${timeAgo}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleOpenConversation(c.id)}
                    >
                      <span className="conv-icon">
                        <MessageSquare size={16} />
                      </span>
                      {!effectiveCollapsed && (
                        <div className="conv-details">
                          <span className="conv-title">{c.title}</span>
                          <span className="conv-meta">{timeAgo}</span>
                        </div>
                      )}
                      {!effectiveCollapsed && (
                        <button
                          className="conv-delete-btn"
                          onClick={(e) => promptDelete(e, c.id)}
                          title="Delete Conversation"
                          aria-label={`Delete conversation ${c.title}`}
                        >
                          <Trash2 size={15} />
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
          {!effectiveCollapsed ? (
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
                aria-label="Sign Out"
              >
                <LogOut size={16} />
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
                aria-label="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

