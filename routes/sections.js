import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Multer yapılandırması (hero slide resimleri için)
const heroSlideStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const heroDir = path.join(process.cwd(), 'public', 'uploads', 'hero');
        if (!fs.existsSync(heroDir)) {
            fs.mkdirSync(heroDir, { recursive: true });
        }
        cb(null, heroDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'hero-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const heroSlideUpload = multer({ 
    storage: heroSlideStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

// Varsayılan bölümler
const DEFAULT_SECTIONS = [
    { id: 1, key: 'hero', title: 'Hero', isActive: true, order: 1 },
    { id: 2, key: 'features', title: 'Özellikler', isActive: true, order: 2 },
    { id: 3, key: 'projects', title: 'Projeler', isActive: true, order: 3 },
    { id: 4, key: 'stats', title: 'İstatistikler', isActive: true, order: 4 },
    { id: 5, key: 'faq', title: 'Sık Sorulan Sorular', isActive: true, order: 5 },
    { id: 6, key: 'about', title: 'Hakkımızda', isActive: true, order: 6 },
    { id: 7, key: 'blog', title: 'Blog', isActive: true, order: 7 },
    { id: 8, key: 'testimonials', title: 'Yorumlar', isActive: true, order: 8 },
    { id: 9, key: 'sponsors', title: 'Sponsorlar', isActive: true, order: 9 },
    { id: 10, key: 'references', title: 'Referanslar', isActive: true, order: 10 },
    { id: 11, key: 'contact', title: 'İletişim', isActive: true, order: 11 }
];

// Tüm bölümleri getir
router.get('/', async (req, res) => {
    try {
        const lang = req.query.lang || 'tr'; // Varsayılan Türkçe
        
        const [rows] = await pool.execute('SELECT * FROM home_sections ORDER BY `order` ASC');
        
        if (rows.length === 0) {
            // Varsayılan bölümleri oluştur
            for (const section of DEFAULT_SECTIONS) {
                await pool.execute(
                    'INSERT INTO home_sections (`key`, title, isActive, `order`) VALUES (?, ?, ?, ?)',
                    [section.key, section.title, section.isActive ? 1 : 0, section.order]
                );
            }
            return res.json(DEFAULT_SECTIONS);
        }

        // Çevirileri yükle ve birleştir
        const sectionsWithTranslations = await Promise.all(rows.map(async (section) => {
            if (lang === 'tr') {
                return section; // Türkçe için çeviri gerekmez
            }
            
            try {
                const [translations] = await pool.execute(
                    `SELECT language_code, title, description 
                     FROM content_translations 
                     WHERE content_id = ? AND content_type = 'section' AND language_code = ?`,
                    [section.id, lang]
                );
                
                if (translations.length > 0) {
                    const trans = translations[0];
                    let translationData = {};
                    
                    // description JSON ise parse et
                    if (trans.description) {
                        try {
                            translationData = JSON.parse(trans.description);
                        } catch (e) {
                            // JSON değilse eski format
                            translationData = { subtitle: trans.description, description: trans.description };
                        }
                    }
                    
                    return {
                        ...section,
                        title: trans.title || section.title,
                        subtitle: translationData.subtitle || section.subtitle,
                        description: translationData.description || section.description
                    };
                }
            } catch (err) {
                console.warn(`Translation error for section ${section.id}:`, err.message);
            }
            
            return section; // Çeviri yoksa orijinal döndür
        }));

        res.json(sectionsWithTranslations);
    } catch (error) {
        console.error('Error fetching sections:', error);
        // Tablo yoksa varsayılan döndür
        res.json(DEFAULT_SECTIONS);
    }
});

// Bölüm sırasını güncelle
router.put('/order', authenticate, async (req, res) => {
    try {
        const { sections } = req.body;

        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Sıraları güncelle
        for (const section of sections) {
            await pool.execute(
                'UPDATE home_sections SET `order` = ? WHERE id = ?',
                [section.order, section.id]
            );
        }

        res.json({ message: 'Order updated successfully' });
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ message: 'Error updating order' });
    }
});

// Bölümü aktif/pasif yap
router.patch('/:id', authenticate, async (req, res) => {
    try {
        const { isActive } = req.body;
        const { id } = req.params;

        // Sadece admin değiştirebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        await pool.execute(
            'UPDATE home_sections SET isActive = ? WHERE id = ?',
            [isActive ? 1 : 0, id]
        );

        res.json({ message: 'Section updated successfully' });
    } catch (error) {
        console.error('Error updating section:', error);
        res.status(500).json({ message: 'Error updating section' });
    }
});

// Bölümü güncelle
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        let { title, description, subtitle, translations } = req.body;

        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        await pool.execute(
            'UPDATE home_sections SET title = ?, description = ?, subtitle = ? WHERE id = ?',
            [title, description || null, subtitle || null, id]
        );

        // Çevirileri kaydet (JSON formatında)
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            title: translations[lang].title || '',
                            subtitle: translations[lang].subtitle || '',
                            description: translations[lang].description || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'section', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                id,
                                lang,
                                translationData.title,
                                JSON.stringify(translationData)
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error saving translation for section ${id} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'Section updated successfully' });
    } catch (error) {
        console.error('Error updating section:', error);
        res.status(500).json({ message: 'Error updating section' });
    }
});

// ==================== HERO SLIDES API ====================

// Hero section'ın slider öğelerini getir
router.get('/hero/slides', async (req, res) => {
    try {
        const lang = req.query.lang || 'tr'; // Varsayılan Türkçe
        
        // Hero section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['hero']
        );
        
        if (sections.length === 0) {
            return res.json({ slides: [] });
        }

        const sectionId = sections[0].id;
        const [slides] = await pool.execute(
            'SELECT * FROM hero_slides WHERE section_id = ? ORDER BY `order` ASC',
            [sectionId]
        );

        // Çevirileri yükle ve birleştir
        const slidesWithTranslations = await Promise.all(slides.map(async (slide) => {
            if (lang === 'tr') {
                return slide; // Türkçe için çeviri gerekmez
            }
            
            try {
                const [translations] = await pool.execute(
                    `SELECT language_code, title, description 
                     FROM content_translations 
                     WHERE content_id = ? AND content_type = 'hero_slide' AND language_code = ?`,
                    [slide.id, lang]
                );
                
                if (translations.length > 0) {
                    const trans = translations[0];
                    let translationData = {};
                    
                    // description JSON ise parse et
                    if (trans.description) {
                        try {
                            translationData = JSON.parse(trans.description);
                        } catch (e) {
                            // JSON değilse eski format
                            translationData = { subtitle: trans.description };
                        }
                    }
                    
                    return {
                        ...slide,
                        title: trans.title || slide.title,
                        subtitle: translationData.subtitle || slide.subtitle,
                        button_text: translationData.button_text || slide.button_text,
                        button_text_2: translationData.button_text_2 || slide.button_text_2
                    };
                }
            } catch (err) {
                console.warn(`Translation error for slide ${slide.id}:`, err.message);
            }
            
            return slide; // Çeviri yoksa orijinal döndür
        }));

        res.json({ slides: slidesWithTranslations });
    } catch (error) {
        console.error('Error fetching hero slides:', error);
        res.json({ slides: [] });
    }
});

// Hero slide ekle
router.post('/hero/slides', authenticate, heroSlideUpload.single('image'), async (req, res) => {
    try {
        // Sadece admin ekleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Hero section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['hero']
        );
        
        if (sections.length === 0) {
            return res.status(404).json({ error: 'Hero section bulunamadı' });
        }

        const sectionId = sections[0].id;
        let { title, subtitle, gradient, link, button_text, button_link, button_text_2, button_link_2, order, status, translations } = req.body;
        const imagePath = req.file ? `hero/${req.file.filename}` : null;
        
        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        if (!title) {
            return res.status(400).json({ error: 'Başlık gerekli' });
        }

        const [result] = await pool.execute(
            'INSERT INTO hero_slides (section_id, title, subtitle, image, gradient, link, button_text, button_link, button_text_2, button_link_2, `order`, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [sectionId, title, subtitle || null, imagePath, gradient || null, link || null, button_text || null, button_link || null, button_text_2 || null, button_link_2 || null, order || 0, status || 'active']
        );

        const slideId = result.insertId;

        // Çevirileri kaydet (JSON formatında)
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            title: translations[lang].title || '',
                            subtitle: translations[lang].subtitle || '',
                            button_text: translations[lang].button_text || '',
                            button_text_2: translations[lang].button_text_2 || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'hero_slide', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                slideId,
                                lang,
                                translationData.title,
                                JSON.stringify(translationData)
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error saving translation for ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'Hero slide başarıyla eklendi', slide_id: slideId });
    } catch (error) {
        console.error('Error adding hero slide:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Hero slide güncelle
router.put('/hero/slides/:id', authenticate, heroSlideUpload.single('image'), async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        let { title, subtitle, gradient, link, button_text, button_link, button_text_2, button_link_2, order, status, existing_image, translations } = req.body;
        const imagePath = req.file ? `hero/${req.file.filename}` : existing_image;
        
        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        const [existing] = await pool.execute('SELECT * FROM hero_slides WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Hero slide bulunamadı' });
        }

        if (!title) {
            return res.status(400).json({ error: 'Başlık gerekli' });
        }

        // Eski resmi sil (yeni resim yüklendiyse)
        if (req.file && existing[0].image) {
            const oldImagePath = path.join(process.cwd(), 'public', 'uploads', existing[0].image);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        await pool.execute(
            'UPDATE hero_slides SET title = ?, subtitle = ?, image = ?, gradient = ?, link = ?, button_text = ?, button_link = ?, button_text_2 = ?, button_link_2 = ?, `order` = ?, status = ?, updated_at = NOW() WHERE id = ?',
            [title, subtitle || null, imagePath, gradient || null, link || null, button_text || null, button_link || null, button_text_2 || null, button_link_2 || null, order || 0, status || 'active', id]
        );

        // Çevirileri güncelle (JSON formatında)
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            title: translations[lang].title || '',
                            subtitle: translations[lang].subtitle || '',
                            button_text: translations[lang].button_text || '',
                            button_text_2: translations[lang].button_text_2 || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'hero_slide', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                id,
                                lang,
                                translationData.title,
                                JSON.stringify(translationData)
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error updating translation for ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'Hero slide başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating hero slide:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Hero slide sil
router.delete('/hero/slides/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin silebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const [slide] = await pool.execute('SELECT image FROM hero_slides WHERE id = ?', [id]);
        
        if (slide.length > 0 && slide[0].image) {
            const imagePath = path.join(process.cwd(), 'public', 'uploads', slide[0].image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        await pool.execute('DELETE FROM hero_slides WHERE id = ?', [id]);
        res.json({ message: 'Hero slide başarıyla silindi' });
    } catch (error) {
        console.error('Error deleting hero slide:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Hero slide sırasını güncelle
router.put('/hero/slides/order', authenticate, async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { slides } = req.body;
        if (!Array.isArray(slides)) {
            return res.status(400).json({ error: 'Geçersiz veri' });
        }

        for (const slide of slides) {
            await pool.execute(
                'UPDATE hero_slides SET `order` = ? WHERE id = ?',
                [slide.order, slide.id]
            );
        }

        res.json({ message: 'Sıra güncellendi' });
    } catch (error) {
        console.error('Error updating hero slide order:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Hero slide durumunu değiştir
router.patch('/hero/slides/:id/status', authenticate, async (req, res) => {
    try {
        // Sadece admin değiştirebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ error: 'Geçersiz durum' });
        }

        await pool.execute(
            'UPDATE hero_slides SET status = ? WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'Durum güncellendi' });
    } catch (error) {
        console.error('Error updating hero slide status:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// ==================== PROJECTS SECTION SETTINGS API ====================

// Projects section ayarlarını getir
router.get('/projects/settings', async (req, res) => {
    try {
        // Projects section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['projects']
        );
        
        if (sections.length === 0) {
            return res.json({ settings: null });
        }

        const sectionId = sections[0].id;
        const [settings] = await pool.execute(
            'SELECT * FROM projects_section_settings WHERE section_id = ? LIMIT 1',
            [sectionId]
        );

        if (settings.length === 0) {
            // Varsayılan ayarları oluştur
            await pool.execute(
                'INSERT INTO projects_section_settings (section_id, display_count, display_type, sort_by, show_filters, show_view_all) VALUES (?, ?, ?, ?, ?, ?)',
                [sectionId, 6, 'featured', 'latest', 1, 1]
            );
            const [newSettings] = await pool.execute(
                'SELECT * FROM projects_section_settings WHERE section_id = ? LIMIT 1',
                [sectionId]
            );
            return res.json({ settings: newSettings[0] });
        }

        // JSON alanlarını parse et
        const setting = settings[0];
        if (setting.category_ids) {
            try {
                setting.category_ids = JSON.parse(setting.category_ids);
            } catch (e) {
                setting.category_ids = [];
            }
        } else {
            setting.category_ids = [];
        }

        if (setting.selected_project_ids) {
            try {
                setting.selected_project_ids = JSON.parse(setting.selected_project_ids);
            } catch (e) {
                setting.selected_project_ids = [];
            }
        } else {
            setting.selected_project_ids = [];
        }

        res.json({ settings: setting });
    } catch (error) {
        console.error('Error fetching projects section settings:', error);
        res.json({ settings: null });
    }
});

// Projects section ayarlarını güncelle
router.put('/projects/settings', authenticate, async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Projects section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['projects']
        );
        
        if (sections.length === 0) {
            return res.status(404).json({ error: 'Projects section bulunamadı' });
        }

        const sectionId = sections[0].id;
        const { display_count, display_type, category_ids, selected_project_ids, sort_by, show_filters, show_view_all } = req.body;

        // JSON alanlarını string'e çevir
        const categoryIdsJson = Array.isArray(category_ids) ? JSON.stringify(category_ids) : null;
        const selectedProjectIdsJson = Array.isArray(selected_project_ids) ? JSON.stringify(selected_project_ids) : null;

        // Mevcut ayarları kontrol et
        const [existing] = await pool.execute(
            'SELECT id FROM projects_section_settings WHERE section_id = ?',
            [sectionId]
        );

        if (existing.length === 0) {
            // Yeni ayarlar oluştur
            await pool.execute(
                'INSERT INTO projects_section_settings (section_id, display_count, display_type, category_ids, selected_project_ids, sort_by, show_filters, show_view_all) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [sectionId, display_count || 6, display_type || 'featured', categoryIdsJson, selectedProjectIdsJson, sort_by || 'latest', show_filters ? 1 : 0, show_view_all ? 1 : 0]
            );
        } else {
            // Mevcut ayarları güncelle
            await pool.execute(
                'UPDATE projects_section_settings SET display_count = ?, display_type = ?, category_ids = ?, selected_project_ids = ?, sort_by = ?, show_filters = ?, show_view_all = ?, updated_at = NOW() WHERE section_id = ?',
                [display_count || 6, display_type || 'featured', categoryIdsJson, selectedProjectIdsJson, sort_by || 'latest', show_filters ? 1 : 0, show_view_all ? 1 : 0, sectionId]
            );
        }

        res.json({ message: 'Ayarlar başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating projects section settings:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Kategorileri getir (projects section için)
router.get('/projects/categories', async (req, res) => {
    try {
        const [categories] = await pool.execute(
            'SELECT id, name, slug FROM categories WHERE status = ? ORDER BY name ASC',
            ['active']
        );
        res.json({ categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.json({ categories: [] });
    }
});

// Projeleri getir (projects section için - seçim için)
router.get('/projects/list', async (req, res) => {
    try {
        const { search, category_id, featured, lang = 'tr' } = req.query;
        let query = 'SELECT p.id, p.title, p.price, p.status, p.featured as is_featured, c.name as category_name FROM projects p LEFT JOIN categories c ON p.category_id = c.id WHERE p.status = ?';
        const params = ['approved'];

        if (featured === 'true') {
            query += ' AND p.featured = 1';
        }

        if (category_id) {
            query += ' AND p.category_id = ?';
            params.push(category_id);
        }

        if (search) {
            query += ' AND p.title LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY p.created_at DESC LIMIT 100';

        const [projects] = await pool.execute(query, params);
        
        // Her proje için çevirileri getir
        for (let project of projects) {
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
        
        res.json({ projects });
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.json({ projects: [] });
    }
});

// Multer yapılandırması (features items resimleri için)
const featuresItemStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const featuresDir = path.join(process.cwd(), 'public', 'uploads', 'features');
        if (!fs.existsSync(featuresDir)) {
            fs.mkdirSync(featuresDir, { recursive: true });
        }
        cb(null, featuresDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'feature-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const featuresItemUpload = multer({
    storage: featuresItemStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

// Features Items API
router.get('/features/items', async (req, res) => {
    try {
        const lang = req.query.lang || 'tr';
        
        // Features section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['features']
        );
        
        if (sections.length === 0) {
            return res.json({ items: [] });
        }

        const sectionId = sections[0].id;
        const [items] = await pool.execute(
            'SELECT * FROM features_items WHERE section_id = ? ORDER BY `order` ASC, id ASC',
            [sectionId]
        );

        // Çevirileri yükle ve birleştir
        const itemsWithTranslations = await Promise.all(items.map(async (item) => {
            if (lang === 'tr') {
                return item;
            }
            
            try {
                const [translations] = await pool.execute(
                    `SELECT language_code, title, description 
                     FROM content_translations 
                     WHERE content_id = ? AND content_type = 'feature' AND language_code = ?`,
                    [item.id, lang]
                );
                
                if (translations.length > 0) {
                    const trans = translations[0];
                    return {
                        ...item,
                        title: trans.title || item.title,
                        description: trans.description || item.description
                    };
                }
            } catch (err) {
                console.warn(`Translation error for feature ${item.id}:`, err.message);
            }
            
            return item;
        }));

        res.json({ items: itemsWithTranslations });
    } catch (error) {
        console.error('Error fetching features items:', error);
        res.json({ items: [] });
    }
});

router.post('/features/items', authenticate, featuresItemUpload.single('image'), async (req, res) => {
    try {
        // Sadece admin ekleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Features section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['features']
        );
        
        if (sections.length === 0) {
            return res.status(404).json({ error: 'Features section bulunamadı' });
        }

        const sectionId = sections[0].id;
        let { title, description, icon, link, link_text, translations } = req.body;
        const image = req.file ? `/uploads/features/${req.file.filename}` : null;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        // En yüksek order değerini bul
        const [maxOrder] = await pool.execute(
            'SELECT MAX(`order`) as max_order FROM features_items WHERE section_id = ?',
            [sectionId]
        );
        const newOrder = (maxOrder[0]?.max_order || 0) + 1;

        const [result] = await pool.execute(
            'INSERT INTO features_items (section_id, title, description, icon, image, link, link_text, `order`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [sectionId, title, description || null, icon || null, image, link || null, link_text || null, newOrder]
        );

        const itemId = result.insertId;

        // Çevirileri kaydet (JSON formatında)
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            title: translations[lang].title || '',
                            description: translations[lang].description || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'feature', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                itemId,
                                lang,
                                translationData.title,
                                translationData.description
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error saving translation for feature ${itemId} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'Özellik başarıyla eklendi', id: itemId });
    } catch (error) {
        console.error('Error creating feature item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/features/items/:id', authenticate, featuresItemUpload.single('image'), async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        let { title, description, icon, link, link_text, existing_image, translations } = req.body;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        // Mevcut öğeyi bul
        const [existing] = await pool.execute(
            'SELECT image FROM features_items WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Özellik bulunamadı' });
        }

        let image = existing_image || existing[0].image;
        if (req.file) {
            // Eski resmi sil
            if (existing[0].image && existing[0].image.startsWith('/uploads/')) {
                const oldImagePath = path.join(process.cwd(), 'public', existing[0].image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            image = `/uploads/features/${req.file.filename}`;
        }

        await pool.execute(
            'UPDATE features_items SET title = ?, description = ?, icon = ?, image = ?, link = ?, link_text = ?, updated_at = NOW() WHERE id = ?',
            [title, description || null, icon || null, image, link || null, link_text || null, id]
        );

        // Çevirileri kaydet (JSON formatında)
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            title: translations[lang].title || '',
                            description: translations[lang].description || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'feature', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                id,
                                lang,
                                translationData.title,
                                translationData.description
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error updating translation for feature ${id} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'Özellik başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating feature item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.delete('/features/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin silebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;

        // Resmi sil
        const [item] = await pool.execute(
            'SELECT image FROM features_items WHERE id = ?',
            [id]
        );

        if (item.length > 0 && item[0].image && item[0].image.startsWith('/uploads/')) {
            const imagePath = path.join(process.cwd(), 'public', item[0].image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        await pool.execute('DELETE FROM features_items WHERE id = ?', [id]);

        res.json({ message: 'Özellik başarıyla silindi' });
    } catch (error) {
        console.error('Error deleting feature item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/features/items/order', authenticate, async (req, res) => {
    try {
        // Sadece admin sıralayabilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { items } = req.body;
        
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Geçersiz veri formatı' });
        }

        for (const item of items) {
            await pool.execute(
                'UPDATE features_items SET `order` = ? WHERE id = ?',
                [item.order, item.id]
            );
        }

        res.json({ message: 'Sıralama başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating features items order:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.patch('/features/items/:id/status', authenticate, async (req, res) => {
    try {
        // Sadece admin durumu değiştirebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const { status } = req.body;

        await pool.execute(
            'UPDATE features_items SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'Durum başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating feature item status:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Stats Items API
router.get('/stats/items', async (req, res) => {
    try {
        const lang = req.query.lang || 'tr';
        
        // Stats section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['stats']
        );
        
        if (sections.length === 0) {
            return res.json({ items: [] });
        }

        const sectionId = sections[0].id;
        const [items] = await pool.execute(
            'SELECT * FROM stats_items WHERE section_id = ? ORDER BY `order` ASC, id ASC',
            [sectionId]
        );

        // Çevirileri yükle ve birleştir
        const itemsWithTranslations = await Promise.all(items.map(async (item) => {
            if (lang === 'tr') {
                return item;
            }
            
            try {
                const [translations] = await pool.execute(
                    `SELECT language_code, title, description 
                     FROM content_translations 
                     WHERE content_id = ? AND content_type = 'stat_item' AND language_code = ?`,
                    [item.id, lang]
                );
                
                if (translations.length > 0) {
                    const trans = translations[0];
                    return {
                        ...item,
                        number: trans.title || item.number,
                        label: trans.description || item.label
                    };
                }
            } catch (err) {
                console.warn(`Translation error for stat ${item.id}:`, err.message);
            }
            
            return item;
        }));

        res.json({ items: itemsWithTranslations });
    } catch (error) {
        console.error('Error fetching stats items:', error);
        res.json({ items: [] });
    }
});

router.post('/stats/items', authenticate, async (req, res) => {
    try {
        // Sadece admin ekleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Stats section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['stats']
        );
        
        if (sections.length === 0) {
            return res.status(404).json({ error: 'Stats section bulunamadı' });
        }

        const sectionId = sections[0].id;
        const { number, label, icon, color } = req.body;

        // En yüksek order değerini bul
        const [maxOrder] = await pool.execute(
            'SELECT MAX(`order`) as max_order FROM stats_items WHERE section_id = ?',
            [sectionId]
        );
        const newOrder = (maxOrder[0]?.max_order || 0) + 1;

        const [result] = await pool.execute(
            'INSERT INTO stats_items (section_id, number, label, icon, color, `order`) VALUES (?, ?, ?, ?, ?, ?)',
            [sectionId, number, label, icon || null, color || '#667eea', newOrder]
        );

        res.json({ message: 'İstatistik başarıyla eklendi', id: result.insertId });
    } catch (error) {
        console.error('Error creating stat item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/stats/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        let { number, label, icon, color, translations } = req.body;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        await pool.execute(
            'UPDATE stats_items SET number = ?, label = ?, icon = ?, color = ?, updated_at = NOW() WHERE id = ?',
            [number, label, icon || null, color || '#667eea', id]
        );

        // Çevirileri kaydet
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            number: translations[lang].number || '',
                            label: translations[lang].label || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'stat_item', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                id,
                                lang,
                                translationData.number,
                                translationData.label
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error updating translation for stat ${id} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'İstatistik başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating stat item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.delete('/stats/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin silebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        await pool.execute('DELETE FROM stats_items WHERE id = ?', [id]);

        res.json({ message: 'İstatistik başarıyla silindi' });
    } catch (error) {
        console.error('Error deleting stat item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/stats/items/order', authenticate, async (req, res) => {
    try {
        // Sadece admin sıralayabilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { items } = req.body;
        
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Geçersiz veri formatı' });
        }

        for (const item of items) {
            await pool.execute(
                'UPDATE stats_items SET `order` = ? WHERE id = ?',
                [item.order, item.id]
            );
        }

        res.json({ message: 'Sıralama başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating stats items order:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.patch('/stats/items/:id/status', authenticate, async (req, res) => {
    try {
        // Sadece admin durumu değiştirebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const { status } = req.body;

        await pool.execute(
            'UPDATE stats_items SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'Durum başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating stat item status:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// FAQ Items API
router.get('/faq/items', async (req, res) => {
    try {
        const lang = req.query.lang || 'tr';
        
        // FAQ section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['faq']
        );
        
        if (sections.length === 0) {
            return res.json({ items: [] });
        }

        const sectionId = sections[0].id;
        const [items] = await pool.execute(
            'SELECT * FROM faq_items WHERE section_id = ? ORDER BY `order` ASC, id ASC',
            [sectionId]
        );

        // Çevirileri yükle ve birleştir
        const itemsWithTranslations = await Promise.all(items.map(async (item) => {
            if (lang === 'tr') {
                return item;
            }
            
            try {
                const [translations] = await pool.execute(
                    `SELECT language_code, title, description 
                     FROM content_translations 
                     WHERE content_id = ? AND content_type = 'faq_item' AND language_code = ?`,
                    [item.id, lang]
                );
                
                if (translations.length > 0) {
                    const trans = translations[0];
                    return {
                        ...item,
                        question: trans.title || item.question,
                        answer: trans.description || item.answer
                    };
                }
            } catch (err) {
                console.warn(`Translation error for FAQ ${item.id}:`, err.message);
            }
            
            return item;
        }));

        res.json({ items: itemsWithTranslations });
    } catch (error) {
        console.error('Error fetching FAQ items:', error);
        res.json({ items: [] });
    }
});

router.post('/faq/items', authenticate, async (req, res) => {
    try {
        // Sadece admin ekleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // FAQ section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['faq']
        );
        
        if (sections.length === 0) {
            return res.status(404).json({ error: 'FAQ section bulunamadı' });
        }

        const sectionId = sections[0].id;
        let { question, answer, category, translations } = req.body;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        if (!question || !answer) {
            return res.status(400).json({ error: 'Soru ve cevap gerekli' });
        }

        // En yüksek order değerini bul
        const [maxOrder] = await pool.execute(
            'SELECT MAX(`order`) as max_order FROM faq_items WHERE section_id = ?',
            [sectionId]
        );
        const newOrder = (maxOrder[0]?.max_order || 0) + 1;

        const [result] = await pool.execute(
            'INSERT INTO faq_items (section_id, question, answer, category, `order`) VALUES (?, ?, ?, ?, ?)',
            [sectionId, question, answer, category || null, newOrder]
        );

        const itemId = result.insertId;

        // Çevirileri kaydet
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            question: translations[lang].question || '',
                            answer: translations[lang].answer || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'faq_item', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                itemId,
                                lang,
                                translationData.question,
                                translationData.answer
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error saving translation for FAQ ${itemId} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'FAQ başarıyla eklendi', id: itemId });
    } catch (error) {
        console.error('Error creating FAQ item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/faq/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        let { question, answer, category, translations } = req.body;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        if (!question || !answer) {
            return res.status(400).json({ error: 'Soru ve cevap gerekli' });
        }

        await pool.execute(
            'UPDATE faq_items SET question = ?, answer = ?, category = ?, updated_at = NOW() WHERE id = ?',
            [question, answer, category || null, id]
        );

        // Çevirileri kaydet
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            question: translations[lang].question || '',
                            answer: translations[lang].answer || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'faq_item', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                id,
                                lang,
                                translationData.question,
                                translationData.answer
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error updating translation for FAQ ${id} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'FAQ başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating FAQ item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.delete('/faq/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin silebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        await pool.execute('DELETE FROM faq_items WHERE id = ?', [id]);

        res.json({ message: 'FAQ başarıyla silindi' });
    } catch (error) {
        console.error('Error deleting FAQ item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/faq/items/order', authenticate, async (req, res) => {
    try {
        // Sadece admin sıralayabilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { items } = req.body;
        
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Geçersiz veri formatı' });
        }

        for (const item of items) {
            await pool.execute(
                'UPDATE faq_items SET `order` = ? WHERE id = ?',
                [item.order, item.id]
            );
        }

        res.json({ message: 'Sıralama başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating FAQ items order:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.patch('/faq/items/:id/status', authenticate, async (req, res) => {
    try {
        // Sadece admin durumu değiştirebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const { status } = req.body;

        await pool.execute(
            'UPDATE faq_items SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'Durum başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating FAQ item status:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// About Items API
router.get('/about/items', async (req, res) => {
    try {
        const lang = req.query.lang || 'tr';
        
        // About section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['about']
        );
        
        if (sections.length === 0) {
            return res.json({ items: [] });
        }

        const sectionId = sections[0].id;
        const [items] = await pool.execute(
            'SELECT * FROM about_items WHERE section_id = ? ORDER BY `order` ASC, id ASC',
            [sectionId]
        );

        // Çevirileri yükle ve birleştir
        const itemsWithTranslations = await Promise.all(items.map(async (item) => {
            if (lang === 'tr') {
                return item;
            }
            
            try {
                const [translations] = await pool.execute(
                    `SELECT language_code, title, description 
                     FROM content_translations 
                     WHERE content_id = ? AND content_type = 'about_item' AND language_code = ?`,
                    [item.id, lang]
                );
                
                if (translations.length > 0) {
                    const trans = translations[0];
                    return {
                        ...item,
                        text: trans.title || item.text
                    };
                }
            } catch (err) {
                console.warn(`Translation error for about ${item.id}:`, err.message);
            }
            
            return item;
        }));

        res.json({ items: itemsWithTranslations });
    } catch (error) {
        console.error('Error fetching about items:', error);
        res.json({ items: [] });
    }
});

router.post('/about/items', authenticate, async (req, res) => {
    try {
        // Sadece admin ekleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // About section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['about']
        );
        
        if (sections.length === 0) {
            return res.status(404).json({ error: 'About section bulunamadı' });
        }

        const sectionId = sections[0].id;
        let { text, icon, status, translations } = req.body;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        if (!text) {
            return res.status(400).json({ error: 'Metin gerekli' });
        }

        // En yüksek order değerini bul
        const [maxOrder] = await pool.execute(
            'SELECT MAX(`order`) as max_order FROM about_items WHERE section_id = ?',
            [sectionId]
        );
        const newOrder = (maxOrder[0]?.max_order || 0) + 1;

        const [result] = await pool.execute(
            'INSERT INTO about_items (section_id, text, icon, status, `order`) VALUES (?, ?, ?, ?, ?)',
            [sectionId, text, icon || null, status || 'active', newOrder]
        );

        const itemId = result.insertId;

        // Çevirileri kaydet
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            text: translations[lang].text || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'about_item', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                itemId,
                                lang,
                                translationData.text,
                                ''
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error saving translation for about ${itemId} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'About öğesi başarıyla eklendi', id: itemId });
    } catch (error) {
        console.error('Error creating about item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/about/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        let { text, icon, status, translations } = req.body;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        if (!text) {
            return res.status(400).json({ error: 'Metin gerekli' });
        }

        await pool.execute(
            'UPDATE about_items SET text = ?, icon = ?, status = ?, updated_at = NOW() WHERE id = ?',
            [text, icon || null, status || 'active', id]
        );

        // Çevirileri kaydet
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            text: translations[lang].text || ''
                        };
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description) 
                             VALUES (?, 'about_item', ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
                            [
                                id,
                                lang,
                                translationData.text,
                                ''
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error updating translation for about ${id} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'About öğesi başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating about item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.delete('/about/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin silebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        await pool.execute('DELETE FROM about_items WHERE id = ?', [id]);

        res.json({ message: 'About öğesi başarıyla silindi' });
    } catch (error) {
        console.error('Error deleting about item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/about/items/order', authenticate, async (req, res) => {
    try {
        // Sadece admin sıralayabilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { items } = req.body;
        
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Geçersiz veri formatı' });
        }

        for (const item of items) {
            await pool.execute(
                'UPDATE about_items SET `order` = ? WHERE id = ?',
                [item.order, item.id]
            );
        }

        res.json({ message: 'Sıralama başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating about items order:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.patch('/about/items/:id/status', authenticate, async (req, res) => {
    try {
        // Sadece admin durumu değiştirebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const { status } = req.body;

        await pool.execute(
            'UPDATE about_items SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'Durum başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating about item status:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Testimonials Items API
router.get('/testimonials/items', async (req, res) => {
    try {
        const lang = req.query.lang || 'tr';
        
        // Testimonials section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['testimonials']
        );
        
        if (sections.length === 0) {
            return res.json({ items: [] });
        }

        const sectionId = sections[0].id;
        const [items] = await pool.execute(
            'SELECT * FROM testimonials_items WHERE section_id = ? ORDER BY `order` ASC, id ASC',
            [sectionId]
        );

        // Çevirileri yükle ve birleştir
        const itemsWithTranslations = await Promise.all(items.map(async (item) => {
            if (lang === 'tr') {
                return item;
            }
            
            try {
                const [translations] = await pool.execute(
                    `SELECT language_code, title, description, extra_data
                     FROM content_translations 
                     WHERE content_id = ? AND content_type = 'testimonial_item' AND language_code = ?`,
                    [item.id, lang]
                );
                
                if (translations.length > 0) {
                    const trans = translations[0];
                    let extraData = {};
                    try {
                        if (trans.extra_data) {
                            extraData = JSON.parse(trans.extra_data);
                        }
                    } catch (e) {
                        console.warn('Error parsing extra_data:', e);
                    }
                    
                    return {
                        ...item,
                        name: trans.title || item.name,
                        comment: trans.description || item.comment,
                        role: extraData.role || item.role,
                        company: extraData.company || item.company
                    };
                }
            } catch (err) {
                console.warn(`Translation error for testimonial ${item.id}:`, err.message);
            }
            
            return item;
        }));

        res.json({ items: itemsWithTranslations });
    } catch (error) {
        console.error('Error fetching testimonials items:', error);
        res.json({ items: [] });
    }
});

router.post('/testimonials/items', authenticate, async (req, res) => {
    try {
        // Sadece admin ekleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Testimonials section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['testimonials']
        );
        
        if (sections.length === 0) {
            return res.status(404).json({ error: 'Testimonials section bulunamadı' });
        }

        const sectionId = sections[0].id;
        let { name, role, comment, rating, avatar, company, status, translations } = req.body;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        if (!name || !comment) {
            return res.status(400).json({ error: 'İsim ve yorum gerekli' });
        }

        // En yüksek order değerini bul
        const [maxOrder] = await pool.execute(
            'SELECT MAX(`order`) as max_order FROM testimonials_items WHERE section_id = ?',
            [sectionId]
        );
        const newOrder = (maxOrder[0]?.max_order || 0) + 1;

        const [result] = await pool.execute(
            'INSERT INTO testimonials_items (section_id, name, role, comment, rating, avatar, company, status, `order`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [sectionId, name, role || null, comment, rating || 5, avatar || null, company || null, status || 'active', newOrder]
        );

        const itemId = result.insertId;

        // Çevirileri kaydet
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            name: translations[lang].name || '',
                            comment: translations[lang].comment || '',
                            role: translations[lang].role || '',
                            company: translations[lang].company || ''
                        };
                        
                        const extraData = JSON.stringify({
                            role: translationData.role,
                            company: translationData.company
                        });
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description, extra_data) 
                             VALUES (?, 'testimonial_item', ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), extra_data = VALUES(extra_data)`,
                            [
                                itemId,
                                lang,
                                translationData.name,
                                translationData.comment,
                                extraData
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error saving translation for testimonial ${itemId} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'Testimonial başarıyla eklendi', id: itemId });
    } catch (error) {
        console.error('Error creating testimonial item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/testimonials/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        let { name, role, comment, rating, avatar, company, status, translations } = req.body;

        // translations JSON string ise parse et
        if (translations && typeof translations === 'string') {
            try {
                translations = JSON.parse(translations);
            } catch (e) {
                console.error('Error parsing translations:', e);
                translations = null;
            }
        }

        if (!name || !comment) {
            return res.status(400).json({ error: 'İsim ve yorum gerekli' });
        }

        await pool.execute(
            'UPDATE testimonials_items SET name = ?, role = ?, comment = ?, rating = ?, avatar = ?, company = ?, status = ?, updated_at = NOW() WHERE id = ?',
            [name, role || null, comment, rating || 5, avatar || null, company || null, status || 'active', id]
        );

        // Çevirileri kaydet
        if (translations) {
            for (const lang of ['en', 'de']) {
                if (translations[lang]) {
                    try {
                        const translationData = {
                            name: translations[lang].name || '',
                            comment: translations[lang].comment || '',
                            role: translations[lang].role || '',
                            company: translations[lang].company || ''
                        };
                        
                        const extraData = JSON.stringify({
                            role: translationData.role,
                            company: translationData.company
                        });
                        
                        await pool.execute(
                            `INSERT INTO content_translations (content_id, content_type, language_code, title, description, extra_data) 
                             VALUES (?, 'testimonial_item', ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), extra_data = VALUES(extra_data)`,
                            [
                                id,
                                lang,
                                translationData.name,
                                translationData.comment,
                                extraData
                            ]
                        );
                    } catch (transError) {
                        console.error(`Error updating translation for testimonial ${id} in ${lang}:`, transError);
                    }
                }
            }
        }

        res.json({ message: 'Testimonial başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating testimonial item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.delete('/testimonials/items/:id', authenticate, async (req, res) => {
    try {
        // Sadece admin silebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        await pool.execute('DELETE FROM testimonials_items WHERE id = ?', [id]);

        res.json({ message: 'Testimonial başarıyla silindi' });
    } catch (error) {
        console.error('Error deleting testimonial item:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.put('/testimonials/items/order', authenticate, async (req, res) => {
    try {
        // Sadece admin sıralayabilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { items } = req.body;
        
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Geçersiz veri formatı' });
        }

        for (const item of items) {
            await pool.execute(
                'UPDATE testimonials_items SET `order` = ? WHERE id = ?',
                [item.order, item.id]
            );
        }

        res.json({ message: 'Sıralama başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating testimonials items order:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

router.patch('/testimonials/items/:id/status', authenticate, async (req, res) => {
    try {
        // Sadece admin durumu değiştirebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const { status } = req.body;

        await pool.execute(
            'UPDATE testimonials_items SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'Durum başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating testimonial item status:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// Testimonials Settings API
router.get('/testimonials/settings', async (req, res) => {
    try {
        // Testimonials section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['testimonials']
        );
        
        if (sections.length === 0) {
            return res.json({ 
                display_type: 'all',
                display_count: 3,
                show_rating: true,
                show_avatar: true,
                show_company: true,
                slider_enabled: true,
                auto_play: true,
                auto_play_interval: 5000
            });
        }

        const sectionId = sections[0].id;
        const [settings] = await pool.execute(
            'SELECT * FROM testimonials_section_settings WHERE section_id = ? LIMIT 1',
            [sectionId]
        );

        if (settings.length === 0) {
            return res.json({ 
                display_type: 'all',
                display_count: 3,
                show_rating: true,
                show_avatar: true,
                show_company: true,
                slider_enabled: true,
                auto_play: true,
                auto_play_interval: 5000
            });
        }

        const setting = settings[0];
        res.json({
            display_type: setting.display_type || 'all',
            display_count: setting.display_count || 3,
            show_rating: setting.show_rating === 1,
            show_avatar: setting.show_avatar === 1,
            show_company: setting.show_company === 1,
            slider_enabled: setting.slider_enabled === 1,
            auto_play: setting.auto_play === 1,
            auto_play_interval: setting.auto_play_interval || 5000
        });
    } catch (error) {
        console.error('Error fetching testimonials settings:', error);
        res.json({ 
            display_type: 'all',
            display_count: 3,
            show_rating: true,
            show_avatar: true,
            show_company: true,
            slider_enabled: true,
            auto_play: true,
            auto_play_interval: 5000
        });
    }
});

router.put('/testimonials/settings', authenticate, async (req, res) => {
    try {
        // Sadece admin güncelleyebilir
        const [users] = await pool.execute('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Testimonials section'ı bul
        const [sections] = await pool.execute(
            'SELECT id FROM home_sections WHERE `key` = ? LIMIT 1',
            ['testimonials']
        );
        
        if (sections.length === 0) {
            return res.status(404).json({ error: 'Testimonials section bulunamadı' });
        }

        const sectionId = sections[0].id;
        const { display_type, display_count, show_rating, show_avatar, show_company, slider_enabled, auto_play, auto_play_interval } = req.body;

        // Mevcut ayarları kontrol et
        const [existing] = await pool.execute(
            'SELECT id FROM testimonials_section_settings WHERE section_id = ?',
            [sectionId]
        );

        if (existing.length > 0) {
            await pool.execute(
                `UPDATE testimonials_section_settings SET 
                    display_type = ?, display_count = ?, show_rating = ?, show_avatar = ?, 
                    show_company = ?, slider_enabled = ?, auto_play = ?, auto_play_interval = ?, 
                    updated_at = NOW() 
                WHERE section_id = ?`,
                [
                    display_type || 'all',
                    display_count || 3,
                    show_rating ? 1 : 0,
                    show_avatar ? 1 : 0,
                    show_company ? 1 : 0,
                    slider_enabled ? 1 : 0,
                    auto_play ? 1 : 0,
                    auto_play_interval || 5000,
                    sectionId
                ]
            );
        } else {
            await pool.execute(
                `INSERT INTO testimonials_section_settings 
                    (section_id, display_type, display_count, show_rating, show_avatar, show_company, slider_enabled, auto_play, auto_play_interval) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sectionId,
                    display_type || 'all',
                    display_count || 3,
                    show_rating ? 1 : 0,
                    show_avatar ? 1 : 0,
                    show_company ? 1 : 0,
                    slider_enabled ? 1 : 0,
                    auto_play ? 1 : 0,
                    auto_play_interval || 5000
                ]
            );
        }

        res.json({ message: 'Ayarlar başarıyla güncellendi' });
    } catch (error) {
        console.error('Error updating testimonials settings:', error);
        res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
});

// ============================================
// SPONSORS SECTION (Public)
// ============================================

// Sponsorları getir (public)
router.get('/sponsors/list', async (req, res) => {
    try {
        const [sponsors] = await pool.execute(
            'SELECT * FROM sponsors WHERE status = ? ORDER BY sort_order ASC, id ASC',
            ['active']
        );
        res.json({ sponsors });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json({ sponsors: [] });
        } else {
            console.error('Error fetching sponsors:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

// ============================================
// REFERENCES SECTION (Public)
// ============================================

// Referansları getir (public)
router.get('/references/list', async (req, res) => {
    try {
        const [references] = await pool.execute(
            'SELECT * FROM `references` WHERE status = ? ORDER BY sort_order ASC, id ASC',
            ['active']
        );
        res.json({ references });
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            res.json({ references: [] });
        } else {
            console.error('Error fetching references:', error);
            res.status(500).json({ error: 'Sunucu hatası' });
        }
    }
});

export default router;
