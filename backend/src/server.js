const fastify = require('fastify')({ logger: true });
const path = require('path');
const { migrate, db } = require('./db');

// Run migrations
migrate();

// Store WebSocket connections by boardId
const boardConnections = new Map();

// Register WebSocket support
fastify.register(require('@fastify/websocket'));

// Enable CORS
fastify.register(require('@fastify/cors'), {
    origin: 'http://localhost:5173',
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
});

// Register Cookie support
fastify.register(require('@fastify/cookie'));

// Register Routes
fastify.register(require('./routes/boards'));
fastify.register(require('./routes/auth'), { prefix: '/auth' });

// Ping Route
fastify.get('/ping', async (request, reply) => {
    return { pong: true, timestamp: Date.now() };
});

// Health Check Route
fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
});

// WebSocket Route
fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket, req) => {
        const boardId = req.query.boardId;
        const userId = req.query.userId || 'anonymous';
        const displayName = req.query.displayName || 'Anonymous';

        if (!boardId) {
            socket.close();
            return;
        }

        // Add to room
        if (!boardConnections.has(boardId)) {
            boardConnections.set(boardId, new Set());
        }
        boardConnections.get(boardId).add(socket);

        // Store user info on socket
        socket.userId = userId;
        socket.displayName = displayName;

        console.log(`Client joined board: ${boardId}, userId: ${userId}, displayName: ${displayName}`);

        socket.on('message', (rawMessage) => {
            try {
                const message = JSON.parse(rawMessage.toString());
                const { type, data } = message;

                // Broadcast to all other clients in same room
                const room = boardConnections.get(boardId);
                if (room) {
                    room.forEach(client => {
                        if (client !== socket && client.readyState === 1) {
                            client.send(JSON.stringify({ type, data }));
                        }
                    });
                }

                // Save completed strokes to DB
                if (type === 'draw:end' && data.stroke) {
                    const { stroke } = data;
                    const crypto = require('crypto');
                    const strokeId = crypto.randomUUID();
                    const stmt = db.prepare(`
            INSERT INTO strokes (id, board_id, points, color, width, tool)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
                    stmt.run(strokeId, boardId, JSON.stringify(stroke.points), stroke.color, stroke.lineWidth, 'pen');
                }
            } catch (err) {
                console.error('WebSocket message error:', err);
            }
        });

        socket.on('close', () => {
            const room = boardConnections.get(boardId);
            if (room) {
                // Broadcast user:leave to other clients
                room.forEach(client => {
                    if (client !== socket && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'user:leave',
                            data: { clientId: socket.userId, displayName: socket.displayName }
                        }));
                    }
                });

                room.delete(socket);
                if (room.size === 0) {
                    boardConnections.delete(boardId);
                }
            }
            console.log(`Client left board: ${boardId}, userId: ${userId}`);
        });
    });
});

// Start server
const start = async () => {
    try {
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
