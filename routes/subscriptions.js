import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Abonelik planlarını getir
router.get('/plans', async (req, res) => {
    try {
        const [plans] = await pool.execute(
            `SELECT sp.*, 
             GROUP_CONCAT(pf.feature_name) as features
             FROM subscription_plans sp
             LEFT JOIN plan_features pf ON sp.id = pf.plan_id
             WHERE sp.status = 'active'
             GROUP BY sp.id
             ORDER BY sp.price ASC`
        );

        res.json({ plans });
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcının aboneliklerini getir
router.get('/my-subscriptions', authenticate, async (req, res) => {
    try {
        const [subscriptions] = await pool.execute(
            `SELECT us.*, sp.name as plan_name, sp.price, sp.billing_period
             FROM user_subscriptions us
             INNER JOIN subscription_plans sp ON us.plan_id = sp.id
             WHERE us.user_id = ?
             ORDER BY us.created_at DESC`,
            [req.user.id]
        );

        res.json({ subscriptions });
    } catch (error) {
        console.error('Get subscriptions error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Abonelik oluştur
router.post('/subscribe', authenticate, async (req, res) => {
    try {
        const { plan_id, payment_method } = req.body;
        const userId = req.user.id;

        if (!plan_id) {
            return res.status(400).json({ error: 'Plan seçiniz' });
        }

        // Plan kontrolü
        const [plans] = await pool.execute('SELECT * FROM subscription_plans WHERE id = ? AND status = ?', [plan_id, 'active']);
        if (plans.length === 0) {
            return res.status(404).json({ error: 'Plan bulunamadı' });
        }

        const plan = plans[0];
        const startDate = new Date();
        const endDate = new Date();
        
        if (plan.billing_period === 'monthly') {
            endDate.setMonth(endDate.getMonth() + 1);
        } else if (plan.billing_period === 'yearly') {
            endDate.setFullYear(endDate.getFullYear() + 1);
        }

        // Abonelik oluştur
        const [result] = await pool.execute(
            `INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status, payment_method)
             VALUES (?, ?, ?, ?, 'active', ?)`,
            [userId, plan_id, startDate, endDate, payment_method || 'pending']
        );

        // Ödeme kaydı
        await pool.execute(
            `INSERT INTO subscription_transactions (subscription_id, amount, payment_status, payment_method)
             VALUES (?, ?, 'pending', ?)`,
            [result.insertId, plan.price, payment_method || 'pending']
        );

        res.status(201).json({ 
            message: 'Abonelik oluşturuldu',
            subscription_id: result.insertId 
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Abonelik iptal
router.post('/cancel/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute(
            'UPDATE user_subscriptions SET status = ?, cancelled_at = NOW() WHERE id = ? AND user_id = ?',
            ['cancelled', id, req.user.id]
        );

        res.json({ message: 'Abonelik iptal edildi' });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

