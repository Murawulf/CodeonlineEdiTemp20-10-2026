import React, { useState, useEffect } from 'react';
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
  raison_sociale: string;
  identifiant_national: string;
  secteur: string;
  flux: string;
  pays: string[];
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
  raison_sociale: '',
  identifiant_national: '',
  classification_type: '',

  gsa: '',
  sous_gsa: '',

  segment_code: '',
  segment_libelle: '',
  secteur: '',
  flux: '',
  pays: [],
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
// Public survey — no login. Anyone with the link can fill this in and submit it.
// On submit, the server looks up "raison sociale" (case-insensitive) against the
// Entite table: if it matches an existing entité, the survey is linked to it; if
// not, a new entité is created from the details given here.

const Enquete = () => {
  const API_BASE_URL = useLocalApiUrl();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [form, setForm] = useState<EnqueteForm>(defaultForm());
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ entite_created: boolean } | null>(null);

  // ─── DATA FETCHING ─────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchSegments = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/segments`);
        if (!res.ok) return;
        const data = await res.json();
        setSegments(data || []);
      } catch (err) {
        console.error('Fetch segments error:', err);
      }
    };
    fetchSegments();
  }, [API_BASE_URL]);

  // ─── SUBMIT ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setErrorMsg(null);

    // Only "raison sociale" and "identifiant national" are required. Everything
    // else on the survey is optional — fill in what applies, skip the rest.
    if (!form.raison_sociale.trim()) { setErrorMsg('Raison sociale requise'); return; }
    if (!form.identifiant_national.trim()) { setErrorMsg('Identifiant national requis'); return; }

    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/enquete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, pays: form.pays.join(', ') }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Surface the real reason (details/code from the server) instead of just
        // the generic "Server error" label, and log it so it's visible in the
        // browser console/network tab without extra digging.
        console.error('POST /api/public/enquete failed:', data);
        const reason = data?.details ? `${data?.error || 'Erreur'} — ${data.details}` : (data?.error || 'Erreur lors de l\'envoi');
        throw new Error(reason);
      }
      setResult({ entite_created: !!data.entite_created });
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de l\'envoi');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setForm(defaultForm());
    setResult(null);
    setErrorMsg(null);
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

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

        :root {
          --bg: #f8fafc;
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
          --shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
        }
        * { box-sizing: border-box; }

        .pub-shell { max-width: 900px; margin: 0 auto; padding: 32px 16px 64px; }
        .pub-header { text-align: center; margin-bottom: 28px; }
        .pub-title { font-family: 'Syne', sans-serif; font-size: 24px; font-weight: 800; color: var(--accent); letter-spacing: -0.02em; }
        .pub-subtitle { font-size: 13px; color: var(--muted); margin-top: 6px; max-width: 560px; margin-left: auto; margin-right: auto; }

        .pub-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; box-shadow: var(--shadow);
          padding: 28px;
        }

        .ent-btn-secondary {
          padding: 10px 22px; border-radius: 8px;
          border: 1px solid var(--border); background: transparent;
          color: var(--text2); font-family: 'DM Sans', sans-serif; font-size: 13px;
          cursor: pointer; transition: all 0.15s;
        }
        .ent-btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
        .ent-btn-primary {
          padding: 10px 26px; border-radius: 8px;
          background: var(--accent); border: none; color: white;
          font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: opacity 0.15s;
        }
        .ent-btn-primary:hover:not(:disabled) { opacity: 0.88; }
        .ent-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .pub-error {
          background: rgba(220,38,38,0.06); border: 1px solid rgba(220,38,38,0.25);
          color: var(--danger); border-radius: 8px; padding: 10px 14px;
          font-size: 13px; margin-bottom: 18px;
        }
      `}</style>

      <div className="pub-shell">
        <div className="pub-header">
          <div className="pub-title">Enquête Transport Logistique<br />— Afrique de l'Ouest</div>
          <div className="pub-subtitle">CEPEX — Merci de compléter ce formulaire. Ces informations sont utilisées à des fins statistiques pour améliorer l'accompagnement des entités exportatrices.</div>
        </div>

        <div className="pub-card">
          {result ? (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>
                Merci ! Votre enquête a bien été enregistrée.
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 22 }}>
                {result.entite_created
                  ? "Votre entité n'existait pas encore dans notre base — elle a été créée automatiquement à partir de vos réponses."
                  : "Votre enquête a été associée à votre entité existante."}
              </div>
              <button className="ent-btn-primary" onClick={resetForm}>Soumettre une autre enquête</button>
            </div>
          ) : (
            <>
              {errorMsg && <div className="pub-error">{errorMsg}</div>}

              {/* ── Section 1: Informations générales */}
              <SectionTitle>Informations générales</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
                <div>
                  <label style={lbl}>Raison sociale *</label>
                  <input
                    style={inp}
                    value={form.raison_sociale}
                    onChange={e => setForm(f => ({ ...f, raison_sociale: e.target.value }))}
                    placeholder="Nom exact de votre entité"
                  />
                </div>
                <div>
                  <label style={lbl}>Identifiant national *</label>
                  <input style={inp} value={form.identifiant_national} onChange={e => setForm(f => ({ ...f, identifiant_national: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Type de classification</label>
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
                      <label style={lbl}>GSA</label>
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
                          <option key={gsa} value={gsa}>{gsa}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={lbl}>Sous GSA</label>
                      <select
                        style={sel}
                        value={form.sous_gsa}
                        onChange={e => setForm(f => ({ ...f, sous_gsa: e.target.value }))}
                      >
                        <option value="">Choisir</option>
                        {form.gsa &&
                          GSA_DATA[form.gsa as keyof typeof GSA_DATA]?.map(item => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                      </select>
                    </div>
                  </>
                )}
                {form.classification_type === 'gpc' && (
                  <div>
                    <label style={lbl}>Segment GPC</label>
                    <select
                      style={sel}
                      value={form.segment_code}
                      onChange={e => {
                        const seg = segments.find(s => s.code === e.target.value);
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
                        <option key={segment.code} value={segment.code}>{segment.libelle}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label style={lbl}>Flux</label>
                  <select style={sel} value={form.flux} onChange={e => setForm(f => ({ ...f, flux: e.target.value }))}>
                    <option value="">Choisir</option>
                    <option>Export</option>
                    <option>Import</option>
                    <option>Import/Export</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={lbl}>Pays de destination</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 4 }}>
                  {PAYS_OPTIONS.map(p => (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: form.pays.includes(p) ? 'rgba(23,37,84,0.06)' : 'var(--surface2)', border: `1px solid ${form.pays.includes(p) ? 'rgba(23,37,84,0.25)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', fontSize: 12, color: 'var(--text2)' }}>
                      <input
                        type="checkbox"
                        checked={form.pays.includes(p)}
                        onChange={() => setForm(f => ({
                          ...f,
                          pays: f.pays.includes(p)
                            ? f.pays.filter(x => x !== p)
                            : [...f.pays, p],
                        }))}
                        style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                      />
                      {p}
                    </label>
                  ))}
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
                    <input type="radio" name="foprodex_public" checked={form.foprodex === v} onChange={() => setForm(f => ({ ...f, foprodex: v as any }))} style={{ accentColor: 'var(--accent)' }} />
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

              {/* ── Submit ── */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <button className="ent-btn-secondary" onClick={resetForm} type="button">Réinitialiser</button>
                <button className="ent-btn-primary" onClick={handleSubmit} disabled={isSaving} type="button">
                  {isSaving ? 'Envoi…' : 'Envoyer l\'enquête'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Enquete;