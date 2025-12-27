import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Public settings (sadece gerekli alanlar)
// GET /api/public/settings/:group
router.get('/:group', async (req, res) => {
    try {
        const { group } = req.params;
        const [rows] = await pool.execute(
            'SELECT `key`, `value`, `type` FROM settings WHERE `group` = ?',
            [group]
        );

        const result = {};
        for (const r of rows) {
            if (r.type === 'boolean') result[r.key] = r.value === '1' || r.value === 'true';
            else if (r.type === 'number') result[r.key] = parseFloat(r.value) || 0;
            else result[r.key] = r.value;
        }

        res.json(result);
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') return res.json({});
        console.error('Public settings error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;


