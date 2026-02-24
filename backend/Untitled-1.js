// ✅ GET all comptes
app.get('/api/comptes', async (req, res) => {
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const sql = `
      SELECT 
        c.id_compte, c.email, c.name, c.prenom, c.certicode, c.role, c.is_suspended,
        c.created_at, c.id_entite, c.profile_id, c.avatar_url,
        e.raison_socialle AS producer_name,
        p.role AS profile_role,
        ap.page_id, ap.can_read, ap.can_write, ap.is_hidden,
        pg.page_name
      FROM comptes c
      LEFT JOIN Entite e ON c.id_entite = e.id_entite
      LEFT JOIN profiles p ON c.profile_id = p.id_profile
      LEFT JOIN autorisation_profile_page ap ON ap.id_profile = c.profile_id
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      ORDER BY c.id_compte DESC;
    `;

    const [rows] = await conn.query(sql);
    await conn.end();

    const accounts = {};

    for (const r of rows) {
      if (!accounts[r.id_compte]) {
        accounts[r.id_compte] = {
          id_compte: r.id_compte,
          email: r.email,
          name: r.name,
          prenom: r.prenom,
          certicode: r.certicode,
          role: r.role,
          is_suspended: !!r.is_suspended,
          created_at: r.created_at,
          id_entite: r.id_entite,
          profile_id: r.profile_id,
          avatar_url: r.avatar_url,
          producer_name: r.producer_name || null,
          permissions: []
        };
      }

      if (r.page_id) {
        accounts[r.id_compte].permissions.push({
          page_id: r.page_id,
          page_name: r.page_name,
          read: !!r.can_read,
          write: !!r.can_write,
          hide: !!r.is_hidden
        });
      }
    }

    res.json(Object.values(accounts));
  } catch (err) {
    console.error('GET /api/comptes error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});

// ✅ GET single compte
app.get('/api/comptes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const sql = `
      SELECT 
        c.id_compte, c.email, c.name, c.prenom, c.certicode, c.role, c.is_suspended,
        c.created_at, c.id_entite, c.profile_id, c.avatar_url,
        e.raison_socialle AS producer_name,
        p.role AS profile_role,
        ap.page_id, ap.can_read, ap.can_write, ap.is_hidden,
        pg.page_name
      FROM comptes c
      LEFT JOIN Entite e ON c.id_entite = e.id_entite
      LEFT JOIN profiles p ON c.profile_id = p.id_profile
      LEFT JOIN autorisation_profile_page ap ON ap.id_profile = c.profile_id
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      WHERE c.id_compte = ?;
    `;

    const [rows] = await conn.query(sql, [id]);
    await conn.end();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    const account = {
      id_compte: rows[0].id_compte,
      email: rows[0].email,
      name: rows[0].name,
      prenom: rows[0].prenom,
      certicode: rows[0].certicode,
      role: rows[0].role,
      is_suspended: !!rows[0].is_suspended,
      created_at: rows[0].created_at,
      id_entite: rows[0].id_entite,
      profile_id: rows[0].profile_id,
      avatar_url: rows[0].avatar_url,
      producer_name: rows[0].producer_name || null,
      permissions: []
    };

    for (const r of rows) {
      if (r.page_id) {
        account.permissions.push({
          page_id: r.page_id,
          page_name: r.page_name,
          read: !!r.can_read,
          write: !!r.can_write,
          hide: !!r.is_hidden
        });
      }
    }

    res.json(account);
  } catch (err) {
    console.error('GET /api/comptes/:id error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});

// ✅ GET account permissions (new endpoint for frontend)
app.get("/api/account-permissions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const [accountRows] = await conn.query("SELECT profile_id FROM comptes WHERE id_compte = ?", [id]);
    if (accountRows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: "Compte not found" });
    }

    const profileId = accountRows[0].profile_id;

    const sql = `
      SELECT 
        ap.page_id, ap.can_read AS read, ap.can_write AS write, ap.is_hidden AS hide,
        pg.page_name
      FROM autorisation_profile_page ap
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      WHERE ap.id_profile = ?;
    `;

    const [permRows] = await conn.query(sql, [profileId]);
    await conn.end();

    res.json(permRows);
  } catch (err) {
    console.error("GET /api/account-permissions/:id error:", err);
    res.status(500).json({ error: "Failed to fetch permissions", details: err.message });
  }
});