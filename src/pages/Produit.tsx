import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Button } from "@/components/ui/button";
import { Upload, Save, Settings } from 'lucide-react';
import Mapping from './Mapping';
import { brickData } from '../pages/bricks';
import { nmcData } from '../pages/nmcCodes';
import { initialSelections } from '../pages/initialSelections';

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

const Produit = () => {
  // Precompute indexes (define as empty for now; populate if data available)
  const keywordToCategory = {};
  const productToNmc = {};
  const nmcByCategory = {};
  const nmcByKeyTerm = {};

  // State for analytics
  const [mappingProgress, setMappingProgress] = useState(0);
  const [mappedCount, setMappedCount] = useState(0);
  const [rayonData, setRayonData] = useState([
    { name: 'Mappé', value: 0, color: '#3b82f6' },
    { name: 'Non Mappé', value: 14266, color: '#f97316' },
  ]);
  const [brickMappingData, setBrickMappingData] = useState([
    { name: '0 Rayons', value: 6647, color: '#f97316' },
    { name: '1 Rayon', value: 0, color: '#3b82f6' },
    { name: '2 Rayons', value: 0, color: '#10b981' },
    { name: '3+ Rayons', value: 0, color: '#8b5cf6' },
  ]);
  const totalBricks = 6647;
  const totalNmcCodes = 14266;

  // State for mapping
  const [brickNmcSelections, setBrickNmcSelections] = useState(initialSelections);
  const [isAutoMapping, setIsAutoMapping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoMappingStatus, setAutoMappingStatus] = useState('');
  const [errorMessages, setErrorMessages] = useState([]);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [isAutoMapMenuOpen, setIsAutoMapMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);
  const autoMapButtonRef = useRef(null);
  const autoMapMenuRef = useRef(null);
  const exportButtonRef = useRef(null);
  const exportMenuRef = useRef(null);
  const batchSizeRef = useRef(3);
  const performanceStartRef = useRef(null);
  const errorLogRef = useRef([]);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('brickSelections');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setBrickNmcSelections((prev) => ({ ...initialSelections, ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to parse stored selections:', error);
        setErrorMessages((prev) => [...prev, `Failed to load from storage: ${error.message}`]);
        setIsErrorModalOpen(true);
      }
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('brickSelections', JSON.stringify(brickNmcSelections));
  }, [brickNmcSelections]);

  // Update analytics on selections change
  useEffect(() => {
    const mapped = Object.values(brickNmcSelections).filter((sels) => sels.length > 0).length;
    setMappedCount(mapped);
    setMappingProgress(Math.round((mapped / totalBricks) * 100));

    // Update brick mapping data
    const mappingCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    Object.values(brickNmcSelections).forEach((selections) => {
      const count = selections.length;
      if (count >= 3) mappingCounts[3]++;
      else mappingCounts[count]++;
    });
    mappingCounts[0] = totalBricks - (mappingCounts[1] + mappingCounts[2] + mappingCounts[3]);
    setBrickMappingData([
      { name: '0 Rayons', value: mappingCounts[0], color: '#f97316' },
      { name: '1 Rayon', value: mappingCounts[1], color: '#3b82f6' },
      { name: '2 Rayons', value: mappingCounts[2], color: '#10b981' },
      { name: '3+ Rayons', value: mappingCounts[3], color: '#8b5cf6' },
    ]);

    // Update NMC data
    const usedNmc = new Set();
    Object.values(brickNmcSelections).forEach((sels) => {
      sels.forEach((sel) => usedNmc.add(sel.CodeNmc));
    });
    setRayonData([
      { name: 'Mappé', value: usedNmc.size, color: '#3b82f6' },
      { name: 'Non Mappé', value: totalNmcCodes - usedNmc.size, color: '#f97316' },
    ]);
  }, [brickNmcSelections]);

  // Callbacks for analytics
  const handleProgressUpdate = useCallback((mapped, total) => {
    setMappedCount(mapped);
    setMappingProgress(Math.round((mapped / total) * 100));

    // Update brick mapping data
    const mappingCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    Object.values(brickNmcSelections).forEach(selections => {
      const count = selections.length;
      if (count >= 3) mappingCounts[3]++;
      else mappingCounts[count]++;
    });
    mappingCounts[0] = total - (mappingCounts[1] + mappingCounts[2] + mappingCounts[3]);
    setBrickMappingData([
      { name: '0 Rayons', value: mappingCounts[0], color: '#f97316' },
      { name: '1 Rayon', value: mappingCounts[1], color: '#3b82f6' },
      { name: '2 Rayons', value: mappingCounts[2], color: '#10b981' },
      { name: '3+ Rayons', value: mappingCounts[3], color: '#8b5cf6' },
    ]);
  }, [brickNmcSelections]);

  const handleNmcUpdate = useCallback((mappedNmc, totalNmc) => {
    setRayonData([
      { name: 'Mappé', value: mappedNmc, color: '#3b82f6' },
      { name: 'Non Mappé', value: totalNmc - mappedNmc, color: '#f97316' },
    ]);
  }, []);

  // Callbacks for mapping
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
    setIsExportMenuOpen(false);
  }, [brickNmcSelections]);

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
    setIsExportMenuOpen(false);
  }, [brickNmcSelections, normalizeBrickCode]);

  const saveSelections = useCallback(() => {
    const jsContent = `export const initialSelections = ${JSON.stringify(brickNmcSelections, null, 2)};`;
    const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'initialSelections.js';
    link.click();
    URL.revokeObjectURL(blob);
    setIsExportMenuOpen(false);
  }, [brickNmcSelections]);

  // Handle Auto-Map button click
  const handleAutoMapButtonClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    autoMapButtonRef.current = button;
    const rect = button.getBoundingClientRect();
    const menuWidth = 192; // w-48 = 12rem = 192px
    const menuHeight = 120; // Approximate height of the menu
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let menuLeft = rect.left + scrollX;
    if (menuLeft + menuWidth > viewportWidth + scrollX) {
      menuLeft = rect.right + scrollX - menuWidth;
    }
    if (menuLeft < scrollX) {
      menuLeft = scrollX + 8;
    }

    let menuTop = rect.bottom + scrollY + 4;
    if (menuTop + menuHeight > viewportHeight + scrollY) {
      menuTop = rect.top + scrollY - menuHeight - 4;
    }
    if (menuTop < scrollY) {
      menuTop = scrollY + 8;
    }

    setIsAutoMapMenuOpen((prev) => !prev);
  }, []);

  // Handle Export button click
  const handleExportButtonClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    exportButtonRef.current = button;
    const rect = button.getBoundingClientRect();
    const menuWidth = 192; // w-48 = 12rem = 192px
    const menuHeight = 120; // Approximate height of the menu
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let menuLeft = rect.left + scrollX;
    if (menuLeft + menuWidth > viewportWidth + scrollX) {
      menuLeft = rect.right + scrollX - menuWidth;
    }
    if (menuLeft < scrollX) {
      menuLeft = scrollX + 8;
    }

    let menuTop = rect.bottom + scrollY + 4;
    if (menuTop + menuHeight > viewportHeight + scrollY) {
      menuTop = rect.top + scrollY - menuHeight - 4;
    }
    if (menuTop < scrollY) {
      menuTop = scrollY + 8;
    }

    setIsExportMenuOpen((prev) => !prev);
  }, []);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        autoMapMenuRef.current &&
        !autoMapMenuRef.current.contains(event.target) &&
        autoMapButtonRef.current &&
        !autoMapButtonRef.current.contains(event.target)
      ) {
        setIsAutoMapMenuOpen(false);
      }
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target) &&
        exportButtonRef.current &&
        !exportButtonRef.current.contains(event.target)
      ) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Web Worker setup
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
        setMappingProgress(Math.round(((e.data.index + 1) / brickData.length) * 100));
        setCurrentIndex(e.data.index + 1);
        errorLogRef.current = [...errorLogRef.current, ...e.data.errors];
        setErrorMessages(errorLogRef.current);

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
          setMappingProgress(100);
          setAutoMappingStatus('Auto-mapping completed!');
          setTimeout(() => setAutoMappingStatus(''), 3000);
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
    setMappingProgress(Math.round((currentIndex / brickData.length) * 100));
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
    setIsAutoMapMenuOpen(false);
  }, [currentIndex, brickNmcSelections]);

  const startAutoMapping = useCallback(() => {
    if (isAutoMapping) return;
    setIsAutoMapping(true);
    setIsPaused(false);
    setMappingProgress(Math.round((currentIndex / brickData.length) * 100));
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
    setIsAutoMapMenuOpen(false);
  }, [currentIndex, brickNmcSelections, isAutoMapping]);

  const pauseAutoMapping = useCallback(() => {
    if (!isAutoMapping || isPaused) return;
    setIsPaused(true);
    setAutoMappingStatus('Auto-mapping paused...');
    workerRef.current.postMessage({ pause: true });
    setIsAutoMapMenuOpen(false);
  }, [isAutoMapping, isPaused]);

  const resumeAutoMapping = useCallback(() => {
    if (!isAutoMapping || !isPaused) return;
    setIsPaused(false);
    setAutoMappingStatus('Auto-mapping resumed...');
    resumeFromLastIndex();
    setIsAutoMapMenuOpen(false);
  }, [isAutoMapping, isPaused, resumeFromLastIndex]);

  const resetAutoMapping = useCallback(() => {
    setIsAutoMapping(false);
    setIsPaused(false);
    setMappingProgress(0);
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
    setIsAutoMapMenuOpen(false);
  }, []);

  const importSelections = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) {
      console.warn('No file selected for import');
      setErrorMessages(prev => [...prev, 'No file selected']);
      setIsErrorModalOpen(true);
      return;
    }

    if (!file.name.endsWith('.json') && !file.name.endsWith('.csv')) {
      console.warn(`Unsupported file format: ${file.name}. Expected .json or .csv`);
      setErrorMessages(prev => [...prev, `Unsupported file format: ${file.name}. Use JSON or CSV.`]);
      setIsErrorModalOpen(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let importedSelections = {};
        if (file.name.endsWith('.json')) {
          importedSelections = JSON.parse(e.target.result);
          console.log('Imported JSON:', importedSelections);
        } else if (file.name.endsWith('.csv')) {
          const rows = e.target.result.split('\n').slice(1).filter(row => row.trim());
          rows.forEach((row, index) => {
            const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(val => val.replace(/^"|"$/g, '').trim());
            const [brickCode, brickLibelle, codeNmc, libelleNmc] = columns;
            if (brickCode && codeNmc && libelleNmc) {
              const normalizedBrickCode = normalizeBrickCode(brickCode);
              importedSelections[normalizedBrickCode] = importedSelections[normalizedBrickCode] || [];
              importedSelections[normalizedBrickCode].push({ CodeNmc: codeNmc, LibelleNmc: libelleNmc });
            } else {
              console.warn(`Invalid CSV row at index ${index + 2}: ${row}`);
              setErrorMessages(prev => [...prev, `Invalid CSV row at line ${index + 2}`]);
            }
          });
          console.log('Imported CSV:', importedSelections);
        }

        if (Object.keys(importedSelections).length === 0) {
          throw new Error('No valid data found in the imported file');
        }

        setBrickNmcSelections(prev => ({ ...prev, ...importedSelections }));
        setCurrentIndex(0);
        setAutoMappingStatus('Selections imported successfully!');
        setTimeout(() => setAutoMappingStatus(''), 3000);
      } catch (error) {
        console.error('Import error:', error.message);
        setErrorMessages(prev => [...prev, `Import failed: ${error.message}`]);
        setIsErrorModalOpen(true);
      }
    };
    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      setErrorMessages(prev => [...prev, `File read error: ${reader.error?.message || 'Unknown error'}`]);
      setIsErrorModalOpen(true);
    };
    reader.readAsText(file);
    event.target.value = null;
  }, [normalizeBrickCode]);

  return (
    <div className="mx-auto max-w-9xl px-4 py-6 sm:px-6">
      {/* Breadcrumb */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 90,
          backgroundColor: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          zIndex: 10,
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#3b82f6',
        }}
      >
        <span style={{ color: '#2563eb' }}>Produits</span>
        /
        <span style={{ color: '#3b82f6' }}>Mapping Bricks-Rayon</span>
      </div>

      <header className="mb-6 mt-16">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-m font-small text-gray-900">Mapping</h1>
            <p className="mt-1 text-sm text-gray-500">
              Classification GPC avec Rayons de la Distribution
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Import Button */}
            <Button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                } else {
                  console.error('fileInputRef is not assigned');
                  setErrorMessages(prev => [...prev, 'Import button error: File input not found']);
                  setIsErrorModalOpen(true);
                }
              }}
              className="bg-purple-600 text-white hover:bg-purple-700 shadow-sm text-xs px-2 py-1 h-8"
              aria-label="Importer un fichier JSON ou CSV"
            >
              <Upload className="h-3 w-3 mr-1" />
              Import
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={importSelections}
              accept=".json,.csv"
              className="hidden"
              id="file-import"
              aria-label="Sélectionner un fichier JSON ou CSV pour l'importation"
            />
            {/* Auto-Map Button with Dropdown */}
            <div className="relative">
              <Button
                onClick={handleAutoMapButtonClick}
                className="bg-blue-900 text-white hover:bg-blue-800 shadow-sm text-xs px-2 py-1 h-8"
                aria-expanded={isAutoMapMenuOpen}
                aria-label="Ouvrir le menu Auto-Map"
              >
                <Settings className="h-3 w-3 mr-1" />
                Auto-Map
              </Button>
              {isAutoMapMenuOpen && (
                <div
                  ref={autoMapMenuRef}
                  className="fixed z-30 w-48 bg-white border border-gray-200 rounded-lg shadow-xl"
                  role="menu"
                >
                  {mappingProgress === 100 ? (
                    <button
                      onClick={resetAutoMapping}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                      role="menuitem"
                    >
                      Reset Auto-Map
                    </button>
                  ) : currentIndex === 0 && !isAutoMapping ? (
                    <button
                      onClick={startAutoMapping}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                      role="menuitem"
                    >
                      Start Auto-Map
                    </button>
                  ) : isAutoMapping && !isPaused ? (
                    <button
                      onClick={pauseAutoMapping}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                      role="menuitem"
                    >
                      Pause Auto-Map
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={resumeAutoMapping}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                        role="menuitem"
                      >
                        Resume Auto-Map
                      </button>
                      <button
                        onClick={resetAutoMapping}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                        role="menuitem"
                      >
                        Reset Auto-Map
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Save Button */}
            <Button
              onClick={saveSelections}
              className="bg-green-600 text-white hover:bg-green-700 shadow-sm text-xs px-2 py-1 h-8"
              aria-label="Enregistrer les sélections au format JS"
            >
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
            {/* Export Button with Dropdown */}
            <div className="relative">
              <Button
                onClick={handleExportButtonClick}
                className="bg-blue-900 text-white hover:bg-blue-800 shadow-sm text-xs px-2 py-1 h-8"
                aria-expanded={isExportMenuOpen}
                aria-label="Ouvrir le menu Export"
              >
                <Save className="h-3 w-3 mr-1" />
                Export
              </Button>
              {isExportMenuOpen && (
                <div
                  ref={exportMenuRef}
                  className="fixed z-30 w-48 bg-white border border-gray-200 rounded-lg shadow-xl"
                  role="menu"
                >
                  <button
                    onClick={saveJsonSelections}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                    role="menuitem"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={exportCSV}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                    role="menuitem"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={saveSelections}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                    role="menuitem"
                  >
                    Export JS
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Mapping Section */}
        <Card className="col-span-1 sm:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-small text-gray-900">
              Affectations Brick / Rayons
            </CardTitle>
            <CardDescription className="text-sm text-gray-500">
              Associez une brick à un ou plusieurs rayons
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <Mapping
              onProgressUpdate={handleProgressUpdate}
              onNmcUpdate={handleNmcUpdate}
              brickNmcSelections={brickNmcSelections}
              setBrickNmcSelections={setBrickNmcSelections}
              isAutoMapping={isAutoMapping}
              setIsAutoMapping={setIsAutoMapping}
              isPaused={isPaused}
              setIsPaused={setIsPaused}
              currentIndex={currentIndex}
              setCurrentIndex={setCurrentIndex}
              autoMappingStatus={autoMappingStatus}
              setAutoMappingStatus={setAutoMappingStatus}
              errorMessages={errorMessages}
              setErrorMessages={setErrorMessages}
              workerRef={workerRef}
              batchSizeRef={batchSizeRef}
              performanceStartRef={performanceStartRef}
              errorLogRef={errorLogRef}
            />
          </CardContent>
        </Card>

        {/* Analytics Section */}
        <Card className="col-span-1 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-small text-gray-900">
              Mapping
            </CardTitle>
            <CardDescription className="text-sm text-gray-500">
              Rayon Distribution
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-1">
                Mapping Progress: {mappingProgress}%
              </div>
              <Progress value={mappingProgress} className="h-2" />
              <div className="text-xs text-gray-500 mt-1">
                {mappedCount} of {totalBricks} bricks mapped
              </div>
            </div>
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-1">
                Rayons Mappé
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={rayonData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="50"
                    label
                  >
                    {rayonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={10} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">
                Brick Mappé
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={brickMappingData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="50"
                    label
                  >
                    {brickMappingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={10} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Produit;