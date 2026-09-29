-- ===============================================================
-- SOLVIENT GROWTH ENTERPRISE DATABASE SCHEMA (POSTGRESQL / RAILWAY)
-- ===============================================================

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN', 'SUPER_ADMIN')),
    tier VARCHAR(30) NOT NULL DEFAULT 'Classic' CHECK (tier IN ('Classic', 'Silver', 'Gold', 'Platinum', 'Diamond')),
    balance BIGINT NOT NULL DEFAULT 0,
    points INT NOT NULL DEFAULT 0,
    total_spend BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    member_since INT NOT NULL DEFAULT 2026,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SESSIONS (AUTH TOKENS)
CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. BRANDS (Max 5 per customer, lock duration)
CREATE TABLE IF NOT EXISTS brands (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    username VARCHAR(100),
    locked_duration VARCHAR(30) CHECK (locked_duration IN ('satuan', 'trial', 'weekly', 'monthly')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    total_posts INT NOT NULL DEFAULT 0,
    used_posts INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ORDERS
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(150),
    brand_id VARCHAR(50) REFERENCES brands(id) ON DELETE SET NULL,
    brand_name VARCHAR(150),
    service VARCHAR(100) NOT NULL,
    service_id VARCHAR(50) NOT NULL,
    tier VARCHAR(30),
    duration VARCHAR(30) NOT NULL,
    post_count INT NOT NULL DEFAULT 1,
    platform VARCHAR(50) NOT NULL,
    target_url TEXT NOT NULL,
    notes TEXT,
    qty INT NOT NULL DEFAULT 1,
    price BIGINT NOT NULL DEFAULT 0,
    subtotal BIGINT NOT NULL DEFAULT 0,
    discount BIGINT NOT NULL DEFAULT 0,
    total BIGINT NOT NULL DEFAULT 0,
    points_earned INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'Active' CHECK (status IN ('Pending', 'Active', 'Completed', 'Cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TOP-UP REQUESTS
CREATE TABLE IF NOT EXISTS topups (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(150),
    amount BIGINT NOT NULL,
    bonus BIGINT NOT NULL DEFAULT 0,
    admin_fee BIGINT NOT NULL DEFAULT 0,
    total_received BIGINT NOT NULL,
    paid_amount BIGINT NOT NULL,
    method VARCHAR(50) NOT NULL DEFAULT 'QRIS',
    status VARCHAR(30) NOT NULL DEFAULT 'Menunggu Verifikasi' CHECK (status IN ('Menunggu Verifikasi', 'Disetujui', 'Ditolak')),
    rejection_reason TEXT,
    verified_by VARCHAR(150),
    verified_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. DOUBLE-ENTRY BALANCE LEDGER (AUDIT MUTASI SALDO MUTLAK)
CREATE TABLE IF NOT EXISTS balance_ledger (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
    category VARCHAR(30) NOT NULL CHECK (category IN ('TOPUP', 'ORDER', 'ADJUSTMENT', 'REFUND')),
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    description TEXT,
    ref_id VARCHAR(50),
    admin_id VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. POINTS REWARD LEDGER
CREATE TABLE IF NOT EXISTS points_ledger (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('EARN', 'REDEEM', 'BONUS', 'ADJUST')),
    amount INT NOT NULL,
    description TEXT,
    ref_id VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. AUDIT ACTIVITY LOGS (ADMIN ACTIONS)
CREATE TABLE IF NOT EXISTS activity_logs (
    id VARCHAR(50) PRIMARY KEY,
    admin_id VARCHAR(50) NOT NULL,
    admin_name VARCHAR(150) NOT NULL,
    admin_role VARCHAR(30) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_ref VARCHAR(100),
    amount BIGINT,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. LOGIN & SECURITY LOGS
CREATE TABLE IF NOT EXISTS login_logs (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    role VARCHAR(30),
    device VARCHAR(50),
    browser VARCHAR(50),
    ip_address VARCHAR(50),
    result VARCHAR(30) NOT NULL CHECK (result IN ('SUCCESS', 'FAILED', 'LOCKED', 'PASSWORD_RESET')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'info',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. WEBSITE CMS & SETTINGS
CREATE TABLE IF NOT EXISTS cms_content (
    key VARCHAR(100) PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===============================================================
-- SEED INITIAL DATA (MATCHING SCREENSHOT)
-- ===============================================================

-- Customer ACAD
INSERT INTO users (id, name, email, phone, password_hash, password_salt, role, tier, balance, points, total_spend, status)
VALUES (
    'SOL-4028', 'ACAD', 'acad@client.com', '081234567890',
    'f6f1c422c5e5f31899a19c3547b742514120300940173f45851411516e8b4cb3', 'salt_acad_123',
    'CUSTOMER', 'Classic', 25000, 120, 240000, 'ACTIVE'
) ON CONFLICT (id) DO NOTHING;

-- Customer SOL-6061
INSERT INTO users (id, name, email, phone, password_hash, password_salt, role, tier, balance, points, total_spend, status)
VALUES (
    'SOL-6061', 'SOL-6061 (Media Studio)', 'studio6061@client.com', '085799887766',
    'f6f1c422c5e5f31899a19c3547b742514120300940173f45851411516e8b4cb3', 'salt_sol_123',
    'CUSTOMER', 'Gold', 1070000, 1650, 1500000, 'ACTIVE'
) ON CONFLICT (id) DO NOTHING;

-- Brand TOLOL for ACAD
INSERT INTO brands (id, user_id, name, username, locked_duration, start_date, end_date, total_posts, used_posts, status)
VALUES (
    'BR-acad-1', 'SOL-4028', 'TOLOL', '@tololofficial', 'monthly',
    NOW() - INTERVAL '2 days', NOW() + INTERVAL '28 days', 30, 0, 'ACTIVE'
) ON CONFLICT (id) DO NOTHING;

-- Top-up Pending ACAD (TU-668876)
INSERT INTO topups (id, user_id, user_name, amount, bonus, admin_fee, total_received, paid_amount, method, status, created_at)
VALUES (
    'TU-668876', 'SOL-4028', 'ACAD', 25000, 0, 1000, 25000, 26000, 'QRIS', 'Menunggu Verifikasi', NOW() - INTERVAL '35 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Top-up Approved SOL-6061 (TU-818904 & TU-782296)
INSERT INTO topups (id, user_id, user_name, amount, bonus, admin_fee, total_received, paid_amount, method, status, verified_at, created_at)
VALUES 
(
    'TU-818904', 'SOL-6061', 'SOL-6061', 1000000, 70000, 0, 1070000, 1000000, 'QRIS', 'Disetujui', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '50 minutes'
),
(
    'TU-782296', 'SOL-6061', 'SOL-6061', 25000, 0, 1000, 25000, 26000, 'QRIS', 'Disetujui', NOW() - INTERVAL '52 minutes', NOW() - INTERVAL '55 minutes'
) ON CONFLICT (id) DO NOTHING;
