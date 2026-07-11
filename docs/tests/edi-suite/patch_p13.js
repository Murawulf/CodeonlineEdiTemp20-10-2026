/**
 * Patch P1.3 — route POST /api/edi/desadv/preview : génère l'EANCOM DESADV
 * sans persister ni envoyer (preview UI avant envoi).
 * Usage : node patch_p13.js <server.js>  — idempotent.
 */
const fs = require('fs');
const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');

if (src.includes('P1.3 — preview DESADV')) { console.log('ALREADY_PATCHED'); process.exit(0); }

const anchor = `// POST /api/edi/desadv/send - Generate and Send DESADV`;
const parts = src.split(anchor);
if (parts.length !== 2) { console.error(`ANCHOR_FAIL: ${parts.length - 1}`); process.exit(1); }

const block = `// P1.3 — preview DESADV : génère l'EANCOM sans persistance ni envoi
app.post('/api/edi/desadv/preview', async (req, res) => {
  try {
    const data = req.body;
    if (!data.desadvNumber || !data.buyer || !data.seller) {
      return res.status(400).json({ error: 'Missing required DESADV data' });
    }
    const eancomContent = generateDesadvEANCOM(data);
    return res.json({ success: true, eancomContent });
  } catch (err) {
    console.error('[DESADV PREVIEW] Error:', err.message);
    return res.status(500).json({ error: 'Failed to generate DESADV preview', details: err.message });
  }
});

`;
src = parts[0] + block + anchor + parts[1];
fs.writeFileSync(file, src, 'utf8');
console.log('PATCHED_OK');
