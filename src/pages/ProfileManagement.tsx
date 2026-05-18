import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useNotifications } from '../contexts/NotificationContext'; // adjust path if needed
import { useLocalApiUrl } from '../contexts/SettingsContext';

interface Compte {
  id_compte: number;
  email: string;
  name: string;
  prenom?: string | null;
  avatar_url?: string | null;
  id_entite?: number;
  profile_id?: number;
}

const EditProfile: React.FC = () => {
  const API_BASE_URL = useLocalApiUrl();
  const [currentUser, setCurrentUser] = useState<Compte | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [prenom, setPrenom] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCerticodeModalOpen, setIsCerticodeModalOpen] = useState(false);
  const [certicode, setCerticode] = useState('');
  const [timer, setTimer] = useState(60);

  const { addNotification } = useNotifications(); // ✅ use custom notification context

  const getAvatarUrl = (avatarUrl: string | null): string | null => {
    if (!avatarUrl) return null;
    return avatarUrl.startsWith('http')
      ? avatarUrl
      : `${API_BASE_URL}${avatarUrl}`;
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (storedUser) {
      const parsedUser: Compte = JSON.parse(storedUser);
      setCurrentUser(parsedUser);
      setEmail(parsedUser.email || '');
      setName(parsedUser.name || '');
      setPrenom(parsedUser.prenom || '');
      setAvatarPreview(getAvatarUrl(parsedUser.avatar_url) || null);
    }
  }, []);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (isCerticodeModalOpen) {
      timerId = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setIsCerticodeModalOpen(false);
            setCerticode('');
            toast.info('Le temps pour entrer le certicode est écoulé');
            addNotification('Le délai pour entrer le certicode est expiré.', 'error');
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isCerticodeModalOpen, addNotification]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Fichier trop volumineux (max 5MB)');
        addNotification('Fichier trop volumineux (max 5MB)', 'error');
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        toast.error('Seules les images JPEG, PNG ou GIF sont autorisées');
        addNotification('Format d’image non valide (JPEG, PNG ou GIF uniquement)', 'error');
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      toast.error('Utilisateur non chargé');
      addNotification("Erreur : impossible de charger l'utilisateur.", 'error');
      return;
    }

    const isEmailChanged = email !== currentUser.email;
    const isPasswordChanged = newPassword && newPassword !== '';

    if (isPasswordChanged && newPassword !== confirmNewPassword) {
      toast.error('Les nouveaux mots de passe ne correspondent pas');
      addNotification('Les nouveaux mots de passe ne correspondent pas.', 'error');
      return;
    }

    if (!currentPassword) {
      toast.error('Le mot de passe actuel est requis pour les mises à jour');
      addNotification('Le mot de passe actuel est requis pour modifier le profil.', 'error');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('currentPassword', currentPassword);
    formData.append('email', email || currentUser.email || '');
    formData.append('name', name || currentUser.name || '');
    formData.append('prenom', prenom || currentUser.prenom || '');
    formData.append('id_entite', String(currentUser.id_entite || ''));
    formData.append('profile_id', String(currentUser.profile_id || ''));
    formData.append('is_suspended', '0');
    formData.append('role', '');
    formData.append('useCustomPermissions', 'false');
    formData.append('permissions', JSON.stringify([]));

    if (isPasswordChanged) {
      formData.append('password', newPassword);
    }

    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }

    if (isCerticodeModalOpen && certicode) {
      formData.append('certicode', certicode);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/comptes/${currentUser.id_compte}`, {
        method: 'PUT',
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem(
          'user',
          JSON.stringify({
            ...currentUser,
            email,
            name,
            prenom,
            avatar_url: data.avatar_url || currentUser.avatar_url,
          })
        );

        setCurrentUser({
          ...currentUser,
          email,
          name,
          prenom,
          avatar_url: data.avatar_url || currentUser.avatar_url,
        });

        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setAvatarFile(null);
        setIsCerticodeModalOpen(false);
        setTimer(60);

        toast.success('Profil mis à jour avec succès ✅');
        addNotification('Votre profil a été mis à jour avec succès.', 'success');
      } else if (response.status === 202) {
        setIsCerticodeModalOpen(true);
        setTimer(60);
        toast.info('Certicode envoyé à votre email');
        addNotification('Un certicode a été envoyé à votre adresse e-mail.', 'success');
      } else {
        console.error('Erreur API:', data);
        toast.error(data.error || 'Échec de la mise à jour du compte');
        addNotification(data.error || 'Échec de la mise à jour du profil.', 'error');
      }
    } catch (err: any) {
      console.error('Erreur de mise à jour du profil:', err);
      toast.error('Une erreur est survenue lors de la mise à jour');
      addNotification('Une erreur est survenue lors de la mise à jour du profil.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Modifier le profil</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email :
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 border border-gray-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-gray-50"
          />
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Nom :
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 border border-gray-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-gray-50"
          />
        </div>

        <div>
          <label htmlFor="prenom" className="block text-sm font-medium text-gray-700">
            Prénom :
          </label>
          <input
            id="prenom"
            type="text"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            className="mt-1 border border-gray-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-gray-50"
          />
        </div>

        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
            Mot de passe actuel (requis) :
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 border border-gray-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-gray-50"
            required
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
            Nouveau mot de passe (facultatif) :
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 border border-gray-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-gray-50"
          />
        </div>

        <div>
          <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">
            Confirmer le nouveau mot de passe :
          </label>
          <input
            id="confirmNewPassword"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            className="mt-1 border border-gray-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-gray-50"
          />
        </div>

        <div>
          <label htmlFor="avatar" className="block text-sm font-medium text-gray-700">
            Avatar :
          </label>
          {avatarPreview && (
            <img
              src={avatarPreview}
              alt="Aperçu de l'avatar"
              className="w-32 h-32 object-cover rounded-full mb-2"
              onError={() => {
                console.error('Failed to load avatar:', avatarPreview);
                toast.error("Impossible de charger l'image de l'avatar");
                addNotification("Impossible de charger l'image de l'avatar", 'error');
                setAvatarPreview(null);
              }}
            />
          )}
          <input
            id="avatar"
            type="file"
            accept="image/jpeg,image/png,image/gif"
            onChange={handleAvatarChange}
            className="mt-1 border border-gray-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-gray-50"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Mise à jour...' : 'Confirmer'}
        </button>
      </form>

      {isCerticodeModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              Veuillez saisir votre certicode
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={certicode}
                  onChange={(e) => setCerticode(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#001861] transition bg-gray-50"
                  placeholder="Entrez le certicode"
                  required
                  autoFocus
                />
                <p className="text-sm text-gray-500 mt-2">
                  Temps restant: {timer} secondes
                </p>
              </div>
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCerticodeModalOpen(false);
                    setCerticode('');
                    setTimer(60);
                  }}
                  className="py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`py-2 px-4 bg-[#001861] text-white rounded-lg hover:bg-[#003087] transition ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Vérification en cours...' : 'Valider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditProfile;
