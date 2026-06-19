'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const STATE = {
  apiKey: null,
  userName: null,
  currentPage: 'overview',
  autoRefresh: false,
  autoRefreshTimer: null,
  stats: null,
  charts: {},
};

const API_BASE = window.location.origin + '/api/tracking';

// ─── API Helper ──────────────────────────────────────────────────────────────
async function api(endpoint, params = {}) {
  const url = new URL(API_BASE + endpoint);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), {
    headers: { 'X-Tracking-Api-Key': STATE.apiKey },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Login ───────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = document.getElementById('login-user').value.trim() || 'Admin';
  const key = document.getElementById('login-key').value.trim();
  if (!key) { showLoginError('Veuillez entrer une clé API.'); return; }

  try {
    // Test the key against the health + stats endpoint
    const testUrl = API_BASE + '/stats';
    const res = await fetch(testUrl, { headers: { 'X-Tracking-Api-Key': key } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!data.success) throw new Error();

    STATE.apiKey = key;
    STATE.userName = user;
    localStorage.setItem('edi_dash_key', key);
    localStorage.setItem('edi_dash_user', user);
    enterApp();
  } catch {
    showLoginError('Clé API invalide ou serveur indisponible.');
  }
});

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('active');
  document.getElementById('user-display-name').textContent = STATE.userName;
  document.getElementById('user-avatar').textContent = STATE.userName.charAt(0).toUpperCase();
  lucide.createIcons();
  navigateTo('overview');
}

function logout() {
  STATE.apiKey = null;
  STATE.userName = null;
  localStorage.removeItem('edi_dash_key');
  localStorage.removeItem('edi_dash_user');
  stopAutoRefresh();
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-key').value = '';
}

// ─── Navigation ──────────────────────────────────────────────────────────────
var PAGE_TITLES = {
  overview:      { title: 'Vue d\'ensemble',  crumb: 'Dashboard > Overview' },
  transactions:  { title: 'Transactions',     crumb: 'Dashboard > Transactions' },
  tracking:      { title: 'Tracking',         crumb: 'Dashboard > Tracking & Recherche' },
  orders:        { title: 'Suivi Commandes',  crumb: 'Dashboard > Suivi Commandes EDI' },
  partners:      { title: 'Partenaires',      crumb: 'Dashboard > Réseau Partenaires' },
  alerts:        { title: 'Alertes',          crumb: 'Dashboard > Alertes & Incidents' },
  doctypes:      { title: 'Types EANCOM',     crumb: 'Dashboard > Référence Documents' },
  'api-explorer':{ title: 'API Explorer',     crumb: 'Dashboard > Test API' },
};

function navigateTo(page) {
  STATE.currentPage = page;
  // Update nav
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const info = PAGE_TITLES[page] || { title: page, crumb: '' };
  document.getElementById('page-title').textContent = info.title;
  document.getElementById('page-breadcrumb').textContent = info.crumb;

  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="spinner"></div>';

  // Render page
  switch (page) {
    case 'overview':     renderOverview(content);     break;
    case 'transactions': renderTransactions(content);  break;
    case 'tracking':     renderTracking(content);      break;
    case 'orders':       renderOrders(content);        break;
    case 'partners':     renderPartners(content);      break;
    case 'alerts':       renderAlerts(content);        break;
    case 'doctypes':     renderDocTypes(content);      break;
    case 'api-explorer': renderApiExplorer(content);   break;
    default:             content.innerHTML = '<div class="empty-state"><p>Page inconnue</p></div>';
  }
}

// Auto-login: runs AFTER PAGE_TITLES and navigateTo are defined
(function autoLogin() {
  const key = localStorage.getItem('edi_dash_key');
  const user = localStorage.getItem('edi_dash_user');
  if (key) {
    STATE.apiKey = key;
    STATE.userName = user || 'Admin';
    enterApp();
  }
})();

function refreshCurrentPage() {
  const btn = document.getElementById('refresh-btn');
  btn.querySelector('i')?.classList.add('rotating');
  navigateTo(STATE.currentPage);
  setTimeout(() => btn.querySelector('i')?.classList.remove('rotating'), 1000);
}

// ─── Auto-Refresh ────────────────────────────────────────────────────────────
function toggleAutoRefresh() {
  STATE.autoRefresh = !STATE.autoRefresh;
  const btn = document.getElementById('autorefresh-btn');
  btn.style.borderColor = STATE.autoRefresh ? 'var(--primary)' : '';
  btn.style.color = STATE.autoRefresh ? 'var(--primary)' : '';
  if (STATE.autoRefresh) {
    showToast('Auto-refresh activé (30s)');
    STATE.autoRefreshTimer = setInterval(() => refreshCurrentPage(), 30000);
  } else {
    stopAutoRefresh();
    showToast('Auto-refresh désactivé');
  }
}
function stopAutoRefresh() {
  if (STATE.autoRefreshTimer) clearInterval(STATE.autoRefreshTimer);
  STATE.autoRefresh = false;
}

// ─── Theme ───────────────────────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('edi_dash_theme', isDark ? 'light' : 'dark');
}
(function initTheme() {
  const t = localStorage.getItem('edi_dash_theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
})();

// ─── Sidebar Toggle (mobile) ────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── Drawer ──────────────────────────────────────────────────────────────────
function openDrawer(title, html) {
  document.getElementById('drawer-title').textContent = title;
  document.getElementById('drawer-body').innerHTML = html;
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
  lucide.createIcons();
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}
function statusBadge(status) {
  const icons = { DELIVERED: '✓', FAILED: '✗', RECEIVED: '↓', FORWARDED: '→', RETRY_QUEUED: '↻', STUCK: '⏳' };
  return `<span class="badge-status badge-${status}">${icons[status] || ''} ${status}</span>`;
}
function typeBadge(type) {
  return `<span class="badge-type">${type}</span>`;
}
function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
async function renderOverview(el) {
  try {
    const [statsRes, alertsRes, healthRes, txRes] = await Promise.all([
      api('/stats'),
      api('/alerts'),
      api('/health'),
      api('/transactions', { limit: 8 }),
    ]);
    const s = statsRes.data;
    const a = alertsRes.data;
    const h = healthRes.data;
    const tx = txRes.data;

    // Update alerts badge
    const badge = document.getElementById('alerts-badge');
    if (a.total_alerts > 0) {
      badge.style.display = 'inline';
      badge.textContent = a.total_alerts;
    } else {
      badge.style.display = 'none';
    }

    el.innerHTML = `
      <!-- Stats cards -->
      <div class="grid-stats">
        <div class="card stat-card">
          <div class="stat-icon blue"><i data-lucide="arrow-left-right" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${s.total_transactions}</div><div class="stat-label">Total Transactions</div></div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon cyan"><i data-lucide="activity" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${s.transactions_24h}</div><div class="stat-label">Dernières 24h</div></div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon green"><i data-lucide="check-circle" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${s.delivery_rate_pct}%</div><div class="stat-label">Taux de livraison</div>
          <span class="stat-change ${s.delivery_rate_pct >= 80 ? 'up' : 'down'}">${s.delivery_rate_pct >= 80 ? '▲ Bon' : '▼ Attention'}</span></div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon amber"><i data-lucide="clock" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${s.avg_delivery_time_s !== null ? s.avg_delivery_time_s + 's' : '—'}</div><div class="stat-label">Temps moyen livraison</div></div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon red"><i data-lucide="alert-triangle" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${a.total_alerts}</div><div class="stat-label">Alertes actives</div></div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon purple"><i data-lucide="building-2" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${h.active_partners}</div><div class="stat-label">Partenaires actifs</div></div>
        </div>
      </div>

      <!-- Charts row -->
      <div class="grid-2">
        <div class="card">
          <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:1rem;">Répartition par Statut</h3>
          <div class="chart-container"><canvas id="chart-status"></canvas></div>
        </div>
        <div class="card">
          <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:1rem;">Volume par Type de Document</h3>
          <div class="chart-container"><canvas id="chart-types"></canvas></div>
        </div>
      </div>

      <!-- Top senders + Recent tx -->
      <div class="grid-2">
        <div class="card">
          <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:1rem;">Top Expéditeurs</h3>
          <div class="chart-container"><canvas id="chart-senders"></canvas></div>
        </div>
        <div class="card">
          <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:1rem;">Dernières Transactions</h3>
          <div style="max-height:300px;overflow-y:auto;">
            ${tx.map(t => `
              <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border);cursor:pointer"
                   onclick="showTransactionDetail('${escHtml(t.transaction_ref)}')">
                ${statusBadge(t.status)}
                <div style="flex:1;min-width:0">
                  <div style="font-size:0.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.transaction_ref)}</div>
                  <div style="font-size:0.72rem;color:var(--text-muted)">${escHtml(t.sender_gln)} → ${escHtml(t.receiver_gln)}</div>
                </div>
                <div style="text-align:right">
                  ${typeBadge(t.document_type)}
                  <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">${fmtDate(t.created_at)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- System Health -->
      <div class="card" style="margin-top:1rem;">
        <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:0.75rem;">Santé du Système</h3>
        <div style="display:flex;gap:2rem;flex-wrap:wrap;font-size:0.85rem;">
          <div><strong>Status:</strong> <span style="color:var(--success)">● ${h.status.toUpperCase()}</span></div>
          <div><strong>Base de données:</strong> <span style="color:var(--success)">● ${h.db}</span></div>
          <div><strong>Uptime:</strong> ${Math.floor(h.uptime_seconds / 3600)}h ${Math.floor((h.uptime_seconds % 3600) / 60)}m</div>
          <div><strong>Partenaires:</strong> ${h.active_partners}</div>
          <div><strong>Dernière mise à jour:</strong> ${fmtDate(h.timestamp)}</div>
        </div>
      </div>
    `;

    lucide.createIcons();

    // ── Charts ──
    destroyCharts();

    // Status doughnut
    const statusEntries = Object.entries(s.by_status);
    STATE.charts.status = new Chart(document.getElementById('chart-status'), {
      type: 'doughnut',
      data: {
        labels: statusEntries.map(([k]) => k),
        datasets: [{
          data: statusEntries.map(([, v]) => v),
          backgroundColor: statusEntries.map(([k]) => ({
            DELIVERED: '#10b981', FAILED: '#ef4444', RECEIVED: '#3b82f6',
            FORWARDED: '#6366f1', RETRY_QUEUED: '#f59e0b',
          }[k] || '#94a3b8')),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 12 }, padding: 12 } } },
        cutout: '60%',
      },
    });

    // Types bar
    const typeEntries = Object.entries(s.by_type);
    STATE.charts.types = new Chart(document.getElementById('chart-types'), {
      type: 'bar',
      data: {
        labels: typeEntries.map(([k]) => k),
        datasets: [{
          label: 'Nombre',
          data: typeEntries.map(([, v]) => v),
          backgroundColor: ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
          borderRadius: 6,
          maxBarThickness: 50,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });

    // Senders bar horizontal
    STATE.charts.senders = new Chart(document.getElementById('chart-senders'), {
      type: 'bar',
      data: {
        labels: s.top_senders.map((p) => p.gln.length > 15 ? p.gln.slice(0,15) + '…' : p.gln),
        datasets: [{
          label: 'Envoyé',
          data: s.top_senders.map((p) => p.sent),
          backgroundColor: '#2563eb',
          borderRadius: 6,
          maxBarThickness: 30,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });

  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Erreur : ${escHtml(err.message)}</p></div>`;
  }
}

function destroyCharts() {
  Object.values(STATE.charts).forEach((c) => c?.destroy?.());
  STATE.charts = {};
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════
async function renderTransactions(el) {
  el.innerHTML = `
    <div class="filters-bar" id="tx-filters">
      <div class="filter-group">
        <label>GLN</label>
        <input class="filter-input" id="f-gln" placeholder="Ex: 6191234567890" style="width:160px" />
      </div>
      <div class="filter-group">
        <label>Type</label>
        <select class="filter-select" id="f-type">
          <option value="">Tous</option>
          <option>ORDERS</option><option>ORDRSP</option><option>DESADV</option>
          <option>INVOIC</option><option>APERAK</option><option>UNKNOWN</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Statut</label>
        <select class="filter-select" id="f-status">
          <option value="">Tous</option>
          <option>DELIVERED</option><option>FAILED</option><option>RECEIVED</option>
          <option>FORWARDED</option><option>RETRY_QUEUED</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Du</label>
        <input class="filter-input" type="date" id="f-from" />
      </div>
      <div class="filter-group">
        <label>Au</label>
        <input class="filter-input" type="date" id="f-to" />
      </div>
      <div class="filter-group" style="justify-content:flex-end;">
        <label>&nbsp;</label>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-primary btn-sm" onclick="loadTransactions(1)">
            <i data-lucide="search" style="width:14px;height:14px"></i> Rechercher
          </button>
          <button class="btn btn-outline btn-sm" onclick="resetTxFilters()">Réinitialiser</button>
          <button class="btn btn-outline btn-sm" onclick="exportTransactions()" title="Exporter CSV">
            <i data-lucide="download" style="width:14px;height:14px"></i> CSV
          </button>
        </div>
      </div>
    </div>
    <div id="tx-table-container"><div class="spinner"></div></div>
  `;
  lucide.createIcons();
  loadTransactions(1);
}

async function loadTransactions(page) {
  const container = document.getElementById('tx-table-container');
  if (!container) return;
  container.innerHTML = '<div class="spinner"></div>';

  const params = {
    page,
    limit: 25,
    gln: document.getElementById('f-gln')?.value || '',
    document_type: document.getElementById('f-type')?.value || '',
    status: document.getElementById('f-status')?.value || '',
    from: document.getElementById('f-from')?.value || '',
    to: document.getElementById('f-to')?.value || '',
  };

  try {
    const res = await api('/transactions', params);
    const { data, pagination } = res;

    if (data.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Aucune transaction trouvée.</p></div>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Réf.</th><th>Expéditeur</th><th>Destinataire</th>
            <th>Type</th><th>Statut</th><th>Mode</th><th>Taille</th>
            <th>Date</th><th>Livré à</th><th>Durée</th><th></th>
          </tr></thead>
          <tbody>
            ${data.map(t => `
              <tr>
                <td style="font-family:monospace;font-size:0.78rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.transaction_ref)}">${escHtml(t.transaction_ref)}</td>
                <td>${escHtml(t.sender_gln)}</td>
                <td>${escHtml(t.receiver_gln)}</td>
                <td>${typeBadge(t.document_type)}</td>
                <td>${statusBadge(t.status)}</td>
                <td><span class="badge-transport">${t.transport_mode}</span></td>
                <td>${t.payload_size ? (t.payload_size / 1024).toFixed(1) + ' KB' : '—'}</td>
                <td>${fmtDate(t.created_at)}</td>
                <td>${fmtDate(t.delivered_at)}</td>
                <td>${fmtDuration(t.delivery_time_ms)}</td>
                <td><button class="btn-icon btn-sm" onclick="showTransactionDetail('${escHtml(t.transaction_ref)}')" title="Détails">
                  <i data-lucide="eye" style="width:14px;height:14px"></i>
                </button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="pagination">
          <span>Page ${pagination.page} / ${pagination.pages} — ${pagination.total} résultats</span>
          <div class="pagination-btns">
            <button ${pagination.page <= 1 ? 'disabled' : ''} onclick="loadTransactions(${pagination.page - 1})">← Préc.</button>
            ${renderPageButtons(pagination)}
            <button ${pagination.page >= pagination.pages ? 'disabled' : ''} onclick="loadTransactions(${pagination.page + 1})">Suiv. →</button>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erreur : ${escHtml(err.message)}</p></div>`;
  }
}

function renderPageButtons(p) {
  let btns = '';
  const start = Math.max(1, p.page - 2);
  const end = Math.min(p.pages, p.page + 2);
  for (let i = start; i <= end; i++) {
    btns += `<button class="${i === p.page ? 'active' : ''}" onclick="loadTransactions(${i})">${i}</button>`;
  }
  return btns;
}

function resetTxFilters() {
  ['f-gln','f-type','f-status','f-from','f-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  loadTransactions(1);
}

async function exportTransactions() {
  showToast('Export en cours...');
  try {
    const params = {
      limit: 200,
      gln: document.getElementById('f-gln')?.value || '',
      document_type: document.getElementById('f-type')?.value || '',
      status: document.getElementById('f-status')?.value || '',
      from: document.getElementById('f-from')?.value || '',
      to: document.getElementById('f-to')?.value || '',
    };
    const res = await api('/transactions', params);
    const rows = res.data;

    const headers = ['transaction_ref','sender_gln','receiver_gln','document_type','status','transport_mode','payload_size','created_at','delivered_at','delivery_time_ms'];
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edi_transactions_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export CSV terminé');
  } catch (err) {
    showToast('Erreur export: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: TRACKING (Advanced search & transaction detail)
// ═══════════════════════════════════════════════════════════════════════════════
async function renderTracking(el) {
  el.innerHTML = `
    <div class="card" style="margin-bottom:1.25rem;">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem;">🔍 Recherche par Référence</h3>
      <div style="display:flex;gap:0.75rem;align-items:flex-end;flex-wrap:wrap;">
        <div class="filter-group" style="flex:1;min-width:250px;">
          <label>Référence Transaction</label>
          <input class="filter-input" id="track-ref" placeholder="Entrez la référence complète ou partielle..." style="width:100%" />
        </div>
        <button class="btn btn-primary" onclick="trackSearch()">
          <i data-lucide="search" style="width:16px;height:16px"></i> Rechercher
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.25rem;">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem;">🎯 Recherche avancée par GLN</h3>
      <div style="display:flex;gap:0.75rem;align-items:flex-end;flex-wrap:wrap;">
        <div class="filter-group">
          <label>GLN Partenaire</label>
          <input class="filter-input" id="track-gln" placeholder="Ex: SN02583102G3" style="width:180px" />
        </div>
        <div class="filter-group">
          <label>Type Document</label>
          <select class="filter-select" id="track-type">
            <option value="">Tous</option>
            <option>ORDERS</option><option>ORDRSP</option><option>DESADV</option>
            <option>INVOIC</option><option>APERAK</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Statut</label>
          <select class="filter-select" id="track-status">
            <option value="">Tous</option>
            <option>DELIVERED</option><option>FAILED</option><option>RECEIVED</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Du</label>
          <input class="filter-input" type="date" id="track-from" />
        </div>
        <div class="filter-group">
          <label>Au</label>
          <input class="filter-input" type="date" id="track-to" />
        </div>
        <button class="btn btn-primary" onclick="trackAdvancedSearch()">
          <i data-lucide="filter" style="width:16px;height:16px"></i> Filtrer
        </button>
      </div>
    </div>

    <div id="track-results"></div>
  `;
  lucide.createIcons();
}

async function trackSearch() {
  const ref = document.getElementById('track-ref')?.value?.trim();
  if (!ref) { showToast('Entrez une référence'); return; }
  const container = document.getElementById('track-results');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    // Try exact match first
    const res = await api(`/transactions/${encodeURIComponent(ref)}`).catch(() => null);
    if (res?.success) {
      // Show detail + history
      showTransactionDetail(ref);
      container.innerHTML = '<div class="card" style="padding:1.5rem;text-align:center;color:var(--success);font-weight:600;">✓ Transaction trouvée — détails affichés dans le panneau latéral.</div>';
      return;
    }
    // Try as filter (partial match via GLN search)
    const listRes = await api('/transactions', { gln: ref, limit: 20 });
    if (listRes.data.length > 0) {
      renderTrackingResults(container, listRes.data, `Résultats pour "${ref}"`);
    } else {
      container.innerHTML = '<div class="empty-state"><p>Aucun résultat trouvé pour cette référence.</p></div>';
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erreur: ${escHtml(err.message)}</p></div>`;
  }
}

async function trackAdvancedSearch() {
  const container = document.getElementById('track-results');
  container.innerHTML = '<div class="spinner"></div>';
  try {
    const params = {
      gln: document.getElementById('track-gln')?.value || '',
      document_type: document.getElementById('track-type')?.value || '',
      status: document.getElementById('track-status')?.value || '',
      from: document.getElementById('track-from')?.value || '',
      to: document.getElementById('track-to')?.value || '',
      limit: 50,
    };
    const res = await api('/transactions', params);
    if (res.data.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Aucune transaction trouvée.</p></div>';
      return;
    }
    renderTrackingResults(container, res.data, `${res.pagination.total} résultats trouvés`);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erreur: ${escHtml(err.message)}</p></div>`;
  }
}

function renderTrackingResults(container, data, title) {
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h3 style="font-size:0.95rem;font-weight:700;">${title}</h3>
        <span style="font-size:0.8rem;color:var(--text-muted)">${data.length} affiché(s)</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        ${data.map(t => `
          <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:background 0.1s"
               onmouseover="this.style.background='rgba(37,99,235,0.04)'"
               onmouseout="this.style.background=''"
               onclick="showTransactionDetail('${escHtml(t.transaction_ref)}')">
            ${statusBadge(t.status)}
            <div style="flex:1;min-width:0">
              <div style="font-size:0.85rem;font-weight:600;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.transaction_ref)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(t.sender_gln)} → ${escHtml(t.receiver_gln)}</div>
            </div>
            <div style="text-align:right">
              ${typeBadge(t.document_type)}
              <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">${fmtDate(t.created_at)}</div>
            </div>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-muted)"></i>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  lucide.createIcons();
}

// ─── Transaction Detail (Drawer) ─────────────────────────────────────────────
async function showTransactionDetail(ref) {
  closeDrawer(); // Close any existing drawer (e.g., order detail)
  openDrawer('Détail Transaction', '<div class="spinner"></div>');
  try {
    const [txRes, histRes] = await Promise.all([
      api(`/transactions/${encodeURIComponent(ref)}`),
      api(`/transactions/${encodeURIComponent(ref)}/history`),
    ]);
    const t = txRes.data;
    const h = histRes;

    const html = `
      <div style="margin-bottom:1.5rem;display:flex;align-items:center;gap:0.5rem">
        ${t.order_ref ? `
          <button class="btn btn-outline btn-sm" onclick="showOrderDetail('${escHtml(t.order_ref)}')" title="Retour à la commande ${escHtml(t.order_ref)}">
            <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
          </button>
        ` : ''}
        <div style="flex:1">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">Référence</div>
          <div style="font-size:0.9rem;font-family:monospace;font-weight:600;word-break:break-all">${escHtml(t.transaction_ref)}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Expéditeur</div><div style="font-weight:600">${escHtml(t.sender_gln)}</div></div>
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Destinataire</div><div style="font-weight:600">${escHtml(t.receiver_gln)}</div></div>
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Type Document</div>${typeBadge(t.document_type)}</div>
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Statut</div>${statusBadge(t.status)}</div>
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Mode Transport</div><div>${t.transport_mode}</div></div>
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Taille Payload</div><div>${t.payload_size ? (t.payload_size / 1024).toFixed(1) + ' KB' : '—'}</div></div>
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Créé le</div><div>${fmtDate(t.created_at)}</div></div>
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Livré le</div><div>${fmtDate(t.delivered_at)}</div></div>
        <div><div style="font-size:0.72rem;color:var(--text-muted)">Durée Livraison</div><div>${fmtDuration(t.delivery_time_ms)}</div></div>
      </div>

      ${t.error_message ? `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:0.75rem;margin-bottom:1.5rem;">
          <div style="font-size:0.75rem;font-weight:700;color:#991b1b;margin-bottom:4px">Erreur</div>
          <div style="font-size:0.82rem;color:#7f1d1d">${escHtml(t.error_message)}</div>
        </div>
      ` : ''}

      <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:1rem;">Historique de statut</h4>
      <div class="timeline">
        ${h.timeline.map((step, i) => {
          const dotClass = step.status === 'DELIVERED' ? 'success' : step.status === 'FAILED' ? 'fail' : 'pending';
          return `
            <div class="timeline-item">
              <div class="timeline-dot ${dotClass}"></div>
              <div class="timeline-time">${fmtDate(step.at)}</div>
              <div class="timeline-title">${escHtml(step.status)}</div>
              <div class="timeline-desc">${escHtml(step.note)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    document.getElementById('drawer-body').innerHTML = html;
    lucide.createIcons();
  } catch (err) {
    document.getElementById('drawer-body').innerHTML = `<div class="empty-state"><p>Erreur: ${escHtml(err.message)}</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: PARTNERS
// ═══════════════════════════════════════════════════════════════════════════════
async function renderPartners(el) {
  try {
    const res = await api('/partners');
    const partners = res.data;
    const countryFlags = { '788': '🇹🇳', '686': '🇸🇳' };

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
        ${partners.map(p => `
          <div class="card" style="cursor:pointer;transition:box-shadow 0.2s"
               onmouseover="this.style.boxShadow='0 4px 12px rgba(37,99,235,0.12)'"
               onmouseout="this.style.boxShadow=''"
               onclick="showPartnerTimeline('${escHtml(p.gln)}')">
            <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
              <div style="font-size:2rem">${countryFlags[p.country_code] || '🌐'}</div>
              <div>
                <div style="font-weight:700;font-size:0.95rem">${escHtml(p.name)}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);font-family:monospace">${escHtml(p.gln)}</div>
              </div>
              <span class="badge-status badge-${p.status === 'ACTIVE' ? 'DELIVERED' : 'FAILED'}" style="margin-left:auto">${p.status}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;text-align:center;">
              <div style="background:var(--bg);border-radius:8px;padding:0.5rem">
                <div style="font-size:1.25rem;font-weight:800">${p.stats.total}</div>
                <div style="font-size:0.7rem;color:var(--text-muted)">Total</div>
              </div>
              <div style="background:#d1fae5;border-radius:8px;padding:0.5rem">
                <div style="font-size:1.25rem;font-weight:800;color:#065f46">${p.stats.delivered}</div>
                <div style="font-size:0.7rem;color:#065f46">Livrés</div>
              </div>
              <div style="background:#fee2e2;border-radius:8px;padding:0.5rem">
                <div style="font-size:1.25rem;font-weight:800;color:#991b1b">${p.stats.failed}</div>
                <div style="font-size:0.7rem;color:#991b1b">Échoués</div>
              </div>
            </div>
            <div style="margin-top:0.75rem;display:flex;justify-content:space-between;align-items:center;">
              <div style="flex:1;background:var(--border);height:6px;border-radius:3px;overflow:hidden">
                <div style="height:100%;background:var(--success);border-radius:3px;width:${p.stats.delivery_rate_pct}%"></div>
              </div>
              <span style="font-size:0.78rem;font-weight:700;margin-left:0.5rem;">${p.stats.delivery_rate_pct}%</span>
            </div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem">
              Dernière activité: ${fmtDate(p.last_activity)}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Erreur: ${escHtml(err.message)}</p></div>`;
  }
}

async function showPartnerTimeline(gln) {
  openDrawer(`Timeline — ${gln}`, '<div class="spinner"></div>');
  try {
    const res = await api(`/partners/${encodeURIComponent(gln)}/timeline`, { limit: 50 });
    const html = `
      <div style="margin-bottom:1rem;">
        <div style="font-weight:700;font-size:1rem;">${escHtml(res.partner.name)}</div>
        <div style="font-size:0.82rem;color:var(--text-muted);font-family:monospace">${escHtml(gln)}</div>
      </div>
      <div class="timeline">
        ${res.data.map(t => {
          const dotClass = t.status === 'DELIVERED' ? 'success' : t.status === 'FAILED' ? 'fail' : 'pending';
          return `
            <div class="timeline-item" style="cursor:pointer" onclick="showTransactionDetail('${escHtml(t.transaction_ref)}')">
              <div class="timeline-dot ${dotClass}"></div>
              <div class="timeline-time">${fmtDate(t.created_at)}</div>
              <div class="timeline-title">${t.direction === 'SENT' ? '↑ Envoyé' : '↓ Reçu'} — ${escHtml(t.document_type)}</div>
              <div class="timeline-desc">
                ${t.direction === 'SENT' ? 'Vers' : 'De'} ${escHtml(t.direction === 'SENT' ? t.receiver_gln : t.sender_gln)}
                — ${statusBadge(t.status)}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    document.getElementById('drawer-body').innerHTML = html;
    lucide.createIcons();
  } catch (err) {
    document.getElementById('drawer-body').innerHTML = `<div class="empty-state"><p>Erreur: ${escHtml(err.message)}</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: ALERTS
// ═══════════════════════════════════════════════════════════════════════════════
async function renderAlerts(el) {
  try {
    const res = await api('/alerts');
    const { failed, stuck, total_alerts } = res.data;

    el.innerHTML = `
      <div class="grid-stats" style="margin-bottom:1.25rem;">
        <div class="card stat-card">
          <div class="stat-icon red"><i data-lucide="alert-circle" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${failed.length}</div><div class="stat-label">Échouées (7 jours)</div></div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon amber"><i data-lucide="clock" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${stuck.length}</div><div class="stat-label">Bloquées</div></div>
        </div>
        <div class="card stat-card">
          <div class="stat-icon blue"><i data-lucide="bell" style="width:22px;height:22px"></i></div>
          <div><div class="stat-value">${total_alerts}</div><div class="stat-label">Total Alertes</div></div>
        </div>
      </div>

      ${stuck.length > 0 ? `
        <div class="card" style="margin-bottom:1.25rem;border-left:4px solid var(--warning);">
          <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:0.75rem;color:var(--warning)">⏳ Transmissions Bloquées</h3>
          <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem">Transactions en statut RECEIVED ou FORWARDED depuis plus de 5 minutes.</p>
          ${renderAlertTable(stuck)}
        </div>
      ` : ''}

      ${failed.length > 0 ? `
        <div class="card" style="border-left:4px solid var(--danger);">
          <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:0.75rem;color:var(--danger)">✗ Transmissions Échouées</h3>
          ${renderAlertTable(failed)}
        </div>
      ` : ''}

      ${total_alerts === 0 ? `
        <div class="card empty-state">
          <div style="font-size:3rem;margin-bottom:1rem">🎉</div>
          <p style="font-size:1.1rem;font-weight:600;">Aucune alerte !</p>
          <p>Toutes les transmissions fonctionnent normalement.</p>
        </div>
      ` : ''}
    `;
    lucide.createIcons();
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Erreur: ${escHtml(err.message)}</p></div>`;
  }
}

function renderAlertTable(items) {
  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Réf.</th><th>Type</th><th>Expéditeur → Dest.</th>
          <th>Statut</th><th>Erreur</th><th>Âge</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(a => `
            <tr>
              <td style="font-family:monospace;font-size:0.78rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(a.transaction_ref)}">${escHtml(a.transaction_ref)}</td>
              <td>${typeBadge(a.document_type)}</td>
              <td style="font-size:0.82rem">${escHtml(a.sender_gln)} → ${escHtml(a.receiver_gln)}</td>
              <td>${statusBadge(a.status)}</td>
              <td class="wrap" style="font-size:0.78rem;color:var(--danger)">${escHtml(a.error || '—')}</td>
              <td style="font-size:0.82rem">${a.age_minutes < 60 ? a.age_minutes + 'min' : Math.floor(a.age_minutes / 60) + 'h ' + (a.age_minutes % 60) + 'min'}</td>
              <td><button class="btn-icon btn-sm" onclick="showTransactionDetail('${escHtml(a.transaction_ref)}')" title="Détails">
                <i data-lucide="eye" style="width:14px;height:14px"></i>
              </button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: DOCUMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════
async function renderDocTypes(el) {
  try {
    const res = await api('/document-types');
    const types = res.data;
    const icons = {
      ORDERS: '📋', ORDRSP: '✅', DESADV: '🚚', RECADV: '📦',
      INVOIC: '💰', APERAK: '🔔', CONTRL: '🔧', UNKNOWN: '❓',
    };

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
        ${types.map(t => `
          <div class="card">
            <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
              <div style="font-size:1.75rem">${icons[t.code] || '📄'}</div>
              <div>
                <div style="font-weight:700;font-size:1rem">${t.code}</div>
                <div style="font-size:0.85rem;color:var(--primary);font-weight:600">${t.label}</div>
              </div>
            </div>
            <p style="font-size:0.82rem;color:var(--text-muted)">${escHtml(t.description)}</p>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>Erreur: ${escHtml(err.message)}</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: API EXPLORER
// ═══════════════════════════════════════════════════════════════════════════════
function renderApiExplorer(el) {
  const endpoints = [
    { method: 'GET', path: '/health', auth: false, desc: 'Santé du hub', params: '' },
    { method: 'GET', path: '/document-types', auth: false, desc: 'Types EANCOM', params: '' },
    { method: 'GET', path: '/transactions', auth: true, desc: 'Lister les transactions', params: 'gln, sender_gln, receiver_gln, document_type, status, from, to, page, limit' },
    { method: 'GET', path: '/transactions/:ref', auth: true, desc: 'Détail transaction', params: 'ref (URL param)' },
    { method: 'GET', path: '/transactions/:ref/history', auth: true, desc: 'Historique de statut', params: 'ref (URL param)' },
    { method: 'GET', path: '/stats', auth: true, desc: 'Statistiques globales', params: 'gln, from, to' },
    { method: 'GET', path: '/partners', auth: true, desc: 'Liste partenaires', params: '' },
    { method: 'GET', path: '/partners/:gln/timeline', auth: true, desc: 'Timeline partenaire', params: 'gln (URL param), limit' },
    { method: 'GET', path: '/alerts', auth: true, desc: 'Alertes actives', params: '' },
  ];

  el.innerHTML = `
    <div class="card" style="margin-bottom:1.25rem;">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:0.5rem;">🧪 API Explorer — Test en direct</h3>
      <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem;">
        Base URL: <code style="background:var(--bg);padding:2px 8px;border-radius:4px">${API_BASE}</code>
      </p>
      <div style="display:flex;gap:0.75rem;align-items:flex-end;flex-wrap:wrap;">
        <div class="filter-group" style="flex:1;min-width:300px">
          <label>Endpoint</label>
          <select class="filter-select" id="api-endpoint" style="width:100%">
            ${endpoints.map(e => `<option value="${e.path}">${e.method} ${e.path} — ${e.desc}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group" style="flex:1;min-width:200px">
          <label>Paramètres (query string)</label>
          <input class="filter-input" id="api-params" placeholder="limit=5&gln=SN02583102G3" style="width:100%" />
        </div>
        <button class="btn btn-primary" onclick="runApiTest()">
          <i data-lucide="play" style="width:16px;height:16px"></i> Exécuter
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.25rem;">
      <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:0.75rem;">Endpoints disponibles</h3>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Méthode</th><th>Endpoint</th><th>Auth</th><th>Description</th><th>Paramètres</th></tr></thead>
          <tbody>
            ${endpoints.map(e => `
              <tr>
                <td><span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:700">${e.method}</span></td>
                <td style="font-family:monospace;font-size:0.82rem">${e.path}</td>
                <td>${e.auth ? '🔒' : '🌐'}</td>
                <td>${e.desc}</td>
                <td style="font-size:0.78rem;color:var(--text-muted)">${e.params || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div id="api-result" style="display:none" class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
        <h3 style="font-size:0.95rem;font-weight:700;">Résultat</h3>
        <div>
          <span id="api-time" style="font-size:0.78rem;color:var(--text-muted);margin-right:1rem"></span>
          <button class="btn btn-outline btn-sm" onclick="copyApiResult()">Copier</button>
        </div>
      </div>
      <pre id="api-output" style="background:var(--bg);padding:1rem;border-radius:8px;overflow-x:auto;font-size:0.8rem;max-height:400px;overflow-y:auto;line-height:1.5"></pre>
    </div>
  `;
  lucide.createIcons();
}

async function runApiTest() {
  const endpoint = document.getElementById('api-endpoint').value;
  const params = document.getElementById('api-params').value;
  const resultEl = document.getElementById('api-result');
  const outputEl = document.getElementById('api-output');
  const timeEl = document.getElementById('api-time');

  resultEl.style.display = 'block';
  outputEl.textContent = 'Chargement...';

  const url = API_BASE + endpoint + (params ? '?' + params : '');
  const t0 = performance.now();

  try {
    const res = await fetch(url, {
      headers: { 'X-Tracking-Api-Key': STATE.apiKey },
    });
    const t1 = performance.now();
    const data = await res.json();
    timeEl.textContent = `${Math.round(t1 - t0)}ms — HTTP ${res.status}`;
    outputEl.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    const t1 = performance.now();
    timeEl.textContent = `${Math.round(t1 - t0)}ms — Erreur`;
    outputEl.textContent = 'Erreur: ' + err.message;
  }
}

function copyApiResult() {
  const text = document.getElementById('api-output').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('Copié !'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: ORDERS (Order Lifecycle Tracking)
// ═══════════════════════════════════════════════════════════════════════════════

const LIFECYCLE_STEPS = [
  { key: 'ORDERED',   type: 'ORDERS',  label: 'Commande',    icon: '📋', color: '#3b82f6' },
  { key: 'CONFIRMED', type: 'ORDRSP',  label: 'Confirmée',   icon: '✅', color: '#8b5cf6' },
  { key: 'SHIPPED',   type: 'DESADV',  label: 'Expédiée',    icon: '🚚', color: '#f59e0b' },
  { key: 'RECEIVED',  type: 'RECADV',  label: 'Reçue',       icon: '📦', color: '#06b6d4' },
  { key: 'INVOICED',  type: 'INVOIC',  label: 'Facturée',    icon: '💰', color: '#10b981' },
  { key: 'COMPLETED', type: 'APERAK',  label: 'Clôturée',    icon: '🔔', color: '#059669' },
];

const LIFECYCLE_COLORS = {
  COMPLETED:   { bg: '#d1fae5', text: '#065f46', dot: '#059669' },
  INVOICED:    { bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
  RECEIVED:    { bg: '#cffafe', text: '#164e63', dot: '#06b6d4' },
  SHIPPED:     { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  CONFIRMED:   { bg: '#ede9fe', text: '#4c1d95', dot: '#8b5cf6' },
  ORDERED:     { bg: '#dbeafe', text: '#1e3a8a', dot: '#3b82f6' },
  ERROR:       { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
  IN_PROGRESS: { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
};

function lifecycleBadge(status) {
  const c = LIFECYCLE_COLORS[status] || LIFECYCLE_COLORS.IN_PROGRESS;
  return `<span class="badge-status" style="background:${c.bg};color:${c.text}">${status.replace('_',' ')}</span>`;
}

async function renderOrders(el) {
  el.innerHTML = `
    <div class="filters-bar" id="order-filters" style="margin-bottom:1rem">
      <div class="filter-group">
        <label>N° Commande</label>
        <input class="filter-input" id="of-ref" placeholder="Ex: PO-2026-001" style="width:160px" />
      </div>
      <div class="filter-group">
        <label>GLN Partenaire</label>
        <input class="filter-input" id="of-gln" placeholder="Ex: SN02583102G3" style="width:160px" />
      </div>
      <div class="filter-group">
        <label>Statut Cycle</label>
        <select class="filter-select" id="of-status">
          <option value="">Tous</option>
          <option>ORDERED</option><option>CONFIRMED</option><option>SHIPPED</option>
          <option>RECEIVED</option><option>INVOICED</option><option>COMPLETED</option>
          <option>ERROR</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Du</label>
        <input class="filter-input" type="date" id="of-from" />
      </div>
      <div class="filter-group">
        <label>Au</label>
        <input class="filter-input" type="date" id="of-to" />
      </div>
      <div class="filter-group" style="justify-content:flex-end">
        <label>&nbsp;</label>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm" onclick="loadOrders(1)">
            <i data-lucide="search" style="width:14px;height:14px"></i> Rechercher
          </button>
          <button class="btn btn-outline btn-sm" onclick="resetOrderFilters()">Réinitialiser</button>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:1rem;background:linear-gradient(135deg,#eff6ff,#e0f2fe);border:none">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="font-size:1.5rem">ℹ️</div>
        <div>
          <div style="font-weight:700;font-size:0.9rem">Comment fonctionne le suivi de commande ?</div>
          <div style="font-size:0.8rem;color:#475569;margin-top:2px">
            Chaque commande EDI passe par 6 étapes :
            <strong>ORDERS → ORDRSP → DESADV → RECADV → INVOIC → APERAK</strong>.
            Pour lier ces étapes, les nœuds EDI doivent inclure un champ <code>orderRef</code> (ou <code>header.order_ref</code>) lors de l'envoi au Hub.
          </div>
        </div>
      </div>
    </div>
    <div id="orders-table-container"><div class="spinner"></div></div>
  `;
  lucide.createIcons();
  loadOrders(1);
}

async function loadOrders(page) {
  const container = document.getElementById('orders-table-container');
  if (!container) return;
  container.innerHTML = '<div class="spinner"></div>';

  try {
    const params = {
      page,
      limit: 20,
      order_ref:        document.getElementById('of-ref')?.value || '',
      gln:              document.getElementById('of-gln')?.value || '',
      lifecycle_status: document.getElementById('of-status')?.value || '',
      from:             document.getElementById('of-from')?.value || '',
      to:               document.getElementById('of-to')?.value || '',
    };
    const res = await api('/orders', params);
    const { data, pagination } = res;

    if (data.length === 0) {
      container.innerHTML = `
        <div class="card empty-state">
          <div style="font-size:3rem;margin-bottom:1rem">📭</div>
          <p style="font-weight:600;font-size:0.95rem">Aucune commande trackée pour l'instant</p>
          <p style="margin-top:0.5rem;font-size:0.82rem">Les commandes apparaissent ici quand les nœuds EDI
          transmettent un champ <code>orderRef</code> avec leurs messages.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>N° Commande</th>
            <th>Acheteur</th>
            <th>Fournisseur</th>
            <th>Statut Cycle</th>
            <th>Progression</th>
            <th>Étapes</th>
            <th>Erreurs</th>
            <th>Date commande</th>
            <th>Dernière activité</th>
          </tr></thead>
          <tbody>
            ${data.map(o => renderOrderRow(o)).join('')}
          </tbody>
        </table>
        <div class="pagination">
          <span>Page ${pagination.page} / ${pagination.pages} — ${pagination.total} commande(s)</span>
          <div class="pagination-btns">
            <button ${pagination.page <= 1 ? 'disabled' : ''} onclick="loadOrders(${pagination.page - 1})">← Préc.</button>
            ${renderPageButtons(pagination)}
            <button ${pagination.page >= pagination.pages ? 'disabled' : ''} onclick="loadOrders(${pagination.page + 1})">Suiv. →</button>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erreur : ${escHtml(err.message)}</p></div>`;
  }
}

function renderOrderRow(o) {
  const steps = LIFECYCLE_STEPS;
  const progressPct = Math.round(
    (Object.values(o.steps_completed || {}).filter(Boolean).length / steps.length) * 100
  );
  const progressColor = o.has_errors ? '#ef4444' :
    progressPct === 100 ? '#10b981' :
    progressPct >= 50   ? '#f59e0b' : '#3b82f6';

  const stepDots = steps.map(s => {
    const key = s.key.toLowerCase();
    const remap = { ordered:'ordered', confirmed:'confirmed', shipped:'shipped',
                    received:'received', invoiced:'invoiced', completed:'acked' };
    const done = o.steps_completed?.[remap[key]] || false;
    const dotColor = done ? s.color : 'var(--border)';
    return `<span title="${s.label}" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColor};margin:0 1px"></span>`;
  }).join('');

  return `
    <tr onclick="showOrderDetail('${escHtml(o.order_ref)}')" style="cursor:pointer">
      <td style="font-family:monospace;font-weight:700">${escHtml(o.order_ref)}</td>
      <td style="font-size:0.82rem">${escHtml(o.buyer_gln || '—')}</td>
      <td style="font-size:0.82rem">${escHtml(o.supplier_gln || '—')}</td>
      <td>${lifecycleBadge(o.lifecycle_status)}</td>
      <td style="min-width:120px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;background:var(--border);height:6px;border-radius:3px;overflow:hidden">
            <div style="height:100%;background:${progressColor};width:${progressPct}%;transition:width 0.3s"></div>
          </div>
          <span style="font-size:0.75rem;font-weight:700;color:${progressColor}">${progressPct}%</span>
        </div>
      </td>
      <td>${stepDots}</td>
      <td>${o.has_errors ? `<span style="color:#ef4444;font-weight:700">${o.failed_steps} ✗</span>` : '<span style="color:#10b981">✓</span>'}</td>
      <td style="font-size:0.8rem">${fmtDate(o.order_date)}</td>
      <td style="font-size:0.8rem">${fmtDate(o.last_activity)}</td>
    </tr>
  `;
}

function resetOrderFilters() {
  ['of-ref','of-gln','of-status','of-from','of-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  loadOrders(1);
}

async function showOrderDetail(orderRef) {
  openDrawer(`Commande — ${orderRef}`, '<div class="spinner"></div>');
  try {
    const res = await api(`/orders/${encodeURIComponent(orderRef)}`);
    const o = res;

    const c = LIFECYCLE_COLORS[o.lifecycle_status] || LIFECYCLE_COLORS.IN_PROGRESS;

    const html = `
      <!-- Header -->
      <div style="background:${c.bg};border-radius:12px;padding:1rem;margin-bottom:1.5rem">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:0.72rem;color:${c.text};font-weight:700;text-transform:uppercase;letter-spacing:.05em">Référence Commande</div>
            <div style="font-size:1.1rem;font-family:monospace;font-weight:800;color:${c.text}">${escHtml(o.order_ref)}</div>
          </div>
          ${lifecycleBadge(o.lifecycle_status)}
        </div>
        <div style="display:flex;gap:1.5rem;margin-top:0.75rem;font-size:0.82rem;color:${c.text}">
          <div>🧑‍💼 Acheteur: <strong>${escHtml(o.buyer_gln || '—')}</strong></div>
          <div>🏭 Fournisseur: <strong>${escHtml(o.supplier_gln || '—')}</strong></div>
        </div>
        <!-- Progress bar -->
        <div style="margin-top:0.75rem">
          <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:${c.text};margin-bottom:4px">
            <span>Avancement</span><span>${o.completion_pct}%</span>
          </div>
          <div style="background:rgba(0,0,0,0.1);height:8px;border-radius:4px;overflow:hidden">
            <div style="height:100%;background:${c.dot};width:${o.completion_pct}%;transition:width 0.5s"></div>
          </div>
        </div>
      </div>

      <!-- Lifecycle pipeline -->
      <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:1rem">Pipeline de traitement</h4>
      <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.5rem">
        ${(o.lifecycle || []).map((step, idx) => {
          const stepBg = step.done ? '#d1fae5' : step.failed ? '#fee2e2' : 'var(--bg)';
          const stepBorder = step.done ? '#6ee7b7' : step.failed ? '#fca5a5' : 'var(--border)';
          const stepText = step.done ? '#065f46' : step.failed ? '#991b1b' : 'var(--text-muted)';
          const indicator = step.done ? '✅' : step.failed ? '❌' : step.pending ? '⬜' : '🔄';
          return `
            <div style="background:${stepBg};border:1px solid ${stepBorder};border-radius:10px;padding:0.75rem">
              <div style="display:flex;align-items:center;gap:0.75rem">
                <div style="font-size:1.25rem">${indicator}</div>
                <div style="flex:1">
                  <div style="font-weight:700;font-size:0.88rem;color:${stepText}">
                    ${step.icon} ${step.label}
                    <span style="font-weight:400;font-size:0.75rem;opacity:0.7;margin-left:6px">(${step.type})</span>
                  </div>
                  ${step.tx ? `
                    <div style="font-size:0.75rem;color:${stepText};margin-top:3px">
                      ${escHtml(step.tx.sender_gln)} → ${escHtml(step.tx.receiver_gln)}
                      &nbsp;·&nbsp; ${fmtDate(step.tx.created_at)}
                      ${step.tx.delivery_time_ms !== null ? `&nbsp;·&nbsp; ${fmtDuration(step.tx.delivery_time_ms)}` : ''}
                    </div>
                    ${step.tx.error ? `<div style="font-size:0.75rem;color:#dc2626;margin-top:2px">⚠ ${escHtml(step.tx.error)}</div>` : ''}
                  ` : `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px">En attente...</div>`}
                </div>
                ${step.tx ? `
                  <button class="btn-icon btn-sm" style="flex-shrink:0"
                    onclick="showTransactionDetail('${escHtml(step.tx.transaction_ref)}')" title="Voir transmission">
                    <i data-lucide="external-link" style="width:14px;height:14px"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- All raw transactions -->
      <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.75rem">
        Transmissions (${(o.transactions || []).length})
      </h4>
      <div class="timeline">
        ${(o.transactions || []).map(t => {
          const dotClass = t.status === 'DELIVERED' ? 'success' : t.status === 'FAILED' ? 'fail' : 'pending';
          return `
            <div class="timeline-item">
              <div class="timeline-dot ${dotClass}"></div>
              <div class="timeline-time">${fmtDate(t.created_at)}</div>
              <div class="timeline-title">${escHtml(t.document_type)} — ${statusBadge(t.status)}</div>
              <div class="timeline-desc">${escHtml(t.sender_gln)} → ${escHtml(t.receiver_gln)}
                ${t.error_message ? `<br><span style="color:#dc2626">${escHtml(t.error_message)}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    document.getElementById('drawer-body').innerHTML = html;
    lucide.createIcons();
  } catch (err) {
    document.getElementById('drawer-body').innerHTML =
      `<div class="empty-state"><p>Erreur: ${escHtml(err.message)}</p></div>`;
  }
}

// ─── Responsive detection ────────────────────────────────────────────────────
function checkResponsive() {
  const toggle = document.getElementById('menu-toggle');
  if (window.innerWidth <= 1024) {
    toggle.style.display = 'flex';
  } else {
    toggle.style.display = 'none';
    document.getElementById('sidebar').classList.remove('open');
  }
}
window.addEventListener('resize', checkResponsive);
checkResponsive();
