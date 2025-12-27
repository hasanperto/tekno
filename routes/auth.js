import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

const router = express.Router();

// Kayıt
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, first_name, last_name } = req.body;

        // Validasyon
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Tüm alanlar gereklidir' });
        }

        // Kullanıcı kontrolü
        const [existing] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Kullanıcı adı veya e-posta zaten kullanılıyor' });
        }

        // Şifre hashleme
        const hashedPassword = await bcrypt.hash(password, 10);

        // Kullanıcı oluştur
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password, first_name, last_name, role_id, status) VALUES (?, ?, ?, ?, ?, 2, ?)',
            [username, email, hashedPassword, first_name || null, last_name || null, 'pending']
        );

        // Token oluştur
        const token = jwt.sign(
            { id: result.insertId, username, email, role: 'user' },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.status(201).json({
            message: 'Kayıt başarılı',
            token,
            user: { id: result.insertId, username, email }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Giriş
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'E-posta ve şifre gereklidir' });
        }

        // Kullanıcı bul
        const [users] = await pool.execute(
            'SELECT u.*, ur.slug as role_slug FROM users u LEFT JOIN user_roles ur ON u.role_id = ur.id WHERE u.email = ? AND u.status = ?',
            [email, 'active']
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
        }

        const user = users[0];

        // Şifre kontrolü
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
        }

        // Token oluştur
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email, role: user.role_slug },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        // Son giriş güncelle
        await pool.execute(
            'UPDATE users SET last_login = NOW(), last_ip = ? WHERE id = ?',
            [req.ip, user.id]
        );

        res.json({
            message: 'Giriş başarılı',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role_slug
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Kullanıcı bilgilerini getir
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Token bulunamadı' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        const [users] = await pool.execute(
            'SELECT u.id, u.username, u.email, u.first_name, u.last_name, ur.slug as role FROM users u LEFT JOIN user_roles ur ON u.role_id = ur.id WHERE u.id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(401).json({ error: 'Geçersiz token' });
    }
});

export default router;

