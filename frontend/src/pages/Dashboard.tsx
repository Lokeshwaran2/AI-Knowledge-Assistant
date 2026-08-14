import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useChat } from '../contexts/ChatContext';
import Sidebar from '../components/Sidebar';
import ConfirmModal from '../components/ConfirmModal';
import api from '../services/api';

interface Document {
  id: string;
  name: string;
  status: 'processing' | 'ready' | 'failed';
  chunk_count: number;
  file_size_bytes: number;
  created_at: string;
}

export default function Dashboard() {
  const { fetchConversations } = useChat();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const wasProcessingRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Modal wizard state for document deletion
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'single' | 'bulk';
    id?: string;
    name?: string;
  } | null>(null);

  useEffect(() => {
    fetchDocuments();
    fetchConversations();
  }, [fetchConversations]);

  // Automatic Polling & Status Transition: when processing completes, update upload message
  useEffect(() => {
    const hasProcessing = documents.some((doc) => doc.status === 'processing');

    if (hasProcessing) {
      wasProcessingRef.current = true;
      const interval = setInterval(() => {
        fetchDocuments();
      }, 5000);

      return () => clearInterval(interval);
    } else if (wasProcessingRef.current) {
      wasProcessingRef.current = false;
      setUploadMessage('🎉 Processing complete! Document ready for chat.');
      const timer = setTimeout(() => {
        setUploadMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [documents]);

  const fetchDocuments = async () => {
    const token = localStorage.getItem('token');
    if (!token || isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const { data } = await api.get('/documents');
      setDocuments(data.documents || []);
    } catch {
      // silent fail
    } finally {
      isFetchingRef.current = false;
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadMessage('Uploading document...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      wasProcessingRef.current = true;
      setUploadMessage('⏳ Document uploaded. Ingestion running in background…');
      await fetchDocuments();
    } catch (err: unknown) {
      wasProcessingRef.current = false;
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Upload failed.';
      setUploadMessage(`❌ ${msg}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const promptDeleteSingle = (id: string, name: string) => {
    setDeleteTarget({ type: 'single', id, name });
  };

  const promptDeleteBulk = () => {
    if (selectedDocIds.length > 0) {
      setDeleteTarget({ type: 'bulk' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'single' && deleteTarget.id) {
        await api.delete(`/documents/${deleteTarget.id}`);
        setSelectedDocIds((prev) => prev.filter((docId) => docId !== deleteTarget.id));
        setUploadMessage(`✅ Document "${deleteTarget.name}" deleted.`);
      } else if (deleteTarget.type === 'bulk') {
        const count = selectedDocIds.length;
        await api.post('/documents/bulk-delete', { documentIds: selectedDocIds });
        setSelectedDocIds([]);
        setUploadMessage(`✅ ${count} document(s) deleted successfully.`);
      }
      await fetchDocuments();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to delete document(s).';
      setUploadMessage(`❌ ${msg}`);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedDocIds.length === documents.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(documents.map((doc) => doc.id));
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const allSelected = documents.length > 0 && selectedDocIds.length === documents.length;

  return (
    <div className="dashboard-page">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main content */}
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-left">
            <button
              className="mobile-hamburger-btn"
              onClick={() => setMobileSidebarOpen(true)}
              title="Open Menu"
            >
              ☰
            </button>
            <div>
              <h1>Knowledge Base</h1>
              <p className="dashboard-subtitle">Upload documents, then chat with your data.</p>
            </div>
          </div>
        </header>

        {/* Upload section */}
        <section className="upload-section">
          <div className="upload-card">
            <div className="upload-icon">📄</div>
            <h2>Upload Document</h2>
            <p>Supported: PDF, TXT, MD · Max 50MB</p>

            <input
              ref={fileInputRef}
              id="file-upload-input"
              type="file"
              accept=".pdf,.txt,.md"
              onClick={(e) => {
                (e.target as HTMLInputElement).value = '';
              }}
              onChange={handleFileChange}
              className="file-input-hidden"
            />
            <button
              id="upload-button"
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <span className="btn-loading">
                  <span className="spinner-sm"></span> Uploading…
                </span>
              ) : (
                'Choose File'
              )}
            </button>

            {uploadMessage && (
              <p className={`upload-message ${uploadMessage.startsWith('❌') ? 'error' : 'success'}`}>
                {uploadMessage}
              </p>
            )}
          </div>
        </section>

        {/* Documents list */}
        <section className="documents-section">
          <div className="documents-header">
            <div className="documents-title-group">
              <h2>Your Documents ({documents.length})</h2>
              {documents.length > 0 && (
                <label className="select-all-label">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                  <span>Select All</span>
                </label>
              )}
            </div>

            {selectedDocIds.length > 0 && (
              <button
                className="btn-danger-bulk"
                onClick={promptDeleteBulk}
                disabled={isDeleting}
              >
                🗑️ Delete Selected ({selectedDocIds.length})
              </button>
            )}
          </div>

          {documents.length === 0 ? (
            <div className="documents-empty">
              <p>No documents yet. Upload one to get started.</p>
            </div>
          ) : (
            <div className="documents-grid">
              {documents.map((doc) => {
                const isSelected = selectedDocIds.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    className={`document-card ${doc.status} ${isSelected ? 'selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="doc-checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectDoc(doc.id)}
                    />
                    <div className="doc-icon">
                      {doc.status === 'ready' ? (
                        '✅'
                      ) : doc.status === 'failed' ? (
                        '❌'
                      ) : (
                        <span className="spinner-sm amber"></span>
                      )}
                    </div>
                    <div className="doc-info">
                      <span className="doc-name" title={doc.name}>
                        {doc.name}
                      </span>
                      <span className="doc-meta">
                        {formatBytes(doc.file_size_bytes)} ·{' '}
                        {doc.status === 'ready' ? (
                          `${doc.chunk_count} chunks`
                        ) : doc.status === 'processing' ? (
                          <span className="status-badge processing">Processing…</span>
                        ) : (
                          <span className="status-badge failed">Failed</span>
                        )}
                      </span>
                    </div>
                    <div className="doc-actions">
                      {doc.status === 'failed' && (
                        <button
                          className="doc-retry-btn"
                          title="Retry uploading file"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          🔄 Retry
                        </button>
                      )}
                      <button
                        className="doc-delete-btn"
                        title="Delete Document"
                        onClick={() => promptDeleteSingle(doc.id, doc.name)}
                        disabled={isDeleting}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Confirm Modal Wizard */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={
          deleteTarget?.type === 'single'
            ? 'Delete Document'
            : `Delete ${selectedDocIds.length} Documents`
        }
        message={
          deleteTarget?.type === 'single'
            ? `Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`
            : `Are you sure you want to delete ${selectedDocIds.length} selected document(s)? This action cannot be undone.`
        }
        confirmText={
          deleteTarget?.type === 'single'
            ? 'Delete Document'
            : `Delete ${selectedDocIds.length} Documents`
        }
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

