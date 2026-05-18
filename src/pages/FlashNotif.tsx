import React, { useState, useEffect, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import { useApi } from '@/hooks/useApi';
import 'react-toastify/dist/ReactToastify.css';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';

interface Notif {
  id_notif: number;
  titre_notif_ar: string;
  texte_notif_ar: string;
  titre_notif_fr: string;
  texte_notif_fr: string;
  titre_notif_en: string;
  texte_notif_en: string;
  date_notif: string;
  date_m_notif: string | null;
  status: number;
}

interface NotifResponse {
  id: number;
  id_notif: number;
  id_entite: number;
  response: string;
  date_response: string;
  raison_socialle?: string;
}

interface FlashNotifProps {
  profileId: number;
  idEntite: number;
  idCompte: number;
}

const FlashNotif: React.FC<FlashNotifProps> = ({ profileId, idEntite, idCompte }) => {
  const api = useApi();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<Notif | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSelectLangModalOpen, setIsSelectLangModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedTextTitle, setSelectedTextTitle] = useState<string>('');
  const [selectedLang, setSelectedLang] = useState<'ar' | 'fr' | 'en' | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editText, setEditText] = useState<string>('');
  const [addFormData, setAddFormData] = useState({
    titre_notif_ar: '',
    texte_notif_ar: '',
    titre_notif_fr: '',
    texte_notif_fr: '',
    titre_notif_en: '',
    texte_notif_en: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [responses, setResponses] = useState<NotifResponse[]>([]);
  const [myResponses, setMyResponses] = useState<NotifResponse[]>([]);
  const [currentEntiteId, setCurrentEntiteId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (idEntite) {
      setCurrentEntiteId(idEntite);
    }
  }, [idEntite]);

  useEffect(() => {
    if (currentEntiteId !== null) {
      fetchNotifs();
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setOpenDropdownId(null);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [currentEntiteId]);

  useEffect(() => {
    if (currentEntiteId !== null) {
      if (isAdmin) {
        fetchAllResponses();
      } else {
        fetchMyResponses();
      }
    }
  }, [currentEntiteId]);

  const isAdmin = currentEntiteId === 999 || currentEntiteId === 111;
  const showActions = isAdmin;

  const fetchNotifs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/notifs`, { timeout: 10000 });
      setNotifs(response.data);
    } catch (error: any) {
      console.error('Erreur lors de la récupération des notifications:', error);
      const message = error.response?.data?.error || 'Échec de la récupération des notifications';
      setError(message);
      toast.error(message, { position: 'top-right', autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllResponses = async () => {
    try {
      const response = await api.get(`/api/notif_responses`, { timeout: 10000 });
      setResponses(response.data);
    } catch (error: any) {
      console.error('Erreur lors de la récupération des réponses:', error);
      toast.error('Échec de la récupération des réponses', { position: 'top-right', autoClose: 5000 });
    }
  };

  const fetchMyResponses = async () => {
    try {
      const response = await api.get(`/api/notif_responses?entite=${currentEntiteId}`, { timeout: 10000 });
      setMyResponses(response.data);
    } catch (error: any) {
      console.error('Erreur lors de la récupération de vos réponses:', error);
      toast.error('Échec de la récupération de vos réponses', { position: 'top-right', autoClose: 5000 });
    }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const data = addFormData;
    if (!data.titre_notif_ar || !data.texte_notif_ar || !data.titre_notif_fr || !data.texte_notif_fr || !data.titre_notif_en || !data.texte_notif_en) {
      setError('Tous les champs sont requis');
      toast.error('Tous les champs sont requis', { position: 'top-right', autoClose: 5000 });
      return;
    }
    try {
      await api.post(`/api/notifs`, data, { timeout: 10000 });
      toast.success('Notification ajoutée avec succès', { position: 'top-right', autoClose: 5000 });
      setIsAddModalOpen(false);
      setAddFormData({
        titre_notif_ar: '',
        texte_notif_ar: '',
        titre_notif_fr: '',
        texte_notif_fr: '',
        titre_notif_en: '',
        texte_notif_en: '',
      });
      fetchNotifs();
    } catch (error: any) {
      console.error('Erreur lors de l\'ajout de la notification:', error);
      const message = error.response?.data?.error || 'Échec de l\'ajout de la notification';
      setError(message);
      toast.error(message, { position: 'top-right', autoClose: 5000 });
    }
  };

  const handleUpdate = async () => {
    if (!selectedNotif || !selectedLang) return;
    setError(null);
    const data = {
      [`titre_notif_${selectedLang}`]: editTitle,
      [`texte_notif_${selectedLang}`]: editText,
    };
    if (!data[`titre_notif_${selectedLang}`] || !data[`texte_notif_${selectedLang}`]) {
      setError('Les champs titre et texte sont requis');
      toast.error('Les champs titre et texte sont requis', { position: 'top-right', autoClose: 5000 });
      return;
    }
    try {
      await api.put(`/api/notifs/${selectedNotif.id_notif}`, data, { timeout: 10000 });
      toast.success('Notification mise à jour avec succès', { position: 'top-right', autoClose: 5000 });
      setIsEditModalOpen(false);
      setSelectedNotif(null);
      setSelectedLang(null);
      fetchNotifs();
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour de la notification:', error);
      const message = error.response?.data?.error || 'Échec de la mise à jour de la notification';
      setError(message);
      toast.error(message, { position: 'top-right', autoClose: 5000 });
    }
  };

  const handleDelete = async (id: number) => {
    const toastId = toast(
      <div className="flex flex-col items-center space-y-2">
        <span>Êtes-vous sûr de vouloir supprimer cette notification ?</span>
        <div className="flex space-x-2">
          <button
            className="bg-blue-950 text-white px-3 py-1 rounded hover:bg-blue-900 transition duration-200 text-sm"
            onClick={async () => {
              setError(null);
              try {
                await api.delete(`/api/notifs/${id}`, { timeout: 10000 });
                toast.success('Notification supprimée avec succès', { position: 'top-right', autoClose: 5000 });
                fetchNotifs();
                toast.dismiss(toastId);
              } catch (error: any) {
                console.error('Erreur lors de la suppression de la notification:', error);
                const message = error.response?.data?.error || 'Échec de la suppression de la notification';
                setError(message);
                toast.error(message, { position: 'top-right', autoClose: 5000 });
                toast.dismiss(toastId);
              }
            }}
          >
            Oui
          </button>
          <button
            className="bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400 transition duration-200 text-sm"
            onClick={() => toast.dismiss(toastId)}
          >
            Non
          </button>
        </div>
      </div>,
      {
        position: 'top-center',
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        className: 'bg-white border border-blue-950 rounded-lg shadow-lg p-4',
      }
    );
  };

  const handleResponse = async (id_notif: number, resp: 'interesse' | 'participe') => {
    if (currentEntiteId === null) return;
    setError(null);
    try {
      await api.post(`/api/notif_responses`, { id_notif, id_entite: currentEntiteId, response: resp }, { timeout: 10000 });
      toast.success('Réponse enregistrée avec succès', { position: 'top-right', autoClose: 5000 });
      fetchMyResponses();
    } catch (error: any) {
      console.error('Erreur lors de l\'enregistrement de la réponse:', error);
      const message = error.response?.data?.error || 'Échec de l\'enregistrement de la réponse';
      setError(message);
      toast.error(message, { position: 'top-right', autoClose: 5000 });
    }
  };

  const openSelectLangModal = async (id: number) => {
    setError(null);
    try {
      const response = await api.get(`/api/notifs/${id}`, { timeout: 10000 });
      setSelectedNotif(response.data);
      setIsSelectLangModalOpen(true);
      setOpenDropdownId(null);
    } catch (error: any) {
      console.error('Erreur lors de la récupération des détails de la notification:', error);
      const message = error.response?.data?.error || 'Échec de la récupération des détails de la notification';
      setError(message);
      toast.error(message, { position: 'top-right', autoClose: 5000 });
    }
  };

  const openEditModal = (lang: 'ar' | 'fr' | 'en') => {
    if (!selectedNotif) return;
    setSelectedLang(lang);
    setEditTitle(selectedNotif[`titre_notif_${lang}`]);
    setEditText(selectedNotif[`texte_notif_${lang}`]);
    setIsSelectLangModalOpen(false);
    setIsEditModalOpen(true);
  };

  const openTextModal = (text: string, title: string) => {
    setSelectedText(text);
    setSelectedTextTitle(title);
    setIsTextModalOpen(true);
  };

  const toggleDropdown = (id: number, event: React.MouseEvent) => {
    if (openDropdownId === id) {
      setOpenDropdownId(null);
    } else {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const dropdownWidth = 112; // Approximate width of dropdown (w-28 = 112px)
      const dropdownHeight = 80; // Approximate height of dropdown
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Calculate position to ensure dropdown stays within viewport
      let left = rect.right - dropdownWidth;
      let top = rect.bottom;

      // Adjust if dropdown would go off-screen
      if (left < 0) left = rect.left;
      if (top + dropdownHeight > viewportHeight) top = rect.top - dropdownHeight;

      setDropdownPosition({ top, left });
      setOpenDropdownId(id);
    }
  };

  const renderFormattedText = (text: string, notifId: number, lang: string, title: string) => {
    // Calculate approximate line count for truncation
    const div = document.createElement('div');
    div.innerHTML = text;
    const lineCount = div.innerText.split('\n').length;

    return (
      <div
        className={`max-h-16 overflow-y-auto text-sm scrollbar scrollbar-thumb-blue-950 scrollbar-track-gray-100 cursor-pointer hover:bg-blue-50 transition duration-200 shadow-sm ${lineCount > 5 ? 'text-ellipsis' : ''}`}
        onClick={() => lineCount > 5 && openTextModal(text, title)}
      >
        <div dangerouslySetInnerHTML={{ __html: text }} className="mb-1" />
        {lineCount > 5 && (
          <span className="text-blue-950 text-xs">... Cliquez pour voir tout</span>
        )}
      </div>
    );
  };

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'color': [] }], // Add color picker
      [{ 'align': [] }],
      ['clean']
    ]
  };

  if (currentEntiteId === null) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Paramètres</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Notifications</span>
      </nav>
      <ToastContainer />
      <div className="max-w-8xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden mt-4">
          <div className="p-4">
            {isAdmin && (
              <button
                className="bg-blue-950 text-white px-4 py-2 rounded mb-4 hover:bg-blue-900 transition duration-200"
                onClick={() => setIsAddModalOpen(true)}
              >
                Ajouter une Notification
              </button>
            )}
            {error && (
              <div className="bg-red-50 border-l-2 border-red-500 text-red-600 p-3 mb-4 rounded flex justify-between items-center animate-fade-in text-sm">
                <span>{error}</span>
                <button className="text-red-600 hover:text-red-800" onClick={() => setError(null)}>
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            )}
            {isLoading ? (
              <div className="text-center py-6">
                <div className="animate-spin inline-block w-6 h-6 border-3 border-blue-950 border-t-transparent rounded-full"></div>
                <span className="ml-2 text-blue-950 text-sm">Chargement...</span>
              </div>
            ) : notifs.length === 0 ? (
              <div className="bg-blue-50 text-blue-950 p-3 text-center rounded text-sm">Aucune notification trouvée.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-auto border-collapse">
                  <thead className="bg-blue-950 text-white text-sm">
                    <tr>
                      <th className="p-3 text-left w-[25%]">Arabe</th>
                      <th className="p-3 text-left w-[25%]">Français</th>
                      <th className="p-3 text-left w-[25%]">Anglais</th>
                      <th className="p-3 text-left w-[10%]">Créée</th>
                      <th className="p-3 text-left w-[10%]">Modifiée</th>
                      {showActions && <th className="p-3 text-left w-[15%]">Actions</th>}
                      {!isAdmin && <th className="p-3 text-left w-[15%]">Réponse</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {notifs.map((notif) => (
                      <tr key={notif.id_notif} className="border-b">
                        <td className="p-3 align-top hover:bg-blue-50 transition duration-200">
                          <div className="text-blue-950 text-sm mb-2">{notif.titre_notif_ar}</div>
                          <hr className="border-blue-200 mb-2" />
                          {renderFormattedText(notif.texte_notif_ar, notif.id_notif, 'ar', notif.titre_notif_ar)}
                        </td>
                        <td className="p-3 align-top hover:bg-blue-50 transition duration-200">
                          <div className="text-blue-950 text-sm mb-2">{notif.titre_notif_fr}</div>
                          <hr className="border-blue-200 mb-2" />
                          {renderFormattedText(notif.texte_notif_fr, notif.id_notif, 'fr', notif.titre_notif_fr)}
                        </td>
                        <td className="p-3 align-top hover:bg-blue-50 transition duration-200">
                          <div className="text-blue-950 text-sm mb-2">{notif.titre_notif_en}</div>
                          <hr className="border-blue-200 mb-2" />
                          {renderFormattedText(notif.texte_notif_en, notif.id_notif, 'en', notif.titre_notif_en)}
                        </td>
                        <td className="p-3 align-top text-sm hover:bg-blue-50 transition duration-200">{notif.date_notif}</td>
                        <td className="p-3 align-top text-sm hover:bg-blue-50 transition duration-200">{notif.date_m_notif || '-'}</td>
                        {showActions && (
                          <td className="p-3 align-top relative hover:bg-blue-50 transition duration-200">
                            <button
                              ref={buttonRef}
                              className="bg-blue-950 text-white px-2 py-1 rounded hover:bg-blue-900 transition duration-200 flex items-center space-x-1 text-xs w-full justify-between"
                              onClick={(e) => toggleDropdown(notif.id_notif, e)}
                            >
                              <span>Action</span>
                              <i className="bi bi-caret-down-fill"></i>
                            </button>
                            {openDropdownId === notif.id_notif && (
                              <div
                                ref={dropdownRef}
                                className="fixed w-28 bg-white rounded shadow-lg z-50 border border-gray-200"
                                style={{
                                  top: `${dropdownPosition.top}px`,
                                  left: `${dropdownPosition.left}px`,
                                }}
                              >
                                <button
                                  className="block w-full text-left px-3 py-1 text-sm text-gray-700 hover:bg-yellow-100 transition duration-200 flex items-center space-x-2"
                                  onClick={() => openSelectLangModal(notif.id_notif)}
                                >
                                  <PencilIcon className="h-4 w-4" />
                                  <span>Modifier</span>
                                </button>
                                <button
                                  className="block w-full text-left px-3 py-1 text-sm text-gray-700 hover:bg-red-100 transition duration-200 flex items-center space-x-2"
                                  onClick={() => {
                                    handleDelete(notif.id_notif);
                                    setOpenDropdownId(null);
                                  }}
                                >
                                  <TrashIcon className="h-4 w-4" />
                                  <span>Supprimer</span>
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                        {!isAdmin && (
                          <td className="p-3 align-top hover:bg-blue-50 transition duration-200">
                            {myResponses.find((r) => r.id_notif === notif.id_notif) ? (
                              <span className="text-blue-950 text-sm">
                                Vous avez choisi: {myResponses.find((r) => r.id_notif === notif.id_notif)?.response === 'interesse' ? 'Intéressé' : 'Je participe'}
                              </span>
                            ) : (
                              <div className="flex space-x-2">
                                <button
                                  className="bg-blue-950 text-white px-2 py-1 rounded hover:bg-blue-900 transition duration-200 text-xs"
                                  onClick={() => handleResponse(notif.id_notif, 'interesse')}
                                >
                                  Intéressé
                                </button>
                                <button
                                  className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 transition duration-200 text-xs"
                                  onClick={() => handleResponse(notif.id_notif, 'participe')}
                                >
                                  Je participe
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isAdmin && responses.length > 0 && (
              <div className="mt-6">
                <h2 className="text-lg font-bold text-blue-950 mb-2">List Participants</h2>
                <div className="overflow-x-auto">
                  <table className="w-full table-auto border-collapse">
                    <thead className="bg-blue-950 text-white text-sm">
                      <tr>
                        <th className="p-3 text-left">ID Notification</th>
                        <th className="p-3 text-left">ID Entité</th>
                        <th className="p-3 text-left">Raison Sociale</th>
                        <th className="p-3 text-left">Réponse</th>
                        <th className="p-3 text-left">Date Réponse</th>
                      </tr>
                    </thead>
                    <tbody>
                      {responses.map((resp) => (
                        <tr key={resp.id} className="border-b">
                          <td className="p-3 text-sm">{resp.id_notif}</td>
                          <td className="p-3 text-sm">{resp.id_entite}</td>
                          <td className="p-3 text-sm">{resp.raison_socialle || '-'}</td>
                          <td className="p-3 text-sm">{resp.response === 'interesse' ? 'Intéressé' : 'Je participe'}</td>
                          <td className="p-3 text-sm">{resp.date_response}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center transition-opacity duration-200 ${isAddModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isResizing) setIsAddModalOpen(false);
        }}
      >
        <Draggable handle=".modal-header" bounds="parent">
          <ResizableBox
            width={896}
            height={600}
            minConstraints={[400, 300]}
            maxConstraints={[1200, 800]}
            className="bg-white rounded-lg resizable"
            resizeHandles={['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']}
            onResizeStart={() => setIsResizing(true)}
            onResizeStop={() => setIsResizing(false)}
          >
            <div className="modal-content h-full flex flex-col">
              <div className="modal-header bg-blue-950 text-white p-4 rounded-t-lg flex justify-between items-center cursor-move">
                <h5 className="text-base">Ajouter une Notification</h5>
                <button className="text-white hover:text-gray-200" onClick={() => setIsAddModalOpen(false)}>
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleAdd} id="add-notif-form" className="flex-1 overflow-y-auto">
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-blue-950 text-sm mb-1">Titre Arabe</label>
                      <input
                        type="text"
                        name="titre_notif_ar"
                        value={addFormData.titre_notif_ar}
                        onChange={(e) => setAddFormData({ ...addFormData, titre_notif_ar: e.target.value })}
                        className="w-full p-2 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-950 transition duration-200 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-blue-950 text-sm mb-1">Texte Arabe</label>
                      <ReactQuill
                        theme="snow"
                        value={addFormData.texte_notif_ar}
                        onChange={(value) => setAddFormData({ ...addFormData, texte_notif_ar: value })}
                        modules={quillModules}
                        className="h-64"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-blue-950 text-sm mb-1">Titre Français</label>
                      <input
                        type="text"
                        name="titre_notif_fr"
                        value={addFormData.titre_notif_fr}
                        onChange={(e) => setAddFormData({ ...addFormData, titre_notif_fr: e.target.value })}
                        className="w-full p-2 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-950 transition duration-200 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-blue-950 text-sm mb-1">Texte Français</label>
                      <ReactQuill
                        theme="snow"
                        value={addFormData.texte_notif_fr}
                        onChange={(value) => setAddFormData({ ...addFormData, texte_notif_fr: value })}
                        modules={quillModules}
                        className="h-64"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-blue-950 text-sm mb-1">Titre Anglais</label>
                      <input
                        type="text"
                        name="titre_notif_en"
                        value={addFormData.titre_notif_en}
                        onChange={(e) => setAddFormData({ ...addFormData, titre_notif_en: e.target.value })}
                        className="w-full p-2 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-950 transition duration-200 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-blue-950 text-sm mb-1">Texte Anglais</label>
                      <ReactQuill
                        theme="snow"
                        value={addFormData.texte_notif_en}
                        onChange={(value) => setAddFormData({ ...addFormData, texte_notif_en: value })}
                        modules={quillModules}
                        className="h-64"
                      />
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-b-lg flex justify-end space-x-2">
                  <button
                    type="button"
                    className="bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400 transition duration-200 text-sm"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-950 text-white px-3 py-1 rounded hover:bg-blue-900 transition duration-200 text-sm"
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          </ResizableBox>
        </Draggable>
      </div>

      {/* Select Language Modal */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center transition-opacity duration-200 ${isSelectLangModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isResizing) setIsSelectLangModalOpen(false);
        }}
      >
        <Draggable handle=".modal-header" bounds="parent">
          <ResizableBox
            width={448}
            height={300}
            minConstraints={[300, 200]}
            maxConstraints={[600, 400]}
            className="bg-white rounded-lg resizable"
            resizeHandles={['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']}
            onResizeStart={() => setIsResizing(true)}
            onResizeStop={() => setIsResizing(false)}
          >
            <div className="modal-content h-full flex flex-col">
              <div className="modal-header bg-blue-950 text-white p-4 rounded-t-lg flex justify-between items-center cursor-move">
                <h5 className="text-base">Sélectionner la langue à modifier</h5>
                <button className="text-white hover:text-gray-200" onClick={() => setIsSelectLangModalOpen(false)}>
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <button
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 transition duration-200 border-b"
                  onClick={() => openEditModal('ar')}
                >
                  Arabe
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 transition duration-200 border-b"
                  onClick={() => openEditModal('fr')}
                >
                  Français
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 transition duration-200"
                  onClick={() => openEditModal('en')}
                >
                  Anglais
                </button>
              </div>
              <div className="p-4 bg-gray-50 rounded-b-lg flex justify-end">
                <button
                  className="bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400 transition duration-200 text-sm"
                  onClick={() => setIsSelectLangModalOpen(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          </ResizableBox>
        </Draggable>
      </div>

      {/* Edit Modal */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center transition-opacity duration-200 ${isEditModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isResizing) setIsEditModalOpen(false);
        }}
      >
        <Draggable handle=".modal-header" bounds="parent">
          <ResizableBox
            width={896}
            height={600}
            minConstraints={[400, 300]}
            maxConstraints={[1200, 800]}
            className="bg-white rounded-lg resizable"
            resizeHandles={['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']}
            onResizeStart={() => setIsResizing(true)}
            onResizeStop={() => setIsResizing(false)}
          >
            <div className="modal-content h-full flex flex-col">
              <div className="modal-header bg-blue-950 text-white p-4 rounded-t-lg flex justify-between items-center cursor-move">
                <h5 className="text-base">Modifier la Notification ({selectedLang === 'ar' ? 'Arabe' : selectedLang === 'fr' ? 'Français' : 'Anglais'})</h5>
                <button className="text-white hover:text-gray-200" onClick={() => setIsEditModalOpen(false)}>
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="space-y-3">
                  <div>
                    <label className="block text-blue-950 text-sm mb-1">Titre</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full p-2 border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-950 transition duration-200 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-blue-950 text-sm mb-1">Texte</label>
                    <ReactQuill
                      theme="snow"
                      value={editText}
                      onChange={setEditText}
                      modules={quillModules}
                      className="h-64"
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-b-lg flex justify-end space-x-2">
                <button
                  type="button"
                  className="bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400 transition duration-200 text-sm"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="bg-blue-950 text-white px-3 py-1 rounded hover:bg-blue-900 transition duration-200 text-sm"
                  onClick={handleUpdate}
                >
                  Mettre à jour
                </button>
              </div>
            </div>
          </ResizableBox>
        </Draggable>
      </div>

      {/* Full Text Modal */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center transition-opacity duration-200 ${isTextModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isResizing) setIsTextModalOpen(false);
        }}
      >
        <Draggable handle=".modal-header" bounds="parent">
          <ResizableBox
            width={896}
            height={600}
            minConstraints={[400, 300]}
            maxConstraints={[1200, 800]}
            className="bg-white rounded-lg resizable"
            resizeHandles={['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']}
            onResizeStart={() => setIsResizing(true)}
            onResizeStop={() => setIsResizing(false)}
          >
            <div className="modal-content h-full flex flex-col">
              <div className="modal-header bg-blue-950 text-white p-4 rounded-t-lg flex justify-between items-center cursor-move">
                <h5 className="text-base">{selectedTextTitle}</h5>
                <button className="text-white hover:text-gray-200" onClick={() => setIsTextModalOpen(false)}>
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 p-4 overflow-y-auto text-sm scrollbar scrollbar-thumb-blue-950 scrollbar-track-gray-100 shadow-sm">
                <div dangerouslySetInnerHTML={{ __html: selectedText }} />
              </div>
              <div className="p-4 bg-gray-50 rounded-b-lg flex justify-end">
                <button
                  className="bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400 transition duration-200 text-sm"
                  onClick={() => setIsTextModalOpen(false)}
                >
                  Fermer
                </button>
              </div>
            </div>
          </ResizableBox>
        </Draggable>
      </div>

      <style>{`
        .animate-fade-in {
          animation: fadeIn 0.5s ease-in;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scrollbar {
          scrollbar-width: auto;
          scrollbar-color: #1e3a8a #f3f4f6;
        }
        .scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .scrollbar::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        .scrollbar::-webkit-scrollbar-thumb {
          background-color: #1e3a8a;
          border-radius: 4px;
          border: 1px solid #f3f4f6;
        }
        .ql-container {
          font-size: 0.875rem;
        }
        .ql-editor {
          min-height: 150px;
        }
        .resizable {
          position: relative;
          overflow: hidden;
          border: 1px solid #1e3a8a;
          box-sizing: border-box;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .resizable .react-resizable-handle {
          background: transparent;
          opacity: 0.7;
          z-index: 100;
          transition: opacity 0.2s;
        }
        .resizable .react-resizable-handle:hover {
          opacity: 1;
        }
        .resizable .react-resizable-handle-n,
        .resizable .react-resizable-handle-s {
          height: 4px;
          width: 100%;
          top: -2px;
          cursor: ns-resize;
        }
        .resizable .react-resizable-handle-e,
        .resizable .react-resizable-handle-w {
          width: 4px;
          height: 100%;
          right: -2px;
          cursor: ew-resize;
        }
        .resizable .react-resizable-handle-ne,
        .resizable .react-resizable-handle-nw,
        .resizable .react-resizable-handle-se,
        .resizable .react-resizable-handle-sw {
          width: 8px;
          height: 8px;
          background: #1e3a8a;
          border-radius: 50%;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }
        .resizable .react-resizable-handle-ne {
          top: -4px;
          right: -4px;
          cursor: nesw-resize;
        }
        .resizable .react-resizable-handle-nw {
          top: -4px;
          left: -4px;
          cursor: nwse-resize;
        }
        .resizable .react-resizable-handle-se {
          bottom: -4px;
          right: -4px;
          cursor: nwse-resize;
        }
        .resizable .react-resizable-handle-sw {
          bottom: -4px;
          left: -4px;
          cursor: nesw-resize;
        }
      `}</style>
    </div>
  );
};

export default FlashNotif;