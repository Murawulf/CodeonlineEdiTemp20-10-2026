// GET /api/orders/sent - Endpoint pour récupérer les commandes envoyées
// À ajouter dans server.js après l'endpoint /api/orders/incoming

app.get("/api/orders/sent", async function (req, res) {
  try {
    console.log("[API] GET /api/orders/sent - START");
    
    if (req.headers["x-api-pin"] !== API_PIN) {
      console.log("[API] GET /api/orders/sent - Invalid PIN");
      return res.status(403).json({ error: "Invalid PIN" });
    }
    
    const buyerId = Number(req.headers["x-entite-id"]);
    console.log("[API] GET /api/orders/sent - buyerId:", buyerId);
    
    if (!buyerId) {
      console.log("[API] GET /api/orders/sent - Missing x-entite-id");
      return res.status(400).json({ error: "Missing x-entite-id" });
    }

    // Récupérer les commandes envoyées (où l'entité est l'acheteur)
    // Updated to include all necessary fields for the modal
    const query = `
      SELECT 
        o.id_order, 
        o.num_commande,
        o.order_number,
        o.status, 
        o.created_at,
        o.total_ht,
        o.date_livraison,
        COALESCE(o.monnaie, o.currency, 'TND') as monnaie,
        o.id_entite_seller,
        o.id_entite_buyer,
        o.fournisseur_gln,
        o.acheteur_gln,
        COALESCE(
          o.seller_name,
          (SELECT e.raison_socialle FROM Entite e WHERE e.id_entite = o.id_entite_seller LIMIT 1),
          'Fournisseur'
        ) AS seller_name,
        (SELECT e.raison_socialle FROM Entite e WHERE e.id_entite = o.id_entite_buyer LIMIT 1) AS buyer_name
      FROM orders o
      WHERE o.id_entite_buyer = ?
      ORDER BY o.id_order DESC
    `;
    
    console.log("[API] GET /api/orders/sent - Executing query...");
    const orders = await queryDB(entiteDB, query, [buyerId]);
    console.log("[API] GET /api/orders/sent - Found", orders.length, "orders");

    // Charger les lignes de commande pour chaque commande
    for (const o of orders) {
      const lines = await queryDB(
        entiteDB, 
        "SELECT product_id, gtin, libelle, qty, price AS prix FROM order_lines WHERE id_order = ?", 
        [o.id_order]
      );
      o.lines = lines;
      console.log("[API] GET /api/orders/sent - Order", o.id_order, "has", lines.length, "lines");
    }

    console.log("[API] GET /api/orders/sent - SUCCESS - Returning", orders.length, "orders");
    res.json({ orders });
  } catch (err) {
    console.error("[API] GET /api/orders/sent - ERROR:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});
