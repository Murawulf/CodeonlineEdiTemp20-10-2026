#!/bin/bash
# ============================================================================
# test_edi_e2e.sh — Test de bout en bout de l'échange EDI EANCOM via le
# registry PAESN (hub) : dispatch → routage → réception → parsing → APERAK
# retour → robustesse → NETTOYAGE AUTO des données de test.
#
# Usage :   ./scripts/test_edi_e2e.sh [tun|sen|civ]
#           (défaut : tun — le nœud RÉCEPTEUR testé)
#
# Prérequis : alias SSH configurés (~/.ssh/config) : hub-prod, tunp, senp, civ.
# Le nœud émetteur n'est qu'un label GLN (aucun serveur émetteur touché).
# Toutes les refs de test sont uniques (E2E<timestamp>) et supprimées à la fin.
# Codes retour : 0 = tous les tests passent, 1 = au moins un échec.
# ============================================================================
set -u

RECEIVER="${1:-tun}"

# --- annuaire nœuds : GLN / alias ssh / dossier backend ---
case "$RECEIVER" in
  tun) R_GLN="6191234567890"; R_SSH="tunp"; R_DIR="/var/www/Edi-prod/backend"; R_NAME="Tunisie" ;;
  sen) R_GLN="SN02583102G3";  R_SSH="senp"; R_DIR="/var/www/Edi-Prod/backend"; R_NAME="Senegal" ;;
  civ) R_GLN="6181234567890"; R_SSH="civ";  R_DIR="/var/www/Edi-prod/backend"; R_NAME="Cote Ivoire" ;;
  *) echo "usage: $0 [tun|sen|civ]"; exit 1 ;;
esac
# émetteur = un autre nœud (label seulement)
if [ "$RECEIVER" = "civ" ]; then S_GLN="6191234567890"; else S_GLN="6181234567890"; fi

HUB_URL="https://registry.codeonline-edi.net/api/orchestrator/dispatch"
TS=$(date +%y%m%d%H%M%S)
REF_ORD="ORD-E2E$TS"
REF_DES="DES-E2E$TS"
PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
ko()   { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# helper : requête SQL sur le nœud récepteur (creds lus depuis son .env)
rsql() {
  ssh "$R_SSH" "cd $R_DIR; PW=\$(grep ^DB_PASSWORD= .env|cut -d= -f2-|tr -d '\"'); U=\$(grep ^DB_USER= .env|cut -d= -f2-); MYSQL_PWD=\"\$PW\" mysql -u\"\$U\" Entitedb -N -e \"$1\" 2>/dev/null"
}
hsql() { ssh hub-prod "mysql -uroot codeonline_edi_db_prod -N -e \"$1\" 2>/dev/null"; }

echo "================================================================"
echo " Test EDI e2e via registry — récepteur: $R_NAME ($R_GLN)"
echo " refs: $REF_ORD / $REF_DES (nettoyées en fin de test)"
echo "================================================================"

# --- 0. pré-vol : routage hub ---
ROUTE=$(hsql "SELECT status FROM partners WHERE gln='$R_GLN';")
[ "$ROUTE" = "ACTIVE" ] && ok "hub partners: $R_GLN ACTIVE" || ko "hub partners: $R_GLN ($ROUTE)"

# --- 1. dispatch ORDERS émetteur -> récepteur ---
RESP=$(curl -sk --max-time 30 -X POST "$HUB_URL" -H "Content-Type: application/json" -d @- <<JSON
{"senderGln":"$S_GLN","receiverGln":"$R_GLN","messageType":"ORDERS","transactionRef":"$REF_ORD","filename":"ORDERS-$REF_ORD.edi","eancomContent":"UNB+UNOC:3+$S_GLN:14+$R_GLN:14+260721:1200+$REF_ORD'UNH+1+ORDERS:D:96A:UN:EAN010'BGM+220+$REF_ORD+9'DTM+137:20260721:102'NAD+BY+$S_GLN::9'NAD+SU+$R_GLN::9'LIN+1++6190000000001:EN'QTY+21:100'MOA+79:5000'UNS+S'UNT+10+1'UNZ+1+$REF_ORD'"}
JSON
)
echo "$RESP" | grep -q '"success":true' && ok "dispatch ORDERS accepté par le registry" || ko "dispatch ORDERS: $RESP"
sleep 3

# --- 2. hub : transaction DELIVERED ---
ST=$(hsql "SELECT status FROM transactions WHERE transaction_ref='$REF_ORD';")
[ "$ST" = "DELIVERED" ] && ok "hub transaction ORDERS: DELIVERED" || ko "hub transaction ORDERS: '$ST'"

# --- 3. récepteur : INBOUND reçu ---
RX=$(rsql "SELECT COUNT(*) FROM edi_transmissions WHERE filename LIKE '%$REF_ORD%' AND direction='INBOUND';")
[ "${RX:-0}" -ge 1 ] && ok "récepteur: ORDERS INBOUND présent" || ko "récepteur: ORDERS absent"

# --- 4. dispatch DESADV (teste le parsing structuré) ---
RESP=$(curl -sk --max-time 30 -X POST "$HUB_URL" -H "Content-Type: application/json" -d @- <<JSON
{"senderGln":"$S_GLN","receiverGln":"$R_GLN","messageType":"DESADV","transactionRef":"$REF_DES","filename":"DESADV-$REF_DES.edi","eancomContent":"UNB+UNOC:3+$S_GLN:14+$R_GLN:14+260721:1200+$REF_DES'UNH+1+DESADV:D:96A:UN:EAN010'BGM+351+$REF_DES+9'DTM+137:20260721:102'NAD+SU+$S_GLN::9'NAD+BY+$R_GLN::9'CPS+1'PAC+1++PK'GIN+BJ+1$R_GLN-001'LIN+1++6190000000001:EN'QTY+12:100'UNS+S'UNT+12+1'UNZ+1+$REF_DES'"}
JSON
)
echo "$RESP" | grep -q '"success":true' && ok "dispatch DESADV accepté" || ko "dispatch DESADV: $RESP"
sleep 3

# --- 5. récepteur : DESADV PROCESSED + entête parsée ---
DST=$(rsql "SELECT status FROM edi_transmissions WHERE filename LIKE '%$REF_DES%';")
case "$DST" in PROCESSED|RECEIVED) ok "récepteur: DESADV $DST" ;; *) ko "récepteur: DESADV '$DST'" ;; esac
DH=$(rsql "SELECT COUNT(*) FROM edi_desadv WHERE desadv_number LIKE '%$REF_DES%';")
[ "${DH:-0}" -ge 1 ] && ok "parsing: entête edi_desadv créée" || ko "parsing: pas d'entête edi_desadv"

# --- 6. APERAK retour (auto-ack récepteur -> hub) ---
AP=$(hsql "SELECT COUNT(*) FROM transactions WHERE document_type='APERAK' AND transaction_ref LIKE '%E2E$TS%' AND status='DELIVERED';")
[ "${AP:-0}" -ge 1 ] && ok "APERAK retour: $AP ack DELIVERED (round-trip complet)" || ko "APERAK retour absent"

# --- 7. robustesse : GLN inconnu -> refus propre ---
CODE=$(curl -sk --max-time 30 -o /dev/null -w "%{http_code}" -X POST "$HUB_URL" -H "Content-Type: application/json" \
  -d "{\"senderGln\":\"$S_GLN\",\"receiverGln\":\"000INCONNU999\",\"messageType\":\"ORDERS\",\"transactionRef\":\"BAD-E2E$TS\",\"eancomContent\":\"UNH+TEST\"}")
[ "$CODE" = "404" ] && ok "GLN inconnu refusé (404)" || ko "GLN inconnu: HTTP $CODE"

# --- 8. NETTOYAGE (hub + récepteur) ---
hsql "DELETE FROM transactions WHERE transaction_ref LIKE '%E2E$TS%';" >/dev/null 2>&1
rsql "DELETE FROM edi_desadv_lines WHERE desadv_id IN (SELECT id FROM edi_desadv WHERE desadv_number LIKE '%$REF_DES%');" >/dev/null 2>&1
rsql "DELETE FROM edi_desadv WHERE desadv_number LIKE '%$REF_DES%';" >/dev/null 2>&1
rsql "DELETE FROM edi_transmissions WHERE filename LIKE '%E2E$TS%';" >/dev/null 2>&1
RESTE_H=$(hsql "SELECT COUNT(*) FROM transactions WHERE transaction_ref LIKE '%E2E$TS%';")
RESTE_R=$(rsql "SELECT COUNT(*) FROM edi_transmissions WHERE filename LIKE '%E2E$TS%';")
[ "${RESTE_H:-1}" = "0" ] && [ "${RESTE_R:-1}" = "0" ] && ok "nettoyage: 0 résidu (hub + récepteur)" || ko "nettoyage: résidus hub=$RESTE_H récepteur=$RESTE_R"

echo "================================================================"
echo " RÉSULTAT : $PASS OK / $FAIL ÉCHEC"
echo "================================================================"
[ "$FAIL" = "0" ] && exit 0 || exit 1
