import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Kullanıcı adreslerini getir
router.get('/', authenticate, async (req, res) => {
    try {
        const [addresses] = await pool.execute(
            'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [req.user.id]
        );

        res.json({ addresses });
    } catch (error) {
        console.error('Get addresses error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Yeni adres ekle
router.post('/', authenticate, async (req, res) => {
    try {
        const { type, name, address_line1, address_line2, city, district, postal_code, country, phone, is_default } = req.body;
        const userId = req.user.id;

        if (!name || !address_line1 || !city) {
            return res.status(400).json({ error: 'Ad, adres ve şehir zorunludur' });
        }

        // Eğer varsayılan olarak işaretleniyorsa, diğer adreslerin varsayılanını kaldır
        if (is_default) {
            await pool.execute(
                'UPDATE user_addresses SET is_default = 0 WHERE user_id = ?',
                [userId]
            );
        }

        const [result] = await pool.execute(
            `INSERT INTO user_addresses 
             (user_id, type, name, address_line1, address_line2, city, district, postal_code, country, phone, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, type || 'home', name, address_line1, address_line2 || null, city, district || null, postal_code || null, country || 'Türkiye', phone || null, is_default ? 1 : 0]
        );

        res.status(201).json({ 
            message: 'Adres başarıyla eklendi',
            address: { id: result.insertId, ...req.body }
        });
    } catch (error) {
        console.error('Add address error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Adres güncelle
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { type, name, address_line1, address_line2, city, district, postal_code, country, phone, is_default } = req.body;
        const userId = req.user.id;

        // Adresin kullanıcıya ait olduğunu kontrol et
        const [addresses] = await pool.execute(
            'SELECT id FROM user_addresses WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (addresses.length === 0) {
            return res.status(404).json({ error: 'Adres bulunamadı' });
        }

        // Eğer varsayılan olarak işaretleniyorsa, diğer adreslerin varsayılanını kaldır
        if (is_default) {
            await pool.execute(
                'UPDATE user_addresses SET is_default = 0 WHERE user_id = ? AND id != ?',
                [userId, id]
            );
        }

        await pool.execute(
            `UPDATE user_addresses 
             SET type = ?, name = ?, address_line1 = ?, address_line2 = ?, city = ?, district = ?, 
                 postal_code = ?, country = ?, phone = ?, is_default = ?
             WHERE id = ? AND user_id = ?`,
            [type, name, address_line1, address_line2 || null, city, district || null, postal_code || null, country || 'Türkiye', phone || null, is_default ? 1 : 0, id, userId]
        );

        res.json({ message: 'Adres başarıyla güncellendi' });
    } catch (error) {
        console.error('Update address error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Adres sil
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [result] = await pool.execute(
            'DELETE FROM user_addresses WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Adres bulunamadı' });
        }

        res.json({ message: 'Adres başarıyla silindi' });
    } catch (error) {
        console.error('Delete address error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Varsayılan adresi ayarla
router.post('/:id/set-default', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Adresin kullanıcıya ait olduğunu kontrol et
        const [addresses] = await pool.execute(
            'SELECT id FROM user_addresses WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (addresses.length === 0) {
            return res.status(404).json({ error: 'Adres bulunamadı' });
        }

        // Diğer adreslerin varsayılanını kaldır
        await pool.execute(
            'UPDATE user_addresses SET is_default = 0 WHERE user_id = ?',
            [userId]
        );

        // Bu adresi varsayılan yap
        await pool.execute(
            'UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        res.json({ message: 'Varsayılan adres güncellendi' });
    } catch (error) {
        console.error('Set default address error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

