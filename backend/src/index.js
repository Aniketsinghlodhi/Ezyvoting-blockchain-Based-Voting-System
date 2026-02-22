require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// CORS: whitelist frontend domains in production
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const PORT = process.env.PORT || 4000;

// Connect Mongo
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ezyvoting')
  .then(() => console.log('Mongo connected'))
  .catch(err => console.error('Mongo connection error', err));

// Simple route
app.get('/', (req, res) => res.json({ ok: true, name: 'EzyVoting Backend', version: '0.1.0' }));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Mount blockchain routes
const blockchainRouter = require('./routes/blockchain');
app.use('/api/blockchain', blockchainRouter);

// Mount auth routes
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
