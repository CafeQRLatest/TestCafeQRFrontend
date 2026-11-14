import React, { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [modal, setModal] = useState(null); // { title, message, onConfirm, onCancel, type: 'warning' | 'error' | 'info' }

  const notify = useCallback((type, message) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const showConfirm = useCallback(({
    title, message, onConfirm, onCancel,
    type = 'warning', confirmText = 'Proceed', cancelText = 'Cancel', showCancel = true,
  }) => {
    setModal({
      title,
      message,
      // 'confirm' is the generic prompt type; it renders with the warning styling.
      type: type === 'confirm' ? 'warning' : type,
      confirmText,
      cancelText,
      showCancel,
      onConfirm: () => {
        if (onConfirm) onConfirm();
        setModal(null);
      },
      onCancel: () => {
        if (onCancel) onCancel();
        setModal(null);
      }
    });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  return (
    <NotificationContext.Provider value={{ notify, showConfirm, notifications, modal, closeModal }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
