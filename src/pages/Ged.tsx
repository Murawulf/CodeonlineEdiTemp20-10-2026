import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import mammoth from 'mammoth/mammoth.browser';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useNotifications } from '../contexts/NotificationContext';
import { useLocalApiUrl } from '../contexts/SettingsContext';
import type { Compte } from '../types/compte';

type GedItem = {
  id_ged: number;
  filename: string;
  original_name: string;
  path: string;
  mimetype?: string;
  size?: number;
  category?: string;
  tags?: string;
  uploaded_by?: number;
  uploaded_by_email?: string;
  created_at?: string;
  modified_at?: string | null;
  deleted_at?: string | null;
  description?: string | null;
};

type GedLog = {
  id_log: number;
  id_ged: number;
  action: string;
  details?: string | null;
  performed_by?: number | null;
  performed_at?: string;
  performer_email?: string | null;
};

interface GedProps {
  compte: Compte | null;
}

interface Folder {
  id: string;
  id_folder?: number;
  name: string;
  parent_id?: number | null;
  children: Folder[];
  files: GedItem[];
  uploaded_by?: number;
  created_at?: string;
  modified_at?: string;
  deleted_at?: string | null;
}

const B_READABLE = (bytes?: number) => {
  if (!bytes) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let u = 0;
  let b = bytes;
  while (b >= 1024 && u < units.length - 1) {
    b /= 1024;
    u++;
  }
  return `${b.toFixed(b < 10 ? 2 : 1)} ${units[u]}`;
};

export default function Ged({ compte }: GedProps) {
  const { addNotification } = useNotifications();
  const API_BASE = useLocalApiUrl();
  const API = {
    list: `${API_BASE}/api/ged/list`,
    folders: `${API_BASE}/api/ged/folders?include_deleted=true`,
    upload: `${API_BASE}/api/ged/upload`,
    item: (id: number | string) => `${API_BASE}/api/ged/${id}`,
    download: (id: number | string) => `${API_BASE}/api/ged/${id}/download`,
    restore: (id: number | string) => `${API_BASE}/api/ged/${id}/restore`,
    hardDelete: (id: number | string) => `${API_BASE}/api/ged/${id}/hard`,
    logs: (id: number | string) => `${API_BASE}/api/ged/${id}/logs`,
    createFolder: `${API_BASE}/api/ged/folders`,
    addToFolder: (id: string) => `${API_BASE}/api/ged/folders/${id}/files`,
    removeFromFolder: (id: string, gedId: number) => `${API_BASE}/api/ged/folders/${id}/files/${gedId}`,
    folderSoftDelete: (id: string) => `${API_BASE}/api/ged/folders/${id}`,
    folderRestore: (id: string) => `${API_BASE}/api/ged/folders/${id}/restore`,
    folderHardDelete: (id: string) => `${API_BASE}/api/ged/folders/${id}/hard`,
  };
  const [items, setItems] = useState<GedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [filetypeFilter, setFiletypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'DESC' | 'ASC'>('DESC');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GedItem | null>(null);
  const [metaCategory, setMetaCategory] = useState('');
  const [metaTags, setMetaTags] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [currentLogs, setCurrentLogs] = useState<GedLog[]>([]);
  const [logsItem, setLogsItem] = useState<GedItem | null>(null);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadMeta, setUploadMeta] = useState({ category: '', tags: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const uploadAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (compte?.id_compte) {
      fetchList();
      fetchFolders();
    }
  }, [compte, page, search, categoryFilter, filetypeFilter, sortBy, sortDir]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [previewUrl, pdfUrl, videoUrl]);

  useEffect(() => {
    const handleDragEvents = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragOver = (e: DragEvent) => {
      setIsDragging(true);
      handleDragEvents(e);
    };

    const handleDragLeave = (e: DragEvent) => {
      setIsDragging(false);
      handleDragEvents(e);
    };

    const handleDrop = (e: DragEvent) => {
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (fileRef.current) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileRef.current.files = dataTransfer.files;
          handleFileChange({ target: { files: dataTransfer.files } } as any);
        }
      }
      handleDragEvents(e);
    };

    const area = uploadAreaRef.current;
    if (area) {
      area.addEventListener('dragover', handleDragOver);
      area.addEventListener('dragleave', handleDragLeave);
      area.addEventListener('drop', handleDrop);
    }

    return () => {
      if (area) {
        area.removeEventListener('dragover', handleDragOver);
        area.removeEventListener('dragleave', handleDragLeave);
        area.removeEventListener('drop', handleDrop);
      }
    };
  }, []);

  async function fetchFolders() {
    if (!compte?.id_entite) {
      addNotification('Vous devez être connecté pour charger les dossiers.', 'error');
      return;
    }
    try {
      const qs = new URLSearchParams({ id_entite: String(compte.id_entite), include_deleted: 'true' });
      const res = await fetch(`${API.folders}&${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      const { folders } = await res.json();
      setFolders(folders || []);
    } catch (err) {
      console.error('Erreur de récupération des dossiers:', err);
      addNotification(`Erreur lors du chargement des dossiers: ${(err as Error).message}`, 'error');
    }
  }
async function loadFileForPreview(item: GedItem) {
  if (!compte?.id_compte) {
    addNotification(`Vous devez être connecté pour charger "${item.original_name}".`, 'error');
    return;
  }
  setPreviewLoading(true);
  try {
    // If the file is directly accessible via /ged/
    const directUrl = `${API_BASE}/ged/${item.filename}`;

    if (item.mimetype === 'application/pdf') {
      const qs = new URLSearchParams({ id_compte: String(compte.id_compte) });
      const res = await fetch(`${API.download(item.id_ged)}?${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/pdf' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Échec du chargement du PDF: ${res.statusText}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setDocHtml(null);
      setVideoUrl(null);
      setPreviewUrl(null);
    } else if (item.mimetype?.includes('msword') || item.mimetype?.includes('openxmlformats-officedocument.word')) {
      const qs = new URLSearchParams({ id_compte: String(compte.id_compte) });
      const res = await fetch(`${API.download(item.id_ged)}?${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/octet-stream' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Échec du chargement du document Word`);
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer }, {
        convertImage: mammoth.images.inline(element =>
          element.read("base64").then(imageBuffer => ({
            src: "data:" + element.contentType + ";base64," + imageBuffer
          }))
        )
      });
      setDocHtml(result.value);
      setPdfUrl(null);
      setVideoUrl(null);
      setPreviewUrl(null);
    } else if (item.mimetype?.startsWith('image/')) {
      // Use direct served URL instead of blob
      setPreviewUrl(directUrl);
      setPdfUrl(null);
      setDocHtml(null);
      setVideoUrl(null);
    } else if (item.mimetype?.startsWith('video/')) {
      // Use direct served URL instead of blob
      setVideoUrl(directUrl);
      setPreviewUrl(null);
      setPdfUrl(null);
      setDocHtml(null);
    } else {
      setPreviewUrl(null);
      setPdfUrl(null);
      setDocHtml(null);
      setVideoUrl(null);
    }
  } catch (err) {
    console.error('Erreur de chargement de l’aperçu:', err);
    addNotification(`Erreur lors du chargement de "${item.original_name}": ${(err as Error).message}`, 'error');
  } finally {
    setPreviewLoading(false);
  }
}
async function fetchList() {
  if (!compte?.id_entite) {
    addNotification('Vous devez être connecté pour lister les documents.', 'error');
    return;
  }
  setLoading(true);
  try {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('perPage', String(perPage));
    if (search) qs.set('search', search);
    if (categoryFilter) qs.set('category', categoryFilter);
    if (filetypeFilter) qs.set('filetype', filetypeFilter);
    qs.set('sort', sortBy);
    qs.set('dir', sortDir);
    qs.set('id_entite', String(compte.id_entite));
    qs.set('exclude_folders', 'true');

    const res = await fetch(`${API.list}?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Erreur ${res.status}: ${errorText}`);
    }

    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new Error('Réponse du serveur non-JSON');
    }

    const j = await res.json();

    // ✅ Handle both possible formats (array or object)
    setItems(Array.isArray(j) ? j : j.items || []);
    setTotal(Array.isArray(j) ? j.length : j.total || 0);
  } catch (err) {
    console.error('Erreur de récupération:', err);
    addNotification(`Erreur lors du chargement des documents: ${(err as Error).message}`, 'error');
  } finally {
    setLoading(false);
  }
}


  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!compte?.id_compte) {
      addNotification('Vous devez être connecté pour charger des fichiers.', 'error');
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (!file) {
      addNotification('Veuillez sélectionner un fichier à charger.', 'error');
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', uploadMeta.category);
    formData.append('tags', uploadMeta.tags);
    formData.append('description', uploadMeta.description);
    formData.append('id_compte', String(compte.id_compte));

    try {
      const res = await fetch(API.upload, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      await res.json();
      addNotification(`Fichier "${file.name}" chargé avec succès.`, 'success');
      if (fileRef.current) fileRef.current.value = '';
      setUploadMeta({ category: '', tags: '', description: '' });
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPage(1);
      fetchList();
    } catch (err) {
      console.error('Erreur de chargement:', err);
      addNotification(`Erreur lors du chargement de "${file.name}": ${(err as Error).message}`, 'error');
    } finally {
      setIsUploading(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const resetUpload = () => {
    if (fileRef.current) fileRef.current.value = '';
    setUploadMeta({ category: '', tags: '', description: '' });
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  async function viewItem(item: GedItem) {
    if (!compte?.id_compte) {
      addNotification(`Vous devez être connecté pour voir "${item.original_name}".`, 'error');
      return;
    }
    setSelected(item);
    setMetaCategory(item.category || '');
    setMetaTags(item.tags || '');
    setMetaDescription(item.description || '');
    setPreviewUrl(null);
    setPdfUrl(null);
    setDocHtml(null);
    setVideoUrl(null);
    await loadFileForPreview(item);
  }

  function getPreviewUrl(item: GedItem) {
    return item.path || `/ged/${item.filename}`;
  }

  async function downloadItem(item: GedItem) {
    if (!compte?.id_compte) {
      addNotification(`Vous devez être connecté pour télécharger "${item.original_name}".`, 'error');
      return;
    }

    try {
      const qs = new URLSearchParams({ id_compte: String(compte.id_compte) });
      const res = await fetch(`${API.download(item.id_ged)}?${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/octet-stream' },
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.original_name || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addNotification(`Fichier "${item.original_name}" téléchargé avec succès.`, 'success');
    } catch (err) {
      console.error('Erreur de téléchargement:', err);
      addNotification(`Erreur lors du téléchargement de "${item.original_name}": ${(err as Error).message}`, 'error');
    }
  }

  async function fetchLogs(item: GedItem) {
    if (!compte?.id_compte) {
      addNotification(`Vous devez être connecté pour voir l’historique de "${item.original_name}".`, 'error');
      return;
    }
    setLogsLoading(true);
    setLogsItem(item);
    try {
      const qs = new URLSearchParams({ id_compte: String(compte.id_compte) });
      const res = await fetch(`${API.logs(item.id_ged)}?${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      const j = await res.json();
      setCurrentLogs(j.logs || []);
      setLogsModalOpen(true);
    } catch (err) {
      console.error('Erreur de récupération des logs:', err);
      addNotification(`Erreur lors du chargement de l’historique de "${item.original_name}": ${(err as Error).message}`, 'error');
    } finally {
      setLogsLoading(false);
    }
  }

  async function softDelete(item: GedItem) {
    if (!compte?.id_compte) {
      addNotification(`Vous devez être connecté pour supprimer "${item.original_name}".`, 'error');
      return;
    }
    if (!confirm(`Supprimer "${item.original_name}" de manière réversible ? Il peut être restauré ultérieurement.`)) return;

    try {
      const res = await fetch(API.item(item.id_ged), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compte.id_compte }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      await res.json();
      addNotification(`"${item.original_name}" supprimé avec succès.`, 'success');
      fetchList();
      setFolders(prev => {
        const newFolders = JSON.parse(JSON.stringify(prev));
        function removeFromTree(folders: Folder[]) {
          folders.forEach(folder => {
            folder.files = folder.files.filter(f => f.id_ged !== item.id_ged);
            removeFromTree(folder.children);
          });
        }
        removeFromTree(newFolders);
        return newFolders;
      });
    } catch (err) {
      console.error('Erreur de suppression:', err);
      addNotification(`Erreur lors de la suppression de "${item.original_name}": ${(err as Error).message}`, 'error');
    }
  }

  async function restore(item: GedItem) {
    if (!compte?.id_compte) {
      addNotification(`Vous devez être connecté pour restaurer "${item.original_name}".`, 'error');
      return;
    }

    try {
      const res = await fetch(API.restore(item.id_ged), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compte.id_compte }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      await res.json();
      addNotification(`"${item.original_name}" restauré avec succès.`, 'success');
      fetchList();
    } catch (err) {
      console.error('Erreur de restauration:', err);
      addNotification(`Erreur lors de la restauration de "${item.original_name}": ${(err as Error).message}`, 'error');
    }
  }

  async function hardDelete(item: GedItem) {
    if (!compte?.id_compte) {
      addNotification(`Vous devez être connecté pour supprimer définitivement "${item.original_name}".`, 'error');
      return;
    }
    if (!confirm(`Supprimer définitivement "${item.original_name}" du disque et de la base de données ? Cette action est irréversible.`)) {
      return;
    }

    try {
      const res = await fetch(API.hardDelete(item.id_ged), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compte.id_compte }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      await res.json();
      addNotification(`"${item.original_name}" supprimé définitivement.`, 'success');
      fetchList();
      setFolders(prev => {
        const newFolders = JSON.parse(JSON.stringify(prev));
        function removeFromTree(folders: Folder[]) {
          folders.forEach(folder => {
            folder.files = folder.files.filter(f => f.id_ged !== item.id_ged);
            removeFromTree(folder.children);
          });
        }
        removeFromTree(newFolders);
        return newFolders;
      });
    } catch (err) {
      console.error('Erreur de suppression définitive:', err);
      addNotification(`Erreur lors de la suppression définitive de "${item.original_name}": ${(err as Error).message}`, 'error');
    }
  }

  async function saveMetadata(item: GedItem, updates: { category?: string; tags?: string; description?: string }) {
    if (!compte?.id_compte) {
      addNotification(`Vous devez être connecté pour modifier les métadonnées de "${item.original_name}".`, 'error');
      return;
    }

    try {
      const res = await fetch(API.item(item.id_ged), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...updates, id_compte: compte.id_compte }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      await res.json();
      addNotification(`Métadonnées de "${item.original_name}" enregistrées avec succès.`, 'success');
      fetchList();
    } catch (err) {
      console.error('Erreur d’enregistrement:', err);
      addNotification(`Erreur lors de l’enregistrement des métadonnées de "${item.original_name}": ${(err as Error).message}`, 'error');
    }
  }

  async function softDeleteFolder(folderId: string) {
    if (!compte?.id_compte) {
      addNotification('Vous devez être connecté pour supprimer des dossiers.', 'error');
      return;
    }
    const folder = findFolder(folders, folderId);
    if (!folder) {
      addNotification('Dossier introuvable.', 'error');
      return;
    }
    if (!confirm(`Supprimer le dossier "${folder.name}" de manière réversible ? Il peut être restauré ultérieurement.`)) return;

    try {
      const res = await fetch(API.folderSoftDelete(folderId), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compte.id_compte }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      await res.json();
      addNotification(`Dossier "${folder.name}" supprimé avec succès.`, 'success');
      fetchFolders();
      fetchList();
    } catch (err) {
      console.error('Erreur de suppression du dossier:', err);
      addNotification(`Erreur lors de la suppression du dossier "${folder.name}": ${(err as Error).message}`, 'error');
    }
  }

  async function restoreFolder(folderId: string) {
    if (!compte?.id_compte) {
      addNotification('Vous devez être connecté pour restaurer des dossiers.', 'error');
      return;
    }
    const folder = findFolder(folders, folderId);
    if (!folder) {
      addNotification('Dossier introuvable.', 'error');
      return;
    }

    try {
      const res = await fetch(API.folderRestore(folderId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compte.id_compte }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      await res.json();
      addNotification(`Dossier "${folder.name}" restauré avec succès.`, 'success');
      fetchFolders();
      fetchList();
    } catch (err) {
      console.error('Erreur de restauration du dossier:', err);
      addNotification(`Erreur lors de la restauration du dossier "${folder.name}": ${(err as Error).message}`, 'error');
    }
  }

  async function hardDeleteFolder(folderId: string) {
    if (!compte?.id_compte) {
      addNotification('Vous devez être connecté pour supprimer définitivement des dossiers.', 'error');
      return;
    }
    const folder = findFolder(folders, folderId);
    if (!folder) {
      addNotification('Dossier introuvable.', 'error');
      return;
    }
    if (!confirm(`Supprimer définitivement le dossier "${folder.name}" et tout son contenu ? Cette action est irréversible.`)) {
      return;
    }

    try {
      const res = await fetch(API.folderHardDelete(folderId), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compte.id_compte }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      await res.json();
      addNotification(`Dossier "${folder.name}" supprimé définitivement.`, 'success');
      fetchFolders();
      fetchList();
    } catch (err) {
      console.error('Erreur de suppression définitive du dossier:', err);
      addNotification(`Erreur lors de la suppression définitive du dossier "${folder.name}": ${(err as Error).message}`, 'error');
    }
  }

  async function createFolder(parentId?: string) {
    if (!compte?.id_compte) {
      addNotification('Vous devez être connecté pour créer un dossier.', 'error');
      return;
    }
    const name = prompt('Nom du dossier');
    if (!name || name.trim().length === 0) {
      addNotification('Le nom du dossier est requis.', 'error');
      return;
    }

    try {
      const body = JSON.stringify({
        name: name.trim(),
        parent_id: parentId ? parseInt(parentId) : null,
        id_compte: compte.id_compte,
      });

      const res = await fetch(API.createFolder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const newF = await res.json();
      const newFolder: Folder = {
        id: newF.id_folder.toString(),
        id_folder: newF.id_folder,
        parent_id: newF.parent_id,
        name: newF.name,
        children: [],
        files: [],
        uploaded_by: compte.id_compte,
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
        deleted_at: null,
      };

      setFolders((prev) => {
        const newFolders = JSON.parse(JSON.stringify(prev));
        if (parentId) {
          const parent = findFolder(newFolders, parentId);
          if (parent) {
            parent.children.push(newFolder);
            parent.children.sort((a, b) => a.name.localeCompare(b.name));
          }
        } else {
          newFolders.push(newFolder);
          newFolders.sort((a, b) => a.name.localeCompare(b.name));
        }
        return newFolders;
      });

      setOpenFolders((prev) => new Set(prev).add(newFolder.id));
      addNotification(`Dossier "${newFolder.name}" créé avec succès.`, 'success');
    } catch (err) {
      console.error('Erreur lors de la création du dossier:', err);
      addNotification(`Erreur lors de la création du dossier: ${(err as Error).message}`, 'error');
    }
  }

  function findFolder(folders: Folder[], id: string): Folder | undefined {
    for (const f of folders) {
      if (f.id === id) return f;
      const sub = findFolder(f.children, id);
      if (sub) return sub;
    }
    return undefined;
  }

  async function addToFolder(folderId: string, item: GedItem) {
    if (!compte?.id_compte) {
      addNotification(`Vous devez être connecté pour ajouter "${item.original_name}" à un dossier.`, 'error');
      return;
    }

    try {
      const folder = findFolder(folders, folderId);
      if (!folder) {
        addNotification('Dossier introuvable.', 'error');
        return;
      }
      if (folder.deleted_at) {
        addNotification(`Impossible d'ajouter "${item.original_name}" à un dossier supprimé.`, 'error');
        return;
      }

      if (folder.files.some(f => f.id_ged === item.id_ged)) {
        addNotification(`"${item.original_name}" est déjà dans le dossier "${folder.name}".`, 'error');
        return;
      }

      const body = JSON.stringify({ id_ged: item.id_ged, id_compte: compte.id_compte });
      const res = await fetch(API.addToFolder(folderId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      await res.json();

      setFolders((prev) => {
        const newFolders = JSON.parse(JSON.stringify(prev));
        const targetFolder = findFolder(newFolders, folderId);
        if (targetFolder && !targetFolder.files.some(f => f.id_ged === item.id_ged)) {
          targetFolder.files.push(item);
          targetFolder.files.sort((a, b) => a.original_name.localeCompare(b.original_name));
        }
        return newFolders;
      });

      setItems((prev) => prev.filter(i => i.id_ged !== item.id_ged));
      setTotal((prev) => prev - 1);

      addNotification(`"${item.original_name}" ajouté au dossier "${folder.name}" avec succès.`, 'success');
    } catch (err) {
      console.error('Erreur lors de l’ajout au dossier:', err);
      addNotification(`Erreur lors de l'ajout de "${item.original_name}" au dossier: ${(err as Error).message}`, 'error');
    }
  }

  async function removeFromFolder(folderId: string, itemId: number) {
    if (!compte?.id_compte) {
      addNotification('Vous devez être connecté pour retirer des fichiers d’un dossier.', 'error');
      return;
    }

    try {
      const folder = findFolder(folders, folderId);
      if (!folder) {
        addNotification('Dossier introuvable.', 'error');
        return;
      }

      const file = folder.files.find(i => i.id_ged === itemId);
      if (!file) {
        addNotification('Fichier introuvable dans le dossier.', 'error');
        return;
      }

      const body = JSON.stringify({ id_compte: compte.id_compte });
      const res = await fetch(API.removeFromFolder(folderId, itemId), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Réponse du serveur non-JSON');
      }

      await res.json();

      setFolders((prev) => {
        const newFolders = JSON.parse(JSON.stringify(prev));
        const targetFolder = findFolder(newFolders, folderId);
        if (targetFolder) {
          const file = targetFolder.files.find(i => i.id_ged === itemId);
          targetFolder.files = targetFolder.files.filter(i => i.id_ged !== itemId);
          if (file && !items.some(i => i.id_ged === file.id_ged)) {
            setItems((prev) => [...prev, file].sort((a, b) => a.original_name.localeCompare(b.original_name)));
            setTotal((prev) => prev + 1);
          }
        }
        return newFolders;
      });

      addNotification(`"${file.original_name}" retiré du dossier "${folder.name}" avec succès.`, 'success');
    } catch (err) {
      console.error('Erreur lors du retrait du dossier:', err);
      addNotification(`Erreur lors du retrait du dossier: ${(err as Error).message}`, 'error');
    }
  }
  const toggleFolder = (id: string) => {
    setOpenFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
    setActiveFolderId(id);
  };

  const getFileAbbreviation = (mimetype?: string) => {
    if (!mimetype) return 'FILE';
    const subtype = mimetype.split('/')[1]?.toUpperCase() || 'FILE';
    switch (subtype) {
      case 'PNG': return 'PNG';
      case 'JPEG': case 'JPG': return 'JPG';
      case 'PDF': return 'PDF';
      case 'DOC': case 'DOCX': return 'DOC';
      case 'XLS': case 'XLSX': return 'XLS';
      case 'PPT': case 'PPTX': return 'PPT';
      case 'MP4': case 'AVI': case 'MPEG': return 'VID';
      case 'MP3': return 'MP3';
      case 'CSV': return 'CSV';
      case 'TXT': return 'TXT';
      default: return subtype.substring(0, 3).toUpperCase();
    }
  };

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));

  function FolderItem({ folder, level }: { folder: Folder; level?: number }) {
    const [{ isOver }, drop] = useDrop(() => ({
      accept: 'file',
      drop: async (dropped: { item: GedItem }) => {
        if (folder.deleted_at) {
          addNotification(`Impossible d'ajouter à "${folder.name}" car il est supprimé.`, 'error');
          return;
        }
        await addToFolder(folder.id, dropped.item);
      },
      collect: monitor => ({
        isOver: monitor.isOver(),
      })
    }), [folder.id, folder.deleted_at]);

    const isDeleted = !!folder.deleted_at;

    return (
      <motion.div
        ref={drop}
        initial={false}
        animate={{ 
          scale: isOver && !isDeleted ? 1.05 : 1,
          backgroundColor: isOver && !isDeleted ? 'rgba(59, 130, 246, 0.1)' : isDeleted ? 'rgba(239, 68, 68, 0.1)' : activeFolderId === folder.id ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
          boxShadow: isOver && !isDeleted ? '0 0 10px rgba(59, 130, 246, 0.5)' : isDeleted ? '0 0 0 1px #ef4444' : activeFolderId === folder.id ? '0 0 0 1px #3b82f6' : 'none',
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-gray-800 ${isDeleted ? 'opacity-60' : ''}`}
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={() => toggleFolder(folder.id)}
      >
        <div className="flex items-center gap-3 flex-1">
          <motion.span
            animate={{ rotate: openFolders.has(folder.id) ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-amber-500"
          >
            ▶
          </motion.span>
          <span genio-id="folder-icon" className="text-yellow-500">📁</span>
          <span className="font-medium text-base">{folder.name}</span>
          <span className="ml-auto text-sm text-gray-500">({folder.files.length + folder.children.length})</span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!isDeleted ? (
            <>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  createFolder(folder.id);
                }}
                className="p-1 text-blue-600 hover:bg-blue-100 rounded-full"
              >
                +
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  softDeleteFolder(folder.id);
                }}
                className="p-1 text-red-600 hover:bg-red-100 rounded-full"
              >
                🗑️
              </motion.button>
            </>
          ) : (
            <>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  restoreFolder(folder.id);
                }}
                className="p-1 text-green-600 hover:bg-green-100 rounded-full"
              >
                🔄
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  hardDeleteFolder(folder.id);
                }}
                className="p-1 text-red-600 hover:bg-red-100 rounded-full"
              >
                🗑️
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    );
  }

  function FileItemInFolder({ item, folderId }: { item: GedItem, folderId: string }) {
    const [{ isDragging }, drag] = useDrag(() => ({
      type: 'file',
      item: { item },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      preview: () => {
        const dragPreview = document.createElement('div');
        dragPreview.style.width = '24px';
        dragPreview.style.height = '24px';
        dragPreview.style.display = 'flex';
        dragPreview.style.alignItems = 'center';
        dragPreview.style.justifyContent = 'center';
        dragPreview.style.color = '#3b82f6';
        dragPreview.style.fontSize = '16px';
        dragPreview.innerHTML = '📎';
        document.body.appendChild(dragPreview);
        return dragPreview;
      },
    }));

    return (
      <AnimatePresence>
        <motion.div
          ref={drag}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 hover:border-blue-300 shadow-sm cursor-move ${isDragging ? 'opacity-50' : ''}`}
        >
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-gray-600">{getFileAbbreviation(item.mimetype)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-gray-800 truncate">{item.original_name}</p>
            <p className="text-sm text-gray-500">{B_READABLE(item.size)}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => removeFromFolder(folderId, item.id_ged)}
              className="p-1 text-red-600 hover:bg-red-100 rounded-full"
            >
              ✕
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => viewItem(item)}
              className="p-1 text-blue-600 hover:bg-blue-100 rounded-full"
            >
              👁
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  function FileItem({ item }: { item: GedItem }) {
    const [{ isDragging }, drag] = useDrag(() => ({
      type: 'file',
      item: { item },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      preview: () => {
        const dragPreview = document.createElement('div');
        dragPreview.style.width = '24px';
        dragPreview.style.height = '24px';
        dragPreview.style.display = 'flex';
        dragPreview.style.alignItems = 'center';
        dragPreview.style.justifyContent = 'center';
        dragPreview.style.color = '#3b82f6';
        dragPreview.style.fontSize = '16px';
        dragPreview.innerHTML = '📎';
        document.body.appendChild(dragPreview);
        return dragPreview;
      },
    }));

    return (
      <AnimatePresence>
        <motion.div
          ref={drag}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`flex items-center gap-4 p-3 rounded-lg bg-white border border-gray-200 hover:border-blue-300 shadow-md hover:shadow-lg cursor-move ${isDragging || item.deleted_at ? 'opacity-60' : ''}`}
        >
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-gray-600">{getFileAbbreviation(item.mimetype)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-gray-800 truncate">{item.original_name}</p>
            <p className="text-sm text-gray-500">
              Chargé : {item.created_at ? new Date(item.created_at).toLocaleString('fr-FR') : 'n/a'} par{' '}
              {item.uploaded_by_email || item.uploaded_by || 'inconnu'}
            </p>
            <p className="text-sm text-gray-500">
              Taille : {B_READABLE(item.size)} | Catégorie : {item.category || 'Aucune'}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => viewItem(item)}
              className="text-sm px-2 py-1 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
            >
              Aperçu
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => fetchLogs(item)}
              className="text-sm px-2 py-1 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
            >
              Historique
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const newCat = prompt('Nouvelle catégorie', item.category || '');
                const newTags = prompt('Nouveaux mots-clés', item.tags || '');
                const newDesc = prompt('Nouvelle description', item.description || '');
                if (newCat !== null || newTags !== null || newDesc !== null) {
                  saveMetadata(item, {
                    category: newCat !== null ? newCat : item.category,
                    tags: newTags !== null ? newTags : item.tags,
                    description: newDesc !== null ? newDesc : item.description,
                  });
                }
              }}
              className="text-sm px-2 py-1 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
            >
              Modifier
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => downloadItem(item)}
              className="text-sm px-2 py-1 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
            >
              Télécharger
            </motion.button>
            {!item.deleted_at ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => softDelete(item)}
                className="text-sm px-2 py-1 border border-red-600 text-red-600 rounded-md hover:bg-red-50"
              >
                Supprimer
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => restore(item)}
                  className="text-sm px-2 py-1 border border-green-600 text-green-600 rounded-md hover:bg-green-100"
                >
                  Restaurer
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => hardDelete(item)}
                  className="text-sm px-2 py-1 border border-red-600 text-red-600 rounded-md hover:bg-red-50"
                >
                  Suppr. def.
                </motion.button>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  function RenderFolders({ folders, level = 0 }: { folders: Folder[], level?: number }) {
    return (
      <div className="space-y-1">
        {folders.map(folder => (
          <div key={folder.id} className="tree-node">
            <FolderItem folder={folder} level={level} />
            <AnimatePresence>
              {openFolders.has(folder.id) && !folder.deleted_at && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="pl-4"
                >
                  <div className="space-y-1">
                    {folder.files.map(file => (
                      <FileItemInFolder key={file.id_ged} item={file} folderId={folder.id} />
                    ))}
                    {folder.files.length === 0 && <p className="text-sm text-gray-400 italic pl-3">Aucun fichier</p>}
                  </div>
                  <RenderFolders folders={folder.children} level={level + 1} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    );
  }

  if (!compte?.id_compte) {
    return (
      <div className="min-h-screen bg-white">
        <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
          <span className="text-blue-600 font-medium">
            GED
          </span>
        </nav>
        <h1 className="text-4xl font-bold text-gray-900 mb-8 text-center max-w-[90vw] mx-auto">Gestion Électronique des Documents - Actif Numérique</h1>
        <div className="bg-white shadow-md rounded-lg p-8 border border-gray-200 max-w-[90vw] mx-auto">
          <p className="text-red-600 text-lg text-center">Veuillez vous connecter pour accéder au système de gestion des documents.</p>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-white">
        <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
          <span className="text-blue-600 font-medium">
            GED
          </span>
        </nav>
        <h1 className="text-4xl font-bold text-gray-900 mb-8 text-center max-w-[90vw] mx-auto">Actif Numérique</h1>
        <div className="max-w-[90vw] mx-auto space-y-6">
          <div className="w-full bg-white shadow-md rounded-lg p-6 border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 bg-blue-950 text-white p-3 rounded-t-lg">
              <div className="text-sm font-semibold">Fichier</div>
              <div className="text-sm font-semibold">Catégorie</div>
              <div className="text-sm font-semibold">Mots-clés</div>
            </div>
            <form onSubmit={handleUpload}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className={`relative ${isDragging ? 'border-2 border-dashed border-blue-600 bg-blue-50' : 'border border-gray-200'} rounded-lg p-4 transition-all`} ref={uploadAreaRef}>
                  <input
                    ref={fileRef}
                    type="file"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <button
                    type="button"
                    className={`w-full text-base text-gray-600 bg-gray-50 py-3 px-4 rounded-lg border ${selectedFile ? 'border-blue-600 bg-blue-50' : 'border-gray-200'} hover:bg-gray-100 transition-all text-left`}
                    onClick={() => fileRef.current?.click()}
                  >
                    <div className="flex items-center justify-between">
                      {selectedFile ? (
                        <span className="truncate flex-1">{selectedFile.name}</span>
                      ) : (
                        <span>Choisir un fichier (ou glissez-déposez)</span>
                      )}
                      {selectedFile && <span className="ml-2 text-base text-blue-600">✓</span>}
                    </div>
                  </button>
                  <AnimatePresence>
                    {selectedFile && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        className="mt-3 flex justify-center"
                      >
                        {previewUrl ? (
                          selectedFile.type.startsWith('image/') ? (
                            <img src={previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-md border border-gray-200" />
                          ) : selectedFile.type.startsWith('video/') ? (
                            <video src={previewUrl} className="w-16 h-16 object-cover rounded-md border border-gray-200" />
                          ) : (
                            <div className="w-16 h-16 bg-gray-100 flex items-center justify-center rounded-md border border-gray-200 text-sm font-bold text-gray-600">
                              {getFileAbbreviation(selectedFile.type)}
                            </div>
                          )
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 flex items-center justify-center rounded-md border border-gray-200 text-sm font-bold text-gray-600">
                            {getFileAbbreviation(selectedFile.type)}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <input
                  value={uploadMeta.category}
                  onChange={(e) => setUploadMeta((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="Exemple: Images"
                  className="border border-gray-200 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
                <input
                  value={uploadMeta.tags}
                  onChange={(e) => setUploadMeta((prev) => ({ ...prev, tags: e.target.value }))}
                  placeholder="Exemple: mot1, mot2, mot3"
                  className="border border-gray-200 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div className="mb-4">
                <label className="block text-base text-gray-700 mb-2">Description (facultatif)</label>
                <input
                  value={uploadMeta.description}
                  onChange={(e) => setUploadMeta((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Exemple: Description détaillée du fichier"
                  className="block w-full border border-gray-200 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div className="flex justify-end gap-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={resetUpload}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-base"
                >
                  Réinitialiser
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-base ${isUploading || !selectedFile ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isUploading ? 'Chargement...' : 'Charger'}
                </motion.button>
              </div>
            </form>
          </div>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="md:w-[45%] bg-white shadow-md rounded-lg p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Dossiers</h2>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => createFolder()}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                >
                  + Nouveau dossier
                </motion.button>
              </div>
              {folders.length === 0 ? (
                <p className="text-gray-500">Aucun dossier disponible.</p>
              ) : (
                <RenderFolders folders={folders} />
              )}
            </div>
            <div className="md:w-[55%] bg-white shadow-md rounded-lg p-6 border border-gray-200">
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Rechercher..."
                  className="flex-1 border border-gray-200 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                  className="border border-gray-200 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">Toutes catégories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <select
                  value={filetypeFilter}
                  onChange={(e) => {
                    setFiletypeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="border border-gray-200 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">Tous types</option>
                  <option value="image">Images</option>
                  <option value="pdf">PDF</option>
                  <option value="word">Documents Word</option>
                  <option value="excel">Excel</option>
                  <option value="video">Vidéos</option>
                  <option value="audio">Audio</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setPage(1);
                  }}
                  className="border border-gray-200 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="created_at">Date de création</option>
                  <option value="original_name">Nom</option>
                  <option value="size">Taille</option>
                </select>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
                    setPage(1);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-base"
                >
                  {sortDir === 'ASC' ? '↑' : '↓'}
                </motion.button>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Fichiers</h2>
                {loading ? (
                  <p className="text-gray-500">Chargement...</p>
                ) : items.length === 0 ? (
                  <p className="text-gray-500">Aucun fichier disponible.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((item) => (
                      <FileItem key={item.id_ged} item={item} />
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-between items-center">
                <div>
                  {total > 0 && (
                    <p className="text-gray-600">
                      Affichage de {(page - 1) * perPage + 1} à {Math.min(page * perPage, total)} sur {total} éléments
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={`px-4 py-2 border border-gray-200 rounded-md text-base ${page === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'}`}
                  >
                    Précédent
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page * perPage >= total}
                    className={`px-4 py-2 border border-gray-200 rounded-md text-base ${page * perPage >= total ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'}`}
                  >
                    Suivant
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {selected && (
          <Draggable handle=".modal-handle">
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <ResizableBox
                width={600}
                height={400}
                minConstraints={[300, 200]}
                maxConstraints={[800, 600]}
                className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
              >
                <div className="modal-handle bg-blue-600 text-white p-4 cursor-move flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{selected.original_name}</h3>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      setSelected(null);
                      setPreviewUrl(null);
                      setPdfUrl(null);
                      setDocHtml(null);
                      setVideoUrl(null);
                    }}
                    className="text-white hover:bg-blue-700 rounded-full p-1"
                  >
                    ✕
                  </motion.button>
                </div>
                <div className="p-6 overflow-auto max-h-[calc(100%-80px)]">
                  {previewLoading ? (
                    <p className="text-gray-500 text-center">Chargement de l’aperçu...</p>
                  ) : previewUrl ? (
                    <img src={previewUrl} alt={selected.original_name} className="w-full h-64 object-contain rounded-md border border-gray-200" />
                  ) : videoUrl ? (
                    <video controls className="w-full h-64 object-contain rounded-md border border-gray-200">
                      <source src={videoUrl} type={selected.mimetype} />
                      Votre navigateur ne supporte pas la lecture de vidéos.
                    </video>
                  ) : pdfUrl ? (
                    <iframe src={pdfUrl} className="w-full h-64 border rounded-md" title={selected.original_name} />
                  ) : docHtml ? (
                    <div
                      className="prose max-w-none text-gray-800"
                      dangerouslySetInnerHTML={{ __html: docHtml }}
                    />
                  ) : (
                    <p className="text-gray-500 text-center">Aucun aperçu disponible pour ce type de fichier.</p>
                  )}
                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="block text-base text-gray-700">Catégorie</label>
                      <input
                        value={metaCategory}
                        onChange={(e) => setMetaCategory(e.target.value)}
                        className="block w-full border border-gray-200 rounded-md p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-base text-gray-700">Mots-clés</label>
                      <input
                        value={metaTags}
                        onChange={(e) => setMetaTags(e.target.value)}
                        className="block w-full border border-gray-200 rounded-md p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-base text-gray-700">Description</label>
                      <input
                        value={metaDescription}
                        onChange={(e) => setMetaDescription(e.target.value)}
                        className="block w-full border border-gray-200 rounded-md p-3 text-base focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => saveMetadata(selected, {
                        category: metaCategory,
                        tags: metaTags,
                        description: metaDescription,
                      })}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-base"
                    >
                      Enregistrer les métadonnées
                    </motion.button>
                  </div>
                </div>
              </ResizableBox>
            </div>
          </Draggable>
        )}

     {logsModalOpen && logsItem && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl shadow-2xl p-6 w-96 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          Historique : {logsItem.original_name}
        </h3>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setLogsModalOpen(false)}
          className="text-gray-600 hover:bg-gray-100 rounded-full p-1"
        >
          ✕
        </motion.button>
      </div>

      {logsLoading ? (
        <p className="text-gray-500">Chargement de l’historique...</p>
      ) : currentLogs.length === 0 ? (
        <p className="text-gray-500">Aucun historique disponible.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto scroll-smooth">
          {currentLogs.map((log) => (
            <div key={log.id_log} className="border-b border-gray-200 pb-2">
              <p className="text-sm text-gray-700">
                <strong>
                  {(() => {
                    switch (log.action) {
                      case 'UPLOAD':
                        return 'Téléversement';
                      case 'DOWNLOAD':
                        return 'Téléchargement';
                      case 'VIEW':
                        return 'Visualisation';
                      case 'SOFT_DELETE':
                        return 'Suppression (réversible)';
                      case 'RESTORE':
                        return 'Restauration';
                      case 'HARD_DELETE':
                        return 'Suppression définitive';
                      case 'add_to_folder':
                        return 'Ajout au dossier';
                      case 'remove_from_folder':
                        return 'Retrait du dossier';
                      case 'UPDATE_METADATA':
                        return 'Mise à jour des métadonnées';
                      default:
                        return log.action;
                    }
                  })()}
                </strong>{' '}
                par{' '}
                <span className="text-blue-600">
                  {log.performer_email || 'inconnu'}
                </span>
              </p>

              <p className="text-sm text-gray-500">
                {log.performed_at
                  ? new Date(log.performed_at).toLocaleString('fr-FR')
                  : 'n/a'}
              </p>

              {log.details && (
                <p className="text-sm text-gray-600 mt-1">
                  {(() => {
                    try {
                      const details =
                        typeof log.details === 'string'
                          ? JSON.parse(log.details)
                          : log.details;

                      if (details.nom_dossier) {
                        if (log.action === 'add_to_folder')
                          return (
                            <>
                              Ajouté au dossier{' '}
                              <strong>{details.nom_dossier}</strong>
                            </>
                          );
                        if (log.action === 'remove_from_folder')
                          return (
                            <>
                              Retiré du dossier{' '}
                              <strong>{details.nom_dossier}</strong>
                            </>
                          );
                      }

                      if (details.original_name)
                        return (
                          <>
                            Fichier :{' '}
                            <strong>{details.original_name}</strong>
                          </>
                        );

                      if (details.category || details.tags)
                        return (
                          <>
                            Catégorie : <strong>{details.category || '-'}</strong>
                            <br />
                            Tags : <strong>{details.tags || '-'}</strong>
                          </>
                        );

                      return JSON.stringify(details, null, 2);
                    } catch {
                      return log.details;
                    }
                  })()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
)}

      </div>
    </DndProvider>
  );
}