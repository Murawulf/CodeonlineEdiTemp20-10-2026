// =====================================================
// EDI TRANSMISSION HELPER
// Fonctions pour gérer les transmissions EDI
// Utilise db_utils pour une architecture centralisée
// =====================================================

const { queryDB, runUpdate } = require('./db_utils');

/**
 * Enregistre une transmission EDI dans la table edi_transmissions
 * @param {Object} db - Instance de base de données (entiteDB)
 * @param {Object} params - Paramètres de la transmission
 * @param {number} params.related_id - ID de l'objet métier (ex: id_order)
 * @param {string} params.related_type - Type d'objet (ORDER, INVOICE, DESADV, etc.)
 * @param {string} params.document_type - Type message EDI (ORDERS, INVOIC, ORDRSP, DESADV)
 * @param {number} params.partner_id - ID entité partenaire
 * @param {string} params.partner_gln - GLN du partenaire
 * @param {string} params.filename - Nom du fichier
 * @param {string} params.file_path - Chemin complet du fichier
 * @param {string} params.file_content - Contenu du fichier EANCOM
 * @param {string} params.status - PENDING, SENT, ERROR, ACKNOWLEDGED
 * @returns {Promise<number>} ID de la transmission créée
 */
async function createEdiTransmission(db, params) {
  const {
    related_id,
    related_type,
    document_type,
    direction = 'OUTBOUND',
    partner_id,
    partner_gln,
    filename,
    file_path,
    file_content,
    status = 'PENDING',
    logs = null,
    error_message = null,
    transmission_date = null
  } = params;

  console.log(`[EDI TRANSMISSION] Creating transmission: ${document_type} for ${related_type} #${related_id}`);
  console.log(`[EDI TRANSMISSION] Partner ID: ${partner_id}, Partner GLN: ${partner_gln}`);

  const query = `
    INSERT INTO edi_transmissions (
      related_id, related_type, document_type, direction,
      partner_gln, partner_id, filename, file_path, 
      file_content, status, logs, error_message, transmission_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const values = [
    related_id || null,
    related_type || null,
    document_type || null,
    direction || 'OUTBOUND',
    partner_gln || null,
    partner_id || null,
    filename || null,
    file_path || null,
    file_content || null,
    status || 'PENDING',
    logs || null,
    error_message || null,
    transmission_date || null
  ];

  try {
    const result = await runUpdate(db, query, values);
    console.log(`[EDI TRANSMISSION] ✅ Transmission created with ID: ${result.lastID}`);
    return result.lastID;
  } catch (err) {
    console.error(`[EDI TRANSMISSION] ❌ Error creating transmission:`, err);
    throw err;
  }
}

/**
 * Met à jour le statut d'une transmission EDI
 * @param {Object} db - Instance de base de données
 * @param {number} transmissionId - ID de la transmission
 * @param {string} status - Nouveau statut (SENT, ERROR, ACKNOWLEDGED)
 * @param {string} logs - Logs additionnels
 * @param {string} errorMessage - Message d'erreur si applicable
 */
async function updateEdiTransmissionStatus(db, transmissionId, status, logs = null, errorMessage = null, relatedId = null) {
  console.log(`[EDI TRANSMISSION] Updating transmission #${transmissionId} to status: ${status}`);

  let query = `
    UPDATE edi_transmissions 
    SET status = ?, logs = ?, error_message = ?, updated_at = NOW()
  `;
  let values = [status, logs, errorMessage];

  // Ajouter la date de transmission si SENT
  if (status === 'SENT') {
    query = `
      UPDATE edi_transmissions 
      SET status = ?, transmission_date = NOW(), logs = ?, error_message = ?, updated_at = NOW()
    `;
  }

  // Ajouter la date d'accusé réception si ACKNOWLEDGED
  if (status === 'ACKNOWLEDGED') {
    query = `
      UPDATE edi_transmissions 
      SET status = ?, acknowledgment_date = NOW(), logs = ?, error_message = ?, updated_at = NOW()
    `;
  }

  // Update related_id if provided
  if (relatedId !== null) {
    query = query.replace('SET ', 'SET related_id = ?, ');
    values.unshift(relatedId);
  }

  query += ` WHERE id = ?`;
  values.push(transmissionId);

  try {
    await runUpdate(db, query, values);
    console.log(`[EDI TRANSMISSION] ✅ Status updated successfully`);
  } catch (err) {
    console.error(`[EDI TRANSMISSION] ❌ Error updating status:`, err);
    throw err;
  }
}

/**
 * Récupère les transmissions pour un objet métier
 * @param {Object} db - Instance de base de données
 * @param {number} relatedId - ID de l'objet métier
 * @param {string} relatedType - Type d'objet (ORDER, INVOICE, etc.)
 * @returns {Promise<Array>} Liste des transmissions
 */
async function getEdiTransmissions(db, relatedId, relatedType) {
  const query = `
    SELECT * FROM edi_transmissions 
    WHERE related_id = ? AND related_type = ?
    ORDER BY created_at DESC
  `;

  try {
    return await queryDB(db, query, [relatedId, relatedType]);
  } catch (err) {
    console.error(`[EDI TRANSMISSION] Error fetching transmissions:`, err);
    throw err;
  }
}

/**
 * Récupère les transmissions en attente (PENDING)
 * @param {Object} db - Instance de base de données
 * @param {string} documentType - Type de document (optionnel)
 * @returns {Promise<Array>} Liste des transmissions en attente
 */
async function getPendingTransmissions(db, documentType = null) {
  let query = `
    SELECT * FROM edi_transmissions 
    WHERE status = 'PENDING'
  `;
  const values = [];

  if (documentType) {
    query += ` AND document_type = ?`;
    values.push(documentType);
  }

  query += ` ORDER BY created_at ASC`;

  try {
    return await queryDB(db, query, values);
  } catch (err) {
    console.error(`[EDI TRANSMISSION] Error fetching pending transmissions:`, err);
    throw err;
  }
}

/**
 * Incrémente le compteur de retry pour une transmission
 * @param {Object} db - Instance de base de données
 * @param {number} transmissionId - ID de la transmission
 */
async function incrementRetryCount(db, transmissionId) {
  const query = `
    UPDATE edi_transmissions 
    SET retry_count = retry_count + 1, updated_at = NOW()
    WHERE id = ?
  `;

  try {
    await runUpdate(db, query, [transmissionId]);
    console.log(`[EDI TRANSMISSION] Retry count incremented for transmission #${transmissionId}`);
  } catch (err) {
    console.error(`[EDI TRANSMISSION] Error incrementing retry count:`, err);
    throw err;
  }
}

module.exports = {
  createEdiTransmission,
  updateEdiTransmissionStatus,
  getEdiTransmissions,
  getPendingTransmissions,
  incrementRetryCount
};
