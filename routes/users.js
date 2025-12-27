import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Kullanıcı profil bilgileri
router.get('/profile', authenticate, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT u.*, ur.name as role_name FROM users u LEFT JOIN user_roles ur ON u.role_id = ur.id WHERE u.id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const user = users[0];
        delete user.password;

        res.json({ user });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı istatistikleri
router.get('/stats', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        const [orders] = await pool.execute('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
        const [favorites] = await pool.execute('SELECT COUNT(*) as total FROM favorites WHERE user_id = ?', [userId]);
        // Okunmamış mesaj sayısı (silinmemiş ve okunmamış)
        const [messages] = await pool.execute(
            `SELECT COUNT(*) as total 
             FROM messages 
             WHERE receiver_id = ? 
               AND is_read = 0 
               AND (is_deleted_receiver = 0 OR is_deleted_receiver IS NULL)`,
            [userId]
        );
        const [donations] = await pool.execute('SELECT COUNT(*) as total FROM project_donations WHERE user_id = ?', [userId]);

        // Kullanıcı bakiyesini getir (users tablosunda balance kolonu varsa)
        let balance = 0;
        try {
            const [userData] = await pool.execute('SELECT balance FROM users WHERE id = ?', [userId]);
            if (userData.length > 0 && userData[0].balance !== null && userData[0].balance !== undefined) {
                balance = parseFloat(userData[0].balance || 0);
            }
        } catch (balanceError) {
            // Balance kolonu yoksa veya hata varsa 0 döndür
            console.warn('Balance fetch error (column may not exist):', balanceError.message);
            balance = 0;
        }

        res.json({
            orders: orders[0].total,
            favorites: favorites[0].total,
            unread_messages: messages[0].total,
            donations: donations[0].total,
            balance: balance
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Siparişler
router.get('/orders', authenticate, async (req, res) => {
    try {
        const [orders] = await pool.execute(
            `SELECT o.*, GROUP_CONCAT(p.title) as project_titles
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN projects p ON oi.project_id = p.id
             WHERE o.user_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [req.user.id]
        );

        res.json({ orders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Favoriler
router.get('/favorites', authenticate, async (req, res) => {
    try {
        const lang = req.query.lang || 'tr';
        
        const [favorites] = await pool.execute(
            `SELECT p.*, u.username, c.name as category_name,
             COALESCE(ct.title, p.title) as title,
             COALESCE(ct.short_description, p.short_description) as short_description,
             (SELECT image_path FROM project_images WHERE project_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
             FROM favorites f
             INNER JOIN projects p ON f.project_id = p.id
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN content_translations ct ON ct.content_id = p.id 
                 AND ct.content_type = 'project' 
                 AND ct.language_code = ?
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC`,
            [lang, req.user.id]
        );

        // URL'leri düzelt
        favorites.forEach(fav => {
            if (fav.primary_image) {
                fav.primary_image = `/uploads/${fav.primary_image}`;
            }
        });

        res.json({ favorites });
    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Favori ekle/çıkar
router.post('/favorites/:projectId', authenticate, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.id;

        // Favori kontrolü
        const [existing] = await pool.execute(
            'SELECT id FROM favorites WHERE user_id = ? AND project_id = ?',
            [userId, projectId]
        );

        if (existing.length > 0) {
            // Favoriden çıkar
            await pool.execute('DELETE FROM favorites WHERE user_id = ? AND project_id = ?', [userId, projectId]);
            res.json({ message: 'Favorilerden çıkarıldı', is_favorite: false });
        } else {
            // Favoriye ekle
            await pool.execute('INSERT INTO favorites (user_id, project_id) VALUES (?, ?)', [userId, projectId]);
            res.json({ message: 'Favorilere eklendi', is_favorite: true });
        }
    } catch (error) {
        console.error('Toggle favorite error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// İşlemler (Transactions)
router.get('/transactions', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, status, limit, offset } = req.query;

        let query = `
            SELECT t.*, 
                   o.id as order_id,
                   o.order_number,
                   GROUP_CONCAT(DISTINCT p.title) as project_titles
            FROM transactions t
            LEFT JOIN orders o ON t.order_id = o.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN projects p ON oi.project_id = p.id
            WHERE t.user_id = ?
        `;
        const params = [userId];

        // Tip filtresi
        if (type && type !== 'all') {
            query += ' AND t.type = ?';
            params.push(type);
        }

        // Durum filtresi
        if (status && status !== 'all') {
            query += ' AND t.status = ?';
            params.push(status);
        }

        query += ' GROUP BY t.id ORDER BY t.created_at DESC';

        // Limit ve offset
        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
            if (offset) {
                query += ' OFFSET ?';
                params.push(parseInt(offset));
            }
        }

        const [transactions] = await pool.execute(query, params);

        // İstatistikleri hesapla
        const [stats] = await pool.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN type = 'purchase' AND status = 'completed' THEN amount ELSE 0 END) as total_spent,
                SUM(CASE WHEN type IN ('sale', 'commission', 'payout') AND status = 'completed' THEN amount ELSE 0 END) as total_earned,
                SUM(CASE WHEN type = 'donation' AND status = 'completed' THEN amount ELSE 0 END) as total_donated
             FROM transactions 
             WHERE user_id = ?`,
            [userId]
        );

        res.json({ 
            transactions,
            stats: stats[0] || {
                total: 0,
                total_spent: 0,
                total_earned: 0,
                total_donated: 0
            }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Mesajlar - Konuşmaları getir
router.get('/messages', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        // Kullanıcının gönderdiği veya aldığı mesajları grupla (konuşmalar)
        const [conversations] = await pool.execute(
            `SELECT 
                CASE 
                    WHEN m.sender_id = ? THEN m.receiver_id 
                    ELSE m.sender_id 
                END as other_user_id,
                u.username as other_user_name,
                u.email as other_user_email,
                MAX(m.created_at) as last_message_time
             FROM messages m
             INNER JOIN users u ON (
                 CASE 
                     WHEN m.sender_id = ? THEN u.id = m.receiver_id 
                     ELSE u.id = m.sender_id 
                 END
             )
             WHERE (m.sender_id = ? OR m.receiver_id = ?)
               AND (m.is_deleted_sender = 0 OR m.sender_id != ?)
               AND (m.is_deleted_receiver = 0 OR m.receiver_id != ?)
             GROUP BY other_user_id, u.username, u.email
             ORDER BY last_message_time DESC`,
            [userId, userId, userId, userId, userId, userId]
        );

        // Her konuşma için son mesajı ve okunmamış sayısını getir
        for (let conv of conversations) {
            // Son mesaj
            const [lastMsg] = await pool.execute(
                `SELECT message FROM messages 
                 WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                   AND (is_deleted_sender = 0 OR sender_id != ?)
                   AND (is_deleted_receiver = 0 OR receiver_id != ?)
                 ORDER BY created_at DESC LIMIT 1`,
                [userId, conv.other_user_id, conv.other_user_id, userId, userId, userId]
            );
            conv.last_message = lastMsg[0]?.message || null;

            // Okunmamış mesaj sayısı
            const [unread] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0 AND is_deleted_receiver = 0`,
                [userId, conv.other_user_id]
            );
            conv.unread_count = unread[0]?.count || 0;
        }

        // Her konuşma için mesajları getir
        for (let conv of conversations) {
            const [messages] = await pool.execute(
                `SELECT m.*, 
                        u_sender.username as sender_name,
                        u_receiver.username as receiver_name,
                        CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END as is_sender
                 FROM messages m
                 LEFT JOIN users u_sender ON m.sender_id = u_sender.id
                 LEFT JOIN users u_receiver ON m.receiver_id = u_receiver.id
                 WHERE ((m.sender_id = ? AND m.receiver_id = ?) 
                    OR (m.sender_id = ? AND m.receiver_id = ?))
                   AND (m.is_deleted_sender = 0 OR m.sender_id != ?)
                   AND (m.is_deleted_receiver = 0 OR m.receiver_id != ?)
                 ORDER BY m.created_at ASC`,
                [userId, userId, conv.other_user_id, conv.other_user_id, userId, userId, userId]
            );
            conv.messages = messages;
        }

        res.json({ conversations });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Mesaj gönder
router.post('/messages', authenticate, async (req, res) => {
    try {
        const { receiver_id, message, subject } = req.body;
        const senderId = req.user.id;

        if (!receiver_id || !message) {
            return res.status(400).json({ error: 'Alıcı ve mesaj gereklidir' });
        }

        // Alıcı kontrolü
        const [receiver] = await pool.execute('SELECT id FROM users WHERE id = ?', [receiver_id]);
        if (receiver.length === 0) {
            return res.status(404).json({ error: 'Alıcı bulunamadı' });
        }

        // Mesaj gönder
        const [result] = await pool.execute(
            `INSERT INTO messages (sender_id, receiver_id, subject, message, is_read, is_deleted_sender, is_deleted_receiver) 
             VALUES (?, ?, ?, ?, 0, 0, 0)`,
            [senderId, receiver_id, subject || null, message]
        );

        console.log(`Message sent: ID=${result.insertId}, From=${senderId}, To=${receiver_id}`);

        res.json({ 
            message: 'Mesaj gönderildi',
            message_id: result.insertId
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Mesajları okundu olarak işaretle
router.put('/messages/:conversationId/read', authenticate, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.id;

        await pool.execute(
            `UPDATE messages 
             SET is_read = 1, read_at = NOW() 
             WHERE receiver_id = ? 
               AND sender_id = ? 
               AND is_read = 0`,
            [userId, conversationId]
        );

        res.json({ message: 'Mesajlar okundu olarak işaretlendi' });
    } catch (error) {
        console.error('Mark messages read error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı bilgisi getir (ID ile) - En sona koyuldu çünkü /:id genel route
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const [users] = await pool.execute(
            'SELECT id, username, email, created_at FROM users WHERE id = ?',
            [id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const user = users[0];
        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

