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

// Middleware
app.use(cors());
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
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'TeknoProje API is running' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

