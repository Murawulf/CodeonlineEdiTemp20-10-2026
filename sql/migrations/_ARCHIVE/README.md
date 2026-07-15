# _ARCHIVE — migrations transport OBSOLÈTES

`create_transport_tables.sql` et `update_existing_transport_tables.sql` définissent un schéma
`edi_transport_orders` **incompatible** avec la prod (colonnes `id_order/id_shipment/vehicule`).
**Ne pas les exécuter.** Référence unique du schéma transport =
`sql/migrations/2026_iftmin_transport_schema.sql` (dump réel prod du 2026-07-15).
