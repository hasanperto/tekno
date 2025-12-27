import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Sipariş oluştur
router.post('/', authenticate, async (req, res) => {
    try {
        const { billing_info, coupon_code, payment_method, card_id } = req.body;
        const userId = req.user.id;

        if (!billing_info || !billing_info.name || !billing_info.email || !billing_info.address) {
            return res.status(400).json({ error: 'Fatura bilgileri eksik' });
        }

        // Sepeti getir
        const [cartItems] = await pool.execute(
            `SELECT c.*, p.title, p.price, p.discount_price, p.currency
             FROM cart c
             INNER JOIN projects p ON c.project_id = p.id
             WHERE c.user_id = ?`,
            [userId]
        );

        if (cartItems.length === 0) {
            return res.status(400).json({ error: 'Sepet boş' });
        }

        // Toplam hesapla
        let totalAmount = 0;
        let discountAmount = 0;
        const orderItems = [];

        cartItems.forEach(item => {
            const price = parseFloat(item.discount_price || item.price);
            const quantity = item.quantity || 1;
            const subtotal = price * quantity;
            totalAmount += subtotal;
            orderItems.push({
                project_id: item.project_id,
                title: item.title,
                price: price,
                quantity: quantity,
                subtotal: subtotal
            });
        });

        // Kupon kontrolü
        if (coupon_code) {
            const [coupons] = await pool.execute(
                `SELECT * FROM coupons 
                 WHERE code = ? AND status = 'active' 
                 AND (expires_at IS NULL OR expires_at > NOW())
                 AND (usage_limit IS NULL OR usage_count < usage_limit)`,
                [coupon_code.toUpperCase()]
            );

            if (coupons.length > 0) {
                const coupon = coupons[0];
                
                // Minimum tutar kontrolü
                if (coupon.min_amount && totalAmount < coupon.min_amount) {
                    return res.status(400).json({ error: `Bu kupon için minimum ${coupon.min_amount} TL tutarında alışveriş yapmalısınız` });
                }

                // İndirim hesapla
                if (coupon.discount_type === 'percentage') {
                    discountAmount = (totalAmount * coupon.discount_value) / 100;
                    if (coupon.max_amount) {
                        discountAmount = Math.min(discountAmount, coupon.max_amount);
                    }
                } else {
                    discountAmount = coupon.discount_value;
                }

                // Kupon kullanım sayısını artır
                await pool.execute(
                    'UPDATE coupons SET usage_count = usage_count + 1 WHERE id = ?',
                    [coupon.id]
                );
            }
        }

        const finalAmount = totalAmount - discountAmount;

        // Mevcut komisyon oranını al (siparişe kaydetmek için)
        let commissionRate = 15; // Varsayılan
        try {
            const [settings] = await pool.execute(
                "SELECT value FROM settings WHERE `key` = 'commission_rate' AND (`group` = 'general' OR `group` = 'financial') ORDER BY CASE WHEN `group` = 'general' THEN 1 ELSE 2 END LIMIT 1"
            );
            if (settings.length > 0) {
                commissionRate = parseFloat(settings[0].value) || 15;
            }
        } catch (e) {
            console.warn('Commission rate fetch error:', e.message);
        }

        // Sipariş numarası oluştur
        const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Sipariş oluştur (komisyon oranını da kaydet)
        // commission_rate kolonu yoksa hata vermemesi için try-catch kullan
        let orderResult;
        try {
            [orderResult] = await pool.execute(
                `INSERT INTO orders (order_number, user_id, total_amount, discount_amount, final_amount, currency, coupon_code, payment_method, payment_status, order_status, commission_rate)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?)`,
                [
                    orderNumber,
                    userId,
                    totalAmount,
                    discountAmount,
                    finalAmount,
                    cartItems[0].currency || 'TRY',
                    coupon_code || null,
                    payment_method || 'credit_card',
                    commissionRate
                ]
            );
        } catch (error) {
            // Eğer commission_rate kolonu yoksa, kolon olmadan ekle
            if (error.code === 'ER_BAD_FIELD_ERROR' || error.message.includes('commission_rate')) {
                console.warn('commission_rate kolonu bulunamadı, kolon olmadan sipariş oluşturuluyor. Lütfen database_add_commission_rate_to_orders.sql dosyasını çalıştırın.');
                [orderResult] = await pool.execute(
                    `INSERT INTO orders (order_number, user_id, total_amount, discount_amount, final_amount, currency, coupon_code, payment_method, payment_status, order_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
                    [
                        orderNumber,
                        userId,
                        totalAmount,
                        discountAmount,
                        finalAmount,
                        cartItems[0].currency || 'TRY',
                        coupon_code || null,
                        payment_method || 'credit_card'
                    ]
                );
            } else {
                throw error;
            }
        }

        const orderId = orderResult.insertId;

        // Sipariş kalemlerini ekle
        for (const item of orderItems) {
            await pool.execute(
                `INSERT INTO order_items (order_id, project_id, price, quantity, subtotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [orderId, item.project_id, item.price, item.quantity, item.subtotal]
            );
        }

        // Sepeti temizle
        await pool.execute('DELETE FROM cart WHERE user_id = ?', [userId]);

        // Transaction kaydı oluştur
        await pool.execute(
            `INSERT INTO transactions (user_id, order_id, type, amount, currency, status, payment_gateway, description)
             VALUES (?, ?, 'purchase', ?, ?, 'pending', ?, ?)`,
            [
                userId,
                orderId,
                finalAmount,
                cartItems[0].currency || 'TRY',
                payment_method || 'credit_card',
                `Sipariş #${orderNumber}`
            ]
        );

        res.status(201).json({
            message: 'Sipariş oluşturuldu',
            order: {
                id: orderId,
                order_number: orderNumber,
                total_amount: totalAmount,
                discount_amount: discountAmount,
                final_amount: finalAmount,
                items: orderItems
            }
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı siparişlerini getir
router.get('/', authenticate, async (req, res) => {
    try {
        const { lang = 'tr' } = req.query;
        
        const [orders] = await pool.execute(
            `SELECT o.*, 
             COUNT(oi.id) as item_count,
             GROUP_CONCAT(
                 JSON_OBJECT(
                     'id', oi.id,
                     'project_id', oi.project_id,
                     'project_title', COALESCE(ct.title, p.title),
                     'quantity', oi.quantity,
                     'price', oi.price
                 ) SEPARATOR '|||'
             ) as items_json
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN projects p ON oi.project_id = p.id
             LEFT JOIN content_translations ct ON ct.content_id = p.id 
                 AND ct.content_type = 'project' 
                 AND ct.language_code = ?
             WHERE o.user_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [lang, req.user.id]
        );

        // items_json'u parse et
        const ordersWithItems = orders.map(order => {
            if (order.items_json) {
                try {
                    order.items = order.items_json.split('|||').map(item => JSON.parse(item));
                } catch (e) {
                    order.items = [];
                }
            } else {
                order.items = [];
            }
            delete order.items_json;
            return order;
        });

        res.json({ orders: ordersWithItems });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Sipariş detayı
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Sipariş bilgisi
        const [orders] = await pool.execute(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [id, req.user.id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const order = orders[0];

        // Sipariş kalemleri
        const [orderItems] = await pool.execute(
            `SELECT oi.*, p.title, p.slug, p.user_id as seller_id,
             u.username as seller_username, u.email as seller_email,
             (SELECT image_path FROM project_images WHERE project_id = p.id AND is_primary = 1 LIMIT 1) as image
             FROM order_items oi
             INNER JOIN projects p ON oi.project_id = p.id
             LEFT JOIN users u ON p.user_id = u.id
             WHERE oi.order_id = ?`,
            [id]
        );

        // Her ürün için tüm görselleri getir
        for (let item of orderItems) {
            // URL'leri düzelt
            if (item.image) {
                item.image = `/uploads/${item.image}`;
            }
            
            // Tüm görselleri getir
            const [images] = await pool.execute(
                `SELECT image_path, is_primary 
                 FROM project_images 
                 WHERE project_id = ? 
                 ORDER BY is_primary DESC, id ASC`,
                [item.project_id]
            );
            
            item.images = images.map(img => ({
                path: `/uploads/${img.image_path}`,
                is_primary: img.is_primary
            }));
            
            // Eğer görsel yoksa boş array
            if (!item.images || item.images.length === 0) {
                item.images = [];
            }
        }

        // Transaction bilgisi
        const [transactions] = await pool.execute(
            'SELECT * FROM transactions WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
            [id]
        );

        // Eğer card_number yoksa ve payment_method credit_card ise, user_payment_cards'dan al
        if (!order.card_number && order.payment_method === 'credit_card') {
            const [cards] = await pool.execute(
                'SELECT masked_number, card_holder FROM user_payment_cards WHERE user_id = ? AND is_default = 1 LIMIT 1',
                [req.user.id]
            );
            if (cards.length > 0) {
                order.card_number = cards[0].masked_number;
                order.card_holder = cards[0].card_holder;
            }
        }

        res.json({
            order: {
                ...order,
                items: orderItems,
                transaction: transactions[0] || null
            }
        });
    } catch (error) {
        console.error('Get order detail error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Sipariş iptal
router.post('/:id/cancel', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Sipariş kontrolü
        const [orders] = await pool.execute(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [id, req.user.id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const order = orders[0];

        // Sadece pending veya processing durumundaki siparişler iptal edilebilir
        if (order.order_status !== 'pending' && order.order_status !== 'processing') {
            return res.status(400).json({ error: 'Bu sipariş iptal edilemez' });
        }

        // Sipariş durumunu güncelle
        await pool.execute(
            'UPDATE orders SET order_status = ? WHERE id = ?',
            ['cancelled', id]
        );

        // Ödeme yapıldıysa iade işlemi başlatılabilir
        if (order.payment_status === 'paid') {
            await pool.execute(
                `INSERT INTO transactions (user_id, order_id, type, amount, currency, status, description)
                 VALUES (?, ?, 'refund', ?, ?, 'pending', ?)`,
                [
                    req.user.id,
                    id,
                    order.final_amount,
                    order.currency,
                    `Sipariş #${order.order_number} iadesi`
                ]
            );
        }

        res.json({ message: 'Sipariş iptal edildi' });
    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Fatura indir (PDF oluşturma için hazırlık)
router.get('/:id/invoice', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Sipariş bilgisi
        const [orders] = await pool.execute(
            'SELECT * FROM orders WHERE id = ? AND user_id = ?',
            [id, req.user.id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        // TODO: PDF fatura oluşturma (PDFKit veya benzeri kütüphane kullanılabilir)
        res.json({ 
            message: 'Fatura oluşturma özelliği yakında eklenecek',
            order: orders[0]
        });
    } catch (error) {
        console.error('Get invoice error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

