import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Public: active pages list (lightweight)
router.get('/', async (req, res) => {
    try {
        const [pages] = await pool.execute(
            `SELECT id, title, slug, meta_title, meta_description, status, created_at, updated_at
             FROM pages
             WHERE status = 'active'
             ORDER BY created_at DESC`
        );
        res.json({ pages });
    } catch (error) {
        console.error('Get public pages error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Public: get page by slug (with translations if available)
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const [rows] = await pool.execute(
            `SELECT *
             FROM pages
             WHERE slug = ? AND status = 'active'
             LIMIT 1`,
            [slug]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Sayfa bulunamadı' });
        }

        const page = rows[0];

        // Optional: translations
        let translations = {};
        try {
            const [transRows] = await pool.execute(
                `SELECT language_code, title, description
                 FROM content_translations
                 WHERE content_id = ? AND content_type = 'page'`,
                [page.id]
            );

            transRows.forEach((t) => {
                translations[t.language_code] = {
                    title: t.title,
                    description: t.description,
                };
            });
        } catch (err) {
            // table might not exist in some environments
            console.warn('Content translations table not available or error:', err.message);
        }

        res.json({ page, translations });
    } catch (error) {
        console.error('Get public page by slug error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;


