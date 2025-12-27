import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/database.js';
import { authenticate, isSeller } from '../middleware/auth.js';

// Multer yapılandırması
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Geçici dizin kullan (daha sonra proje ID'sine göre taşınacak)
        const tempDir = path.join(process.cwd(), 'public', 'uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir!'));
        }
    }
});

const router = express.Router();

// Tüm route'lar satıcı yetkisi gerektirir
router.use(authenticate);
router.use(isSeller);

// Satıcı dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.user.id;

        const [projects] = await pool.execute('SELECT COUNT(*) as total FROM projects WHERE user_id = ?', [userId]);
        // Sales - payment_status kolonu yoksa status kullan
        let salesQuery = `SELECT COUNT(*) as total FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ?`;
        let salesParams = [userId];
        
        // payment_status kolonu varsa kullan
        try {
            const [testCol] = await pool.execute('SHOW COLUMNS FROM orders LIKE "payment_status"');
            if (testCol.length > 0) {
                salesQuery += ` AND o.payment_status = ?`;
                salesParams.push('paid');
            } else {
                salesQuery += ` AND o.status = ?`;
                salesParams.push('completed');
            }
        } catch (err) {
            salesQuery += ` AND o.status = ?`;
            salesParams.push('completed');
        }
        
        const [sales] = await pool.execute(salesQuery, salesParams);
        
        // Earnings - commission_rate kullan
        let earningsQuery = `SELECT COALESCE(SUM(
            CASE 
                WHEN o.commission_rate IS NOT NULL THEN oi.subtotal * (100 - o.commission_rate) / 100
                ELSE oi.subtotal * 0.85
            END
        ), 0) as total FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ?`;
        let earningsParams = [userId];
        
        try {
            const [testCol] = await pool.execute('SHOW COLUMNS FROM orders LIKE "payment_status"');
            if (testCol.length > 0) {
                earningsQuery += ` AND o.payment_status = ?`;
                earningsParams.push('paid');
            } else {
                earningsQuery += ` AND o.status = ?`;
                earningsParams.push('completed');
            }
        } catch (err) {
            earningsQuery += ` AND o.status = ?`;
            earningsParams.push('completed');
        }
        
        const [earnings] = await pool.execute(earningsQuery, earningsParams);

        // Toplam görüntüleme sayısı - view_count kolonu kullan
        let viewsTotal = 0;
        try {
            const [views] = await pool.execute(
                `SELECT COALESCE(SUM(view_count), 0) as total FROM projects WHERE user_id = ?`,
                [userId]
            );
            viewsTotal = views[0]?.total || 0;
        } catch (err) {
            // view_count kolonu yoksa 0 döndür
            console.log('view_count column not available:', err.message);
            viewsTotal = 0;
        }

        // Ortalama rating (reviews tablosu varsa)
        let avgRating = 0;
        try {
            const [rating] = await pool.execute(
                `SELECT COALESCE(AVG(r.rating), 0) as avg FROM reviews r
                 INNER JOIN projects p ON r.project_id = p.id
                 WHERE p.user_id = ?`,
                [userId]
            );
            avgRating = parseFloat(rating[0]?.avg || 0);
        } catch (err) {
            // Reviews tablosu yoksa veya hata varsa 0 döndür
            console.log('Reviews table not available or error:', err.message);
        }

        // Bekleyen kazançlar (son 7 gün) - commission_rate kullan
        let pendingQuery = `SELECT COALESCE(SUM(
            CASE 
                WHEN o.commission_rate IS NOT NULL THEN oi.subtotal * (100 - o.commission_rate) / 100
                ELSE oi.subtotal * 0.85
            END
        ), 0) as total FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ? AND o.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`;
        let pendingParams = [userId];
        
        try {
            const [testCol] = await pool.execute('SHOW COLUMNS FROM orders LIKE "payment_status"');
            if (testCol.length > 0) {
                pendingQuery += ` AND o.payment_status = ?`;
                pendingParams.push('paid');
            } else {
                pendingQuery += ` AND o.status = ?`;
                pendingParams.push('completed');
            }
        } catch (err) {
            pendingQuery += ` AND o.status = ?`;
            pendingParams.push('completed');
        }
        
        const [pending] = await pool.execute(pendingQuery, pendingParams);

        res.json({
            projects: projects[0]?.total || 0,
            sales: sales[0]?.total || 0,
            earnings: earnings[0]?.total || 0,
            views: viewsTotal,
            avg_rating: avgRating.toFixed(1),
            pending_earnings: pending[0]?.total || 0
        });
    } catch (error) {
        console.error('Get seller dashboard error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Satıcının projeleri
router.get('/projects', async (req, res) => {
    try {
        // Önce tüm projeleri çek (primary_image olmadan)
        const [projects] = await pool.execute(
            `SELECT p.*, c.name as category_name
             FROM projects p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.user_id = ?
             ORDER BY p.created_at DESC`,
            [req.user.id]
        );
        
        // Her proje için görselleri getir ve primary_image'i bul
        for (let project of projects) {
            // project_images tablosundan bu projeye ait tüm resimleri çek
            const [images] = await pool.execute(
                'SELECT image_path, is_primary, sort_order FROM project_images WHERE project_id = ? ORDER BY is_primary DESC, sort_order ASC',
                [project.id]
            );
            
            // is_primary = 1 olan resmi bul
            let primaryImage = null;
            if (images.length > 0) {
                // Önce is_primary = 1 olanı ara
                const primaryImg = images.find(img => img.is_primary === 1);
                if (primaryImg) {
                    primaryImage = primaryImg.image_path;
                } else {
                    // Eğer is_primary = 1 yoksa, ilk resmi al
                    primaryImage = images[0].image_path;
                }
            }
            
            // Primary image URL'ini düzelt
            if (primaryImage) {
                project.primary_image = `/uploads/${primaryImage}`;
            } else {
                project.primary_image = null;
            }
            
            // Tüm resimlerin URL'lerini düzelt
            project.images = images.map(img => ({
                ...img,
                image_path: `/uploads/${img.image_path}`
            }));
        }
        
        // Response'u gönder
        res.json({ projects });
    } catch (error) {
        console.error('Get seller projects error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Tek bir proje detayı
router.get('/projects/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;

        const [projects] = await pool.execute(
            `SELECT p.*, c.name as category_name, c.id as category_id
             FROM projects p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = ? AND p.user_id = ?`,
            [projectId, userId]
        );

        if (projects.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı' });
        }

        const project = projects[0];

        // Tags'ı project_tags tablosundan getir
        const [projectTags] = await pool.execute(
            `SELECT t.id, t.name, t.slug 
             FROM project_tags pt
             INNER JOIN tags t ON pt.tag_id = t.id
             WHERE pt.project_id = ?`,
            [projectId]
        );
        project.tags = projectTags.map(t => t.name);

        // Images'ı getir ve URL'leri düzelt
        const [images] = await pool.execute(
            'SELECT id, image_path, is_primary, sort_order FROM project_images WHERE project_id = ? ORDER BY is_primary DESC, sort_order ASC',
            [projectId]
        );
        project.images = images.map(img => {
            let imagePath = img.image_path;
            // Eğer zaten /uploads/ ile başlıyorsa olduğu gibi döndür
            if (imagePath && !imagePath.startsWith('/uploads/') && !imagePath.startsWith('http')) {
                imagePath = `/uploads/${imagePath}`;
            }
            return {
                id: img.id,
                image_path: imagePath,
                is_primary: img.is_primary,
                sort_order: img.sort_order
            };
        });
        
        // Primary image'i de ekle
        const primaryImage = images.find(img => img.is_primary === 1);
        if (primaryImage) {
            project.primary_image = `/uploads/${primaryImage.image_path}`;
        }

        // Çok dilli içerikleri getir
        try {
            const [translations] = await pool.execute(
                `SELECT language_code, title, description, short_description 
                 FROM content_translations 
                 WHERE content_id = ? AND content_type = 'project'`,
                [projectId]
            );
            
            project.translations = {};
            translations.forEach(t => {
                project.translations[t.language_code] = {
                    title: t.title,
                    description: t.description,
                    short_description: t.short_description
                };
            });
        } catch (err) {
            // content_translations tablosu yoksa boş obje döndür
            console.log('content_translations table not available:', err.message);
            project.translations = {};
        }

        res.json({ project });
    } catch (error) {
        console.error('Get seller project error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Yeni proje oluştur
router.post('/projects', upload.fields([
    { name: 'primary_image', maxCount: 1 },
    { name: 'gallery_images', maxCount: 20 }
]), async (req, res) => {
    try {
        // FormData veya JSON body kontrolü
        const isFormData = req.headers['content-type']?.includes('multipart/form-data');
        
        let projectData = {};
        if (isFormData) {
            // FormData'dan verileri al
            projectData = {
                title_tr: req.body.title_tr || '',
                short_description_tr: req.body.short_description_tr || '',
                description_tr: req.body.description_tr || '',
                title_en: req.body.title_en || '',
                short_description_en: req.body.short_description_en || '',
                description_en: req.body.description_en || '',
                title_de: req.body.title_de || '',
                short_description_de: req.body.short_description_de || '',
                description_de: req.body.description_de || '',
                category_id: req.body.category_id || '',
                price: req.body.price || '',
                discount_price: req.body.discount_price || '',
                currency: req.body.currency || 'TRY',
                tags: req.body.tags || '',
                demo_url: req.body.demo_url || '',
                admin_demo_url: req.body.admin_demo_url || '',
                demo_username: req.body.demo_username || '',
                demo_password: req.body.demo_password || '',
                admin_username: req.body.admin_username || '',
                admin_password: req.body.admin_password || '',
                video_url: req.body.video_url || '',
                license_type: req.body.license_type || '',
                requirements: req.body.requirements || '',
                version: req.body.version || '1.0.0'
            };
        } else {
            projectData = req.body;
        }

        const { 
            title_tr, title_en, title_de,
            description_tr, description_en, description_de,
            short_description_tr, short_description_en, short_description_de,
            category_id, price, discount_price, currency, tags,
            demo_url, admin_demo_url, demo_username, demo_password,
            admin_username, admin_password, video_url, license_type,
            requirements, version
        } = projectData;

        if (!title_tr || !description_tr || !category_id || !price) {
            return res.status(400).json({ error: 'Tüm zorunlu alanlar doldurulmalıdır (Türkçe)' });
        }
        
        // Satıcı projeleri otomatik olarak 'pending' durumunda oluşturulur
        // Admin onayından sonra 'approved' veya 'active' yapılabilir
        const status = 'pending';

        const slug = title_tr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Projeyi oluştur (varsayılan olarak Türkçe içerik kullanılır)
        // Admin yönetim alanları: completion_percentage (default 100), donation_target (null), download_limit (null), featured (0)
        const [result] = await pool.execute(
            `INSERT INTO projects (user_id, title, slug, description, short_description, category_id, price, discount_price, currency, status, completion_percentage, donation_target, download_limit, featured, demo_url, admin_demo_url, demo_username, demo_password, admin_username, admin_password, video_url, license_type, requirements, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, 
                title_tr, 
                slug, 
                description_tr, 
                short_description_tr || null, 
                category_id, 
                price,
                discount_price || null,
                currency || 'TRY',
                status, // Otomatik 'pending'
                100, // Varsayılan tamamlanma yüzdesi (admin değiştirebilir)
                null, // Bağış hedefi (admin ayarlar)
                null, // İndirme limiti (admin ayarlar)
                0, // Featured (admin ayarlar)
                demo_url || null,
                admin_demo_url || null,
                demo_username || null,
                demo_password || null,
                admin_username || null,
                admin_password || null,
                video_url || null,
                license_type || null,
                requirements || null,
                version || '1.0.0'
            ]
        );

        const projectId = result.insertId;

        // Tags'ı project_tags tablosuna kaydet
        if (tags) {
            let tagNames = [];
            if (typeof tags === 'string') {
                tagNames = tags.split(',').map(t => t.trim()).filter(t => t);
            } else if (Array.isArray(tags)) {
                tagNames = tags;
            }
            
            // Her tag için: varsa ID'sini al, yoksa oluştur, sonra project_tags'e ekle
            for (const tagName of tagNames) {
                if (!tagName) continue;
                
                // Tag'i bul veya oluştur
                const [existingTags] = await pool.execute(
                    'SELECT id FROM tags WHERE slug = ?',
                    [tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-')]
                );
                
                let tagId;
                if (existingTags.length > 0) {
                    tagId = existingTags[0].id;
                } else {
                    // Yeni tag oluştur
                    const [newTag] = await pool.execute(
                        'INSERT INTO tags (name, slug) VALUES (?, ?)',
                        [tagName, tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-')]
                    );
                    tagId = newTag.insertId;
                }
                
                // project_tags tablosuna ekle (duplicate kontrolü ile)
                await pool.execute(
                    `INSERT INTO project_tags (project_id, tag_id) 
                     VALUES (?, ?) 
                     ON DUPLICATE KEY UPDATE project_id = project_id`,
                    [projectId, tagId]
                );
            }
        }

        // Çok dilli içerikleri content_translations tablosuna kaydet (TÜM DİLLER)
        // Türkçe
        await pool.execute(
            `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
             VALUES (?, 'project', 'tr', ?, ?, ?)
             ON DUPLICATE KEY UPDATE title = ?, description = ?, short_description = ?`,
            [projectId, title_tr, description_tr, short_description_tr || null,
             title_tr, description_tr, short_description_tr || null]
        );

        // İngilizce
        if (title_en || description_en || short_description_en) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'project', 'en', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = ?, description = ?, short_description = ?`,
                [projectId, title_en || title_tr, description_en || description_tr, short_description_en || short_description_tr || null,
                 title_en || title_tr, description_en || description_tr, short_description_en || short_description_tr || null]
            );
        }

        // Almanca
        if (title_de || description_de || short_description_de) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'project', 'de', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = ?, description = ?, short_description = ?`,
                [projectId, title_de || title_tr, description_de || description_tr, short_description_de || short_description_tr || null,
                 title_de || title_tr, description_de || description_tr, short_description_de || short_description_tr || null]
            );
        }

        // Resim yükleme işlemleri
        if (req.files) {
            const fsPromises = fs.promises;
            // Tüm resimler direkt projects/ klasöründe olacak (alt klasör yok)
            const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'projects');
            
            // Upload dizinini oluştur
            await fsPromises.mkdir(uploadDir, { recursive: true });

            // Primary image
            const primaryFile = req.files.primary_image ? 
                (Array.isArray(req.files.primary_image) ? req.files.primary_image[0] : req.files.primary_image) : null;

            // Galeri resimleri
            const galleryFiles = req.files.gallery_images ? 
                (Array.isArray(req.files.gallery_images) ? req.files.gallery_images : [req.files.gallery_images]) : [];

            let sortOrder = 0;
            let hasPrimary = false;

            // Primary image'i yükle
            if (primaryFile) {
                const primaryExt = path.extname(primaryFile.originalname);
                // Dosya adına proje ID'sini ekle: primary_16_timestamp.png
                const primaryFileName = `primary_${projectId}_${Date.now()}${primaryExt}`;
                const primaryFilePath = path.join(uploadDir, primaryFileName);
                await fsPromises.rename(primaryFile.path, primaryFilePath);
                
                // Veritabanına kaydet: projects/primary_16_timestamp.png
                const relativePath = `projects/${primaryFileName}`;
                await pool.execute(
                    `INSERT INTO project_images (project_id, image_path, is_primary, sort_order) VALUES (?, ?, 1, ?)`,
                    [projectId, relativePath, sortOrder++]
                );
                hasPrimary = true;
            }

            // Galeri resimlerini yükle
            for (const file of galleryFiles) {
                const ext = path.extname(file.originalname);
                // Dosya adına proje ID'sini ekle: gallery_16_timestamp_random.png
                const fileName = `gallery_${projectId}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
                const filePath = path.join(uploadDir, fileName);
                await fsPromises.rename(file.path, filePath);
                
                // Veritabanına kaydet: projects/gallery_16_timestamp_random.png
                const relativePath = `projects/${fileName}`;
                const isPrimary = !hasPrimary && sortOrder === 0; // İlk resim primary olabilir
                
                await pool.execute(
                    `INSERT INTO project_images (project_id, image_path, is_primary, sort_order) VALUES (?, ?, ?, ?)`,
                    [projectId, relativePath, isPrimary ? 1 : 0, sortOrder++]
                );
                
                if (isPrimary) hasPrimary = true;
            }
        }

        res.status(201).json({ message: 'Proje oluşturuldu', project_id: projectId });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Proje güncelle
router.put('/projects/:id', upload.fields([
    { name: 'primary_image', maxCount: 1 },
    { name: 'gallery_images', maxCount: 20 }
]), async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const isFormData = req.headers['content-type']?.includes('multipart/form-data');
        
        let projectData = {};
        if (isFormData) {
            projectData = {
                title_tr: req.body.title_tr || '',
                short_description_tr: req.body.short_description_tr || '',
                description_tr: req.body.description_tr || '',
                title_en: req.body.title_en || '',
                short_description_en: req.body.short_description_en || '',
                description_en: req.body.description_en || '',
                title_de: req.body.title_de || '',
                short_description_de: req.body.short_description_de || '',
                description_de: req.body.description_de || '',
                category_id: req.body.category_id || '',
                price: req.body.price || '',
                discount_price: req.body.discount_price || '',
                currency: req.body.currency || 'TRY',
                tags: req.body.tags || '',
                status: req.body.status || 'pending',
                is_active: req.body.is_active,
                primary_image_index: req.body.primary_image_index || null,
                deleted_image_ids: req.body.deleted_image_ids || '',
                demo_url: req.body.demo_url || '',
                admin_demo_url: req.body.admin_demo_url || '',
                demo_username: req.body.demo_username || '',
                demo_password: req.body.demo_password || '',
                admin_username: req.body.admin_username || '',
                admin_password: req.body.admin_password || '',
                video_url: req.body.video_url || '',
                license_type: req.body.license_type || '',
                requirements: req.body.requirements || '',
                version: req.body.version || '1.0.0'
            };
        } else {
            projectData = req.body;
        }

        const { 
            title, title_tr, title_en, title_de,
            description, description_tr, description_en, description_de,
            short_description, short_description_tr, short_description_en, short_description_de,
            category_id, price, discount_price, currency, tags, status, is_active,
            demo_url, admin_demo_url, demo_username, demo_password,
            admin_username, admin_password, video_url, license_type, requirements, version
        } = projectData;

        // Projenin sahibi kontrolü
        const [existing] = await pool.execute(
            'SELECT id FROM projects WHERE id = ? AND user_id = ?',
            [projectId, userId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı veya yetkiniz yok' });
        }

        // Güncellenecek alanları hazırla
        const updates = [];
        const values = [];

        // title_tr varsa title olarak kullan (Türkçe varsayılan)
        const finalTitle = title_tr || title;
        if (finalTitle !== undefined) {
            updates.push('title = ?');
            values.push(finalTitle);
            // Slug'ı da güncelle
            const slug = finalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            updates.push('slug = ?');
            values.push(slug);
        }
        
        // description_tr varsa description olarak kullan
        const finalDescription = description_tr || description;
        if (finalDescription !== undefined) {
            updates.push('description = ?');
            values.push(finalDescription);
        }
        
        // short_description_tr varsa short_description olarak kullan
        const finalShortDescription = short_description_tr || short_description;
        if (finalShortDescription !== undefined) {
            updates.push('short_description = ?');
            values.push(finalShortDescription);
        }
        if (category_id !== undefined) {
            updates.push('category_id = ?');
            values.push(category_id);
        }
        if (price !== undefined) {
            updates.push('price = ?');
            values.push(price);
        }
        if (discount_price !== undefined) {
            updates.push('discount_price = ?');
            values.push(discount_price);
        }
        if (currency !== undefined) {
            updates.push('currency = ?');
            values.push(currency);
        }
        // Tags güncellemesi project_tags tablosunda yapılacak (ayrı işlenecek)
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        // is_active kolonu veritabanında yoksa bu kısmı atlayın
        // Veritabanına kolonu eklemek için: ALTER TABLE projects ADD COLUMN is_active tinyint(1) DEFAULT 1;
        // Şimdilik devre dışı - veritabanında kolon yok
        // if (is_active !== undefined) {
        //     updates.push('is_active = ?');
        //     const isActiveValue = typeof is_active === 'string' 
        //         ? (is_active === '1' || is_active === 'true' || is_active.toLowerCase() === 'true')
        //         : Boolean(is_active);
        //     values.push(isActiveValue ? 1 : 0);
        // }
        if (demo_url !== undefined) {
            updates.push('demo_url = ?');
            values.push(demo_url || null);
        }
        if (admin_demo_url !== undefined) {
            updates.push('admin_demo_url = ?');
            values.push(admin_demo_url || null);
        }
        if (demo_username !== undefined) {
            updates.push('demo_username = ?');
            values.push(demo_username || null);
        }
        if (demo_password !== undefined) {
            updates.push('demo_password = ?');
            values.push(demo_password || null);
        }
        if (admin_username !== undefined) {
            updates.push('admin_username = ?');
            values.push(admin_username || null);
        }
        if (admin_password !== undefined) {
            updates.push('admin_password = ?');
            values.push(admin_password || null);
        }
        if (video_url !== undefined) {
            updates.push('video_url = ?');
            values.push(video_url || null);
        }
        if (license_type !== undefined) {
            updates.push('license_type = ?');
            values.push(license_type || null);
        }
        if (requirements !== undefined) {
            updates.push('requirements = ?');
            values.push(requirements || null);
        }
        if (version !== undefined) {
            updates.push('version = ?');
            values.push(version || '1.0.0');
        }

        // Eğer hiçbir alan güncellenmiyorsa ama resim yükleme varsa devam et
        if (updates.length === 0 && (!req.files || (!req.files.primary_image && (!req.files.gallery_images || req.files.gallery_images.length === 0)))) {
            return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi' });
        }

        // Eğer güncellenecek alan varsa UPDATE sorgusu çalıştır
        if (updates.length > 0) {
            updates.push('updated_at = NOW()');
            values.push(projectId);

            await pool.execute(
                `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
                values
            );
        }

        // Tags güncellemesi (varsa)
        if (tags !== undefined) {
            // Önce mevcut tag'leri sil
            await pool.execute('DELETE FROM project_tags WHERE project_id = ?', [projectId]);
            
            // Yeni tag'leri ekle
            if (tags) {
                let tagNames = [];
                if (typeof tags === 'string') {
                    tagNames = tags.split(',').map(t => t.trim()).filter(t => t);
                } else if (Array.isArray(tags)) {
                    tagNames = tags;
                }
                
                for (const tagName of tagNames) {
                    if (!tagName) continue;
                    
                    // Tag slug'ı oluştur
                    const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    
                    // Tag'i bul veya oluştur
                    const [existingTags] = await pool.execute(
                        'SELECT id FROM tags WHERE slug = ?',
                        [tagSlug]
                    );
                    
                    let tagId;
                    if (existingTags.length > 0) {
                        tagId = existingTags[0].id;
                    } else {
                        // Yeni tag oluştur
                        const [newTag] = await pool.execute(
                            'INSERT INTO tags (name, slug) VALUES (?, ?)',
                            [tagName, tagSlug]
                        );
                        tagId = newTag.insertId;
                    }
                    
                    // project_tags tablosuna ekle
                    await pool.execute(
                        `INSERT IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)`,
                        [projectId, tagId]
                    );
                }
            }
        }

        // Silinen resimleri sil
        if (projectData.deleted_image_ids) {
            const deletedIds = typeof projectData.deleted_image_ids === 'string' 
                ? projectData.deleted_image_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
                : Array.isArray(projectData.deleted_image_ids) 
                    ? projectData.deleted_image_ids.map(id => parseInt(id)).filter(id => !isNaN(id))
                    : [];
            
            if (deletedIds.length > 0) {
                // Placeholder'ları dinamik oluştur
                const placeholders = deletedIds.map(() => '?').join(',');
                
                // Önce silinecek resimlerin dosya yollarını al
                const [imagesToDelete] = await pool.execute(
                    `SELECT image_path FROM project_images WHERE id IN (${placeholders}) AND project_id = ?`,
                    [...deletedIds, projectId]
                );
                
                // Veritabanından sil
                await pool.execute(
                    `DELETE FROM project_images WHERE id IN (${placeholders}) AND project_id = ?`,
                    [...deletedIds, projectId]
                );
                
                // Dosyaları da sil
                const fsPromises = fs.promises;
                for (const img of imagesToDelete) {
                    try {
                        const filePath = path.join(process.cwd(), 'public', 'uploads', img.image_path);
                        if (fs.existsSync(filePath)) {
                            await fsPromises.unlink(filePath);
                        }
                    } catch (err) {
                        console.warn(`Failed to delete image file: ${img.image_path}`, err.message);
                    }
                }
            }
        }

        // Çok dilli içerikleri güncelle
        if (title_tr || description_tr || short_description_tr) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'project', 'tr', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [projectId, title_tr || title, description_tr || description, short_description_tr || short_description,
                 title_tr || title, description_tr || description, short_description_tr || short_description]
            );
        }

        if (title_en || description_en || short_description_en) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'project', 'en', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [projectId, title_en, description_en, short_description_en,
                 title_en, description_en, short_description_en]
            );
        }

        if (title_de || description_de || short_description_de) {
            await pool.execute(
                `INSERT INTO content_translations (content_id, content_type, language_code, title, description, short_description)
                 VALUES (?, 'project', 'de', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = COALESCE(?, title), description = COALESCE(?, description), short_description = COALESCE(?, short_description)`,
                [projectId, title_de, description_de, short_description_de,
                 title_de, description_de, short_description_de]
            );
        }

        // Resim yükleme işlemleri (yeni resimler varsa)
        if (req.files) {
            const fsPromises = fs.promises;
            const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'projects');
            
            // Upload dizinini oluştur
            await fsPromises.mkdir(uploadDir, { recursive: true });

            // Primary image
            const primaryFile = req.files.primary_image ? 
                (Array.isArray(req.files.primary_image) ? req.files.primary_image[0] : req.files.primary_image) : null;

            // Galeri resimleri
            const galleryFiles = req.files.gallery_images ? 
                (Array.isArray(req.files.gallery_images) ? req.files.gallery_images : [req.files.gallery_images]) : [];

            // Mevcut resimlerin sort_order'ını al
            const [existingImages] = await pool.execute(
                'SELECT MAX(sort_order) as max_order FROM project_images WHERE project_id = ?',
                [projectId]
            );
            let sortOrder = (existingImages[0]?.max_order || 0) + 1;

            // Primary image'i yükle
            if (primaryFile) {
                // Önce mevcut primary image'i kaldır
                await pool.execute(
                    'UPDATE project_images SET is_primary = 0 WHERE project_id = ?',
                    [projectId]
                );

                const primaryExt = path.extname(primaryFile.originalname);
                const primaryFileName = `primary_${projectId}_${Date.now()}${primaryExt}`;
                const primaryFilePath = path.join(uploadDir, primaryFileName);
                await fsPromises.rename(primaryFile.path, primaryFilePath);
                
                const relativePath = `projects/${primaryFileName}`;
                await pool.execute(
                    `INSERT INTO project_images (project_id, image_path, is_primary, sort_order) VALUES (?, ?, 1, ?)`,
                    [projectId, relativePath, sortOrder++]
                );
            }

            // Galeri resimlerini yükle
            for (const file of galleryFiles) {
                const ext = path.extname(file.originalname);
                const fileName = `gallery_${projectId}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
                const filePath = path.join(uploadDir, fileName);
                await fsPromises.rename(file.path, filePath);
                
                const relativePath = `projects/${fileName}`;
                await pool.execute(
                    `INSERT INTO project_images (project_id, image_path, is_primary, sort_order) VALUES (?, ?, 0, ?)`,
                    [projectId, relativePath, sortOrder++]
                );
            }

            // Mevcut resimlerden vitrin resmi değiştirme (primary_image_index varsa)
            if (projectData.primary_image_index !== null && projectData.primary_image_index !== undefined && !primaryFile) {
                const primaryIndex = parseInt(projectData.primary_image_index);
                const [allImages] = await pool.execute(
                    'SELECT id FROM project_images WHERE project_id = ? ORDER BY is_primary DESC, sort_order ASC',
                    [projectId]
                );
                
                if (allImages[primaryIndex]) {
                    // Önce tüm resimlerin is_primary'ini 0 yap
                    await pool.execute(
                        'UPDATE project_images SET is_primary = 0 WHERE project_id = ?',
                        [projectId]
                    );
                    
                    // Seçilen resmi primary yap
                    await pool.execute(
                        'UPDATE project_images SET is_primary = 1 WHERE id = ?',
                        [allImages[primaryIndex].id]
                    );
                }
            }
        }

        res.json({ message: 'Proje güncellendi' });
    } catch (error) {
        console.error('Update project error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            projectId: req.params.id,
            userId: req.user?.id,
            body: req.body
        });
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Proje sil
router.delete('/projects/:id', async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;

        // Projenin sahibi kontrolü
        const [existing] = await pool.execute(
            'SELECT id FROM projects WHERE id = ? AND user_id = ?',
            [projectId, userId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Proje bulunamadı veya yetkiniz yok' });
        }

        await pool.execute('DELETE FROM projects WHERE id = ?', [projectId]);

        res.json({ message: 'Proje silindi' });
    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kazançlar
router.get('/earnings', async (req, res) => {
    try {
        const userId = req.user.id;

        // Toplam kazanç
        const [totalEarnings] = await pool.execute(
            `SELECT SUM(oi.subtotal * (100 - 15) / 100) as total FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ? AND o.payment_status = ?`,
            [userId, 'paid']
        );

        // Çekilebilir bakiye (henüz çekilmemiş)
        const [withdrawn] = await pool.execute(
            `SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE user_id = ? AND status = ?`,
            [userId, 'completed']
        );

        // Bekleyen ödemeler
        const [pending] = await pool.execute(
            `SELECT COALESCE(SUM(oi.subtotal * (100 - 15) / 100), 0) as total FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ? AND o.payment_status = ? AND o.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
            [userId, 'paid']
        );

        const total = parseFloat(totalEarnings[0].total || 0);
        const withdrawnTotal = parseFloat(withdrawn[0].total || 0);
        const pendingTotal = parseFloat(pending[0].total || 0);
        const available = total - withdrawnTotal;

        res.json({
            total,
            available,
            pending: pendingTotal,
            withdrawn: withdrawnTotal
        });
    } catch (error) {
        console.error('Get earnings error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Para çekme talepleri
router.get('/withdrawals', async (req, res) => {
    try {
        const [withdrawals] = await pool.execute(
            `SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ withdrawals });
    } catch (error) {
        console.error('Get withdrawals error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/withdrawals', async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;

        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Geçerli bir tutar girin' });
        }

        // Çekilebilir bakiye kontrolü
        const [earnings] = await pool.execute(
            `SELECT COALESCE(SUM(oi.subtotal * (100 - 15) / 100), 0) as total FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ? AND o.payment_status = ?`,
            [userId, 'paid']
        );

        const [withdrawn] = await pool.execute(
            `SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE user_id = ? AND status = ?`,
            [userId, 'completed']
        );

        const available = parseFloat(earnings[0].total || 0) - parseFloat(withdrawn[0].total || 0);

        if (parseFloat(amount) > available) {
            return res.status(400).json({ error: 'Çekilebilir bakiyeniz yetersiz' });
        }

        const [result] = await pool.execute(
            `INSERT INTO withdrawals (user_id, amount, status) VALUES (?, ?, 'pending')`,
            [userId, amount]
        );

        res.status(201).json({ message: 'Para çekme talebi oluşturuldu', withdrawal_id: result.insertId });
    } catch (error) {
        console.error('Create withdrawal error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Satışlar
router.get('/sales', async (req, res) => {
    try {
        const userId = req.user.id;

        const [sales] = await pool.execute(
            `SELECT o.id as order_id, o.order_number, o.created_at, o.payment_status,
                    oi.subtotal as total_amount, oi.subtotal * (100 - 15) / 100 as earnings,
                    p.title as project_title, u.username as customer_name
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             LEFT JOIN users u ON o.user_id = u.id
             WHERE p.user_id = ?
             ORDER BY o.created_at DESC`,
            [userId]
        );

        res.json({ sales });
    } catch (error) {
        console.error('Get sales error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Mesajlar
router.get('/messages', async (req, res) => {
    try {
        const userId = req.user.id;

        // Satıcının projeleriyle ilgili mesajları getir (sender_id veya receiver_id bazlı)
        // Satıcıya mesaj gönderen müşterileri bul
        const [conversations] = await pool.execute(
            `SELECT DISTINCT
                CASE 
                    WHEN m.sender_id = ? THEN m.receiver_id 
                    ELSE m.sender_id 
                END as customer_id,
                u.username as customer_name,
                u.email as customer_email,
                MAX(m.created_at) as last_message_time
             FROM messages m
             INNER JOIN users u ON (
                 CASE 
                     WHEN m.sender_id = ? THEN u.id = m.receiver_id 
                     ELSE u.id = m.sender_id 
                 END
             )
             WHERE (m.sender_id = ? OR m.receiver_id = ?)
               AND (m.is_deleted_sender = 0 OR m.sender_id != ?)
               AND (m.is_deleted_receiver = 0 OR m.receiver_id != ?)
             GROUP BY customer_id, u.username, u.email
             ORDER BY last_message_time DESC`,
            [userId, userId, userId, userId, userId, userId]
        );

        // Her konuşma için son mesajı ve okunmamış sayısını getir
        for (let conv of conversations) {
            // Son mesaj
            const [lastMsg] = await pool.execute(
                `SELECT message FROM messages 
                 WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                   AND (is_deleted_sender = 0 OR sender_id != ?)
                   AND (is_deleted_receiver = 0 OR receiver_id != ?)
                 ORDER BY created_at DESC LIMIT 1`,
                [userId, conv.customer_id, conv.customer_id, userId, userId, userId]
            );
            conv.last_message = lastMsg[0]?.message || null;

            // Okunmamış mesaj sayısı
            const [unread] = await pool.execute(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0 AND is_deleted_receiver = 0`,
                [userId, conv.customer_id]
            );
            conv.unread_count = unread[0]?.count || 0;
        }

        // Her konuşma için mesajları getir
        for (let conv of conversations) {
            const [messages] = await pool.execute(
                `SELECT m.*, 
                        u_sender.username as sender_name,
                        u_receiver.username as receiver_name,
                        CASE WHEN m.sender_id = ? THEN 1 ELSE 0 END as is_seller
                 FROM messages m
                 LEFT JOIN users u_sender ON m.sender_id = u_sender.id
                 LEFT JOIN users u_receiver ON m.receiver_id = u_receiver.id
                 WHERE ((m.sender_id = ? AND m.receiver_id = ?) 
                    OR (m.sender_id = ? AND m.receiver_id = ?))
                   AND (m.is_deleted_sender = 0 OR m.sender_id != ?)
                   AND (m.is_deleted_receiver = 0 OR m.receiver_id != ?)
                 ORDER BY m.created_at ASC`,
                [userId, userId, conv.customer_id, conv.customer_id, userId, userId, userId]
            );
            conv.messages = messages;
            // conversation_id yerine customer_id kullan
            conv.conversation_id = conv.customer_id;
            conv.id = conv.customer_id;
        }

        res.json({ messages: conversations });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.post('/messages', async (req, res) => {
    try {
        const { conversation_id, message, receiver_id } = req.body;
        const userId = req.user.id;

        if (!message) {
            return res.status(400).json({ error: 'Mesaj gereklidir' });
        }

        // conversation_id veya receiver_id kullan
        const receiverId = receiver_id || conversation_id;

        if (!receiverId) {
            return res.status(400).json({ error: 'Alıcı ID gereklidir' });
        }

        // Alıcı kontrolü
        const [receiver] = await pool.execute('SELECT id FROM users WHERE id = ?', [receiverId]);
        if (receiver.length === 0) {
            return res.status(404).json({ error: 'Alıcı bulunamadı' });
        }

        // Mesaj gönder
        const [result] = await pool.execute(
            `INSERT INTO messages (sender_id, receiver_id, subject, message) 
             VALUES (?, ?, ?, ?)`,
            [userId, receiverId, null, message]
        );

        res.json({ 
            message: 'Mesaj gönderildi',
            message_id: result.insertId
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Müşteriler
router.get('/customers', async (req, res) => {
    try {
        const userId = req.user.id;

        const [customers] = await pool.execute(
            `SELECT DISTINCT u.id, u.username, u.email, u.created_at,
                    COUNT(DISTINCT o.id) as order_count,
                    SUM(oi.subtotal) as total_spent
             FROM users u
             INNER JOIN orders o ON u.id = o.user_id
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ?
             GROUP BY u.id
             ORDER BY total_spent DESC`,
            [userId]
        );

        res.json({ customers });
    } catch (error) {
        console.error('Get customers error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kuponlar (basit versiyon - coupon tablosu varsa)
router.get('/coupons', async (req, res) => {
    try {
        // TODO: Implement seller-specific coupons
        res.json({ coupons: [] });
    } catch (error) {
        console.error('Get coupons error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Raporlar
// Satıcının projelerine favori ekleyen kullanıcıları getir
router.get('/favorites', async (req, res) => {
    try {
        const userId = req.user.id;

        // Satıcının projelerine favori ekleyen kullanıcıları getir
        const [favorites] = await pool.execute(
            `SELECT 
                f.id as favorite_id,
                f.created_at as favorited_at,
                u.id as user_id,
                u.username,
                u.email,
                u.avatar,
                p.id as project_id,
                p.title as project_title,
                p.slug as project_slug,
                c.name as category_name,
                (SELECT image_path FROM project_images WHERE project_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
            FROM favorites f
            INNER JOIN projects p ON f.project_id = p.id
            INNER JOIN users u ON f.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.user_id = ?
            ORDER BY f.created_at DESC`,
            [userId]
        );

        // URL'leri düzelt
        favorites.forEach(fav => {
            if (fav.primary_image) {
                fav.primary_image = `/uploads/${fav.primary_image}`;
            }
        });

        res.json({ favorites });
    } catch (error) {
        console.error('Get seller favorites error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Satıcının projesinden favoriyi kaldır (kullanıcının favorisini kaldır)
router.delete('/favorites/:favoriteId', async (req, res) => {
    try {
        const { favoriteId } = req.params;
        const userId = req.user.id;

        // Favorinin satıcının projesine ait olduğunu kontrol et
        const [favorite] = await pool.execute(
            `SELECT f.id, p.user_id as project_owner_id
            FROM favorites f
            INNER JOIN projects p ON f.project_id = p.id
            WHERE f.id = ?`,
            [favoriteId]
        );

        if (favorite.length === 0) {
            return res.status(404).json({ error: 'Favori bulunamadı' });
        }

        if (favorite[0].project_owner_id !== userId) {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
        }

        // Favoriyi kaldır
        await pool.execute('DELETE FROM favorites WHERE id = ?', [favoriteId]);

        res.json({ message: 'Favori kaldırıldı' });
    } catch (error) {
        console.error('Remove favorite error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

router.get('/reports', async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = 'month' } = req.query;

        // Basit rapor - daha detaylı yapılabilir
        const [reports] = await pool.execute(
            `SELECT DATE(created_at) as date, COUNT(*) as sales, SUM(subtotal) as revenue
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN projects p ON oi.project_id = p.id
             WHERE p.user_id = ? AND o.payment_status = ?
             GROUP BY DATE(created_at)
             ORDER BY date DESC
             LIMIT 30`,
            [userId, 'paid']
        );

        res.json({ reports });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

export default router;

