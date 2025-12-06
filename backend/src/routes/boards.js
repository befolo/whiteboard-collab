const { z } = require('zod');
const { db } = require('../db');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');

// Validation Schemas
const StrokeSchema = z.object({
    points: z.array(z.object({ x: z.number(), y: z.number() })),
    color: z.string(),
    width: z.number(),
    tool: z.enum(['pen', 'eraser'])
});

const TextObjectSchema = z.object({
    type: z.literal('text'),
    x: z.number(),
    y: z.number(),
    text: z.string().min(1).max(500),
    fontSize: z.number().min(8).max(96).default(18),
    color: z.string().default('#111827'),
    rotation: z.number().optional()
});

const CreateBoardSchema = z.object({
    name: z.string().min(1).max(100).optional()
});

const UpdateBoardSchema = z.object({
    name: z.string().min(1).max(100)
});

const AddMemberSchema = z.object({
    email: z.string().email().optional(),
    role: z.enum(['editor', 'viewer']).default('viewer')
});

async function routes(fastify, options) {
    fastify.addHook('preHandler', authenticate);

    // GET /boards - List user's boards
    fastify.get('/boards', async (request, reply) => {
        if (!request.user) {
            return reply.code(401).send({ error: 'Authentication required' });
        }

        try {
            const { search, role: roleFilter, sort = 'created_at', order = 'desc', limit = 50, offset = 0 } = request.query;

            // Get owned boards
            const ownedBoards = db.prepare(`
                SELECT b.id, b.name, b.owner_id, b.created_at, b.updated_at, 'owner' as role,
                       u.display_name as owner_name, u.email as owner_email
                FROM boards b
                LEFT JOIN users u ON b.owner_id = u.id
                WHERE b.owner_id = ?
            `).all(request.user.id);

            // Get member boards
            const memberBoards = db.prepare(`
                SELECT b.id, b.name, b.owner_id, b.created_at, b.updated_at, bm.role,
                       u.display_name as owner_name, u.email as owner_email
                FROM boards b
                JOIN board_members bm ON b.id = bm.board_id
                LEFT JOIN users u ON b.owner_id = u.id
                WHERE bm.user_id = ?
            `).all(request.user.id);

            let allBoards = [...ownedBoards, ...memberBoards];

            // Filter
            if (search) {
                const searchLower = search.toLowerCase();
                allBoards = allBoards.filter(b => (b.name || 'Untitled').toLowerCase().includes(searchLower));
            }
            if (roleFilter && ['owner', 'editor', 'viewer'].includes(roleFilter)) {
                allBoards = allBoards.filter(b => b.role === roleFilter);
            }

            // Sort
            allBoards.sort((a, b) => {
                const aVal = a.created_at || 0;
                const bVal = b.created_at || 0;
                return order === 'asc' ? aVal - bVal : bVal - aVal;
            });

            // Pagination
            allBoards = allBoards.slice(parseInt(offset) || 0, (parseInt(offset) || 0) + (parseInt(limit) || 50));

            // Add member count
            const boardsWithMeta = allBoards.map(board => {
                const memberCount = db.prepare('SELECT COUNT(*) as count FROM board_members WHERE board_id = ?').get(board.id);
                return {
                    ...board,
                    name: board.name || 'Untitled',
                    memberCount: (memberCount?.count || 0) + 1
                };
            });

            return { boards: boardsWithMeta };
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Failed to load boards', details: err.message });
        }
    });

    // POST /boards
    fastify.post('/boards', async (request, reply) => {
        const result = CreateBoardSchema.safeParse(request.body);
        if (!result.success) {
            return reply.code(400).send({ error: result.error });
        }

        const id = crypto.randomUUID();
        const ownerId = request.user ? request.user.id : null;
        const name = result.data?.name || 'Untitled';

        db.prepare('INSERT INTO boards (id, owner_id, name) VALUES (?, ?, ?)').run(id, ownerId, name);
        reply.code(201).send({ id, ownerId, name });
    });

    // GET /boards/:id
    fastify.get('/boards/:id', async (request, reply) => {
        const { id } = request.params;
        const board = db.prepare('SELECT id, name, owner_id, created_at, updated_at FROM boards WHERE id = ?').get(id);
        if (!board) {
            return reply.code(404).send({ error: 'Board not found' });
        }

        let ownerInfo = null;
        if (board.owner_id) {
            ownerInfo = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(board.owner_id);
        }

        let role = 'viewer';
        if (board.owner_id) {
            if (!request.user) {
                return reply.code(403).send({ error: 'Forbidden: Private board' });
            }
            if (request.user.id === board.owner_id) {
                role = 'owner';
            } else {
                const member = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(id, request.user.id);
                if (!member) {
                    return reply.code(403).send({ error: 'Forbidden: Not a member' });
                }
                role = member.role;
            }
        } else if (request.user) {
            role = 'editor';
        }

        const members = db.prepare(`
            SELECT u.id, u.email, u.display_name, bm.role
            FROM board_members bm
            JOIN users u ON bm.user_id = u.id
            WHERE bm.board_id = ?
        `).all(id);

        return { id: board.id, name: board.name || 'Untitled', ownerId: board.owner_id, owner: ownerInfo, createdAt: board.created_at, updatedAt: board.updated_at, role, members };
    });

    // PATCH /boards/:id
    fastify.patch('/boards/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const result = UpdateBoardSchema.safeParse(request.body);
            if (!result.success) {
                return reply.code(400).send({ error: 'Invalid name: must be 1-100 characters' });
            }

            const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
            if (!board) {
                return reply.code(404).send({ error: 'Board not found' });
            }

            if (board.owner_id && request.user?.id !== board.owner_id) {
                const member = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(id, request.user?.id);
                if (!member || member.role !== 'editor') {
                    return reply.code(403).send({ error: 'Forbidden: Only owner or editor can rename' });
                }
            }

            db.prepare('UPDATE boards SET name = ? WHERE id = ?').run(result.data.name, id);
            return { id, name: result.data.name };
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'Failed to rename board', details: err.message });
        }
    });

    // DELETE /boards/:id
    fastify.delete('/boards/:id', async (request, reply) => {
        const { id } = request.params;
        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) {
            return reply.code(404).send({ error: 'Board not found' });
        }

        if (board.owner_id && request.user?.id !== board.owner_id) {
            return reply.code(403).send({ error: 'Forbidden: Only owner can delete' });
        }

        db.prepare('DELETE FROM boards WHERE id = ?').run(id);
        return { success: true };
    });

    // POST /boards/:id/members
    fastify.post('/boards/:id/members', async (request, reply) => {
        const { id } = request.params;
        const result = AddMemberSchema.safeParse(request.body);
        if (!result.success) {
            return reply.code(400).send({ error: result.error });
        }

        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) {
            return reply.code(404).send({ error: 'Board not found' });
        }

        if (!request.user || request.user.id !== board.owner_id) {
            return reply.code(403).send({ error: 'Forbidden: Only owner can add members' });
        }

        const { email, role } = result.data;
        if (email) {
            const targetUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
            if (!targetUser) {
                return reply.code(404).send({ error: 'User not found' });
            }
            if (targetUser.id === board.owner_id) {
                return reply.code(400).send({ error: 'Cannot add owner as member' });
            }
            const existing = db.prepare('SELECT * FROM board_members WHERE board_id = ? AND user_id = ?').get(id, targetUser.id);
            if (existing) {
                return reply.code(409).send({ error: 'User is already a member' });
            }
            db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(id, targetUser.id, role);
            return reply.code(201).send({ userId: targetUser.id, role });
        }
        return reply.code(400).send({ error: 'Email required' });
    });

    // DELETE /boards/:id/members/:userId
    fastify.delete('/boards/:id/members/:userId', async (request, reply) => {
        const { id, userId } = request.params;
        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) {
            return reply.code(404).send({ error: 'Board not found' });
        }

        if (userId === board.owner_id) {
            return reply.code(400).send({ error: 'Owner cannot leave their own board' });
        }

        const isOwner = request.user?.id === board.owner_id;
        const isSelf = request.user?.id === userId;
        if (!isOwner && !isSelf) {
            return reply.code(403).send({ error: 'Forbidden' });
        }

        db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(id, userId);
        return { success: true };
    });

    // GET /boards/:id/objects
    fastify.get('/boards/:id/objects', async (request, reply) => {
        const { id } = request.params;
        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) return reply.code(404).send({ error: 'Board not found' });

        if (board.owner_id) {
            if (!request.user) return reply.code(403).send({ error: 'Forbidden: Private board' });
            if (request.user.id !== board.owner_id) {
                const member = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(id, request.user.id);
                if (!member) return reply.code(403).send({ error: 'Forbidden: Not a member' });
            }
        }

        const rows = db.prepare('SELECT id, type, props, z_index, updated_at FROM objects WHERE board_id = ? ORDER BY z_index ASC, updated_at ASC').all(id);
        return rows.map(r => ({
            id: r.id,
            type: r.type,
            props: JSON.parse(r.props),
            zIndex: r.z_index,
            updatedAt: r.updated_at
        }));
    });

    // POST /boards/:id/objects
    fastify.post('/boards/:id/objects', async (request, reply) => {
        const { id } = request.params;
        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) return reply.code(404).send({ error: 'Board not found' });

        if (board.owner_id) {
            if (!request.user) return reply.code(403).send({ error: 'Forbidden: Private board' });
            if (request.user.id !== board.owner_id) {
                const member = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(id, request.user.id);
                if (!member || member.role !== 'editor') return reply.code(403).send({ error: 'Forbidden: Read-only access' });
            }
        }

        const parsed = TextObjectSchema.safeParse(request.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error });

        const objId = crypto.randomUUID();
        const zIndex = request.body?.zIndex ?? 0;
        db.prepare('INSERT INTO objects (id, board_id, type, props, z_index) VALUES (?, ?, ?, ?, ?)').run(
            objId,
            id,
            'text',
            JSON.stringify(parsed.data),
            zIndex
        );

        return reply.code(201).send({ id: objId, type: 'text', props: parsed.data, zIndex });
    });

    // PATCH /boards/:id/objects/:objectId
    fastify.patch('/boards/:id/objects/:objectId', async (request, reply) => {
        const { id, objectId } = request.params;
        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) return reply.code(404).send({ error: 'Board not found' });

        if (board.owner_id) {
            if (!request.user) return reply.code(403).send({ error: 'Forbidden: Private board' });
            if (request.user.id !== board.owner_id) {
                const member = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(id, request.user.id);
                if (!member || member.role !== 'editor') return reply.code(403).send({ error: 'Forbidden: Read-only access' });
            }
        }

        const existing = db.prepare('SELECT id, type, props, z_index FROM objects WHERE id = ? AND board_id = ?').get(objectId, id);
        if (!existing) return reply.code(404).send({ error: 'Object not found' });

        const updateSchema = TextObjectSchema.partial().extend({ type: z.literal('text').optional(), zIndex: z.number().optional() });
        const parsed = updateSchema.safeParse(request.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error });

        const currentProps = JSON.parse(existing.props);
        const newProps = { ...currentProps, ...parsed.data };
        const newZ = parsed.data.zIndex ?? existing.z_index;

        db.prepare('UPDATE objects SET props = ?, z_index = ?, updated_at = unixepoch() WHERE id = ? AND board_id = ?').run(
            JSON.stringify(newProps),
            newZ,
            objectId,
            id
        );

        return { id: objectId, type: 'text', props: newProps, zIndex: newZ };
    });

    // DELETE /boards/:id/objects/:objectId
    fastify.delete('/boards/:id/objects/:objectId', async (request, reply) => {
        const { id, objectId } = request.params;
        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) return reply.code(404).send({ error: 'Board not found' });

        if (board.owner_id) {
            if (!request.user) return reply.code(403).send({ error: 'Forbidden: Private board' });
            if (request.user.id !== board.owner_id) {
                const member = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(id, request.user.id);
                if (!member || member.role !== 'editor') return reply.code(403).send({ error: 'Forbidden: Read-only access' });
            }
        }

        const existing = db.prepare('SELECT id FROM objects WHERE id = ? AND board_id = ?').get(objectId, id);
        if (!existing) return reply.code(404).send({ error: 'Object not found' });

        db.prepare('DELETE FROM objects WHERE id = ? AND board_id = ?').run(objectId, id);
        return { success: true };
    });

    // GET /boards/:id/strokes
    fastify.get('/boards/:id/strokes', async (request, reply) => {
        const { id } = request.params;
        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) {
            return reply.code(404).send({ error: 'Board not found' });
        }

        if (board.owner_id) {
            if (!request.user) {
                return reply.code(403).send({ error: 'Forbidden: Private board' });
            }
            if (request.user.id !== board.owner_id) {
                const member = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(id, request.user.id);
                if (!member) {
                    return reply.code(403).send({ error: 'Forbidden: Not a member' });
                }
            }
        }

        const strokes = db.prepare('SELECT * FROM strokes WHERE board_id = ? ORDER BY created_at ASC').all(id);
        return strokes.map(s => ({ ...s, points: JSON.parse(s.points) }));
    });

    // POST /boards/:id/strokes
    fastify.post('/boards/:id/strokes', async (request, reply) => {
        const { id } = request.params;
        const result = StrokeSchema.safeParse(request.body);
        if (!result.success) {
            return reply.code(400).send({ error: result.error });
        }

        const { points, color, width, tool } = result.data;
        const board = db.prepare('SELECT id, owner_id FROM boards WHERE id = ?').get(id);
        if (!board) {
            return reply.code(404).send({ error: 'Board not found' });
        }

        if (board.owner_id) {
            if (!request.user) {
                return reply.code(403).send({ error: 'Forbidden: Private board' });
            }
            if (request.user.id !== board.owner_id) {
                const member = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(id, request.user.id);
                if (!member || member.role !== 'editor') {
                    return reply.code(403).send({ error: 'Forbidden: Read-only access' });
                }
            }
        }

        const strokeId = crypto.randomUUID();
        db.prepare('INSERT INTO strokes (id, board_id, points, color, width, tool) VALUES (?, ?, ?, ?, ?, ?)').run(strokeId, id, JSON.stringify(points), color, width, tool);
        reply.code(201).send({ id: strokeId });
    });
}

module.exports = routes;
