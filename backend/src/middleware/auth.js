const { db } = require('../db');

async function authenticate(request, reply) {
    const token = request.cookies.token;

    if (!token) {
        request.user = null;
        return;
    }

    const session = db.prepare(`
    SELECT s.*, u.email, u.display_name 
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, Date.now());

    if (!session) {
        request.user = null;
        return;
    }

    request.user = {
        id: session.user_id,
        email: session.email,
        displayName: session.display_name
    };
}

function requireAuth(request, reply, done) {
    if (!request.user) {
        reply.code(401).send({ error: 'Unauthorized' });
    } else {
        done();
    }
}

module.exports = { authenticate, requireAuth };
