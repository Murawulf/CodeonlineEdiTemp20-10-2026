import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useApi } from '../hooks/useApi';
import { useLocalApiUrl } from '../contexts/SettingsContext';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Transporteur = {
  id: number;
  type: 'Permanent' | 'Variable';
  transit_jours: number | '';
  port_embarquement: string;
  port_debarquement: string;
  transbordement: 'Oui' | 'Non';
  satisfaction: number; // 0-5
  commentaire: string;
};

type VolumeRow = {
  periode: string;
  vingt: number | '';
  quarante: number | '';
  frigo: number | '';
};

type FrequenceRow = {
  periode: string;
  nb_expeditions: number | '';
};

type EnqueteForm = {
  
  id_entite: number | '';
  raison_sociale: string;
  identifiant_fiscal: string;
  secteur: string;
  flux: string;
  pays: string;
  volumes: VolumeRow[];
  groupage: 'oui' | 'non' | '';
  frequences: FrequenceRow[];
  transporteurs: Transporteur[];
  difficultes: string[];
  foprodex: 'oui' | 'non' | '';
  besoins_transport: string;
  classification_type: 'national' | 'gpc' | '';

gsa: string;
sous_gsa: string;

segment_code: string;
segment_libelle: string;
};

type Segment = {
  code: string;
  libelle: string;
  libelle_en?: string;
  libelle_ar?: string;
  status?: string;
};

type EnqueteRecord = {
  id_enquete: number;
  id_entite: number;
  raison_sociale: string;
  secteur: string;
  flux: string;
  pays: string;
  date_enquete: string;
  foprodex: string;
};

const PERIODES_VOLUME: string[] = [
  'Global 2025',
  '1er semestre 2026',
  'Prévision 2ème semestre 2026',
  'Prévision 1er semestre 2027',
];

const DIFFICULTES_OPTIONS = [
  'Coût du transport',
  'Délais de transit',
  'Douane',
  'Disponibilité conteneurs',
  'Documentation',
  'Transbordement',
  'Financement',
];

const PAYS_OPTIONS = [
  'Libye', 'Sénégal', "Côte d'Ivoire", 'Mali',
  'Burkina Faso', 'Guinée', 'Gambie',
];

const SECTEUR_OPTIONS = [
  'Agriculture et IAA',
  'Industries mécaniques',
  'Industries électriques',
  'Textile',
  'Mines & Phosphates',
  'Autres',
];
const GSA_DATA = {
  "Agriculture et IAA": [
    "Produits de la boulangerie",
    "Boissons",
    "Préparations alimentaires",
    "Produits laitiers"
  ],

  "Industries mécaniques": [
    "Pièces automobiles",
    "Machines industrielles",
    "Équipements mécaniques"
  ],

  "Industries électriques": [
    "Câbles",
    "Équipements électriques",
    "Composants électroniques"
  ],

  "Textile": [
    "Vêtements",
    "Tissus",
    "Articles textiles"
  ],

  "Mines & Phosphates": [
    "Phosphates",
    "Produits dérivés",
    "Minéraux"
  ],

  "Autres": [
    "Divers"
  ]
};

const defaultForm = (): EnqueteForm => ({
  id_entite: '',
  raison_sociale: '',
  identifiant_fiscal: '',
  classification_type: '',

gsa: '',
sous_gsa: '',

segment_code: '',
segment_libelle: '',
  secteur: '',
  flux: '',
  pays: '',
  volumes: PERIODES_VOLUME.map(p => ({ periode: p, vingt: '', quarante: '', frigo: '' })),
  groupage: '',
  frequences: PERIODES_VOLUME.map(p => ({ periode: p, nb_expeditions: '' })),
  transporteurs: [makeTransporteur(1)],
  difficultes: [],
  foprodex: '',
  besoins_transport: '',
  
});

let _transporteurIdCounter = 1;
function makeTransporteur(id?: number): Transporteur {
  return {
    id: id ?? ++_transporteurIdCounter,
    type: 'Permanent',
    transit_jours: '',
    port_embarquement: '',
    port_debarquement: '',
    transbordement: 'Non',
    satisfaction: 0,
    commentaire: '',
  };
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const Enquete = () => {
  const api = useApi();
  const API_BASE_URL = useLocalApiUrl();

  const [enquetes, setEnquetes] = useState<EnqueteRecord[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<EnqueteForm>(defaultForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof EnqueteRecord; direction: 'asc' | 'desc' } | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const addNotification = (msg: string, type: 'success' | 'error') => console.log(`[${type}] ${msg}`);

  // ─── DATA FETCHING ─────────────────────────────────────────────────────────

  const fetchEnquetes = async () => {
    try {
      const res = await api.get('/api/enquetes', { withCredentials: true });
      setEnquetes(res.data || []);
    } catch (err) {
      console.error('Fetch enquetes error:', err);
      addNotification('Échec du chargement des enquêtes', 'error');
    }
  };


  const fetchSegments = async () => {
    try {
      const response = await api.get('/api/segments', { withCredentials: true });
      setSegments(response.data || []);
    } catch (err) {
      console.error('Fetch segments error:', err);
      addNotification('Échec du chargement des segments', 'error');
    }
  };

  useEffect(() => {
    fetchEnquetes();
    fetchSegments();
  }, []);


  // ─── TABLE HELPERS ─────────────────────────────────────────────────────────

  const sortedEnquetes = [...enquetes].sort((a, b) => {
    if (!sortConfig) return 0;
    const av = a[sortConfig.key] ?? '';
    const bv = b[sortConfig.key] ?? '';
    const cmp = String(av).localeCompare(String(bv));
    return sortConfig.direction === 'asc' ? cmp : -cmp;
  });

  const filteredEnquetes = sortedEnquetes.filter(e =>
    e.raison_sociale.toLowerCase().includes(searchText.toLowerCase()) ||
    e.secteur.toLowerCase().includes(searchText.toLowerCase()) ||
    e.pays.toLowerCase().includes(searchText.toLowerCase())
  );

  const paginatedEnquetes = filteredEnquetes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.max(1, Math.ceil(filteredEnquetes.length / itemsPerPage));

  const handleSort = (key: keyof EnqueteRecord) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  // ─── FORM HELPERS ──────────────────────────────────────────────────────────

  const openNewModal = () => {
    setForm(defaultForm());
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEditModal = async (id: number) => {
    try {
      const res = await api.get(`/api/enquetes/${id}`, { withCredentials: true });
      const data = res.data;
      setForm({
        id_entite: data.id_entite,
        raison_sociale: data.raison_sociale,
        identifiant_fiscal: data.identifiant_fiscal || '',
        secteur: data.secteur,
        flux: data.flux,
        pays: data.pays,
        volumes: data.volumes ?? PERIODES_VOLUME.map(p => ({ periode: p, vingt: '', quarante: '', frigo: '' })),
        groupage: data.groupage || '',
        frequences: data.frequences ?? PERIODES_VOLUME.map(p => ({ periode: p, nb_expeditions: '' })),
        transporteurs: data.transporteurs ?? [makeTransporteur()],
        difficultes: data.difficultes ?? [],
        foprodex: data.foprodex || '',
        besoins_transport: data.besoins_transport || '',
        classification_type: data.classification_type || '',
gsa: data.gsa || '',
sous_gsa: data.sous_gsa || '',
segment_code: data.segment_code || '',
segment_libelle: data.segment_libelle || '',
      });
      setEditingId(id);
      setIsModalOpen(true);
    } catch {
      addNotification("Impossible de charger l'enquête", 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Supprimer cette enquête ?')) return;
    try {
      await api.delete(`/api/enquetes/${id}`, { withCredentials: true });
      addNotification('Enquête supprimée', 'success');
      fetchEnquetes();
    } catch {
      addNotification('Échec suppression', 'error');
    }
  };

  const handleSave = async () => {
    if (!form.raison_sociale.trim()) { addNotification('Raison sociale requise', 'error'); return; }
   if (!form.classification_type) {
  addNotification('Classification requise', 'error');
  return;
}

if (
  form.classification_type === 'national' &&
  (!form.gsa || !form.sous_gsa)
) {
  addNotification('GSA et Sous-GSA requis', 'error');
  return;
}

if (
  form.classification_type === 'gpc' &&
  !form.segment_code
) {
  addNotification('Segment GPC requis', 'error');
  return;
}
    if (!form.flux) { addNotification('Flux requis', 'error'); return; }
    if (!form.pays) { addNotification('Pays requis', 'error'); return; }
    setIsSaving(true);
    try {
      const payload = { ...form };
      if (editingId) {
        await api.put(`/api/enquetes/${editingId}`, payload, { withCredentials: true });
        addNotification('Enquête mise à jour', 'success');
      } else {
        await api.post('/api/enquetes', payload, { withCredentials: true });
        addNotification('Enquête enregistrée', 'success');
      }
      setIsModalOpen(false);
      fetchEnquetes();
    } catch (err: any) {
      addNotification(`Erreur: ${err?.response?.data?.error || err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── TRANSPORTEUR HELPERS ──────────────────────────────────────────────────

  const addTransporteur = () => {
    setForm(f => ({ ...f, transporteurs: [...f.transporteurs, makeTransporteur()] }));
  };

  const removeTransporteur = (id: number) => {
    setForm(f => ({ ...f, transporteurs: f.transporteurs.filter(t => t.id !== id) }));
  };

  const updateTransporteur = (id: number, field: keyof Transporteur, value: any) => {
    setForm(f => ({
      ...f,
      transporteurs: f.transporteurs.map(t => t.id === id ? { ...t, [field]: value } : t),
    }));
  };

  // ─── STAR RATING ──────────────────────────────────────────────────────────

  const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
    const [hovered, setHovered] = useState(0);
    const labels = ['', 'Très insatisfait', 'Insatisfait', 'Neutre', 'Satisfait', 'Très satisfait'];
    return (
      <div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <span
              key={i}
              style={{ fontSize: 26, cursor: 'pointer', lineHeight: 1, userSelect: 'none', color: i <= (hovered || value) ? '#c9a820' : '#d1d5db', transition: 'color .1s' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => onChange(i)}
            >★</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {value ? `${labels[value]} (${value}/5)` : 'Non évalué'}
        </div>
      </div>
    );
  };

  // ─── STYLES SHARED ────────────────────────────────────────────────────────

  const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none', fontFamily: "'DM Sans', sans-serif" } as React.CSSProperties;
  const lbl = { fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 600, marginBottom: 4, display: 'block' };
  const sel = { ...inp, appearance: 'none' as const };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em', borderLeft: '3px solid var(--accent)', paddingLeft: 10, marginBottom: 16 }}>
      {children}
    </div>
  );

  const Divider = () => <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />;

  // ─── MODAL CONTENT ────────────────────────────────────────────────────────

  const renderModal = () => (
    <Draggable handle=".modal-handle">
      <div className="enq-modal-overlay">
        <div className="enq-modal" ref={modalRef}>

          {/* Header */}
          <div className="ent-modal-header modal-handle">
            <div>
              <div className="ent-modal-title">{editingId ? 'Modifier l\'enquête' : 'Nouvelle enquête'}</div>
              <div className="ent-modal-subtitle">Transport Logistique Afrique de l'Ouest — CEPEX</div>
            </div>
            <button className="ent-modal-close" onClick={() => setIsModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
          </div>

          {/* Body */}
          <div className="ent-modal-body" style={{ padding: 28 }}>

            {/* ── Section 1: Informations générales */}
            <SectionTitle>Informations générales</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
              <div>
                <label style={lbl}>Raison sociale *</label>
                <input style={inp} value={form.raison_sociale} onChange={e => setForm(f => ({ ...f, raison_sociale: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Identifiant fiscal</label>
                <input style={inp} value={form.identifiant_fiscal} onChange={e => setForm(f => ({ ...f, identifiant_fiscal: e.target.value }))} />
              </div>
         <div>
  <label style={lbl}>Type de classification *</label>

  <select
    style={sel}
    value={form.classification_type}
    onChange={e =>
      setForm(f => ({
        ...f,
        classification_type: e.target.value as any,
        gsa: '',
        sous_gsa: '',
        segment_code: '',
        segment_libelle: '',
        secteur: ''
      }))
    }
  >
    <option value="">Choisir</option>
    <option value="national">Classification Nationale</option>
    <option value="gpc">Classification GPC</option>
  </select>
</div>
{form.classification_type === 'national' && (
  <>
    <div>
      <label style={lbl}>GSA *</label>

      <select
        style={sel}
        value={form.gsa}
        onChange={e =>
          setForm(f => ({
            ...f,
            gsa: e.target.value,
            sous_gsa: '',
            secteur: e.target.value
          }))
        }
      >
        <option value="">Choisir</option>

        {Object.keys(GSA_DATA).map(gsa => (
          <option key={gsa} value={gsa}>
            {gsa}
          </option>
        ))}
      </select>
    </div>

    <div>
      <label style={lbl}>Sous GSA *</label>

      <select
        style={sel}
        value={form.sous_gsa}
        onChange={e =>
          setForm(f => ({
            ...f,
            sous_gsa: e.target.value
          }))
        }
      >
        <option value="">Choisir</option>

        {form.gsa &&
          GSA_DATA[form.gsa as keyof typeof GSA_DATA]?.map(item => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
      </select>
    </div>
  </>
)}
{form.classification_type === 'gpc' && (
  <div>
    <label style={lbl}>Segment GPC *</label>

    <select
      style={sel}
      value={form.segment_code}
      onChange={e => {
        const seg = segments.find(
          s => s.code === e.target.value
        );

        setForm(f => ({
          ...f,
          segment_code: seg?.code || '',
          segment_libelle: seg?.libelle || '',
          secteur: seg?.libelle || ''
        }));
      }}
    >
      <option value="">Choisir</option>

      {segments.map(segment => (
        <option
          key={segment.code}
          value={segment.code}
        >
          {segment.libelle}
        </option>
      ))}
    </select>
  </div>
)}
              <div>
                <label style={lbl}>Flux *</label>
                <select style={sel} value={form.flux} onChange={e => setForm(f => ({ ...f, flux: e.target.value }))}>
                  <option value="">Choisir</option>
                  <option>Export</option>
                  <option>Import</option>
                  <option>Import/Export</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Pays *</label>
                <select style={sel} value={form.pays} onChange={e => setForm(f => ({ ...f, pays: e.target.value }))}>
                  <option value="">Choisir</option>
                  {PAYS_OPTIONS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <Divider />

            {/* ── Section 2: Volume des conteneurs */}
            <SectionTitle>Volume des conteneurs</SectionTitle>
            <div style={{ overflowX: 'auto', marginBottom: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead>
                  <tr>
                    {['Période', "20'", "40'", 'Frigorifique'].map(h => (
                      <th key={h} style={{ background: 'var(--accent)', color: 'white', padding: '9px 12px', textAlign: 'left', fontSize: 12, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.volumes.map((row, i) => (
                    <tr key={row.periode} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{row.periode}</td>
                      {(['vingt', 'quarante', 'frigo'] as const).map(field => (
                        <td key={field} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                          <input type="number" min="0" style={{ ...inp, padding: '5px 8px' }} value={row[field]} onChange={e => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setForm(f => ({ ...f, volumes: f.volumes.map((r, idx) => idx === i ? { ...r, [field]: val } : r) }));
                          }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <label style={lbl}>Avez-vous déjà utilisé le transport en groupage ?</label>
              <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                {['oui', 'non'].map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
                    <input type="radio" name="groupage" checked={form.groupage === v} onChange={() => setForm(f => ({ ...f, groupage: v as any }))} style={{ accentColor: 'var(--accent)' }} />
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            <Divider />

            {/* ── Section 3: Fréquence */}
            <SectionTitle>Fréquence des expéditions</SectionTitle>
            <div style={{ overflowX: 'auto', marginBottom: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
                <thead>
                  <tr>
                    {['Période', "Nombre d'expéditions"].map(h => (
                      <th key={h} style={{ background: 'var(--accent)', color: 'white', padding: '9px 12px', textAlign: 'left', fontSize: 12, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.frequences.map((row, i) => (
                    <tr key={row.periode} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{row.periode}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                        <input type="number" min="0" style={{ ...inp, padding: '5px 8px', maxWidth: 160 }} value={row.nb_expeditions} onChange={e => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setForm(f => ({ ...f, frequences: f.frequences.map((r, idx) => idx === i ? { ...r, nb_expeditions: val } : r) }));
                        }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Divider />

            {/* ── Section 4: Transporteurs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <SectionTitle>Transporteurs</SectionTitle>
              <button onClick={addTransporteur} style={{ background: '#1f9d55', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: "'Syne', sans-serif", fontWeight: 600, cursor: 'pointer' }}>
                + Ajouter
              </button>
            </div>

            {form.transporteurs.map((t, idx) => (
              <div key={t.id} style={{ border: '1px dashed var(--accent)', borderRadius: 12, padding: 18, marginBottom: 14, background: 'rgba(23,37,84,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Transporteur #{idx + 1}</span>
                  {form.transporteurs.length > 1 && (
                    <button onClick={() => removeTransporteur(t.id)} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                      Supprimer
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={lbl}>Type</label>
                    <select style={sel} value={t.type} onChange={e => updateTransporteur(t.id, 'type', e.target.value as any)}>
                      <option>Permanent</option>
                      <option>Variable</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Transit (jours)</label>
                    <input type="number" min="0" style={inp} value={t.transit_jours} onChange={e => updateTransporteur(t.id, 'transit_jours', e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={lbl}>Port embarquement</label>
                    <input style={inp} value={t.port_embarquement} onChange={e => updateTransporteur(t.id, 'port_embarquement', e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Port débarquement</label>
                    <input style={inp} value={t.port_debarquement} onChange={e => updateTransporteur(t.id, 'port_debarquement', e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Transbordement</label>
                    <select style={sel} value={t.transbordement} onChange={e => updateTransporteur(t.id, 'transbordement', e.target.value as any)}>
                      <option>Oui</option>
                      <option>Non</option>
                    </select>
                  </div>
                </div>

                {/* Satisfaction + comment */}
                <div style={{ display: 'flex', gap: 20, marginTop: 16, paddingTop: 16, borderTop: '1px dashed rgba(23,37,84,0.2)', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 180 }}>
                    <label style={{ ...lbl, marginBottom: 8 }}>Niveau de satisfaction</label>
                    <StarRating value={t.satisfaction} onChange={v => updateTransporteur(t.id, 'satisfaction', v)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <label style={lbl}>Commentaire</label>
                    <textarea
                      value={t.commentaire}
                      onChange={e => updateTransporteur(t.id, 'commentaire', e.target.value)}
                      placeholder="Qualité de service, ponctualité, communication..."
                      style={{ ...inp, resize: 'vertical', minHeight: 70 }}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Divider />

            {/* ── Section 5: Difficultés */}
            <SectionTitle>Difficultés rencontrées</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 4 }}>
              {DIFFICULTES_OPTIONS.map(d => (
                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: form.difficultes.includes(d) ? 'rgba(23,37,84,0.06)' : 'var(--surface2)', border: `1px solid ${form.difficultes.includes(d) ? 'rgba(23,37,84,0.25)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', fontSize: 12, color: 'var(--text2)' }}>
                  <input
                    type="checkbox"
                    checked={form.difficultes.includes(d)}
                    onChange={() => setForm(f => ({
                      ...f,
                      difficultes: f.difficultes.includes(d)
                        ? f.difficultes.filter(x => x !== d)
                        : [...f.difficultes, d],
                    }))}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                  />
                  {d}
                </label>
              ))}
            </div>

            <Divider />

            {/* ── Section 6: FOPRODEX */}
            <SectionTitle>FOPRODEX</SectionTitle>
            <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
              {['oui', 'non'].map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
                  <input type="radio" name="foprodex_modal" checked={form.foprodex === v} onChange={() => setForm(f => ({ ...f, foprodex: v as any }))} style={{ accentColor: 'var(--accent)' }} />
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </label>
              ))}
            </div>

            <Divider />

            {/* ── Section 7: Besoins */}
            <SectionTitle>Besoin en transport logistiques</SectionTitle>
            <textarea
              value={form.besoins_transport}
              onChange={e => setForm(f => ({ ...f, besoins_transport: e.target.value }))}
              placeholder="Décrivez vos besoins en transport logistiques..."
              rows={4}
              style={{ ...inp, resize: 'vertical' }}
            />
          </div>

          {/* Footer */}
          <div className="ent-modal-footer">
            <button className="ent-btn-secondary" onClick={() => setIsModalOpen(false)}>Annuler</button>
            <button className="ent-btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Enregistrement…' : editingId ? 'Mettre à jour' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </Draggable>
  );

  // ─── EXPANDED ROW DETAIL ──────────────────────────────────────────────────

  const renderExpandedDetail = (e: EnqueteRecord) => (
    <tr>
      <td colSpan={7} style={{ padding: 0 }}>
        <div className="ent-expand-content" style={{ margin: '4px 12px 8px' }}>
          <div className="ent-expand-grid">
            <div className="ent-expand-section">
              <h4>Entité</h4>
              <p>{e.raison_sociale}</p>
            </div>
            <div className="ent-expand-section">
              <h4>Secteur</h4>
              <p>{e.secteur || '—'}</p>
            </div>
            <div className="ent-expand-section">
              <h4>Flux</h4>
              <p>{e.flux || '—'}</p>
            </div>
            <div className="ent-expand-section">
              <h4>Pays</h4>
              <p>{e.pays || '—'}</p>
            </div>
            <div className="ent-expand-section">
              <h4>Date enquête</h4>
              <p>{e.date_enquete ? new Date(e.date_enquete).toLocaleDateString('fr-FR') : '—'}</p>
            </div>
            <div className="ent-expand-section">
              <h4>FOPRODEX</h4>
              <p>{e.foprodex ? (e.foprodex === 'oui' ? 'Oui' : 'Non') : '—'}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={() => openEditModal(e.id_enquete)} className="ent-btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}>Modifier</button>
            <button onClick={() => handleDelete(e.id_enquete)} className="ent-btn-danger" style={{ fontSize: 12, padding: '6px 14px' }}>Supprimer</button>
          </div>
        </div>
      </td>
    </tr>
  );

  // ─── SORT INDICATOR ───────────────────────────────────────────────────────

  const SortIcon = ({ field }: { field: keyof EnqueteRecord }) => {
    if (sortConfig?.key !== field) return <span style={{ opacity: 0.3, fontSize: 10 }}> ⇅</span>;
    return <span style={{ fontSize: 10, color: 'var(--accent)' }}>{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>;
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

        :root {
          --bg: #ffffff;
          --surface: #ffffff;
          --surface2: #f8fafc;
          --surface3: #f1f5f9;
          --border: #e2e8f0;
          --accent: #172554;
          --accent-text: #ffffff;
          --text: #0f172a;
          --text2: #334155;
          --muted: #64748b;
          --danger: #dc2626;
          --pill-bg: #eff6ff;
          --header-border: #cbd5e1;
          --expand-bg: #f8fafc;
          --shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .ent-header {
          background: var(--surface);
          border-bottom: 1px solid var(--header-border);
          padding: 20px 32px 16px;
          backdrop-filter: blur(14px);
          box-shadow: var(--shadow);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .ent-breadcrumb {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 500; color: var(--muted); margin-bottom: 12px;
        }
        .ent-breadcrumb .sep { color: var(--border); }
        .ent-breadcrumb .active { color: var(--accent); font-weight: 600; }
        .ent-title { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }

        .ent-filters {
          display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;
          padding: 16px 32px; border-bottom: 1px solid var(--border);
          background: var(--surface3);
        }
        .ent-filter-input {
          height: 36px; padding: 0 12px;
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 8px; color: var(--text); font-size: 13px;
          font-family: 'DM Sans', sans-serif; outline: none; min-width: 240px;
          transition: border-color 0.15s;
        }
        .ent-filter-input:focus { border-color: var(--accent); }
        .ent-filter-input::placeholder { color: var(--muted); }
        .ent-action-btn {
          height: 36px; padding: 0 16px;
          background: var(--accent); color: var(--accent-text);
          border: none; border-radius: 8px;
          font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: opacity 0.15s; display: flex; align-items: center; gap: 6px;
        }
        .ent-action-btn:hover { opacity: 0.88; }

        .ent-results-bar {
          padding: 10px 32px; display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--border);
          background: var(--surface3); font-size: 12px; color: var(--muted);
        }
        .ent-results-bar strong { color: var(--accent); font-weight: 600; }

        .ent-table-wrap { overflow-x: auto; padding: 16px 32px 32px; }
        .ent-table { width: 100%; border-collapse: separate; border-spacing: 0 3px; min-width: 700px; }
        .ent-table thead tr th {
          padding: 8px 12px; text-align: left;
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--muted); white-space: nowrap; user-select: none; cursor: pointer;
        }
        .ent-table thead tr th:hover { color: var(--accent); }
        .ent-table tbody tr { background: var(--surface); cursor: pointer; transition: background 0.12s; }
        .ent-table tbody tr:hover { background: var(--surface2); }
        .ent-table tbody tr.expanded { background: var(--surface2); }
        .ent-table tbody td {
          padding: 11px 12px; vertical-align: middle;
          border-top: 1px solid transparent; border-bottom: 1px solid transparent;
          transition: border-color 0.12s; font-size: 13px;
        }
        .ent-table tbody tr:hover td, .ent-table tbody tr.expanded td { border-color: var(--border); }
        .ent-table tbody tr td:first-child {
          border-left: 3px solid transparent; border-radius: 8px 0 0 8px; transition: border-color 0.12s;
        }
        .ent-table tbody tr:hover td:first-child, .ent-table tbody tr.expanded td:first-child { border-left-color: var(--accent); }
        .ent-table tbody tr td:last-child { border-radius: 0 8px 8px 0; }

        .ent-company-name { font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600; color: var(--text); }
        .ent-pill {
          display: inline-block; padding: 2px 8px; border-radius: 20px;
          font-size: 11px; font-weight: 500;
          background: var(--pill-bg); color: var(--text2); border: 1px solid var(--border);
          white-space: nowrap;
        }
        .ent-pill.flux-export { background: rgba(31,157,85,0.1); color: #1f9d55; border-color: rgba(31,157,85,0.3); }
        .ent-pill.flux-import { background: rgba(23,37,84,0.08); color: #172554; border-color: rgba(23,37,84,0.2); }
        .ent-pill.flux-both { background: rgba(201,168,32,0.1); color: #b8920d; border-color: rgba(201,168,32,0.3); }

        .ent-expand-content {
          background: var(--expand-bg); border: 1px solid var(--border);
          border-radius: 10px; padding: 18px 22px; margin-bottom: 4px;
        }
        .ent-expand-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px 20px; margin-bottom: 12px; }
        .ent-expand-section h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 5px; font-weight: 600; }
        .ent-expand-section p { font-size: 13px; color: var(--text); line-height: 1.5; }
        .ent-expand-divider { border: none; border-top: 1px solid var(--border); margin: 14px 0; }

        .ent-pagination {
          display: flex; justify-content: center; align-items: center;
          gap: 5px; padding: 16px 32px 28px; flex-wrap: wrap;
          border-top: 1px solid var(--border);
        }
        .ent-page-btn {
          width: 34px; height: 34px; border-radius: 7px;
          border: 1px solid var(--border); background: var(--surface);
          color: var(--muted); font-family: 'DM Sans', sans-serif; font-size: 13px;
          cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .ent-page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .ent-page-btn.active { background: var(--accent); border-color: var(--accent); color: white; font-weight: 600; }
        .ent-page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .ent-page-info { font-size: 12px; color: var(--muted); padding: 0 6px; }

        .enq-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 99999; padding: 16px;
        }
        .enq-modal {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; box-shadow: 0 24px 80px rgba(15,23,42,0.15);
          width: 90vw; max-width: 860px; max-height: 92vh;
          display: flex; flex-direction: column; position: relative; z-index: 100000;
        }

        .ent-modal-header {
          background: var(--surface); border-bottom: 1px solid var(--border);
          padding: 18px 24px; display: flex; justify-content: space-between; align-items: center;
          cursor: move; flex-shrink: 0; border-radius: 14px 14px 0 0;
        }
        .ent-modal-title { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
        .ent-modal-subtitle { font-size: 11px; color: var(--muted); margin-top: 2px; }
        .ent-modal-close { background: none; border: none; color: var(--muted); cursor: pointer; display: flex; align-items: center; transition: color 0.15s; padding: 4px; }
        .ent-modal-close:hover { color: var(--accent); }
        .ent-modal-body { padding: 24px; overflow-y: auto; flex: 1; }
        .ent-modal-footer {
          padding: 16px 24px; border-top: 1px solid var(--border);
          display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;
        }

        .ent-btn-secondary {
          padding: 8px 20px; border-radius: 8px;
          border: 1px solid var(--border); background: transparent;
          color: var(--text2); font-family: 'DM Sans', sans-serif; font-size: 13px;
          cursor: pointer; transition: all 0.15s;
        }
        .ent-btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
        .ent-btn-primary {
          padding: 8px 20px; border-radius: 8px;
          background: var(--accent); border: none; color: white;
          font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: opacity 0.15s;
        }
        .ent-btn-primary:hover:not(:disabled) { opacity: 0.88; }
        .ent-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .ent-btn-danger {
          padding: 8px 20px; border-radius: 8px;
          background: transparent; border: 1px solid var(--danger);
          color: var(--danger); font-family: 'DM Sans', sans-serif; font-size: 13px;
          cursor: pointer; transition: all 0.15s;
        }
        .ent-btn-danger:hover { background: rgba(220,38,38,0.06); }

        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>

      {/* ── HEADER + BREADCRUMB ─────────────────────────────────────────────── */}
      <div className="ent-header">
        <div className="ent-breadcrumb">
          <span>CEPEX</span>
          <span className="sep">›</span>
          <span>Gestion</span>
          <span className="sep">›</span>
          <span className="active">Enquêtes Transport</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="ent-title">Enquêtes Transport Logistique — Afrique de l'Ouest</div>
        </div>
      </div>

      {/* ── FILTERS + ACTION ────────────────────────────────────────────────── */}
      <div className="ent-filters">
        <input
          className="ent-filter-input"
          placeholder="Rechercher par raison sociale, secteur, pays…"
          value={searchText}
          onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
        />
        <button className="ent-action-btn" onClick={openNewModal}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Nouvelle enquête
        </button>
      </div>

      {/* ── RESULTS BAR ─────────────────────────────────────────────────────── */}
      <div className="ent-results-bar">
        <span><strong>{filteredEnquetes.length}</strong> enquête{filteredEnquetes.length !== 1 ? 's' : ''} trouvée{filteredEnquetes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── TABLE ───────────────────────────────────────────────────────────── */}
      <div className="ent-table-wrap">
        <table className="ent-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('raison_sociale')}>Raison sociale <SortIcon field="raison_sociale" /></th>
              <th onClick={() => handleSort('secteur')}>Secteur <SortIcon field="secteur" /></th>
              <th onClick={() => handleSort('flux')}>Flux <SortIcon field="flux" /></th>
              <th onClick={() => handleSort('pays')}>Pays <SortIcon field="pays" /></th>
              <th onClick={() => handleSort('foprodex')}>FOPRODEX <SortIcon field="foprodex" /></th>
              <th onClick={() => handleSort('date_enquete')}>Date <SortIcon field="date_enquete" /></th>
              <th style={{ textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {paginatedEnquetes.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
                  Aucune enquête trouvée
                </td>
              </tr>
            ) : (
              paginatedEnquetes.map(e => (
                <React.Fragment key={e.id_enquete}>
                  <tr
                    className={expandedRow === e.id_enquete ? 'expanded' : ''}
                    onClick={() => setExpandedRow(prev => prev === e.id_enquete ? null : e.id_enquete)}
                  >
                    <td><span className="ent-company-name">{e.raison_sociale}</span></td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{e.secteur || '—'}</td>
                    <td>
                      <span className={`ent-pill ${e.flux === 'Export' ? 'flux-export' : e.flux === 'Import' ? 'flux-import' : 'flux-both'}`}>
                        {e.flux || '—'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{e.pays || '—'}</td>
                    <td>
                      {e.foprodex ? (
                        <span className={`ent-pill ${e.foprodex === 'oui' ? 'flux-export' : ''}`}>
                          {e.foprodex === 'oui' ? 'Oui' : 'Non'}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>
                      {e.date_enquete ? new Date(e.date_enquete).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 4 }}
                      >
                        {expandedRow === e.id_enquete
                          ? <ChevronUpIcon style={{ width: 16, height: 16 }} />
                          : <ChevronDownIcon style={{ width: 16, height: 16 }} />
                        }
                      </button>
                    </td>
                  </tr>
                  {expandedRow === e.id_enquete && renderExpandedDetail(e)}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── PAGINATION ──────────────────────────────────────────────────────── */}
      <div className="ent-pagination">
        <button className="ent-page-btn" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>«</button>
        <button className="ent-page-btn" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>‹</button>
        {(() => {
          const range: number[] = [];
          for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) range.push(i);
          return range.map(p => (
            <button key={p} className={`ent-page-btn ${p === currentPage ? 'active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
          ));
        })()}
        <button className="ent-page-btn" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages}>›</button>
        <button className="ent-page-btn" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>»</button>
        <span className="ent-page-info">Page {currentPage} / {totalPages}</span>
      </div>

      {/* ── MODAL ───────────────────────────────────────────────────────────── */}
      {isModalOpen && renderModal()}
    </div>
  );
};

export default Enquete;
