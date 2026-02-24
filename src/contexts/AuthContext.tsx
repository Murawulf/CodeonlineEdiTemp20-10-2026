// AuthContext.tsx (New file: Create this in src/contexts/AuthContext.tsx or similar)
import React, { createContext, useContext, useState, useEffect } from 'react';

interface Permission {
  page_id: number;
  read: number;
  write: number;
  hide: number;
  page_name?: string;
}

interface Compte {
  id_compte: number;
  email: string;
  name: string;
  profile_id: number;
  permissions: Permission[];
  // Add other fields as needed
  certicode?: string;
  role?: string;
  is_suspended: number;
  created_at: string;
  id_entite: number;
  producer_name: string;
}

interface AuthContextType {
  currentUser: Compte | null;
  setCurrentUser: (user: Compte | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Compte | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (err) {
        console.error('Failed to parse stored user:', err);
        localStorage.removeItem('user');
      }
    }
  }, []);

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('email');
    // Add any other cleanup
  };

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, logout }}>
      {children}
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