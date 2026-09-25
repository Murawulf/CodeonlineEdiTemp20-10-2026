import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocalApiUrl } from '../contexts/SettingsContext';

// ─── TYPES ────────────────────────────────────────────────────────────────────
// Mirrors the Enquete table columns (see server.js ENQUETE_COLUMNS / Enquete.tsx
// EnqueteForm). The list endpoint only returns the "light" columns below; the full
// row (volumes, frequences, transporteurs, difficultes, ...) is fetched lazily per
// row the first time it's expanded.

type EnqueteListItem = {
  id_enquete: number;
  id_entite: number | null;
  raison_sociale: string;
  secteur: string | null;
  flux: string | null;
  pays: string | null; // export destinations (stored directly on Enquete)
  pays_import: string | null; // import origins — joined in from Entite's import_<pays> flags
  foprodex: string | null;
  date_enquete: string | null;
};

type VolumeRow = { periode: string; vingt: number | string | null; quarante: number | string | null; frigo: number | string | null };
type FrequenceRow = { periode: string; nb_expeditions: number | string | null };
type Transporteur = {
  id: number;
  type: 'Permanent' | 'Variable' | string;
  transit_jours: number | string | null;
  port_embarquement: string | null;
  port_debarquement: string | null;
  transbordement: 'Oui' | 'Non' | string;
  satisfaction: number;
  commentaire: string | null;
};

type EnqueteDetail = EnqueteListItem & {
  identifiant_fiscal: string | null;
  volumes: VolumeRow[] | null;
  groupage: string | null;
  frequences: FrequenceRow[] | null;
  transporteurs: Transporteur[] | null;
  difficultes: string[] | null;
  besoins_transport: string | null;
  classification_type: string | null;
  gsa: string | null;
  sous_gsa: string | null;
  segment_code: string | null;
  segment_libelle: string | null;
  rue: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// Only these two entités may consult this page — mirrors the same hierarchy
// enforced server-side (TOP_ENTITY_ID / SECOND_ENTITY_ID in server.js) on the
// /api/enquetes endpoints. This front-end check is a UX convenience only: the
// real gate is on the server, so even if this were bypassed, the API itself
// returns 403 to anyone who isn't 999/111.
const ADMIN_ENTITES = [999, 111];

const FLUX_FILTERS = ['Tous', 'Export', 'Import', 'Import/Export'] as const;
type FluxFilter = typeof FLUX_FILTERS[number];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fluxBadgeColor = (flux: string | null): { bg: string; fg: string } => {
  switch (flux) {
    case 'Export': return { bg: 'rgba(31,157,85,0.12)', fg: '#1f9d55' };
    case 'Import': return { bg: 'rgba(37,99,235,0.12)', fg: '#2563eb' };
    case 'Import/Export': return { bg: 'rgba(124,58,237,0.12)', fg: '#7c3aed' };
    default: return { bg: 'rgba(100,116,139,0.12)', fg: '#64748b' };
  }
};

const formatDate = (val: string | null) => {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const csvEscape = (val: any) => {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

function downloadCsv(rows: EnqueteListItem[], filename: string) {
  if (rows.length === 0) return;
  const headers = ['ID', 'Raison sociale', 'Secteur', 'Flux', 'Destination(s) export', "Origine(s) import", 'FOPRODEX', "Date de l'enquête"];
  const lines = [headers.map(csvEscape).join(';')];
  rows.forEach(r => {
    lines.push([
      r.id_enquete,
      r.raison_sociale,
      r.secteur || '',
      r.flux || '',
      r.pays || '',
      r.pays_import || '',
      r.foprodex ? r.foprodex.charAt(0).toUpperCase() + r.foprodex.slice(1) : '',
      formatDate(r.date_enquete),
    ].map(csvEscape).join(';'));
  });
  // Leading BOM so Excel opens the accented French text as UTF-8 instead of mangling it.
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Read-only star display (no interaction — this page only ever consults data).
const StarsReadOnly = ({ value }: { value: number }) => (
  <span style={{ display: 'inline-flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <span key={i} style={{ fontSize: 15, lineHeight: 1, color: i <= value ? '#c9a820' : '#d1d5db' }}>★</span>
    ))}
  </span>
);

// ─── COMPONENT ────────────────────────────────────────────────────────────────
// idEntite is passed down from App.tsx's currentUser (see other pages that need
// the caller's entité — Flashnotif, Caracteristiques, Ged — same convention).
// The Bearer token itself is NOT handled here: it's injected globally on every
// fetch/axios call by the wrapper set up in src/main.tsx, so the plain fetch()
// calls below already go out authenticated without any extra header code.
const RetourEnquete = ({ idEntite }: { idEntite?: number | null }) => {
  const API_BASE_URL = useLocalApiUrl();

  const isAuthorized = idEntite !== undefined && idEntite !== null && ADMIN_ENTITES.includes(Number(idEntite));

  // ─── LIST STATE ──────────────────────────────────────────────────────────
  const [rows, setRows] = useState<EnqueteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [fluxFilter, setFluxFilter] = useState<FluxFilter>('Tous');

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [details, setDetails] = useState<Record<number, EnqueteDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<number, boolean>>({});
  const [detailError, setDetailError] = useState<Record<number, string>>({});

  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/enquetes`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur lors du chargement des enquêtes');
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors du chargement des enquêtes');
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    if (!isAuthorized) { setLoading(false); return; }
    fetchList();
  }, [isAuthorized, fetchList]);

  // ─── FILTERING ───────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (fluxFilter !== 'Tous' && (r.flux || '') !== fluxFilter) return false;
      if (!q) return true;
      const haystack = [r.raison_sociale, r.secteur, r.pays, r.pays_import, r.flux, String(r.id_enquete)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, fluxFilter]);

  // ─── DETAIL (lazy, per row) ──────────────────────────────────────────────
  const fetchDetail = useCallback(async (id: number) => {
    setDetailLoading(prev => ({ ...prev, [id]: true }));
    setDetailError(prev => { const n = { ...prev }; delete n[id]; return n; });
    try {
      const res = await fetch(`${API_BASE_URL}/api/enquetes/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Erreur lors du chargement du détail');
      setDetails(prev => ({ ...prev, [id]: data }));
    } catch (err: any) {
      setDetailError(prev => ({ ...prev, [id]: err.message || 'Erreur lors du chargement du détail' }));
    } finally {
      setDetailLoading(prev => ({ ...prev, [id]: false }));
    }
  }, [API_BASE_URL]);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!details[id] && !detailLoading[id]) fetchDetail(id);
      }
      return next;
    });
  };

  // ─── SELECTION ───────────────────────────────────────────────────────────
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.id_enquete));
  const someVisibleSelected = filteredRows.some(r => selected.has(r.id_enquete));

  const toggleSelectAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredRows.forEach(r => next.delete(r.id_enquete));
      } else {
        filteredRows.forEach(r => next.add(r.id_enquete));
      }
      return next;
    });
  };

  const toggleSelectOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── EXPORT ──────────────────────────────────────────────────────────────
  const handleExportAll = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(filteredRows, `enquetes_${fluxFilter === 'Tous' ? 'toutes' : fluxFilter.replace('/', '-')}_${stamp}.csv`);
  };

  const handleExportSelection = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const rowsToExport = rows.filter(r => selected.has(r.id_enquete));
    downloadCsv(rowsToExport, `enquetes_selection_${stamp}.csv`);
  };

  // ─── STYLES SHARED (matches Enquete.tsx design system) ──────────────────
  const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif" } as React.CSSProperties;

  // ─── BREADCRUMB (same pattern used across the rest of the app) ────────────
  const Breadcrumb = () => (
    <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
      <span className="text-blue-600 font-medium">Enquêtes</span>
      <span className="text-gray-300">›</span>
      <span className="text-blue-600 font-medium">Retour Enquêtes</span>
    </nav>
  );

  // ─── ACCESS GUARD ────────────────────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-white">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap');`}</style>
        <Breadcrumb />
        <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '36px 30px', boxShadow: '0 4px 20px rgba(15,23,42,0.08)' }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>🔒</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: '#172554', marginBottom: 8 }}>
              Accès restreint
            </div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
              Cette page (Retour Enquêtes) est réservée aux comptes des entités administratrices de la plateforme.
              Votre compte n'a pas les droits nécessaires pour consulter les enquêtes des entités.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────
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
          --shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
        }
        * { box-sizing: border-box; }

        .ret-shell { max-width: 1180px; margin: 0 auto; padding: 12px 16px 64px; }

        .ret-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; box-shadow: var(--shadow);
          padding: 20px;
        }

        .ret-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .ret-search { position: relative; flex: 1 1 240px; min-width: 200px; }
        .ret-search input { width: 100%; padding-left: 34px; }
        .ret-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 13px; pointer-events: none; }

        .ret-filters { display: flex; gap: 6px; flex-wrap: wrap; }
        .ret-filter-btn {
          border: 1px solid var(--border); background: var(--surface2); color: var(--text2);
          font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500;
          padding: 7px 13px; border-radius: 999px; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .ret-filter-btn:hover { border-color: var(--accent); }
        .ret-filter-btn.active { background: var(--accent); border-color: var(--accent); color: white; }

        .ret-export-bar { display: flex; gap: 8px; flex-wrap: wrap; }
        .ret-btn {
          padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border);
          background: transparent; color: var(--text2); font-family: 'DM Sans', sans-serif;
          font-size: 12.5px; font-weight: 500; cursor: pointer; transition: all 0.15s;
          display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
        }
        .ret-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .ret-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ret-btn-primary { background: var(--accent); border-color: var(--accent); color: white; }
        .ret-btn-primary:hover:not(:disabled) { opacity: 0.88; color: white; }

        .ret-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
        table.ret-table { width: 100%; border-collapse: collapse; min-width: 880px; }
        table.ret-table thead th {
          background: var(--surface3); color: var(--text2); text-align: left;
          font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.03em;
          padding: 10px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; position: sticky; top: 0; z-index: 1;
        }
        table.ret-table tbody td { padding: 10px 12px; font-size: 12.5px; color: var(--text2); border-bottom: 1px solid var(--border); vertical-align: middle; }
        table.ret-table tbody tr.ret-row { cursor: pointer; transition: background 0.12s; }
        table.ret-table tbody tr.ret-row:hover { background: rgba(23,37,84,0.035); }
        table.ret-table tbody tr.ret-row.selected { background: rgba(23,37,84,0.05); }

        .ret-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        .ret-chevron { display: inline-block; transition: transform 0.15s; color: var(--muted); font-size: 11px; }
        .ret-chevron.open { transform: rotate(90deg); }

        .ret-detail-row td { background: var(--surface2); padding: 0; border-bottom: 1px solid var(--border); }
        .ret-detail-inner { padding: 18px 20px 22px; }
        .ret-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 16px; }
        .ret-detail-field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); font-weight: 600; margin-bottom: 3px; }
        .ret-detail-field-value { font-size: 13px; color: var(--text); }
        .ret-section-title { font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; color: var(--text); border-left: 3px solid var(--accent); padding-left: 9px; margin: 18px 0 10px; }
        .ret-mini-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
        .ret-mini-table th { background: var(--accent); color: white; text-align: left; padding: 7px 10px; font-family: 'Syne', sans-serif; font-weight: 600; font-size: 11px; }
        .ret-mini-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); color: var(--text2); background: var(--surface); }
        .ret-tag { display: inline-block; background: var(--surface3); border: 1px solid var(--border); color: var(--text2); font-size: 11.5px; padding: 4px 10px; border-radius: 6px; margin: 0 6px 6px 0; }
        .ret-transp-card { border: 1px dashed var(--accent); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; background: rgba(23,37,84,0.03); }

        .ret-checkbox { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }

        .ret-empty { text-align: center; padding: 48px 16px; color: var(--muted); font-size: 13px; }
        .ret-error { background: rgba(220,38,38,0.06); border: 1px solid rgba(220,38,38,0.25); color: var(--danger); border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }

        @media (max-width: 640px) {
          .ret-toolbar { flex-direction: column; align-items: stretch; }
          .ret-export-bar { justify-content: flex-end; }
        }
      `}</style>

      <Breadcrumb />

      <div className="ret-shell">
        <div style={{ marginBottom: 22 }}>
      </div>

        <div className="ret-card">
          {errorMsg && (
            <div className="ret-error">
              {errorMsg}{' '}
              <button className="ret-btn" style={{ marginLeft: 8, padding: '2px 10px' }} onClick={fetchList}>Réessayer</button>
            </div>
          )}

          <div className="ret-toolbar">
            <div className="ret-search">
              <span className="ret-search-icon">🔍</span>
              <input
                style={inp}
                placeholder="Rechercher par raison sociale, secteur, pays, ID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="ret-filters">
              {FLUX_FILTERS.map(f => (
                <button
                  key={f}
                  className={`ret-filter-btn${fluxFilter === f ? ' active' : ''}`}
                  onClick={() => setFluxFilter(f)}
                  type="button"
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="ret-export-bar">
              <button className="ret-btn" onClick={fetchList} type="button" disabled={loading}>
                ↻ Actualiser
              </button>
              <button
                className="ret-btn"
                onClick={handleExportSelection}
                disabled={selected.size === 0}
                type="button"
              >
                ⬇ Exporter la sélection ({selected.size})
              </button>
              <button
                className="ret-btn ret-btn-primary"
                onClick={handleExportAll}
                disabled={filteredRows.length === 0}
                type="button"
              >
                ⬇ Exporter tout ({filteredRows.length})
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}>
            {loading ? 'Chargement…' : `${filteredRows.length} enquête${filteredRows.length !== 1 ? 's' : ''} affichée${filteredRows.length !== 1 ? 's' : ''} sur ${rows.length} au total`}
          </div>

          <div className="ret-table-wrap">
            <table className="ret-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      className="ret-checkbox"
                      checked={allVisibleSelected}
                      ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                      onChange={toggleSelectAllVisible}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                  <th style={{ width: 28 }}></th>
                  <th>ID</th>
                  <th>Raison sociale</th>
                  <th>Secteur</th>
                  <th>Flux</th>
                  <th>Destination(s) export</th>
                  <th>Origine(s) import</th>
                  <th>FOPRODEX</th>
                  <th>Date enquête</th>
                </tr>
              </thead>
              <tbody>
                {!loading && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <div className="ret-empty">
                        {rows.length === 0 ? 'Aucune enquête enregistrée pour le moment.' : 'Aucune enquête ne correspond à votre recherche/filtre.'}
                      </div>
                    </td>
                  </tr>
                )}

                {filteredRows.map(row => {
                  const isOpen = expanded.has(row.id_enquete);
                  const isSelected = selected.has(row.id_enquete);
                  const badge = fluxBadgeColor(row.flux);
                  const detail = details[row.id_enquete];
                  const isDetailLoading = !!detailLoading[row.id_enquete];
                  const dErr = detailError[row.id_enquete];

                  return (
                    <React.Fragment key={row.id_enquete}>
                      <tr
                        className={`ret-row${isSelected ? ' selected' : ''}`}
                        onClick={() => toggleExpand(row.id_enquete)}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="ret-checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(row.id_enquete)}
                            aria-label={`Sélectionner l'enquête ${row.id_enquete}`}
                          />
                        </td>
                        <td>
                          <span className={`ret-chevron${isOpen ? ' open' : ''}`}>▶</span>
                        </td>
                        <td>#{row.id_enquete}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{row.raison_sociale || '—'}</td>
                        <td>{row.secteur || '—'}</td>
                        <td>
                          {row.flux
                            ? <span className="ret-badge" style={{ background: badge.bg, color: badge.fg }}>{row.flux}</span>
                            : '—'}
                        </td>
                        <td>{row.pays || '—'}</td>
                        <td>{row.pays_import || '—'}</td>
                        <td>{row.foprodex ? (row.foprodex.charAt(0).toUpperCase() + row.foprodex.slice(1)) : '—'}</td>
                        <td>{formatDate(row.date_enquete)}</td>
                      </tr>

                      {isOpen && (
                        <tr className="ret-detail-row">
                          <td colSpan={10}>
                            <div className="ret-detail-inner">
                              {isDetailLoading && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Chargement du détail…</div>}
                              {dErr && (
                                <div className="ret-error" style={{ marginBottom: 0 }}>
                                  {dErr}{' '}
                                  <button className="ret-btn" style={{ marginLeft: 8, padding: '2px 10px' }} onClick={() => fetchDetail(row.id_enquete)}>Réessayer</button>
                                </div>
                              )}

                              {!isDetailLoading && !dErr && detail && (
                                <>
                                  <div className="ret-detail-grid">
                                    <div>
                                      <div className="ret-detail-field-label">Identifiant fiscal / RNE</div>
                                      <div className="ret-detail-field-value">{detail.identifiant_fiscal || '—'}</div>
                                    </div>
                                    <div>
                                      <div className="ret-detail-field-label">Classification</div>
                                      <div className="ret-detail-field-value">
                                        {detail.classification_type === 'national'
                                          ? [detail.gsa, detail.sous_gsa].filter(Boolean).join(' / ') || '—'
                                          : detail.classification_type === 'gpc'
                                            ? (detail.segment_libelle || detail.segment_code || '—')
                                            : '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="ret-detail-field-label">Groupage</div>
                                      <div className="ret-detail-field-value">{detail.groupage ? (detail.groupage.charAt(0).toUpperCase() + detail.groupage.slice(1)) : '—'}</div>
                                    </div>
                                    <div>
                                      <div className="ret-detail-field-label">Rue</div>
                                      <div className="ret-detail-field-value">{detail.rue || '—'}</div>
                                    </div>
                                    <div>
                                      <div className="ret-detail-field-label">Origine(s) import</div>
                                      <div className="ret-detail-field-value">{detail.pays_import || '—'}</div>
                                    </div>
                                    <div>
                                      <div className="ret-detail-field-label">ID Entité</div>
                                      <div className="ret-detail-field-value">{detail.id_entite ?? '—'}</div>
                                    </div>
                                  </div>

                                  {!!(detail.volumes && detail.volumes.length) && (
                                    <>
                                      <div className="ret-section-title">Volumes (EVP)</div>
                                      <table className="ret-mini-table">
                                        <thead><tr><th>Période</th><th>20'</th><th>40'</th><th>Frigo</th></tr></thead>
                                        <tbody>
                                          {detail.volumes.map((v, i) => (
                                            <tr key={i}><td>{v.periode}</td><td>{v.vingt ?? '—'}</td><td>{v.quarante ?? '—'}</td><td>{v.frigo ?? '—'}</td></tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </>
                                  )}

                                  {!!(detail.frequences && detail.frequences.length) && (
                                    <>
                                      <div className="ret-section-title">Fréquence des expéditions</div>
                                      <table className="ret-mini-table">
                                        <thead><tr><th>Période</th><th>Nombre d'expéditions</th></tr></thead>
                                        <tbody>
                                          {detail.frequences.map((f, i) => (
                                            <tr key={i}><td>{f.periode}</td><td>{f.nb_expeditions ?? '—'}</td></tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </>
                                  )}

                                  {!!(detail.transporteurs && detail.transporteurs.length) && (
                                    <>
                                      <div className="ret-section-title">Transporteurs</div>
                                      {detail.transporteurs.map((t, i) => (
                                        <div key={t.id ?? i} className="ret-transp-card">
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
                                            <div><span className="ret-detail-field-label">Type</span><div className="ret-detail-field-value">{t.type || '—'}</div></div>
                                            <div><span className="ret-detail-field-label">Transit</span><div className="ret-detail-field-value">{t.transit_jours ?? '—'} j</div></div>
                                            <div><span className="ret-detail-field-label">Embarquement</span><div className="ret-detail-field-value">{t.port_embarquement || '—'}</div></div>
                                            <div><span className="ret-detail-field-label">Débarquement</span><div className="ret-detail-field-value">{t.port_debarquement || '—'}</div></div>
                                            <div><span className="ret-detail-field-label">Transbordement</span><div className="ret-detail-field-value">{t.transbordement || '—'}</div></div>
                                            <div><span className="ret-detail-field-label">Satisfaction</span><div><StarsReadOnly value={Number(t.satisfaction) || 0} /></div></div>
                                          </div>
                                          {t.commentaire && (
                                            <div style={{ fontSize: 12.5, color: 'var(--text2)', fontStyle: 'italic', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                                              “{t.commentaire}”
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </>
                                  )}

                                  {!!(detail.difficultes && detail.difficultes.length) && (
                                    <>
                                      <div className="ret-section-title">Difficultés rencontrées</div>
                                      <div>{detail.difficultes.map((d, i) => <span key={i} className="ret-tag">{d}</span>)}</div>
                                    </>
                                  )}

                                  {detail.besoins_transport && (
                                    <>
                                      <div className="ret-section-title">Besoins en transport logistique</div>
                                      <div style={{ fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{detail.besoins_transport}</div>
                                    </>
                                  )}

                                  <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
                                    Créée le {formatDate(detail.created_at)}{detail.updated_at ? ` · modifiée le ${formatDate(detail.updated_at)}` : ''}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RetourEnquete;