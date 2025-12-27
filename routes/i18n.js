import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Desteklenen diller
const SUPPORTED_LANGUAGES = [
    { code: 'tr', name: 'Türkçe', nativeName: 'Türkçe', rtl: false },
    { code: 'en', name: 'English', nativeName: 'English', rtl: false },
    { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false }
];

// Desteklenen dilleri getir
router.get('/languages', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM languages WHERE status = "active" ORDER BY sort_order ASC');
        
        if (rows.length === 0) {
            // Varsayılan dilleri oluştur
            for (let i = 0; i < SUPPORTED_LANGUAGES.length; i++) {
                const lang = SUPPORTED_LANGUAGES[i];
                await db.query(
                    'INSERT INTO languages (code, name, native_name, rtl, is_default, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [lang.code, lang.name, lang.nativeName, lang.rtl ? 1 : 0, i === 0 ? 1 : 0, 'active', i + 1]
                );
            }
            return res.json(SUPPORTED_LANGUAGES);
        }

        res.json(rows.map(row => ({
            code: row.code,
            name: row.name,
            nativeName: row.native_name,
            rtl: row.rtl === 1,
            isDefault: row.is_default === 1
        })));
    } catch (error) {
        console.error('Error fetching languages:', error);
        res.json(SUPPORTED_LANGUAGES);
    }
});

// Çevirileri getir
router.get('/translations', async (req, res) => {
    try {
        const { lang = 'tr', group } = req.query;
        
        let query = 'SELECT * FROM translations WHERE language_code = ?';
        const params = [lang];
        
        if (group) {
            query += ' AND `group` = ?';
            params.push(group);
        }
        
        const [rows] = await db.query(query, params);
        
        const translations = {};
        rows.forEach(row => {
            translations[row.key] = row.value;
        });
        
        res.json(translations);
    } catch (error) {
        console.error('Error fetching translations:', error);
        res.json({});
    }
});

// Çeviri ekle/güncelle (Admin)
router.post('/translations', authenticate, async (req, res) => {
    try {
        const { language_code, key, value, group = 'general' } = req.body;
        
        // Admin kontrolü
        const [users] = await db.query('SELECT role_id FROM users WHERE id = ?', [req.user.id]);
        if (!users.length || users[0].role_id !== 1) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        
        await db.query(
            'INSERT INTO translations (language_code, `key`, value, `group`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = ?',
            [language_code, key, value, group, value]
        );
        
        res.json({ message: 'Translation saved successfully' });
    } catch (error) {
        console.error('Error saving translation:', error);
        res.status(500).json({ message: 'Error saving translation' });
    }
});

// İçerik çevirilerini getir
router.get('/content/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { lang = 'tr', type = 'project' } = req.query;
        
        const [rows] = await db.query(
            'SELECT * FROM content_translations WHERE content_id = ? AND content_type = ? AND language_code = ?',
            [id, type, lang]
        );
        
        if (rows.length === 0) {
            return res.json(null);
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching content translation:', error);
        res.status(500).json({ message: 'Error fetching content translation' });
    }
});

// Çeviri fonksiyonları
async function translateWithGemini(text, sourceLangName, targetLangName) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY bulunamadı');
    }
    
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    
    // Denenecek model adları (sırayla)
    const modelsToTry = [
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro',
        'gemini-pro'
    ];
    
    let lastError = null;
    
    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            
            const prompt = `Aşağıdaki metni ${sourceLangName} dilinden ${targetLangName} diline çevir. 
Sadece çeviriyi döndür, başka açıklama yapma. 
HTML etiketlerini koru ve sadece metin içeriğini çevir.

Metin:
${text}`;
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const translatedText = response.text().trim();
            
            console.log(`✅ Gemini başarılı model: ${modelName}`);
            return { translatedText, provider: 'Google Gemini AI' };
            
        } catch (modelError) {
            console.warn(`❌ Gemini model ${modelName} hatası:`, modelError.message);
            lastError = modelError;
            continue;
        }
    }
    
    throw lastError || new Error('Tüm Gemini modelleri başarısız oldu');
}

async function translateWithOpenRouter(text, sourceLangName, targetLangName) {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
        throw new Error('OPENROUTER_API_KEY bulunamadı');
    }
    
    // OpenRouter için model seçimi (çeviri için uygun modeller)
    // Denenecek modeller (sırayla)
    const modelsToTry = [
        'openai/gpt-4o-mini',      // Hızlı ve ucuz
        'openai/gpt-3.5-turbo',    // Daha ucuz alternatif
        'google/gemini-2.0-flash-exp', // Gemini alternatifi
        'anthropic/claude-3-haiku'  // Claude alternatifi
    ];
    
    let lastError = null;
    
    for (const model of modelsToTry) {
        try {
            const prompt = `Aşağıdaki metni ${sourceLangName} dilinden ${targetLangName} diline çevir. 
Sadece çeviriyi döndür, başka açıklama yapma. 
HTML etiketlerini koru ve sadece metin içeriğini çevir.

Metin:
${text}`;
            
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3001',
                    'X-Title': 'TeknoProje Translation'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenRouter API hatası (${model}): ${response.status} - ${JSON.stringify(errorData)}`);
            }
            
            const data = await response.json();
            const translatedText = data.choices?.[0]?.message?.content?.trim();
            
            if (!translatedText) {
                throw new Error(`OpenRouter çeviri sonucu boş (${model})`);
            }
            
            console.log(`✅ OpenRouter başarılı: ${model}`);
            return { translatedText, provider: `OpenRouter (${model})` };
            
        } catch (modelError) {
            console.warn(`❌ OpenRouter model ${model} hatası:`, modelError.message);
            lastError = modelError;
            continue;
        }
    }
    
    throw lastError || new Error('Tüm OpenRouter modelleri başarısız oldu');
}

async function translateWithOpenAI(text, sourceLangName, targetLangName) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
        throw new Error('OPENAI_API_KEY bulunamadı');
    }
    
    const model = 'gpt-4o-mini'; // Hızlı ve ucuz
    
    const prompt = `Aşağıdaki metni ${sourceLangName} dilinden ${targetLangName} diline çevir. 
Sadece çeviriyi döndür, başka açıklama yapma. 
HTML etiketlerini koru ve sadece metin içeriğini çevir.

Metin:
${text}`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API hatası: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();
    
    if (!translatedText) {
        throw new Error('OpenAI çeviri sonucu boş');
    }
    
    console.log(`✅ OpenAI başarılı: ${model}`);
    return { translatedText, provider: 'OpenAI GPT-4o-mini' };
}

// Otomatik çeviri (Çoklu API desteği)
router.post('/translate', authenticate, async (req, res) => {
    try {
        const { text, sourceLang = 'tr', targetLang = 'en' } = req.body;
        
        if (!text || !text.trim()) {
            return res.status(400).json({ message: 'Text is required' });
        }
        
        // Seller ve Admin erişebilir
        const [users] = await db.query(
            `SELECT u.role_id, ur.slug as role 
             FROM users u 
             LEFT JOIN user_roles ur ON u.role_id = ur.id 
             WHERE u.id = ?`, 
            [req.user.id]
        );
        if (!users.length || (users[0].role !== 'admin' && users[0].role !== 'seller')) {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        
        // Dil kodlarını tam isimlere çevir
        const languageNames = {
            'tr': 'Türkçe',
            'en': 'English',
            'de': 'Deutsch',
            'fr': 'Français',
            'es': 'Español',
            'ar': 'العربية',
            'ru': 'Русский'
        };
        
        const sourceLangName = languageNames[sourceLang] || sourceLang;
        const targetLangName = languageNames[targetLang] || targetLang;
        
        // Hangi API kullanılacak?
        const useApi = (process.env.USE_TRANSLATE_API || 'gemini').toLowerCase();
        console.log(`🌐 Çeviri API seçimi: ${useApi}`);
        
        let translatedText = '';
        let provider = '';
        let lastError = null;
        
        // API seçimine göre çeviri yap
        try {
            if (useApi === 'openrouter') {
                console.log('🔄 OpenRouter API deneniyor...');
                const result = await translateWithOpenRouter(text, sourceLangName, targetLangName);
                translatedText = result.translatedText;
                provider = result.provider;
            } else if (useApi === 'openai') {
                console.log('🔄 OpenAI API deneniyor...');
                const result = await translateWithOpenAI(text, sourceLangName, targetLangName);
                translatedText = result.translatedText;
                provider = result.provider;
            } else {
                // Varsayılan: Gemini
                console.log('🔄 Gemini API deneniyor...');
                const result = await translateWithGemini(text, sourceLangName, targetLangName);
                translatedText = result.translatedText;
                provider = result.provider;
            }
        } catch (apiError) {
            console.error(`❌ ${useApi} API error:`, apiError.message);
            lastError = apiError;
            
            // Fallback: Diğer API'leri dene
            const fallbackApis = ['openrouter', 'openai', 'gemini'].filter(api => api !== useApi);
            console.log(`🔄 Fallback API'ler deneniyor: ${fallbackApis.join(', ')}`);
            
            for (const fallbackApi of fallbackApis) {
                try {
                    console.log(`🔄 ${fallbackApi} fallback deneniyor...`);
                    if (fallbackApi === 'openrouter') {
                        const result = await translateWithOpenRouter(text, sourceLangName, targetLangName);
                        translatedText = result.translatedText;
                        provider = result.provider + ' (fallback)';
                        console.log(`✅ ${fallbackApi} fallback başarılı`);
                        break;
                    } else if (fallbackApi === 'openai') {
                        const result = await translateWithOpenAI(text, sourceLangName, targetLangName);
                        translatedText = result.translatedText;
                        provider = result.provider + ' (fallback)';
                        console.log(`✅ ${fallbackApi} fallback başarılı`);
                        break;
                    } else if (fallbackApi === 'gemini') {
                        const result = await translateWithGemini(text, sourceLangName, targetLangName);
                        translatedText = result.translatedText;
                        provider = result.provider + ' (fallback)';
                        console.log(`✅ ${fallbackApi} fallback başarılı`);
                        break;
                    }
                } catch (fallbackError) {
                    console.warn(`❌ ${fallbackApi} fallback hatası:`, fallbackError.message);
                    continue;
                }
            }
        }
        
        // Hiçbir API çalışmadıysa fallback çeviri
        if (!translatedText) {
            return res.json({
                translatedText: `[${sourceLangName} → ${targetLangName}]: ${text}`,
                sourceLang,
                targetLang,
                warning: 'Tüm API\'ler başarısız oldu, fallback çeviri kullanıldı',
                error: lastError?.message
            });
        }
        
        res.json({
            translatedText: translatedText,
            sourceLang,
            targetLang,
            provider: provider
        });
        
    } catch (error) {
        console.error('Error translating:', error);
        res.status(500).json({ 
            message: 'Error translating text', 
            error: error.message 
        });
    }
});

// Kullanıcı dil tercihini güncelle
router.put('/users/language', authenticate, async (req, res) => {
    try {
        const { language_code } = req.body;
        const userId = req.user.id;
        
        // Dil tercihini kaydet
        await db.query(
            'INSERT INTO user_language_preferences (user_id, language_code) VALUES (?, ?) ON DUPLICATE KEY UPDATE language_code = ?',
            [userId, language_code, language_code]
        );
        
        res.json({ message: 'Language preference updated successfully' });
    } catch (error) {
        console.error('Error updating language preference:', error);
        res.status(500).json({ message: 'Error updating language preference' });
    }
});

// Kullanıcı dil tercihini getir
router.get('/users/language', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [rows] = await db.query(
            'SELECT language_code FROM user_language_preferences WHERE user_id = ?',
            [userId]
        );
        
        if (rows.length === 0) {
            return res.json({ language_code: 'tr' });
        }
        
        res.json({ language_code: rows[0].language_code });
    } catch (error) {
        console.error('Error fetching language preference:', error);
        res.json({ language_code: 'tr' });
    }
});

export default router;

