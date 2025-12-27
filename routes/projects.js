import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Tüm projeleri getir
router.get('/', async (req, res) => {
    try {
        const { category, search, page = 1, limit = 20, lang = 'tr' } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT p.*, u.username, c.name as category_name,
            (SELECT image_path FROM project_images WHERE project_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
            FROM projects p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.status IN ('approved', 'active')
        `;
        const params = [];

        if (category) {
            query += ' AND c.slug = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (p.title LIKE ? OR p.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [projects] = await pool.execute(query, params);

        // Her proje için görselleri ve teknolojileri getir
        for (let project of projects) {
            // Primary image URL'ini düzelt
            if (project.primary_image) {
                project.primary_image = `/uploads/${project.primary_image}`;
            }
            
            const [images] = await pool.execute(
                'SELECT image_path, is_primary, sort_order FROM project_images WHERE project_id = ? ORDER BY sort_order ASC, is_primary DESC LIMIT 5',
                [project.id]
            );
            // URL'leri düzelt: /uploads/ prefix ekle
            project.images = images.map(img => ({
                ...img,
                image_path: img.image_path ? `/uploads/${img.image_path}` : null
            }));
            
            // Teknolojileri (tags) getir
            const [tags] = await pool.execute(
                `SELECT t.id, t.name, t.slug FROM tags t
                 INNER JOIN project_tags pt ON t.id = pt.tag_id
                 WHERE pt.project_id = ? ORDER BY t.name ASC LIMIT 10`,
                [project.id]
            );
            project.tags = tags;
            
            // Çevirileri getir
            try {
                const [transRows] = await pool.execute(
                    `SELECT language_code, title, description, short_description
                     FROM content_translations
                     WHERE content_id = ? AND content_type = 'project' AND language_code = ?`,
                    [project.id, lang]
                );
                if (transRows.length > 0) {
                    const trans = transRows[0];
                    if (trans.title) project.title = trans.title;
                    if (trans.description) project.description = trans.description;
                    if (trans.short_description) project.short_description = trans.short_description;
                }
            } catch (err) {
                console.warn(`Translation fetch error for project ${project.id}:`, err.message);
            }
        }

        // Toplam sayı
        let countQuery = 'SELECT COUNT(*) as total FROM projects p LEFT JOIN categories c ON p.category_id = c.id WHERE p.status IN (?, ?)';
        const countParams = ['approved', 'active'];

        if (category) {
            countQuery += ' AND c.slug = ?';
            countParams.push(category);
        }

        if (search) {
            countQuery += ' AND (p.title LIKE ? OR p.description LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [countResult] = await pool.execute(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            projects,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kategorileri getir (/:id'den önce olmalı)
router.get('/categories/list', async (req, res) => {
    try {
        const [categories] = await pool.execute(
            'SELECT * FROM categories WHERE status = ? ORDER BY sort_order ASC',
            ['active']
        );
        res.json({ categories });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Etiketleri getir (/:id'den önce olmalı)
router.get('/tags/list', async (req, res) => {
    try {
        const [tags] = await pool.execute(
            'SELECT * FROM tags ORDER BY name ASC'
        );
        res.json({ tags });
    } catch (error) {
        console.error('Get tags error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Tek proje detayı (en sonda olmalı)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [projects] = await pool.execute(
            `SELECT p.*, u.username, u.email as seller_email, c.name as category_name,
                    p.admin_demo_url, p.demo_username, p.demo_password, p.admin_username, p.admin_password
             FROM projects p
             LEFT JOIN users u ON p.user_id = u.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = ? AND p.status IN ('approved', 'active')`,
            [id]
        );

        if (projects.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı' });
        }

        const project = projects[0];

        // Görselleri getir ve URL'leri düzelt
        const [images] = await pool.execute(
            'SELECT * FROM project_images WHERE project_id = ? ORDER BY sort_order ASC',
            [id]
        );
        const imagesWithUrls = images.map(img => ({
            ...img,
            image_path: img.image_path ? `/uploads/${img.image_path}` : null
        }));

        // Etiketleri getir
        const [tags] = await pool.execute(
            `SELECT t.* FROM tags t
             INNER JOIN project_tags pt ON t.id = pt.tag_id
             WHERE pt.project_id = ?`,
            [id]
        );

        // Yorumları getir
        const [reviews] = await pool.execute(
            `SELECT r.*, u.username FROM reviews r
             LEFT JOIN users u ON r.user_id = u.id
             WHERE r.project_id = ? AND r.is_approved = 1
             ORDER BY r.created_at DESC`,
            [id]
        );

        // Çevirileri getir
        const { lang = 'tr' } = req.query;
        try {
            const [transRows] = await pool.execute(
                `SELECT language_code, title, description, short_description
                 FROM content_translations
                 WHERE content_id = ? AND content_type = 'project' AND language_code = ?`,
                [id, lang]
            );
            if (transRows.length > 0) {
                const trans = transRows[0];
                if (trans.title) project.title = trans.title;
                if (trans.description) project.description = trans.description;
                if (trans.short_description) project.short_description = trans.short_description;
            }
        } catch (err) {
            console.warn(`Translation fetch error for project ${id}:`, err.message);
        }

        // Görüntülenme sayısını artır
        await pool.execute('UPDATE projects SET view_count = view_count + 1 WHERE id = ?', [id]);

        res.json({
            ...project,
            images: imagesWithUrls,
            tags,
            reviews
        });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

