/**
 * Notification Helper
 * Fonctions pour créer et envoyer des notifications
 */

const { runUpdate, queryDB } = require('./db_utils');

/**
 * Créer une notification pour un utilisateur
 * @param {Object} db - Connexion à la base de données
 * @param {number} id_compte - ID du compte utilisateur
 * @param {string} contenu - Contenu de la notification
 * @param {string} type - Type de notification ('success', 'error', 'info')
 * @param {string} link - Lien optionnel (ex: '/operations/commandes')
 * @returns {Promise<number>} ID de la notification créée
 */
async function createNotification(db, id_compte, contenu, type = 'success', link = null) {
  try {
    const insertSql = `
      INSERT INTO notifications (id_compte, contenu, type, link, created_at, \`read\`)
      VALUES (?, ?, ?, ?, NOW(), 0)
    `;
    
    const result = await runUpdate(db, insertSql, [parseInt(id_compte), contenu, type, link]);
    const notificationId = result.lastID;
    console.log(`[NOTIFICATION] Created notification #${notificationId} for user #${id_compte} with link: ${link}`);
    
    // Émettre un événement WebSocket pour la notification en temps réel
    if (global.io) {
      const notification = {
        id_notification: notificationId,
        id_compte: parseInt(id_compte),
        contenu,
        type,
        link,
        created_at: new Date().toISOString(),
        read: 0
      };
      
      // Emit globally - frontend filters by id_compte
      global.io.emit('notification:new', { notification });
      console.log(`[NOTIFICATION] 📡 WebSocket event emitted globally for notification #${notificationId} (user:${id_compte})`);
    }
    
    return notificationId;
  } catch (err) {
    console.error('[NOTIFICATION] Error creating notification:', err);
    throw err;
  }
}

/**
 * Créer une notification pour une commande envoyée avec succès
 * @param {Object} db - Connexion à la base de données
 * @param {number} id_compte - ID du compte utilisateur (acheteur)
 * @param {string} orderNumber - Numéro de la commande
 * @param {string} supplierName - Nom du fournisseur
 * @returns {Promise<number>} ID de la notification créée
 */
async function notifyOrderSent(db, id_compte, orderNumber, supplierName) {
  // Check for duplicate notification (same order number in content, same user, within last 5 minutes)
  try {
    const duplicateCheck = await queryDB(db, `
      SELECT id_notification FROM notifications 
      WHERE id_compte = ? AND contenu LIKE CONCAT('%', ?, '%') AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    `, [id_compte, orderNumber]);
    
    if (duplicateCheck.length > 0) {
      console.log(`[NOTIFICATION] ⚠️ Duplicate notification skipped for order ${orderNumber} (user ${id_compte})`);
      return duplicateCheck[0].id_notification;
    }
  } catch (dupErr) {
    console.log(`[NOTIFICATION] Duplicate check failed, proceeding with notification:`, dupErr.message);
  }
  
  const contenu = `Votre commande ${orderNumber} a été envoyée avec succès au fournisseur ${supplierName}.`;
  return createNotification(db, id_compte, contenu, 'success', '/operation-edi/order');
}

/**
 * Créer une notification pour une commande reçue
 * @param {Object} db - Connexion à la base de données
 * @param {number} id_compte - ID du compte utilisateur (fournisseur)
 * @param {string} orderNumber - Numéro de la commande
 * @param {string} buyerName - Nom de l'acheteur
 * @returns {Promise<number>} ID de la notification créée
 */
async function notifyOrderReceived(db, id_compte, orderNumber, buyerName) {
  // Check for duplicate notification (same order number in content, same user, within last 5 minutes)
  try {
    const duplicateCheck = await queryDB(db, `
      SELECT id_notification FROM notifications 
      WHERE id_compte = ? AND contenu LIKE CONCAT('%', ?, '%') AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    `, [id_compte, orderNumber]);
    
    if (duplicateCheck.length > 0) {
      console.log(`[NOTIFICATION] ⚠️ Duplicate notification skipped for order ${orderNumber} (user ${id_compte})`);
      return duplicateCheck[0].id_notification;
    }
  } catch (dupErr) {
    console.log(`[NOTIFICATION] Duplicate check failed, proceeding with notification:`, dupErr.message);
  }
  
  const contenu = `Nouvelle commande ${orderNumber} reçue de ${buyerName}.`;
  return createNotification(db, id_compte, contenu, 'success', '/operation-edi/order');
}

/**
 * Créer une notification pour une erreur d'envoi de commande
 * @param {Object} db - Connexion à la base de données
 * @param {number} id_compte - ID du compte utilisateur
 * @param {string} orderNumber - Numéro de la commande
 * @param {string} errorMessage - Message d'erreur
 * @returns {Promise<number>} ID de la notification créée
 */
async function notifyOrderError(db, id_compte, orderNumber, errorMessage) {
  const contenu = `Erreur lors de l'envoi de la commande ${orderNumber}: ${errorMessage}`;
  return createNotification(db, id_compte, contenu, 'error', '/operation-edi/order');
}

/**
 * Créer une notification pour une réponse de commande reçue
 */
async function notifyOrderResponseReceived(db, id_compte, orderNumber, supplierName) {
  const contenu = `Réponse reçue pour la commande ${orderNumber} de ${supplierName}.`;
  return createNotification(db, id_compte, contenu, 'success', '/operation-edi/order');
}

/**
 * Créer une notification pour un avis d'expédition reçu
 */
async function notifyDespatchAdviceReceived(db, id_compte, documentNumber, supplierName) {
  const contenu = `Avis d'expédition ${documentNumber} reçu de ${supplierName}.`;
  return createNotification(db, id_compte, contenu, 'info', '/operation-edi/shipments');
}

/**
 * Créer une notification pour une facture reçue
 */
async function notifyInvoiceReceived(db, id_compte, invoiceNumber, supplierName) {
  const contenu = `Facture ${invoiceNumber} reçue de ${supplierName}.`;
  return createNotification(db, id_compte, contenu, 'success', '/operation-edi/invoice');
}

/**
 * Récupérer les notifications d'un utilisateur (Historique)
 * @param {Object} db - Connexion à la base de données
 * @param {number} id_compte - ID du compte utilisateur
 * @param {number} limit - Nombre maximum de notifications à récupérer
 * @returns {Promise<Array>} Liste des notifications
 */
async function getNotifications(db, id_compte, limit = 50) {
  try {
    const query = `
      SELECT * FROM notifications 
      WHERE id_compte = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    return await queryDB(db, query, [id_compte, limit]);
  } catch (err) {
    console.error('[NOTIFICATION] Error fetching notifications:', err);
    throw err;
  }
}

/**
 * Récupérer le nombre de notifications non lues
 * @param {Object} db - Connexion à la base de données
 * @param {number} id_compte - ID du compte utilisateur
 * @returns {Promise<number>} Nombre de notifications non lues
 */
async function getUnreadCount(db, id_compte) {
  try {
    const query = `
      SELECT COUNT(*) as count FROM notifications 
      WHERE id_compte = ? AND \`read\` = 0
    `;
    const rows = await queryDB(db, query, [id_compte]);
    return rows && rows.length > 0 ? rows[0].count : 0;
  } catch (err) {
    console.error('[NOTIFICATION] Error counting unread notifications:', err);
    throw err;
  }
}

/**
 * Marquer une notification comme lue
 * @param {Object} db - Connexion à la base de données
 * @param {number} notificationId - ID de la notification
 * @param {number} id_compte - ID du compte utilisateur (sécurité)
 */
async function markAsRead(db, notificationId, id_compte) {
  try {
    const query = `
      UPDATE notifications 
      SET \`read\` = 1 
      WHERE id_notification = ? AND id_compte = ?
    `;
    await runUpdate(db, query, [notificationId, id_compte]);
  } catch (err) {
    console.error('[NOTIFICATION] Error marking notification as read:', err);
    throw err;
  }
}

/**
 * Marquer toutes les notifications comme lues
 * @param {Object} db - Connexion à la base de données
 * @param {number} id_compte - ID du compte utilisateur
 */
async function markAllAsRead(db, id_compte) {
  try {
    const query = `
      UPDATE notifications 
      SET \`read\` = 1 
      WHERE id_compte = ? AND \`read\` = 0
    `;
    await runUpdate(db, query, [id_compte]);
  } catch (err) {
    console.error('[NOTIFICATION] Error marking all as read:', err);
    throw err;
  }
}

module.exports = {
  createNotification,
  notifyOrderSent,
  notifyOrderReceived,
  notifyOrderError,
  notifyOrderResponseReceived,
  notifyDespatchAdviceReceived,
  notifyInvoiceReceived,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
