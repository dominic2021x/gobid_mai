// Utility pentru tracking-ul paginilor accesate și utilizatorilor online

export interface PageAccess {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  page: string;
  path: string;
  timestamp: string;
  timeAgo: string;
  sessionId: string;
}

export interface OnlineUser {
  userId: string;
  userName: string;
  userEmail: string;
  currentPage: string;
  currentPath: string;
  lastSeen: string;
  sessionId: string;
}

// Obține sau creează session ID
export const getSessionId = (): string => {
  if (typeof window === 'undefined') return '';
  
  let sessionId = sessionStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
};

// Obține informațiile utilizatorului curent
export const getCurrentUser = (): { id: string; name: string; email: string } => {
  if (typeof window === 'undefined') {
    return { id: 'guest', name: 'Guest', email: 'guest@example.com' };
  }

  const userInfo = localStorage.getItem('userInfo');
  if (userInfo) {
    try {
      const user = JSON.parse(userInfo);
      return {
        id: user.email || `user-${Date.now()}`,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Utilizator',
        email: user.email || 'unknown@example.com'
      };
    } catch (e) {
      console.error('Error parsing user info:', e);
    }
  }

  return {
    id: 'guest',
    name: 'Utilizator Anonim',
    email: 'guest@example.com'
  };
};

// Salvează accesarea unei pagini
export const trackPageAccess = (page: string, path: string): void => {
  if (typeof window === 'undefined') return;

  const sessionId = getSessionId();
  const user = getCurrentUser();
  
  const access: PageAccess = {
    id: `access-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    page,
    path,
    timestamp: new Date().toISOString(),
    timeAgo: 'acum',
    sessionId
  };

  // Salvează în istoricul de accesări
  const history = getPageAccessHistory();
  const updatedHistory = [access, ...history].slice(0, 100); // Păstrează ultimele 100
  localStorage.setItem('pageAccessHistory', JSON.stringify(updatedHistory));

  // Actualizează utilizatorii online
  updateOnlineUsers(user.id, user.name, user.email, page, path, sessionId);
};

// Obține istoricul accesărilor
export const getPageAccessHistory = (limit: number = 20): PageAccess[] => {
  if (typeof window === 'undefined') return [];

  const history = localStorage.getItem('pageAccessHistory');
  if (!history) return [];

  try {
    const accesses: PageAccess[] = JSON.parse(history);
    // Calculează timeAgo pentru fiecare accesare
    return accesses.slice(0, limit).map(access => ({
      ...access,
      timeAgo: getTimeAgo(access.timestamp)
    }));
  } catch (e) {
    console.error('Error parsing page access history:', e);
    return [];
  }
};

// Actualizează utilizatorii online
export const updateOnlineUsers = (
  userId: string,
  userName: string,
  userEmail: string,
  page: string,
  path: string,
  sessionId: string
): void => {
  if (typeof window === 'undefined') return;

  const onlineUsers = getOnlineUsers();
  
  // Elimină utilizatorii care nu au fost activi în ultimele 5 minute
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const activeUsers = onlineUsers.filter(
    user => user.lastSeen > fiveMinutesAgo
  );

  // Actualizează sau adaugă utilizatorul curent
  const existingUserIndex = activeUsers.findIndex(
    user => user.userId === userId && user.sessionId === sessionId
  );

  const onlineUser: OnlineUser = {
    userId,
    userName,
    userEmail,
    currentPage: page,
    currentPath: path,
    lastSeen: new Date().toISOString(),
    sessionId
  };

  if (existingUserIndex >= 0) {
    activeUsers[existingUserIndex] = onlineUser;
  } else {
    activeUsers.push(onlineUser);
  }

  localStorage.setItem('onlineUsers', JSON.stringify(activeUsers));
};

// Obține utilizatorii online
export const getOnlineUsers = (): OnlineUser[] => {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem('onlineUsers');
  if (!stored) return [];

  try {
    const users: OnlineUser[] = JSON.parse(stored);
    // Elimină utilizatorii inactivi (mai mult de 5 minute)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    return users.filter(user => user.lastSeen > fiveMinutesAgo);
  } catch (e) {
    console.error('Error parsing online users:', e);
    return [];
  }
};

// Calculează "time ago"
const getTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 10) return 'acum';
  if (diffSecs < 60) return `acum ${diffSecs}s`;
  if (diffMins < 60) return `acum ${diffMins}m`;
  if (diffHours < 24) return `acum ${diffHours}h`;
  return then.toLocaleDateString('ro-RO');
};

// Formatează numele paginii pentru afișare (titluri exacte pentru admin / activitate)
export const formatPageName = (path: string): string => {
  if (path === '/') return 'Acasă';
  if (path.startsWith('/admin')) return 'Admin Panel';
  if (path === '/dashboard' || path === '/dashboard/') return 'Dashboard';
  if (path.startsWith('/dashboard/executor')) return 'Dashboard Executor';
  if (path.startsWith('/dashboard/ofertele_mele')) return 'Ofertele mele';
  if (path.startsWith('/dashboard/my-products')) return 'Produsele mele';
  if (path.startsWith('/dashboard/assistant')) return 'Asistent';
  if (path.startsWith('/dashboard/tokens')) return 'Tokeni';
  if (path.startsWith('/dashboard/settings')) return 'Setări';
  if (path.startsWith('/dashboard')) return 'Dashboard';
  if (path.startsWith('/auctions')) return 'Licitații publice';
  if (path.includes('executari')) return 'Executări';
  if (path.startsWith('/licitatii-publice')) return 'Licitații publice';
  if (path.startsWith('/live_bid')) return 'Licitație live';
  if (path.startsWith('/auth')) return 'Autentificare';
  if (path.startsWith('/search')) return 'Căutare';
  if (path.startsWith('/ro')) return 'Pagina produs';
  return path.replace(/^\//, '').replace(/-/g, ' ').replace(/\//g, ' > ');
};

















