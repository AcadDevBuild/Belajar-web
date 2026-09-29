/**
 * SOLVIENT GROWTH - PRODUCTION BACKEND SERVER (RAILWAY READY)
 * Framework: Express.js + PostgreSQL Driver (pg)
 * Environment: Node.js 18+
 */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Helper to resolve Railway database connection string
function getConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.DATABASE_PUBLIC_URL) return process.env.DATABASE_PUBLIC_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  if (process.env.PGHOST) {
    const user = process.env.PGUSER || 'postgres';
    const pass = process.env.PGPASSWORD ? `:${process.env.PGPASSWORD}` : '';
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || 5432;
    const db = process.env.PGDATABASE || 'railway';
    return `postgresql://${user}${pass}@${host}:${port}/${db}`;
  }
  return null;
}

const dbUrl = getConnectionString();
const isProduction = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';

let pool = null;
if (dbUrl) {
  // If connecting to internal Railway domain (e.g. postgres.railway.internal), SSL is not needed
  const isInternal = dbUrl.includes('.railway.internal') || dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  pool = new Pool({
    connectionString: dbUrl,
    ssl: isInternal ? false : { rejectUnauthorized: false }
  });
}

// Helper: Secure Hashing
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`SG_SECURE_${s}_${password}`).digest('hex');
  return { salt: s, hash };
}

function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt);
  return hash === storedHash;
}

// ==========================================
// AUTO-INITIALIZE POSTGRESQL ON BOOT
// ==========================================
async function initDatabase() {
  if (!pool) {
    console.log('ℹ️ DATABASE_URL belum di-link di tab Variables.');
    console.log('👉 Cara hubungkan di Railway: Belajar-web -> tab Variables -> New Variable -> Add Reference -> DATABASE_URL (Postgres) -> Add.');
    return;
  }
  try {
    const client = await pool.connect();
    console.log('✅ Berhasil terhubung ke PostgreSQL Database di Railway!');

    // Check if tables exist, if not execute schema.sql
    const res = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      );
    `);

    if (!res.rows[0].exists) {
      console.log('📦 Menjalankan schema.sql untuk membuat tabel dan data awal...');
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await client.query(schemaSql);
      console.log('✅ Database tables dan seed data berhasil dibuat di PostgreSQL.');
    } else {
      console.log('✅ Tabel database sudah ada dan siap digunakan.');
    }
    client.release();
  } catch (err) {
    console.error('⚠️ Database connection error:', err.message);
  }
}
initDatabase();

// ==========================================
// API ROUTES
// ==========================================

// Guard: Check DB connection
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!pool) {
    return res.status(503).json({
      error: 'Database PostgreSQL belum dihubungkan di Railway.',
      hint: 'Buka service Belajar-web -> tab Variables -> Add Reference -> pilih DATABASE_URL (Postgres) -> klik Add.'
    });
  }
  next();
});

// Health Check
app.get('/api/health', async (req, res) => {
  if (!pool) {
    return res.json({ status: 'waiting_for_database', hint: 'Link DATABASE_URL in Variables tab' });
  }
  try {
    const dbRes = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', time: dbRes.rows[0].now, database: 'connected' });
  } catch (err) {
    res.json({ status: 'degraded', database: err.message });
  }
});

// 1. First Admin Setup Check
app.get('/api/admin/setup-status', async (req, res) => {
  try {
    const query = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'");
    const hasSuperAdmin = parseInt(query.rows[0].count) > 0;
    res.json({ locked: hasSuperAdmin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. First Admin Setup (Strictly Locked)
app.post('/api/admin/setup', async (req, res) => {
  try {
    const check = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'");
    if (parseInt(check.rows[0].count) > 0) {
      return res.status(403).json({ error: '403 Forbidden: Setup route is locked permanently.' });
    }

    const { name, email, phone, password } = req.body;
    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Data tidak lengkap atau password kurang dari 8 karakter.' });
    }

    const { salt, hash } = hashPassword(password);
    const adminId = 'ADM-' + Math.floor(1000 + Math.random() * 9000);

    await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, password_salt, role, tier, balance, points, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'SUPER_ADMIN', 'Diamond', 0, 0, 'ACTIVE')`,
      [adminId, name, email.toLowerCase(), phone, hash, salt]
    );

    await pool.query(
      `INSERT INTO activity_logs (id, admin_id, admin_name, admin_role, action, target_ref, details)
       VALUES ($1, $2, $3, 'SUPER_ADMIN', 'BOOTSTRAP_SUPER_ADMIN', $2, 'First SUPER_ADMIN created via setup route')`,
      ['ACT-' + Date.now(), adminId, name]
    );

    res.json({ success: true, message: 'Super admin created. Setup locked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. User & Admin Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password, isPortalAdmin } = req.body;
    const lower = (identifier || '').trim().toLowerCase();

    const userRes = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(name) = $1',
      [lower]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const user = userRes.rows[0];

    // Role Guard
    if (isPortalAdmin && user.role === 'CUSTOMER') {
      return res.status(403).json({ error: 'Akses ditolak: Akun pelanggan tidak memiliki izin administrator.' });
    }
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Akun Anda dinonaktifkan. Hubungi admin.' });
    }

    const match = verifyPassword(password, user.password_hash, user.password_salt);
    if (!match) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    // Create session token
    const token = 'sgtok_' + Date.now().toString(36) + '_' + crypto.randomBytes(12).toString('hex');
    const expiresAt = new Date(Date.now() + (isPortalAdmin ? 8 : 24) * 3600 * 1000);

    await pool.query(
      'INSERT INTO sessions (token, user_id, role, expires_at) VALUES ($1, $2, $3, $4)',
      [token, user.id, user.role, expiresAt]
    );

    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tier: user.tier,
        balance: user.balance,
        points: user.points
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Customer Registration (Strictly Role CUSTOMER)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Data registrasi tidak lengkap.' });
    }

    const lower = email.trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [lower]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email sudah terdaftar.' });
    }

    const { salt, hash } = hashPassword(password);
    const userId = 'SOL-' + Math.floor(1000 + Math.random() * 9000);

    await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, password_salt, role, tier, balance, points, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'CUSTOMER', 'Classic', 0, 50, 'ACTIVE')`,
      [userId, name, lower, phone, hash, salt]
    );

    // Welcome bonus in points ledger
    await pool.query(
      `INSERT INTO points_ledger (id, user_id, type, amount, description)
       VALUES ($1, $2, 'BONUS', 50, 'Bonus Pendaftar Baru')`,
      ['PT-' + Date.now(), userId]
    );

    res.json({ success: true, userId, message: 'Registrasi berhasil! +50 Poin' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Admin Dashboard Statistics
app.get('/api/admin/dashboard-stats', async (req, res) => {
  try {
    const custCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'CUSTOMER'");
    const activeCust = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'CUSTOMER' AND status = 'ACTIVE'");
    const pendingTopups = await pool.query("SELECT COUNT(*) FROM topups WHERE status = 'Menunggu Verifikasi'");
    const totalOrders = await pool.query("SELECT COUNT(*) FROM orders");
    const totalRevenue = await pool.query("SELECT COALESCE(SUM(paid_amount), 0) as rev FROM topups WHERE status = 'Disetujui'");
    const activeBrands = await pool.query("SELECT COUNT(*) FROM brands WHERE locked_duration IS NOT NULL");

    res.json({
      totalCustomers: parseInt(custCount.rows[0].count),
      activeCustomers: parseInt(activeCust.rows[0].count),
      pendingTopups: parseInt(pendingTopups.rows[0].count),
      totalOrders: parseInt(totalOrders.rows[0].count),
      totalRevenue: parseInt(totalRevenue.rows[0].rev),
      activeBrands: parseInt(activeBrands.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Top-Up Verification: Approve (ATOMIC TRANSACTION WITH BEGIN / COMMIT)
app.post('/api/admin/topups/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    const topupId = req.params.id;
    const { adminEmail, adminId, adminName, adminRole } = req.body;

    await client.query('BEGIN');

    // 1. Lock topup row for update
    const topupRes = await client.query('SELECT * FROM topups WHERE id = $1 FOR UPDATE', [topupId]);
    if (topupRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaksi topup tidak ditemukan.' });
    }

    const topup = topupRes.rows[0];
    if (topup.status !== 'Menunggu Verifikasi') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Transaksi sudah diproses sebelumnya (${topup.status}).` });
    }

    // 2. Lock user row & get current balance
    const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [topup.user_id]);
    const balanceBefore = parseInt(userRes.rows[0].balance || 0);
    const balanceAfter = balanceBefore + parseInt(topup.total_received);

    // 3. Update User Balance
    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [balanceAfter, topup.user_id]);

    // 4. Update Topup Status
    await client.query(
      `UPDATE topups SET status = 'Disetujui', verified_by = $1, verified_at = NOW() WHERE id = $2`,
      [adminEmail || 'admin', topupId]
    );

    // 5. Insert Balance Ledger (Audit Mutasi Saldo)
    await client.query(
      `INSERT INTO balance_ledger (id, user_id, type, category, amount, balance_before, balance_after, description, ref_id, admin_id)
       VALUES ($1, $2, 'CREDIT', 'TOPUP', $3, $4, $5, $6, $7, $8)`,
      [
        'TX-' + Date.now().toString(36).toUpperCase(),
        topup.user_id,
        topup.total_received,
        balanceBefore,
        balanceAfter,
        `Top-up approved (${topupId}) via ${topup.method}`,
        topupId,
        adminId || null
      ]
    );

    // 6. Insert Activity Log
    await client.query(
      `INSERT INTO activity_logs (id, admin_id, admin_name, admin_role, action, target_ref, amount, details)
       VALUES ($1, $2, $3, $4, 'APPROVE_TOPUP', $5, $6, $7)`,
      [
        'ACT-' + Date.now(),
        adminId || 'ADM',
        adminName || 'Admin',
        adminRole || 'ADMIN',
        topupId,
        topup.total_received,
        `Topup ${topupId} disetujui. Saldo: Rp ${balanceBefore} -> Rp ${balanceAfter}`
      ]
    );

    // 7. Insert Customer Notification
    await client.query(
      `INSERT INTO notifications (id, user_id, title, message, type)
       VALUES ($1, $2, 'Top-Up Saldo Berhasil! ✅', $3, 'success')`,
      [
        'NOTIF-' + Date.now(),
        topup.user_id,
        `Pembayaran top-up ${topupId} senilai Rp ${topup.total_received} telah disetujui dan masuk ke saldo Anda.`
      ]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: `Top-up ${topupId} disetujui!`, balanceAfter });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 7. Top-Up Verification: Reject
app.post('/api/admin/topups/:id/reject', async (req, res) => {
  try {
    const topupId = req.params.id;
    const { reason, adminEmail, adminId, adminName, adminRole } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Alasan penolakan wajib diisi.' });
    }

    const check = await pool.query('SELECT * FROM topups WHERE id = $1', [topupId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Top-up tidak ditemukan.' });

    const topup = check.rows[0];
    await pool.query(
      `UPDATE topups SET status = 'Ditolak', rejection_reason = $1, rejected_at = NOW(), verified_by = $2 WHERE id = $3`,
      [reason.trim(), adminEmail || 'admin', topupId]
    );

    await pool.query(
      `INSERT INTO activity_logs (id, admin_id, admin_name, admin_role, action, target_ref, details)
       VALUES ($1, $2, $3, $4, 'REJECT_TOPUP', $5, $6)`,
      ['ACT-' + Date.now(), adminId || 'ADM', adminName || 'Admin', adminRole || 'ADMIN', topupId, `Top-up ditolak. Alasan: ${reason}`]
    );

    await pool.query(
      `INSERT INTO notifications (id, user_id, title, message, type)
       VALUES ($1, $2, 'Top-Up Saldo Ditolak ❌', $3, 'error')`,
      ['NOTIF-' + Date.now(), topup.user_id, `Top-up ${topupId} ditolak. Alasan: ${reason}`]
    );

    res.json({ success: true, message: `Top-up ${topupId} ditolak.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server on primary PORT and fallback ports (0.0.0.0 binds to all network interfaces)
const http = require('http');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Solvient Growth Server running on port ${PORT}`);
  console.log(`📦 Railway Environment: ${process.env.RAILWAY_ENVIRONMENT || 'Local'}`);
});

// Resilient port listener: Also listen on port 3306 if Railway routed domain to 3306
if (String(PORT) !== '3306') {
  try {
    const s3306 = http.createServer(app);
    s3306.listen(3306, '0.0.0.0', () => {
      console.log('🚀 Also listening on port 3306 for Railway routing');
    });
    s3306.on('error', (err) => {
      console.log('Notice: Port 3306 fallback skipped (' + err.message + ')');
    });
  } catch (e) {}
}

// Resilient port listener: Also listen on port 3000 if PORT is set to something else
if (String(PORT) !== '3000') {
  try {
    const s3000 = http.createServer(app);
    s3000.listen(3000, '0.0.0.0', () => {
      console.log('🚀 Also listening on port 3000 for standard web routing');
    });
    s3000.on('error', (err) => {
      console.log('Notice: Port 3000 fallback skipped (' + err.message + ')');
    });
  } catch (e) {}
}
