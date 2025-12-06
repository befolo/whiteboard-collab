const { z } = require('zod');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { db } = require('../db');
const { requireAuth, authenticate } = require('../middleware/auth');

const SignupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().optional()
});

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string()
});

async function routes(fastify, options) {
    // POST /auth/signup
    fastify.post('/signup', async (request, reply) => {
        const result = SignupSchema.safeParse(request.body);
        if (!result.success) {
            return reply.code(400).send({ error: result.error });
        }

        const { email, password, displayName } = result.data;

        // Check if user exists
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return reply.code(409).send({ error: 'Email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = crypto.randomUUID();

        try {
            const stmt = db.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)');
            stmt.run(userId, email, passwordHash, displayName || null);
            reply.code(201).send({ id: userId });
        } catch (err) {
            fastify.log.error(err);
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // POST /auth/login
    fastify.post('/login', async (request, reply) => {
        const result = LoginSchema.safeParse(request.body);
        if (!result.success) {
            return reply.code(400).send({ error: result.error });
        }

        const { email, password } = result.data;

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return reply.code(401).send({ error: 'Invalid credentials' });
        }

        // Create session
        const token = crypto.randomBytes(32).toString('hex');
        const sessionId = crypto.randomUUID();
        const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days

        db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(sessionId, user.id, token, expiresAt);

        // Set cookie
        reply.setCookie('token', token, {
            path: '/',
            httpOnly: true,
            secure: false, // Set to true in production with HTTPS
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        return { user: { id: user.id, email: user.email, displayName: user.display_name } };
    });

    // GET /auth/me
    fastify.get('/me', { preHandler: [authenticate, requireAuth] }, async (request, reply) => {
        return { user: request.user };
    });

    // POST /auth/logout
    fastify.post('/logout', async (request, reply) => {
        const token = request.cookies.token;
        if (token) {
            db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        }
        reply.clearCookie('token');
        return { success: true };
    });
}

module.exports = routes;
