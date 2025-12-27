import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Public menü endpoint'i (navbar/footer için)
// GET /api/menus/:type  -> sadece aktif menü öğeleri
router.get('/:type', async (req, res) => {
    try {
        const { type } = req.params;

        const [items] = await pool.execute(
            'SELECT * FROM menu_items WHERE menu_type = ? AND status = ? ORDER BY `order` ASC',
            [type, 'active']
        );

        console.log(`[MENUS] type=${type} active_count=${items.length}`);
        res.json({ items });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            console.log(`[MENUS] type=${req.params.type} table_missing`);
            return res.json({ items: [] });
        }
        console.error('Public menus error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;


