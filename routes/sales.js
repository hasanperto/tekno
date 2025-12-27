import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Ürün listesi (projeler olarak)
router.get('/products', async (req, res) => {
    try {
        const { category, search, limit = 20, offset = 0 } = req.query;
        
        let query = `
            SELECT p.*, c.name as category_name, u.username
            FROM projects p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.status = 'active'
        `;
        const params = [];
        
        if (category) {
            query += ' AND c.slug = ?';
            params.push(category);
        }
        
        if (search) {
            query += ' AND (p.title LIKE ? OR p.description LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }
        
        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [products] = await db.query(query, params);
        
        // Toplam sayı
        let countQuery = 'SELECT COUNT(*) as total FROM projects p WHERE p.status = "active"';
        const countParams = [];
        
        if (category) {
            countQuery += ' AND EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.slug = ?)';
            countParams.push(category);
        }
        
        if (search) {
            countQuery += ' AND (p.title LIKE ? OR p.description LIKE ?)';
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm);
        }
        
        const [countResult] = await db.query(countQuery, countParams);
        
        res.json({
            products,
            total: countResult[0].total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Error fetching products' });
    }
});

// Ürün detayı
router.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [products] = await db.query(
            `SELECT p.*, c.name as category_name, u.username, u.email as seller_email
             FROM projects p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN users u ON p.user_id = u.id
             WHERE p.id = ? AND p.status = 'active'`,
            [id]
        );
        
        if (products.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }
        
        // Etiketleri getir
        const [tags] = await db.query(
            `SELECT t.* FROM tags t
             INNER JOIN project_tags pt ON t.id = pt.tag_id
             WHERE pt.project_id = ?`,
            [id]
        );
        
        // Görselleri getir
        const [images] = await db.query(
            'SELECT * FROM project_images WHERE project_id = ? ORDER BY sort_order ASC',
            [id]
        );
        
        res.json({
            ...products[0],
            tags,
            images
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Error fetching product' });
    }
});

// Teklif talebi
router.post('/quote-request', async (req, res) => {
    try {
        const { name, email, phone, company, message, project_id, budget_range } = req.body;
        
        await db.query(
            `INSERT INTO quote_requests (name, email, phone, company, message, project_id, budget_range, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
            [name, email, phone, company, message, project_id, budget_range]
        );
        
        res.json({ message: 'Quote request submitted successfully' });
    } catch (error) {
        console.error('Error submitting quote request:', error);
        res.status(500).json({ message: 'Error submitting quote request' });
    }
});

// Demo talebi
router.post('/demo-request', authenticate, async (req, res) => {
    try {
        const { project_id, message } = req.body;
        const userId = req.user.id;
        
        await db.query(
            `INSERT INTO demo_requests (user_id, project_id, message, status, created_at)
             VALUES (?, ?, ?, 'pending', NOW())`,
            [userId, project_id, message]
        );
        
        res.json({ message: 'Demo request submitted successfully' });
    } catch (error) {
        console.error('Error submitting demo request:', error);
        res.status(500).json({ message: 'Error submitting demo request' });
    }
});

// Siparişler (kullanıcı)
router.get('/orders', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [orders] = await db.query(
            `SELECT o.*, COUNT(oi.id) as item_count
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             WHERE o.user_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [userId]
        );
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Error fetching orders' });
    }
});

// Sipariş detayı
router.get('/orders/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const [orders] = await db.query(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        
        if (orders.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        const [items] = await db.query(
            `SELECT oi.*, p.title, p.slug
             FROM order_items oi
             LEFT JOIN projects p ON oi.project_id = p.id
             WHERE oi.order_id = ?`,
            [id]
        );
        
        res.json({
            ...orders[0],
            items
        });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ message: 'Error fetching order' });
    }
});

// Satış istatistikleri (admin/seller)
router.get('/stats', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Kullanıcı rolünü kontrol et
        const [users] = await db.query('SELECT role_id FROM users WHERE id = ?', [userId]);
        const isAdmin = users[0]?.role_id === 1;
        const isSeller = users[0]?.role_id === 3;
        
        if (!isAdmin && !isSeller) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        
        let statsQuery = `
            SELECT 
                COUNT(DISTINCT o.id) as total_orders,
                COUNT(DISTINCT oi.project_id) as total_products_sold,
                SUM(oi.subtotal) as total_revenue,
                AVG(oi.subtotal) as average_order_value
            FROM orders o
            INNER JOIN order_items oi ON o.id = oi.order_id
            WHERE o.payment_status = 'paid'
        `;
        
        if (isSeller) {
            statsQuery += ` AND EXISTS (
                SELECT 1 FROM projects p 
                WHERE p.id = oi.project_id AND p.user_id = ?
            )`;
        }
        
        const params = isSeller ? [userId] : [];
        const [stats] = await db.query(statsQuery, params);
        
        // Aylık satış trendi
        let trendQuery = `
            SELECT 
                DATE_FORMAT(o.created_at, '%Y-%m') as month,
                SUM(oi.subtotal) as revenue,
                COUNT(DISTINCT o.id) as orders
            FROM orders o
            INNER JOIN order_items oi ON o.id = oi.order_id
            WHERE o.payment_status = 'paid'
        `;
        
        if (isSeller) {
            trendQuery += ` AND EXISTS (
                SELECT 1 FROM projects p 
                WHERE p.id = oi.project_id AND p.user_id = ?
            )`;
        }
        
        trendQuery += ' GROUP BY month ORDER BY month DESC LIMIT 12';
        const [trends] = await db.query(trendQuery, params);
        
        res.json({
            ...stats[0],
            trends
        });
    } catch (error) {
        console.error('Error fetching sales stats:', error);
        res.status(500).json({ message: 'Error fetching sales stats' });
    }
});

// Önerilen ürünler
router.get('/recommended', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Kullanıcının satın aldığı projelerin kategorilerine göre öneri
        const [recommended] = await db.query(
            `SELECT DISTINCT p.*, c.name as category_name
             FROM projects p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.status = 'active'
             AND p.id NOT IN (
                 SELECT oi.project_id FROM orders o
                 INNER JOIN order_items oi ON o.id = oi.order_id
                 WHERE o.user_id = ?
             )
             AND p.category_id IN (
                 SELECT DISTINCT p2.category_id FROM orders o
                 INNER JOIN order_items oi ON o.id = oi.order_id
                 INNER JOIN projects p2 ON oi.project_id = p2.id
                 WHERE o.user_id = ?
             )
             ORDER BY p.rating DESC, p.view_count DESC
             LIMIT 10`,
            [userId, userId]
        );
        
        res.json(recommended);
    } catch (error) {
        console.error('Error fetching recommended products:', error);
        res.status(500).json({ message: 'Error fetching recommended products' });
    }
});

export default router;

