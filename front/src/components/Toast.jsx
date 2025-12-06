import { useState, useEffect, useCallback } from 'react';

const Toast = ({ message, type = 'error', onDismiss, duration = 5000 }) => {
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => onDismiss?.(), duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onDismiss]);

    const alertClass = {
        error: 'alert-error',
        warning: 'alert-warning',
        success: 'alert-success',
        info: 'alert-info'
    }[type] || 'alert-error';

    return (
        <div className={`alert ${alertClass} shadow-lg`}>
            <span>{message}</span>
            <button onClick={onDismiss} className="btn btn-sm btn-ghost">✕</button>
        </div>
    );
};

// Toast container to manage multiple toasts
export const ToastContainer = ({ toasts, removeToast }) => {
    return (
        <div className="toast toast-top toast-end z-[10000]">
            {toasts.map((toast) => (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    type={toast.type}
                    onDismiss={() => removeToast(toast.id)}
                />
            ))}
        </div>
    );
};

// Hook to manage toasts
export const useToasts = () => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'error') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return { toasts, addToast, removeToast };
};

export default Toast;
