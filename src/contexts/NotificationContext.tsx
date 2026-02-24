import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { useSettings } from './SettingsContext';

interface Notification {
  id_notification: number;
  id_compte?: number;
  contenu: string;
  type: 'success' | 'error' | 'info';
  link?: string;
  created_at: string;
  read: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (contenu: string, type: 'success' | 'error', link?: string) => void;
  markAsRead: (id: number) => void;
  deleteNotification: (id: number) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode; compteId: number | null }> = ({
  children,
  compteId
}) => {
  console.log('[NotificationContext] 🔔 Provider mounted with compteId:', compteId);
  const { settings, getLocalApiUrl } = useSettings();
  const LOCAL_API_URL = getLocalApiUrl();
  console.log('[NotificationContext] 🌐 Using API URL:', LOCAL_API_URL);
  
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [visibleToasts, setVisibleToasts] = useState<Notification[]>([]);
  const [retry, setRetry] = useState(0);
  const [isServerDown, setIsServerDown] = useState(false);
  const isFetchingRef = useRef(false); // Use ref to prevent dependency loop
  const fetchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastNotifIdRef = useRef<number>(0);

  // ------------------------------------------------------------
  // Load dismissed IDs from localStorage
  // ------------------------------------------------------------
  const getDismissed = (): number[] => {
    return JSON.parse(localStorage.getItem('dismissedNotifications') || '[]');
  };

  const saveDismissed = (id: number) => {
    const dismissed = getDismissed();
    if (!dismissed.includes(id)) dismissed.push(id);
    localStorage.setItem('dismissedNotifications', JSON.stringify(dismissed));
  };

  // ------------------------------------------------------------
  // GET notifications (not hidden) - WITH CLIENT-SIDE THROTTLING
  // ------------------------------------------------------------
  const fetchNotifications = useCallback(async () => {
    if (!compteId) {
      console.log('[NotificationContext] ⚠️ No compteId, skipping fetch');
      return;
    }
    
    // Prevent multiple simultaneous calls
    if (isFetchingRef.current) {
      console.log('[NotificationContext] ⏳ Already fetching, skipping...');
      return;
    }
    
    // If server is known to be down, don't make the call
    if (isServerDown) {
      console.log('[NotificationContext] ⚠️ Server is down, skipping fetch');
      // On va ignorer ce blocage "server is down" après 1 minute automatiquement
      // pour éviter de rester bloqué indéfiniment si le serveur redémarre
    }

    isFetchingRef.current = true;

    try {
      // Use dynamic URL from settings
      const url = `${LOCAL_API_URL}/api/proxy/notifications?id_compte=${compteId}`;
      console.log('[NotificationContext] 📡 Fetching notifications from:', url);
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include'
      });

      if (!res.ok) {
        // Handle 503 (service unavailable) gracefully
        if (res.status === 503) {
          const errorData = await res.json().catch(() => ({}));
          const retryAfter = errorData.retryAfter || 30;
          
          // Mark server as down
          setIsServerDown(true);
          
          // Only log once
          if (retry === 0) {
            console.warn(`Notifications server unavailable, disabling for ${retryAfter}s`);
          }
          
          // Schedule a single retry after the specified time
          if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
          }
          
          fetchTimeoutRef.current = setTimeout(() => {
            setIsServerDown(false);
            setRetry(0);
            fetchNotifications();
          }, retryAfter * 1000);
          
          isFetchingRef.current = false;
          return;
        }
        
        throw new Error(`Status ${res.status}`);
      }

      const data: Notification[] = await res.json();
      const dismissed = getDismissed();
      setNotifications(Array.isArray(data) ? data.filter(n => !dismissed.includes(n.id_notification)) : []);
      
      // Reset states on success
      setIsServerDown(false);
      setRetry(0);
      isFetchingRef.current = false;

    } catch (err) {
      isFetchingRef.current = false;
      
      // Mark server as down to prevent further calls
      setIsServerDown(true);
      
      // Only log once
      if (retry === 0) {
        console.warn('Notifications service unavailable, disabling for 60s');
      }
      
      // Schedule a single retry after 60 seconds
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      fetchTimeoutRef.current = setTimeout(() => {
        setIsServerDown(false);
        setRetry(0);
        fetchNotifications();
      }, 60000);
    }

  }, [compteId, retry, isServerDown, LOCAL_API_URL]); // Removed isFetching from deps to avoid loop

  useEffect(() => {
    if (compteId) {
      // Fetch immediately on mount
      fetchNotifications();
      
      // Then fetch every 30 seconds
      const intervalId = setInterval(() => {
        fetchNotifications();
      }, 30000); // 30 secondes
      
      // Cleanup interval and timeout on unmount
      return () => {
        clearInterval(intervalId);
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
        }
      };
    }
  }, [compteId, fetchNotifications]);

  // ------------------------------------------------------------
  // WebSocket connection for real-time notifications
  // ------------------------------------------------------------
  useEffect(() => {
    if (!compteId) return;

    // Connect to WebSocket server using dynamic URL
    // Use polling first as fallback when Apache doesn't proxy wss:// (upgrade to websocket if available)
    
    // Fallback URL specifically for Senegal to avoid 404/WSS issues if LOCAL_API_URL has a trailing slash or missing route
    const wsUrl = LOCAL_API_URL.replace(/\/$/, '');
    
    // Get id_entite from localStorage for room-based targeting
    let idEntite = '';
    try {
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      idEntite = user.id_entite || '';
    } catch (e) { /* ignore */ }

    const socket = io(wsUrl, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      path: '/socket.io/',
      query: {
        id_compte: compteId || '',
        id_entite: idEntite
      }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[NotificationContext] WebSocket connected');
    });

    socket.on('disconnect', () => {
      console.log('[NotificationContext] WebSocket disconnected');
    });

    // Listen for new notifications
    socket.on('notification:new', (data: { notification: Notification }) => {
      console.log('[NotificationContext] New notification received:', data);
      
      // Security Check: Only process notifications for THIS user
      // The backend broadcasts to everyone (using io.emit), so we MUST filter client-side
      if (compteId && data.notification.id_compte && data.notification.id_compte !== compteId) {
        console.log(`[NotificationContext] Ignoring notification for account ${data.notification.id_compte} (current: ${compteId})`);
        return;
      }

      const dismissed = getDismissed();
      
      if (!dismissed.includes(data.notification.id_notification)) {
        // Add to notifications list
        setNotifications(prev => {
          // Check if already exists
          if (prev.some(n => n.id_notification === data.notification.id_notification)) {
            return prev;
          }
          return [data.notification, ...prev];
        });
        
        // Show toast popup
        setVisibleToasts(prev => [data.notification, ...prev]);
        setTimeout(() => hideToast(data.notification.id_notification), 5000);
      }
    });

    // NOTE: order:status:updated is handled by Order.tsx with proper entity filtering
    // and list updates. We only handle notification:new here to avoid duplicate toasts.

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [compteId, LOCAL_API_URL]);

  // ------------------------------------------------------------
  // POST new notification
  // ------------------------------------------------------------
  async function addNotification(contenu: string, type: 'success' | 'error', link?: string) {
    if (!compteId) return;

    try {
      const url = `${LOCAL_API_URL}/api/proxy/notifications`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contenu, type, id_compte: compteId, link })
      });

      const newNotif: Notification = await res.json();

      // Skip if already dismissed
      const dismissed = getDismissed();
      if (!dismissed.includes(newNotif.id_notification)) {
        setNotifications(prev => [newNotif, ...prev]);
        setVisibleToasts(prev => [newNotif, ...prev]);

        setTimeout(() => hideToast(newNotif.id_notification), 5000);
      }

    } catch (err) {
      console.error('Error adding notification:', err);
    }
  }

  // ------------------------------------------------------------
  // PUT mark as read
  // ------------------------------------------------------------
  async function markAsRead(id: number) {
    if (!compteId) return;

    try {
      const url = `${LOCAL_API_URL}/api/proxy/notifications/${id}/read`;
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id_compte: compteId })
      });

      setNotifications(prev => prev.map(n =>
        n.id_notification === id ? { ...n, read: 1 } : n
      ));

    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }

  // ------------------------------------------------------------
  // DELETE notification (UI-only, permanent hide using localStorage)
  // ------------------------------------------------------------
  const deleteNotification = (id: number) => {
    saveDismissed(id);
    setNotifications(prev => prev.filter(n => n.id_notification !== id));
    setVisibleToasts(prev => prev.filter(n => n.id_notification !== id));
  };

  // ------------------------------------------------------------
  // CLEAR all notifications (UI-only)
  // ------------------------------------------------------------
  const clearNotifications = () => {
    const allIds = notifications.map(n => n.id_notification);
    allIds.forEach(saveDismissed);
    setNotifications([]);
    setVisibleToasts([]);
  };

  // ------------------------------------------------------------
  const hideToast = (id: number) => {
    setVisibleToasts(prev => prev.filter(n => n.id_notification !== id));
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        markAsRead,
        deleteNotification,
        clearNotifications
      }}
    >
      {children}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        <AnimatePresence>
          {visibleToasts.map(t => (
            <motion.div
              key={t.id_notification}
              initial={{ opacity: 0, x: 90 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 90 }}
              transition={{ duration: 0.25 }}
              className={`p-4 rounded-lg shadow-lg text-white ${
                t.type === 'success' ? 'bg-blue-900' : 
                t.type === 'error' ? 'bg-red-600' : 'bg-gray-700'
              }`}
            >
              <div className="flex flex-col gap-1">
                <span>{t.contenu}</span>
                {t.link && (
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(t.link);
                      hideToast(t.id_notification);
                    }}
                    className="text-xs underline hover:text-gray-200 mt-1 font-semibold cursor-pointer bg-transparent border-none"
                  >
                    Voir les détails &rarr;
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be inside provider");
  return ctx;
};
