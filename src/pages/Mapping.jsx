import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Virtuoso } from 'react-virtuoso';
import { ChevronRight, X, ArrowUp, Save, RefreshCw, Upload, Plus, Trash2 } from 'lucide-react';
import { nmcData } from '../pages/nmcCodes';
import { initialSelections } from '../pages/initialSelections';

// BRICKS_API_URL is now derived from apiBaseUrl prop

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

const levenshteinDistance = (a, b) => {
  const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  return matrix[b.length][a.length];
};

// ─── Keyword / product mappings ────────────────────────────────────────────────
const keywordToCategory = {
  bijoux: 'bijouterie', bague: 'bijouterie', collier: 'bijouterie',
  promo: 'bonnes affaires', offre: 'bonnes affaires',
  viande: 'boucherie', boeuf: 'boucherie', poulet: 'boucherie',
  pain: 'boulangerie-patisserie', croissant: 'boulangerie-patisserie', gâteau: 'boulangerie-patisserie',
  outil: 'brico/auto', pneu: 'brico/auto', auto: 'brico/auto',
  café: 'cafeteria', sandwich: 'cafeteria',
  essence: 'carburant-gaz', gaz: 'carburant-gaz',
  fromage: 'cremerie', lait: 'cremerie', yaourt: 'cremerie',
  croque: 'croque', parfum: 'DHP', savon: 'DHP', shampoing: 'DHP',
  livre: 'education', cahier: 'education',
  eau: 'liquides', soda: 'liquides', jus: 'liquides',
  fruits: 'FRUITS ET LEGUMES', légumes: 'FRUITS ET LEGUMES', bio: 'FRUITS ET LEGUMES',
  poisson: 'POISSON'
};

const productToNmc = {
  banane: ['2310401', '2310740'], pomme: ['2310301'],
  tomate: ['2320042', '2320051', '2320033'],
  fromage: ['2150008', '2150503', '2150607', '2150616'],
  lait: ['2130050', '2130102', '2130122'],
  poisson: ['2420190', '248'], légumes: ['232', '23209'],
  pain: ['2110101', '2110202'], croissant: ['2110303'],
  viande: ['2210101', '2210202'], parfum: ['2510101'],
  savon: ['2510202'], eau: ['2330101'], soda: ['2330202'],
  bijoux: ['2610101']
};

// ─── Pre-index NMC data ────────────────────────────────────────────────────────
const nmcByCategory = nmcData.reduce((acc, nmc) => {
  const cat = normalizeText(nmc.category);
  acc[cat] = acc[cat] || [];
  acc[cat].push(nmc);
  return acc;
}, {});

const nmcByKeyTerm = nmcData.reduce((acc, nmc) => {
  const terms = normalizeText(nmc.LibelleNmc).split(/[\s\/-]+/).filter(Boolean);
  terms.forEach(term => {
    const keywords = ['bio', 'frais', 'exotique', 'banane', 'pomme', 'tomate', 'fromage',
      'lait', 'poisson', 'légumes', 'pain', 'croissant', 'viande', 'parfum', 'savon',
      'eau', 'soda', 'bijoux'];
    if (keywords.includes(term)) {
      acc[term] = acc[term] || [];
      acc[term].push(nmc);
    }
  });
  return acc;
}, {});

// ─── Web Worker script ─────────────────────────────────────────────────────────
const workerScript = `
  const normalizeText = (text) => {
    return text.toLowerCase().normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9\\s]/g, '');
  };
  const levenshteinDistance = (a, b) => {
    const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i-1] === b[j-1] ? 0 : 1;
        matrix[j][i] = Math.min(matrix[j][i-1]+1, matrix[j-1][i]+1, matrix[j-1][i-1]+indicator);
      }
    }
    return matrix[b.length][a.length];
  };
  const calculateSimilarity = (brickLabel, nmc, brickCategoryHints, productHints) => {
    const normBrick = normalizeText(brickLabel);
    const normNmc = normalizeText(nmc.LibelleNmc);
    const words1 = normBrick.split(/\\s+/).filter(Boolean);
    const words2 = normNmc.split(/\\s+/).filter(Boolean);
    const commonWords = words1.filter(w => words2.includes(w));
    let similarity = commonWords.length / Math.max(words1.length, words2.length, 1);
    const levDistance = levenshteinDistance(normBrick, normNmc);
    const maxLength = Math.max(normBrick.length, normNmc.length);
    similarity += (1 - levDistance / maxLength) * 0.3;
    const brickCategories = brickCategoryHints || [];
    const nmcCategory = normalizeText(nmc.category);
    if (brickCategories.some(cat => nmcCategory === cat)) similarity += 0.5;
    else if (brickCategories.some(cat => nmcCategory.includes(cat.split(' ')[0]))) similarity += 0.25;
    const codeLength = String(nmc.CodeNmc).length;
    if (codeLength > 5) similarity += 0.3;
    else if (codeLength > 3) similarity += 0.15;
    const keyTerms = ['bio','exotique','frais','emballe','legumes','fruits','poisson',
      'cremerie','fromage','lait','pain','croissant','viande','parfum','savon','eau','soda','bijoux'];
    if (keyTerms.some(term => normBrick.includes(term) && normNmc.includes(term))) similarity += 0.25;
    const productMatch = productHints.some(hint =>
      nmc.CodeNmc === hint || normNmc.includes(normalizeText(hint))
    );
    if (productMatch) similarity += 0.6;
    return Math.min(similarity, 2.0);
  };
  self.onmessage = function(e) {
    const { brickData, nmcData, startIndex, endIndex, pause, totalBricks,
      keywordToCategory, productToNmc, nmcByCategory, nmcByKeyTerm,
      initialSelections, existingSelections } = e.data;
    if (pause) return;
    try {
      const selections = {};
      const errors = [];
      for (let i = startIndex; i < endIndex && i < brickData.length; i++) {
        const brick = brickData[i];
        if (!brick || !brick.code || !brick.label) {
          errors.push(\`Invalid brick at index \${i}: \${JSON.stringify(brick)}\`);
          continue;
        }
        const normalizedBrickCode = String(brick.code).trim().toLowerCase();
        if (initialSelections[normalizedBrickCode]?.length > 0 ||
            existingSelections[normalizedBrickCode]?.length > 0) {
          selections[normalizedBrickCode] = existingSelections[normalizedBrickCode]
            || initialSelections[normalizedBrickCode];
          continue;
        }
        const brickWords = normalizeText(brick.label).split(/\\s+/).filter(Boolean);
        const brickCategoryHints = brickWords
          .filter(w => Object.keys(keywordToCategory).includes(w))
          .map(w => normalizeText(keywordToCategory[w]));
        const productHints = brickWords.flatMap(w => productToNmc[w] || []);
        let relevantNmcs = [];
        if (brickCategoryHints.length > 0) {
          brickCategoryHints.forEach(cat => {
            relevantNmcs.push(...(nmcByCategory[cat] || []));
          });
        }
        brickWords.forEach(word => {
          if (nmcByKeyTerm[word]) relevantNmcs.push(...nmcByKeyTerm[word]);
        });
        relevantNmcs = [...new Set(relevantNmcs)];
        if (relevantNmcs.length === 0) relevantNmcs = nmcData;
        const matchedNMCs = relevantNmcs
          .map(nmc => ({ ...nmc,
            similarity: calculateSimilarity(brick.label, nmc, brickCategoryHints, productHints)
          }))
          .filter(item => item.similarity > 0.3)
          .sort((a, b) => {
            const aCat = brickCategoryHints.some(cat => normalizeText(a.category) === cat) ? 1 : 0;
            const bCat = brickCategoryHints.some(cat => normalizeText(b.category) === cat) ? 1 : 0;
            if (aCat !== bCat) return bCat - aCat;
            if (b.similarity !== a.similarity) return b.similarity - a.similarity;
            return String(b.CodeNmc).length - String(a.CodeNmc).length;
          })
          .slice(0, 3)
          .map(nmc => ({ CodeNmc: nmc.CodeNmc, LibelleNmc: nmc.LibelleNmc }));
        selections[normalizedBrickCode] = matchedNMCs;
        self.postMessage({ progress: (i+1)/totalBricks, selections, index: i, errors });
        for (const key in selections) delete selections[key];
      }
      if (endIndex >= brickData.length) {
        self.postMessage({ done: true, selections: {}, index: endIndex-1, errors });
      } else {
        self.postMessage({ done: false, selections: {}, index: endIndex-1, errors });
      }
    } catch (error) {
      self.postMessage({ error: error.message, index: startIndex, errors: [\`Fatal: \${error.message}\`] });
    }
  };
`;

// ─── Component ─────────────────────────────────────────────────────────────────
const Mapping = ({ apiBaseUrl, onProgressUpdate, onNmcUpdate, onSelectionsChange }) => {
  // Bricks from DB
  const [brickData, setBrickData] = useState([]);
  const [bricksLoading, setBricksLoading] = useState(true);
  const [bricksError, setBricksError] = useState('');

  // Selections
  const [brickNmcSelections, setBrickNmcSelections] = useState(initialSelections);
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
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorMessages, setErrorMessages] = useState([]);
  const [isSavingToDB, setIsSavingToDB] = useState(false);
  const [dbSaveStatus, setDbSaveStatus] = useState('');

  const virtuosoRef = useRef(null);
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);
  const errorLogRef = useRef([]);
  const batchSizeRef = useRef(3);
  const performanceStartRef = useRef(null);
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
        })));
      } catch (err) {
        setBricksError(`Erreur chargement bricks: ${err.message}`);
      } finally {
        setBricksLoading(false);
      }
    };
    fetchBricks();
  }, []);

  // ── Web Worker ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    workerRef.current = new Worker(workerUrl);
    workerRef.current.onmessage = (e) => {
      if (e.data.error) {
        errorLogRef.current = [...errorLogRef.current, e.data.error, ...e.data.errors];
        setErrorMessages(errorLogRef.current);
        setIsErrorModalOpen(true);
        setIsAutoMapping(false);
        setIsPaused(false);
        setAutoMappingStatus('Auto-mapping failed!');
        setTimeout(() => setAutoMappingStatus(''), 3000);
        batchSizeRef.current = Math.max(1, batchSizeRef.current - 1);
        setTimeout(() => resumeFromLastIndex(), 2000);
      } else {
        setBrickNmcSelections(prev => ({ ...prev, ...e.data.selections }));
        setProgress(e.data.progress);
        setCurrentIndex(e.data.index + 1);
        errorLogRef.current = [...errorLogRef.current, ...e.data.errors];
        setErrorMessages(errorLogRef.current);
        const processingTime = performance.now() - performanceStartRef.current;
        if (processingTime > 1000) batchSizeRef.current = Math.max(1, batchSizeRef.current - 1);
        else if (processingTime < 500) batchSizeRef.current = Math.min(10, batchSizeRef.current + 1);
        if (e.data.done) {
          setIsAutoMapping(false);
          setIsPaused(false);
          setCurrentIndex(0);
          setProgress(1);
          setAutoMappingStatus('Auto-mapping terminé!');
          setTimeout(() => setAutoMappingStatus(''), 3000);
          localStorage.setItem('brickSelections', JSON.stringify(brickNmcSelections));
        } else if (!isPaused && e.data.index + 1 < brickData.length) {
          setTimeout(() => {
            performanceStartRef.current = performance.now();
            workerRef.current.postMessage({
              brickData, nmcData,
              startIndex: e.data.index + 1,
              endIndex: Math.min(e.data.index + 1 + batchSizeRef.current, brickData.length),
              pause: false, totalBricks: brickData.length,
              keywordToCategory, productToNmc, nmcByCategory, nmcByKeyTerm,
              initialSelections, existingSelections: brickNmcSelections
            });
          }, 50);
        }
      }
    };
    return () => { workerRef.current.terminate(); URL.revokeObjectURL(workerUrl); };
  }, [isPaused, brickNmcSelections, brickData]);

  const resumeFromLastIndex = useCallback(() => {
    if (currentIndex >= brickData.length) return;
    setIsAutoMapping(true);
    setIsPaused(false);
    setAutoMappingStatus('Reprise auto-mapping...');
    performanceStartRef.current = performance.now();
    workerRef.current.postMessage({
      brickData, nmcData,
      startIndex: currentIndex,
      endIndex: Math.min(currentIndex + batchSizeRef.current, brickData.length),
      pause: false, totalBricks: brickData.length,
      keywordToCategory, productToNmc, nmcByCategory, nmcByKeyTerm,
      initialSelections, existingSelections: brickNmcSelections
    });
  }, [currentIndex, brickNmcSelections, brickData]);

  // ── Load localStorage ─────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('brickSelections');
      if (saved) {
        const parsed = JSON.parse(saved);
        setBrickNmcSelections({ ...initialSelections, ...parsed });
        setCurrentIndex(Object.keys(parsed).length);
      } else {
        setBrickNmcSelections(initialSelections);
      }
    } catch (_) {
      setBrickNmcSelections(initialSelections);
    }
    setLoading(false);
  }, []);

  // ── Persist & notify parent ───────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem('brickSelections', JSON.stringify(brickNmcSelections));
      const mappedCount = Object.keys(brickNmcSelections).filter(k => brickNmcSelections[k]?.length > 0).length;
      const uniqueNmcCodes = [...new Set(
        Object.values(brickNmcSelections).flatMap(nmcs => nmcs.map(n => n.CodeNmc))
      )].length;
      onProgressUpdate?.(mappedCount, brickData.length);
      onNmcUpdate?.(uniqueNmcCodes, nmcData.length);
      onSelectionsChange?.(brickNmcSelections, brickData.length);
    } catch (_) {}
  }, [brickNmcSelections, brickData, onProgressUpdate, onNmcUpdate, onSelectionsChange]);

  // ── Auto-mapping controls ─────────────────────────────────────────────────────
  const startAutoMapping = useCallback(() => {
    if (isAutoMapping || brickData.length === 0) return;
    setIsAutoMapping(true);
    setIsPaused(false);
    setProgress(currentIndex / brickData.length);
    setAutoMappingStatus('Auto-mapping démarré...');
    performanceStartRef.current = performance.now();
    workerRef.current.postMessage({
      brickData, nmcData,
      startIndex: currentIndex,
      endIndex: Math.min(currentIndex + batchSizeRef.current, brickData.length),
      pause: false, totalBricks: brickData.length,
      keywordToCategory, productToNmc, nmcByCategory, nmcByKeyTerm,
      initialSelections, existingSelections: brickNmcSelections
    });
  }, [currentIndex, brickNmcSelections, isAutoMapping, brickData]);

  const pauseAutoMapping = useCallback(() => {
    if (!isAutoMapping || isPaused) return;
    setIsPaused(true);
    setAutoMappingStatus('Auto-mapping en pause...');
    workerRef.current.postMessage({ pause: true });
  }, [isAutoMapping, isPaused]);

  const resumeAutoMapping = useCallback(() => {
    if (!isAutoMapping || !isPaused) return;
    setIsPaused(false);
    setAutoMappingStatus('Auto-mapping repris...');
    resumeFromLastIndex();
  }, [isAutoMapping, isPaused, resumeFromLastIndex]);

  const resetAutoMapping = useCallback(() => {
    setIsAutoMapping(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentIndex(0);
    setAutoMappingStatus('');
    setErrorMessages([]);
    errorLogRef.current = [];
    setBrickNmcSelections(initialSelections);
    workerRef.current.terminate();
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    workerRef.current = new Worker(workerUrl);
    try { localStorage.removeItem('brickSelections'); } catch (_) {}
  }, []);

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
        setBrickNmcSelections({ ...initialSelections, ...imported });
        localStorage.setItem('brickSelections', JSON.stringify(imported));
        setAutoMappingStatus('Importation réussie!');
        setTimeout(() => setAutoMappingStatus(''), 3000);
        setCurrentIndex(Object.keys(imported).length);
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
            Auto-Map
          </Button>
        ) : (
          <>
            <Button
              onClick={isPaused ? resumeAutoMapping : pauseAutoMapping}
              size="sm"
              variant="outline"
              className="h-8 text-xs"
            >
              {isPaused ? '▶ Reprendre' : '⏸ Pause'}
            </Button>
            <Button
              onClick={resetAutoMapping}
              size="sm"
              variant="outline"
              className="h-8 text-xs text-red-600 border-red-300 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5 mr-1" />Stop
            </Button>
          </>
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