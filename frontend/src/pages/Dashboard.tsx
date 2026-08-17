import { useState, useEffect, useRef, type ChangeEvent, type DragEvent } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  Trash2,
  RotateCw,
  Menu,
  FilePlus,
  Layers,
} from 'lucide-react';
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
  const [isDraggingOver, setIsDraggingOver] = useState(false);
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

  // Real-Time SSE Ingestion Progress Listener
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const sseUrl = `${baseURL}/documents/events?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener('progress', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.status === 'processing') {
          setUploadMessage(`⏳ [${payload.progress}%] ${payload.message}`);
        } else if (payload.status === 'ready') {
          setUploadMessage('🎉 Processing complete! Document ready for chat.');
          fetchDocuments();
          setTimeout(() => setUploadMessage(''), 5000);
        } else if (payload.status === 'failed') {
          setUploadMessage(`❌ ${payload.message}`);
          fetchDocuments();
        }
      } catch {
        // silent parse error
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  // Automatic Polling Fallback: when processing completes, update upload message
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

  const uploadFile = async (file: File) => {
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

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
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
              aria-label="Open Navigation Drawer"
            >
              <Menu size={20} />
            </button>
            <div>
              <span className="mono-label">WORKSPACE / INGESTION</span>
              <h1>Knowledge Base</h1>
              <p className="dashboard-subtitle">Upload documents, then chat with your data in real-time.</p>
            </div>
          </div>
        </header>

        {/* Upload section */}
        <section className="upload-section">
          <div
            className={`upload-card ${isDraggingOver ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="upload-card-header">
              <div className="window-header-dots">
                <span className="window-dot window-dot-red" />
                <span className="window-dot window-dot-yellow" />
                <span className="window-dot window-dot-green" />
              </div>
              <span className="mono-label">INGESTION PIPELINE</span>
            </div>
            <div className="upload-card-body">
              <div className="upload-icon-badge">
                <UploadCloud size={26} />
              </div>
              <h2>Upload Document</h2>
              <p>Drag and drop your file here, or click to browse (PDF, TXT, MD · Max 50MB)</p>

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
                className="btn-pill"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <span className="btn-loading">
                    <span className="spinner-sm"></span> Uploading…
                  </span>
                ) : (
                  <>
                    <FilePlus size={18} />
                    <span>Choose File</span>
                  </>
                )}
              </button>

              {uploadMessage && (
                <p
                  className={`upload-message ${
                    uploadMessage.startsWith('❌') ? 'error' : 'success'
                  }`}
                  role="status"
                >
                  {uploadMessage}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Documents list */}
        <section className="documents-section">
          <div className="documents-header">
            <div className="documents-title-group">
              <span className="mono-label">STORAGE</span>
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
                aria-label={`Delete ${selectedDocIds.length} selected documents`}
              >
                <Trash2 size={15} />
                <span>Delete Selected ({selectedDocIds.length})</span>
              </button>
            )}
          </div>

          {documents.length === 0 ? (
            <div className="documents-empty">
              <Layers size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p>No documents yet. Upload one to get started.</p>
            </div>
          ) : (
            <div className="documents-grid">
              {documents.map((doc) => {
                const isSelected = selectedDocIds.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    className={`document-card ${doc.status} ${
                      isSelected ? 'selected' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="doc-checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectDoc(doc.id)}
                      aria-label={`Select document ${doc.name}`}
                    />
                    <div className="doc-icon">
                      {doc.status === 'ready' ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                      ) : doc.status === 'failed' ? (
                        <XCircle size={20} style={{ color: 'var(--error)' }} />
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
                          aria-label="Retry upload"
                        >
                          <RotateCw size={15} />
                        </button>
                      )}
                      <button
                        className="doc-delete-btn"
                        title="Delete Document"
                        onClick={() => promptDeleteSingle(doc.id, doc.name)}
                        disabled={isDeleting}
                        aria-label={`Delete ${doc.name}`}
                      >
                        <Trash2 size={15} />
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


