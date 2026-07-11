/**
 * Patch P1.4 — workers/edi_worker.js (processInboundAperak) :
 * après mise à jour de la table métier, met aussi à jour le statut de la
 * transmission OUTBOUND liée (edi_transmissions) → ACKNOWLEDGED / REJECTED.
 * Usage : node patch_p14.js <edi_worker.js> — idempotent.
 */
const fs = require('fs');
const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');

if (src.includes('P1.4 — transmission OUTBOUND')) { console.log('ALREADY_PATCHED'); process.exit(0); }

const anchor = `      const affected = updateResult.changes || updateResult.affectedRows || 0;
      this.log(\`[INBOUND APERAK] \${isAck ? '✅' : '❌'} \${referencedType} "\${referencedRef}" → \${newStatus} (\${affected} row(s) updated)\`);`;

const parts = src.split(anchor);
if (parts.length !== 2) { console.error(`ANCHOR_FAIL: ${parts.length - 1}`); process.exit(1); }

const block = `

      // P1.4 — transmission OUTBOUND liée : refléter l'APERAK dans edi_transmissions
      try {
        const relatedTypeMap = {
          ORDERS: 'ORDER', ORDRSP: 'ORDER_RESPONSE', INVOIC: 'INVOICE', DESADV: 'DESPATCH_ADVICE',
        };
        const relatedType = relatedTypeMap[referencedType] || referencedType;
        const metierRows = await queryDB(
          this.db,
          \`SELECT id FROM \${tableName} WHERE \${refColumn} = ? AND direction = 'OUTBOUND' ORDER BY id DESC LIMIT 1\`,
          [referencedRef]
        );
        if (metierRows.length > 0) {
          const txUpdate = await runUpdate(
            this.db,
            \`UPDATE edi_transmissions SET status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE related_type = ? AND related_id = ? AND direction = 'OUTBOUND'\`,
            [newStatus, relatedType, metierRows[0].id]
          );
          const txAffected = txUpdate.changes || txUpdate.affectedRows || 0;
          this.log(\`[INBOUND APERAK] transmission OUTBOUND \${relatedType} #\${metierRows[0].id} → \${newStatus} (\${txAffected} row(s))\`);
        }
      } catch (txErr) {
        this.log(\`[INBOUND APERAK] ⚠️ Could not update outbound transmission status: \${txErr.message}\`);
      }`;

src = parts[0] + anchor + block + parts[1];
fs.writeFileSync(file, src, 'utf8');
console.log('PATCHED_OK');
