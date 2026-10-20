// mappingEngine.js — precision-first Brick (GPC) → NMC matcher.
// Pure functions, no DOM / React. Usable in the browser and in Node.
//
// Philosophy: a WRONG mapping is worse than NO mapping. The engine only returns
// a match when the wording of the brick is really found in the NMC path, and it
// labels every result with a confidence tier so humans only review the doubtful ones.

export const ENGINE_VERSION = 2;

// ─── Text helpers ─────────────────────────────────────────────────────────────
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const STOP = new Set((
  'de des du la le les l d un une et ou pour a au aux en sur avec sans par dans ' +
  'non autre autres assortiment assortiments divers diverse diverses ensemble produit produits ' +
  'type types article articles generique general ' +
  // brick state words (handled separately as routing signals)
  'perissable perissables surgele surgeles longue conservation prepare prepares transforme transformes ' +
  'preparee preparees transformee transformees'
).split(' '));

// Very light French stemmer: plurals + a few endings. Good enough for matching.
export const stem = (w) => {
  if (w.length > 4 && w.endsWith('aux')) return w.slice(0, -3) + 'al';
  if (w.length > 3 && (w.endsWith('s') || w.endsWith('x'))) return w.slice(0, -1);
  return w;
};

export const tokenize = (text) =>
  norm(text).split(' ').filter(Boolean).filter((w) => !STOP.has(w)).map(stem);

// ─── Synonyms: brick vocabulary (stemmed) → NMC vocabulary (stemmed) ──────────
// Only add pairs that are TRUE equivalences in this retailer's taxonomy.
export const SYNONYMS = {
  noix: ['coque', 'fruit'],
  graine: ['graine', 'coque'],
  crustace: ['crustace', 'coquillage', 'fruit', 'mer'],
  mollusque: ['coquillage', 'cephalopode'],
  poisson: ['poisson', 'mer'],
  fromage: ['fromage'],
  yaourt: ['yaourt', 'ultra', 'frais'],
  yogourt: ['yaourt'],
  herbe: ['herbe', 'epice', 'aromate'],
  epice: ['epice'],
  sirop: ['sirop'],
  melasse: ['sirop', 'melasse'],
  vinaigre: ['vinaigre'],
  confiserie: ['confiserie'],
  chocolat: ['chocolat'],
  pate: ['pate'],
  biere: ['biere'],
  vin: ['vin'],
  eau: ['eau'],
  jus: ['jus'],
  cafe: ['cafe'],
  the: ['the'],
  tisane: ['tisane', 'infusion'],
  viande: ['viande', 'boucherie'],
  volaille: ['volaille'],
  oeuf: ['oeuf'],
  beurre: ['beurre'],
  creme: ['creme'],
  lait: ['lait'],
  glace: ['glace'],
  pain: ['pain', 'boulangerie'],
  biscuit: ['biscuit', 'biscuiterie'],
  ordinateur: ['ordinateur', 'informatique'],
  telephone: ['telephone', 'telephonie'],
  televiseur: ['tv', 'television'],
  television: ['tv', 'television'],
  jouet: ['jouet', 'jeux'],
  jeu: ['jeu', 'jouet'],
  vetement: ['vetement', 'textile'],
  chaussure: ['chaussure'],
  shampooing: ['shampoing', 'shampooing'],
  dentifrice: ['dentifrice', 'dentaire'],
  parfum: ['parfum', 'parfumerie'],
  detergent: ['detergent', 'lessive', 'entretien'],
  lessive: ['lessive'],
  couche: ['couche', 'bebe'],
  bebe: ['bebe'],
  cigarette: ['cigarette', 'tabac'],
  animal: ['animalerie', 'animaux'],
  chien: ['chien', 'animalerie'],
  chat: ['chat', 'animalerie'],
};

// ─── NMC "noise" nodes: never suggested automatically ─────────────────────────
// Operational/technical nodes of the retailer, not product families.
const NOISE_RE = new RegExp(
  '\\b(anti gaspi|demarque|codifications? specifiques?|ne pas utiliser|cession|' +
  'operation fidelite|fidelite|supplements?|stand burgard|achat|ventes? traditionnelles?|' +
  'vente|coeur de marche|d exception|sous signe qualite|label rouge|fqc|' +
  'premier prix|mdd|marque|dates|corbeille|concept vrac|concept)\\b'
);

// Category groups used to route on the brick's storage state.
const FROZEN_CATS = new Set(['SURGELES']);
const FRESH_CATS = new Set([
  'CREMERIE', 'BOUCHERIE', 'POISSON', 'PFLS', 'PFAS', 'FRUITS',
  'BOULANGERIE-PATISSERIE', 'CROQUE',
]);
const AMBIENT_CATS = new Set(['EPICERIE', 'LIQUIDES']);
const FOODISH_CATS = new Set([...FROZEN_CATS, ...FRESH_CATS, ...AMBIENT_CATS, 'CAFETERIA']);

// ─── Index ────────────────────────────────────────────────────────────────────
export function buildIndex(nmcData) {
  const nodes = [];
  const df = new Map();           // token → #nodes containing it (for IDF)
  const inverted = new Map();     // token → [node idx]

  nmcData.forEach((n) => {
    const path = String(n.LibelleNmc || '').split(' / ');
    const levels = path.map((seg) => [...new Set(tokenize(seg))]);
    const noisy = NOISE_RE.test(norm(n.LibelleNmc));
    const tokSet = new Set(levels.flat());
    const node = {
      code: n.CodeNmc,
      label: n.LibelleNmc,
      category: n.category,
      depth: path.length,
      leaf: levels[levels.length - 1] || [],
      levels,
      noisy,
      isBio: tokSet.has('bio') || tokSet.has('biologique'),
      isTrad: /\btrad\b/.test(norm(n.LibelleNmc)),
      tokens: tokSet,
    };
    const idx = nodes.length;
    nodes.push(node);
    tokSet.forEach((t) => {
      df.set(t, (df.get(t) || 0) + 1);
      if (!inverted.has(t)) inverted.set(t, []);
      inverted.get(t).push(idx);
    });
  });

  const N = nodes.length;
  const idf = (t) => Math.log(1 + N / (1 + (df.get(t) || 0)));
  return { nodes, inverted, idf, N };
}

// ─── Brick parsing ────────────────────────────────────────────────────────────
export function parseBrick(brick) {
  const label = String(brick.label ?? '');
  const n = norm(label);
  const state = /\bsurgele/.test(n) ? 'frozen'
    : /\bperissable/.test(n) ? 'fresh'
    : /longue conservation/.test(n) ? 'ambient'
    : null;
  const main = label.replace(/\([^)]*\)/g, ' ');
  const tokens = [...new Set(tokenize(main))];
  const wantsBio = /\bbio\b|biologique/.test(n);
  const elec = /non electrique/.test(n) ? 'no' : /\belectrique/.test(n) ? 'yes' : null;
  return { tokens, state, wantsBio, elec, raw: label };
}

// Infer broad macro-domain of NMC categories a brick may belong to, from the GPC
// hierarchy labels when the server provides them. Returns a Set of allowed NMC
// categories, or null (= no restriction).
export function allowedCategories(brick) {
  const h = norm([brick.segment, brick.family, brick.class].filter(Boolean).join(' '));
  if (!h) return null;
  // Sub-category routing must use family/class only: the segment name
  // ("Aliments/Boissons/Tabac") would otherwise trigger every food sub-rule.
  const hSub = norm([brick.family, brick.class].filter(Boolean).join(' '));
  const allowed = new Set();
  const has = (re) => re.test(h);
  const hasSub = (re) => re.test(hSub || h);
  const add = (...c) => c.forEach((x) => allowed.add(x));

  if (has(/aliment|boisson|tabac|alimentaire/)) {
    let sub = false;
    if (hasSub(/fruit|legume|noix|graine|champignon/)) { add('FRUITS', 'EPICERIE', 'SURGELES', 'PFLS'); sub = true; }
    if (hasSub(/alcool|biere|vin\b|spiritueux|liqueur|cidre/)) { add('LIQUIDES'); sub = true; }
    else if (hasSub(/boisson|eau\b|jus|cafe|the\b|tisane|infusion/)) { add('LIQUIDES', 'EPICERIE', 'CREMERIE'); sub = true; }
    if (hasSub(/lait|fromage|laitier|yaourt|creme|beurre|oeuf/)) { add('CREMERIE', 'PFAS', 'SURGELES', 'EPICERIE', 'LIQUIDES'); sub = true; }
    if (hasSub(/viande|volaille|gibier|charcuterie|saucisse|jambon/)) { add('BOUCHERIE', 'PFLS', 'PFAS', 'SURGELES', 'EPICERIE'); sub = true; }
    if (hasSub(/poisson|fruits de mer|crustace|mollusque|produits de la mer/)) { add('POISSON', 'PFLS', 'SURGELES', 'EPICERIE'); sub = true; }
    if (hasSub(/pain|patisserie|biscuit|boulangerie|cereale|farine|confiserie|chocolat|sucre|snack/)) {
      add('BOULANGERIE-PATISSERIE', 'EPICERIE', 'SURGELES', 'PFLS'); sub = true;
    }
    if (hasSub(/tabac|cigarette/)) { add('EPICERIE', 'SERVICE'); sub = true; }
    if (!sub) FOODISH_CATS.forEach((c) => add(c)), add('PFLS', 'PFAS');
  }
  if (has(/beaute|hygiene|soin|sante|pharma|medic|bien etre|cosmetique/)) add('DHP', 'PARAPHARMACIE', 'TECHNOLOGIE');
  if (has(/entretien|menage|nettoyage/)) add('DHP');
  if (has(/vetement|chaussure|textile|accessoire|bijou|mode/)) add('MODE', 'PERMANENT', 'BIJOUTERIE', 'MAISON');
  if (has(/outil|bricolage|construction|batiment|vehicule|auto|moto|jardin|quincaillerie|plomberie|electricite|peinture/)) {
    add('BRICO/AUTO', 'MAISON', 'CARBURANT-GAZ');
  }
  if (has(/electronique|informatique|telephone|audio|video|ordinateur|photo|appareil|electrique/)) {
    add('TECHNOLOGIE', 'LOISIRS', 'MAISON', 'EDITION');
  }
  if (has(/jouet|jeu|sport|loisir|camping|livre|musique|culture|papeterie|bureau|ecole/)) {
    add('LOISIRS', 'EDITION', 'TECHNOLOGIE', 'MAISON');
  }
  if (has(/maison|cuisine|mobilier|meuble|decoration|linge|literie|electromenager|ustensile/)) {
    add('MAISON', 'BRICO/AUTO');
    if (has(/electromenager|electrique/)) add('TECHNOLOGIE');
  }
  if (has(/animaux|animalerie/)) add('EPICERIE', 'MAISON', 'LOISIRS', 'DHP');
  if (has(/service/)) add('SERVICE', 'SERVICES');
  return allowed.size ? allowed : null;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
const LEVEL_W = [0.35, 0.5, 0.7, 0.85, 1.0]; // weight by distance from leaf (leaf = last)

function levelWeight(depth, levelIdx) {
  const fromLeaf = depth - 1 - levelIdx;
  if (fromLeaf === 0) return 1.0;
  if (fromLeaf === 1) return 0.75;
  if (fromLeaf === 2) return 0.5;
  return 0.35;
}

function scoreNode(parsed, node, index) {
  const { tokens, state, wantsBio } = parsed;
  if (tokens.length === 0) return null;

  let num = 0, den = 0, leafHit = 0, usedSyn = false;
  const matched = [];
  for (const t of tokens) {
    const w = index.idf(t);
    den += w;
    const alts = [t, ...(SYNONYMS[t] || [])];
    let best = 0, bestIsSyn = false;
    for (const a of alts) {
      if (!node.tokens.has(a)) continue;
      // best level weight at which this alt occurs
      for (let li = 0; li < node.levels.length; li++) {
        if (node.levels[li].includes(a)) {
          const lw = levelWeight(node.depth, li) * (a === t ? 1 : 0.9);
          if (lw > best) { best = lw; bestIsSyn = a !== t; }
        }
      }
    }
    if (best > 0) { num += w * best; matched.push(t); if (bestIsSyn) usedSyn = true; }
    if (best >= 0.75) leafHit += 1;
  }
  if (matched.length === 0) return null;

  const coverage = num / den;                          // how much of the brick is explained
  const leafSet = new Set(node.leaf);
  const extraLeaf = node.leaf.filter((x) => !tokens.includes(x) &&
    !tokens.some((t) => (SYNONYMS[t] || []).includes(x))).length;
  const precision = node.leaf.length
    ? 1 - extraLeaf / (node.leaf.length + 1)           // penalize unrelated words in the leaf
    : 0.5;

  let score = coverage * 0.8 + precision * 0.2;

  // State routing (frozen / fresh / ambient) – strong, because it separates
  // otherwise identical wording ("Lait (Surgelé)" vs "Lait (Longue Conservation)").
  const cat = node.category;
  if (state === 'frozen') score += FROZEN_CATS.has(cat) ? 0.12 : -0.35;
  else if (state === 'fresh') {
    if (FROZEN_CATS.has(cat)) score -= 0.4;
    else if (AMBIENT_CATS.has(cat)) score -= 0.12;
    else if (FRESH_CATS.has(cat)) score += 0.08;
  } else if (state === 'ambient') {
    if (FROZEN_CATS.has(cat)) score -= 0.4;
    else if (FRESH_CATS.has(cat)) score -= 0.12;
    else if (AMBIENT_CATS.has(cat)) score += 0.08;
  }

  if (parsed.elec) {
    const nodeElec = /\belectrique|\bmoteur|\bpem\b/.test(norm(node.label)) || node.category === 'TECHNOLOGIE';
    if (parsed.elec === 'no' && nodeElec) score -= 0.3;
    if (parsed.elec === 'yes') score += nodeElec ? 0.06 : -0.12;
  }

  if (node.isBio && !wantsBio) score -= 0.2;
  if (node.isTrad) score -= 0.08;
  // Prefer a specific node (depth ≥ 3) over a bare top-level heading
  if (node.depth <= 1) score -= 0.15;

  // Need at least the leaf or its parent to carry evidence
  if (leafHit === 0) score -= 0.25;

  return { score, coverage, matched, leafHit, usedSyn };
}

// ─── Public: match one brick ──────────────────────────────────────────────────
export const THRESH = { auto: 0.78, review: 0.55 };

export function matchBrick(brick, index, opts = {}) {
  const max = opts.max ?? 3;
  const parsed = parseBrick(brick);
  const allowed = allowedCategories(brick);

  // candidate nodes = those sharing at least one token (or synonym)
  const cand = new Set();
  parsed.tokens.forEach((t) => {
    [t, ...(SYNONYMS[t] || [])].forEach((a) => (index.inverted.get(a) || []).forEach((i) => cand.add(i)));
  });

  const scored = [];
  cand.forEach((i) => {
    const node = index.nodes[i];
    if (node.noisy) return;
    if (node.category === 'BONNES') return; // discount mirror of other rayons
    if (allowed && !allowed.has(categoryKey(node.category))) return;
    const r = scoreNode(parsed, node, index);
    if (!r) return;
    scored.push({ node, ...r });
  });

  scored.sort((a, b) => b.score - a.score || b.node.depth - a.node.depth);
  if (!scored.length) return { status: 'none', picks: [], best: 0 };

  const best = scored[0].score;
  const top = scored[0];

  // Picks = the anchor + essentially tied siblings, never below the review floor.
  const picks = [];
  for (const sc of scored) {
    if (picks.length >= max) break;
    if (sc.score < THRESH.review) break;
    if (best - sc.score > 0.06) break;
    picks.push(sc);
  }
  if (!picks.length) return { status: 'none', picks: [], best };

  // Ambiguity: do strong competitors live in DIFFERENT families? If yes, a machine
  // cannot know which is right → human review.
  const fam = (nd) => nd.category + '|' + (nd.levels.length > 1 ? nd.label.split(' / ').slice(0, 2).join('/') : '');
  const famsNear = new Set();
  for (const sc of scored) {
    if (best - sc.score > 0.15) break;
    if (sc.coverage < 0.99 && top.coverage >= 0.99) continue;
    famsNear.add(fam(sc.node));
  }
  const ambiguous = famsNear.size > 1;

  // Strict criteria for AUTO: full coverage, every token on leaf/parent, unambiguous.
  const fullCover = top.coverage >= 0.97;
  const onLeaf = top.leafHit >= parsed.tokens.length;
  const auto = best >= THRESH.auto && fullCover && onLeaf && !ambiguous && !top.usedSyn
    && allowed !== null; // no GPC hierarchy → never claim high confidence

  return {
    status: auto ? 'auto' : 'review',
    best,
    ambiguous,
    picks: picks.map((p) => ({
      CodeNmc: p.node.code,
      LibelleNmc: p.node.label,
      score: Math.round(p.score * 100) / 100,
    })),
  };
}

function categoryKey(c) {
  return String(c || '');
}
