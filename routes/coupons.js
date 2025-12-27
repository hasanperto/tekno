import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Kupon kontrolü ve kullanımı
router.post('/validate', authenticate, async (req, res) => {
    try {
        const { code, project_id } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Kupon kodu gereklidir' });
        }

        const [coupons] = await pool.execute(
            `SELECT * FROM coupons 
             WHERE code = ? AND status = 'active' 
             AND (expires_at IS NULL OR expires_at > NOW())
             AND (usage_limit IS NULL OR usage_count < usage_limit)`,
            [code.toUpperCase()]
        );

        if (coupons.length === 0) {
            return res.status(404).json({ error: 'Geçersiz veya süresi dolmuş kupon' });
        }

        const coupon = coupons[0];

        // Kullanıcı daha önce bu kuponu kullandı mı?
        if (coupon.one_time_use) {
            const [used] = await pool.execute(
                'SELECT id FROM orders WHERE user_id = ? AND coupon_code = ?',
                [req.user.id, code]
            );
            if (used.length > 0) {
                return res.status(400).json({ error: 'Bu kupon daha önce kullanılmış' });
            }
        }

        res.json({ 
            valid: true,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            coupon: coupon
        });
    } catch (error) {
        console.error('Validate coupon error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin - Kupon oluştur
router.post('/admin/create', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin yetkisi gerekli' });
        }

        const { code, discount_type, discount_value, expires_at, usage_limit, one_time_use } = req.body;

        if (!code || !discount_type || !discount_value) {
            return res.status(400).json({ error: 'Tüm alanlar gereklidir' });
        }

        await pool.execute(
            `INSERT INTO coupons (code, discount_type, discount_value, expires_at, usage_limit, one_time_use, status)
             VALUES (?, ?, ?, ?, ?, ?, 'active')`,
            [code.toUpperCase(), discount_type, discount_value, expires_at || null, usage_limit || null, one_time_use || 0]
        );

        res.status(201).json({ message: 'Kupon oluşturuldu' });
    } catch (error) {
        console.error('Create coupon error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

