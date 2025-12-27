import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Kart tipini belirle (basit kontrol)
const getCardType = (cardNumber) => {
    const number = cardNumber.replace(/\s/g, '');
    if (/^4/.test(number)) return 'Visa';
    if (/^5[1-5]/.test(number)) return 'MasterCard';
    if (/^3[47]/.test(number)) return 'AmericanExpress';
    if (/^6/.test(number)) return 'Discover';
    return 'Other';
};

// Kart numarasını maskele
const maskCardNumber = (cardNumber) => {
    const number = cardNumber.replace(/\s/g, '');
    const lastFour = number.slice(-4);
    return `**** **** **** ${lastFour}`;
};

// Kullanıcı kartlarını getir
router.get('/', authenticate, async (req, res) => {
    try {
        const [cards] = await pool.execute(
            'SELECT * FROM user_payment_cards WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [req.user.id]
        );

        res.json({ cards });
    } catch (error) {
        console.error('Get cards error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Yeni kart ekle
router.post('/', authenticate, async (req, res) => {
    try {
        const { card_number, card_holder, expiry_date, cvv, save_card } = req.body;
        const userId = req.user.id;

        if (!card_number || !card_holder || !expiry_date) {
            return res.status(400).json({ error: 'Kart numarası, kart sahibi ve son kullanma tarihi zorunludur' });
        }

        // Kart numarasını temizle
        const cleanNumber = card_number.replace(/\s/g, '');
        if (cleanNumber.length < 13 || cleanNumber.length > 19) {
            return res.status(400).json({ error: 'Geçersiz kart numarası' });
        }

        // Son kullanma tarihini parse et
        const [month, year] = expiry_date.split('/');
        if (!month || !year || month.length !== 2 || year.length !== 2) {
            return res.status(400).json({ error: 'Geçersiz son kullanma tarihi (MM/YY formatında olmalı)' });
        }

        // Kart tipini belirle
        const cardType = getCardType(cleanNumber);
        const lastFour = cleanNumber.slice(-4);
        const maskedNumber = maskCardNumber(cleanNumber);

        // Eğer varsayılan olarak işaretleniyorsa, diğer kartların varsayılanını kaldır
        // İlk kart ise otomatik varsayılan yap
        const [existingCards] = await pool.execute(
            'SELECT COUNT(*) as count FROM user_payment_cards WHERE user_id = ?',
            [userId]
        );
        const isFirstCard = existingCards[0].count === 0;

        if (isFirstCard || save_card) {
            if (isFirstCard) {
                await pool.execute(
                    'UPDATE user_payment_cards SET is_default = 0 WHERE user_id = ?',
                    [userId]
                );
            }
        }

        // TODO: Gerçek uygulamada kart bilgileri Stripe/Iyzico gibi bir ödeme gateway'ine gönderilir
        // ve token alınır. Şimdilik token NULL olarak kaydediyoruz.
        const token = null; // save_card ? 'token_from_payment_gateway' : null;

        const [result] = await pool.execute(
            `INSERT INTO user_payment_cards 
             (user_id, card_type, card_holder, masked_number, last_four, expiry_month, expiry_year, expiry_date, is_default, token)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, cardType, card_holder, maskedNumber, lastFour, month, `20${year}`, expiry_date, isFirstCard ? 1 : 0, token]
        );

        res.status(201).json({ 
            message: 'Kart başarıyla eklendi',
            card: { 
                id: result.insertId, 
                card_type: cardType,
                card_holder,
                masked_number: maskedNumber,
                last_four: lastFour,
                expiry_date,
                is_default: isFirstCard ? 1 : 0
            }
        });
    } catch (error) {
        console.error('Add card error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kart sil
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [result] = await pool.execute(
            'DELETE FROM user_payment_cards WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Kart bulunamadı' });
        }

        res.json({ message: 'Kart başarıyla silindi' });
    } catch (error) {
        console.error('Delete card error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Varsayılan kartı ayarla
router.post('/:id/set-default', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Kartın kullanıcıya ait olduğunu kontrol et
        const [cards] = await pool.execute(
            'SELECT id FROM user_payment_cards WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (cards.length === 0) {
            return res.status(404).json({ error: 'Kart bulunamadı' });
        }

        // Diğer kartların varsayılanını kaldır
        await pool.execute(
            'UPDATE user_payment_cards SET is_default = 0 WHERE user_id = ?',
            [userId]
        );

        // Bu kartı varsayılan yap
        await pool.execute(
            'UPDATE user_payment_cards SET is_default = 1 WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        res.json({ message: 'Varsayılan kart güncellendi' });
    } catch (error) {
        console.error('Set default card error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

