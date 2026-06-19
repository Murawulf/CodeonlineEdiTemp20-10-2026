const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dispatchRoutes = require('./routes/dispatch');
const trackingRoutes = require('./routes/tracking');

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Support large EANCOM files
app.use(bodyParser.urlencoded({ extended: true }));

// Dashboard — static SPA served from /dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Health Check — root redirects to dashboard
app.get('/', (req, res) => {
  res.json({
    service: 'Codeonline EDI Orchestrator',
    status: 'running',
    port: PORT,
    endpoints: {
      dashboard:    '/dashboard',
      orchestrator: '/api/orchestrator/*',
      tracking:     '/api/tracking/*  (mobile API — requires X-Tracking-Api-Key)',
    }
  });
});

// Routes
app.use('/api/orchestrator', dispatchRoutes);

// Mobile Tracking API
app.use('/api/tracking', trackingRoutes);

app.listen(PORT, () => {
  console.log(`[Hub] EDI Orchestrator running on port ${PORT}`);
  console.log(`[Hub] Tracking API available at /api/tracking`);
  console.log(`[Hub] Dashboard available at /dashboard`);
});
