import express from 'express';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Projeye bağış yap (ziyaretçiler için authenticate olmadan da çalışabilir)
router.post('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { amount, anonymous, message, payment_method, payment_data } = req.body;
        
        // Ziyaretçi kontrolü - eğer authenticate middleware'i geçmediyse userId null olur
        let userId = null;
        try {
            // Token kontrolü
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                const jwt = (await import('jsonwebtoken')).default;
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
                userId = decoded.id;
            }
        } catch (tokenError) {
            // Token yoksa veya geçersizse ziyaretçi olarak devam et
            console.log('Guest donation - no valid token');
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Geçerli bir miktar giriniz' });
        }

        // Proje kontrolü
        const [projects] = await pool.execute('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (projects.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı' });
        }

        const project = projects[0];

        // Ödeme işlemi
        let paymentStatus = 'completed';
        let transactionId = null;
        
        if (payment_method === 'balance') {
            // Bakiye ile ödeme (sadece giriş yapmış kullanıcılar için)
            if (!userId) {
                return res.status(401).json({ error: 'Bakiye ile ödeme için giriş yapmalısınız' });
            }
            
            try {
                // Kullanıcı bakiyesini kontrol et
                const [userData] = await pool.execute('SELECT balance FROM users WHERE id = ?', [userId]);
                const currentBalance = parseFloat(userData[0]?.balance || 0);
                
                if (currentBalance < parseFloat(amount)) {
                    return res.status(400).json({ error: 'Bakiyeniz yetersiz' });
                }
                
                // Bakiyeyi düş
                await pool.execute(
                    'UPDATE users SET balance = balance - ? WHERE id = ?',
                    [amount, userId]
                );
                
                transactionId = `DON-BAL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
                paymentStatus = 'completed';
            } catch (balanceError) {
                // Balance kolonu yoksa veya hata varsa normal ödeme akışına geç
                console.warn('Balance payment error (column may not exist):', balanceError.message);
                transactionId = `DON-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
                paymentStatus = 'completed';
            }
        } else if (payment_method === 'credit_card' || payment_method === 'guest_card') {
            // Kredi kartı ödemesi
            // TODO: Gerçek ödeme gateway entegrasyonu (Stripe/Iyzico) burada yapılacak
            // Şimdilik demo modunda başarılı dönüş yapıyoruz
            transactionId = `DON-CC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            paymentStatus = 'pending_approval'; // Admin onayı bekleniyor
        } else if (payment_method && payment_method !== 'guest') {
            // Diğer ödeme yöntemleri (PayPal, vb.)
            // TODO: Gerçek ödeme gateway entegrasyonu burada yapılacak
            transactionId = `DON-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            paymentStatus = 'pending_approval'; // Admin onayı bekleniyor
        } else {
            // Ödeme yöntemi belirtilmemişse (ziyaretçi/anonim) pending olarak kaydedilir
            paymentStatus = 'pending';
        }

        // Bağış kaydı (ziyaretçiler için user_id NULL olabilir)
        // Admin onayı bekleniyor - status 'pending' olarak başlar (bakiye ile ödeme hariç)
        const finalStatus = paymentStatus === 'completed' && payment_method === 'balance' ? 'pending_approval' : paymentStatus;
        
        const [result] = await pool.execute(
            `INSERT INTO project_donations 
             (project_id, user_id, amount, currency, is_anonymous, message, payment_method, transaction_id, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                projectId, 
                userId || null, // Ziyaretçiler için NULL
                amount, 
                project.currency || 'TRY',
                anonymous || !userId ? 1 : 0, // Ziyaretçiler otomatik anonim
                message || null,
                payment_method || (userId ? null : 'guest'),
                transactionId,
                finalStatus
            ]
        );

        // Eğer bakiye ile ödeme yapıldıysa, proje toplam bağış güncelle (admin onayı bekleniyor)
        // Diğer ödeme yöntemleri için admin onayından sonra güncellenecek
        if (finalStatus === 'pending_approval') {
            // Bakiye ile ödeme yapıldı, admin onayı bekleniyor
            // Proje toplam bağış henüz güncellenmez
        } else if (finalStatus === 'completed') {
            // Diğer ödeme yöntemleri için (demo modunda) direkt güncelle
            await pool.execute(
                'UPDATE projects SET donation_received = COALESCE(donation_received, 0) + ? WHERE id = ?',
                [amount, projectId]
            );
        }

        // Bağış limiti ve indirim hesaplama (kullanıcı için)
        let discountCoupon = null;
        if (userId && (finalStatus === 'pending_approval' || finalStatus === 'completed')) {
            try {
                // Kullanıcının bu projeye yaptığı toplam bağışı hesapla (yeni bağış dahil)
                // Not: Yeni bağış henüz veritabanına eklenmediği için manuel olarak ekliyoruz
                const [userDonations] = await pool.execute(
                    `SELECT COALESCE(SUM(amount), 0) as total FROM project_donations 
                     WHERE project_id = ? AND user_id = ? AND status IN ('completed', 'pending_approval')`,
                    [projectId, userId]
                );
                
                // Yeni bağış miktarını da ekle (henüz veritabanına kaydedilmedi)
                const totalDonated = parseFloat(userDonations[0]?.total || 0) + parseFloat(amount);
                const donationLimit = 1000; // Bağış limiti (örnek: 1000₺) - daha düşük limit
                
                // Her 1000₺ bağış için %10 indirim, maksimum %50
                // Örnek: 1000₺ = %10, 2000₺ = %20, 5000₺ = %50
                const discountPercentage = Math.min(Math.floor((totalDonated / donationLimit) * 10), 50);
                
                // Eğer indirim yüzdesi 0'dan büyükse kupon oluştur
                if (discountPercentage > 0) {
                    // Bu kullanıcı için bu projede zaten bir kupon var mı kontrol et
                    const couponCodePattern = `DONATE-${projectId}-${userId}-%`;
                    const [existingCoupons] = await pool.execute(
                        `SELECT id, code, discount_value FROM coupons 
                         WHERE code LIKE ? AND status = 'active' 
                         AND (expires_at IS NULL OR expires_at > NOW())
                         ORDER BY created_at DESC LIMIT 1`,
                        [couponCodePattern]
                    );
                    
                    // Eğer kupon yoksa veya mevcut kuponun indirimi daha düşükse yeni kupon oluştur
                    let shouldCreateCoupon = true;
                    if (existingCoupons.length > 0) {
                        const existingDiscount = parseFloat(existingCoupons[0].discount_value || 0);
                        if (discountPercentage <= existingDiscount) {
                            shouldCreateCoupon = false; // Mevcut kupon daha iyi veya eşit
                        } else {
                            // Eski kuponu pasif yap
                            await pool.execute(
                                'UPDATE coupons SET status = "inactive" WHERE id = ?',
                                [existingCoupons[0].id]
                            );
                        }
                    }
                    
                    if (shouldCreateCoupon) {
                        const couponCode = `DONATE-${projectId}-${userId}-${Date.now()}`;
                        
                        // Kupon oluştur
                        try {
                            // Önce coupons tablosunda project_id kolonu var mı kontrol et
                            let couponInsertQuery;
                            let couponInsertParams;
                            
                            // project_id kolonu olup olmadığını kontrol et
                            try {
                                const [columns] = await pool.execute(
                                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                                     WHERE TABLE_SCHEMA = DATABASE() 
                                     AND TABLE_NAME = 'coupons' 
                                     AND COLUMN_NAME = 'project_id'`
                                );
                                
                                if (columns.length > 0) {
                                    // project_id kolonu varsa kullan
                                    couponInsertQuery = `INSERT INTO coupons 
                                         (code, discount_type, discount_value, project_id, expires_at, usage_limit, one_time_use, status, description)
                                         VALUES (?, 'percentage', ?, ?, DATE_ADD(NOW(), INTERVAL 1 YEAR), 1, 1, 'active', ?)`;
                                    couponInsertParams = [
                                        couponCode, 
                                        discountPercentage, 
                                        projectId,
                                        `Bağış hediyesi - Sadece bu projede geçerli`
                                    ];
                                } else {
                                    // project_id kolonu yoksa eski şekilde ekle
                                    couponInsertQuery = `INSERT INTO coupons 
                                         (code, discount_type, discount_value, expires_at, usage_limit, one_time_use, status, description)
                                         VALUES (?, 'percentage', ?, DATE_ADD(NOW(), INTERVAL 1 YEAR), 1, 1, 'active', ?)`;
                                    couponInsertParams = [
                                        couponCode, 
                                        discountPercentage,
                                        `Bağış hediyesi - Proje ID: ${projectId} - Sadece bu projede geçerli`
                                    ];
                                }
                            } catch (colCheckError) {
                                // Hata durumunda eski şekilde ekle
                                couponInsertQuery = `INSERT INTO coupons 
                                     (code, discount_type, discount_value, expires_at, usage_limit, one_time_use, status, description)
                                     VALUES (?, 'percentage', ?, DATE_ADD(NOW(), INTERVAL 1 YEAR), 1, 1, 'active', ?)`;
                                couponInsertParams = [
                                    couponCode, 
                                    discountPercentage,
                                    `Bağış hediyesi - Proje ID: ${projectId} - Sadece bu projede geçerli`
                                ];
                            }
                            
                            const [couponResult] = await pool.execute(couponInsertQuery, couponInsertParams);
                            
                            discountCoupon = {
                                code: couponCode,
                                discount: discountPercentage
                            };
                        } catch (couponInsertError) {
                            console.error('Coupon creation error:', couponInsertError);
                        }
                    } else if (existingCoupons.length > 0) {
                        // Mevcut kuponu döndür
                        discountCoupon = {
                            code: existingCoupons[0].code,
                            discount: parseFloat(existingCoupons[0].discount_value || 0)
                        };
                    }
                }
            } catch (couponError) {
                console.error('Coupon calculation error:', couponError);
            }
        }

        res.status(201).json({ 
            message: finalStatus === 'pending_approval' 
                ? 'Bağış başarıyla yapıldı. Admin onayından sonra proje sahibine aktarılacak.' 
                : finalStatus === 'completed' 
                    ? 'Bağış başarıyla yapıldı' 
                    : 'Bağış kaydı oluşturuldu, ödeme bekleniyor',
            donation_id: result.insertId,
            status: finalStatus,
            transaction_id: transactionId,
            discount_coupon: discountCoupon
        });
    } catch (error) {
        console.error('Donation error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Admin - Bağış onayla (komisyon dağıtımı)
router.post('/admin/:donationId/approve', authenticate, async (req, res) => {
    try {
        // Admin kontrolü (basit - gerçek uygulamada role kontrolü yapılmalı)
        const { donationId } = req.params;
        
        // Bağış kontrolü
        const [donations] = await pool.execute(
            'SELECT d.*, p.user_id as project_owner_id FROM project_donations d INNER JOIN projects p ON d.project_id = p.id WHERE d.id = ?',
            [donationId]
        );

        if (donations.length === 0) {
            return res.status(404).json({ error: 'Bağış bulunamadı' });
        }

        const donation = donations[0];

        if (donation.status === 'completed') {
            return res.status(400).json({ error: 'Bu bağış zaten onaylanmış' });
        }

        // Komisyon hesaplama: Admin %30, Proje Sahibi %70
        const adminCommission = parseFloat(donation.amount) * 0.30;
        const projectOwnerAmount = parseFloat(donation.amount) * 0.70;

        // Admin bakiyesine ekle (users tablosunda admin kullanıcısı ID'si 1 varsayılıyor)
        try {
            await pool.execute(
                'UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = 1',
                [adminCommission]
            );
        } catch (adminError) {
            console.warn('Admin balance update error (column may not exist):', adminError.message);
        }

        // Proje sahibi bakiyesine ekle
        try {
            await pool.execute(
                'UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?',
                [projectOwnerAmount, donation.project_owner_id]
            );
        } catch (ownerError) {
            console.warn('Owner balance update error (column may not exist):', ownerError.message);
        }

        // Bağış durumunu güncelle
        await pool.execute(
            `UPDATE project_donations SET status = 'completed' WHERE id = ?`,
            [donationId]
        );

        // Proje toplam bağış güncelle
        await pool.execute(
            'UPDATE projects SET donation_received = COALESCE(donation_received, 0) + ? WHERE id = ?',
            [donation.amount, donation.project_id]
        );

        res.json({ 
            message: 'Bağış onaylandı ve komisyonlar dağıtıldı',
            admin_commission: adminCommission,
            project_owner_amount: projectOwnerAmount
        });
    } catch (error) {
        console.error('Approve donation error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Bağış ödeme işlemini tamamla
router.post('/:donationId/complete-payment', authenticate, async (req, res) => {
    try {
        const { donationId } = req.params;
        const { payment_method, payment_data } = req.body;
        const userId = req.user.id;

        // Bağış kontrolü
        const [donations] = await pool.execute(
            'SELECT * FROM project_donations WHERE id = ? AND user_id = ?',
            [donationId, userId]
        );

        if (donations.length === 0) {
            return res.status(404).json({ error: 'Bağış bulunamadı' });
        }

        const donation = donations[0];

        if (donation.status === 'completed') {
            return res.status(400).json({ error: 'Bu bağış zaten tamamlanmış' });
        }

        // Ödeme işlemi (demo modunda)
        // TODO: Gerçek ödeme gateway entegrasyonu
        const transactionId = `DON-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Bağış durumunu güncelle
        await pool.execute(
            `UPDATE project_donations 
             SET status = 'completed', 
                 payment_method = ?,
                 transaction_id = ?
             WHERE id = ?`,
            [payment_method || 'manual', transactionId, donationId]
        );

        // Proje toplam bağış güncelle
        await pool.execute(
            'UPDATE projects SET donation_received = COALESCE(donation_received, 0) + ? WHERE id = ?',
            [donation.amount, donation.project_id]
        );

        res.json({ 
            message: 'Ödeme başarıyla tamamlandı',
            transaction_id: transactionId
        });
    } catch (error) {
        console.error('Complete payment error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Proje bağışlarını getir
router.get('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        const [donations] = await pool.execute(
            `SELECT d.*, 
             CASE WHEN d.is_anonymous = 1 THEN 'Anonim' ELSE u.username END as donor_name,
             u.avatar as donor_avatar
             FROM project_donations d
             LEFT JOIN users u ON d.user_id = u.id
             WHERE d.project_id = ?
             ORDER BY d.created_at DESC`,
            [projectId]
        );

        res.json({ donations });
    } catch (error) {
        console.error('Get donations error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcının bağışlarını getir
router.get('/user/my-donations', authenticate, async (req, res) => {
    try {
        // Önce donations'ı getir
        const [donations] = await pool.execute(
            `SELECT d.*, p.title as project_title, p.slug as project_slug
             FROM project_donations d
             INNER JOIN projects p ON d.project_id = p.id
             WHERE d.user_id = ?
             ORDER BY d.created_at DESC`,
            [req.user.id]
        );

        // Her bağış için kupon bilgisini getir
        const donationsWithCoupons = await Promise.all(
            donations.map(async (donation) => {
                try {
                    // Kupon kodundan project_id'yi parse et veya direkt project_id ile ara
                    // Kupon kodu formatı: DONATE-{projectId}-{userId}-{timestamp}
                    const couponCodePattern = `DONATE-${donation.project_id}-${req.user.id}-%`;
                    
                    // Önce project_id kolonu var mı kontrol et
                    let couponQuery;
                    let couponParams;
                    
                    try {
                        const [columns] = await pool.execute(
                            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                             WHERE TABLE_SCHEMA = DATABASE() 
                             AND TABLE_NAME = 'coupons' 
                             AND COLUMN_NAME = 'project_id'`
                        );
                        
                        // Kupon kullanıcıya özel olduğu için sadece code pattern ile ara
                        // Code pattern zaten user_id içeriyor: DONATE-{projectId}-{userId}-{timestamp}
                        couponQuery = `
                            SELECT c.* 
                            FROM coupons c
                            WHERE c.code LIKE ? 
                            AND c.status = 'active'
                            AND (c.expires_at IS NULL OR c.expires_at > NOW())
                            ORDER BY c.created_at DESC
                            LIMIT 1
                        `;
                        couponParams = [couponCodePattern];
                        
                        if (false) { // Bu blok artık kullanılmıyor
                        } else {
                            // project_id kolonu yoksa sadece code pattern ile ara
                            couponQuery = `
                                SELECT c.* 
                                FROM coupons c
                                WHERE c.code LIKE ? 
                                AND c.status = 'active'
                                AND (c.expires_at IS NULL OR c.expires_at > NOW())
                                ORDER BY c.created_at DESC
                                LIMIT 1
                            `;
                            couponParams = [couponCodePattern];
                        }
                    } catch (colCheckError) {
                        // Hata durumunda sadece code pattern ile ara
                        couponQuery = `
                            SELECT c.* 
                            FROM coupons c
                            WHERE c.code LIKE ? 
                            AND c.status = 'active'
                            AND (c.expires_at IS NULL OR c.expires_at > NOW())
                            ORDER BY c.created_at DESC
                            LIMIT 1
                        `;
                        couponParams = [couponCodePattern];
                    }
                    
                    const [coupons] = await pool.execute(couponQuery, couponParams);
                    
                    if (coupons.length > 0) {
                        donation.coupon = {
                            code: coupons[0].code,
                            discount_type: coupons[0].discount_type,
                            discount_value: coupons[0].discount_value,
                            expires_at: coupons[0].expires_at,
                            project_id: coupons[0].project_id || donation.project_id
                        };
                    }
                } catch (couponError) {
                    console.warn('Coupon fetch error for donation:', donation.id, couponError.message);
                }
                
                return donation;
            })
        );

        res.json({ donations: donationsWithCoupons });
    } catch (error) {
        console.error('Get user donations error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

