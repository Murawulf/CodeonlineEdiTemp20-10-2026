import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useLocalApiUrl } from '../contexts/SettingsContext';

interface TPO {
  id_tpo: number;
  raison_sociale: string;
  contact: string | null;
  email: string | null;
  mobile: string | null;
  statut: string;
  localite: string | null;
  pays: string | null;
  adresse: string | null;
  code_postale: string | null;
  web: string | null;
}

interface SortConfig {
  key: keyof TPO;
  direction: 'ascending' | 'descending';
}


const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium",
  "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
  "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad",
  "Chile", "China", "Colombia", "Comoros", "Congo (Congo-Brazzaville)", "Costa Rica", "Croatia", "Cuba", "Cyprus",
  "Czechia (Czech Republic)", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt",
  "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini (fmr. Swaziland)", "Ethiopia", "Fiji",
  "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala",
  "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran",
  "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo",
  "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania",
  "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania",
  "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
  "Myanmar (formerly Burma)", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger",
  "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine State", "Panama",
  "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
  "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino",
  "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore",
  "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain",
  "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan",
  "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States of America", "Uruguay",
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

const TPO: React.FC = () => {
  const API_BASE_URL = useLocalApiUrl();
  const [tpos, setTpos] = useState<TPO[]>([]);
  const [searchCountry, setSearchCountry] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [editingTPO, setEditingTPO] = useState<TPO | null>(null);
  const [editingField, setEditingField] = useState<{ id: number; field: string; value: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [isCountryOpen, setIsCountryOpen] = useState<boolean>(false);
  const [isActionOpen, setIsActionOpen] = useState<number | null>(null);
  const [isMainActionOpen, setIsMainActionOpen] = useState<boolean>(false);

  const countryRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const mainActionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, [searchCountry]);

  const filteredTpos = tpos.filter(tpo =>
    tpo.raison_sociale.toLowerCase().includes(searchText.toLowerCase()) ||
    (tpo.contact || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (tpo.email || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const paginatedTpos = filteredTpos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countryRef.current && !countryRef.current.contains(event.target as Node) &&
        mainActionRef.current && !mainActionRef.current.contains(event.target as Node)
      ) {
        setIsCountryOpen(false);
        setIsMainActionOpen(false);
      }
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        closeModal();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tpo`, {
        params: {
          pays: searchCountry,
        },
        withCredentials: true,
      });
      setTpos(response.data);
    } catch (error: any) {
      toast.error('Échec de la récupération des TPO');
      console.error('Fetch TPO error:', {
        message: error.message,
        response: error.response?.data,
      });
    }
  };

  const handleCountrySelect = (country: string) => {
    setSearchCountry(country);
    setIsCountryOpen(false);
    setCurrentPage(1);
  };

  const toggleRow = (id: number) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const openEditModal = (tpo: TPO | null) => {
    if (tpo) {
      setEditingTPO(tpo);
    } else {
      setEditingTPO({
        id_tpo: 0,
        raison_sociale: '',
        contact: null,
        email: null,
        mobile: null,
        statut: 'A',
        localite: null,
        pays: null,
        adresse: null,
        code_postale: null,
        web: null,
      });
    }
    setIsModalOpen(true);
    setIsActionOpen(null);
    setIsMainActionOpen(false);
  };

  const closeModal = () => {
    setEditingTPO(null);
    setIsModalOpen(false);
  };

  const handleEditField = async (id: number, field: string, value: string | null) => {
    try {
      await axios.put(
        `${API_BASE_URL}/api/tpo/update-field`,
        { id_tpo: id, field, value: value || null },
        { withCredentials: true }
      );
      setTpos(tpos.map(c => (c.id_tpo === id ? { ...c, [field]: value } : c)));
      setEditingField(null);
      const fieldLabels: { [key: string]: string } = {
        raison_sociale: 'Raison sociale',
        contact: 'Contact',
        email: 'Email',
        mobile: 'Mobile',
        adresse: 'Adresse',
        localite: 'Localité',
        code_postale: 'Code postal',
        web: 'Web',
      };
      toast.success(`${fieldLabels[field]} mise à jour avec succès`);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message;
      toast.error(`Échec de la mise à jour de ${field}: ${errorMessage}`);
      console.error('Edit field error:', {
        id_tpo: id,
        field,
        message: error.message,
        response: error.response?.data,
      });
    }
  };

  const handleFieldClick = (id: number, field: string, value: string | null) => {
    setEditingField({ id, field, value: value || '' });
  };

  const handleModalSave = async () => {
    if (!editingTPO) return;

    if (!editingTPO.raison_sociale.trim()) {
      toast.error('Raison sociale est requis');
      return;
    }
    if (!editingTPO.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editingTPO.email)) {
      toast.error('Un email valide est requis');
      return;
    }

    try {
      if (editingTPO.id_tpo === 0) {
        const response = await axios.post(
          `${API_BASE_URL}/api/tpo`,
          {
            raison_sociale: editingTPO.raison_sociale,
            contact: editingTPO.contact || null,
            email: editingTPO.email || null,
            mobile: editingTPO.mobile || null,
            statut: editingTPO.statut || 'A',
            localite: editingTPO.localite || null,
            pays: editingTPO.pays || null,
            adresse: editingTPO.adresse || null,
            code_postale: editingTPO.code_postale || null,
            web: editingTPO.web || null,
          },
          { withCredentials: true }
        );
        setTpos([...tpos, response.data]);
        toast.success('TPO créée avec succès');
        await fetchData();
      } else {
        await axios.put(
          `${API_BASE_URL}/api/tpo`,
          {
            id_tpo: editingTPO.id_tpo,
            raison_sociale: editingTPO.raison_sociale,
            contact: editingTPO.contact || null,
            email: editingTPO.email || null,
            mobile: editingTPO.mobile || null,
            statut: editingTPO.statut || 'A',
            localite: editingTPO.localite || null,
            pays: editingTPO.pays || null,
            adresse: editingTPO.adresse || null,
            code_postale: editingTPO.code_postale || null,
            web: editingTPO.web || null,
          },
          { withCredentials: true }
        );
        setTpos(
          tpos.map((c) =>
            c.id_tpo === editingTPO.id_tpo
              ? { ...c, ...editingTPO }
              : c
          )
        );
        toast.success('TPO mise à jour avec succès');
        await fetchData();
      }
      closeModal();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message;
      toast.error(
        `${editingTPO.id_tpo === 0 ? 'Échec de la création' : 'Échec de la mise à jour'}: ${errorMessage}`
      );
      console.error('Modal save error:', {
        id_tpo: editingTPO.id_tpo,
        message: error.message,
        response: error.response?.data,
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Confirmer la suppression ?')) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/tpo/${id}`, { withCredentials: true });
      setTpos(tpos.filter(c => c.id_tpo !== id));
      setIsActionOpen(null);
      toast.success('TPO supprimée avec succès');
    } catch (error: any) {
      toast.error('Échec de la suppression');
      console.error('Delete error:', {
        id_tpo: id,
        message: error.message,
        response: error.response?.data,
      });
    }
  };

  const handleSendConnection = async (email: string) => {
    try {
      await axios.post(
        `${API_BASE_URL}/api/send-connection`,
        { email },
        { withCredentials: true }
      );
      setIsActionOpen(null);
      toast.success('Détails de connexion envoyés avec succès');
    } catch (error: any) {
      toast.error('Échec de l\'envoi des détails');
      console.error('Send connection error:', {
        email,
        message: error.message,
        response: error.response?.data,
      });
    }
  };

  const handleToggleStatus = async (tpo: TPO) => {
    const newStatut = tpo.statut === 'A' ? 'I' : 'A';
    try {
      await axios.put(
        `${API_BASE_URL}/api/tpo`,
        { id_tpo: tpo.id_tpo, statut: newStatut },
        { withCredentials: true }
      );
      setTpos(tpos.map(c => (c.id_tpo === tpo.id_tpo ? { ...c, statut: newStatut } : c)));
      setIsActionOpen(null);
      toast.success(`TPO ${newStatut === 'A' ? 'activée' : 'suspendue'} avec succès`);
    } catch (error: any) {
      toast.error('Échec de la mise à jour du statut');
      console.error('Toggle status error:', {
        id_tpo: tpo.id_tpo,
        message: error.message,
        response: error.response?.data,
      });
    }
  };

  const handleSort = (key: keyof TPO) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);

    const sortedTpos = [...tpos].sort((a, b) => {
      let aValue: any = a[key];
      let bValue: any = b[key];

      if (['raison_sociale', 'contact', 'email', 'mobile', 'localite', 'pays', 'adresse', 'code_postale', 'web'].includes(key)) {
        aValue = aValue || '';
        bValue = bValue || '';
      }

      if (aValue === bValue) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      if (typeof aValue === 'string') {
        return direction === 'ascending' ? aValue.localeCompare(bValue, undefined, { sensitivity: 'base' }) : bValue.localeCompare(aValue, undefined, { sensitivity: 'base' });
      }

      return direction === 'ascending' ? aValue - bValue : bValue - aValue;
    });

    setTpos(sortedTpos);
  };

  const toggleActionDropdown = (id: number) => {
    setIsActionOpen(isActionOpen === id ? null : id);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil(filteredTpos.length / itemsPerPage) || 1;

  return (
    <div className="min-h-screen">
      <span style={{ color: '#3b82f6', position: 'relative', top: '-14px' }}>Paramètres /</span>
      <span style={{ color: '#3b82f6', position: 'relative', top: '-14px' }}>TPO</span>
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="container mx-auto p-6 w-[95vw]">
        <div className="mb-4">
          <table className="w-full table-fixed">
            <tbody>
              <tr>
                <td className="w-[15%] px-2">
                  <div className="relative" ref={countryRef}>
                    <label className="block text-sm text-gray-700 mb-1">Pays</label>
                    <div
                      className="p-2 border-2 border-gray-400 rounded-md cursor-pointer bg-white text-sm hover:bg-gray-50 w-full flex justify-between items-center h-10"
                      onClick={() => setIsCountryOpen(!isCountryOpen)}
                    >
                      <span className="truncate">{searchCountry || 'Choisir un pays'}</span>
                      <span className="text-blue-950">{isCountryOpen ? '▲' : '▼'}</span>
                    </div>
                    {isCountryOpen && (
                      <div className="absolute z-10 mt-2 w-full bg-white border-2 border-gray-400 rounded-md shadow-lg max-h-[40vh] overflow-auto">
                        <div
                          className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                          onClick={() => handleCountrySelect('')}
                        >
                          Tous les pays
                        </div>
                        {countries.map(country => (
                          <div
                            key={country}
                            className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                            onClick={() => handleCountrySelect(country)}
                          >
                            {country}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td className="w-[15%] px-2">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">‎ </label>
                    <input
                      type="text"
                      value={searchText}
                      onChange={e => {
                        setSearchText(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="🔍︎ Rechercher"
                      className="w-full p-2 border-2 border-gray-400 rounded-md text-sm h-10"
                    />
                  </div>
                </td>
                <td className="w-[15%] px-2">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Total TPO</label>
                    <div className="w-full p-2 border-2 border-gray-400 rounded-md text-sm h-10 flex items-center justify-center">
                      {tpos.length}
                    </div>
                  </div>
                </td>
                <td className="w-[15%] px-2">
                  <div className="relative" ref={mainActionRef}>
                    <label className="block text-sm text-gray-700 mb-1">‎ </label>
                    <button
                      className="w-full px-4 py-2 bg-blue-950 text-white rounded-md hover:bg-blue-900 h-10 text-sm"
                      onClick={() => setIsMainActionOpen(!isMainActionOpen)}
                    >
                      Actions
                    </button>
                    {isMainActionOpen && (
                      <div className="absolute z-10 mt-2 w-full bg-white rounded shadow-lg">
                        <div
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          onClick={() => openEditModal(null)}
                        >
                          Ajouter TPO
                        </div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="w-[15%] px-2">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">‎ </label>
                    <select
                      value={itemsPerPage}
                      onChange={e => {
                        setItemsPerPage(parseInt(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="w-24 p-2 border-2 border-gray-400 rounded-md text-sm h-10"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-blue-950 text-white">
              <tr className="text-left">
                <th className="px-6 py-3"></th>
                <th
                  className={`px-6 py-3 cursor-pointer hover:bg-blue-900 ${sortConfig?.key === 'raison_sociale' ? 'bg-blue-900' : ''}`}
                  onClick={() => handleSort('raison_sociale')}
                >
                  Raison Sociale
                </th>
                <th
                  className={`px-6 py-3 cursor-pointer hover:bg-blue-900 ${sortConfig?.key === 'contact' ? 'bg-blue-900' : ''}`}
                  onClick={() => handleSort('contact')}
                >
                  Contact
                </th>
                <th
                  className={`px-6 py-3 cursor-pointer hover:bg-blue-900 ${sortConfig?.key === 'email' ? 'bg-blue-900' : ''}`}
                  onClick={() => handleSort('email')}
                >
                  Email
                </th>
                <th
                  className={`px-6 py-3 cursor-pointer hover:bg-blue-900 ${sortConfig?.key === 'mobile' ? 'bg-blue-900' : ''}`}
                  onClick={() => handleSort('mobile')}
                >
                  Mobile
                </th>
                <th
                  className={`px-6 py-3 cursor-pointer hover:bg-blue-900 ${sortConfig?.key === 'localite' ? 'bg-blue-900' : ''}`}
                  onClick={() => handleSort('localite')}
                >
                  Localité
                </th>
                <th
                  className={`px-6 py-3 cursor-pointer hover:bg-blue-900 ${sortConfig?.key === 'statut' ? 'bg-blue-900' : ''}`}
                  onClick={() => handleSort('statut')}
                >
                  Statut
                </th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTpos.map(tpo => (
                <React.Fragment key={tpo.id_tpo}>
                  <tr className="border-b">
                    <td className="px-6 py-4">
                      <button
                        className="text-blue-950 hover:text-blue-900"
                        onClick={() => toggleRow(tpo.id_tpo)}
                      >
                        {expandedRow === tpo.id_tpo ? '-' : '+'}
                      </button>
                    </td>
                    <td
                      className="px-6 py-4 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleFieldClick(tpo.id_tpo, 'raison_sociale', tpo.raison_sociale || '')}
                    >
                      {editingField?.id === tpo.id_tpo && editingField?.field === 'raison_sociale' ? (
                        <input
                          type="text"
                          value={editingField.value}
                          onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                          onBlur={() => handleEditField(tpo.id_tpo, 'raison_sociale', editingField.value)}
                          className="w-full p-1 border rounded"
                          autoFocus
                        />
                      ) : (
                        tpo.raison_sociale || 'N/A'
                      )}
                    </td>
                    <td
                      className="px-6 py-4 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleFieldClick(tpo.id_tpo, 'contact', tpo.contact || '')}
                    >
                      {editingField?.id === tpo.id_tpo && editingField?.field === 'contact' ? (
                        <input
                          type="text"
                          value={editingField.value}
                          onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                          onBlur={() => handleEditField(tpo.id_tpo, 'contact', editingField.value)}
                          className="w-full p-1 border rounded"
                          autoFocus
                        />
                      ) : (
                        tpo.contact || 'N/A'
                      )}
                    </td>
                    <td
                      className="px-6 py-4 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleFieldClick(tpo.id_tpo, 'email', tpo.email || '')}
                    >
                      {editingField?.id === tpo.id_tpo && editingField?.field === 'email' ? (
                        <input
                          type="email"
                          value={editingField.value}
                          onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                          onBlur={() => handleEditField(tpo.id_tpo, 'email', editingField.value)}
                          className="w-full p-1 border rounded"
                          autoFocus
                        />
                      ) : (
                        tpo.email || 'N/A'
                      )}
                    </td>
                    <td
                      className="px-6 py-4 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleFieldClick(tpo.id_tpo, 'mobile', tpo.mobile || '')}
                    >
                      {editingField?.id === tpo.id_tpo && editingField?.field === 'mobile' ? (
                        <input
                          type="text"
                          value={editingField.value}
                          onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                          onBlur={() => handleEditField(tpo.id_tpo, 'mobile', editingField.value)}
                          className="w-full p-1 border rounded"
                          autoFocus
                        />
                      ) : (
                        tpo.mobile || 'N/A'
                      )}
                    </td>
                    <td
                      className="px-6 py-4 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleFieldClick(tpo.id_tpo, 'localite', tpo.localite || '')}
                    >
                      {editingField?.id === tpo.id_tpo && editingField?.field === 'localite' ? (
                        <input
                          type="text"
                          value={editingField.value}
                          onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                          onBlur={() => handleEditField(tpo.id_tpo, 'localite', editingField.value)}
                          className="w-full p-1 border rounded"
                          autoFocus
                        />
                      ) : (
                        tpo.localite || 'N/A'
                      )}
                    </td>
                    <td className="px-6 py-4">{tpo.statut === 'A' ? 'Active' : 'Inactive'}</td>
                    <td className="px-6 py-4 relative">
                      <button
                        className="px-4 py-2 bg-blue-950 text-white rounded hover:bg-blue-900"
                        onClick={() => toggleActionDropdown(tpo.id_tpo)}
                      >
                        Actions
                      </button>
                      {isActionOpen === tpo.id_tpo && (
                        <div className="absolute z-10 right-0 mt-2 w-48 bg-white rounded shadow-lg">
                          <div
                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => openEditModal(tpo)}
                          >
                            Modifier
                          </div>
                          <div
                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleDelete(tpo.id_tpo)}
                          >
                            Supprimer
                          </div>
                          <div
                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleSendConnection(tpo.email || '')}
                          >
                            Envoyer Connexion
                          </div>
                          <div
                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleToggleStatus(tpo)}
                          >
                            {tpo.statut === 'A' ? 'Suspendre' : 'Activer'}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expandedRow === tpo.id_tpo && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <span>Adresse:</span>
                            <span
                              className="cursor-pointer hover:bg-gray-100 ml-2"
                              onClick={() => handleFieldClick(tpo.id_tpo, 'adresse', tpo.adresse || '')}
                            >
                              {editingField?.id === tpo.id_tpo && editingField?.field === 'adresse' ? (
                                <input
                                  type="text"
                                  value={editingField.value}
                                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                                  onBlur={() => handleEditField(tpo.id_tpo, 'adresse', editingField.value)}
                                  className="w-full p-1 border rounded"
                                  autoFocus
                                />
                              ) : (
                                tpo.adresse || 'N/A'
                              )}
                            </span>
                          </div>
                          <div>
                            <span>Code postal:</span>
                            <span
                              className="cursor-pointer hover:bg-gray-100 ml-2"
                              onClick={() => handleFieldClick(tpo.id_tpo, 'code_postale', tpo.code_postale || '')}
                            >
                              {editingField?.id === tpo.id_tpo && editingField?.field === 'code_postale' ? (
                                <input
                                  type="text"
                                  value={editingField.value}
                                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                                  onBlur={() => handleEditField(tpo.id_tpo, 'code_postale', editingField.value)}
                                  className="w-full p-1 border rounded"
                                  autoFocus
                                />
                              ) : (
                                tpo.code_postale || 'N/A'
                              )}
                            </span>
                          </div>
                          <div>
                            <span>Web:</span>
                            <span
                              className="cursor-pointer hover:bg-gray-100 ml-2"
                              onClick={() => handleFieldClick(tpo.id_tpo, 'web', tpo.web || '')}
                            >
                              {editingField?.id === tpo.id_tpo && editingField?.field === 'web' ? (
                                <input
                                  type="text"
                                  value={editingField.value}
                                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                                  onBlur={() => handleEditField(tpo.id_tpo, 'web', editingField.value)}
                                  className="w-full p-1 border rounded"
                                  autoFocus
                                />
                              ) : (
                                tpo.web || 'N/A'
                              )}
                            </span>
                          </div>
                          <div>
                            <span>Pays:</span>
                            <span className="ml-2">{tpo.pays || 'N/A'}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!paginatedTpos.length && (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-600">
                    Aucune TPO trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6">
            <button
              className="px-4 py-2 bg-blue-950 text-white rounded hover:bg-blue-900 disabled:bg-gray-400"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Précédente
            </button>
            <span>Page {currentPage} de {totalPages}</span>
            <button
              className="px-4 py-2 bg-blue-950 text-white rounded hover:bg-blue-900 disabled:bg-gray-400"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Suivante
            </button>
          </div>
        )}
        <button
          className="fixed bottom-4 right-4 bg-blue-950 text-white rounded-full w-12 h-12 flex items-center justify-center hover:bg-blue-900 shadow-lg"
          onClick={scrollToTop}
          title="Retour en haut"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
        {isModalOpen && editingTPO && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div ref={modalRef} className="bg-white p-6 rounded-lg w-1/2 max-h-[80vh] overflow-y-auto">
              <h2 className="text-lg mb-4">{editingTPO.id_tpo === 0 ? 'Ajouter TPO' : 'Modifier TPO'}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700">Raison Sociale *</label>
                  <input
                    type="text"
                    value={editingTPO.raison_sociale || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, raison_sociale: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Contact</label>
                  <input
                    type="text"
                    value={editingTPO.contact || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, contact: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Email *</label>
                  <input
                    type="email"
                    value={editingTPO.email || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, email: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Mobile</label>
                  <input
                    type="text"
                    value={editingTPO.mobile || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, mobile: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Adresse</label>
                  <input
                    type="text"
                    value={editingTPO.adresse || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, adresse: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Localité</label>
                  <input
                    type="text"
                    value={editingTPO.localite || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, localite: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Code Postal</label>
                  <input
                    type="text"
                    value={editingTPO.code_postale || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, code_postale: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Web</label>
                  <input
                    type="text"
                    value={editingTPO.web || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, web: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Pays</label>
                  <select
                    value={editingTPO.pays || ''}
                    onChange={e => setEditingTPO({ ...editingTPO, pays: e.target.value || null })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  >
                    <option value="">Sélectionner</option>
                    {countries.map(country => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700">Statut</label>
                  <select
                    value={editingTPO.statut || 'A'}
                    onChange={e => setEditingTPO({ ...editingTPO, statut: e.target.value })}
                    className="w-full p-2 border-2 border-gray-400 rounded-md text-sm"
                  >
                    <option value="A">Active</option>
                    <option value="I">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-4">
                <button
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  onClick={closeModal}
                >
                  Annuler
                </button>
                <button
                  className="px-4 py-2 bg-blue-950 text-white rounded hover:bg-blue-900"
                  onClick={handleModalSave}
                >
                  Sauvegarder
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TPO;