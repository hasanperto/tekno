import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Blog yazılarını getir
router.get('/', async (req, res) => {
    try {
        const { category, tag, page = 1, limit = 10, lang = 'tr' } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT bp.*, u.username as author_name,
             COALESCE(ct.title, bp.title) as title,
             COALESCE(ct.description, bp.excerpt) as excerpt,
             bc.name as category_name, bc.slug as category_slug,
             (SELECT COUNT(*) FROM blog_comments WHERE post_id = bp.id AND is_approved = 1) as comment_count
            FROM blog_posts bp
            LEFT JOIN users u ON bp.user_id = u.id
            LEFT JOIN blog_categories bc ON bp.category_id = bc.id
            LEFT JOIN content_translations ct ON ct.content_id = bp.id 
                AND ct.content_type = 'blog' 
                AND ct.language_code = ?
            WHERE bp.status = 'published'
        `;
        const params = [lang];

        if (category) {
            query += ' AND bc.slug = ?';
            params.push(category);
        }

        query += ' ORDER BY bp.published_at DESC, bp.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [posts] = await pool.execute(query, params);

        res.json({ posts });
    } catch (error) {
        console.error('Get blog posts error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Blog yazısı detayı
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { lang = 'tr' } = req.query;
        
        const [posts] = await pool.execute(
            `SELECT bp.*, u.username as author_name,
             COALESCE(ct.title, bp.title) as title,
             COALESCE(ct.description, bp.excerpt) as excerpt,
             COALESCE(ct.content, bp.content) as content,
             bc.name as category_name, bc.slug as category_slug
             FROM blog_posts bp
             LEFT JOIN users u ON bp.user_id = u.id
             LEFT JOIN blog_categories bc ON bp.category_id = bc.id
             LEFT JOIN content_translations ct ON ct.content_id = bp.id 
                 AND ct.content_type = 'blog' 
                 AND ct.language_code = ?
             WHERE bp.slug = ? AND bp.status = 'published'`,
            [lang, slug]
        );

        if (posts.length === 0) {
            return res.status(404).json({ error: 'Yazı bulunamadı' });
        }

        // Yorumları getir
        const [comments] = await pool.execute(
            `SELECT bc.*, u.username
             FROM blog_comments bc
             LEFT JOIN users u ON bc.user_id = u.id
             WHERE bc.post_id = ? AND bc.is_approved = 1
             ORDER BY bc.created_at DESC`,
            [posts[0].id]
        );

        // Görüntülenme sayısını artır
        await pool.execute('UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?', [posts[0].id]);

        res.json({ post: posts[0], comments });
    } catch (error) {
        console.error('Get blog post error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Yorum ekle
router.post('/:id/comments', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const userId = req.user.id;

        if (!comment) {
            return res.status(400).json({ error: 'Yorum gereklidir' });
        }

        await pool.execute(
            'INSERT INTO blog_comments (post_id, user_id, comment, is_approved) VALUES (?, ?, ?, ?)',
            [id, userId, comment, 1] // Otomatik onay
        );

        res.status(201).json({ message: 'Yorumunuz eklendi' });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

