require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const caPath = path.join(__dirname, '../../ca.pem');
const sslConfig = fs.existsSync(caPath) ? { ssl: { ca: fs.readFileSync(caPath) } } : {};

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 1000
});

module.exports = pool;
