import { createContext, useContext, useEffect, useState } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [userId, setUserId] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let storedUserId = localStorage.getItem('userId');
        if (!storedUserId) {
            storedUserId = crypto.randomUUID();
            localStorage.setItem('userId', storedUserId);
        }
        setUserId(storedUserId);

        const initAuth = async () => {
            try {
                await refreshMe();
            } catch (error) {
                // Not logged in or session expired, that's fine
                console.log("No active session");
            }
            setLoading(false);
        };

        initAuth();
    }, []);

    const login = async (email, password) => {
        try {
            const response = await api.post('/auth/login', { email, password });
            // Backend returns { user: {...} } and sets httpOnly cookie
            setUser(response.data.user);
            return { success: true };
        } catch (error) {
            console.error("Login failed:", error);
            return { success: false, error: error.response?.data?.error || 'Login failed' };
        }
    };

    const signup = async (email, password, displayName) => {
        try {
            await api.post('/auth/signup', { email, password, displayName });
            // Backend returns { id: userId }, now auto-login
            return await login(email, password);
        } catch (error) {
            console.error("Signup failed:", error);
            return { success: false, error: error.response?.data?.error || 'Signup failed' };
        }
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (error) {
            console.error("Logout failed:", error);
        }
        setUser(null);
    };

    const refreshMe = async () => {
        const response = await api.get('/auth/me');
        setUser(response.data.user);
    };

    const value = {
        userId,
        user,
        loading,
        login,
        signup,
        logout,
        refreshMe
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
