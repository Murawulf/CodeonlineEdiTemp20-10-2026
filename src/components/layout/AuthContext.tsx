import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import axios from "axios";

interface User {
  id_compte: number;
  email: string;
  name: string | null;
  id_entite: number;
  producer_name: string;
  profile_id: number | null;
}

interface Permission {
  page_id: number;
  page_name: string;
  read: number;
  write: number;
  hide: number;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  permissions: Permission[];
  login: (email: string, password: string, certicode?: string) => Promise<{ status: string; user?: User; permissions?: Permission[] }>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // Optionally, validate the token with a new endpoint if needed
          // For now, assume token presence means authenticated
          // You may need to add a /api/validate-token endpoint
          setIsAuthenticated(true);
        } catch (err) {
          localStorage.removeItem('token');
          setIsAuthenticated(false);
        }
      }
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (email: string, password: string, certicode?: string) => {
    try {
      const response = await axios.post('https://edi-dev.codeonline-info.com/api/login', {
        email,
        password,
        certicode,
      }, { withCredentials: true });

      if (response.data.status === 'certicode_sent') {
        return { status: 'certicode_sent' };
      }

      const { user, permissions } = response.data;
      setUser(user);
      setPermissions(permissions || []);
      setIsAuthenticated(true);
      localStorage.setItem('token', 'authenticated'); // Store a token or session identifier
      return { status: 'success', user, permissions };
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.response?.data?.error || 'Failed to login');
    }
  };

  const logout = () => {
    setUser(null);
    setPermissions([]);
    setIsAuthenticated(false);
    localStorage.removeItem('token');
    axios.post('https://edi-dev.codeonline-info.com/api/logout', {}, { withCredentials: true })
      .catch((err) => console.error('Logout error:', err));
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, permissions, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};