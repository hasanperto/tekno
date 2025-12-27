import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/database.js';
import { authenticate, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Multer yapılandırması (blog için)
const blogStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const blogDir = path.join(process.cwd(), 'public', 'uploads', 'blog');
        if (!fs.existsSync(blogDir)) {
            fs.mkdirSync(blogDir, { recursive: true });
        }
        cb(null, blogDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'cover-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Multer yapılandırması (slider için)
const sliderStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const sliderDir = path.join(process.cwd(), 'public', 'uploads', 'slider');
        if (!fs.existsSync(sliderDir)) {
            fs.mkdirSync(sliderDir, { recursive: true });
        }
        cb(null, sliderDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'slider-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const sliderUpload = multer({ 
    storage: sliderStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'));
        }
    }
});

// Multer yapılandırması (references için)
const referenceStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const refDir = path.join(process.cwd(), 'public', 'uploads', 'references');
        if (!fs.existsSync(refDir)) {
            fs.mkdirSync(refDir, { recursive: true });
        }
        cb(null, refDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ref-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const referenceUpload = multer({ 
    storage: referenceStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'));
        }
    }
});

// Multer yapılandırması (sponsors için)
const sponsorStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const sponsorDir = path.join(process.cwd(), 'public', 'uploads', 'sponsors');
        if (!fs.existsSync(sponsorDir)) {
            fs.mkdirSync(sponsorDir, { recursive: true });
        }
        cb(null, sponsorDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'sponsor-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const sponsorUpload = multer({ 
    storage: sponsorStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'));
        }
    }
});

const blogUpload = multer({ 
    storage: blogStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'));
        }
    }
});

// Multer yapılandırması (projeler için)
const projectStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const tempDir = path.join(process.cwd(), 'public', 'uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const projectUpload = multer({ 
    storage: projectStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'));
        }
    }
});

// Tüm route'lar admin yetkisi gerektirir
router.use(authenticate);
router.use(isAdmin);

// Dashboard istatistikleri
router.get('/dashboard', async (req, res) => {
    try {
        const [users] = await pool.execute('SELECT COUNT(*) as total FROM users');
        const [projects] = await pool.execute('SELECT COUNT(*) as total FROM projects');
        const [orders] = await pool.execute('SELECT COUNT(*) as total FROM orders');
        const [revenue] = await pool.execute('SELECT SUM(final_amount) as total FROM orders WHERE payment_status = ?', ['paid']);

        res.json({
            users: users[0].total,
            projects: projects[0].total,
            orders: orders[0].total,
            revenue: revenue[0].total || 0
        });
    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcıları listele
router.get('/users', async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT u.*, ur.name as role_name, ur.slug as role_slug FROM users u LEFT JOIN user_roles ur ON u.role_id = ur.id ORDER BY u.created_at DESC'
        );
        res.json({ users });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Müşteri Yönetimi - Engellenen Kullanıcılar (ÖNEMLİ: /users/:id'den ÖNCE olmalı!)
router.get('/users/banned', async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT u.*, ur.name as role_name, ur.slug as role_slug 
             FROM users u 
             LEFT JOIN user_roles ur ON u.role_id = ur.id 
             WHERE u.status = ? 
             ORDER BY u.updated_at DESC`,
            ['banned']
        );
        
        console.log(`[Admin] Found ${users.length} banned users`);
        res.json({ users });
    } catch (error) {
        console.error('[Admin] Get banned users error:', error);
        console.error('[Admin] Error details:', {
            message: error.message,
            code: error.code,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        });
        res.status(500).json({ 
            error: 'Sunucu hatası',
            details: error.message 
        });
    }
});

// Müşteri Yönetimi - Rehber (ÖNEMLİ: /users/:id'den ÖNCE olmalı!)
router.get('/users/contacts', async (req, res) => {
    try {
        const { role, search } = req.query;
        
        // Önce user_contacts tablosundan verileri çek
        let contactsQuery = `
            SELECT 
                uc.*,
                'contact' as source_type,
                NULL as role_id,
                NULL as role_name,
                NULL as role_slug,
                NULL as username,
                NULL as status
            FROM user_contacts uc
            WHERE 1=1
        `;
        const contactsParams = [];
        
        if (search) {
            contactsQuery += ` AND (
                uc.name LIKE ? OR 
                uc.email LIKE ? OR 
                uc.phone LIKE ? OR 
                uc.notes LIKE ?
            )`;
            const searchPattern = `%${search}%`;
            contactsParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        
        contactsQuery += ' ORDER BY uc.created_at DESC';
        
        const [contacts] = await pool.execute(contactsQuery, contactsParams);
        
        // Şimdi users tablosundan verileri çek (rol bazlı)
        let usersQuery = `
            SELECT 
                u.id,
                u.username as name,
                u.email,
                u.phone,
                u.bio as notes,
                'user' as source_type,
                u.role_id,
                ur.name as role_name,
                ur.slug as role_slug,
                u.username,
                u.status,
                u.created_at
            FROM users u
            LEFT JOIN user_roles ur ON u.role_id = ur.id
            WHERE u.status = 'active'
        `;
        const usersParams = [];
        
        if (role && role !== 'all') {
            usersQuery += ` AND ur.slug = ?`;
            usersParams.push(role);
        }
        
        if (search) {
            usersQuery += ` AND (
                u.username LIKE ? OR 
                u.email LIKE ? OR 
                u.phone LIKE ? OR 
                u.first_name LIKE ? OR 
                u.last_name LIKE ? OR
                u.bio LIKE ?
            )`;
            const searchPattern = `%${search}%`;
            usersParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }
        
        usersQuery += ' ORDER BY u.created_at DESC';
        
        const [users] = await pool.execute(usersQuery, usersParams);
        
        // Her iki kaynağı birleştir
        const allContacts = [
            ...contacts.map(c => ({ ...c, is_contact: true })),
            ...users.map(u => ({ ...u, is_contact: false }))
        ];
        
        res.json({ contacts: allContacts });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            // Eğer user_contacts tablosu yoksa sadece users'ı döndür
            try {
                const { role, search } = req.query;
                let usersQuery = `
                    SELECT 
                        u.id,
                        u.username as name,
                        u.email,
                        u.phone,
                        u.bio as notes,
                        'user' as source_type,
                        u.role_id,
                        ur.name as role_name,
                        ur.slug as role_slug,
                        u.username,
                        u.status,
                        u.created_at
                    FROM users u
                    LEFT JOIN user_roles ur ON u.role_id = ur.id
                    WHERE u.status = 'active'
                `;
                const usersParams = [];
                
                if (role && role !== 'all') {
                    usersQuery += ` AND ur.slug = ?`;
                    usersParams.push(role);
                }
                
                if (search) {
                    usersQuery += ` AND (
                        u.username LIKE ? OR 
                        u.email LIKE ? OR 
                        u.phone LIKE ? OR 
                        u.first_name LIKE ? OR 
                        u.last_name LIKE ? OR
                        u.bio LIKE ?
                    )`;
                    const searchPattern = `%${search}%`;
                    usersParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
                }
                
                usersQuery += ' ORDER BY u.created_at DESC';
                const [users] = await pool.execute(usersQuery, usersParams);
                res.json({ contacts: users.map(u => ({ ...u, is_contact: false })) });
            } catch (err) {
                console.error('Get users error:', err);
                res.json({ contacts: [] });
            }
        } else {
            console.error('Get contacts error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.post('/users/contacts', async (req, res) => {
    try {
        const { name, email, phone, notes } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO user_contacts (name, email, phone, notes) VALUES (?, ?, ?, ?)',
            [name, email || null, phone || null, notes || null]
        );
        res.json({ message: 'İletişim eklendi', id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'user_contacts tablosu bulunamadı. Lütfen database_missing_tables.sql dosyasını çalıştırın.' });
        } else {
            console.error('Add contact error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.delete('/users/contacts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM user_contacts WHERE id = ?', [id]);
        res.json({ message: 'İletişim silindi' });
    } catch (error) {
        console.error('Delete contact error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Müşteri Yönetimi - Toplu E-Mail (ÖNEMLİ: /users/:id'den ÖNCE olmalı!)
router.post('/users/bulk-email', async (req, res) => {
    try {
        const { subject, message, userFilter, roleId, sendToContacts } = req.body;
        // Bu endpoint gerçek e-posta gönderimi için entegre edilmeli
        // Şimdilik sadece başarı mesajı döndürüyoruz
        res.json({ message: 'E-posta gönderildi', sent_count: 0 });
    } catch (error) {
        console.error('Bulk email error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Müşteri Yönetimi - Toplu SMS (ÖNEMLİ: /users/:id'den ÖNCE olmalı!)
router.post('/users/bulk-sms', async (req, res) => {
    try {
        const { message, userFilter, roleId, sendToContacts } = req.body;
        // Bu endpoint gerçek SMS gönderimi için entegre edilmeli
        res.json({ message: 'SMS gönderildi', sent_count: 0 });
    } catch (error) {
        console.error('Bulk SMS error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Müşteri Yönetimi - Bildirim Şablonları (ÖNEMLİ: /users/:id'den ÖNCE olmalı!)
router.get('/users/notification-templates', async (req, res) => {
    try {
        const [templates] = await pool.execute('SELECT * FROM notification_templates ORDER BY created_at DESC');
        res.json({ templates });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json({ templates: [] });
        } else {
            console.error('Get templates error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.post('/users/notification-templates', async (req, res) => {
    try {
        const { name, type, subject, body } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO notification_templates (name, type, subject, body) VALUES (?, ?, ?, ?)',
            [name, type, subject || null, body]
        );
        res.json({ message: 'Şablon eklendi', id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'notification_templates tablosu bulunamadı. Lütfen database_missing_tables.sql dosyasını çalıştırın.' });
        } else {
            console.error('Add template error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.put('/users/notification-templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, subject, body } = req.body;
        await pool.execute(
            'UPDATE notification_templates SET name = ?, type = ?, subject = ?, body = ? WHERE id = ?',
            [name, type, subject || null, body, id]
        );
        res.json({ message: 'Şablon güncellendi' });
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.delete('/users/notification-templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM notification_templates WHERE id = ?', [id]);
        res.json({ message: 'Şablon silindi' });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı detayı getir (GENEL ROUTE - EN SONDA OLMALI!)
router.get('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [users] = await pool.execute(
            'SELECT u.*, ur.name as role_name, ur.slug as role_slug FROM users u LEFT JOIN user_roles ur ON u.role_id = ur.id WHERE u.id = ?',
            [id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        res.json({ user: users[0] });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı projeleri
router.get('/users/:id/projects', async (req, res) => {
    try {
        const { id } = req.params;
        const [projects] = await pool.execute(
            `SELECT p.*, c.name as category_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.project_id = p.id) as sales_count,
             (SELECT SUM(oi.price) FROM order_items oi WHERE oi.project_id = p.id) as total_revenue
             FROM projects p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.user_id = ?
             ORDER BY p.created_at DESC`,
            [id]
        );
        res.json({ projects });
    } catch (error) {
        console.error('Get user projects error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı siparişleri
router.get('/users/:id/orders', async (req, res) => {
    try {
        const { id } = req.params;
        const [orders] = await pool.execute(
            `SELECT o.*, 
             COUNT(oi.id) as item_count,
             GROUP_CONCAT(p.title SEPARATOR ', ') as project_titles
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN projects p ON oi.project_id = p.id
             WHERE o.user_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [id]
        );
        res.json({ orders });
    } catch (error) {
        console.error('Get user orders error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı satışları (seller ise)
router.get('/users/:id/sales', async (req, res) => {
    try {
        const { id } = req.params;
        const [sales] = await pool.execute(
            `SELECT oi.*, o.order_number, o.created_at as order_date, o.order_status,
             p.title as project_title, p.slug as project_slug,
             u.username as buyer_username, u.email as buyer_email
             FROM order_items oi
             INNER JOIN orders o ON oi.order_id = o.id
             INNER JOIN projects p ON oi.project_id = p.id
             INNER JOIN users u ON o.user_id = u.id
             WHERE p.user_id = ?
             ORDER BY o.created_at DESC`,
            [id]
        );
        res.json({ sales });
    } catch (error) {
        console.error('Get user sales error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı işlemleri
router.get('/users/:id/transactions', async (req, res) => {
    try {
        const { id } = req.params;
        const [transactions] = await pool.execute(
            `SELECT t.*, 
             o.order_number,
             GROUP_CONCAT(DISTINCT p.title) as project_titles
             FROM transactions t
             LEFT JOIN orders o ON t.order_id = o.id
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN projects p ON oi.project_id = p.id
             WHERE t.user_id = ?
             GROUP BY t.id
             ORDER BY t.created_at DESC
             LIMIT 100`,
            [id]
        );
        res.json({ transactions });
    } catch (error) {
        console.error('Get user transactions error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı istatistikleri
router.get('/users/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Proje istatistikleri
        const [projectStats] = await pool.execute(
            `SELECT 
             COUNT(*) as total_projects,
             SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_projects,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_projects,
             SUM(views) as total_views,
             SUM(downloads) as total_downloads
             FROM projects WHERE user_id = ?`,
            [id]
        );

        // Sipariş istatistikleri
        const [orderStats] = await pool.execute(
            `SELECT 
             COUNT(*) as total_orders,
             SUM(final_amount) as total_spent,
             SUM(CASE WHEN order_status = 'completed' THEN final_amount ELSE 0 END) as completed_orders_total
             FROM orders WHERE user_id = ?`,
            [id]
        );

        // Satış istatistikleri (seller ise)
        const [salesStats] = await pool.execute(
            `SELECT 
             COUNT(DISTINCT oi.order_id) as total_sales,
             SUM(oi.price) as total_revenue,
             SUM(oi.commission_amount) as total_commission
             FROM order_items oi
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ?`,
            [id]
        );

        // İşlem istatistikleri
        const [transactionStats] = await pool.execute(
            `SELECT 
             COUNT(*) as total_transactions,
             SUM(CASE WHEN type = 'purchase' AND status = 'completed' THEN amount ELSE 0 END) as total_spent,
             SUM(CASE WHEN type IN ('sale', 'commission') AND status = 'completed' THEN amount ELSE 0 END) as total_earned,
             SUM(CASE WHEN type = 'donation' AND status = 'completed' THEN amount ELSE 0 END) as total_donated
             FROM transactions WHERE user_id = ?`,
            [id]
        );

        res.json({
            projects: projectStats[0] || {},
            orders: orderStats[0] || {},
            sales: salesStats[0] || {},
            transactions: transactionStats[0] || {}
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı güncelle
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            username, email, first_name, last_name, phone, role_id, status,
            balance, bio, website, location, email_verified, two_factor_enabled
        } = req.body;

        // Önce mevcut kullanıcıyı kontrol et
        const [existing] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        // Güncelleme sorgusu - sadece gönderilen alanları güncelle
        const updateFields = [];
        const updateValues = [];

        if (username !== undefined) { updateFields.push('username = ?'); updateValues.push(username); }
        if (email !== undefined) { updateFields.push('email = ?'); updateValues.push(email); }
        if (first_name !== undefined) { updateFields.push('first_name = ?'); updateValues.push(first_name || null); }
        if (last_name !== undefined) { updateFields.push('last_name = ?'); updateValues.push(last_name || null); }
        if (phone !== undefined) { updateFields.push('phone = ?'); updateValues.push(phone || null); }
        if (role_id !== undefined) { updateFields.push('role_id = ?'); updateValues.push(role_id); }
        if (status !== undefined) { updateFields.push('status = ?'); updateValues.push(status); }
        if (balance !== undefined) { updateFields.push('balance = ?'); updateValues.push(balance); }
        if (bio !== undefined) { updateFields.push('bio = ?'); updateValues.push(bio || null); }
        if (website !== undefined) { updateFields.push('website = ?'); updateValues.push(website || null); }
        if (location !== undefined) { updateFields.push('location = ?'); updateValues.push(location || null); }
        if (email_verified !== undefined) { updateFields.push('email_verified = ?'); updateValues.push(email_verified ? 1 : 0); }
        if (two_factor_enabled !== undefined) { updateFields.push('two_factor_enabled = ?'); updateValues.push(two_factor_enabled ? 1 : 0); }
        if (req.body.ban_note !== undefined) { updateFields.push('ban_note = ?'); updateValues.push(req.body.ban_note || null); }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan bulunamadı' });
        }

        updateValues.push(id);
        const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        
        await pool.execute(query, updateValues);
        res.json({ message: 'Kullanıcı güncellendi' });
    } catch (error) {
        console.error('Update user error:', error);
        console.error('Update user error details:', {
            message: error.message,
            code: error.code,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage,
            query: query,
            values: updateValues
        });
        res.status(500).json({ 
            error: 'Sunucu hatası',
            details: error.message,
            code: error.code
        });
    }
});

// Kullanıcı sil
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Önce kullanıcının admin olup olmadığını kontrol et
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        // Admin kullanıcıları silinemez (güvenlik)
        const [roles] = await pool.execute('SELECT slug FROM user_roles WHERE id = ?', [users[0].role_id]);
        if (roles.length > 0 && roles[0].slug === 'admin') {
            return res.status(400).json({ error: 'Admin kullanıcıları silinemez' });
        }
        await pool.execute('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'Kullanıcı silindi' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı durumu güncelle
router.put('/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await pool.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'Kullanıcı durumu güncellendi' });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Projeleri listele (onay bekleyenler dahil)
router.get('/projects', async (req, res) => {
    try {
        const [projects] = await pool.execute(
            `SELECT p.*, u.username, c.name as category_name
             FROM projects p
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN categories c ON p.category_id = c.id
             ORDER BY p.created_at DESC`
        );
        res.json({ projects });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Proje onayla/reddet
router.put('/projects/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'approved' veya 'rejected'

        await pool.execute('UPDATE projects SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'Proje durumu güncellendi' });
    } catch (error) {
        console.error('Update project status error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Proje detayı (Admin - tüm projeleri görebilir)
router.get('/projects/:id', async (req, res) => {
    try {
        const projectId = req.params.id;

        // Proje bilgilerini getir
        const [projects] = await pool.execute(
            `SELECT p.*, u.username, c.name as category_name
             FROM projects p
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = ?`,
            [projectId]
        );

        if (projects.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı' });
        }

        const project = projects[0];

        // Proje görsellerini getir
        let images = [];
        try {
            const [imageRows] = await pool.execute(
                'SELECT id, image_path, is_primary, sort_order FROM project_images WHERE project_id = ? ORDER BY is_primary DESC, sort_order ASC',
                [projectId]
            );
            images = imageRows.map(img => {
                let imagePath = img.image_path;
                // Eğer zaten /uploads/ ile başlıyorsa olduğu gibi döndür
                if (imagePath && !imagePath.startsWith('/uploads/') && !imagePath.startsWith('http')) {
                    imagePath = `/uploads/${imagePath}`;
                }
                return {
                    id: img.id,
                    image_path: imagePath,
                    is_primary: img.is_primary,
                    sort_order: img.sort_order
                };
            });
        } catch (err) {
            console.warn('Project images not available:', err.message);
        }

        // Proje etiketlerini getir
        let tags = [];
        try {
            const [tagRows] = await pool.execute(
                `SELECT t.id, t.name, t.slug 
                 FROM tags t
                 INNER JOIN project_tags pt ON t.id = pt.tag_id
                 WHERE pt.project_id = ?`,
                [projectId]
            );
            tags = tagRows;
        } catch (err) {
            console.warn('Project tags not available:', err.message);
        }

        // Çok dilli içerikleri getir
        let translations = {};
        try {
            const [translationRows] = await pool.execute(
                `SELECT language_code, title, description, short_description 
                 FROM content_translations 
                 WHERE content_id = ? AND content_type = 'project'`,
                [projectId]
            );
            translationRows.forEach(t => {
                translations[t.language_code] = {
                    title: t.title,
                    description: t.description,
                    short_description: t.short_description
                };
            });
        } catch (err) {
            console.warn('Content translations not available:', err.message);
        }

        // Primary image URL'ini düzelt
        if (images.length > 0) {
            const primaryImg = images.find(img => img.is_primary === 1);
            project.primary_image = primaryImg ? primaryImg.image_path : images[0].image_path;
        }

        res.json({
            project: {
                ...project,
                images,
                tags,
                translations
            }
        });
    } catch (error) {
        console.error('Get project detail error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Proje güncelle (Admin - tüm projeleri düzenleyebilir)
router.put('/projects/:id', projectUpload.fields([
    { name: 'primary_image', maxCount: 1 },
    { name: 'gallery_images', maxCount: 20 }
]), async (req, res) => {
    try {
        const projectId = req.params.id;
        const isFormData = req.headers['content-type']?.includes('multipart/form-data');
        
        let projectData = {};
        if (isFormData) {
            projectData = {
                title_tr: req.body.title_tr || '',
                short_description_tr: req.body.short_description_tr || '',
                description_tr: req.body.description_tr || '',
                title_en: req.body.title_en || '',
                short_description_en: req.body.short_description_en || '',
                description_en: req.body.description_en || '',
                title_de: req.body.title_de || '',
                short_description_de: req.body.short_description_de || '',
                description_de: req.body.description_de || '',
                category_id: req.body.category_id || '',
                price: req.body.price || '',
                discount_price: req.body.discount_price || '',
                currency: req.body.currency || 'TRY',
                tags: req.body.tags || '',
                status: req.body.status || 'pending',
                is_active: req.body.is_active,
                primary_image_index: req.body.primary_image_index || null,
                deleted_image_ids: req.body.deleted_image_ids || '',
                demo_url: req.body.demo_url || '',
                admin_demo_url: req.body.admin_demo_url || '',
                demo_username: req.body.demo_username || '',
                demo_password: req.body.demo_password || '',
                admin_username: req.body.admin_username || '',
                admin_password: req.body.admin_password || '',
                video_url: req.body.video_url || '',
                license_type: req.body.license_type || '',
                requirements: req.body.requirements || '',
                version: req.body.version || '1.0.0'
            };
        } else {
            projectData = req.body;
        }

        // Projenin varlığını kontrol et (admin tüm projeleri düzenleyebilir)
        const [existing] = await pool.execute(
            'SELECT id FROM projects WHERE id = ?',
            [projectId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı' });
        }

        // Seller endpoint'indeki güncelleme mantığını kullan
        // (Aynı kod, sadece user_id kontrolü yok)
        const { 
            title, title_tr, title_en, title_de,
            description, description_tr, description_en, description_de,
            short_description, short_description_tr, short_description_en, short_description_de,
            category_id, price, discount_price, currency, tags, status, is_active,
            demo_url, admin_demo_url, demo_username, demo_password,
            admin_username, admin_password, video_url, license_type, requirements, version
        } = projectData;

        const updates = [];
        const values = [];

        const finalTitle = title_tr || title;
        if (finalTitle !== undefined) {
            updates.push('title = ?');
            values.push(finalTitle);
            const slug = finalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            updates.push('slug = ?');
            values.push(slug);
        }
        
        const finalDescription = description_tr || description;
        if (finalDescription !== undefined) {
            updates.push('description = ?');
            values.push(finalDescription);
        }
        
        const finalShortDescription = short_description_tr || short_description;
        if (finalShortDescription !== undefined) {
            updates.push('short_description = ?');
            values.push(finalShortDescription);
        }
        if (category_id !== undefined) {
            updates.push('category_id = ?');
            values.push(category_id);
        }
        if (price !== undefined) {
            updates.push('price = ?');
            values.push(price);
        }
        if (discount_price !== undefined) {
            updates.push('discount_price = ?');
            values.push(discount_price);
        }
        if (currency !== undefined) {
            updates.push('currency = ?');
            values.push(currency);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        // is_active güncellemesi
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            const isActiveValue = typeof is_active === 'string' 
                ? (is_active === '1' || is_active === 'true' || is_active.toLowerCase() === 'true')
                : Boolean(is_active);
            values.push(isActiveValue ? 1 : 0);
        }
        if (demo_url !== undefined) {
            updates.push('demo_url = ?');
            values.push(demo_url || null);
        }
        if (admin_demo_url !== undefined) {
            updates.push('admin_demo_url = ?');
            values.push(admin_demo_url || null);
        }
        if (demo_username !== undefined) {
            updates.push('demo_username = ?');
            values.push(demo_username || null);
        }
        if (demo_password !== undefined) {
            updates.push('demo_password = ?');
            values.push(demo_password || null);
        }
        if (admin_username !== undefined) {
            updates.push('admin_username = ?');
            values.push(admin_username || null);
        }
        if (admin_password !== undefined) {
            updates.push('admin_password = ?');
            values.push(admin_password || null);
        }
        if (video_url !== undefined) {
            updates.push('video_url = ?');
            values.push(video_url || null);
        }
        if (license_type !== undefined) {
            updates.push('license_type = ?');
            values.push(license_type || null);
        }
        if (requirements !== undefined) {
            updates.push('requirements = ?');
            values.push(requirements || null);
        }
        if (version !== undefined) {
            updates.push('version = ?');
            values.push(version || '1.0.0');
        }

        // Eğer hiçbir alan güncellenmiyorsa ama resim yükleme varsa devam et
        if (updates.length === 0 && (!req.files || (!req.files.primary_image && (!req.files.gallery_images || req.files.gallery_images.length === 0)))) {
            return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi' });
        }

        // Eğer güncellenecek alan varsa UPDATE sorgusu çalıştır
        if (updates.length > 0) {
            updates.push('updated_at = NOW()');
            values.push(projectId);

            await pool.execute(
                `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
                values
            );
        }

        // Tags güncellemesi
        if (tags !== undefined) {
            await pool.execute('DELETE FROM project_tags WHERE project_id = ?', [projectId]);
            
            if (tags) {
                let tagNames = [];
                if (typeof tags === 'string') {
                    tagNames = tags.split(',').map(t => t.trim()).filter(t => t);
                } else if (Array.isArray(tags)) {
                    tagNames = tags;
                }
                
                for (const tagName of tagNames) {
                    if (!tagName) continue;
                    
                    const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    
                    const [existingTags] = await pool.execute(
                        'SELECT id FROM tags WHERE slug = ?',
                        [tagSlug]
                    );
                    
                    let tagId;
                    if (existingTags.length > 0) {
                        tagId = existingTags[0].id;
                    } else {
                        const [newTag] = await pool.execute(
                            'INSERT INTO tags (name, slug) VALUES (?, ?)',
                            [tagName, tagSlug]
                        );
                        tagId = newTag.insertId;
                    }
                    
                    await pool.execute(
                        `INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)`,
                        [projectId, tagId]
                    );
                }
            }
        }

        // Silinen resimleri sil
        if (projectData.deleted_image_ids) {
            const deletedIds = typeof projectData.deleted_image_ids === 'string' 
                ? projectData.deleted_image_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
                : Array.isArray(projectData.deleted_image_ids) 
                    ? projectData.deleted_image_ids.map(id => parseInt(id)).filter(id => !isNaN(id))
                    : [];
            
            if (deletedIds.length > 0) {
                // Placeholder'ları dinamik oluştur
                const placeholders = deletedIds.map(() => '?').join(',');
                
                // Önce silinecek resimlerin dosya yollarını al
                const [imagesToDelete] = await pool.execute(
                    `SELECT image_path FROM project_images WHERE id IN (${placeholders}) AND project_id = ?`,
                    [...deletedIds, projectId]
                );
                
                // Veritabanından sil
                await pool.execute(
                    `DELETE FROM project_images WHERE id IN (${placeholders}) AND project_id = ?`,
                    [...deletedIds, projectId]
                );
                
                // Dosyaları da sil
                const fsPromises = fs.promises;
                for (const img of imagesToDelete) {
                    try {
                        const filePath = path.join(process.cwd(), 'public', 'uploads', img.image_path);
                        if (fs.existsSync(filePath)) {
                            await fsPromises.unlink(filePath);
                        }
                    } catch (err) {
                        console.warn(`Failed to delete image file: ${img.image_path}`, err.message);
                    }
                }
            }
        }

        // Çok dilli içerikleri güncelle
        if (title_tr || description_tr || short_description_tr) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'project', 'tr', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [projectId, title_tr || title, description_tr || description, short_description_tr || short_description,
                 title_tr || title, description_tr || description, short_description_tr || short_description]
            );
        }

        if (title_en || description_en || short_description_en) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'project', 'en', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [projectId, title_en, description_en, short_description_en,
                 title_en, description_en, short_description_en]
            );
        }

        if (title_de || description_de || short_description_de) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'project', 'de', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [projectId, title_de, description_de, short_description_de,
                 title_de, description_de, short_description_de]
            );
        }

        // Resim yükleme işlemleri (yeni resimler varsa)
        if (req.files) {
            const fsPromises = fs.promises;
            const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'projects');
            
            // Upload dizinini oluştur
            await fsPromises.mkdir(uploadDir, { recursive: true });

            // Primary image
            const primaryFile = req.files.primary_image ? 
                (Array.isArray(req.files.primary_image) ? req.files.primary_image[0] : req.files.primary_image) : null;

            // Galeri resimleri
            const galleryFiles = req.files.gallery_images ? 
                (Array.isArray(req.files.gallery_images) ? req.files.gallery_images : [req.files.gallery_images]) : [];

            // Mevcut resimlerin sort_order'ını al
            const [existingImages] = await pool.execute(
                'SELECT MAX(sort_order) as max_order FROM project_images WHERE project_id = ?',
                [projectId]
            );
            let sortOrder = (existingImages[0]?.max_order || 0) + 1;

            // Primary image'i yükle
            if (primaryFile) {
                // Önce mevcut primary image'i kaldır
                await pool.execute(
                    'UPDATE project_images SET is_primary = 0 WHERE project_id = ?',
                    [projectId]
                );

                const primaryExt = path.extname(primaryFile.originalname);
                const primaryFileName = `primary_${projectId}_${Date.now()}${primaryExt}`;
                const primaryFilePath = path.join(uploadDir, primaryFileName);
                await fsPromises.rename(primaryFile.path, primaryFilePath);
                
                const relativePath = `projects/${primaryFileName}`;
                await pool.execute(
                    `INSERT INTO project_images (project_id, image_path, is_primary, sort_order) VALUES (?, ?, 1, ?)`,
                    [projectId, relativePath, sortOrder++]
                );
            }

            // Galeri resimlerini yükle
            for (const file of galleryFiles) {
                const ext = path.extname(file.originalname);
                const fileName = `gallery_${projectId}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
                const filePath = path.join(uploadDir, fileName);
                await fsPromises.rename(file.path, filePath);
                
                const relativePath = `projects/${fileName}`;
                await pool.execute(
                    `INSERT INTO project_images (project_id, image_path, is_primary, sort_order) VALUES (?, ?, 0, ?)`,
                    [projectId, relativePath, sortOrder++]
                );
            }

            // Mevcut resimlerden vitrin resmi değiştirme (primary_image_index varsa)
            if (projectData.primary_image_index !== null && projectData.primary_image_index !== undefined && !primaryFile) {
                const primaryIndex = parseInt(projectData.primary_image_index);
                const [allImages] = await pool.execute(
                    'SELECT id FROM project_images WHERE project_id = ? ORDER BY is_primary DESC, sort_order ASC',
                    [projectId]
                );
                
                if (allImages[primaryIndex]) {
                    // Önce tüm resimlerin is_primary'ini 0 yap
                    await pool.execute(
                        'UPDATE project_images SET is_primary = 0 WHERE project_id = ?',
                        [projectId]
                    );
                    
                    // Seçilen resmi primary yap
                    await pool.execute(
                        'UPDATE project_images SET is_primary = 1 WHERE id = ?',
                        [allImages[primaryIndex].id]
                    );
                }
            }
        }

        res.json({ message: 'Proje güncellendi' });
    } catch (error) {
        console.error('Update project error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            projectId: req.params.id,
            body: req.body
        });
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Proje sil (Admin)
router.delete('/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Projenin varlığını kontrol et
        const [projects] = await pool.execute('SELECT id FROM projects WHERE id = ?', [id]);
        if (projects.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı' });
        }

        // İlişkili kayıtları önce sil (CASCADE yoksa)
        try {
            // RESTRICT olan tabloları önce kontrol et ve NULL yap
            // Order items (RESTRICT - sipariş kayıtlarını korumak için NULL yap)
            await pool.execute('UPDATE order_items SET project_id = NULL WHERE project_id = ?', [id]);
            
            // Sales orders (RESTRICT - sipariş kayıtlarını korumak için NULL yap)
            await pool.execute('UPDATE sales_orders SET product_id = NULL WHERE product_id = ?', [id]);
            
            // Quote requests (varsa)
            try {
                await pool.execute('DELETE FROM quote_requests WHERE project_id = ?', [id]);
            } catch (e) {
                console.warn('quote_requests table may not exist:', e.message);
            }
            
            // CASCADE olan tablolar (otomatik silinecek ama manuel de silebiliriz)
            // Project images
            await pool.execute('DELETE FROM project_images WHERE project_id = ?', [id]);
            // Project tags
            await pool.execute('DELETE FROM project_tags WHERE project_id = ?', [id]);
            // Reviews
            await pool.execute('DELETE FROM reviews WHERE project_id = ?', [id]);
            // Donations
            await pool.execute('DELETE FROM donations WHERE project_id = ?', [id]);
            // Project donations (eğer ayrı tablo varsa)
            try {
                await pool.execute('DELETE FROM project_donations WHERE project_id = ?', [id]);
            } catch (e) {
                console.warn('project_donations table may not exist:', e.message);
            }
            // Favorites
            await pool.execute('DELETE FROM favorites WHERE project_id = ?', [id]);
            // Downloads
            try {
                await pool.execute('DELETE FROM downloads WHERE project_id = ?', [id]);
            } catch (e) {
                console.warn('downloads table may not exist:', e.message);
            }
            // User accesses
            try {
                await pool.execute('DELETE FROM user_accesses WHERE product_id = ?', [id]);
            } catch (e) {
                console.warn('user_accesses table may not exist:', e.message);
            }
            // Product packages
            try {
                await pool.execute('DELETE FROM product_packages WHERE product_id = ?', [id]);
            } catch (e) {
                console.warn('product_packages table may not exist:', e.message);
            }
            // Content translations
            await pool.execute('DELETE FROM content_translations WHERE content_id = ? AND content_type = ?', [id, 'project']);
            // Project files
            try {
                await pool.execute('DELETE FROM project_files WHERE project_id = ?', [id]);
            } catch (e) {
                console.warn('project_files table may not exist:', e.message);
            }
        } catch (relError) {
            console.warn('Error deleting related records (continuing):', relError.message);
            // Devam et, ana projeyi silmeye çalış
        }

        // Projeyi sil
        await pool.execute('DELETE FROM projects WHERE id = ?', [id]);
        
        res.json({ message: 'Proje silindi' });
    } catch (error) {
        console.error('Delete project error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error sqlState:', error.sqlState);
        
        // Foreign key constraint hatası
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED' || error.sqlState === '23000') {
            return res.status(400).json({ 
                error: 'Proje silinemiyor',
                details: 'Bu proje başka kayıtlarla ilişkili (sipariş, yorum vb.). Önce ilişkili kayıtları silin.'
            });
        }
        
        res.status(500).json({ 
            error: 'Sunucu hatası',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Proje silinirken bir hata oluştu'
        });
    }
});

// Dil Yönetimi
router.get('/languages', async (req, res) => {
    try {
        const [languages] = await pool.execute(
            'SELECT * FROM languages ORDER BY sort_order ASC, name ASC'
        );
        res.json({ languages });
    } catch (error) {
        console.error('Get languages error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/languages', async (req, res) => {
    try {
        const { code, name, native_name, rtl, is_default, status, sort_order } = req.body;
        
        // Eğer varsayılan dil seçildiyse, diğer dilleri varsayılan yapma
        if (is_default) {
            await pool.execute('UPDATE languages SET is_default = 0');
        }
        
        await pool.execute(
            'INSERT INTO languages (code, name, native_name, rtl, is_default, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [code, name, native_name, rtl ? 1 : 0, is_default ? 1 : 0, status, sort_order || 0]
        );
        res.json({ message: 'Dil eklendi' });
    } catch (error) {
        console.error('Add language error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/languages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, native_name, rtl, is_default, status, sort_order } = req.body;
        
        // Eğer varsayılan dil seçildiyse, diğer dilleri varsayılan yapma
        if (is_default) {
            await pool.execute('UPDATE languages SET is_default = 0 WHERE id != ?', [id]);
        }
        
        await pool.execute(
            'UPDATE languages SET code = ?, name = ?, native_name = ?, rtl = ?, is_default = ?, status = ?, sort_order = ? WHERE id = ?',
            [code, name, native_name, rtl ? 1 : 0, is_default ? 1 : 0, status, sort_order || 0, id]
        );
        res.json({ message: 'Dil güncellendi' });
    } catch (error) {
        console.error('Update language error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.delete('/languages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM languages WHERE id = ?', [id]);
        res.json({ message: 'Dil silindi' });
    } catch (error) {
        console.error('Delete language error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/languages/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await pool.execute('UPDATE languages SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'Dil durumu güncellendi' });
    } catch (error) {
        console.error('Update language status error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Siparişler
router.get('/orders', async (req, res) => {
    try {
        const [orders] = await pool.execute(
            `SELECT o.*, u.username 
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             ORDER BY o.created_at DESC`
        );
        res.json({ orders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Sipariş detayı (Admin)
router.get('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Sipariş bilgisi (commission_rate kolonunu da dahil et)
        let orders;
        try {
            [orders] = await pool.execute(
                `SELECT o.*, u.username, u.email, u.phone, u.first_name, u.last_name
                 FROM orders o
                 LEFT JOIN users u ON o.user_id = u.id
                 WHERE o.id = ?`,
                [id]
            );
        } catch (error) {
            // Eğer commission_rate kolonu yoksa, kolon olmadan sorgu çalıştır
            if (error.code === 'ER_BAD_FIELD_ERROR' || error.message.includes('commission_rate')) {
                console.warn('commission_rate kolonu bulunamadı. Lütfen database_add_commission_rate_to_orders.sql dosyasını çalıştırın.');
                [orders] = await pool.execute(
                    `SELECT o.*, u.username, u.email, u.phone, u.first_name, u.last_name
                     FROM orders o
                     LEFT JOIN users u ON o.user_id = u.id
                     WHERE o.id = ?`,
                    [id]
                );
            } else {
                throw error;
            }
        }

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const order = orders[0];

        // Sipariş kalemleri
        let orderItems = [];
        try {
            // Önce temel sorguyu çalıştır
            const [orderItemsResult] = await pool.execute(
                `SELECT oi.*, p.title, p.slug, p.price as project_price
                 FROM order_items oi
                 INNER JOIN projects p ON oi.project_id = p.id
                 WHERE oi.order_id = ?`,
                [id]
            );
            orderItems = orderItemsResult || [];

            // Her bir item için image'ı ayrı ayrı çek (project_images tablosu varsa)
            for (let item of orderItems) {
                try {
                    const [images] = await pool.execute(
                        'SELECT image_path FROM project_images WHERE project_id = ? AND is_primary = 1 LIMIT 1',
                        [item.project_id]
                    );
                    if (images.length > 0 && images[0].image_path) {
                        item.image = `/uploads/${images[0].image_path}`;
                    }
                } catch (e) {
                    // project_images tablosu yoksa veya hata varsa image ekleme
                    if (e.code !== 'ER_NO_SUCH_TABLE') {
                        console.error('Get image error for project', item.project_id, ':', e);
                    }
                }
            }
        } catch (error) {
            console.error('Get order items error:', error);
            // Hata olsa bile boş dizi döndür
            orderItems = [];
        }

        // Transaction bilgisi
        let transactions = [];
        try {
            const [transactionsResult] = await pool.execute(
                `SELECT t.*, u.username as transaction_user
                 FROM transactions t
                 LEFT JOIN users u ON t.user_id = u.id
                 WHERE t.order_id = ? 
                 ORDER BY t.created_at DESC`,
                [id]
            );
            transactions = transactionsResult;
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                console.error('Get transactions error:', error);
            }
        }

        // Fatura bilgisi (varsa)
        let invoices = [];
        try {
            const [invoicesResult] = await pool.execute(
                `SELECT i.*, u.username as invoice_user
                 FROM invoices i
                 LEFT JOIN users u ON i.user_id = u.id
                 WHERE i.order_id = ?`,
                [id]
            );
            invoices = invoicesResult;
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                console.error('Get invoices error:', error);
            }
        }

        // Billing info (eğer orders tablosunda varsa)
        let billingInfo = null;
        if (order.billing_info) {
            try {
                billingInfo = typeof order.billing_info === 'string' 
                    ? JSON.parse(order.billing_info) 
                    : order.billing_info;
            } catch (e) {
                console.error('Billing info parse error:', e);
            }
        }

        // Komisyon ve KDV hesaplamaları
        const finalAmount = parseFloat(order.final_amount) || 0;
        const totalAmount = parseFloat(order.total_amount) || 0;
        
        // Komisyon oranını belirle:
        // 1. Önce siparişte kayıtlı oranı kullan (varsa - yeni siparişler için)
        // 2. Yoksa settings'den al (eski siparişler için)
        let commissionRate = 15; // Varsayılan
        
        if (order.commission_rate !== null && order.commission_rate !== undefined) {
            // Siparişte kayıtlı oran var, onu kullan
            commissionRate = parseFloat(order.commission_rate) || 15;
        } else {
            // Eski sipariş - settings'den al
            try {
                const [settings] = await pool.execute(
                    "SELECT value FROM settings WHERE `key` = 'commission_rate' AND (`group` = 'general' OR `group` = 'financial') ORDER BY CASE WHEN `group` = 'general' THEN 1 ELSE 2 END LIMIT 1"
                );
                if (settings.length > 0) {
                    commissionRate = parseFloat(settings[0].value) || 15;
                }
            } catch (e) {
                console.warn('Commission rate fetch error:', e.message);
            }
        }

        // KDV oranı (varsayılan %18)
        const taxRate = 18; // KDV oranı
        
        // Hesaplamalar
        // KDV dahil tutar üzerinden hesaplama
        const amountWithoutTax = finalAmount / (1 + taxRate / 100);
        const taxAmount = finalAmount - amountWithoutTax;
        
        // Komisyon hesaplama (KDV hariç tutar üzerinden)
        const commissionAmount = amountWithoutTax * (commissionRate / 100);
        
        // Yönetim komisyonu (platform komisyonu) = komisyon tutarı
        const adminCommission = commissionAmount;
        
        // Satıcıya kalan (KDV hariç tutar - komisyon)
        const sellerAmount = amountWithoutTax - commissionAmount;

        // Fiyat detayları
        const priceBreakdown = {
            subtotal: totalAmount,
            discount: parseFloat(order.discount_amount) || 0,
            subtotal_after_discount: finalAmount,
            tax_rate: taxRate,
            tax_amount: parseFloat(taxAmount.toFixed(2)),
            amount_without_tax: parseFloat(amountWithoutTax.toFixed(2)),
            commission_rate: commissionRate,
            commission_amount: parseFloat(commissionAmount.toFixed(2)),
            admin_commission: parseFloat(adminCommission.toFixed(2)),
            seller_amount: parseFloat(sellerAmount.toFixed(2)),
            total: finalAmount
        };

        res.json({
            order: {
                ...order,
                items: orderItems || [],
                transactions: transactions || [],
                invoices: invoices || [],
                billing_info: billingInfo,
                price_breakdown: priceBreakdown
            }
        });
    } catch (error) {
        console.error('Get order detail error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Sipariş durumu güncelle (Admin)
router.put('/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { order_status, payment_status } = req.body;

        if (!order_status && !payment_status) {
            return res.status(400).json({ error: 'En az bir durum güncellenmeli' });
        }

        const updateFields = [];
        const updateValues = [];

        if (order_status) {
            updateFields.push('order_status = ?');
            updateValues.push(order_status);
        }

        if (payment_status) {
            updateFields.push('payment_status = ?');
            updateValues.push(payment_status);
        }

        updateValues.push(id);
        const query = `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`;
        
        await pool.execute(query, updateValues);
        res.json({ message: 'Sipariş durumu güncellendi' });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kuponlar
router.get('/coupons', async (req, res) => {
    try {
        const [coupons] = await pool.execute(
            'SELECT * FROM coupons ORDER BY created_at DESC'
        );
        res.json({ coupons });
    } catch (error) {
        console.error('Get coupons error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/coupons', async (req, res) => {
    try {
        const { code, discount_type, discount_value, min_amount, max_amount, usage_limit, one_time_use, start_date, expires_at, status, description } = req.body;
        
        await pool.execute(
            'INSERT INTO coupons (code, discount_type, discount_value, min_amount, max_amount, usage_limit, one_time_use, start_date, expires_at, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [code, discount_type, discount_value, min_amount || null, max_amount || null, usage_limit || null, one_time_use ? 1 : 0, start_date || null, expires_at || null, status, description || null]
        );
        res.json({ message: 'Kupon eklendi' });
    } catch (error) {
        console.error('Add coupon error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/coupons/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { code, discount_type, discount_value, min_amount, max_amount, usage_limit, one_time_use, start_date, expires_at, status, description } = req.body;
        
        await pool.execute(
            'UPDATE coupons SET code = ?, discount_type = ?, discount_value = ?, min_amount = ?, max_amount = ?, usage_limit = ?, one_time_use = ?, start_date = ?, expires_at = ?, status = ?, description = ? WHERE id = ?',
            [code, discount_type, discount_value, min_amount || null, max_amount || null, usage_limit || null, one_time_use ? 1 : 0, start_date || null, expires_at || null, status, description || null, id]
        );
        res.json({ message: 'Kupon güncellendi' });
    } catch (error) {
        console.error('Update coupon error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.delete('/coupons/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM coupons WHERE id = ?', [id]);
        res.json({ message: 'Kupon silindi' });
    } catch (error) {
        console.error('Delete coupon error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// İşlemler
router.get('/transactions', async (req, res) => {
    try {
        const [transactions] = await pool.execute(
            `SELECT t.*, u.username 
             FROM transactions t
             LEFT JOIN users u ON t.user_id = u.id
             ORDER BY t.created_at DESC`
        );
        res.json({ transactions });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Bağışlar
router.get('/donations', async (req, res) => {
    try {
        const [donations] = await pool.execute(
            `SELECT d.*, u.username, p.title as project_title
             FROM project_donations d
             LEFT JOIN users u ON d.user_id = u.id
             LEFT JOIN projects p ON d.project_id = p.id
             ORDER BY d.created_at DESC`
        );
        res.json({ donations });
    } catch (error) {
        console.error('Get donations error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Abonelikler
router.get('/subscriptions/plans', async (req, res) => {
    try {
        const [plans] = await pool.execute(
            'SELECT * FROM subscription_plans ORDER BY sort_order ASC'
        );
        res.json({ plans });
    } catch (error) {
        console.error('Get subscription plans error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/subscriptions/plans', async (req, res) => {
    try {
        const { name, slug, description, price, currency, billing_period, is_featured, status, sort_order } = req.body;
        
        await pool.execute(
            'INSERT INTO subscription_plans (name, slug, description, price, currency, billing_period, is_featured, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, slug, description, price, currency, billing_period, is_featured ? 1 : 0, status, sort_order || 0]
        );
        res.json({ message: 'Plan eklendi' });
    } catch (error) {
        console.error('Add subscription plan error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/subscriptions/plans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, description, price, currency, billing_period, is_featured, status, sort_order } = req.body;
        
        await pool.execute(
            'UPDATE subscription_plans SET name = ?, slug = ?, description = ?, price = ?, currency = ?, billing_period = ?, is_featured = ?, status = ?, sort_order = ? WHERE id = ?',
            [name, slug, description, price, currency, billing_period, is_featured ? 1 : 0, status, sort_order || 0, id]
        );
        res.json({ message: 'Plan güncellendi' });
    } catch (error) {
        console.error('Update subscription plan error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.get('/subscriptions/active', async (req, res) => {
    try {
        const [subscriptions] = await pool.execute(
            `SELECT us.*, u.username, sp.name as plan_name
             FROM user_subscriptions us
             LEFT JOIN users u ON us.user_id = u.id
             LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
             WHERE us.status = 'active'
             ORDER BY us.created_at DESC`
        );
        res.json({ subscriptions });
    } catch (error) {
        console.error('Get active subscriptions error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.get('/subscriptions/stats', async (req, res) => {
    try {
        const [totalPlans] = await pool.execute('SELECT COUNT(*) as total FROM subscription_plans');
        const [activeSubs] = await pool.execute("SELECT COUNT(*) as total FROM user_subscriptions WHERE status = 'active'");
        const [monthlyRevenue] = await pool.execute(
            `SELECT SUM(sp.price) as total 
             FROM user_subscriptions us
             LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
             WHERE us.status = 'active' AND sp.billing_period = 'monthly'`
        );
        
        res.json({
            total_plans: totalPlans[0].total,
            active_subscriptions: activeSubs[0].total,
            monthly_revenue: monthlyRevenue[0].total || 0
        });
    } catch (error) {
        console.error('Get subscription stats error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Blog
router.get('/blog', async (req, res) => {
    try {
        const [posts] = await pool.execute(
            `SELECT bp.*, u.username 
             FROM blog_posts bp
             LEFT JOIN users u ON bp.user_id = u.id
             ORDER BY bp.created_at DESC`
        );
        res.json({ posts });
    } catch (error) {
        console.error('Get blog posts error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Blog Kategorileri (blog/:id'den önce olmalı)
router.get('/blog/categories', async (req, res) => {
    try {
        const [categories] = await pool.execute(
            'SELECT * FROM blog_categories WHERE status = "active" ORDER BY id ASC, sort_order ASC, name ASC'
        );
        res.json({ categories });
    } catch (error) {
        console.error('Get blog categories error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/blog/categories', async (req, res) => {
    try {
        const { name, description, parent_id, sort_order } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Kategori adı gerekli' });
        }

        const slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        // Slug'un benzersiz olduğunu kontrol et
        const [existing] = await pool.execute(
            'SELECT id FROM blog_categories WHERE slug = ?',
            [slug]
        );
        
        let finalSlug = slug;
        if (existing.length > 0) {
            finalSlug = `${slug}-${Date.now()}`;
        }

        await pool.execute(
            'INSERT INTO blog_categories (name, slug, description, parent_id, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)',
            [name, finalSlug, description || null, parent_id || null, sort_order || 0, 'active']
        );
        res.json({ message: 'Blog kategorisi eklendi' });
    } catch (error) {
        console.error('Add blog category error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.get('/blog/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [posts] = await pool.execute(
            `SELECT bp.*, u.username, bc.name as category_name
             FROM blog_posts bp
             LEFT JOIN users u ON bp.user_id = u.id
             LEFT JOIN blog_categories bc ON bp.category_id = bc.id
             WHERE bp.id = ?`,
            [id]
        );

        if (posts.length === 0) {
            return res.status(404).json({ error: 'Blog yazısı bulunamadı' });
        }

        const post = posts[0];

        // Çok dilli içerikleri getir
        let translations = [];
        try {
            [translations] = await pool.execute(
                `SELECT language_code, title, description, short_description 
                 FROM content_translations 
                 WHERE content_id = ? AND content_type = 'blog'`,
                [post.id]
            );
        } catch (err) {
            console.warn('Content translations table not available or error:', err.message);
            translations = [];
        }
        
        post.translations = {};
        translations.forEach(t => {
            post.translations[t.language_code] = {
                title: t.title,
                description: t.description,
                short_description: t.short_description
            };
        });

        res.json({ post });
    } catch (error) {
        console.error('Get blog post error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.post('/blog', blogUpload.single('cover_image'), async (req, res) => {
    try {
        const userId = req.user?.id || 1; // Admin user
        const {
            title, title_tr, title_en, title_de,
            excerpt, excerpt_tr, excerpt_en, excerpt_de,
            content, content_tr, content_en, content_de,
            category_id, status, is_featured,
            meta_title, meta_description, meta_keywords,
            cover_image, published_at
        } = req.body;

        if (!title && !title_tr) {
            return res.status(400).json({ error: 'Başlık gerekli' });
        }

        const finalTitle = title_tr || title;
        const slug = finalTitle.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        // Slug'un benzersiz olduğunu kontrol et
        const [existing] = await pool.execute(
            'SELECT id FROM blog_posts WHERE slug = ?',
            [slug]
        );
        
        let finalSlug = slug;
        if (existing.length > 0) {
            finalSlug = `${slug}-${Date.now()}`;
        }

        const finalContent = content_tr || content || '';
        const finalExcerpt = excerpt_tr || excerpt || '';

        const [result] = await pool.execute(
            `INSERT INTO blog_posts (
                user_id, title, slug, excerpt, content, category_id, status, 
                is_featured, meta_title, meta_description, meta_keywords, 
                cover_image, published_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                finalTitle,
                finalSlug,
                finalExcerpt,
                finalContent,
                category_id || null,
                status || 'draft',
                is_featured ? 1 : 0,
                meta_title || null,
                meta_description || null,
                meta_keywords || null,
                req.file ? `blog/${req.file.filename}` : (cover_image || null),
                published_at || (status === 'published' ? new Date() : null)
            ]
        );

        const postId = result.insertId;

        // Çok dilli içerikleri kaydet
        if (title_tr || content_tr || excerpt_tr) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'blog', 'tr', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [postId, title_tr || title, content_tr || content, excerpt_tr || excerpt,
                 title_tr || title, content_tr || content, excerpt_tr || excerpt]
            );
        }

        if (title_en || content_en || excerpt_en) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'blog', 'en', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [postId, title_en, content_en, excerpt_en,
                 title_en, content_en, excerpt_en]
            );
        }

        if (title_de || content_de || excerpt_de) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'blog', 'de', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [postId, title_de, content_de, excerpt_de,
                 title_de, content_de, excerpt_de]
            );
        }

        res.json({ message: 'Blog yazısı eklendi', post_id: postId });
    } catch (error) {
        console.error('Add blog post error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/blog/:id', blogUpload.single('cover_image'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, title_tr, title_en, title_de,
            excerpt, excerpt_tr, excerpt_en, excerpt_de,
            content, content_tr, content_en, content_de,
            category_id, status, is_featured,
            meta_title, meta_description, meta_keywords,
            cover_image, published_at
        } = req.body;

        // Projenin varlığını kontrol et
        const [existing] = await pool.execute(
            'SELECT id FROM blog_posts WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Blog yazısı bulunamadı' });
        }

        const updates = [];
        const values = [];

        const finalTitle = title_tr || title;
        if (finalTitle !== undefined) {
            updates.push('title = ?');
            values.push(finalTitle);
            const slug = finalTitle.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
            updates.push('slug = ?');
            values.push(slug);
        }

        const finalExcerpt = excerpt_tr || excerpt;
        if (finalExcerpt !== undefined) {
            updates.push('excerpt = ?');
            values.push(finalExcerpt);
        }

        const finalContent = content_tr || content;
        if (finalContent !== undefined) {
            updates.push('content = ?');
            values.push(finalContent);
        }

        if (category_id !== undefined) {
            updates.push('category_id = ?');
            values.push(category_id || null);
        }

        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }

        if (is_featured !== undefined) {
            updates.push('is_featured = ?');
            values.push(is_featured ? 1 : 0);
        }

        if (meta_title !== undefined) {
            updates.push('meta_title = ?');
            values.push(meta_title || null);
        }

        if (meta_description !== undefined) {
            updates.push('meta_description = ?');
            values.push(meta_description || null);
        }

        if (meta_keywords !== undefined) {
            updates.push('meta_keywords = ?');
            values.push(meta_keywords || null);
        }

        if (req.file || cover_image !== undefined) {
            updates.push('cover_image = ?');
            values.push(req.file ? `blog/${req.file.filename}` : (cover_image || null));
        }

        if (published_at !== undefined) {
            updates.push('published_at = ?');
            values.push(published_at || (status === 'published' ? new Date() : null));
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi' });
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        await pool.execute(
            `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        // Çok dilli içerikleri güncelle
        if (title_tr || content_tr || excerpt_tr) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'blog', 'tr', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [id, title_tr || title, content_tr || content, excerpt_tr || excerpt,
                 title_tr || title, content_tr || content, excerpt_tr || excerpt]
            );
        }

        if (title_en || content_en || excerpt_en) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'blog', 'en', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [id, title_en, content_en, excerpt_en,
                 title_en, content_en, excerpt_en]
            );
        }

        if (title_de || content_de || excerpt_de) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'blog', 'de', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [id, title_de, content_de, excerpt_de,
                 title_de, content_de, excerpt_de]
            );
        }

        res.json({ message: 'Blog yazısı güncellendi' });
    } catch (error) {
        console.error('Update blog post error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.delete('/blog/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM blog_posts WHERE id = ?', [id]);
        res.json({ message: 'Yazı silindi' });
    } catch (error) {
        console.error('Delete blog post error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kategoriler (projeler için - eski endpoint)
router.get('/categories', async (req, res) => {
    try {
        const [categories] = await pool.execute(
            'SELECT * FROM categories ORDER BY sort_order ASC, name ASC'
        );
        res.json({ categories });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/categories', async (req, res) => {
    try {
        const { name, slug, description, parent_id, icon, sort_order, status } = req.body;
        
        await pool.execute(
            'INSERT INTO categories (name, slug, description, parent_id, icon, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, slug, description || null, parent_id || null, icon || null, sort_order || 0, status]
        );
        res.json({ message: 'Kategori eklendi' });
    } catch (error) {
        console.error('Add category error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, description, parent_id, icon, sort_order, status } = req.body;
        
        await pool.execute(
            'UPDATE categories SET name = ?, slug = ?, description = ?, parent_id = ?, icon = ?, sort_order = ?, status = ? WHERE id = ?',
            [name, slug, description || null, parent_id || null, icon || null, sort_order || 0, status, id]
        );
        res.json({ message: 'Kategori güncellendi' });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.delete('/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM categories WHERE id = ?', [id]);
        res.json({ message: 'Kategori silindi' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Sayfalar
router.get('/pages', async (req, res) => {
    try {
        const [pages] = await pool.execute(
            'SELECT * FROM pages ORDER BY created_at DESC'
        );
        res.json({ pages });
    } catch (error) {
        console.error('Get pages error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.get('/pages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [pages] = await pool.execute(
            'SELECT * FROM pages WHERE id = ?',
            [id]
        );
        
        if (pages.length === 0) {
            return res.status(404).json({ error: 'Sayfa bulunamadı' });
        }

        const page = pages[0];
        
        // Çevirileri yükle
        let translations = {};
        try {
            const [transRows] = await pool.execute(
                `SELECT language_code, title, description 
                 FROM content_translations 
                 WHERE content_id = ? AND content_type = 'page'`,
                [id]
            );
            transRows.forEach(t => {
                translations[t.language_code] = {
                    title: t.title,
                    description: t.description
                };
            });
        } catch (err) {
            console.warn('Content translations table not available or error:', err.message);
        }

        res.json({ page, translations });
    } catch (error) {
        console.error('Get page error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/pages', async (req, res) => {
    try {
        const { 
            title, slug, content, meta_title, meta_description, status,
            title_tr, content_tr, title_en, content_en, title_de, content_de
        } = req.body;
        
        const [result] = await pool.execute(
            'INSERT INTO pages (title, slug, content, meta_title, meta_description, status) VALUES (?, ?, ?, ?, ?, ?)',
            [title || title_tr, slug, content || content_tr, meta_title || null, meta_description || null, status]
        );
        
        const pageId = result.insertId;

        // Çok dilli içerik kaydet
        if (title_tr || content_tr) {
            try {
                await pool.execute(
                    `INSERT INTO content_translations (content_id, content_type, language_code, title, description)
                     VALUES (?, 'page', 'tr', ?, ?)
                     ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description)`,
                    [pageId, title_tr || title, content_tr || content, title_tr || title, content_tr || content]
                );
            } catch (err) {
                console.warn('TR translation save error:', err.message);
            }
        }

        if (title_en || content_en) {
            try {
                await pool.execute(
                    `INSERT INTO content_translations (content_id, content_type, language_code, title, description)
                     VALUES (?, 'page', 'en', ?, ?)
                     ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description)`,
                    [pageId, title_en, content_en, title_en, content_en]
                );
            } catch (err) {
                console.warn('EN translation save error:', err.message);
            }
        }

        if (title_de || content_de) {
            try {
                await pool.execute(
                    `INSERT INTO content_translations (content_id, content_type, language_code, title, description)
                     VALUES (?, 'page', 'de', ?, ?)
                     ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description)`,
                    [pageId, title_de, content_de, title_de, content_de]
                );
            } catch (err) {
                console.warn('DE translation save error:', err.message);
            }
        }

        res.json({ message: 'Sayfa eklendi', id: pageId });
    } catch (error) {
        console.error('Add page error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/pages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            title, slug, content, meta_title, meta_description, status,
            title_tr, content_tr, title_en, content_en, title_de, content_de
        } = req.body;
        
        await pool.execute(
            'UPDATE pages SET title = ?, slug = ?, content = ?, meta_title = ?, meta_description = ?, status = ? WHERE id = ?',
            [title || title_tr, slug, content || content_tr, meta_title || null, meta_description || null, status, id]
        );

        // Çok dilli içerik güncelle
        if (title_tr || content_tr) {
            try {
                await pool.execute(
                    `INSERT INTO content_translations (content_id, content_type, language_code, title, description)
                     VALUES (?, 'page', 'tr', ?, ?)
                     ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description)`,
                    [id, title_tr || title, content_tr || content, title_tr || title, content_tr || content]
                );
            } catch (err) {
                console.warn('TR translation update error:', err.message);
            }
        }

        if (title_en || content_en) {
            try {
                await pool.execute(
                    `INSERT INTO content_translations (content_id, content_type, language_code, title, description)
                     VALUES (?, 'page', 'en', ?, ?)
                     ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description)`,
                    [id, title_en, content_en, title_en, content_en]
                );
            } catch (err) {
                console.warn('EN translation update error:', err.message);
            }
        }

        if (title_de || content_de) {
            try {
                await pool.execute(
                    `INSERT INTO content_translations (content_id, content_type, language_code, title, description)
                     VALUES (?, 'page', 'de', ?, ?)
                     ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description)`,
                    [id, title_de, content_de, title_de, content_de]
                );
            } catch (err) {
                console.warn('DE translation update error:', err.message);
            }
        }

        res.json({ message: 'Sayfa güncellendi' });
    } catch (error) {
        console.error('Update page error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.delete('/pages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM pages WHERE id = ?', [id]);
        res.json({ message: 'Sayfa silindi' });
    } catch (error) {
        console.error('Delete page error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Menüler (menu_items tablosu kullanarak)
router.get('/menus/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const [items] = await pool.execute(
            'SELECT * FROM menu_items WHERE menu_type = ? ORDER BY `order` ASC',
            [type]
        );
        res.json({ items });
    } catch (error) {
        // Eğer tablo yoksa boş dizi döndür
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json({ items: [] });
        } else {
            console.error('Get menu items error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.post('/menus/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { title, url, icon, order, parent_id, target, status } = req.body;
        
        await pool.execute(
            'INSERT INTO menu_items (menu_type, title, url, icon, `order`, parent_id, target, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [type, title, url, icon || null, order || 0, parent_id || null, target || '_self', status || 'active']
        );
        res.json({ message: 'Menü öğesi eklendi' });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'menu_items tablosu bulunamadı. Lütfen database_admin_tables.sql dosyasını çalıştırın.' });
        } else {
            console.error('Add menu item error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.put('/menus/:type/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, url, icon, order, parent_id, target, status } = req.body;
        
        await pool.execute(
            'UPDATE menu_items SET title = ?, url = ?, icon = ?, `order` = ?, parent_id = ?, target = ?, status = ? WHERE id = ?',
            [title, url, icon || null, order || 0, parent_id || null, target || '_self', status || 'active', id]
        );
        res.json({ message: 'Menü öğesi güncellendi' });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'menu_items tablosu bulunamadı. Lütfen database_admin_tables.sql dosyasını çalıştırın.' });
        } else {
            console.error('Update menu item error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.delete('/menus/:type/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM menu_items WHERE id = ?', [id]);
        res.json({ message: 'Menü öğesi silindi' });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'menu_items tablosu bulunamadı. Lütfen database_admin_tables.sql dosyasını çalıştırın.' });
        } else {
            console.error('Delete menu item error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.put('/menus/:type/:id/move', async (req, res) => {
    try {
        const { id } = req.params;
        const { direction } = req.body;
        
        // Sıralama mantığı - basit implementasyon
        const [current] = await pool.execute('SELECT `order` FROM menu_items WHERE id = ?', [id]);
        if (current.length === 0) {
            return res.status(404).json({ error: 'Menü öğesi bulunamadı' });
        }
        
        const currentOrder = current[0].order;
        const newOrder = direction === 'up' ? currentOrder - 1 : currentOrder + 1;
        
        // Diğer öğenin sırasını değiştir
        await pool.execute('UPDATE menu_items SET `order` = ? WHERE `order` = ? AND id != ?', [currentOrder, newOrder, id]);
        // Mevcut öğenin sırasını güncelle
        await pool.execute('UPDATE menu_items SET `order` = ? WHERE id = ?', [newOrder, id]);
        
        res.json({ message: 'Menü öğesi taşındı' });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'menu_items tablosu bulunamadı. Lütfen database_admin_tables.sql dosyasını çalıştırın.' });
        } else {
            console.error('Move menu item error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.put('/menus/:type/reorder', async (req, res) => {
    try {
        const { type } = req.params;
        const { items } = req.body; // [{id, order, parent_id}, ...]
        
        // Transaction başlat
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            for (const item of items) {
                await connection.execute(
                    'UPDATE menu_items SET `order` = ?, parent_id = ? WHERE id = ? AND menu_type = ?',
                    [item.order, item.parent_id || null, item.id, type]
                );
            }
            
            await connection.commit();
            res.json({ message: 'Menü sıralaması güncellendi' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Reorder menu items error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/users/:id/unban', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('UPDATE users SET status = ?, ban_note = NULL WHERE id = ?', ['active', id]);
        res.json({ message: 'Kullanıcı yasağı kaldırıldı' });
    } catch (error) {
        console.error('Unban user error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Muhasebe - Bekleyen Faturalar
router.get('/accounting/pending-invoices', async (req, res) => {
    try {
        // Önce mevcut faturaları çek
        let invoicesQuery = `
            SELECT 
                i.*, 
                u.username,
                o.order_number,
                o.payment_status,
                o.order_status,
                'invoice' as source_type
            FROM invoices i 
            LEFT JOIN users u ON i.user_id = u.id 
            LEFT JOIN orders o ON i.order_id = o.id
            WHERE i.status IN ('draft', 'sent') 
            ORDER BY i.created_at DESC
        `;
        const [invoices] = await pool.execute(invoicesQuery);
        
        // Şimdi fatura oluşturulmamış siparişleri çek (bunlar da bekleyen fatura olarak gösterilecek)
        let ordersQuery = `
            SELECT 
                o.id as order_id,
                o.order_number as invoice_number,
                o.user_id,
                u.username,
                o.final_amount as total_amount,
                o.currency,
                o.payment_status,
                o.order_status,
                o.created_at as invoice_date,
                o.created_at,
                'pending' as status,
                'order' as source_type,
                NULL as invoice_id,
                GROUP_CONCAT(DISTINCT p.title SEPARATOR ', ') as project_titles,
                COUNT(DISTINCT oi.id) as item_count
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN projects p ON oi.project_id = p.id
            WHERE o.payment_status = 'paid' 
            AND o.order_status IN ('completed', 'processing')
            AND NOT EXISTS (
                SELECT 1 FROM invoices i WHERE i.order_id = o.id
            )
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `;
        const [orders] = await pool.execute(ordersQuery);
        
        // Her iki kaynağı birleştir
        const allInvoices = [
            ...invoices.map(inv => ({ ...inv, source_type: 'invoice' })),
            ...orders.map(ord => ({ 
                ...ord, 
                id: ord.order_id, // order_id'yi id olarak kullan
                order_id: ord.order_id, // order_id'yi de koru (frontend için)
                source_type: 'order',
                invoice_number: ord.invoice_number || `ORD-${ord.order_id}`,
                total_amount: parseFloat(ord.total_amount) || 0
            }))
        ];
        
        res.json({ invoices: allInvoices });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            // Eğer invoices tablosu yoksa sadece siparişleri döndür
            try {
                const [orders] = await pool.execute(
                    `SELECT 
                        o.id as order_id,
                        o.order_number as invoice_number,
                        o.user_id,
                        u.username,
                        o.final_amount as total_amount,
                        o.currency,
                        o.payment_status,
                        o.order_status,
                        o.created_at as invoice_date,
                        o.created_at,
                        'pending' as status,
                        'order' as source_type,
                        GROUP_CONCAT(DISTINCT p.title SEPARATOR ', ') as project_titles,
                        COUNT(DISTINCT oi.id) as item_count
                    FROM orders o
                    LEFT JOIN users u ON o.user_id = u.id
                    LEFT JOIN order_items oi ON o.id = oi.order_id
                    LEFT JOIN projects p ON oi.project_id = p.id
                    WHERE o.payment_status = 'paid' 
                    AND o.order_status IN ('completed', 'processing')
                    GROUP BY o.id
                    ORDER BY o.created_at DESC`
                );
                res.json({ 
                    invoices: orders.map(ord => ({ 
                        ...ord, 
                        id: ord.order_id,
                        order_id: ord.order_id, // order_id'yi de koru (frontend için)
                        source_type: 'order',
                        invoice_number: ord.invoice_number || `ORD-${ord.order_id}`
                    })) 
                });
            } catch (err) {
                console.error('Get orders error:', err);
                res.json({ invoices: [] });
            }
        } else {
            console.error('Get pending invoices error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

// Muhasebe - Onaylanan Faturalar
router.get('/accounting/approved-invoices', async (req, res) => {
    try {
        const { status } = req.query;
        let query = `SELECT i.*, u.username 
                     FROM invoices i 
                     LEFT JOIN users u ON i.user_id = u.id 
                     WHERE i.status IN ('paid', 'overdue', 'sent')`;
        const params = [];
        
        if (status && status !== 'all') {
            query += ' AND i.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY i.created_at DESC';
        
        const [invoices] = await pool.execute(query, params);
        res.json({ invoices });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json({ invoices: [] });
        } else {
            console.error('Get approved invoices error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.put('/accounting/invoices/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('UPDATE invoices SET status = ? WHERE id = ?', ['paid', id]);
        res.json({ message: 'Fatura onaylandı' });
    } catch (error) {
        console.error('Approve invoice error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/accounting/invoices/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('UPDATE invoices SET status = ? WHERE id = ?', ['cancelled', id]);
        res.json({ message: 'Fatura reddedildi' });
    } catch (error) {
        console.error('Reject invoice error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Fatura detayı
router.get('/accounting/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Faturayı getir
        const [invoices] = await pool.execute(
            `SELECT i.*, u.username, u.email, u.phone,
                    o.order_number, o.final_amount as order_amount, o.currency as order_currency,
                    o.payment_status, o.order_status
             FROM invoices i
             LEFT JOIN users u ON i.user_id = u.id
             LEFT JOIN orders o ON i.order_id = o.id
             WHERE i.id = ?`,
            [id]
        );
        
        if (invoices.length === 0) {
            return res.status(404).json({ error: 'Fatura bulunamadı' });
        }
        
        const invoice = invoices[0];
        
        // Sipariş kalemlerini getir (eğer sipariş varsa)
        let orderItems = [];
        if (invoice.order_id) {
            try {
                const [items] = await pool.execute(
                    `SELECT oi.*, p.title as project_title, p.image_url as project_image
                     FROM order_items oi
                     LEFT JOIN projects p ON oi.project_id = p.id
                     WHERE oi.order_id = ?
                     ORDER BY oi.id`,
                    [invoice.order_id]
                );
                orderItems = items;
            } catch (err) {
                console.error('Get order items error:', err);
            }
        }
        
        res.json({
            invoice: {
                ...invoice,
                order_items: orderItems
            }
        });
    } catch (error) {
        console.error('Get invoice detail error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Siparişten fatura oluştur
router.post('/accounting/invoices/create-from-order', async (req, res) => {
    try {
        const { order_id } = req.body;
        
        if (!order_id) {
            console.error('Create invoice error: order_id eksik', req.body);
            return res.status(400).json({ error: 'Sipariş ID gerekli', received: req.body });
        }
        
        // Siparişi kontrol et
        const [orders] = await pool.execute(
            `SELECT o.*, u.username 
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ?`,
            [order_id]
        );
        
        if (orders.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }
        
        const order = orders[0];
        
        // Zaten fatura var mı kontrol et
        const [existingInvoices] = await pool.execute(
            'SELECT id FROM invoices WHERE order_id = ?',
            [order_id]
        );
        
        if (existingInvoices.length > 0) {
            return res.status(400).json({ error: 'Bu sipariş için zaten fatura oluşturulmuş' });
        }
        
        // Fatura numarası oluştur
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        
        // KDV hesapla (%18)
        const taxRate = 0.18;
        const amount = parseFloat(order.final_amount);
        const taxAmount = amount * taxRate;
        const totalAmount = amount + taxAmount;
        
        // Fatura oluştur
        const [result] = await pool.execute(
            `INSERT INTO invoices (
                invoice_number, order_id, user_id, amount, tax_amount, total_amount, 
                currency, invoice_date, due_date, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'draft')`,
            [
                invoiceNumber,
                order_id,
                order.user_id,
                amount,
                taxAmount,
                totalAmount,
                order.currency || 'TRY'
            ]
        );
        
        res.json({ 
            message: 'Fatura başarıyla oluşturuldu',
            invoice_id: result.insertId,
            invoice_number: invoiceNumber
        });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'invoices tablosu bulunamadı. Lütfen database_missing_tables.sql dosyasını çalıştırın.' });
        } else {
            console.error('Create invoice from order error:', error);
            res.status(500).json({ error: 'Sunucu hatası', details: error.message });
        }
    }
});

// Settings Routes
router.get('/settings/:group', async (req, res) => {
    try {
        const { group } = req.params;
        
        // Eğer 'general' grubu ise, 'financial' grubundaki commission_rate'i de dahil et
        let settings = [];
        if (group === 'general') {
            // 'general' grubundaki ayarları al
            const [generalSettings] = await pool.execute(
                'SELECT `key`, `value`, `type` FROM settings WHERE `group` = ?',
                [group]
            );
            settings = generalSettings;
            
            // 'financial' grubundaki commission_rate'i de ekle (eğer general'de yoksa)
            const hasCommissionRate = settings.some(s => s.key === 'commission_rate');
            if (!hasCommissionRate) {
                const [financialSettings] = await pool.execute(
                    "SELECT `key`, `value`, `type` FROM settings WHERE `group` = 'financial' AND `key` = 'commission_rate'",
                    []
                );
                settings = [...settings, ...financialSettings];
            }
        } else {
            const [groupSettings] = await pool.execute(
                'SELECT `key`, `value`, `type` FROM settings WHERE `group` = ?',
                [group]
            );
            settings = groupSettings;
        }
        
        const result = {};
        settings.forEach(setting => {
            if (setting.type === 'boolean') {
                result[setting.key] = setting.value === '1' || setting.value === 'true';
            } else if (setting.type === 'number') {
                result[setting.key] = parseFloat(setting.value) || 0;
            } else {
                result[setting.key] = setting.value;
            }
        });
        
        res.json(result);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/settings/:group', async (req, res) => {
    try {
        const { group } = req.params;
        const settings = req.body;
        
        for (const [key, value] of Object.entries(settings)) {
            const stringValue = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
            
            // commission_rate için özel işlem: Eğer 'general' grubundan kaydediliyorsa, 
            // hem 'general' hem de 'financial' grubuna kaydet (eski uyumluluk için)
            if (key === 'commission_rate' && group === 'general') {
                // Önce 'general' grubuna kaydet
                await pool.execute(
                    'INSERT INTO settings (`key`, `value`, `type`, `group`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE `value` = ?, `updated_at` = NOW()',
                    [key, stringValue, 'number', 'general', stringValue]
                );
                // Sonra 'financial' grubuna da kaydet (eski uyumluluk için)
                await pool.execute(
                    'INSERT INTO settings (`key`, `value`, `type`, `group`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE `value` = ?, `updated_at` = NOW()',
                    [key, stringValue, 'number', 'financial', stringValue]
                );
            } else {
                await pool.execute(
                    'INSERT INTO settings (`key`, `value`, `type`, `group`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE `value` = ?, `updated_at` = NOW()',
                    [key, stringValue, typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text', group, stringValue]
                );
            }
        }
        
        res.json({ message: 'Ayarlar kaydedildi' });
    } catch (error) {
        console.error('Save settings error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Slider Yönetimi
router.get('/sliders', authenticate, async (req, res) => {
    try {
        const [sliders] = await pool.execute(
            'SELECT * FROM sliders ORDER BY `order` ASC, created_at DESC'
        );
        res.json({ sliders });
    } catch (error) {
        console.error('Get sliders error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.get('/sliders/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const [sliders] = await pool.execute(
            'SELECT * FROM sliders WHERE id = ?',
            [id]
        );
        if (sliders.length === 0) {
            return res.status(404).json({ error: 'Slider bulunamadı' });
        }
        res.json({ slider: sliders[0] });
    } catch (error) {
        console.error('Get slider error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/sliders', authenticate, isAdmin, sliderUpload.single('image'), async (req, res) => {
    try {
        const { title, link, order, status } = req.body;
        
        if (!title || !req.file) {
            return res.status(400).json({ error: 'Başlık ve resim gerekli' });
        }

        const imagePath = `slider/${req.file.filename}`;
        const [result] = await pool.execute(
            'INSERT INTO sliders (title, image, link, `order`, status) VALUES (?, ?, ?, ?, ?)',
            [title, imagePath, link || null, order || 0, status || 'active']
        );
        
        res.json({ message: 'Slider eklendi', slider_id: result.insertId });
    } catch (error) {
        console.error('Add slider error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/sliders/:id', authenticate, isAdmin, sliderUpload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, link, order, status, image } = req.body;
        
        const updates = [];
        const values = [];
        
        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        
        if (req.file) {
            updates.push('image = ?');
            values.push(`slider/${req.file.filename}`);
        } else if (image !== undefined) {
            updates.push('image = ?');
            values.push(image || null);
        }
        
        if (link !== undefined) {
            updates.push('link = ?');
            values.push(link || null);
        }
        
        if (order !== undefined) {
            updates.push('`order` = ?');
            values.push(order || 0);
        }
        
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi' });
        }
        
        updates.push('updated_at = NOW()');
        values.push(id);
        
        await pool.execute(
            `UPDATE sliders SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        res.json({ message: 'Slider güncellendi' });
    } catch (error) {
        console.error('Update slider error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.delete('/sliders/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.execute('DELETE FROM sliders WHERE id = ?', [id]);
        res.json({ message: 'Slider silindi' });
    } catch (error) {
        console.error('Delete slider error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.put('/sliders/bulk/status', authenticate, isAdmin, async (req, res) => {
    try {
        const { ids, status } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Geçerli ID listesi gerekli' });
        }
        
        const placeholders = ids.map(() => '?').join(',');
        await pool.execute(
            `UPDATE sliders SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
            [status, ...ids]
        );
        
        res.json({ message: 'Slider durumları güncellendi' });
    } catch (error) {
        console.error('Bulk update slider status error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.delete('/sliders/bulk', authenticate, isAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Geçerli ID listesi gerekli' });
        }
        
        const placeholders = ids.map(() => '?').join(',');
        await pool.execute(
            `DELETE FROM sliders WHERE id IN (${placeholders})`,
            ids
        );
        
        res.json({ message: 'Sliderlar silindi' });
    } catch (error) {
        console.error('Bulk delete sliders error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Referanslar API
router.get('/references', authenticate, async (req, res) => {
    try {
        const [references] = await pool.execute(
            'SELECT * FROM `references` ORDER BY sort_order ASC, id ASC'
        );
        res.json({ references });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json({ references: [] });
        } else {
            console.error('Get references error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.post('/references', authenticate, referenceUpload.single('image'), async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { title, slug, description, link, status, sort_order } = req.body;
        const image = req.file ? `/uploads/references/${req.file.filename}` : null;
        
        if (!title || !slug) {
            return res.status(400).json({ error: 'Başlık ve slug gerekli' });
        }

        const [result] = await pool.execute(
            'INSERT INTO `references` (title, slug, description, image, link, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, slug, description || null, image, link || null, status || 'active', sort_order || 0]
        );
        res.json({ message: 'Referans eklendi', id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Bu slug zaten kullanılıyor' });
        } else if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'references tablosu bulunamadı' });
        } else {
            console.error('Add reference error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.put('/references/:id', authenticate, async (req, res) => {
    // Eğer multipart/form-data ise multer middleware'ini kullan
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        return referenceUpload.single('image')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ error: 'Dosya yükleme hatası: ' + err.message });
            }
            handleReferenceUpdate(req, res).catch(error => {
                console.error('Error in handleReferenceUpdate:', error);
                res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
            });
        });
    }
    // JSON isteği ise direkt işle
    handleReferenceUpdate(req, res).catch(error => {
        console.error('Error in handleReferenceUpdate:', error);
        res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
    });
});

const handleReferenceUpdate = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        
        // Debug: req.body'yi logla
        console.log('PUT /references/:id - req.body:', req.body);
        console.log('PUT /references/:id - Content-Type:', req.headers['content-type']);
        
        // Eğer sadece status güncelleniyorsa (toggle için)
        if (req.body && req.body.status && Object.keys(req.body).length === 1) {
            try {
                await pool.execute(
                    'UPDATE `references` SET status = ? WHERE id = ?',
                    [req.body.status, id]
                );
                return res.json({ message: 'Referans durumu güncellendi' });
            } catch (dbError) {
                console.error('Database error in status update:', dbError);
                if (dbError.code === 'ER_NO_SUCH_TABLE') {
                    return res.status(400).json({ error: 'references tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
                }
                throw dbError;
            }
        }
        
        // Mevcut referansı al
        let existing;
        try {
            [existing] = await pool.execute('SELECT * FROM `references` WHERE id = ?', [id]);
        } catch (dbError) {
            console.error('Database error in SELECT:', dbError);
            if (dbError.code === 'ER_NO_SUCH_TABLE') {
                return res.status(400).json({ error: 'references tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
            }
            throw dbError;
        }
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Referans bulunamadı' });
        }
        
        const current = existing[0];
        const { title, slug, description, image, link, status, sort_order } = req.body;
        
        // Eğer yeni resim yüklendiyse onu kullan, yoksa mevcut resmi koru
        let imagePath = image || current.image;
        if (req.file) {
            imagePath = `/uploads/references/${req.file.filename}`;
            // Eski resmi sil (opsiyonel)
            if (current.image && current.image.startsWith('/uploads/references/')) {
                const oldImagePath = path.join(process.cwd(), 'public', current.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
        }
        
        await pool.execute(
            'UPDATE `references` SET title = ?, slug = ?, description = ?, image = ?, link = ?, status = ?, sort_order = ? WHERE id = ?',
            [
                title || current.title,
                slug || current.slug,
                description !== undefined ? description : current.description,
                imagePath,
                link !== undefined ? link : current.link,
                status || current.status,
                sort_order !== undefined ? sort_order : current.sort_order,
                id
            ]
        );
        res.json({ message: 'Referans güncellendi' });
    } catch (error) {
        console.error('Update reference error - Full error:', error);
        console.error('Update reference error - Stack:', error.stack);
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Bu slug zaten kullanılıyor' });
        } else if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'references tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
        } else {
            res.status(500).json({ 
                error: 'Sunucu hatası: ' + error.message,
                code: error.code,
                sqlMessage: error.sqlMessage || null
            });
        }
    }
};

router.delete('/references/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        await pool.execute('DELETE FROM `references` WHERE id = ?', [id]);
        res.json({ message: 'Referans silindi' });
    } catch (error) {
        console.error('Delete reference error - Full error:', error);
        console.error('Delete reference error - Stack:', error.stack);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'references tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
        } else {
            res.status(500).json({ 
                error: 'Sunucu hatası: ' + error.message,
                code: error.code,
                sqlMessage: error.sqlMessage || null
            });
        }
    }
});

router.put('/references/order', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { references } = req.body;
        if (!Array.isArray(references)) {
            return res.status(400).json({ error: 'Geçersiz veri formatı' });
        }

        for (const ref of references) {
            await pool.execute(
                'UPDATE `references` SET sort_order = ? WHERE id = ?',
                [ref.sort_order, ref.id]
            );
        }
        res.json({ message: 'Sıralama güncellendi' });
    } catch (error) {
        console.error('Update references order error:', error);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'references tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
        } else {
            res.status(500).json({ error: 'Sunucu hatası: ' + error.message, code: error.code });
        }
    }
});

// Sponsorlar API
router.get('/sponsors', authenticate, async (req, res) => {
    try {
        const [sponsors] = await pool.execute(
            'SELECT * FROM sponsors ORDER BY sort_order ASC, id ASC'
        );
        res.json({ sponsors });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json({ sponsors: [] });
        } else {
            console.error('Get sponsors error:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

router.post('/sponsors', authenticate, sponsorUpload.single('logo'), async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { name, logo, link_url, description, status, sort_order } = req.body;
        const logoPath = req.file ? `/uploads/sponsors/${req.file.filename}` : logo;
        
        if (!name || !logoPath) {
            return res.status(400).json({ error: 'İsim ve logo gerekli' });
        }

        const [result] = await pool.execute(
            'INSERT INTO sponsors (name, logo, link_url, description, status, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
            [name, logoPath, link_url || null, description || null, status || 'active', sort_order || 0]
        );
        res.json({ message: 'Sponsor eklendi', id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'sponsors tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
        } else {
            console.error('Add sponsor error:', error);
            res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
        }
    }
});

router.put('/sponsors/:id', authenticate, async (req, res) => {
    // Eğer multipart/form-data ise multer middleware'ini kullan
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        return sponsorUpload.single('logo')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ error: 'Dosya yükleme hatası: ' + err.message });
            }
            handleSponsorUpdate(req, res).catch(error => {
                console.error('Error in handleSponsorUpdate:', error);
                res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
            });
        });
    }
    // JSON isteği ise direkt işle
    handleSponsorUpdate(req, res).catch(error => {
        console.error('Error in handleSponsorUpdate:', error);
        res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
    });
});

const handleSponsorUpdate = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        
        // Debug: req.body'yi logla
        console.log('PUT /sponsors/:id - req.body:', req.body);
        console.log('PUT /sponsors/:id - Content-Type:', req.headers['content-type']);
        
        // Eğer sadece status güncelleniyorsa (toggle için)
        if (req.body && req.body.status && Object.keys(req.body).length === 1) {
            try {
                await pool.execute(
                    'UPDATE sponsors SET status = ? WHERE id = ?',
                    [req.body.status, id]
                );
                return res.json({ message: 'Sponsor durumu güncellendi' });
            } catch (dbError) {
                console.error('Database error in status update:', dbError);
                if (dbError.code === 'ER_NO_SUCH_TABLE') {
                    return res.status(400).json({ error: 'sponsors tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
                }
                throw dbError;
            }
        }
        
        // Mevcut sponsoru al
        let existing;
        try {
            [existing] = await pool.execute('SELECT * FROM sponsors WHERE id = ?', [id]);
        } catch (dbError) {
            console.error('Database error in SELECT:', dbError);
            if (dbError.code === 'ER_NO_SUCH_TABLE') {
                return res.status(400).json({ error: 'sponsors tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
            }
            throw dbError;
        }
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Sponsor bulunamadı' });
        }
        
        const current = existing[0];
        const { name, logo, link_url, description, status, sort_order } = req.body;
        
        // Eğer yeni logo yüklendiyse onu kullan, yoksa mevcut logoyu koru
        let logoPath = logo || current.logo;
        if (req.file) {
            logoPath = `/uploads/sponsors/${req.file.filename}`;
            // Eski logoyu sil (opsiyonel)
            if (current.logo && current.logo.startsWith('/uploads/sponsors/')) {
                const oldLogoPath = path.join(process.cwd(), 'public', current.logo);
                if (fs.existsSync(oldLogoPath)) {
                    fs.unlinkSync(oldLogoPath);
                }
            }
        }
        
        await pool.execute(
            'UPDATE sponsors SET name = ?, logo = ?, link_url = ?, description = ?, status = ?, sort_order = ? WHERE id = ?',
            [
                name || current.name,
                logoPath,
                link_url !== undefined ? link_url : current.link_url,
                description !== undefined ? description : current.description,
                status || current.status,
                sort_order !== undefined ? sort_order : current.sort_order,
                id
            ]
        );
        res.json({ message: 'Sponsor güncellendi' });
    } catch (error) {
        console.error('Update sponsor error - Full error:', error);
        console.error('Update sponsor error - Stack:', error.stack);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'sponsors tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
        } else {
            res.status(500).json({ 
                error: 'Sunucu hatası: ' + error.message,
                code: error.code,
                sqlMessage: error.sqlMessage || null
            });
        }
    }
};

router.delete('/sponsors/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        await pool.execute('DELETE FROM sponsors WHERE id = ?', [id]);
        res.json({ message: 'Sponsor silindi' });
    } catch (error) {
        console.error('Delete sponsor error - Full error:', error);
        console.error('Delete sponsor error - Stack:', error.stack);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'sponsors tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
        } else {
            res.status(500).json({ 
                error: 'Sunucu hatası: ' + error.message,
                code: error.code,
                sqlMessage: error.sqlMessage || null
            });
        }
    }
});

router.put('/sponsors/order', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { sponsors } = req.body;
        if (!Array.isArray(sponsors)) {
            return res.status(400).json({ error: 'Geçersiz veri formatı' });
        }

        for (const sponsor of sponsors) {
            await pool.execute(
                'UPDATE sponsors SET sort_order = ? WHERE id = ?',
                [sponsor.sort_order, sponsor.id]
            );
        }
        res.json({ message: 'Sıralama güncellendi' });
    } catch (error) {
        console.error('Update sponsors order error:', error);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.status(400).json({ error: 'sponsors tablosu bulunamadı. Lütfen database_references_sponsors.sql dosyasını çalıştırın.' });
        } else {
            res.status(500).json({ error: 'Sunucu hatası: ' + error.message, code: error.code });
        }
    }
});

export default router;
