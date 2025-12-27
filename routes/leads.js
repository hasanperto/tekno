import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Lead formu gönder
router.post('/submit', async (req, res) => {
    try {
        const { name, email, phone, message, interest_areas, project_interest } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Ad ve e-posta gereklidir' });
        }

        // Lead kaydı
        const [result] = await pool.execute(
            `INSERT INTO contact_messages (name, email, phone, message, status, interest_areas, project_interest)
             VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
            [name, email, phone || null, message || null, JSON.stringify(interest_areas || []), project_interest || null]
        );

        // E-posta doğrulama token oluştur (basit)
        const verificationToken = Math.random().toString(36).substring(7);
        await pool.execute(
            'UPDATE contact_messages SET verification_token = ? WHERE id = ?',
            [verificationToken, result.insertId]
        );

        res.status(201).json({ 
            message: 'Mesajınız alındı, en kısa sürede size dönüş yapacağız',
            lead_id: result.insertId 
        });
    } catch (error) {
        console.error('Lead submit error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin - Lead'leri listele
router.get('/admin/list', async (req, res) => {
    try {
        const [leads] = await pool.execute(
            `SELECT * FROM contact_messages 
             ORDER BY created_at DESC 
             LIMIT 100`
        );

        res.json({ leads });
    } catch (error) {
        console.error('Get leads error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Lead durumu güncelle
router.put('/admin/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // pending, contacted, converted, lost

        await pool.execute(
            'UPDATE contact_messages SET status = ? WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'Lead durumu güncellendi' });
    } catch (error) {
        console.error('Update lead status error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

