/**
 * Generate EANCOM IFTMIN D.01B message — Instruction de transport (P3.1)
 *
 * Structure : UNB / UNH+IFTMIN / BGM+610 / DTM / TDT / RFF (commande, DSADV) /
 *             NAD (CZ expéditeur, CN destinataire, CA transporteur) /
 *             LOC (9 enlèvement, 7 livraison) / EQD / GID+PAC/MEA (colis) / UNT / UNZ
 *
 * @param {Object} data
 * @param {string}  data.iftminNumber          Référence de l'instruction de transport
 * @param {string} [data.orderNumber]          Réf commande liée (RFF+ON)
 * @param {string} [data.desadvNumber]         Réf DSADV liée (RFF+DQ)
 * @param {Object}  data.consignor             { gln, name }  expéditeur
 * @param {Object}  data.consignee             { gln, name }  destinataire
 * @param {Object}  data.carrier               { code, name } transporteur
 * @param {Object}  data.pickup                { gln?, address?, date? }  enlèvement
 * @param {Object}  data.delivery              { gln?, address?, date? }  livraison
 * @param {string} [data.transportMode='30']   Mode UN/ECE rec.19 (30=route, 40=air, 10=mer)
 * @param {Object} [data.equipment]            { type, id }  ex. { type:'CN', id:'TRLR123' }
 * @param {Array}   data.goods                 [{ packageCount, packageType, description, weight, sscc? }]
 * @param {number} [data.totalWeight]
 * @param {string} [data.freeText]
 * @returns {string} message EANCOM IFTMIN
 */
function generateIftminEANCOM(data) {
  if (!data || !data.iftminNumber) throw new Error('[generateIftminEANCOM] iftminNumber is required');
  if (!data.consignor?.gln) throw new Error('[generateIftminEANCOM] consignor.gln is required');
  if (!data.consignee?.gln) throw new Error('[generateIftminEANCOM] consignee.gln is required');
  if (!data.carrier || (!data.carrier.code && !data.carrier.name)) {
    throw new Error('[generateIftminEANCOM] carrier is required');
  }
  if (!data.delivery || (!data.delivery.gln && !data.delivery.address)) {
    throw new Error('[generateIftminEANCOM] delivery location is required');
  }
  if (!Array.isArray(data.goods) || data.goods.length === 0) {
    throw new Error('[generateIftminEANCOM] at least one goods item is required');
  }

  const esc = (s) => String(s).replace(/([?+:'])/g, '?$1');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyymmdd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hhmm = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}`;
  const fmtDate = (v) => {
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d) ? null : yyyymmdd(d);
  };

  const segments = [];
  const icr = `IFT${yyyymmdd(now)}${hhmm(now)}`;
  const msgRef = `MSG${Date.now()}`;

  // UNB — en-tête interchange
  segments.push(`UNB+UNOC:3+${data.consignor.gln}:14+${data.consignee.gln}:14+${yyyymmdd(now)}:${hhmm(now)}+${icr}`);
  // UNH — IFTMIN D.01B
  segments.push(`UNH+${msgRef}+IFTMIN:D:01B:UN:EAN004`);
  // BGM+610 = Instruction de transport, 9 = original
  segments.push(`BGM+610+${esc(data.iftminNumber)}+9`);
  // DTM+137 = date du document
  segments.push(`DTM+137:${yyyymmdd(now)}:102`);
  if (data.pickup?.date) {
    const d = fmtDate(data.pickup.date);
    if (d) segments.push(`DTM+200:${d}:102`); // 200 = date d'enlèvement
  }
  if (data.delivery?.date) {
    const d = fmtDate(data.delivery.date);
    if (d) segments.push(`DTM+2:${d}:102`); // 2 = date de livraison demandée
  }
  // TDT+20 = transport principal
  const mode = data.transportMode || '30';
  const carrierCode = data.carrier.code || '';
  const carrierName = data.carrier.name || '';
  segments.push(`TDT+20++${mode}+++${esc(carrierCode)}:172:20:${esc(carrierName)}`);
  // RFF — références liées
  if (data.orderNumber) segments.push(`RFF+ON:${esc(data.orderNumber)}`);
  if (data.desadvNumber) segments.push(`RFF+DQ:${esc(data.desadvNumber)}`);
  // NAD — parties
  segments.push(`NAD+CZ+${data.consignor.gln}::9${data.consignor.name ? `++${esc(data.consignor.name)}` : ''}`);
  segments.push(`NAD+CN+${data.consignee.gln}::9${data.consignee.name ? `++${esc(data.consignee.name)}` : ''}`);
  segments.push(`NAD+CA+${esc(carrierCode || carrierName)}::9${carrierName ? `++${esc(carrierName)}` : ''}`);
  // LOC — lieux (9 = enlèvement/chargement, 7 = livraison)
  if (data.pickup?.gln || data.pickup?.address) {
    segments.push(`LOC+9+${esc(data.pickup.gln || data.pickup.address)}${data.pickup.gln ? '::9' : ''}`);
  }
  segments.push(`LOC+7+${esc(data.delivery.gln || data.delivery.address)}${data.delivery.gln ? '::9' : ''}`);
  // EQD — équipement (optionnel)
  if (data.equipment?.id) {
    segments.push(`EQD+${data.equipment.type || 'TE'}+${esc(data.equipment.id)}`);
  }
  // FTX — instructions libres
  if (data.freeText) segments.push(`FTX+AAI+++${esc(String(data.freeText).substring(0, 350))}`);
  // MEA — poids brut total
  if (data.totalWeight) segments.push(`MEA+WT+G+KGM:${data.totalWeight}`);

  // GID — marchandises (1 groupe par ligne)
  let gidSeq = 0;
  for (const g of data.goods) {
    gidSeq++;
    const count = g.packageCount || 1;
    const type = g.packageType || 'CT';
    segments.push(`GID+${gidSeq}+${count}:${type}`);
    if (g.description) segments.push(`FTX+AAA+++${esc(String(g.description).substring(0, 350))}`);
    if (g.weight) segments.push(`MEA+WT+G+KGM:${g.weight}`);
    if (g.sscc) segments.push(`PCI+33E+${esc(g.sscc)}`);
  }

  // UNT — nombre de segments du message (UNH inclus, UNT inclus)
  const unhIndex = segments.findIndex((s) => s.startsWith('UNH+'));
  const segCount = segments.length - unhIndex + 1; // +1 pour UNT lui-même
  segments.push(`UNT+${segCount}+${msgRef}`);
  segments.push(`UNZ+1+${icr}`);

  return segments.join("'") + "'";
}

module.exports = { generateIftminEANCOM };
