import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Virtuoso } from 'react-virtuoso';
import { ChevronRight, X, ArrowUp, Save, RefreshCw, Upload, Plus, Trash2 } from 'lucide-react';
import { nmcData } from '../pages/nmcCodes';
import { buildIndex, matchBrick, ENGINE_VERSION } from '../pages/mappingEngine';

// Index NMC once (≈150 ms) – shared by every auto-map run.
const nmcIndex = buildIndex(nmcData);

// ─── Categories ────────────────────────────────────────────────────────────────
const categories = [
  'bijouterie', 'bonnes affaires', 'boucherie', 'boulangerie-patisserie',
  'brico/auto', 'cafeteria', 'carburant-gaz', 'cremerie', 'croque',
  'DHP', 'education', 'liquides', 'FRUITS ET LEGUMES', 'POISSON'
];

// ─── Text helpers ──────────────────────────────────────────────────────────────
const normalizeText = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '');


const Mapping = ({ apiBaseUrl, onProgressUpdate, onNmcUpdate, onSelectionsChange }) => {
  // Bricks from DB
  const [brickData, setBrickData] = useState([]);
  const [bricksLoading, setBricksLoading] = useState(true);
  const [bricksError, setBricksError] = useState('');

  // Selections
  const [brickNmcSelections, setBrickNmcSelections] = useState({});
  const [loading, setLoading] = useState(true);

  // NMC picker modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentBrickCode, setCurrentBrickCode] = useState('');
  const [nmcSearch, setNmcSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedNmcCodes, setSelectedNmcCodes] = useState([]);

  // Manual add modal
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualBrickCode, setManualBrickCode] = useState('');
  const [manualRayonCode, setManualRayonCode] = useState('');
  const [manualRayonLibelle, setManualRayonLibelle] = useState('');

  // Search & UI
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [autoMappingStatus, setAutoMappingStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [isAutoMapping, setIsAutoMapping] = useState(false);
  // Suggestions produced by the auto-mapper. They are NEVER saved to the DB until accepted.
  const [suggestions, setSuggestions] = useState({});
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorMessages, setErrorMessages] = useState([]);
  const [isSavingToDB, setIsSavingToDB] = useState(false);
  const [dbSaveStatus, setDbSaveStatus] = useState('');

  const virtuosoRef = useRef(null);
  const cancelRef = useRef(false);
  const fileInputRef = useRef(null);
  const errorLogRef = useRef([]);
  const searchTimeoutRef = useRef(null);

  const normalizeBrickCode = useCallback((code) => String(code).trim().toLowerCase(), []);

  // ── Fetch bricks from DB ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchBricks = async () => {
      setBricksLoading(true);
      setBricksError('');
      try {
        const res = await fetch(`${apiBaseUrl}/api/bricks`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setBrickData(data.map(b => ({
          code: String(b.code),
          label: b.libelle || b.label || String(b.code),
          segment: b.segment || '',
          family: b.family || '',
          class: b.class || '',
        })));
      } catch (err) {
        setBricksError(`Erreur chargement bricks: ${err.message}`);
      } finally {
        setBricksLoading(false);
      }
    };
    fetchBricks();
  }, []);

  // ── Load saved state ──────────────────────────────────────────────────────────
  // Only ACCEPTED / manual selections are stored under the v2 key. The legacy
  // 'brickSelections' key (old fuzzy auto-map output) is intentionally ignored.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('brickSelections_v2');
      if (saved) setBrickNmcSelections(JSON.parse(saved));
      const sug = localStorage.getItem('brickSuggestions_v2');
      if (sug) {
        const p = JSON.parse(sug);
        if (p && p.v === ENGINE_VERSION) setSuggestions(p.data || {});
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  // ── Persist & notify parent ───────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem('brickSelections_v2', JSON.stringify(brickNmcSelections));
      const mappedCount = Object.keys(brickNmcSelections).filter(k => brickNmcSelections[k]?.length > 0).length;
      const uniqueNmcCodes = [...new Set(
        Object.values(brickNmcSelections).flatMap(nmcs => nmcs.map(n => n.CodeNmc))
      )].length;
      onProgressUpdate?.(mappedCount, brickData.length);
      onNmcUpdate?.(uniqueNmcCodes, nmcData.length);
      onSelectionsChange?.(brickNmcSelections, brickData.length);
    } catch (_) {}
  }, [brickNmcSelections, brickData, onProgressUpdate, onNmcUpdate, onSelectionsChange]);

  useEffect(() => {
    try {
      localStorage.setItem('brickSuggestions_v2', JSON.stringify({ v: ENGINE_VERSION, data: suggestions }));
    } catch (_) {}
  }, [suggestions]);

  // ── Auto-mapping (runs in small chunks so the UI stays responsive) ────────────
  const startAutoMapping = useCallback(() => {
    if (!brickData.length) return;
    cancelRef.current = false;
    setIsAutoMapping(true);
    setProgress(0);
    setAutoMappingStatus('');
    const next = {};
    let i = 0;
    const CHUNK = 150;
    const step = () => {
      if (cancelRef.current) { setIsAutoMapping(false); return; }
      const end = Math.min(i + CHUNK, brickData.length);
      for (; i < end; i++) {
        const b = brickData[i];
        const nk = normalizeBrickCode(b.code);
        if (brickNmcSelections[nk]?.length) continue; // never touch accepted / manual work
        const r = matchBrick(b, nmcIndex);
        if (r.picks.length) next[nk] = { status: r.status, best: r.best, picks: r.picks };
      }
      setProgress(i / brickData.length);
      if (i < brickData.length) {
        setTimeout(step, 0);
      } else {
        setSuggestions(next);
        setIsAutoMapping(false);
        const vals = Object.values(next);
        const nAuto = vals.filter(v => v.status === 'auto').length;
        setAutoMappingStatus(
          `Terminé : ${nAuto} suggestion(s) haute confiance, ${vals.length - nAuto} à vérifier. ` +
          `Rien n'est enregistré tant que vous n'acceptez pas.`
        );
      }
    };
    setTimeout(step, 0);
  }, [brickData, brickNmcSelections, normalizeBrickCode]);

  const stopAutoMapping = useCallback(() => { cancelRef.current = true; }, []);

  const acceptSuggestion = useCallback((brickCode) => {
    const nk = normalizeBrickCode(brickCode);
    setSuggestions(prevS => {
      const sug = prevS[nk];
      if (!sug) return prevS;
      setBrickNmcSelections(prev => {
        const existing = prev[nk] || [];
        const have = new Set(existing.map(x => x.CodeNmc));
        const added = sug.picks.filter(p => !have.has(p.CodeNmc)).map(p => ({ CodeNmc: p.CodeNmc, LibelleNmc: p.LibelleNmc }));
        return { ...prev, [nk]: [...existing, ...added] };
      });
      const { [nk]: _drop, ...rest } = prevS;
      return rest;
    });
  }, [normalizeBrickCode]);

  const rejectSuggestion = useCallback((brickCode) => {
    const nk = normalizeBrickCode(brickCode);
    setSuggestions(prev => { const { [nk]: _drop, ...rest } = prev; return rest; });
  }, [normalizeBrickCode]);

  const acceptAllAuto = useCallback(() => {
    setBrickNmcSelections(prev => {
      const out = { ...prev };
      Object.entries(suggestions).forEach(([nk, sug]) => {
        if (sug.status !== 'auto') return;
        const existing = out[nk] || [];
        const have = new Set(existing.map(x => x.CodeNmc));
        out[nk] = [...existing, ...sug.picks.filter(p => !have.has(p.CodeNmc)).map(p => ({ CodeNmc: p.CodeNmc, LibelleNmc: p.LibelleNmc }))];
      });
      return out;
    });
    setSuggestions(prev => Object.fromEntries(Object.entries(prev).filter(([, v]) => v.status !== 'auto')));
  }, [suggestions]);

  const suggestionCounts = useMemo(() => {
    const v = Object.values(suggestions);
    return { auto: v.filter(x => x.status === 'auto').length, review: v.filter(x => x.status !== 'auto').length };
  }, [suggestions]);

  // ── Import ────────────────────────────────────────────────────────────────────
  const importSelections = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let imported;
        if (file.name.endsWith('.json')) {
          imported = JSON.parse(e.target.result);
        } else if (file.name.endsWith('.csv')) {
          const rows = e.target.result.split('\n').slice(1).filter(r => r.trim());
          imported = {};
          rows.forEach(row => {
            const [brickCode, , codeNmc, libelleNmc] = row.split('","').map(v => v.replace(/^"|"$/g, ''));
            if (brickCode && codeNmc && libelleNmc) {
              const nk = normalizeBrickCode(brickCode);
              imported[nk] = imported[nk] || [];
              imported[nk].push({ CodeNmc: codeNmc, LibelleNmc: libelleNmc });
            }
          });
        } else {
          throw new Error('Format non supporté. Utilisez JSON ou CSV.');
        }
        setBrickNmcSelections(prev => ({ ...prev, ...imported }));
        setAutoMappingStatus('Importation réussie!');
        setTimeout(() => setAutoMappingStatus(''), 3000);
      } catch (error) {
        setErrorMessages(prev => [...prev, `Import échoué: ${error.message}`]);
        setIsErrorModalOpen(true);
      }
    };
    reader.readAsText(file);
    event.target.value = null;
  }, [normalizeBrickCode]);

  // ── Export CSV ────────────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const rows = [];
    brickData.forEach(brick => {
      const nk = normalizeBrickCode(brick.code);
      const selected = brickNmcSelections[nk] || [];
      if (selected.length > 0) {
        selected.forEach(nmc => rows.push({
          BrickCode: brick.code, BrickLibelle: brick.label,
          CodeNmc: nmc.CodeNmc, LibelleNmc: nmc.LibelleNmc
        }));
      } else {
        rows.push({ BrickCode: brick.code, BrickLibelle: brick.label, CodeNmc: '', LibelleNmc: '' });
      }
    });
    const csv = [
      'BrickCode,BrickLibelle,CodeNmc,LibelleNmc',
      ...rows.map(r =>
        `"${r.BrickCode}","${r.BrickLibelle.replace(/"/g, '""')}","${r.CodeNmc}","${r.LibelleNmc.replace(/"/g, '""')}"`
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'brick_nmc_selections.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }, [brickNmcSelections, brickData, normalizeBrickCode]);

  // ── Save to DB ────────────────────────────────────────────────────────────────
  const saveToDatabase = useCallback(async () => {
    const mappings = [];
    Object.entries(brickNmcSelections).forEach(([brickCode, nmcs]) => {
      (nmcs || []).forEach(nmc => {
        if (nmc.CodeNmc) mappings.push({
          brick_code: brickCode,
          rayon_code: String(nmc.CodeNmc),
          rayon_libelle: nmc.LibelleNmc || '',
        });
      });
    });
    if (mappings.length === 0) {
      setDbSaveStatus('Aucune association à enregistrer.');
      setTimeout(() => setDbSaveStatus(''), 3000);
      return;
    }
    setIsSavingToDB(true);
    setDbSaveStatus('Enregistrement en base...');
    try {
      const res = await fetch(`${apiBaseUrl}/api/rayongpc/bulk-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      });
      const data = await res.json();
      if (data.success) {
        setDbSaveStatus(`✅ ${data.inserted} ligne(s) enregistrée(s) pour ${data.bricksUpdated} brick(s).`);
      } else {
        setDbSaveStatus(`❌ Erreur: ${data.error || 'Inconnue'}`);
      }
    } catch (err) {
      setDbSaveStatus(`❌ Erreur réseau: ${err.message}`);
    } finally {
      setIsSavingToDB(false);
      setTimeout(() => setDbSaveStatus(''), 5000);
    }
  }, [brickNmcSelections]);

  // ── NMC picker modal ──────────────────────────────────────────────────────────
  const openModal = useCallback((brickCode) => {
    setCurrentBrickCode(brickCode);
    setIsModalOpen(true);
    setNmcSearch('');
    setSelectedCategory('');
    setSelectedNmcCodes([]);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedNmcCodes([]);
  }, []);

  const handleNmcToggle = useCallback((codeNmc) => {
    setSelectedNmcCodes(prev =>
      prev.includes(codeNmc) ? prev.filter(c => c !== codeNmc) : [...prev, codeNmc]
    );
  }, []);

  const validateSelection = useCallback(() => {
    const selectedNMCs = nmcData
      .filter(nmc => selectedNmcCodes.includes(nmc.CodeNmc))
      .map(nmc => ({ CodeNmc: nmc.CodeNmc, LibelleNmc: nmc.LibelleNmc }));
    const nk = normalizeBrickCode(currentBrickCode);
    setBrickNmcSelections(prev => ({ ...prev, [nk]: selectedNMCs }));
    closeModal();
  }, [currentBrickCode, selectedNmcCodes, normalizeBrickCode, closeModal]);

  const removeNMC = useCallback((brickCode, codeNmc) => {
    const nk = normalizeBrickCode(brickCode);
    setBrickNmcSelections(prev => ({
      ...prev,
      [nk]: (prev[nk] || []).filter(nmc => nmc.CodeNmc !== codeNmc)
    }));
  }, [normalizeBrickCode]);

  // ── Manual add ────────────────────────────────────────────────────────────────
  const openManualAdd = useCallback((brickCode) => {
    setManualBrickCode(brickCode);
    setManualRayonCode('');
    setManualRayonLibelle('');
    setIsManualAddOpen(true);
  }, []);

  const submitManualAdd = useCallback(() => {
    const code = manualRayonCode.trim();
    const libelle = manualRayonLibelle.trim();
    if (!code) return;
    const nk = normalizeBrickCode(manualBrickCode);
    setBrickNmcSelections(prev => {
      const existing = prev[nk] || [];
      if (existing.some(n => n.CodeNmc === code)) return prev;
      return { ...prev, [nk]: [...existing, { CodeNmc: code, LibelleNmc: libelle || code }] };
    });
    setIsManualAddOpen(false);
  }, [manualBrickCode, manualRayonCode, manualRayonLibelle, normalizeBrickCode]);

  const clearAllRayons = useCallback((brickCode) => {
    const nk = normalizeBrickCode(brickCode);
    setBrickNmcSelections(prev => ({ ...prev, [nk]: [] }));
  }, [normalizeBrickCode]);

  // ── Filters ───────────────────────────────────────────────────────────────────
  const filterNMCList = useMemo(() => {
    const keywords = normalizeText(nmcSearch).split(' ').filter(Boolean);
    return nmcData.filter(item => {
      const matchesCategory = !selectedCategory || item.category === selectedCategory;
      const matchesKeywords = keywords.every(kw => normalizeText(item.LibelleNmc).includes(kw));
      return matchesCategory && matchesKeywords;
    });
  }, [nmcSearch, selectedCategory]);

  // brickData in deps — fixes the "no bricks displayed" bug
  const filterBricks = useMemo(() => {
    return brickData.filter(brick =>
      normalizeText(brick.label).includes(normalizeText(searchQuery))
    );
  }, [searchQuery, brickData]);

  const handleSearchInput = useCallback((e) => {
    clearTimeout(searchTimeoutRef.current);
    const query = e.target.value;
    searchTimeoutRef.current = setTimeout(() => setSearchQuery(query), 300);
  }, []);

  const scrollToTop = useCallback(() => {
    if (virtuosoRef.current) virtuosoRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const mappedCount = useMemo(() =>
    Object.keys(brickNmcSelections).filter(k => brickNmcSelections[k]?.length > 0).length,
  [brickNmcSelections]);

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading || bricksLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        {bricksError ? (
          <div className="text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-5 py-4 text-center">
            <p>{bricksError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-sm underline text-red-700"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Chargement des bricks depuis la base de données…</p>
          </>
        )}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">

      {/* ── Toolbar ── */}
      <div className="bg-white border border-border rounded-lg shadow-sm px-3 py-2 flex flex-wrap items-center gap-2">
        {/* Search */}
        <Input
          type="text"
          placeholder="Rechercher une brick..."
          onChange={handleSearchInput}
          className="flex-1 min-w-[160px] h-8 text-sm rounded-md"
        />

        {/* Stats */}
        <span className="text-xs text-muted-foreground bg-gray-100 rounded-full px-3 py-1 whitespace-nowrap shrink-0">
          {mappedCount} / {brickData.length} mappés
        </span>

        {/* Auto-map */}
        {!isAutoMapping ? (
          <Button
            onClick={startAutoMapping}
            disabled={brickData.length === 0}
            size="sm"
            className="h-8 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Suggérer
          </Button>
        ) : (
          <Button
            onClick={stopAutoMapping}
            size="sm"
            variant="outline"
            className="h-8 text-xs text-red-600 border-red-300 hover:bg-red-50"
          >
            <X className="h-3.5 w-3.5 mr-1" />Stop
          </Button>
        )}
        {suggestionCounts.auto > 0 && (
          <Button
            onClick={acceptAllAuto}
            size="sm"
            variant="outline"
            className="h-8 text-xs border-green-400 text-green-700 hover:bg-green-50"
            title="Accepte uniquement les suggestions haute confiance"
          >
            ✓ Accepter {suggestionCounts.auto} haute confiance
          </Button>
        )}
        {(suggestionCounts.auto > 0 || suggestionCounts.review > 0) && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 whitespace-nowrap shrink-0">
            {suggestionCounts.review} à vérifier
          </span>
        )}

        {/* Export */}
        <Button onClick={exportCSV} size="sm" variant="outline" className="h-8 text-xs">
          ↓ CSV
        </Button>

        {/* Import */}
        <Button
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          variant="outline"
          className="h-8 text-xs flex items-center gap-1"
        >
          <Upload className="h-3.5 w-3.5" />Import
        </Button>
        <input ref={fileInputRef} type="file" accept=".json,.csv" onChange={importSelections} className="hidden" />

        {/* Save DB */}
        <Button
          onClick={saveToDatabase}
          disabled={isSavingToDB}
          size="sm"
          className="h-8 bg-green-700 hover:bg-green-800 text-white flex items-center gap-1 text-xs"
        >
          <Save className="h-3.5 w-3.5" />
          {isSavingToDB ? 'Enregistrement...' : 'Sauvegarder DB'}
        </Button>
      </div>

      {/* ── Status banners ── */}
      {dbSaveStatus && (
        <div className={`text-sm text-center font-medium px-3 py-2 rounded-md border ${
          dbSaveStatus.startsWith('✅') ? 'bg-green-50 text-green-700 border-green-200' :
          dbSaveStatus.startsWith('❌') ? 'bg-red-50 text-red-700 border-red-200' :
          'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {dbSaveStatus}
        </div>
      )}
      {autoMappingStatus && (
        <div className="text-sm text-center text-blue-600 font-medium">{autoMappingStatus}</div>
      )}

      {/* ── Progress bar ── */}
      {isAutoMapping && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Auto-mapping en cours…</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Brick list ── */}
      {filterBricks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-lg text-gray-400">
          <p className="text-base font-medium">Aucun brick trouvé</p>
          <p className="text-sm mt-1">
            {brickData.length === 0 ? 'Aucun brick chargé depuis la base.' : 'Modifiez votre recherche.'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg border-border shadow-sm overflow-hidden">
          <Virtuoso
            key={`${searchQuery}-${brickData.length}`}
            ref={virtuosoRef}
            style={{ height: '600px' }}
            data={filterBricks}
            overscan={100}
            itemContent={(_, brick) => {
              const nk = normalizeBrickCode(brick.code);
              const rayons = brickNmcSelections[nk] || [];
              const brickSuggestion = suggestions[nk];
              return (
                <div className="flex items-start gap-2 px-3 py-2.5 mx-2 my-1 border rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-sm group">

                  {/* Click area → NMC picker */}
                  <button
                    onClick={() => openModal(brick.code)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 group-hover:text-gray-500 transition-colors" />
                      <span className="font-mono text-[11px] text-blue-700 font-bold shrink-0">{brick.code}</span>
                      <span className="text-sm text-gray-700 truncate">{brick.label}</span>
                    </div>

                    {/* Rayon tags */}
                    {rayons.length > 0 && (
                      <div className="ml-6 mt-1.5 flex flex-wrap gap-1">
                        {rayons.map(nmc => (
                          <span
                            key={nmc.CodeNmc}
                            className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] rounded-full px-2 py-0.5"
                          >
                            <span className="font-mono font-semibold">{nmc.CodeNmc}</span>
                            {nmc.LibelleNmc && nmc.LibelleNmc !== nmc.CodeNmc && (
                              <span className="text-indigo-500 hidden sm:inline">— {nmc.LibelleNmc}</span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); removeNMC(brick.code, nmc.CodeNmc); }}
                              className="ml-0.5 text-indigo-300 hover:text-red-500 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Suggestions (not saved until accepted) */}
                    {rayons.length === 0 && brickSuggestion && (
                      <div className="ml-6 mt-1.5 flex flex-wrap items-center gap-1">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${
                          brickSuggestion.status === 'auto' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {brickSuggestion.status === 'auto' ? 'Haute confiance' : 'À vérifier'}
                        </span>
                        {brickSuggestion.picks.map(p => (
                          <span key={p.CodeNmc} title={p.LibelleNmc}
                            className="inline-flex items-center gap-1 bg-gray-50 border border-dashed border-gray-300 text-gray-700 text-[11px] rounded-full px-2 py-0.5">
                            <span className="font-mono font-semibold">{p.CodeNmc}</span>
                            <span className="text-gray-500 hidden sm:inline">— {p.LibelleNmc}</span>
                          </span>
                        ))}
                        <span role="button" tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); acceptSuggestion(brick.code); }}
                          className="text-[11px] px-2 py-0.5 rounded bg-green-600 text-white cursor-pointer hover:bg-green-700">
                          ✓ Accepter
                        </span>
                        <span role="button" tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); rejectSuggestion(brick.code); }}
                          className="text-[11px] px-2 py-0.5 rounded border border-gray-300 text-gray-600 cursor-pointer hover:bg-gray-100">
                          ✗ Rejeter
                        </span>
                      </div>
                    )}
                  </button>

                  {/* Side actions */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openManualAdd(brick.code); }}
                      title="Ajouter un rayon manuellement"
                      className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    {rayons.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); clearAllRayons(brick.code); }}
                        title="Vider tous les rayons de ce brick"
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            }}
            onScroll={(e) => setShowScrollToTop(e.target.scrollTop > 300)}
          />
          {showScrollToTop && (
            <Button
              onClick={scrollToTop}
              className="fixed bottom-6 right-6 bg-primary text-white rounded-full shadow-lg p-2 z-40"
            >
              <ArrowUp className="h-5 w-5" />
            </Button>
          )}
        </div>
      )}

      {/* ── NMC picker modal ── */}
      {isModalOpen && (() => {
        const brick = brickData.find(b => b.code === currentBrickCode);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="px-5 py-4 border-b">
                <h3 className="font-semibold text-gray-900">Sélectionner les rayons (NMC)</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="font-mono text-blue-700 font-bold">{brick?.code}</span>
                  {' — '}{brick?.label}
                </p>
              </div>
              <div className="p-4 flex flex-col gap-2 overflow-y-auto flex-1">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full border rounded-md p-2 text-sm"
                >
                  <option value="">— Toutes les catégories —</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}
                      style={{ backgroundColor: nmcData.find(n => n.category === cat)?.background || '' }}>
                      {cat}
                    </option>
                  ))}
                </select>
                <Input
                  type="text"
                  placeholder="Rechercher un code NMC..."
                  value={nmcSearch}
                  onChange={(e) => setNmcSearch(e.target.value)}
                  className="text-sm"
                />
                <div className="border rounded-md bg-gray-50 overflow-hidden">
                  <Virtuoso
                    style={{ height: '260px' }}
                    data={filterNMCList}
                    overscan={100}
                    itemContent={(_, nmc) => (
                      <label
                        key={nmc.CodeNmc}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-white cursor-pointer"
                        style={{ backgroundColor: nmc.background || 'transparent' }}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded accent-indigo-600"
                          value={nmc.CodeNmc}
                          checked={selectedNmcCodes.includes(nmc.CodeNmc)}
                          onChange={() => handleNmcToggle(nmc.CodeNmc)}
                        />
                        <span className="text-sm text-gray-700">
                          <span className="font-mono text-blue-700 font-semibold">{nmc.CodeNmc}</span>
                          {' — '}{nmc.LibelleNmc}
                        </span>
                      </label>
                    )}
                  />
                </div>
              </div>
              <div className="px-5 py-3 border-t flex justify-between items-center">
                <span className="text-xs text-gray-400">{selectedNmcCodes.length} sélectionné(s)</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={closeModal}>Annuler</Button>
                  <Button size="sm" onClick={validateSelection}>Valider</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Manual add modal ── */}
      {isManualAddOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-900">Ajouter un rayon manuellement</h3>
              <p className="text-xs font-mono text-blue-700 mt-0.5">{manualBrickCode}</p>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Code Rayon <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="ex: 2310401"
                  value={manualRayonCode}
                  onChange={(e) => setManualRayonCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitManualAdd()}
                  className="text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Libellé <span className="text-gray-400 font-normal">(optionnel)</span></label>
                <Input
                  type="text"
                  placeholder="ex: Bananes fraîches"
                  value={manualRayonLibelle}
                  onChange={(e) => setManualRayonLibelle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitManualAdd()}
                  className="text-sm"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsManualAddOpen(false)}>Annuler</Button>
              <Button
                size="sm"
                onClick={submitManualAdd}
                disabled={!manualRayonCode.trim()}
                className="bg-green-700 hover:bg-green-800 text-white"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />Ajouter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Error modal ── */}
      {isErrorModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b">
              <h3 className="font-bold text-red-600">Erreurs Auto-Mapping</h3>
            </div>
            <ul className="p-5 space-y-1 max-h-[220px] overflow-y-auto">
              {errorMessages.map((msg, idx) => (
                <li key={idx} className="text-xs font-mono text-red-600">{msg}</li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t flex justify-end">
              <Button size="sm" onClick={() => setIsErrorModalOpen(false)}>Fermer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mapping;