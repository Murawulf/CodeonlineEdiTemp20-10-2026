/**
 * EDI Worker - Traitement asynchrone des transmissions EDI
 * Gère les messages OUTBOUND (envoi) et INBOUND (réception/traitement)
 */

const axios = require('axios');
const https = require('https');
const config = require('../config/edi_worker_config');
const configService = require('../services/configService');
const communicationProvider = require('../services/communication/CommunicationProvider');
const { serviceAuthHeaders } = require('../services/serviceAuth');
const { queryDB, runUpdate, isMySQLConnection } = require('../db_utils');
const { updateEdiTransmissionStatus, incrementRetryCount } = require('../edi_transmission_helper');
const { 
  notifyOrderSent, 
  notifyOrderError, 
  notifyOrderReceived,
  notifyOrderResponseReceived,
  notifyDespatchAdviceReceived,
  notifyInvoiceReceived,
  notifyInvoiceAcknowledged,
  notifyInvoiceRejected,
} = require('../notification_helper');
const {
  WORKER_TYPES,
  logCycleStart,
  logCycleEnd,
  logTransmission,
  logError,
  logWarning,
  logInfo
} = require('../edi_worker_logger');

class EDIWorker {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.intervals = {
      outbound: null,
      inbound: null,
      cleanup: null,
    };
    this.stats = {
      outbound: { processed: 0, success: 0, errors: 0 },
      inbound: { processed: 0, success: 0, errors: 0 },
      lastRun: { outbound: null, inbound: null, cleanup: null },
    };
  }

  /**
   * Démarrer le worker
   */
  start() {
    if (this.isRunning) {
      this.log('Worker already running');
      return;
    }

    this.isRunning = true;
    this.log('🚀 Starting EDI Worker...');

    // Traiter immédiatement au démarrage si configuré
    if (config.startup.processOnStartup) {
      this.processOutbound();
      this.processInbound();
    }

    // Configurer les intervalles de traitement
    this.intervals.outbound = setInterval(
      () => this.processOutbound(),
      config.intervals.outbound
    );

    this.intervals.inbound = setInterval(
      () => this.processInbound(),
      config.intervals.inbound
    );

    if (config.cleanup.enabled) {
      this.intervals.cleanup = setInterval(
        () => this.cleanupOldTransmissions(),
        config.intervals.cleanup
      );
    }

    this.log(`✅ EDI Worker started successfully`);
    this.log(`   - Outbound interval: ${config.intervals.outbound / 1000}s`);
    this.log(`   - Inbound interval: ${config.intervals.inbound / 1000}s`);
    if (config.cleanup.enabled) {
      this.log(`   - Cleanup interval: ${config.intervals.cleanup / 1000}s`);
    }
  }

  /**
   * Arrêter le worker
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.log('🛑 Stopping EDI Worker...');
    
    Object.keys(this.intervals).forEach(key => {
      if (this.intervals[key]) {
        clearInterval(this.intervals[key]);
        this.intervals[key] = null;
      }
    });

    this.isRunning = false;
    this.log('✅ EDI Worker stopped');
  }

  /**
   * Traiter les messages OUTBOUND (envoi)
   */
  async processOutbound() {
    if (!this.isRunning) return;

    const startTime = Date.now();
    this.stats.lastRun.outbound = new Date();

    try {
      await logCycleStart(this.db, WORKER_TYPES.OUTBOUND);
      this.logVerbose('[OUTBOUND] Starting processing cycle...');

      // Récupérer les transmissions à traiter
      const statuses = config.statuses.outbound.toProcess;
      
      if (!statuses || statuses.length === 0) {
        this.logVerbose('[OUTBOUND] No statuses configured to process');
        await logWarning(this.db, WORKER_TYPES.OUTBOUND, 'No statuses configured to process');
        return;
      }

      const placeholders = statuses.map(() => '?').join(',');
      const query = `
        SELECT * FROM edi_transmissions
        WHERE direction = 'OUTBOUND'
          AND status IN (${placeholders})
          AND retry_count < ${config.retry.maxAttempts}
        ORDER BY created_at ASC
        LIMIT ${config.limits.outboundBatchSize}
      `;

      const transmissions = await queryDB(
        this.db,
        query,
        statuses
      );

      if (transmissions.length === 0) {
        // Check if there are transmissions stuck due to max retries
        try {
          const stuckQuery = `
            SELECT id FROM edi_transmissions
            WHERE direction = 'OUTBOUND'
              AND status IN (${placeholders})
              AND retry_count >= ${config.retry.maxAttempts}
            LIMIT 5
          `;
          const stuckTransmissions = await queryDB(this.db, stuckQuery, statuses);
          
          if (stuckTransmissions.length > 0) {
            const stuckIds = stuckTransmissions.map(t => t.id);
            const stuckIdsStr = stuckIds.join(', ');
            this.logVerbose(`[OUTBOUND] ⚠️ Found transmissions exceeding max retries (${config.retry.maxAttempts}): IDs [${stuckIdsStr}]`);
            
            // Auto-fail these transmissions to stop the loop
            const isMySQL = isMySQLConnection(this.db);
            // MySQL uses CONCAT(), SQLite uses ||
            const concatSql = isMySQL 
              ? "CONCAT(logs, '\nMarked as FAILED due to max retries limit')"
              : "logs || '\nMarked as FAILED due to max retries limit'";

            const failQuery = `
                UPDATE edi_transmissions 
                SET status = 'FAILED', 
                    logs = CASE 
                        WHEN logs IS NULL THEN 'Marked as FAILED due to max retries limit' 
                        ELSE ${concatSql}
                    END
                WHERE id IN (${stuckIds.map(() => '?').join(',')})
            `;
            
            await runUpdate(this.db, failQuery, stuckIds);
            this.log(`[OUTBOUND] 🛑 Marked ${stuckTransmissions.length} stuck transmissions as FAILED: [${stuckIdsStr}]`);
          }
        } catch (checkErr) {
          // Ignore check errors
        }

        this.logVerbose('[OUTBOUND] No transmissions to process');
        await logCycleEnd(this.db, WORKER_TYPES.OUTBOUND, Date.now() - startTime, {
          transmissions_found: 0,
          transmissions_processed: 0
        });
        return;
      }

      this.log(`[OUTBOUND] Processing ${transmissions.length} transmission(s)...`);
      await logInfo(this.db, WORKER_TYPES.OUTBOUND, `Processing ${transmissions.length} transmission(s)`, {
        transmission_ids: transmissions.map(t => t.id)
      });

      // Traiter chaque transmission
      for (const transmission of transmissions) {
        await this.processOutboundTransmission(transmission);
      }

      const duration = Date.now() - startTime;
      this.log(`[OUTBOUND] Cycle completed in ${duration}ms`);
      await logCycleEnd(this.db, WORKER_TYPES.OUTBOUND, duration, {
        transmissions_found: transmissions.length,
        transmissions_processed: this.stats.outbound.processed,
        success_count: this.stats.outbound.success,
        error_count: this.stats.outbound.errors
      });

    } catch (err) {
      console.error('[OUTBOUND] Error in processing cycle:', err);
      await logError(this.db, WORKER_TYPES.OUTBOUND, 'Error in processing cycle', err);
    }
  }

  /**
   * Traiter une transmission OUTBOUND individuelle
   */
  async processOutboundTransmission(transmission) {
    const { id, document_type, partner_gln, sender_gln, file_content, retry_count } = transmission;

    try {
      this.logVerbose(`[OUTBOUND] Processing transmission #${id} (${document_type})`);

      // Calculer le délai de retry si nécessaire
      if (retry_count > 0) {
        const delay = this.calculateRetryDelay(retry_count);
        const nextRetryTime = new Date(transmission.updated_at).getTime() + delay;
        
        if (Date.now() < nextRetryTime) {
          this.logVerbose(`[OUTBOUND] Transmission #${id} - waiting for retry delay`);
          return;
        }
      }

      // 1. Déterminer la destination (URL + Payload)
      let targetGln = partner_gln;
      let sourceGln = sender_gln || null;
      
      // Si pas de GLN partenaire explicite, essayer de le déduire (ex: pour ORDERS, c'est le fournisseur)
      // Note: partner_gln est déjà passé en paramètre, on l'utilise en priorité.

      if (!targetGln) {
         this.logVerbose(`[OUTBOUND] ⚠️ No partner GLN provided for transmission #${id}`);
         // On ne peut pas router sans GLN
         throw new Error(`Missing partner GLN for routing transmission #${id}`);
      }

      // 2. Dispatch via CommunicationProvider (E2EE + Hybrid Fallback)
      this.logVerbose(`[OUTBOUND] 🚀 Dispatching via CommunicationProvider to ${targetGln}...`);
      
      const messagePayload = {
          eancomContent: file_content,
          filename: transmission.filename || `${document_type}_${id}.txt`,
          partnerGln: partner_gln,
      };

      const dispatchResult = await communicationProvider.dispatch(
          messagePayload, 
          targetGln, 
          document_type,
          sourceGln
      );

      this.logVerbose(`[OUTBOUND] Dispatch result: ${dispatchResult.status} (${dispatchResult.mode})`);
      
      // Response object to match existing logging logic
      const response = { data: dispatchResult };

      // Mise à jour du statut en succès
      await updateEdiTransmissionStatus(
        this.db,
        id,
        'SENT',
        `Successfully sent via ${dispatchResult.mode} at ${new Date().toISOString()}. Response: ${JSON.stringify(dispatchResult)}`,
        null
      );

      // Mettre à jour transmission_date
      await runUpdate(
        this.db,
        'UPDATE edi_transmissions SET transmission_date = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      // Mettre à jour le statut de la commande de 'new' à 'sent' et envoyer notifications
      if (transmission.related_type === 'ORDER' && transmission.related_id) {
        // D'abord récupérer les infos de la commande (on en a besoin pour WebSocket ET notification)
        let numCommande = null;
        let supplierName = null;
        let idEntiteBuyer = null;
        let idEntiteSeller = null;
        
        try {
          // Récupérer aussi seller_name et id_entite_seller de la table orders
          const orderInfo = await queryDB(
            this.db,
            `SELECT o.num_commande, o.id_entite_buyer, o.id_entite_seller, o.seller_name,
                    (SELECT raison_socialle FROM Entite WHERE id_entite = o.id_entite_seller LIMIT 1) as entite_name
             FROM orders o WHERE o.id_order = ?`,
            [transmission.related_id]
          );
          
          if (orderInfo.length > 0) {
            numCommande = orderInfo[0].num_commande;
            supplierName = orderInfo[0].seller_name || orderInfo[0].entite_name || 'Fournisseur';
            idEntiteBuyer = orderInfo[0].id_entite_buyer;
            idEntiteSeller = orderInfo[0].id_entite_seller;
          }
        } catch (infoErr) {
          console.error(`[OUTBOUND] Failed to fetch order info:`, infoErr.message);
        }

        // Mettre à jour le statut
        await runUpdate(
          this.db,
          'UPDATE orders SET status = ? WHERE id_order = ? AND status = ?',
          ['sent', transmission.related_id, 'new']
        );
        this.logVerbose(`[OUTBOUND] Order #${transmission.related_id} status updated to 'sent'`);
        
        // NOTE: WebSocket 'order:status:updated' event is already emitted by server.js setImmediate callback
        // when the EDI send succeeds. We skip it here to avoid duplicate toasts on the frontend.
        this.logVerbose(`[OUTBOUND] Skipping WebSocket emission (already handled by server.js)`);

        // Envoyer notification aux utilisateurs de l'entité acheteuse
        if (idEntiteBuyer) {
          try {
            const users = await queryDB(
              this.db,
              'SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0',
              [idEntiteBuyer]
            );

            if (users.length > 0) {
              for (const user of users) {
                await notifyOrderSent(
                  this.db,
                  user.id_compte,
                  numCommande,
                  supplierName || 'Fournisseur'
                );
              }
              this.log(`[OUTBOUND] 🔔 Notification sent to ${users.length} user(s) of buyer entity #${idEntiteBuyer}`);
            } else {
              this.logVerbose(`[OUTBOUND] ⚠️ No active users found for buyer entity #${idEntiteBuyer}, skipping notification`);
            }
          } catch (notifErr) {
            console.error(`[OUTBOUND] Failed to send notification:`, notifErr.message);
          }
        }
      } else if (transmission.related_type === 'INVOICE' && transmission.related_id) {
        // Mettre à jour le statut de la facture de 'PENDING' à 'SENT'
        await runUpdate(
          this.db,
          "UPDATE edi_invoic SET status = 'SENT', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'",
          [transmission.related_id]
        );
        this.logVerbose(`[OUTBOUND] Invoice #${transmission.related_id} status updated to 'SENT'`);
        
        if (global.io) {
          global.io.emit('invoice:status:updated', { id: transmission.related_id, status: 'SENT' });
        }
      }

      this.stats.outbound.processed++;
      this.stats.outbound.success++;
      this.log(`[OUTBOUND] ✅ Transmission #${id} sent successfully`);
      await logTransmission(this.db, WORKER_TYPES.OUTBOUND, id, 'SUCCESS', `Transmission sent successfully`, {
        document_type,
        partner_gln,
        response: response.data
      });

    } catch (err) {
      this.stats.outbound.processed++;
      this.stats.outbound.errors++;

      let errorMessage = err.message || 'Unknown error';
      if (err.response) {
        if (err.response.data) {
           errorMessage = typeof err.response.data === 'object' 
             ? JSON.stringify(err.response.data) 
             : String(err.response.data);
        } else {
           errorMessage = `HTTP Error ${err.response.status} ${err.response.statusText}`;
        }
      }

      console.error(`[OUTBOUND] ❌ Transmission #${id} failed:`, errorMessage);
      await logTransmission(this.db, WORKER_TYPES.OUTBOUND, id, 'ERROR', `Transmission failed: ${errorMessage}`, {
        document_type,
        retry_count,
        error_details: err.response?.data || err.message
      });

      // Mise à jour du statut en erreur
      await updateEdiTransmissionStatus(
        this.db,
        id,
        'ERROR',
        `Failed at ${new Date().toISOString()}`,
        errorMessage
      );

      // Incrémenter le compteur de retry
      await incrementRetryCount(this.db, id);

      // Si max retries atteint, marquer comme définitivement en erreur
      if (retry_count + 1 >= config.retry.maxAttempts) {
        await updateEdiTransmissionStatus(
          this.db,
          id,
          'ERROR',
          `Max retry attempts (${config.retry.maxAttempts}) reached`,
          errorMessage
        );
        this.log(`[OUTBOUND] ⚠️ Transmission #${id} - max retries reached`);
        
        // Notifier l'utilisateur de l'échec définitif
        if (transmission.related_type === 'ORDER' && transmission.related_id) {
          try {
            const orderInfo = await queryDB(
              this.db,
              'SELECT num_commande, id_entite_buyer FROM orders WHERE id_order = ?',
              [transmission.related_id]
            );
            
            if (orderInfo.length > 0) {
              const { num_commande, id_entite_buyer } = orderInfo[0];
              
              // Find users to notify
              const users = await queryDB(
                this.db,
                'SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0',
                [id_entite_buyer]
              );

              if (users.length > 0) {
                for (const user of users) {
                  await notifyOrderError(
                    this.db,
                    user.id_compte,
                    num_commande,
                    'Nombre maximum de tentatives atteint'
                  );
                }
                this.log(`[OUTBOUND] 🔔 Error notification sent to ${users.length} user(s) of buyer entity #${id_entite_buyer}`);
              }
            }
          } catch (notifErr) {
            console.error(`[OUTBOUND] Failed to send error notification:`, notifErr.message);
          }
        }
      }
    }
  }

  /**
   * Traiter les messages INBOUND (réception)
   */
  async processInbound() {
    if (!this.isRunning) return;

    const startTime = Date.now();
    this.stats.lastRun.inbound = new Date();

    try {
      await logCycleStart(this.db, WORKER_TYPES.INBOUND);
      this.logVerbose('[INBOUND] Starting processing cycle...');

      // Récupérer les transmissions à traiter
      const statuses = config.statuses.inbound.toProcess;
      
      if (!statuses || statuses.length === 0) {
        this.logVerbose('[INBOUND] No statuses configured to process');
        await logWarning(this.db, WORKER_TYPES.INBOUND, 'No statuses configured to process');
        return;
      }

      const placeholders = statuses.map(() => '?').join(',');
      const query = `
        SELECT * FROM edi_transmissions
        WHERE direction = 'INBOUND'
          AND status IN (${placeholders})
          AND retry_count < ${config.retry.maxAttempts}
        ORDER BY created_at ASC
        LIMIT ${config.limits.inboundBatchSize}
      `;

      const transmissions = await queryDB(
        this.db,
        query,
        statuses
      );

      if (transmissions.length === 0) {
        this.logVerbose('[INBOUND] No transmissions to process');
        await logCycleEnd(this.db, WORKER_TYPES.INBOUND, Date.now() - startTime, {
          transmissions_found: 0,
          transmissions_processed: 0
        });
        return;
      }

      this.log(`[INBOUND] Processing ${transmissions.length} transmission(s)...`);
      await logInfo(this.db, WORKER_TYPES.INBOUND, `Processing ${transmissions.length} transmission(s)`, {
        transmission_ids: transmissions.map(t => t.id)
      });

      // Traiter chaque transmission
      for (const transmission of transmissions) {
        await this.processInboundTransmission(transmission);
      }

      const duration = Date.now() - startTime;
      this.log(`[INBOUND] Cycle completed in ${duration}ms`);
      await logCycleEnd(this.db, WORKER_TYPES.INBOUND, duration, {
        transmissions_found: transmissions.length,
        transmissions_processed: this.stats.inbound.processed,
        success_count: this.stats.inbound.success,
        error_count: this.stats.inbound.errors
      });

    } catch (err) {
      console.error('[INBOUND] Error in processing cycle:', err);
      await logError(this.db, WORKER_TYPES.INBOUND, 'Error in processing cycle', err);
    }
  }

  /**
   * Traiter une transmission INBOUND individuelle
   */
  async processInboundTransmission(transmission) {
    const { id, document_type, file_content } = transmission;

    try {
      this.logVerbose(`[INBOUND] Processing transmission #${id} (${document_type})`);

      // Parser le message EANCOM
      const { parseEANCOM } = require('../eancom_parser');
      const parsedData = parseEANCOM(file_content);

      // Traiter selon le type de message
      let processResult;
      switch (document_type) {
        case 'ORDERS':
          processResult = await this.processInboundOrder(parsedData, transmission);
          break;
        case 'ORDRSP':
          processResult = await this.processInboundOrderResponse(parsedData, transmission);
          break;
        case 'DESADV':
          processResult = await this.processInboundDespatchAdvice(parsedData, transmission);
          break;
        case 'INVOIC':
          processResult = await this.processInboundInvoice(parsedData, transmission);
          break;
        case 'APERAK':
          processResult = await this.processInboundAperak(parsedData, transmission);
          break;
        default:
          throw new Error(`Unsupported message type: ${document_type}`);
      }

      // Mise à jour du statut en succès
      await updateEdiTransmissionStatus(
        this.db,
        id,
        'PROCESSED',
        `Successfully processed at ${new Date().toISOString()}. ${processResult.message}`,
        null
      );

      // Mettre à jour processing_date et related_id
      await runUpdate(
        this.db,
        'UPDATE edi_transmissions SET processing_date = CURRENT_TIMESTAMP, related_id = ? WHERE id = ?',
        [processResult.relatedId || null, id]
      );

      this.stats.inbound.processed++;
      this.stats.inbound.success++;
      this.log(`[INBOUND] ✅ Transmission #${id} processed successfully`);
      await logTransmission(this.db, WORKER_TYPES.INBOUND, id, 'SUCCESS', `Transmission processed successfully`, {
        document_type,
        process_result: processResult
      });

    } catch (err) {
      this.stats.inbound.processed++;
      this.stats.inbound.errors++;

      console.error(`[INBOUND] ❌ Transmission #${id} failed:`, err.message);
      await logTransmission(this.db, WORKER_TYPES.INBOUND, id, 'ERROR', `Transmission processing failed: ${err.message}`, {
        document_type,
        error_details: err.message
      });

      // Mise à jour du statut en erreur
      await updateEdiTransmissionStatus(
        this.db,
        id,
        'ERROR',
        `Processing failed at ${new Date().toISOString()}`,
        err.message
      );

      // Incrémenter le compteur de retry
      await incrementRetryCount(this.db, id);
    }
  }

  /**
   * Traiter une commande INBOUND (ORDERS)
   */
  async processInboundOrder(parsedData, transmission) {
    this.logVerbose(`[INBOUND] Processing ORDERS: ${parsedData.documentNumber}`);
    
    // IMPORTANT: Notifications are already sent by /api/edi/receive when the order is staged.
    // Do NOT send notifications here to avoid duplicate notifications to the supplier.
    this.logVerbose(`[INBOUND] Skipping notification (already handled by /api/edi/receive during staging)`);

    // Notify the orchestrator (fire-and-forget) so it generates and routes the APERAK to the supplier.
    this._notifyOrchestratorAck({
      transmission_id: transmission.id,
      original_ref:    parsedData.documentNumber,
      original_type:   'ORDERS',
      sender_gln:      parsedData.buyer?.gln,    // Buyer is the ACK sender
      receiver_gln:    parsedData.supplier?.gln, // Supplier receives the APERAK
      status:          'ACK',
    }).catch(err => {
      this.log(`[INBOUND] ⚠️ Could not notify orchestrator for APERAK: ${err.message}`);
    });

    return {
      success: true,
      message: `Order ${parsedData.documentNumber} received and logged`,
      relatedId: null,
    };
  }

  /**
   * Traiter une réponse de commande INBOUND (ORDRSP)
   */
  async processInboundOrderResponse(parsedData, transmission) {
    // TODO: Implémenter la logique de traitement des réponses de commande
    this.logVerbose(`[INBOUND] Processing ORDRSP: ${parsedData.documentNumber}`);
    
    // Notification logic
    try {
      const buyerGln = parsedData.buyer?.gln;
      const supplierGln = parsedData.supplier?.gln;
      
      if (buyerGln) {
        // Find my entity ID (Buyer)
        const buyerInfo = await queryDB(
          this.db,
          'SELECT id_entite FROM Entite WHERE gln = ?',
          [buyerGln]
        );

        if (buyerInfo.length > 0) {
          const id_entite_buyer = buyerInfo[0].id_entite;

          // Find users to notify
          const users = await queryDB(
            this.db,
            'SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0',
            [id_entite_buyer]
          );
          
          // Get supplier name for notification
          let supplierName = supplierGln;
          if (transmission.partner_id) {
            const partnerInfo = await queryDB(
              this.db, 
              'SELECT raison_socialle FROM Entite WHERE id_entite = ?', 
              [transmission.partner_id]
            );
            if (partnerInfo.length > 0) supplierName = partnerInfo[0].raison_socialle;
          }

          if (users.length > 0) {
            for (const user of users) {
              await notifyOrderResponseReceived(
                this.db,
                user.id_compte,
                parsedData.orderReference || parsedData.documentNumber, // Reference to original order (RFF+ON) or ORDRSP number
                supplierName || 'Fournisseur'
              );
            }
            this.log(`[INBOUND] 🔔 Notification sent to ${users.length} user(s) of buyer entity #${id_entite_buyer}`);
          }
        }
      }
    } catch (err) {
      console.error('[INBOUND] Error sending notification:', err);
    }

    // Notify the orchestrator (fire-and-forget) so it generates and routes the APERAK to the supplier.
    this._notifyOrchestratorAck({
      transmission_id: transmission.id,
      original_ref:    parsedData.documentNumber,
      original_type:   'ORDRSP',
      sender_gln:      parsedData.buyer?.gln,    // Buyer is the ACK sender
      receiver_gln:    parsedData.supplier?.gln, // Supplier receives the APERAK
      status:          'ACK',
    }).catch(err => {
      this.log(`[INBOUND] ⚠️ Could not notify orchestrator for APERAK: ${err.message}`);
    });

    return {
      success: true,
      message: `Order response ${parsedData.documentNumber} processed`,
      relatedId: null,
    };
  }

  /**
   * Traiter un avis d'expédition INBOUND (DESADV)
   */
  async processInboundDespatchAdvice(parsedData, transmission) {
    // TODO: Implémenter la logique de traitement des avis d'expédition
    this.logVerbose(`[INBOUND] Processing DESADV: ${parsedData.documentNumber}`);
    
    // Notification logic
    try {
      const buyerGln = parsedData.buyer?.gln;
      const supplierGln = parsedData.supplier?.gln;
      
      if (buyerGln) {
        // Find my entity ID (Buyer)
        const buyerInfo = await queryDB(
          this.db,
          'SELECT id_entite FROM Entite WHERE gln = ?',
          [buyerGln]
        );

        if (buyerInfo.length > 0) {
          const id_entite_buyer = buyerInfo[0].id_entite;

          // Find users to notify
          const users = await queryDB(
            this.db,
            'SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0',
            [id_entite_buyer]
          );
          
          // Get supplier name
          let supplierName = supplierGln;
          if (transmission.partner_id) {
            const partnerInfo = await queryDB(
              this.db, 
              'SELECT raison_socialle FROM Entite WHERE id_entite = ?', 
              [transmission.partner_id]
            );
            if (partnerInfo.length > 0) supplierName = partnerInfo[0].raison_socialle;
          }

          if (users.length > 0) {
            for (const user of users) {
              await notifyDespatchAdviceReceived(
                this.db,
                user.id_compte,
                parsedData.documentNumber,
                supplierName || 'Fournisseur'
              );
            }
            this.log(`[INBOUND] 🔔 Notification sent to ${users.length} user(s) of buyer entity #${id_entite_buyer}`);
          }
        }
      }
    } catch (err) {
      console.error('[INBOUND] Error sending notification:', err);
    }

    // Notify the orchestrator (fire-and-forget) so it generates and routes the APERAK to the supplier.
    this._notifyOrchestratorAck({
      transmission_id: transmission.id,
      original_ref:    parsedData.documentNumber,
      original_type:   'DESADV',
      sender_gln:      parsedData.buyer?.gln,    // Buyer is the ACK sender
      receiver_gln:    parsedData.supplier?.gln, // Supplier receives the APERAK
      status:          'ACK',
    }).catch(err => {
      this.log(`[INBOUND] ⚠️ Could not notify orchestrator for APERAK: ${err.message}`);
    });

    return {
      success: true,
      message: `Despatch advice ${parsedData.documentNumber} processed`,
      relatedId: null,
    };
  }

  /**
   * Traiter une facture INBOUND (INVOIC)
   */
  async processInboundInvoice(parsedData, transmission) {
    this.logVerbose(`[INBOUND] Processing INVOIC: ${parsedData.documentNumber}`);
    
    let invoicId = null;

    try {
        const invoicInsertSql = `
          INSERT INTO edi_invoic (
            invoic_number, type_code, date_facture, 
            buyer_gln, seller_gln, 
            order_reference, desadv_reference, 
            currency, total_ht, total_tax, total_ttc,
            direction, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INBOUND', 'RECEIVED', NOW())
        `;
        
        const invoicParams = [
            parsedData.documentNumber || null, '380',
            parsedData.documentDate ? (() => {
                const d = String(parsedData.documentDate);
                if (d.length === 8) return new Date(d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
                if (d.length === 6) { const yy = d.substring(0,2); const mm = d.substring(2,4); const dd = d.substring(4,6); return new Date(`20${yy}-${mm}-${dd}`); }
                return null;
            })() : null,
            parsedData.buyer?.gln || null, parsedData.supplier?.gln || null,
            parsedData.orderReference || null, parsedData.desadvReference || null,
            parsedData.currency || null,
            parsedData.totals?.lineAmount || 0, 
            parsedData.totals?.taxAmount || 0, 
            parsedData.totals?.totalAmount || 0
        ].map(p => p === undefined ? null : p);

        const invoicResult = await runUpdate(this.db, invoicInsertSql, invoicParams);
        invoicId = invoicResult.lastID;

        // Insert Lines
        if (parsedData.items && parsedData.items.length > 0) {
            for (const item of parsedData.items) {
                const itemParams = [
                    invoicId, item.lineNumber || null, item.gtin || null,
                    item.description || null, item.qtyInvoiced || item.qty || 0, item.price || 0,
                    item.taxRate || 0, item.lineAmount || 0
                ].map(p => p === undefined ? null : p);
                
                await runUpdate(this.db, `
                    INSERT INTO edi_invoic_lines (
                        id_invoic, line_number, gtin, 
                        description, quantity, unit_price, 
                        tax_rate, line_amount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    itemParams
                );
            }
        }
        this.log(`[INBOUND] ✅ Successfully inserted INVOIC into database (ID: ${invoicId})`);
    } catch (dbErr) {
        this.log(`[INBOUND] ❌ Failed to insert INVOIC into database: ${dbErr.message}`);
        throw dbErr; // Rethrow to mark transmission as ERROR
    }

    // Notification logic
    try {
      const buyerGln = parsedData.buyer?.gln;
      const supplierGln = parsedData.supplier?.gln;
      
      if (buyerGln) {
        // Find my entity ID (Buyer)
        const buyerInfo = await queryDB(
          this.db,
          'SELECT id_entite FROM Entite WHERE gln = ?',
          [buyerGln]
        );

        if (buyerInfo.length > 0) {
          const id_entite_buyer = buyerInfo[0].id_entite;

          // Find users to notify
          const users = await queryDB(
            this.db,
            'SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0',
            [id_entite_buyer]
          );
          
          // Get supplier name
          let supplierName = supplierGln;
          if (transmission.partner_id) {
            const partnerInfo = await queryDB(
              this.db, 
              'SELECT raison_socialle FROM Entite WHERE id_entite = ?', 
              [transmission.partner_id]
            );
            if (partnerInfo.length > 0) supplierName = partnerInfo[0].raison_socialle;
          }

          if (users.length > 0) {
            for (const user of users) {
              await notifyInvoiceReceived(
                this.db,
                user.id_compte,
                parsedData.documentNumber,
                supplierName || 'Fournisseur'
              );
            }
            this.log(`[INBOUND] 🔔 Notification sent to ${users.length} user(s) of buyer entity #${id_entite_buyer}`);
            
            // Emit websocket event to refresh the UI in real-time
            if (global.io) {
               global.io.emit('invoice:new', { 
                  notification: `Nouvelle facture reçue de ${supplierName || 'Fournisseur'}`,
                  documentNumber: parsedData.documentNumber
               });
            }
          }
        }
      }
    } catch (err) {
      console.error('[INBOUND] Error sending notification:', err);
    }

    // Notify the orchestrator (fire-and-forget) so it generates and routes the APERAK to the supplier.
    // Failure here must NOT block the invoice processing result — hence .catch().
    this._notifyOrchestratorAck({
      transmission_id: transmission.id,
      original_ref:    parsedData.documentNumber,
      original_type:   'INVOIC',
      sender_gln:      parsedData.buyer?.gln,    // Buyer is the ACK sender
      receiver_gln:    parsedData.supplier?.gln, // Supplier receives the APERAK
      status:          'ACK',
    }).catch(err => {
      this.log(`[INBOUND] ⚠️ Could not notify orchestrator for APERAK: ${err.message}`);
    });

    return {
      success: true,
      message: `Invoice ${parsedData.documentNumber} processed`,
      relatedId: invoicId,
    };
  }

  /**
   * Traiter un APERAK entrant (accusé de réception d'un document envoyé)
   * L'orchestrateur nous envoie un APERAK que le fournisseur a reçu en réponse
   * à une facture qu'il avait émise. On met à jour le statut de la facture.
   */
  async processInboundAperak(parsedData, transmission) {
    this.logVerbose(`[INBOUND APERAK] Processing APERAK ref: ${parsedData.referencedDocumentNumber} Type: ${parsedData.referencedDocumentType || 'Unknown'}`);

    const referencedRef = parsedData.referencedDocumentNumber || parsedData.documentNumber;
    const referencedType = (parsedData.referencedDocumentType || 'INVOIC').toUpperCase();
    const isAck = parsedData.aperakFunctionCode === '313';
    const newStatus = isAck ? 'ACKNOWLEDGED' : 'REJECTED';

    if (!referencedRef) {
      this.log('[INBOUND APERAK] ⚠️ No referenced document number found in APERAK — cannot update status.');
      return { success: true, message: 'APERAK received but no reference to update', relatedId: null };
    }

    try {
      let tableName = 'edi_invoic';
      let refColumn = 'invoic_number';
      let eventName = 'invoice:status:updated';

      // Route based on document type
      if (referencedType === 'ORDERS') {
        tableName = 'edi_orders';
        refColumn = 'order_number';
        eventName = 'order:status:updated';
      } else if (referencedType === 'ORDRSP') {
        tableName = 'edi_order_responses';
        refColumn = 'order_response_number';
        eventName = 'order_response:status:updated';
      } else if (referencedType === 'DESADV') {
        tableName = 'edi_despatch_advices';
        refColumn = 'desadv_number';
        eventName = 'desadv:status:updated';
      }

      const updateResult = await runUpdate(
        this.db,
        `UPDATE ${tableName} SET status = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE ${refColumn} = ? AND direction = 'OUTBOUND'`,
        [newStatus, referencedRef]
      );

      const affected = updateResult.changes || updateResult.affectedRows || 0;
      this.log(`[INBOUND APERAK] ${isAck ? '✅' : '❌'} ${referencedType} "${referencedRef}" → ${newStatus} (${affected} row(s) updated)`);

      // Notify the UI in real-time
      if (global.io) {
        global.io.emit(eventName, {
          [refColumn]: referencedRef,
          status: newStatus,
          aperakType: isAck ? 'ACK' : 'NACK',
          errorCode: parsedData.aperakErrorCode || null,
        });
      }

      // For INVOIC: notify the supplier (the OUTBOUND sender) that their invoice was ACK/NACK'd
      if (referencedType === 'INVOIC' && affected > 0) {
        try {
          // Find the seller_gln of the matched invoice to locate the right users
          const invoicRows = await queryDB(
            this.db,
            `SELECT id, seller_gln, buyer_gln FROM edi_invoic WHERE invoic_number = ? AND direction = 'OUTBOUND' LIMIT 1`,
            [referencedRef]
          );
          if (invoicRows && invoicRows.length > 0) {
            const { seller_gln, buyer_gln } = invoicRows[0];

            // Determine who to notify: the seller (who sent the invoice)
            const sellerEntite = seller_gln ? await queryDB(
              this.db,
              'SELECT id_entite FROM Entite WHERE gln = ? LIMIT 1',
              [seller_gln]
            ) : [];

            if (sellerEntite && sellerEntite.length > 0) {
              const users = await queryDB(
                this.db,
                'SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0',
                [sellerEntite[0].id_entite]
              );
              for (const user of (users || [])) {
                if (isAck) {
                  await notifyInvoiceAcknowledged(this.db, user.id_compte, referencedRef, buyer_gln);
                } else {
                  await notifyInvoiceRejected(this.db, user.id_compte, referencedRef, buyer_gln, parsedData.aperakErrorCode);
                }
              }
              this.log(`[INBOUND APERAK] 🔔 Notified ${(users || []).length} user(s) of seller entity for invoice ${referencedRef}`);
            }
          }
        } catch (notifErr) {
          this.log(`[INBOUND APERAK] ⚠️ Notification error: ${notifErr.message}`);
        }
      }

      return {
        success: true,
        message: `APERAK processed — ${referencedType} "${referencedRef}" is now ${newStatus}`,
        relatedId: null,
      };
    } catch (err) {
      this.log(`[INBOUND APERAK] ❌ Failed to update ${referencedType} status: ${err.message}`);
      throw err;
    }
  }

  /**
   * Notifie l'orchestrateur qu'on a traité un document en entrée (ACK ou NACK).
   * L'orchestrateur générera alors le message APERAK GS1 et le routera vers l'expéditeur original.
   * 
   * Fire-and-forget: les erreurs sont loguées mais ne font pas échouer le traitement principal.
   */
  async _notifyOrchestratorAck({
    transmission_id,
    original_ref,
    original_type = 'INVOIC',
    sender_gln,
    receiver_gln,
    status = 'ACK',
    error_code = null,
    error_text = null,
  }) {
    if (!sender_gln || !receiver_gln) {
      this.log('[INBOUND] ⚠️ Cannot notify orchestrator for APERAK: missing GLNs');
      return;
    }

    // Use configService (same source as CommunicationProvider) so the DB-stored value is used.
    let orchestratorUrl;
    try {
      orchestratorUrl = configService.get('ORCHESTRATOR_URL')
        || process.env.ORCHESTRATOR_URL
        || process.env.HUB_URL;
    } catch (_) {
      orchestratorUrl = process.env.ORCHESTRATOR_URL || process.env.HUB_URL;
    }

    if (!orchestratorUrl) {
      this.log('[INBOUND] ⚠️ ORCHESTRATOR_URL not configured — cannot send ACK to hub');
      return;
    }


    const ackEndpoint = `${orchestratorUrl.replace(/\/$/, '')}/api/orchestrator/ack`;

    try {
      const httpsAgent = new (require('https').Agent)({ rejectUnauthorized: process.env.NODE_ENV === 'production' });
      await axios.post(ackEndpoint, {
        transmission_id,
        original_ref,
        original_type,
        sender_gln,
        receiver_gln,
        status,
        error_code,
        error_text,
      }, {
        httpsAgent,
        timeout: 10000,
        headers: serviceAuthHeaders({
          'Content-Type': 'application/json',
          'User-Agent': 'Codeonline-EDI-Node/1.0',
          ...(process.env.API_PIN ? { 'x-api-pin': process.env.API_PIN } : {}),
        }),
      });
      this.log(`[INBOUND] 📨 ACK sent to orchestrator for doc "${original_ref}" (${status})`);
    } catch (err) {
      this.log(`[INBOUND] ⚠️ Failed to send ACK to orchestrator: ${err.message}`);
      // Non-throwing — orchestrator notification failure must not block invoice processing
    }
  }

  /**
   * Nettoyer les anciennes transmissions
   */
  async cleanupOldTransmissions() {
    if (!this.isRunning || !config.cleanup.enabled) return;

    const startTime = Date.now();
    this.stats.lastRun.cleanup = new Date();

    try {
      this.logVerbose('[CLEANUP] Starting cleanup cycle...');

      const successRetentionDate = new Date();
      successRetentionDate.setDate(successRetentionDate.getDate() - config.cleanup.retentionDays.success);

      const errorRetentionDate = new Date();
      errorRetentionDate.setDate(errorRetentionDate.getDate() - config.cleanup.retentionDays.error);

      // Supprimer les transmissions réussies anciennes
      const deleteSuccessQuery = `
        DELETE FROM edi_transmissions
        WHERE status IN ('SENT', 'ACKNOWLEDGED', 'PROCESSED')
          AND created_at < ?
      `;
      const successResult = await runUpdate(this.db, deleteSuccessQuery, [successRetentionDate]);

      // Supprimer les transmissions en erreur anciennes
      const deleteErrorQuery = `
        DELETE FROM edi_transmissions
        WHERE status = 'ERROR'
          AND retry_count >= ?
          AND created_at < ?
      `;
      const errorResult = await runUpdate(
        this.db,
        deleteErrorQuery,
        [config.retry.maxAttempts, errorRetentionDate]
      );

      const duration = Date.now() - startTime;
      this.log(`[CLEANUP] Deleted ${successResult.changes || 0} success + ${errorResult.changes || 0} error transmissions (${duration}ms)`);

    } catch (err) {
      console.error('[CLEANUP] Error in cleanup cycle:', err);
    }
  }

  /**
   * Calculer le délai de retry (backoff exponentiel)
   */
  calculateRetryDelay(retryCount) {
    const delay = config.retry.initialDelay * Math.pow(config.retry.backoffMultiplier, retryCount - 1);
    return Math.min(delay, config.retry.maxDelay);
  }

  /**
   * Obtenir les statistiques du worker
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      stats: this.stats,
      config: {
        intervals: config.intervals,
        retry: config.retry,
        limits: config.limits,
      },
    };
  }

  /**
   * Logger un message
   */
  log(message) {
    if (config.logging.enabled) {
      console.log(`[EDI WORKER] ${message}`);
    }
  }

  /**
   * Logger un message en mode verbeux
   */
  logVerbose(message) {
    if (config.logging.enabled && config.logging.verbose) {
      console.log(`[EDI WORKER] ${message}`);
    }
  }
}

module.exports = EDIWorker;
