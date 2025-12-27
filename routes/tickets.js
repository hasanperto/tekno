import express from 'express';
import pool from '../config/database.js';
import { authenticate, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ===================== DEPARTMAN API'LERİ =====================

// Kullanıcının satın aldığı projeleri getir
router.get('/purchased-projects', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { lang = 'tr' } = req.query;
        
        const [projects] = await pool.execute(
            `SELECT DISTINCT p.id, 
                    COALESCE(ct.title, p.title) as title,
                    p.slug
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             LEFT JOIN content_translations ct ON ct.content_id = p.id 
                 AND ct.content_type = 'project' 
                 AND ct.language_code = ?
             WHERE o.user_id = ? 
                 AND o.payment_status = 'paid'
             ORDER BY o.created_at DESC`,
            [lang, userId]
        );
        
        res.json({ projects });
    } catch (error) {
        console.error('Get purchased projects error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Tüm departmanları getir (kullanıcı rolüne göre filtrele)
router.get('/departments', authenticate, async (req, res) => {
    try {
        const userRole = req.user.role;
        
        const [departments] = await pool.execute(
            `SELECT * FROM support_departments 
             WHERE is_active = 1 
             ORDER BY sort_order ASC`
        );
        
        // Kullanıcının rolüne göre departmanları filtrele
        const allowedDepartments = departments.filter(dept => {
            if (!dept.allowed_roles) return true;
            try {
                const roles = JSON.parse(dept.allowed_roles);
                return roles.includes(userRole);
            } catch {
                return true;
            }
        });
        
        res.json({ departments: allowedDepartments });
    } catch (error) {
        console.error('Get departments error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin - Departman oluştur/güncelle
router.post('/departments', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }
        
        const { name, slug, description, icon, color, email, allowed_roles, sort_order } = req.body;
        
        if (!name || !slug) {
            return res.status(400).json({ error: 'İsim ve slug gereklidir' });
        }
        
        const [result] = await pool.execute(
            `INSERT INTO support_departments (name, slug, description, icon, color, email, allowed_roles, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, slug, description || null, icon || null, color || '#696cff', email || null, JSON.stringify(allowed_roles || ['user', 'seller', 'admin']), sort_order || 0]
        );
        
        res.status(201).json({ 
            message: 'Departman oluşturuldu',
            department_id: result.insertId 
        });
    } catch (error) {
        console.error('Create department error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin - Departman güncelle
router.put('/departments/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }
        
        const { id } = req.params;
        const { name, slug, description, icon, color, email, allowed_roles, is_active, sort_order } = req.body;
        
        await pool.execute(
            `UPDATE support_departments 
             SET name = ?, slug = ?, description = ?, icon = ?, color = ?, email = ?, 
                 allowed_roles = ?, is_active = ?, sort_order = ?
             WHERE id = ?`,
            [name, slug, description, icon, color, email, JSON.stringify(allowed_roles), is_active, sort_order, id]
        );
        
        res.json({ message: 'Departman güncellendi' });
    } catch (error) {
        console.error('Update department error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// ===================== TICKET API'LERİ (DEPARTMAN BAZLI) =====================

// Ticket oluştur (departman bazlı)
router.post('/', authenticate, async (req, res) => {
    try {
        const { subject, message, category, priority, department_id } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!subject || !message) {
            return res.status(400).json({ error: 'Konu ve mesaj gereklidir' });
        }

        if (!department_id) {
            return res.status(400).json({ error: 'Departman seçimi gereklidir' });
        }

        // Departman kontrolü ve rol kontrolü
        const [departments] = await pool.execute(
            'SELECT * FROM support_departments WHERE id = ? AND is_active = 1',
            [department_id]
        );

        if (departments.length === 0) {
            return res.status(404).json({ error: 'Departman bulunamadı' });
        }

        const department = departments[0];
        if (department.allowed_roles) {
            try {
                const allowedRoles = JSON.parse(department.allowed_roles);
                if (!allowedRoles.includes(userRole)) {
                    return res.status(403).json({ error: 'Bu departmana erişim yetkiniz yok' });
                }
            } catch (e) {
                // JSON parse hatası, devam et
            }
        }

        // project_id kontrolü (opsiyonel)
        const { project_id } = req.body;
        
        // Kolonların varlığını kontrol et
        let hasProjectId = false;
        try {
            const [columns] = await pool.execute(`
                SELECT COLUMN_NAME 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tickets'
                AND COLUMN_NAME = 'project_id'
            `);
            hasProjectId = columns.length > 0;
        } catch (colError) {
            console.warn('Column check error (using defaults):', colError.message);
        }
        
        // Ticket numarası otomatik oluşturulacak (trigger ile)
        let insertQuery, insertParams;
        if (hasProjectId && project_id) {
            insertQuery = `INSERT INTO tickets (user_id, department_id, project_id, subject, message, category, priority, status)
                          VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`;
            insertParams = [userId, department_id, project_id, subject, message, category || 'general', priority || 'medium'];
        } else {
            insertQuery = `INSERT INTO tickets (user_id, department_id, subject, message, category, priority, status)
                          VALUES (?, ?, ?, ?, ?, ?, 'open')`;
            insertParams = [userId, department_id, subject, message, category || 'general', priority || 'medium'];
        }
        
        const [result] = await pool.execute(insertQuery, insertParams);

        // Ticket numarasını al
        const [newTicket] = await pool.execute('SELECT ticket_number FROM tickets WHERE id = ?', [result.insertId]);

        res.status(201).json({ 
            message: 'Ticket oluşturuldu',
            ticket_id: result.insertId,
            ticket_number: newTicket[0]?.ticket_number
        });
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin - Yanıt bekleyen ticket sayısı
router.get('/pending-count', authenticate, isAdmin, async (req, res) => {
    try {
        // Admin'in yanıt vermesi gereken ticket'ları say
        // Status'u "open", "waiting" veya "in_progress" olan ve "closed" veya "resolved" olmayan ticket'lar
        const [result] = await pool.execute(
            `SELECT COUNT(*) as count 
             FROM tickets 
             WHERE status IN ('open', 'waiting', 'in_progress')
             AND status NOT IN ('closed', 'resolved')`
        );
        
        res.json({ count: result[0]?.count || 0 });
    } catch (error) {
        console.error('Pending tickets count error:', error);
        res.status(500).json({ error: 'Sunucu hatası', count: 0 });
    }
});

// Admin - Tüm ticket'ları getir
router.get('/all', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }
        
        const { department_id, status, priority } = req.query;
        
        // Kolonların varlığını kontrol et
        const [columns] = await pool.execute(`
            SELECT COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tickets'
        `);
        
        const columnNames = columns.map(col => col.COLUMN_NAME);
        const hasDepartmentId = columnNames.includes('department_id');
        
        let query = `
            SELECT t.*, 
                   ${hasDepartmentId ? `
                   d.name as department_name,
                   d.slug as department_slug,
                   d.icon as department_icon,
                   d.color as department_color,
                   ` : `
                   NULL as department_name,
                   NULL as department_slug,
                   NULL as department_icon,
                   NULL as department_color,
                   `}
                   u.username as creator_username
            FROM tickets t
            ${hasDepartmentId ? 'LEFT JOIN support_departments d ON t.department_id = d.id' : ''}
            LEFT JOIN users u ON t.user_id = u.id
            WHERE 1=1
        `;
        
        const params = [];
        
        // Departman filtresi
        if (department_id && hasDepartmentId) {
            query += ' AND t.department_id = ?';
            params.push(department_id);
        }
        
        // Durum filtresi
        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }
        
        // Öncelik filtresi
        if (priority) {
            query += ' AND t.priority = ?';
            params.push(priority);
        }
        
        query += ' ORDER BY t.created_at DESC';
        
        const [tickets] = await pool.execute(query, params);

        res.json({ tickets });
    } catch (error) {
        console.error('Get all tickets error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcının ticket'larını getir (departman bazlı)
router.get('/my-tickets', authenticate, async (req, res) => {
    try {
        const userRole = req.user.role;
        const { department_id, status } = req.query;
        
        // Kolonların varlığını kontrol et
        const [columns] = await pool.execute(`
            SELECT COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tickets'
        `);
        
        const columnNames = columns.map(col => col.COLUMN_NAME);
        const hasDepartmentId = columnNames.includes('department_id');
        
        let query = `
            SELECT t.*, 
                   ${hasDepartmentId ? `
                   d.name as department_name,
                   d.slug as department_slug,
                   d.icon as department_icon,
                   d.color as department_color,
                   ` : `
                   NULL as department_name,
                   NULL as department_slug,
                   NULL as department_icon,
                   NULL as department_color,
                   `}
                   (SELECT COUNT(*) FROM ticket_replies tr 
                    WHERE tr.ticket_id = t.id AND tr.user_id != ?) as reply_count,
                   (SELECT COUNT(*) FROM ticket_replies tr 
                    WHERE tr.ticket_id = t.id AND tr.is_admin = 1 AND tr.created_at > 
                    (SELECT MAX(created_at) FROM ticket_replies WHERE ticket_id = t.id AND is_admin = 0)) as unread_replies
            FROM tickets t
            ${hasDepartmentId ? 'LEFT JOIN support_departments d ON t.department_id = d.id' : 'LEFT JOIN support_departments d ON 1=0'}
            WHERE 1=1
        `;
        
        const params = [req.user.id];
        
        // Admin tüm ticket'ları görebilir, diğerleri sadece kendi ticket'larını
        if (userRole !== 'admin') {
            query += ' AND t.user_id = ?';
            params.push(req.user.id);
        }
        
        // Departman filtresi (sadece kolon varsa)
        if (department_id && hasDepartmentId) {
            query += ' AND t.department_id = ?';
            params.push(department_id);
        }
        
        // Durum filtresi
        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY t.created_at DESC';
        
        const [tickets] = await pool.execute(query, params);

        res.json({ tickets });
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Ticket detayı (departman bilgisi ile)
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userRole = req.user.role;
        
        // Önce kolonların varlığını kontrol et
        let hasMessage = false;
        let hasCategory = false;
        let hasDepartmentId = false;
        let hasSupportDepartments = false;
        
        try {
            const [columns] = await pool.execute(`
                SELECT COLUMN_NAME 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = 'teknoprojes' 
                AND TABLE_NAME = 'tickets'
            `);
            
            const columnNames = columns.map(col => col.COLUMN_NAME);
            hasMessage = columnNames.includes('message');
            hasCategory = columnNames.includes('category');
            hasDepartmentId = columnNames.includes('department_id');
        } catch (colError) {
            console.warn('Column check error (using defaults):', colError.message);
        }
        
        // support_departments tablosunun varlığını kontrol et
        try {
            const [tables] = await pool.execute(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA = 'teknoprojes' 
                AND TABLE_NAME = 'support_departments'
            `);
            hasSupportDepartments = tables.length > 0;
        } catch (tableError) {
            console.warn('Table check error:', tableError.message);
        }
        
                      // Basit sorgu - tüm kolonları seç
                      let query = `
                          SELECT t.id,
                                 t.ticket_number,
                                 t.user_id,
                                 ${hasDepartmentId ? 't.department_id' : 'NULL as department_id'},
                                 t.subject,
                                 ${hasMessage ? 'COALESCE(t.message, \'\') as message' : '\'\' as message'},
                                 ${hasCategory ? 'COALESCE(t.category, \'general\') as category' : '\'general\' as category'},
                                 t.priority,
                                 t.status,
                                 t.created_at,
                                 t.updated_at,
                                 ${hasSupportDepartments && hasDepartmentId ? `
                                 d.name as department_name,
                                 d.slug as department_slug,
                                 d.icon as department_icon,
                                 d.color as department_color
                                 ` : `
                                 NULL as department_name,
                                 NULL as department_slug,
                                 NULL as department_icon,
                                 NULL as department_color
                                 `},
                                 u.username as creator_username,
                                 ur.slug as creator_role
                          FROM tickets t
                          ${hasSupportDepartments && hasDepartmentId ? 'LEFT JOIN support_departments d ON t.department_id = d.id' : ''}
                          LEFT JOIN users u ON t.user_id = u.id
                          LEFT JOIN user_roles ur ON u.role_id = ur.id
                          WHERE t.id = ?
                      `;
        
        const params = [id];
        
        // Admin tüm ticket'ları görebilir, diğerleri sadece kendi ticket'larını
        if (userRole !== 'admin') {
            query += ' AND t.user_id = ?';
            params.push(req.user.id);
        }
        
        try {
            const [tickets] = await pool.execute(query, params);

            if (tickets.length === 0) {
                return res.status(404).json({ error: 'Ticket bulunamadı veya bu ticket\'a erişim yetkiniz yok' });
            }

            const ticket = tickets[0];
            
            // message alanı yoksa boş string kullan
            if (!ticket.message) {
                ticket.message = '';
            }
            
            // category alanı yoksa default değer
            if (!ticket.category) {
                ticket.category = 'general';
            }
            
            // ticket_number yoksa oluştur
            if (!ticket.ticket_number) {
                ticket.ticket_number = `TK-${ticket.id}`;
            }
            
            // Yanıtları getir
            let replies = [];
            try {
                // users tablosundan username, avatar ve role bilgisini çek
                const [repliesResult] = await pool.execute(
                    `SELECT tr.*, 
                            u.username, 
                            u.avatar,
                            ur.slug as user_role
                     FROM ticket_replies tr
                     LEFT JOIN users u ON tr.user_id = u.id
                     LEFT JOIN user_roles ur ON u.role_id = ur.id
                     WHERE tr.ticket_id = ?
                     ORDER BY tr.created_at ASC`,
                    [id]
                );
                replies = repliesResult || [];
                console.log(`[Ticket ${id}] Replies fetched:`, {
                    count: replies.length,
                    replies: replies.map(r => ({
                        id: r.id,
                        user_id: r.user_id,
                        username: r.username,
                        user_role: r.user_role,
                        is_admin: r.is_admin,
                        message_preview: r.message?.substring(0, 50)
                    }))
                });
            } catch (replyError) {
                console.error(`[Ticket ${id}] Replies fetch error:`, replyError.message);
                console.error('Error details:', {
                    code: replyError.code,
                    errno: replyError.errno,
                    sqlState: replyError.sqlState,
                    sqlMessage: replyError.sqlMessage
                });
                replies = [];
            }

            // Ticket objesine replies ekle
            ticket.replies = replies;

            res.json({ ticket, replies });
        } catch (queryError) {
            console.error('Ticket query error:', queryError);
            return res.status(500).json({ 
                error: 'Ticket detayları yüklenemedi',
                details: queryError.message 
            });
        }
    } catch (error) {
        console.error('Get ticket error:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Sunucu hatası',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Ticket'a yanıt ekle
router.post('/:id/reply', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (!message) {
            return res.status(400).json({ error: 'Mesaj gereklidir' });
        }

        // Ticket kontrolü ve yetki kontrolü
        let query = 'SELECT * FROM tickets WHERE id = ?';
        const params = [id];
        
        if (userRole !== 'admin') {
            query += ' AND user_id = ?';
            params.push(userId);
        }
        
        const [tickets] = await pool.execute(query, params);
        if (tickets.length === 0) {
            return res.status(404).json({ error: 'Ticket bulunamadı veya yetkiniz yok' });
        }

        const ticket = tickets[0];
        
        // Kapatılan ticket'lara sadece admin'ler yazabilir
        if (ticket.status === 'closed' && userRole !== 'admin') {
            return res.status(403).json({ error: 'Bu ticket kapatılmış. Kapatılan ticket\'lara sadece yöneticiler mesaj yazabilir.' });
        }

        const isAdmin = userRole === 'admin' || userRole === 'seller';
        const isAdminReply = req.body.is_admin === true || isAdmin;

        await pool.execute(
            `INSERT INTO ticket_replies (ticket_id, user_id, message, is_admin)
             VALUES (?, ?, ?, ?)`,
            [id, userId, message, isAdminReply ? 1 : 0]
        );

        // Ticket durumunu güncelle
        const newStatus = isAdmin ? 'in_progress' : 'waiting';
        await pool.execute(
            'UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?',
            [newStatus, id]
        );

        res.status(201).json({ message: 'Yanıt eklendi' });
    } catch (error) {
        console.error('Reply ticket error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin - Ticket önceliğini güncelle
router.put('/:id/priority', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }
        
        const { id } = req.params;
        const { priority } = req.body;
        
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({ error: 'Geçersiz öncelik' });
        }
        
        await pool.execute(
            'UPDATE tickets SET priority = ?, updated_at = NOW() WHERE id = ?',
            [priority, id]
        );
        
        res.json({ message: 'Ticket önceliği güncellendi' });
    } catch (error) {
        console.error('Update ticket priority error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin - Ticket durumunu güncelle
router.put('/:id/status', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }
        
        const { id } = req.params;
        const { status } = req.body;
        
        const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Geçersiz durum' });
        }
        
        await pool.execute(
            'UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );
        
        res.json({ message: 'Ticket durumu güncellendi' });
    } catch (error) {
        console.error('Update ticket status error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// FAQ listesi
router.get('/faq/list', async (req, res) => {
    try {
        const [faqs] = await pool.execute(
            'SELECT * FROM faqs WHERE status = ? ORDER BY sort_order ASC',
            ['active']
        );

        res.json({ faqs });
    } catch (error) {
        console.error('Get FAQ error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Test endpoint - Ticket yapısını kontrol et
router.get('/test/structure', authenticate, async (req, res) => {
    try {
        // Tickets tablosu kolonlarını kontrol et
        const [columns] = await pool.execute(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = 'teknoprojes' 
            AND TABLE_NAME = 'tickets'
            ORDER BY ORDINAL_POSITION
        `);
        
        // support_departments tablosunu kontrol et
        const [tables] = await pool.execute(`
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = 'teknoprojes' 
            AND TABLE_NAME = 'support_departments'
        `);
        
        // Örnek bir ticket getir
        let sampleTicket = null;
        try {
            const [tickets] = await pool.execute('SELECT * FROM tickets LIMIT 1');
            if (tickets.length > 0) {
                sampleTicket = tickets[0];
            }
        } catch (e) {
            console.warn('Sample ticket error:', e.message);
        }
        
        res.json({
            columns: columns,
            hasSupportDepartments: tables.length > 0,
            sampleTicket: sampleTicket,
            message: 'Yapı kontrolü başarılı'
        });
    } catch (error) {
        console.error('Test structure error:', error);
        res.status(500).json({ 
            error: 'Test hatası',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

export default router;

