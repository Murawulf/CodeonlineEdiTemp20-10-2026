# _ARCHIVE — ancien staging IFTMIN/transport (OBSOLÈTE)

Ces fichiers sont l'**ancien staging** du travail transport/IFTMIN. Ils sont **obsolètes** et
conservés pour historique uniquement.

**La référence = le code de prod, rapatrié dans `edi_orchestrator/`** (générateur, `TransportController`,
`routes/transport.js`, `services/carriers/*`, `services/TransportOrderModel.js`, tests `edi_orchestrator/test/*`).

Écarts notables de ce staging vs la prod : schéma `edi_transport_orders` **incompatible**
(`id_order/id_shipment/vehicule/status` staging ≠ `ref/carrier_code/status enum/iftmin_content/tracking_number`
prod). Ne PAS s'en servir comme source. Voir `docs/RECONCILE_IFTMIN.md` et
`sql/migrations/2026_iftmin_transport_schema.sql`.
