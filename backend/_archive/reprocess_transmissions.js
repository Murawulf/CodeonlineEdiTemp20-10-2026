const { queryDB, runUpdate, isMySQLConnection } = require('./db_utils');
const { parseEANCOM } = require('./eancom_parser');
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const path = require('path');
const { pool } = require('./config/database');

function parseEancomDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return null;
    const y = dateStr.substring(0, 4);
    const m = dateStr.substring(4, 6);
    const d = dateStr.substring(6, 8);
    return `${y}-${m}-${d}`;
}

async function reprocessTransmissions() {
    console.log("=== REPROCESSING EDI TRANSMISSIONS ===");
    
    // Connect to DB
    let db;
    try {
        // Use the centralized pool directly
        db = {
            pool,
            __isMysql: true,
            all: async (sql, params) => { const [rows] = await pool.execute(sql, params); return rows; },
            run: async (sql, params) => { const [res] = await pool.execute(sql, params); return { changes: res.affectedRows, lastID: res.insertId }; }
        };
        console.log("✅ Connected to MySQL");
    } catch (err) {
        console.error("❌ Failed to connect to MySQL:", err);
        return;
    }

    try {
        // 1. Fetch all Inbound ORDERS transmissions
        console.log("Fetching INBOUND ORDERS from edi_transmissions...");
        const transmissions = await queryDB(db, `
            SELECT * FROM edi_transmissions 
            WHERE document_type = 'ORDERS' 
            AND direction = 'INBOUND'
            ORDER BY id ASC
        `);
        console.log(`Found ${transmissions.length} transmissions to reprocess.`);

        let processed = 0;
        let errors = 0;

        for (const tx of transmissions) {
            console.log(`\nProcessing Transmission #${tx.id} (${tx.filename})...`);
            
            // Check if already in edi_orders
            const existing = await queryDB(db, "SELECT id FROM edi_orders WHERE transmission_id = ?", [tx.id]);
            if (existing.length > 0) {
                console.log(`> Already exists in edi_orders (ID: ${existing[0].id}). Updating status/data...`);
                // Optional: Update data if parser changed?
                // For now, skip to avoid overwriting user changes unless forced.
                // But user asked for "reprise", implies ensuring data is correct.
                // Let's re-parse and update ONLY if status is PENDING_VALIDATION to avoid resetting processed orders.
                const currentStatus = (await queryDB(db, "SELECT status FROM edi_orders WHERE id = ?", [existing[0].id]))[0].status;
                if (currentStatus !== 'PENDING_VALIDATION') {
                    console.log(`> Skipping update because status is ${currentStatus} (already processed).`);
                    continue;
                }
            }

            // Parse Content
            if (!tx.file_content) {
                console.warn("> No content found in transmission.");
                errors++;
                continue;
            }

            try {
                const parsedData = parseEANCOM(tx.file_content);
                
                // Validate minimal requirements
                if (!parsedData.documentNumber) {
                    throw new Error("Parsed data missing document number");
                }

                const stagingData = {
                    transmission_id: tx.id,
                    document_number: parsedData.documentNumber,
                    buyer_gln: parsedData.buyer.gln,
                    supplier_gln: parsedData.supplier.gln,
                    order_date: parseEancomDate(parsedData.documentDate),
                    delivery_date: parseEancomDate(parsedData.deliveryDateRequested),
                    currency: parsedData.currency,
                    total_amount: parsedData.totals.totalAmount || 0,
                    status: 'PENDING_VALIDATION',
                    raw_data: JSON.stringify(parsedData)
                };

                // Insert or Update
                if (existing.length > 0) {
                    await runUpdate(db, `
                        UPDATE edi_orders SET
                            document_number = ?,
                            buyer_gln = ?,
                            supplier_gln = ?,
                            order_date = ?,
                            delivery_date = ?,
                            currency = ?,
                            total_amount = ?,
                            raw_data = ?
                        WHERE id = ?
                    `, [
                        stagingData.document_number,
                        stagingData.buyer_gln,
                        stagingData.supplier_gln,
                        stagingData.order_date,
                        stagingData.delivery_date,
                        stagingData.currency,
                        stagingData.total_amount,
                        stagingData.raw_data,
                        existing[0].id
                    ]);
                    console.log(`> Updated edi_orders #${existing[0].id}`);
                } else {
                    const res = await runUpdate(db, `
                        INSERT INTO edi_orders (
                            transmission_id, document_number, buyer_gln, supplier_gln,
                            order_date, delivery_date, currency, total_amount,
                            status, raw_data
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        stagingData.transmission_id,
                        stagingData.document_number,
                        stagingData.buyer_gln,
                        stagingData.supplier_gln,
                        stagingData.order_date,
                        stagingData.delivery_date,
                        stagingData.currency,
                        stagingData.total_amount,
                        stagingData.status,
                        stagingData.raw_data
                    ]);
                    console.log(`> Created edi_orders #${res.lastID}`);
                }
                processed++;

            } catch (parseErr) {
                console.error(`> Parsing Error: ${parseErr.message}`);
                errors++;
            }
        }

        console.log(`\n=== REPROCESSING COMPLETE ===`);
        console.log(`Processed: ${processed}`);
        console.log(`Errors: ${errors}`);

    } catch (err) {
        console.error("Critical Error:", err);
    } finally {
        if (db && db.pool) await db.pool.end();
    }
}

reprocessTransmissions();
