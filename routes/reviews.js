import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Yorum ekle
router.post('/projects/:projectId', authenticate, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { comment, rating } = req.body;
        const userId = req.user.id;

        if (!comment || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Geçerli bir yorum ve puan giriniz (1-5)' });
        }

        // Daha önce yorum yapılmış mı kontrol et
        const [existing] = await pool.execute(
            'SELECT id FROM reviews WHERE project_id = ? AND user_id = ?',
            [projectId, userId]
        );

        if (existing.length > 0) {
            // Güncelle
            await pool.execute(
                'UPDATE reviews SET comment = ?, rating = ?, updated_at = NOW() WHERE id = ?',
                [comment, rating, existing[0].id]
            );
            return res.json({ message: 'Yorumunuz güncellendi' });
        }

        // Yeni yorum ekle
        const [result] = await pool.execute(
            'INSERT INTO reviews (project_id, user_id, comment, rating, is_approved) VALUES (?, ?, ?, ?, ?)',
            [projectId, userId, comment, rating, 1] // Otomatik onay
        );

        // Proje ortalama puanını güncelle
        const [avgRating] = await pool.execute(
            'SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews FROM reviews WHERE project_id = ? AND is_approved = 1',
            [projectId]
        );

        await pool.execute(
            'UPDATE projects SET rating = ?, review_count = ? WHERE id = ?',
            [avgRating[0].avg_rating || 0, avgRating[0].total_reviews, projectId]
        );

        res.status(201).json({ 
            message: 'Yorumunuz eklendi',
            review_id: result.insertId 
        });
    } catch (error) {
        console.error('Review error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Proje yorumlarını getir
router.get('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        const [reviews] = await pool.execute(
            `SELECT r.*, u.username, u.first_name, u.last_name
             FROM reviews r
             LEFT JOIN users u ON r.user_id = u.id
             WHERE r.project_id = ? AND r.is_approved = 1
             ORDER BY r.created_at DESC`,
            [projectId]
        );

        res.json({ reviews });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

