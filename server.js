import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import sellerRoutes from './routes/seller.js';
import donationsRoutes from './routes/donations.js';
import reviewsRoutes from './routes/reviews.js';
import cartRoutes from './routes/cart.js';
import subscriptionsRoutes from './routes/subscriptions.js';
import leadsRoutes from './routes/leads.js';
import ticketsRoutes from './routes/tickets.js';
import blogRoutes from './routes/blog.js';
import couponsRoutes from './routes/coupons.js';
import ordersRoutes from './routes/orders.js';
import paymentsRoutes from './routes/payments.js';
import userAddressesRoutes from './routes/userAddresses.js';
import userPaymentCardsRoutes from './routes/userPaymentCards.js';
import sectionsRoutes from './routes/sections.js';
import i18nRoutes from './routes/i18n.js';
import salesRoutes from './routes/sales.js';
import menusRoutes from './routes/menus.js';
import publicSettingsRoutes from './routes/publicSettings.js';
import pagesRoutes from './routes/pages.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Environment variable'dan izin verilen origin'leri al
        const allowedOrigins = process.env.CORS_ORIGIN 
            ? process.env.CORS_ORIGIN.split(',')
            : [
                'http://localhost:3000',
                'http://localhost:5173',
                'https://www.hpdemos.de',
                'https://hpdemos.de'
            ];
        
        // Origin yoksa (Postman, curl gibi) veya izin verilen listede ise
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS policy violation'));
        }
    },
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static dosya servisi - uploads klasörünü public yap
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/donations', donationsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/user/addresses', userAddressesRoutes);
app.use('/api/user/payment-cards', userPaymentCardsRoutes);
app.use('/api/sections', sectionsRoutes);
app.use('/api/i18n', i18nRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/menus', menusRoutes);
app.use('/api/public/settings', publicSettingsRoutes);
app.use('/api/pages', pagesRoutes);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        // Veritabanı bağlantısını test et
        const pool = (await import('./config/database.js')).default;
        await pool.execute('SELECT 1');
        
        res.json({ 
            status: 'OK', 
            message: 'TeknoProje API is running',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Health check database error:', error);
        res.status(500).json({ 
            status: 'ERROR', 
            message: 'API çalışıyor ancak veritabanı bağlantısı yok',
            database: 'disconnected',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Database connection failed',
            timestamp: new Date().toISOString()
        });
    }
});

// Database test endpoint
app.get('/api/test-db', async (req, res) => {
    try {
        const pool = (await import('./config/database.js')).default;
        // MariaDB uyumlu sorgu - NOW() yerine CURRENT_TIMESTAMP kullan
        const [result] = await pool.execute('SELECT 1 as test, DATABASE() as db_name, USER() as db_user, CURRENT_TIMESTAMP as db_time');
        
        res.json({ 
            status: 'OK',
            database: {
                connected: true,
                name: result[0].db_name,
                user: result[0].db_user,
                time: result[0].db_time
            },
            config: {
                host: process.env.DB_HOST || 'not set',
                user: process.env.DB_USER || 'not set',
                database: process.env.DB_NAME || 'not set',
                // Şifreyi gösterme
                password: process.env.DB_PASSWORD ? '***set***' : 'not set'
            }
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({ 
            status: 'ERROR',
            error: error.message,
            code: error.code,
            config: {
                host: process.env.DB_HOST || 'not set',
                user: process.env.DB_USER || 'not set',
                database: process.env.DB_NAME || 'not set',
                password: process.env.DB_PASSWORD ? '***set***' : 'not set'
            }
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

