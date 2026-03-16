const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dispatchRoutes = require('./routes/dispatch');

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Support large EANCOM files
app.use(bodyParser.urlencoded({ extended: true }));

// Health Check
app.get('/', (req, res) => {
  res.send('Codeonline EDI Orchestrator is Running');
});

// Routes
app.use('/api/orchestrator', dispatchRoutes);

// Alias for legacy or root-level access if needed (optional)
// app.use('/api', dispatchRoutes);

app.listen(PORT, () => {
  console.log(`[Hub] EDI Orchestrator running on port ${PORT}`);
});
