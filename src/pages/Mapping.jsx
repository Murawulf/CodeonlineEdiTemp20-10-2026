import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Virtuoso } from 'react-virtuoso';
import { ChevronRight, X, ArrowUp, Save, RefreshCw, Upload } from 'lucide-react';
import { brickData } from '../pages/bricks';
import { nmcData } from '../pages/nmcCodes';
import { initialSelections } from '../pages/initialSelections';

// Provided categories
const categories = [
  'bijouterie', 'bonnes affaires', 'boucherie', 'boulangerie-patisserie',
  'brico/auto', 'cafeteria', 'carburant-gaz', 'cremerie', 'croque',
  'DHP', 'education', 'liquides', 'FRUITS ET LEGUMES', 'POISSON'
];

// Normalize French text
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '');
};

// Levenshtein distance for better text matching
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

// French keyword-to-category and product-to-NMC mappings
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

// Pre-index nmcData
const nmcByCategory = nmcData.reduce((acc, nmc) => {
  const cat = normalizeText(nmc.category);
  acc[cat] = acc[cat] || [];
  acc[cat].push(nmc);
  return acc;
}, {});
const nmcByKeyTerm = nmcData.reduce((acc, nmc) => {
  const terms = normalizeText(nmc.LibelleNmc).split(/[\s\/-]+/).filter(Boolean);
  terms.forEach(term => {
    if (['bio', 'frais', 'exotique', 'banane', 'pomme', 'tomate', 'fromage', 'lait', 'poisson', 'légumes', 'pain', 'croissant', 'viande', 'parfum', 'savon', 'eau', 'soda', 'bijoux'].includes(term)) {
      acc[term] = acc[term] || [];
      acc[term].push(nmc);
    }
  });
  return acc;
}, {});

// Web Worker script
const workerScript = `
  const normalizeText = (text) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .replace(/[^a-z0-9\\s]/g, '');
  };

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

  const calculateSimilarity = (brickLabel, nmc, brickCategoryHints, productHints) => {
    const normBrick = normalizeText(brickLabel);
    const normNmc = normalizeText(nmc.LibelleNmc);
    const words1 = normBrick.split(/\\s+/).filter(Boolean);
    const words2 = normNmc.split(/\\s+/).filter(Boolean);
    const commonWords = words1.filter(word => words2.includes(word));
    let similarity = commonWords.length / Math.max(words1.length, words2.length, 1);

    // Levenshtein-based similarity
    const levDistance = levenshteinDistance(normBrick, normNmc);
    const maxLength = Math.max(normBrick.length, normNmc.length);
    similarity += (1 - levDistance / maxLength) * 0.3;

    // Category weight
    const brickCategories = brickCategoryHints || [];
    const nmcCategory = normalizeText(nmc.category);
    if (brickCategories.some(cat => nmcCategory === cat)) {
      similarity += 0.5;
    } else if (brickCategories.some(cat => nmcCategory.includes(cat.split(' ')[0]))) {
      similarity += 0.25;
    }

    // Hierarchy weight
    const codeLength = String(nmc.CodeNmc).length;
    if (codeLength > 5) {
      similarity += 0.3;
    } else if (codeLength > 3) {
      similarity += 0.15;
    }

    // Key term boost
    const keyTerms = ['bio', 'exotique', 'frais', 'emballe', 'legumes', 'fruits', 'poisson', 'cremerie', 'fromage', 'lait', 'pain', 'croissant', 'viande', 'parfum', 'savon', 'eau', 'soda', 'bijoux'];
    const hasKeyTerm = keyTerms.some(term => normBrick.includes(term) && normNmc.includes(term));
    if (hasKeyTerm) {
      similarity += 0.25;
    }

    // Product specificity
    const productMatch = productHints.some(hint => nmc.CodeNmc === hint || normNmc.includes(normalizeText(hint)));
    if (productMatch) {
      similarity += 0.6;
    }

    return Math.min(similarity, 2.0);
  };

  self.onmessage = function(e) {
    const { brickData, nmcData, startIndex, endIndex, pause, totalBricks, keywordToCategory, productToNmc, nmcByCategory, nmcByKeyTerm, initialSelections, existingSelections } = e.data;
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
        if (initialSelections[normalizedBrickCode]?.length > 0 || existingSelections[normalizedBrickCode]?.length > 0) {
          selections[normalizedBrickCode] = existingSelections[normalizedBrickCode] || initialSelections[normalizedBrickCode];
          continue;
        }
        const brickWords = normalizeText(brick.label).split(/\\s+/).filter(Boolean);
        const brickCategoryHints = brickWords
          .filter(word => Object.keys(keywordToCategory).includes(word))
          .map(word => normalizeText(keywordToCategory[word]));
        const productHints = brickWords.flatMap(word => productToNmc[word] || []);

        let relevantNmcs = [];
        if (brickCategoryHints.length > 0) {
          brickCategoryHints.forEach(cat => {
            relevantNmcs.push(...(nmcByCategory[cat] || []));
          });
        }
        brickWords.forEach(word => {
          if (nmcByKeyTerm[word]) {
            relevantNmcs.push(...nmcByKeyTerm[word]);
          }
        });
        relevantNmcs = [...new Set(relevantNmcs)];
        if (relevantNmcs.length === 0) {
          relevantNmcs = nmcData;
        }

        const matchedNMCs = relevantNmcs
          .map(nmc => ({
            ...nmc,
            similarity: calculateSimilarity(brick.label, nmc, brickCategoryHints, productHints)
          }))
          .filter(item => item.similarity > 0.3)
          .sort((a, b) => {
            const aCatMatch = brickCategoryHints.some(cat => normalizeText(a.category) === cat) ? 1 : 0;
            const bCatMatch = brickCategoryHints.some(cat => normalizeText(b.category) === cat) ? 1 : 0;
            if (aCatMatch !== bCatMatch) return bCatMatch - aCatMatch;
            if (b.similarity !== a.similarity) return b.similarity - a.similarity;
            return String(b.CodeNmc).length - String(a.CodeNmc).length;
          })
          .slice(0, 3)
          .map(nmc => ({
            CodeNmc: nmc.CodeNmc,
            LibelleNmc: nmc.LibelleNmc
          }));

        selections[normalizedBrickCode] = matchedNMCs;
        self.postMessage({ 
          progress: (i + 1) / totalBricks, 
          selections, 
          index: i,
          errors
        });
        for (const key in selections) {
          delete selections[key];
        }
      }
      if (endIndex >= brickData.length) {
        self.postMessage({ done: true, selections: {}, index: endIndex - 1, errors });
      } else {
        self.postMessage({ done: false, selections: {}, index: endIndex - 1, errors });
      }
    } catch (error) {
      self.postMessage({ error: error.message, index: startIndex, errors: [\`Fatal error: \${error.message}\`] });
    }
  };
`;

const Mapping = ({ onProgressUpdate, onNmcUpdate }) => {
  const [brickNmcSelections, setBrickNmcSelections] = useState(initialSelections);
  const [currentBrickCode, setCurrentBrickCode] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nmcSearch, setNmcSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNmcCodes, setSelectedNmcCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [autoMappingStatus, setAutoMappingStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorMessages, setErrorMessages] = useState([]);
  const [isAutoMapping, setIsAutoMapping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const searchTimeoutRef = useRef(null);
  const virtuosoRef = useRef(null);
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);
  const errorLogRef = useRef([]);
  const batchSizeRef = useRef(3); // Dynamic batch size
  const performanceStartRef = useRef(null);

  const normalizeBrickCode = useCallback((code) => String(code).trim().toLowerCase(), []);

  const saveJsonSelections = useCallback(() => {
    const jsonContent = JSON.stringify(brickNmcSelections, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `brick_nmc_selections.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [brickNmcSelections]);

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
        localStorage.setItem('brickSelections', JSON.stringify(brickNmcSelections));
        // Adjust batch size based on error
        batchSizeRef.current = Math.max(1, batchSizeRef.current - 1);
        setTimeout(() => resumeFromLastIndex(), 2000);
      } else {
        setBrickNmcSelections(prev => ({ ...prev, ...e.data.selections }));
        setProgress(e.data.progress);
        setCurrentIndex(e.data.index + 1);
        errorLogRef.current = [...errorLogRef.current, ...e.data.errors];
        setErrorMessages(errorLogRef.current);

        // Adjust batch size based on performance
        const processingTime = performance.now() - performanceStartRef.current;
        if (processingTime > 1000) {
          batchSizeRef.current = Math.max(1, batchSizeRef.current - 1);
        } else if (processingTime < 500) {
          batchSizeRef.current = Math.min(10, batchSizeRef.current + 1);
        }

        if (e.data.done) {
          setIsAutoMapping(false);
          setIsPaused(false);
          setCurrentIndex(0);
          setProgress(1);
          setAutoMappingStatus('Auto-mapping completed!');
          setTimeout(() => setAutoMappingStatus(''), 3000);
          localStorage.setItem('brickSelections', JSON.stringify(brickNmcSelections));
        } else if (!isPaused && e.data.index + 1 < brickData.length) {
          setTimeout(() => {
            performanceStartRef.current = performance.now();
            workerRef.current.postMessage({
              brickData,
              nmcData,
              startIndex: e.data.index + 1,
              endIndex: Math.min(e.data.index + 1 + batchSizeRef.current, brickData.length),
              pause: false,
              totalBricks: brickData.length,
              keywordToCategory,
              productToNmc,
              nmcByCategory,
              nmcByKeyTerm,
              initialSelections,
              existingSelections: brickNmcSelections
            });
          }, 50);
        }
      }
    };
    return () => {
      workerRef.current.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, [isPaused, brickNmcSelections]);

  const resumeFromLastIndex = useCallback(() => {
    if (currentIndex >= brickData.length) return;
    setIsAutoMapping(true);
    setIsPaused(false);
    setAutoMappingStatus('Resuming auto-mapping...');
    performanceStartRef.current = performance.now();
    workerRef.current.postMessage({
      brickData,
      nmcData,
      startIndex: currentIndex,
      endIndex: Math.min(currentIndex + batchSizeRef.current, brickData.length),
      pause: false,
      totalBricks: brickData.length,
      keywordToCategory,
      productToNmc,
      nmcByCategory,
      nmcByKeyTerm,
      initialSelections,
      existingSelections: brickNmcSelections
    });
  }, [currentIndex, brickNmcSelections]);

  useEffect(() => {
    try {
      const savedSelections = localStorage.getItem('brickSelections');
      if (savedSelections) {
        const parsedSelections = JSON.parse(savedSelections);
        setBrickNmcSelections({ ...initialSelections, ...parsedSelections });
        setCurrentIndex(Object.keys(parsedSelections).length);
      } else {
        setBrickNmcSelections(initialSelections);
      }
    } catch (error) {
      setErrorMessages(prev => [...prev, `Failed to load localStorage: ${error.message}`]);
      setIsErrorModalOpen(true);
      setBrickNmcSelections(initialSelections);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('brickSelections', JSON.stringify(brickNmcSelections));
      const mappedCount = Object.keys(brickNmcSelections).filter(key => brickNmcSelections[key]?.length > 0).length;
      const uniqueNmcCodes = [...new Set(
        Object.values(brickNmcSelections).flatMap(nmcs => nmcs.map(nmc => nmc.CodeNmc))
      )].length;
      onProgressUpdate(mappedCount, brickData.length);
      onNmcUpdate(uniqueNmcCodes, nmcData.length);
    } catch (error) {
      setErrorMessages(prev => [...prev, `Failed to save localStorage: ${error.message}`]);
      setIsErrorModalOpen(true);
    }
  }, [brickNmcSelections, onProgressUpdate, onNmcUpdate]);

  const startAutoMapping = useCallback(() => {
    if (isAutoMapping) return;
    setIsAutoMapping(true);
    setIsPaused(false);
    setProgress(currentIndex / brickData.length);
    setAutoMappingStatus('Auto-mapping started...');
    performanceStartRef.current = performance.now();
    workerRef.current.postMessage({
      brickData,
      nmcData,
      startIndex: currentIndex,
      endIndex: Math.min(currentIndex + batchSizeRef.current, brickData.length),
      pause: false,
      totalBricks: brickData.length,
      keywordToCategory,
      productToNmc,
      nmcByCategory,
      nmcByKeyTerm,
      initialSelections,
      existingSelections: brickNmcSelections
    });
  }, [currentIndex, brickNmcSelections, isAutoMapping]);

  const pauseAutoMapping = useCallback(() => {
    if (!isAutoMapping || isPaused) return;
    setIsPaused(true);
    setAutoMappingStatus('Auto-mapping paused...');
    workerRef.current.postMessage({ pause: true });
  }, [isAutoMapping, isPaused]);

  const resumeAutoMapping = useCallback(() => {
    if (!isAutoMapping || !isPaused) return;
    setIsPaused(false);
    setAutoMappingStatus('Auto-mapping resumed...');
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
    workerRef.current.onmessage = workerRef.current.onmessage;
    try {
      localStorage.removeItem('brickSelections');
    } catch (error) {
      setErrorMessages(prev => [...prev, `Failed to clear localStorage: ${error.message}`]);
      setIsErrorModalOpen(true);
    }
  }, []);

  const importSelections = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let importedSelections;
        if (file.name.endsWith('.json')) {
          importedSelections = JSON.parse(e.target.result);
        } else if (file.name.endsWith('.csv')) {
          const rows = e.target.result.split('\n').slice(1).filter(row => row.trim());
          importedSelections = {};
          rows.forEach(row => {
            const [brickCode, , codeNmc, libelleNmc] = row.split('","').map(val => val.replace(/^"|"$/g, ''));
            if (brickCode && codeNmc && libelleNmc) {
              const normalizedBrickCode = normalizeBrickCode(brickCode);
              importedSelections[normalizedBrickCode] = importedSelections[normalizedBrickCode] || [];
              importedSelections[normalizedBrickCode].push({ CodeNmc: codeNmc, LibelleNmc: libelleNmc });
            }
          });
        } else {
          throw new Error('Unsupported file format. Use JSON or CSV.');
        }
        setBrickNmcSelections(prev => ({ ...initialSelections, ...importedSelections }));
        localStorage.setItem('brickSelections', JSON.stringify(importedSelections));
        setAutoMappingStatus('Selections imported successfully!');
        setTimeout(() => setAutoMappingStatus(''), 3000);
        setCurrentIndex(Object.keys(importedSelections).length);
      } catch (error) {
        setErrorMessages(prev => [...prev, `Import failed: ${error.message}`]);
        setIsErrorModalOpen(true);
      }
    };
    reader.readAsText(file);
    event.target.value = null;
  }, [normalizeBrickCode]);

  const scrollToTop = useCallback(() => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const openModal = useCallback((brickCode) => {
    setCurrentBrickCode(brickCode);
    setIsModalOpen(true);
    setNmcSearch('');
    setSelectedCategory('');
    setSelectedNmcCodes([]);
    document.querySelectorAll('[data-brick-code]').forEach(el => el.classList.remove('bg-blue-100', 'border-blue-500'));
    const target = document.querySelector(`[data-brick-code="${brickCode}"]`);
    if (target) target.classList.add('bg-blue-100', 'border-blue-500');
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedNmcCodes([]);
  }, []);

  const handleNmcToggle = useCallback((codeNmc) => {
    setSelectedNmcCodes(prev =>
      prev.includes(codeNmc)
        ? prev.filter(c => c !== codeNmc)
        : [...prev, codeNmc]
    );
  }, []);

  const validateSelection = useCallback(() => {
    const selectedNMCs = nmcData
      .filter(nmc => selectedNmcCodes.includes(nmc.CodeNmc))
      .map(nmc => ({
        CodeNmc: nmc.CodeNmc,
        LibelleNmc: nmc.LibelleNmc
      }));
    const normalizedBrickCode = normalizeBrickCode(currentBrickCode);
    setBrickNmcSelections(prev => ({
      ...prev,
      [normalizedBrickCode]: selectedNMCs
    }));
    closeModal();
  }, [currentBrickCode, selectedNmcCodes, normalizeBrickCode, closeModal]);

  const removeNMC = useCallback((brickCode, codeNmc) => {
    const normalizedBrickCode = normalizeBrickCode(brickCode);
    setBrickNmcSelections(prev => ({
      ...prev,
      [normalizedBrickCode]: prev[normalizedBrickCode].filter(nmc => nmc.CodeNmc !== codeNmc)
    }));
  }, [normalizeBrickCode]);

  const filterNMCList = useMemo(() => {
    const keywords = normalizeText(nmcSearch).split(' ').filter(Boolean);
    return nmcData.filter(item => {
      const matchesCategory = !selectedCategory || item.category === selectedCategory;
      const matchesKeywords = keywords.every(kw => normalizeText(item.LibelleNmc).includes(kw));
      return matchesCategory && matchesKeywords;
    });
  }, [nmcSearch, selectedCategory]);

  const filterBricks = useMemo(() => {
    return brickData.filter(brick =>
      normalizeText(brick.label).includes(normalizeText(searchQuery))
    );
  }, [searchQuery]);

  const handleSearchInput = useCallback((e) => {
    clearTimeout(searchTimeoutRef.current);
    const query = e.target.value;
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(query);
    }, 300);
  }, []);

  const exportCSV = useCallback(() => {
    const data = [];
    brickData.forEach(brick => {
      const normalizedBrickCode = normalizeBrickCode(brick.code);
      const selected = brickNmcSelections[normalizedBrickCode] || [];
      if (selected.length > 0) {
        selected.forEach(nmc => {
          data.push({
            BrickCode: brick.code,
            BrickLibelle: brick.label,
            CodeNmc: nmc.CodeNmc,
            LibelleNmc: nmc.LibelleNmc
          });
        });
      } else {
        data.push({
          BrickCode: brick.code,
          BrickLibelle: brick.label,
          CodeNmc: '',
          LibelleNmc: ''
        });
      }
    });

    const csvContent = [
      'BrickCode,BrickLibelle,CodeNmc,LibelleNmc',
      ...data.map(row => 
        `"${row.BrickCode}","${row.BrickLibelle.replace(/"/g, '""')}","${row.CodeNmc}","${row.LibelleNmc.replace(/"/g, '""')}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'brick_nmc_selections.csv';
    link.click();
    URL.revokeObjectURL(blob);
  }, [brickNmcSelections, normalizeBrickCode]);

  const saveSelections = useCallback(() => {
    const jsContent = `export const initialSelections = ${JSON.stringify(brickNmcSelections, null, 2)};`;
    const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'initialSelections.js';
    link.click();
    URL.revokeObjectURL(blob);
  }, [brickNmcSelections]);

  if (loading) {
    return (
      <div className="text-center text-muted-foreground">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mx-auto"></div>
          <div className="h-600 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 relative">
      <div className="flex justify-between items-start gap-2">
        <Input
          type="text"
          placeholder="Rechercher une brick..."
          onChange={handleSearchInput}
          className="w-1/3 rounded-md border-border shadow-sm"
        />
    
      </div>
      {autoMappingStatus && (
        <div className="text-center text-green-600">{autoMappingStatus}</div>
      )}
      {isAutoMapping && (
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          ></div>
        </div>
      )}
      <div className="border rounded-md border-border shadow-sm relative">
        <Virtuoso
          key={`${JSON.stringify(filterBricks)}-${JSON.stringify(brickNmcSelections)}`}
          ref={virtuosoRef}
          style={{ height: '600px' }}
          data={filterBricks}
          overscan={100}
          itemContent={(index, brick) => {
            const normalizedBrickCode = normalizeBrickCode(brick.code);
            return (
              <div
                key={brick.code}
                data-brick-code={brick.code}
                onClick={() => openModal(brick.code)}
                className="flex items-center p-4 m-2 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors bg-white shadow-sm"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-3 hover:bg-gray-200 rounded-full"
                >
                  <ChevronRight className="h-5 w-5 text-gray-500" />
                </Button>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-primary">{brick.code}</div>
                  <div className="text-sm text-muted-foreground">{brick.label}</div>
                  {(brickNmcSelections[normalizedBrickCode] || []).map(nmc => (
                    <div key={nmc.CodeNmc} className="flex items-center justify-between bg-gray-100 p-2 rounded-md mt-2 shadow-sm">
                      <span className="text-sm text-gray-700">{nmc.CodeNmc} - {nmc.LibelleNmc}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNMC(brick.code, nmc.CodeNmc);
                        }}
                        className="text-red-500 hover:text-red-700 rounded-full"
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
          onScroll={(e) => setShowScrollToTop(e.target.scrollTop > 300)}
        />
        {showScrollToTop && (
          <Button
            onClick={scrollToTop}
            className="fixed bottom-4 right-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-md p-2 transition-opacity duration-300"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        )}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-sm shadow-none w-[420px] max-h-[90vh] overflow-y-auto relative border border-border">
            <h3 className="text-xl font- text-primary mb-3">Sélectionner les codes Rayons pour {brickData.find(b => b.code === currentBrickCode)?.label}</h3>
            <label className="block text-sm text-muted-foreground mb-1" htmlFor="categorySelect">Filtrer par catégorie :</label>
            <select
              id="categorySelect"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="mb-3 w-full border rounded-md p-2 text-sm border-border shadow-sm"
            >
              <option value="">-- Toutes les catégories --</option>
              {categories.map(cat => (
                <option key={cat} value={cat} style={{ backgroundColor: nmcData.find(n => n.category === cat)?.background || '' }}>
                  {cat}
                </option>
              ))}
            </select>
            <Input
              id="nmcSearch"
              type="text"
              placeholder="Rechercher un code NMC..."
              value={nmcSearch}
              onChange={(e) => setNmcSearch(e.target.value)}
              className="mb-3 rounded-md border-border shadow-sm"
            />
            <div className="border rounded-md p-2 bg-gray-50 border-border shadow-sm">
              <Virtuoso
                style={{ height: '256px' }}
                data={filterNMCList}
                overscan={100}
                itemContent={(index, nmc) => (
                  <div
                    key={nmc.CodeNmc}
                    className="flex items-center p-1 rounded-sm hover:bg-gray-100"
                    style={{ backgroundColor: nmc.background || 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      className="mr-2 h-5 w-5 text-primary border-border rounded"
                      value={nmc.CodeNmc}
                      checked={selectedNmcCodes.includes(nmc.CodeNmc)}
                      onChange={() => handleNmcToggle(nmc.CodeNmc)}
                    />
                    <span className="text-sm text-gray-700">{nmc.CodeNmc} - {nmc.LibelleNmc}</span>
                  </div>
                )}
              />
            </div>
            <div className="flex justify-end mt-4 space-x-2">
              <Button
                variant="outline"
                onClick={closeModal}
                className="border-border text-gray-700 hover:bg-gray-100 shadow-sm"
              >
                Annuler
              </Button>
              <Button
                onClick={validateSelection}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                Valider
              </Button>
            </div>
          </div>
        </div>
      )}
      {isErrorModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-sm shadow-none w-[420px] relative border border-border">
            <h3 className="text-xl font-bold text-red-600 mb-3">Auto-Mapping Errors</h3>
            <ul className="text-sm text-gray-700 mb-4 max-h-[200px] overflow-y-auto">
              {errorMessages.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button
                onClick={() => setIsErrorModalOpen(false)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mapping;