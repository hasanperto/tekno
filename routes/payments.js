import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Ödeme işlemi başlat (Stripe/Iyzico için hazırlık)
router.post('/process', authenticate, async (req, res) => {
    try {
        const { order_id, payment_method, payment_data } = req.body;
        const userId = req.user.id;

        if (!order_id) {
            return res.status(400).json({ error: 'Sipariş ID gereklidir' });
        }

        // Sipariş kontrolü
        const [orders] = await pool.execute(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [order_id, userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const order = orders[0];

        // Ödeme durumu kontrolü
        if (order.payment_status === 'paid') {
            return res.status(400).json({ error: 'Bu sipariş zaten ödendi' });
        }

        // TODO: Stripe/Iyzico entegrasyonu burada yapılacak
        // Şimdilik demo modunda başarılı dönüş yapıyoruz
        
        // Ödeme başarılı simülasyonu
        const paymentResult = {
            success: true,
            transaction_id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            payment_method: payment_method || order.payment_method,
            amount: order.final_amount,
            currency: order.currency
        };

        // Sipariş durumunu güncelle
        await pool.execute(
            `UPDATE orders 
             SET payment_status = 'paid', 
                 order_status = 'processing',
                 payment_method = ?
             WHERE id = ?`,
            [payment_method || order.payment_method, order_id]
        );

        // Transaction kaydını güncelle
        await pool.execute(
            `UPDATE transactions 
             SET status = 'completed', 
                 transaction_id = ?,
                 payment_gateway = ?
             WHERE order_id = ? AND type = 'purchase'`,
            [
                paymentResult.transaction_id,
                payment_method || 'credit_card',
                order_id
            ]
        );

        res.json({
            success: true,
            message: 'Ödeme başarıyla tamamlandı',
            transaction: paymentResult
        });
    } catch (error) {
        console.error('Process payment error:', error);
        res.status(500).json({ error: 'Ödeme işlemi sırasında bir hata oluştu' });
    }
});

// Ödeme durumu kontrolü
router.get('/status/:order_id', authenticate, async (req, res) => {
    try {
        const { order_id } = req.params;
        const userId = req.user.id;

        const [orders] = await pool.execute(
            'SELECT payment_status, order_status FROM orders WHERE id = ? AND user_id = ?',
            [order_id, userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        res.json({
            payment_status: orders[0].payment_status,
            order_status: orders[0].order_status
        });
    } catch (error) {
        console.error('Get payment status error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Stripe payment intent oluştur (hazırlık)
router.post('/stripe/create-intent', authenticate, async (req, res) => {
    try {
        const { order_id, amount } = req.body;

        // TODO: Stripe API entegrasyonu
        // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        // const paymentIntent = await stripe.paymentIntents.create({
        //     amount: amount * 100, // Stripe cent cinsinden çalışır
        //     currency: 'try',
        //     metadata: { order_id }
        // });

        res.json({
            message: 'Stripe entegrasyonu yakında eklenecek',
            // client_secret: paymentIntent.client_secret
        });
    } catch (error) {
        console.error('Stripe create intent error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Iyzico ödeme başlat (hazırlık)
router.post('/iyzico/initialize', authenticate, async (req, res) => {
    try {
        const { order_id, amount, currency } = req.body;

        // TODO: Iyzico API entegrasyonu
        // const iyzipay = require('iyzipay');
        // const request = {
        //     locale: 'tr',
        //     conversationId: order_id,
        //     price: amount,
        //     paidPrice: amount,
        //     currency: currency || 'TRY',
        //     basketId: order_id,
        //     paymentChannel: 'WEB',
        //     paymentGroup: 'PRODUCT',
        //     callbackUrl: `${process.env.FRONTEND_URL}/payment/callback`
        // };

        res.json({
            message: 'Iyzico entegrasyonu yakında eklenecek',
            // payment_page_url: response.paymentPageUrl
        });
    } catch (error) {
        console.error('Iyzico initialize error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

