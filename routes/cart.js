import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Sepete ekle
router.post('/add', authenticate, async (req, res) => {
    try {
        const { project_id, quantity = 1 } = req.body;
        const userId = req.user.id;

        if (!project_id) {
            return res.status(400).json({ error: 'Proje ID gereklidir' });
        }

        // Proje kontrolü
        const [projects] = await pool.execute('SELECT * FROM projects WHERE id = ?', [project_id]);
        if (projects.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı' });
        }
        
        const project = projects[0];
        // Sadece aktif projeler sepete eklenebilir
        if (project.status !== 'approved' && project.status !== 'active') {
            return res.status(400).json({ error: 'Bu proje sepete eklenemez' });
        }

        // Sepette var mı kontrol et
        const [existing] = await pool.execute(
            'SELECT id, quantity FROM cart WHERE user_id = ? AND project_id = ?',
            [userId, project_id]
        );

        if (existing.length > 0) {
            // Miktarı güncelle
            await pool.execute(
                'UPDATE cart SET quantity = quantity + ? WHERE id = ?',
                [quantity, existing[0].id]
            );
            return res.json({ message: 'Sepet güncellendi' });
        }

        // Yeni ekle
        await pool.execute(
            'INSERT INTO cart (user_id, project_id, quantity) VALUES (?, ?, ?)',
            [userId, project_id, quantity]
        );

        res.status(201).json({ message: 'Sepete eklendi' });
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Sepeti getir
router.get('/', authenticate, async (req, res) => {
    try {
        const { lang = 'tr' } = req.query;
        const [cartItems] = await pool.execute(
            `SELECT c.*, p.title, p.price, p.discount_price, p.slug, p.currency,
             (SELECT image_path FROM project_images WHERE project_id = p.id AND is_primary = 1 LIMIT 1) as image
             FROM cart c
             INNER JOIN projects p ON c.project_id = p.id
             WHERE c.user_id = ?`,
            [req.user.id]
        );
        
        // Her item için çevirileri getir
        for (let item of cartItems) {
            try {
                const [transRows] = await pool.execute(
                    `SELECT language_code, title
                     FROM content_translations
                     WHERE content_id = ? AND content_type = 'project' AND language_code = ?`,
                    [item.project_id, lang]
                );
                if (transRows.length > 0 && transRows[0].title) {
                    item.title = transRows[0].title;
                }
            } catch (err) {
                console.warn(`Translation fetch error for project ${item.project_id}:`, err.message);
            }
        }
        
        // URL'leri düzelt
        cartItems.forEach(item => {
            if (item.image) {
                item.image = `/uploads/${item.image}`;
            }
            // Quantity varsayılan değeri
            if (!item.quantity) {
                item.quantity = 1;
            }
        });

        // Toplam hesapla
        let total = 0;
        cartItems.forEach(item => {
            const price = parseFloat(item.discount_price || item.price);
            const quantity = item.quantity || 1;
            total += price * quantity;
        });

        res.json({ items: cartItems, total });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Sepet miktarını güncelle
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;

        if (!quantity || quantity < 1) {
            return res.status(400).json({ error: 'Geçerli bir miktar girin' });
        }

        // Sepet öğesinin kullanıcıya ait olduğunu kontrol et
        const [cartItems] = await pool.execute(
            'SELECT * FROM cart WHERE id = ? AND user_id = ?',
            [id, req.user.id]
        );

        if (cartItems.length === 0) {
            return res.status(404).json({ error: 'Sepet öğesi bulunamadı' });
        }

        // Miktarı güncelle
        await pool.execute(
            'UPDATE cart SET quantity = ? WHERE id = ?',
            [quantity, id]
        );

        res.json({ message: 'Sepet güncellendi' });
    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Sepetten çıkar
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('DELETE FROM cart WHERE id = ? AND user_id = ?', [id, req.user.id]);
        
        res.json({ message: 'Sepetten çıkarıldı' });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Sepeti temizle
router.delete('/', authenticate, async (req, res) => {
    try {
        await pool.execute('DELETE FROM cart WHERE user_id = ?', [req.user.id]);
        res.json({ message: 'Sepet temizlendi' });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

