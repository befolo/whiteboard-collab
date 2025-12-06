import React, { useRef, useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import api from '../utils/api';
import { connectSocket } from '../utils/socket';
import { useAuth } from '../context/AuthProvider';

const Whiteboard = ({ onError }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const socketRef = useRef(null);
    const { userId, user } = useAuth();

    // Low-frequency State (React handles these)
    const [color, setColor] = useState('#ffffff');
    const [lineWidth, setLineWidth] = useState(2);
    const [tool, setTool] = useState('pen'); // pen | highlighter | eraser
    const [boardId, setBoardId] = useState(null);
    const [connected, setConnected] = useState(false);
    const [role, setRole] = useState('viewer');

    // High-frequency State (Refs handle these for performance)
    const camera = useRef({ x: 0, y: 0, scale: 1 });
    const isDrawing = useRef(false);
    const isPanning = useRef(false);
    const currentStroke = useRef(null);
    const pointers = useRef(new Map()); // Track active pointers (mouse/touch)
    const lastPinchDist = useRef(null);
    const clientId = useRef(Math.random().toString(36).substr(2, 9));
    const cursorPalette = ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ec4899', '#f97316', '#0ea5e9', '#10b981', '#f59e0b'];
    const colorForClient = useCallback((id) => {
        if (!id) return '#646cff';
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
        return cursorPalette[hash % cursorPalette.length];
    }, []);
    const myCursorColor = useMemo(() => colorForClient(userId || clientId.current), [userId, colorForClient]);
    const measureCtxRef = useRef(null);

    // Data (Refs to accessible inside rAF without triggers)
    const strokesRef = useRef([]);
    const remoteStrokesRef = useRef({});
    const remoteCursorsRef = useRef({});

    // History
    const [historyTrigger, setHistoryTrigger] = useState(0); // Dummy state to force re-render for undo/redo buttons
    const historyRef = useRef([]);
    const redoStackRef = useRef([]);
    const objectsRef = useRef([]);
    const objectsVersion = useRef(0);
    const [objectsRevision, setObjectsRevision] = useState(0); // force render when objects change
    const [editingText, setEditingText] = useState(null); // {id, value, screenX, screenY}
    const selectedObjectId = useRef(null);
    const draggingObject = useRef(null);

    // Resolve boardId (once)
    useEffect(() => {
        const ensureBoardId = async () => {
            let id = new URLSearchParams(window.location.search).get('board');
            if (!id) id = localStorage.getItem('boardId');
            if (!id) {
                const res = await api.post('/boards', {});
                id = res.data.id;
            }
            localStorage.setItem('boardId', id);
            setBoardId(id);
        };
        ensureBoardId();
    }, []);

    // Initialize board data and WebSocket (re-run when boardId changes)
    useEffect(() => {
        if (!boardId) return;
        let cancelled = false;

        // Reset remote state on re-entry
        remoteStrokesRef.current = {};
        remoteCursorsRef.current = {};
        setConnected(false);

        const init = async () => {
            try {
                try {
                    const boardRes = await api.get(`/boards/${boardId}`);
                    if (!cancelled) setRole(boardRes.data.role || 'viewer');
                } catch (err) {
                    console.error('Failed to fetch board info:', err);
                    if (!cancelled) setRole('viewer');
                }

                try {
                    const strokesRes = await api.get(`/boards/${boardId}/strokes`);
                    const initialStrokes = strokesRes.data.map(s => ({
                        points: s.points,
                        color: s.color,
                        lineWidth: s.width,
                        opacity: s.opacity ?? 1,
                        tool: s.tool || 'pen'
                    }));
                    strokesRef.current = initialStrokes;
                    if (!cancelled) setHistoryTrigger(prev => prev + 1);
                } catch (err) {
                    if (err.response?.status === 403) onError?.('Access denied to this board');
                    console.error('Failed to load strokes:', err);
                }

                try {
                    const objectsRes = await api.get(`/boards/${boardId}/objects`);
                    const parsedObjects = objectsRes.data.map(o => ({
                        id: o.id,
                        type: o.type,
                        ...(o.props || {}),
                        zIndex: o.zIndex ?? 0
                    }));
                    objectsRef.current = parsedObjects;
                    objectsVersion.current += 1;
                    setObjectsRevision(prev => prev + 1);
                } catch (err) {
                    console.error('Failed to load objects:', err);
                }

                const displayName = user?.displayName || user?.email || 'Anonymous';
                const ws = connectSocket(boardId, userId, displayName, {
                    onOpen: () => !cancelled && setConnected(true),
                    onClose: () => !cancelled && setConnected(false),
                    onMessage: (message) => {
                        const { type, data } = message;
                        if (type === 'draw:start') {
                            remoteStrokesRef.current = {
                                ...remoteStrokesRef.current,
                                [data.clientId]: {
                                    points: [data.point],
                                    color: data.color,
                                    lineWidth: data.lineWidth,
                                    opacity: data.opacity ?? 1,
                                    tool: data.tool || 'pen',
                                    displayName: data.displayName
                                }
                            };
                        } else if (type === 'draw:move') {
                            const existing = remoteStrokesRef.current[data.clientId];
                            if (existing) {
                                existing.points.push(data.point);
                            }
                        } else if (type === 'draw:end') {
                            const { [data.clientId]: removed, ...rest } = remoteStrokesRef.current;
                            remoteStrokesRef.current = rest;
                            if (data.stroke) {
                                strokesRef.current.push({ ...data.stroke, tool: data.stroke.tool || 'pen', opacity: data.stroke.opacity ?? 1 });
                            }
                        } else if (type === 'cursor:move') {
                            remoteCursorsRef.current = {
                                ...remoteCursorsRef.current,
                                [data.clientId]: {
                                    clientId: data.clientId,
                                    x: data.x,
                                    y: data.y,
                                    displayName: data.displayName,
                                    color: data.color || colorForClient(data.clientId)
                                }
                            };
                        } else if (type === 'object:create') {
                            const obj = data.object;
                            if (obj) {
                                const flattened = { id: obj.id, type: obj.type, ...(obj.props || obj), zIndex: obj.zIndex ?? 0 };
                                objectsRef.current = [...objectsRef.current, flattened];
                                objectsVersion.current += 1;
                                setObjectsRevision(prev => prev + 1);
                            }
                        } else if (type === 'object:update') {
                            const obj = data.object;
                            if (obj) {
                                objectsRef.current = objectsRef.current.map(o => o.id === obj.id ? { ...o, ...(obj.props || obj) } : o);
                                objectsVersion.current += 1;
                                setObjectsRevision(prev => prev + 1);
                            }
                        } else if (type === 'object:delete') {
                            const objId = data.objectId;
                            if (objId) {
                                objectsRef.current = objectsRef.current.filter(o => o.id !== objId);
                                objectsVersion.current += 1;
                                setObjectsRevision(prev => prev + 1);
                            }
                        } else if (type === 'user:leave') {
                            const { [data.clientId]: removed, ...rest } = remoteCursorsRef.current;
                            remoteCursorsRef.current = rest;
                        }
                    },
                    onError: (err) => { console.error('WebSocket error:', err); onError?.('Connection error'); }
                });
                socketRef.current = ws;
            } catch (err) {
                console.error('Init error:', err);
                onError?.('Failed to initialize whiteboard');
            }
        };

        init();
        return () => {
            cancelled = true;
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
            remoteStrokesRef.current = {};
            remoteCursorsRef.current = {};
            setConnected(false);
        };
    }, [boardId, userId, user, colorForClient, onError]);

    // Render Loop (60fps)
    useLayoutEffect(() => {
        let animationFrameId;

        const render = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Apply Camera Transform
            ctx.translate(camera.current.x, camera.current.y);
            ctx.scale(camera.current.scale, camera.current.scale);

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const drawStroke = (s) => {
                if (!s.points || s.points.length < 2) return;
                ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
                ctx.beginPath();
                ctx.strokeStyle = s.color;
                ctx.lineWidth = s.lineWidth;
                ctx.globalAlpha = s.opacity ?? 1;
                ctx.moveTo(s.points[0].x, s.points[0].y);
                for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';
            };

            // Local Finished Strokes
            strokesRef.current.forEach(drawStroke);

            // Objects (text)
            objectsRef.current.forEach(obj => {
                if (obj.type !== 'text') return;
                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
                ctx.textBaseline = 'top';
                const fontSize = obj.fontSize || 18;
                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillStyle = obj.color || '#111827';
                if (selectedObjectId.current === obj.id) {
                    const metrics = ctx.measureText(obj.text || '');
                    const width = metrics.width;
                    const height = fontSize * 1.2;
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1 / camera.current.scale;
                    ctx.strokeRect(obj.x - 2 / camera.current.scale, obj.y - 2 / camera.current.scale, width + 4 / camera.current.scale, height + 4 / camera.current.scale);
                }
                if (obj.rotation) {
                    ctx.translate(obj.x, obj.y);
                    ctx.rotate((obj.rotation * Math.PI) / 180);
                    ctx.fillText(obj.text || '', 0, 0);
                } else {
                    ctx.fillText(obj.text || '', obj.x, obj.y);
                }
                ctx.restore();
            });

            // Remote Active Strokes
            Object.values(remoteStrokesRef.current).forEach(s => {
                drawStroke(s);
                if (s.displayName && s.points.length > 0) {
                    const last = s.points[s.points.length - 1];
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset for text
                    const screenX = last.x * camera.current.scale + camera.current.x;
                    const screenY = last.y * camera.current.scale + camera.current.y;
                    ctx.font = '12px sans-serif';
                    ctx.fillStyle = s.color;
                    ctx.fillText(s.displayName, screenX + 10, screenY - 10);
                    ctx.restore();
                }
            });

            // Current Drawing Stroke
            if (currentStroke.current) {
                drawStroke(currentStroke.current);
            }

            // Remote Cursors
            // Draw cursors in world space to match zoom
            ctx.restore();
            // Re-apply transform for cursors or draw them based on world pos?
            // Cursors are world positions.
            ctx.save();
            ctx.translate(camera.current.x, camera.current.y);
            ctx.scale(camera.current.scale, camera.current.scale);

            Object.values(remoteCursorsRef.current).forEach(c => {
                ctx.beginPath();
                const cursorColor = c.color || colorForClient(c.clientId);
                ctx.fillStyle = cursorColor;
                // Draw cursor size invariant to zoom? Or scale with zoom?
                // Usually cursor size should remain constant in SCREEN pixels
                // So we need to invert scale for radius
                const screenRadius = 5;
                const worldRadius = screenRadius / camera.current.scale;

                ctx.arc(c.x, c.y, worldRadius, 0, Math.PI * 2);
                ctx.fill();

                if (c.displayName) {
                    ctx.font = `${12 / camera.current.scale}px sans-serif`;
                    ctx.fillStyle = cursorColor;
                    ctx.fillText(c.displayName, c.x + 8 / camera.current.scale, c.y - 8 / camera.current.scale);
                }
            });
            // Draw local cursor if available
            const myCursor = remoteCursorsRef.current['__self'];
            if (myCursor) {
                const cursorColor = myCursor.color || colorForClient(myCursor.clientId);
                ctx.beginPath();
                const screenRadius = 5;
                const worldRadius = screenRadius / camera.current.scale;
                ctx.fillStyle = cursorColor;
                ctx.arc(myCursor.x, myCursor.y, worldRadius, 0, Math.PI * 2);
                ctx.fill();
                if (myCursor.displayName) {
                    ctx.font = `${12 / camera.current.scale}px sans-serif`;
                    ctx.fillStyle = cursorColor;
                    ctx.fillText(myCursor.displayName, myCursor.x + 8 / camera.current.scale, myCursor.y - 8 / camera.current.scale);
                }
            }

            ctx.restore();

            animationFrameId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    // Resize Handling
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (canvas && container) {
                const rect = container.getBoundingClientRect();
                // Set actual canvas size to match display size
                canvas.width = rect.width;
                canvas.height = rect.height;
                // No need to call draw, rAF handles it
            }
        };
        window.addEventListener('resize', handleResize);
        setTimeout(handleResize, 10); // Ensure initial size is correct
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Helper: Screen to World
    const toWorld = (clientX, clientY) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left - camera.current.x) / camera.current.scale,
            y: (clientY - rect.top - camera.current.y) / camera.current.scale
        };
    };

    const worldToScreen = (worldX, worldY) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: worldX, y: worldY };
        const rect = canvas.getBoundingClientRect();
        return {
            x: worldX * camera.current.scale + camera.current.x,
            y: worldY * camera.current.scale + camera.current.y,
            left: rect.left,
            top: rect.top
        };
    };

    const ensureMeasureCtx = () => {
        if (!measureCtxRef.current) {
            const c = document.createElement('canvas');
            measureCtxRef.current = c.getContext('2d');
        }
        return measureCtxRef.current;
    };

    const hitTestText = (worldX, worldY) => {
        const ctx = ensureMeasureCtx();
        for (let i = objectsRef.current.length - 1; i >= 0; i--) {
            const obj = objectsRef.current[i];
            if (obj.type !== 'text') continue;
            const fontSize = obj.fontSize || 18;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textBaseline = 'top';
            const metrics = ctx.measureText(obj.text || '');
            const width = metrics.width;
            const height = fontSize * 1.2;
            const x0 = obj.x;
            const y0 = obj.y;
            if (worldX >= x0 && worldX <= x0 + width && worldY >= y0 && worldY <= y0 + height) {
                return obj;
            }
        }
        return null;
    };

    const createTextObject = async (pos, initialText = 'New text') => {
        try {
            const payload = {
                type: 'text',
                x: pos.x,
                y: pos.y,
                text: initialText,
                fontSize: 18,
                color: '#111827'
            };
            const res = await api.post(`/boards/${boardId}/objects`, payload);
            const obj = {
                id: res.data.id,
                type: 'text',
                ...(res.data.props || payload),
                zIndex: res.data.zIndex ?? 0
            };
            objectsRef.current = [...objectsRef.current, obj];
            objectsVersion.current += 1;
            setObjectsRevision(prev => prev + 1);
            if (socketRef.current?.readyState === 1) {
                socketRef.current.send(JSON.stringify({ type: 'object:create', data: { object: obj } }));
            }
            // open inline editor
            const screen = worldToScreen(obj.x, obj.y);
            setEditingText({
                id: obj.id,
                value: obj.text,
                screenX: screen.x,
                screenY: screen.y
            });
            selectedObjectId.current = obj.id;
        } catch (err) {
            console.error('Failed to create text object', err);
            onError?.('Failed to create text');
        }
    };

    const updateTextObject = async (objId, partial) => {
        const idx = objectsRef.current.findIndex(o => o.id === objId);
        if (idx === -1) return;
        const updated = { ...objectsRef.current[idx], ...partial };
        objectsRef.current = objectsRef.current.map(o => o.id === objId ? updated : o);
        objectsVersion.current += 1;
        setObjectsRevision(prev => prev + 1);
        if (socketRef.current?.readyState === 1) {
            socketRef.current.send(JSON.stringify({ type: 'object:update', data: { object: { id: objId, ...updated } } }));
        }
        try {
            await api.patch(`/boards/${boardId}/objects/${objId}`, { ...partial });
        } catch (err) {
            console.error('Failed to update text object', err);
        }
    };

    const deleteObject = async (objId) => {
        objectsRef.current = objectsRef.current.filter(o => o.id !== objId);
        objectsVersion.current += 1;
        setObjectsRevision(prev => prev + 1);
        if (socketRef.current?.readyState === 1) {
            socketRef.current.send(JSON.stringify({ type: 'object:delete', data: { objectId: objId } }));
        }
        try {
            await api.delete(`/boards/${boardId}/objects/${objId}`);
        } catch (err) {
            console.error('Failed to delete object', err);
        }
    };

    // Input Handling
    const handlePointerDown = (e) => {
        e.target.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        const isMiddle = e.button === 1;
        const isRight = e.button === 2;
        const isSpace = e.getModifierState && e.getModifierState('Space'); // may not work on all pointer events?

        // Mode Detection
        if (pointers.current.size === 2) {
            // Pinch Mode
            isDrawing.current = false;
            isPanning.current = true;
            const points = Array.from(pointers.current.values());
            lastPinchDist.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            return;
        }

        if (isSpace || isMiddle || (pointers.current.size === 1 && !canEdit)) {
            isPanning.current = true;
            return;
        }

        if (isRight) {
            isPanning.current = true;
            return;
        }

        // Drawing Mode
        if (canEdit && pointers.current.size === 1) {
            const worldPos = toWorld(e.clientX, e.clientY);

            if (tool === 'text') {
                createTextObject(worldPos, 'New text');
                return;
            }

            if (tool === 'select') {
                const hit = hitTestText(worldPos.x, worldPos.y);
                if (hit) {
                    selectedObjectId.current = hit.id;
                    draggingObject.current = {
                        id: hit.id,
                        offsetX: worldPos.x - hit.x,
                        offsetY: worldPos.y - hit.y
                    };
                    setObjectsRevision(prev => prev + 1);
                }
                return;
            }

            isDrawing.current = true;
            const strokeColor = tool === 'eraser' ? '#000000' : color; // color ignored for eraser (destination-out)
            const strokeWidth = tool === 'eraser' ? lineWidth * 5 : tool === 'highlighter' ? lineWidth * 2.5 : lineWidth;
            const strokeOpacity = tool === 'highlighter' ? 0.35 : 1;

            currentStroke.current = {
                points: [{ x: worldPos.x, y: worldPos.y }],
                color: strokeColor,
                lineWidth: strokeWidth,
                opacity: strokeOpacity,
                tool
            };

            const displayName = user?.displayName || user?.email || 'Anonymous';
            if (socketRef.current?.readyState === 1) {
                socketRef.current.send(JSON.stringify({
                    type: 'draw:start',
                    data: {
                        clientId: clientId.current,
                        point: worldPos,
                        color: strokeColor,
                        lineWidth: strokeWidth,
                        opacity: strokeOpacity,
                        tool,
                        displayName
                    }
                }));
            }
        }
    };

    const handlePointerMove = (e) => {
        const prev = pointers.current.get(e.pointerId) || { x: e.clientX, y: e.clientY };
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Logic
        if (pointers.current.size === 2) {
            // Pinch logic
            const points = Array.from(pointers.current.values());
            const p1 = points[0];
            const p2 = points[1];
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

            if (lastPinchDist.current) {
                const deltaScale = dist / lastPinchDist.current;
                const oldScale = camera.current.scale;
                let newScale = oldScale * deltaScale;
                newScale = Math.min(Math.max(newScale, 0.1), 10);

                // Scale around screen center of pinch
                // newOffset = center - (center - oldOffset) * (newScale/oldScale)
                // World point at center: Pw = (center - oldOff)/oldScale
                // newOff = center - Pw * newScale
                const worldCenter = {
                    x: (center.x - camera.current.x) / oldScale,
                    y: (center.y - camera.current.y) / oldScale
                };

                camera.current.x = center.x - worldCenter.x * newScale;
                camera.current.y = center.y - worldCenter.y * newScale;
                camera.current.scale = newScale;
            }
            lastPinchDist.current = dist;
            return;
        }

        if (isPanning.current && pointers.current.size === 1) {
            const dx = e.clientX - prev.x;
            const dy = e.clientY - prev.y;
            camera.current.x += dx;
            camera.current.y += dy;
        } else if (draggingObject.current && tool === 'select' && canEdit) {
            const worldPos = toWorld(e.clientX, e.clientY);
            const idx = objectsRef.current.findIndex(o => o.id === draggingObject.current.id);
            if (idx !== -1) {
                const updated = {
                    ...objectsRef.current[idx],
                    x: worldPos.x - draggingObject.current.offsetX,
                    y: worldPos.y - draggingObject.current.offsetY
                };
                objectsRef.current = objectsRef.current.map(o => o.id === updated.id ? updated : o);
                objectsVersion.current += 1;
                setObjectsRevision(prev => prev + 1);
                if (socketRef.current?.readyState === 1) {
                    socketRef.current.send(JSON.stringify({ type: 'object:update', data: { object: { id: updated.id, props: { x: updated.x, y: updated.y } } } }));
                }
            }
        } else if (isDrawing.current && currentStroke.current) {
            const worldPos = toWorld(e.clientX, e.clientY);
            currentStroke.current.points.push(worldPos);

            const displayName = user?.displayName || user?.email || 'Anonymous';
            if (socketRef.current?.readyState === 1) {
                socketRef.current.send(JSON.stringify({
                    type: 'draw:move',
                    data: { clientId: clientId.current, point: worldPos }
                }));
                // Send cursor too
                const payload = { clientId: clientId.current, x: worldPos.x, y: worldPos.y, displayName, color: myCursorColor };
                socketRef.current.send(JSON.stringify({ type: 'cursor:move', data: payload }));
                remoteCursorsRef.current['__self'] = { ...payload };
            }
        } else {
            // Just cursor move
            const worldPos = toWorld(e.clientX, e.clientY);
            const displayName = user?.displayName || user?.email || 'Anonymous';
            if (socketRef.current?.readyState === 1) {
                const payload = { clientId: clientId.current, x: worldPos.x, y: worldPos.y, displayName, color: myCursorColor };
                socketRef.current.send(JSON.stringify({ type: 'cursor:move', data: payload }));
                remoteCursorsRef.current['__self'] = { ...payload };
            }
        }
    };

    const handlePointerUp = (e) => {
        pointers.current.delete(e.pointerId);
        e.target.releasePointerCapture(e.pointerId);

        if (pointers.current.size < 2) {
            lastPinchDist.current = null;
        }

        if (pointers.current.size === 0) {
            if (isDrawing.current && currentStroke.current) {
                historyRef.current = [...historyRef.current, strokesRef.current];
                redoStackRef.current = [];
                strokesRef.current = [...strokesRef.current, currentStroke.current];
                setHistoryTrigger(prev => prev + 1);

                if (socketRef.current?.readyState === 1) {
                    socketRef.current.send(JSON.stringify({
                        type: 'draw:end',
                        data: { clientId: clientId.current, stroke: currentStroke.current }
                    }));
                }
                // keep local cursor visible after drawing ends
                const lastPoint = currentStroke.current.points[currentStroke.current.points.length - 1];
                remoteCursorsRef.current['__self'] = {
                    clientId: clientId.current,
                    x: lastPoint.x,
                    y: lastPoint.y,
                    displayName: user?.displayName || user?.email || 'Anonymous',
                    color: myCursorColor
                };
                currentStroke.current = null;
                isDrawing.current = false;
            }
            if (draggingObject.current) {
                const objId = draggingObject.current.id;
                const obj = objectsRef.current.find(o => o.id === objId);
                if (obj) {
                    updateTextObject(objId, { x: obj.x, y: obj.y });
                }
                draggingObject.current = null;
            }
            isPanning.current = false;
        }
    };

    const handleWheel = (e) => {
        e.preventDefault();

        const rect = canvasRef.current.getBoundingClientRect();
        const pointerX = e.clientX - rect.left;
        const pointerY = e.clientY - rect.top;

        // More natural zoom feeling
        const zoomIntensity = 0.001;
        const delta = -e.deltaY * zoomIntensity;
        const oldScale = camera.current.scale;

        // Exponential zoom: s' = s * (1.1 ^ deltaSteps)
        // Lin-ish: s' = s * (1 + delta)
        const newScale = Math.min(Math.max(oldScale * (1 + delta), 0.1), 10);

        const scaleRatio = newScale / oldScale;

        // Zoom towards mouse pointer
        // ScreenP = WorldP * s + t
        // WorldP = (ScreenP - t) / s
        // match WorldP at ScreenP for new s' and t'
        // (ScreenP - t) / s = (ScreenP - t') / s'
        // t' = ScreenP - (ScreenP - t) * (s' / s)

        camera.current.x = pointerX - (pointerX - camera.current.x) * scaleRatio;
        camera.current.y = pointerY - (pointerY - camera.current.y) * scaleRatio;
        camera.current.scale = newScale;
    };


    const undo = () => {
        if (historyRef.current.length === 0) return;
        redoStackRef.current.push(strokesRef.current);
        const prev = historyRef.current.pop();
        strokesRef.current = prev;
        setHistoryTrigger(prev => prev + 1);

        // TODO: Sync undo? Usually complex. Local undo only for now.
    };

    const redo = () => {
        if (redoStackRef.current.length === 0) return;
        const next = redoStackRef.current.pop();
        historyRef.current.push(strokesRef.current);
        strokesRef.current = next;
        setHistoryTrigger(prev => prev + 1);
    };

    const handleClear = () => {
        if (role === 'viewer') return;
        historyRef.current.push(strokesRef.current);
        strokesRef.current = [];
        redoStackRef.current = [];
        setHistoryTrigger(prev => prev + 1);

        // We might want to send a clear message to socket
    };

    const canEdit = role !== 'viewer';
    const solidColors = ['#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ec4899', '#f97316'];
    const selectedText = useMemo(() => objectsRef.current.find(o => o.id === selectedObjectId.current && o.type === 'text') || null, [objectsRevision]);

    // Keep inline editor anchored to camera while open
    useEffect(() => {
        if (!editingText?.id) return undefined;
        let raf;
        const tick = () => {
            const obj = objectsRef.current.find(o => o.id === editingText.id);
            if (obj) {
                const screen = worldToScreen(obj.x, obj.y);
                setEditingText(prev => prev && prev.id === obj.id ? { ...prev, screenX: screen.x, screenY: screen.y } : prev);
            }
            raf = requestAnimationFrame(tick);
        };
        tick();
        return () => cancelAnimationFrame(raf);
    }, [editingText?.id]);

    const exportPng = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = `board-${boardId || 'export'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const handleDoubleClick = (e) => {
        if (!canEdit) return;
        const worldPos = toWorld(e.clientX, e.clientY);
        const hit = hitTestText(worldPos.x, worldPos.y);
        if (hit) {
            selectedObjectId.current = hit.id;
            setObjectsRevision(prev => prev + 1);
            const screen = worldToScreen(hit.x, hit.y);
            setEditingText({
                id: hit.id,
                value: hit.text || '',
                screenX: screen.x,
                screenY: screen.y
            });
        }
    };

    return (
        <div ref={containerRef} className="relative w-full h-full bg-base-100 overflow-hidden touch-none">
            {/* Floating Toolbar */}
            <div className="absolute left-4 top-4 z-10 flex flex-col gap-3 p-4 bg-base-200/90 backdrop-blur-sm rounded-box shadow-xl select-none">
                {/* Color Palette */}
                <div className="flex gap-1.5 flex-wrap max-w-[140px]">
                    {solidColors.map(c => (
                        <button key={c} onClick={() => { setColor(c); setTool('pen'); }}
                            disabled={!canEdit}
                            className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            style={{ backgroundColor: c, boxShadow: color === c && tool === 'pen' ? '0 0 0 2px white' : 'none' }}
                        />
                    ))}
                </div>

                {/* Line Width */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-base-content/70">Size</span>
                    <input type="range" min="1" max="20" value={lineWidth}
                        disabled={!canEdit}
                        onChange={(e) => setLineWidth(parseInt(e.target.value))}
                        className="range range-xs range-primary w-20" />
                </div>

                {/* Tool Buttons */}
                <div className="btn-group flex flex-col sm:flex-row">
                    <button onClick={() => setTool('pen')} disabled={!canEdit}
                        className={`btn btn-sm ${tool === 'pen' ? 'btn-primary' : 'btn-ghost'}`}>
                        ✏️ Pen
                    </button>
                    <button onClick={() => setTool('highlighter')} disabled={!canEdit}
                        className={`btn btn-sm ${tool === 'highlighter' ? 'btn-primary' : 'btn-ghost'}`}>
                        🖍️ Highlighter
                    </button>
                    <button onClick={() => setTool('eraser')} disabled={!canEdit}
                        className={`btn btn-sm ${tool === 'eraser' ? 'btn-primary' : 'btn-ghost'}`}>
                        🧹 Eraser
                    </button>
                    <button onClick={() => setTool('text')} disabled={!canEdit}
                        className={`btn btn-sm ${tool === 'text' ? 'btn-primary' : 'btn-ghost'}`}>
                        📝 Text
                    </button>
                    <button onClick={() => setTool('select')} disabled={!canEdit}
                        className={`btn btn-sm ${tool === 'select' ? 'btn-primary' : 'btn-ghost'}`}>
                        🖱️ Select
                    </button>
                </div>

                {/* Text settings when a text is selected */}
                {canEdit && selectedText && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-base-content/70">Text size</span>
                            <input
                                type="number"
                                min="8"
                                max="96"
                                value={selectedText.fontSize || 18}
                                onChange={(e) => updateTextObject(selectedText.id, { fontSize: parseInt(e.target.value) || 18 })}
                                className="input input-xs input-bordered w-20"
                            />
                        </div>
                        <div>
                            <span className="text-xs text-base-content/70">Text color</span>
                            <div className="flex gap-1.5 flex-wrap mt-1 max-w-[140px]">
                                {solidColors.map(c => (
                                    <button key={c}
                                        onClick={() => updateTextObject(selectedText.id, { color: c })}
                                        className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${selectedText.color === c ? 'ring-2 ring-primary' : ''}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                    <button onClick={undo} disabled={historyRef.current.length === 0 || !canEdit}
                        className="btn btn-sm btn-ghost flex-1">↩️</button>
                    <button onClick={redo} disabled={redoStackRef.current.length === 0 || !canEdit}
                        className="btn btn-sm btn-ghost flex-1">↪️</button>
                </div>

                <div className="flex gap-2">
                    {canEdit && (
                        <button onClick={handleClear} className="btn btn-sm btn-error flex-1">
                            🗑️ Clear
                        </button>
                    )}
                    <button onClick={exportPng} className="btn btn-sm btn-info flex-1">
                        📤 Export
                    </button>
                </div>

                {/* Status */}
                <div className="divider my-0"></div>
                <div className="text-xs space-y-1">
                    <div className={`flex items-center gap-1 ${connected ? 'text-success' : 'text-error'}`}>
                        <span className="w-2 h-2 rounded-full bg-current"></span>
                        {connected ? 'Connected' : 'Disconnected'}
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`badge badge-xs ${role === 'owner' ? 'badge-success' : role === 'editor' ? 'badge-info' : 'badge-warning'}`}>
                            {role}
                        </span>
                    </div>
                </div>
            </div>

            {/* Canvas - fullscreen */}
            <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onWheel={handleWheel}
                onContextMenu={(e) => e.preventDefault()}
                onDoubleClick={handleDoubleClick}
                style={{ touchAction: 'none' }}
                className="block w-full h-full cursor-crosshair"
            />
            {editingText && (
                <textarea
                    className="absolute z-20 bg-base-100/90 border border-base-300 rounded p-2 text-sm shadow focus:outline-none focus:border-primary"
                    style={{
                        left: editingText.screenX,
                        top: editingText.screenY,
                        minWidth: 160
                    }}
                    autoFocus
                    value={editingText.value}
                    onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
                    onBlur={() => {
                        if (editingText) {
                            updateTextObject(editingText.id, { text: editingText.value });
                        }
                        setEditingText(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            updateTextObject(editingText.id, { text: editingText.value });
                            setEditingText(null);
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingText(null);
                        }
                    }}
                />
            )}
        </div>
    );
};

export default Whiteboard;
