const express = require('express');
const cors = require('cors');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Load data from the same directory
const brickData = require('./bricks.json');
const nmcData = require('./nmcCodes.json');
const initialSelections = require('./initialSelections.json');

// Provided categories
const categories = [
  'bijouterie', 'bonnes affaires', 'boucherie', 'boulangerie-patisserie',
  'brico/auto', 'cafeteria', 'carburant-gaz', 'cremerie', 'croque',
  'DHP', 'education', 'liquides'
];

// Normalize French text
const normalizeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

// French keyword-to-category mapping
const keywordToCategory = {
  bijoux: 'bijouterie',
  bague: 'bijouterie',
  collier: 'bijouterie',
  promo: 'bonnes affaires',
  offre: 'bonnes affaires',
  viande: 'boucherie',
  boeuf: 'boucherie',
  poulet: 'boucherie',
  pain: 'boulangerie-patisserie',
  croissant: 'boulangerie-patisserie',
  gâteau: 'boulangerie-patisserie',
  outil: 'brico/auto',
  pneu: 'brico/auto',
  auto: 'brico/auto',
  café: 'cafeteria',
  sandwich: 'cafeteria',
  essence: 'carburant-gaz',
  gaz: 'carburant-gaz',
  fromage: 'cremerie',
  lait: 'cremerie',
  yaourt: 'cremerie',
  croque: 'croque',
  parfum: 'DHP',
  savon: 'DHP',
  shampoing: 'DHP',
  livre: 'education',
  cahier: 'education',
  eau: 'liquides',
  soda: 'liquides',
  jus: 'liquides',
  fruits: 'FRUITS ET LEGUMES',
  légumes: 'FRUITS ET LEGUMES',
  bio: 'FRUITS ET LEGUMES',
  poisson: 'POISSON'
};

// French product-to-NMC mapping
const productToNmc = {
  banane: ['2310401', '2310740'],
  pomme: ['2310301'],
  tomate: ['2320042', '2320051', '2320033'],
  fromage: ['2150008', '2150503', '2150607', '2150616'],
  lait: ['2130050', '2130102', '2130122'],
  poisson: ['2420190', '248'],
  légumes: ['232', '23209'],
  pain: ['2110101', '2110202'],
  croissant: ['2110303'],
  viande: ['2210101', '2210202'],
  parfum: ['2510101'],
  savon: ['2510202'],
  eau: ['2330101'],
  soda: ['2330202'],
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

const calculateSimilarity = (brickLabel, nmc, brickCategoryHints, productHints) => {
  const words1 = normalizeText(brickLabel).split(/\s+/).filter(Boolean);
  const words2 = normalizeText(nmc.LibelleNmc).split(/\s+/).filter(Boolean);
  const commonWords = words1.filter(word => words2.includes(word));
  let similarity = commonWords.length / Math.max(words1.length, words2.length, 1);

  const brickCategories = brickCategoryHints || [];
  const nmcCategory = normalizeText(nmc.category);
  if (brickCategories.some(cat => nmcCategory.includes(cat))) {
    similarity += 0.4;
  } else if (brickCategories.some(cat => nmcCategory.includes(cat.split(' ')[0]))) {
    similarity += 0.2;
  }

  const codeLength = String(nmc.CodeNmc).length;
  if (codeLength > 5) {
    similarity += 0.3;
  } else if (codeLength > 3) {
    similarity += 0.15;
  }

  const keyTerms = ['bio', 'exotique', 'frais', 'emballe', 'legumes', 'fruits', 'poisson', 'cremerie', 'fromage', 'lait', 'pain', 'croissant', 'viande', 'parfum', 'savon', 'eau', 'soda', 'bijoux'];
  const hasKeyTerm = keyTerms.some(term => 
    normalizeText(brickLabel).includes(term) && normalizeText(nmc.LibelleNmc).includes(term)
  );
  if (hasKeyTerm) {
    similarity += 0.2;
  }

  const productMatch = productHints.some(hint => 
    nmc.CodeNmc === hint || normalizeText(nmc.LibelleNmc).includes(normalizeText(hint))
  );
  if (productMatch) {
    similarity += 0.5;
  }

  return Math.min(similarity, 1.5);
};

if (isMainThread) {
  app.post('/api/automap', async (req, res) => {
    try {
      const { startIndex, endIndex, batchSize = 5 } = req.body;
      if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
        return res.status(400).json({ error: 'Invalid startIndex or endIndex' });
      }
      const totalBricks = brickData.length;
      const selections = {};
      const errors = [];

      const numWorkers = Math.max(1, os.cpus().length - 1); // Leave 1 core free
      const chunkSize = Math.ceil((endIndex - startIndex) / numWorkers);
      const workerPromises = [];

      for (let i = startIndex; i < endIndex; i += chunkSize) {
        const chunkEnd = Math.min(i + chunkSize, endIndex);
        workerPromises.push(
          new Promise((resolve) => {
            const worker = new Worker(__filename, {
              workerData: { startIndex: i, endIndex: chunkEnd }
            });
            worker.on('message', (msg) => {
              Object.assign(selections, Residents, errors.push(...msg.errors);
              resolve();
            });
            worker.on('error', (err) => {
              errors.push(`Worker error: ${err.message}`);
              resolve();
            });
            worker.on('exit', (code) => {
              if (code !== 0) errors.push(`Worker exited with code ${code}`);
            });
          })
        );
      }

      await Promise.all(workerPromises);
      res.json({
        progress: endIndex >= totalBricks ? 1 : (startIndex + batchSize) / totalBricks,
        selections,
        index: endIndex - 1,
        errors,
        done: endIndex >= totalBricks
      });
    } catch (error) {
      res.status(500).json({ error: `Server error: ${error.message}` });
    }
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
} else {
  const { startIndex, endIndex } = workerData;
  const selections = {};
  const errors = [];

  for (let i = startIndex; i < endIndex && i < brickData.length; i++) {
    try {
      const brick = brickData[i];
      if (!brick || !brick.code || !brick.label) {
        errors.push(`Invalid brick at index ${i}: ${JSON.stringify(brick)}`);
        continue;
      }
      const normalizedBrickCode = String(brick.code).trim().toLowerCase();
      if (initialSelections[normalizedBrickCode]?.length > 0) {
        selections[normalizedBrickCode] = initialSelections[normalizedBrickCode];
        continue;
      }

      const brickWords = normalizeText(brick.label).split(/\s+/).filter(Boolean);
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
        .filter(item => item.similarity > 0.25)
        .sort((a, b) => {
          const aCatMatch = brickCategoryHints.some(cat => normalizeText(a.category).includes(cat)) ? 1 : 0;
          const bCatMatch = brickCategoryHints.some(cat => normalizeText(b.category).includes(cat)) ? 1 : 0;
          if (aCatMatch !== bCatMatch) return bCatMatch - aCatMatch;
          if (b.similarity !== a.similarity) return b.similarity - a.similarity;
          return String(b.CodeNmc).length - String(a.CodeNmc).length;
        })
        .slice(0, 10)
        .map(nmc => ({
          CodeNmc: nmc.CodeNmc,
          LibelleNmc: nmc.LibelleNmc
        }));

      selections[normalizedBrickCode] = matchedNMCs;
    } catch (error) {
      errors.push(`Error processing brick at index ${i}: ${error.message}`);
    }
  }

  parentPort.postMessage({ selections, errors });
}