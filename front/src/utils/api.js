import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:3000', // Default to localhost:3000 if not set
    withCredentials: true, // Enable sending cookies with requests
});

api.interceptors.request.use((config) => {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token'); // Assuming we might store token in localStorage too later

    if (userId) {
        config.headers['x-user-id'] = userId;
    }

    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
}, (error) => {
    return Promise.reject(error);
});

api.interceptors.response.use((response) => {
    return response;
}, (error) => {
    if (error.response && error.response.status === 401) {
        console.warn('Unauthorized access - session expired');
        // Dispatch global auth error event
        window.dispatchEvent(new CustomEvent('auth:error', {
            detail: { message: 'Session expired. Please log in again.' }
        }));
    }
    return Promise.reject(error);
});

export default api;
