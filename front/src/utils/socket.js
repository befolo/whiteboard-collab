const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost:3000';

/**
 * Create a WebSocket connection to a board with authentication
 * @param {string} boardId - The board ID to connect to
 * @param {string} userId - The user ID for auth (from localStorage or context)
 * @param {string} displayName - The user's display name for cursor labels
 * @param {object} callbacks - Event callbacks: onOpen, onMessage, onClose, onError
 * @returns {WebSocket} The WebSocket instance
 */
export const connectSocket = (boardId, userId, displayName, callbacks = {}) => {
    const url = new URL(`${WS_BASE}/ws`);
    url.searchParams.set('boardId', boardId);
    if (userId) {
        url.searchParams.set('userId', userId);
    }
    if (displayName) {
        url.searchParams.set('displayName', displayName);
    }

    const ws = new WebSocket(url.toString());

    ws.onopen = () => {
        console.log(`WebSocket connected to board: ${boardId} as ${displayName}`);
        callbacks.onOpen?.();
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            callbacks.onMessage?.(message);
        } catch (err) {
            console.error('WebSocket message parse error:', err);
        }
    };

    ws.onclose = () => {
        console.log(`WebSocket disconnected from board: ${boardId}`);
        callbacks.onClose?.();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        callbacks.onError?.(error);
    };

    return ws;
};

/**
 * Reconnect to a WebSocket with the same parameters
 * @param {WebSocket} oldSocket - The old socket to close
 * @param {string} boardId - The board ID
 * @param {string} userId - The user ID
 * @param {string} displayName - The user's display name
 * @param {object} callbacks - Event callbacks
 * @returns {WebSocket} New WebSocket instance
 */
export const reconnectSocket = (oldSocket, boardId, userId, displayName, callbacks) => {
    if (oldSocket && oldSocket.readyState !== WebSocket.CLOSED) {
        oldSocket.close();
    }
    return connectSocket(boardId, userId, displayName, callbacks);
};
