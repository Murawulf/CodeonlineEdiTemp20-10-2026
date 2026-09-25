import React, { useState, useEffect } from 'react';
import { useLocalApiUrl } from '../contexts/SettingsContext';
import Select, { StylesConfig } from 'react-select';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Transporteur = {
  id: number;
  type: 'Permanent' | 'Variable';
  transit_jours: number | '';
  port_embarquement: string;
  port_debarquement: string;
  transbordement: 'Oui' | 'Non';
  satisfaction: number; // 0-5
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
  pays_import: string[];
  volumes: VolumeRow[];
  groupage: 'oui' | 'non' | '';
  frequences: FrequenceRow[];
  transporteurs: Transporteur[];
  difficultes: string[];
  classification_type: 'national' | 'gpc' | '';

  gsa: string;
  sous_gsa: string;

  segment_code: string;
  segment_libelle: string;

  // Coordonnées de contact de l'entité — utilisées pour compléter le profil
  // Entite si celle-ci n'existe pas encore.
  personne_contact: string;
  email: string;
  telephone: string;
  tel_mobile: string;

  // Région / Délégation / Localité — saisies via listes déroulantes en cascade
  // alimentées par la table Region_national (gouvernorat, delegation, localite,
  // code_postal), stockées sur l'Entite (colonnes region / delegation / localite
  // / postalCode), pas sur l'Enquete elle-même.
  region: string;
  delegation: string;
  localite: string;
  postalCode: string;

  // Rue — champ libre saisi tel quel par la personne, enregistré tel quel sur
  // l'Enquete (colonne "rue"), sans validation ni rapprochement avec l'Entite.
  rue: string;
};

type Segment = {
  code: string;
  libelle: string;
};

type Localite = {
  localite: string;
  code_postal: string;
};

// 👉 Colle ici le lien de l'image du logo CEPEX (URL absolue, ex: 'https://.../cepex-logo.png').
const CEPEX_LOGO_URL = 'https://edi.codeonline-info.com/images/cepex_full.png';

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

const PRIORITY_COUNTRIES = [
  'Libye', 'Sénégal', "Côte d'Ivoire", 'Mali', 'Burkina Faso', 'Guinée',
];

const COUNTRY_CODES = 'AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(' ');
const COUNTRY_NAMES = COUNTRY_CODES
  .map(code => new Intl.DisplayNames(['fr'], { type: 'region' }).of(code))
  .filter((name): name is string => Boolean(name))
  .map(name => name.replace(/[\u2018\u2019]/g, "'"));
const COUNTRY_OPTIONS = [...new Set([...PRIORITY_COUNTRIES, ...COUNTRY_NAMES])].map(country => ({ value: country, label: country }));

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
  pays_import: [],
  volumes: PERIODES_VOLUME.map(p => ({ periode: p, vingt: '', quarante: '', frigo: '' })),
  groupage: '',
  frequences: PERIODES_VOLUME.map(p => ({ periode: p, nb_expeditions: '' })),
  transporteurs: [makeTransporteur(1)],
  difficultes: [],
  personne_contact: '',
  email: '',
  telephone: '',
  tel_mobile: '',

  region: '',
  delegation: '',
  localite: '',
  postalCode: '',
  rue: '',
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
  const [regions, setRegions] = useState<string[]>([]);
  const [delegations, setDelegations] = useState<string[]>([]);
  const [localites, setLocalites] = useState<Localite[]>([]);
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

  // Gouvernorats — fetched once from Region_national.
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/regions`);
        if (!res.ok) return;
        const data = await res.json();
        setRegions((data || []).map((r: { region: string }) => r.region).filter(Boolean));
      } catch (err) {
        console.error('Fetch regions error:', err);
      }
    };
    fetchRegions();
  }, [API_BASE_URL]);

  // Délégations — re-fetched from Region_national every time the gouvernorat changes.
  useEffect(() => {
    if (!form.region) { setDelegations([]); return; }
    const fetchDelegations = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/delegations?region=${encodeURIComponent(form.region)}`);
        if (!res.ok) return;
        const data = await res.json();
        setDelegations((data || []).map((d: { delegation: string }) => d.delegation).filter(Boolean));
      } catch (err) {
        console.error('Fetch delegations error:', err);
      }
    };
    fetchDelegations();
  }, [API_BASE_URL, form.region]);

  // Localités (+ code postal) — re-fetched from Region_national every time the
  // délégation changes.
  useEffect(() => {
    if (!form.delegation) { setLocalites([]); return; }
    const fetchLocalites = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/localites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name_delegation: form.delegation }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          // Surface the real reason instead of silently leaving the dropdown
          // empty — visible in the browser console/network tab.
          console.error('POST /api/localites failed:', res.status, data);
          setLocalites([]);
          return;
        }
        setLocalites(data || []);
      } catch (err) {
        console.error('Fetch localites error:', err);
        setLocalites([]);
      }
    };
    fetchLocalites();
  }, [API_BASE_URL, form.delegation]);

  // ─── SUBMIT ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setErrorMsg(null);

    // "Raison sociale", "identifiant national" et "flux" sont obligatoires.
    // Selon le flux choisi, au moins un pays (destination export et/ou
    // importation) doit également être sélectionné. Le reste du formulaire
    // reste optionnel.
    if (!form.raison_sociale.trim()) { setErrorMsg('Raison sociale requise'); return; }
    if (!form.identifiant_national.trim()) { setErrorMsg('Identifiant national (RNE) requis'); return; }
    if (!form.flux) { setErrorMsg('Merci de choisir un flux (Export, Import ou Import/Export)'); return; }
    if ((form.flux === 'Export' || form.flux === 'Import/Export') && form.pays.length === 0) {
      setErrorMsg('Merci de sélectionner au moins un pays de destination (Export)');
      return;
    }
    if ((form.flux === 'Import' || form.flux === 'Import/Export') && form.pays_import.length === 0) {
      setErrorMsg("Merci de sélectionner au moins un pays d'importation");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/enquete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
  const countrySelectStyles: StylesConfig<{ value: string; label: string }, true> = {
    control: base => ({ ...base, background: 'var(--surface2)', borderColor: 'var(--border)', borderRadius: 8, minHeight: 40, boxShadow: 'none', fontSize: 13 }),
    menu: base => ({ ...base, zIndex: 10, fontSize: 13 }),
  };

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
       .pub-header { display: flex; align-items: flex-start; justify-content: flex-start; gap: 20px; margin-bottom: 28px; flex-wrap: wrap; }
.pub-logo { height: 64px; width: auto; max-width: 200px; object-fit: contain; flex-shrink: 0; margin-top: 2px; }
.pub-title-block { text-align: left; }
        .pub-title { font-family: 'Syne', sans-serif; font-size: 24px; font-weight: 800; color: var(--accent); letter-spacing: -0.02em; }
        .pub-subtitle { font-size: 13px; color: var(--muted); margin-top: 6px; max-width: 480px; }
        @media (max-width: 520px) {
          .pub-header { justify-content: center; text-align: center; }
          .pub-title-block { text-align: center; }
          .pub-subtitle { margin-left: auto; margin-right: auto; }
        }

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
          {CEPEX_LOGO_URL && (
            <img
              src={CEPEX_LOGO_URL}
              alt="CEPEX"
              className="pub-logo"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="pub-title-block">
            <div className="pub-title">Enquête Transport Logistique<br /> Zone Afrique de l'Ouest</div>
            <div className="pub-subtitle">Merci de compléter ce formulaire. Ces informations seront utilisées à des fins d’aide à la décision pour améliorer l'accompagnement de votre commerce international.</div>
          </div>
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
                  <label style={lbl}>Identifiant national (RNE) *</label>
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
                  <label style={lbl}>Flux *</label>
                  <select
                    style={sel}
                    value={form.flux}
                    onChange={e => {
                      const nextFlux = e.target.value;
                      setForm(f => ({
                        ...f,
                        flux: nextFlux,
                        pays: (nextFlux === 'Export' || nextFlux === 'Import/Export') ? f.pays : [],
                        pays_import: (nextFlux === 'Import' || nextFlux === 'Import/Export') ? f.pays_import : [],
                      }));
                    }}
                  >
                    <option value="">Choisir</option>
                    <option>Export</option>
                    <option>Import</option>
                    <option>Import/Export</option>
                  </select>
                </div>
              </div>

              {(form.flux === 'Export' || form.flux === 'Import/Export') && (
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>Pays de destination (Export) *</label>
                  <Select
                    isMulti
                    isSearchable
                    closeMenuOnSelect={false}
                    options={COUNTRY_OPTIONS}
                    value={form.pays.map(country => ({ value: country, label: country }))}
                    onChange={selected => setForm(f => ({ ...f, pays: selected.map(option => option.value) }))}
                    placeholder="Rechercher et sélectionner un ou plusieurs pays..."
                    noOptionsMessage={() => 'Aucun pays trouvé'}
                    styles={countrySelectStyles}
                  />
                </div>
              )}

              {(form.flux === 'Import' || form.flux === 'Import/Export') && (
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>Pays d'importation *</label>
                  <Select
                    isMulti
                    isSearchable
                    closeMenuOnSelect={false}
                    options={COUNTRY_OPTIONS}
                    value={form.pays_import.map(country => ({ value: country, label: country }))}
                    onChange={selected => setForm(f => ({ ...f, pays_import: selected.map(option => option.value) }))}
                    placeholder="Rechercher et sélectionner un ou plusieurs pays..."
                    noOptionsMessage={() => 'Aucun pays trouvé'}
                    styles={countrySelectStyles}
                  />
                </div>
              )}

              <Divider />
              {/* ── Section 1bis: Coordonnées de contact */}
              <SectionTitle>Coordonnées de contact</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
                <div>
                  <label style={lbl}>Personne à contacter</label>
                  <input style={inp} value={form.personne_contact} onChange={e => setForm(f => ({ ...f, personne_contact: e.target.value }))} placeholder="Nom et prénom" />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" style={inp} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="nom@entreprise.com" />
                </div>
                <div>
                  <label style={lbl}>Téléphone mobile</label>
                  <input style={inp} value={form.tel_mobile} onChange={e => setForm(f => ({ ...f, tel_mobile: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Téléphone fixe</label>
                  <input style={inp} value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Région</label>
                  <select
                    style={sel}
                    value={form.region}
                    onChange={e => setForm(f => ({ ...f, region: e.target.value, delegation: '', localite: '', postalCode: '' }))}
                  >
                    <option value="">Choisir</option>
                    {regions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Délégation</label>
                  <select
                    style={sel}
                    value={form.delegation}
                    onChange={e => setForm(f => ({ ...f, delegation: e.target.value, localite: '', postalCode: '' }))}
                    disabled={!form.region}
                  >
                    <option value="">{form.region ? 'Choisir' : 'Sélectionnez une région d\'abord'}</option>
                    {delegations.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Localité / Ville</label>
                  <select
                    style={sel}
                    value={form.localite}
                    onChange={e => {
                      const chosen = localites.find(l => l.localite === e.target.value);
                      setForm(f => ({ ...f, localite: chosen?.localite || '', postalCode: chosen?.code_postal || '' }));
                    }}
                    disabled={!form.delegation}
                  >
                    <option value="">{form.delegation ? 'Choisir' : 'Sélectionnez une délégation d\'abord'}</option>
                    {localites.map(l => (
                      <option key={`${l.localite}-${l.code_postal}`} value={l.localite}>
                        {l.localite} — {l.code_postal}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Code postal</label>
                  <input style={{ ...inp, background: 'var(--surface3)', color: 'var(--muted)' }} value={form.postalCode} readOnly placeholder="Se remplit avec la localité" />
                </div>
                <div>
                  <label style={lbl}>Rue</label>
                  <input style={inp} value={form.rue} onChange={e => setForm(f => ({ ...f, rue: e.target.value }))} placeholder="Nom et numéro de la rue" />
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