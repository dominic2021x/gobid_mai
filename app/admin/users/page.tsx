"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";
import { refreshSessionSingleFlight } from "@/lib/auth/getSupabaseSessionRobust";
import { AdminUser, PaymentRecord } from "./types";

interface Recommendation {
  type: string;
  title: string;
  description: string;
  priority: "high" | "medium";
}

export default function UsersPage() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showCreditTokensModal, setShowCreditTokensModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [creditAmount, setCreditAmount] = useState(0);
  const [tokensAmount, setTokensAmount] = useState(0);
  const [creditOperation, setCreditOperation] = useState<"add" | "subtract">("add");
  const [tokensOperation, setTokensOperation] = useState<"add" | "subtract">("add");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAccountType, setFilterAccountType] = useState("all");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTokens, setIsSavingTokens] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userStats, setUserStats] = useState({
    total: 0,
    totalLive: 0,
    private: 0,
    privateLive: 0,
    business: 0,
    businessLive: 0,
    executor: 0,
    executorLive: 0
  });
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const isLoadingRef = useRef(false);
  
  // Notification modal
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'success' | 'error'>('success');

  // Helper function to get a valid access token (with refresh if needed)
  const getValidAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      let { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData?.session) {
        const s = await refreshSessionSingleFlight(supabase);
        if (!s?.access_token) {
          console.error("[Admin] Failed to get valid session after refresh");
          return null;
        }
        sessionData = { session: s };
      }

      const token = sessionData?.session?.access_token ?? null;
      if (token) {
        setAccessToken(token);
      }
      return token;
    } catch (error) {
      console.error("[Admin] Error getting valid access token:", error);
      return null;
    }
  }, []);
  
  // Payment details modal
  const [showPaymentDetailsModal, setShowPaymentDetailsModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);

  const loadUserStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [profilesRes, activityRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('account_type, is_admin, user_id'),
        supabase
          .from('user_activity_logs')
          .select('user_id, created_at')
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last 1 hour
      ]);

      if (profilesRes.error) {
        console.error('Error loading user stats:', profilesRes.error);
        return;
      }

      const profiles = profilesRes.data || [];
      // Filter out admins
      const nonAdminProfiles = profiles.filter((p: any) => !p.is_admin);
      
      // Get unique active user IDs from last hour
      const activeUserIds = new Set(
        (activityRes.data || []).map((a: any) => a.user_id)
      );

      // Calculate stats for each account type
      const privateProfiles = nonAdminProfiles.filter((p: any) => p.account_type === 'private');
      const businessProfiles = nonAdminProfiles.filter((p: any) => p.account_type === 'business');
      const executorProfiles = nonAdminProfiles.filter((p: any) => p.account_type === 'executor');

      setUserStats({
        total: nonAdminProfiles.length,
        totalLive: nonAdminProfiles.filter((p: any) => activeUserIds.has(p.user_id)).length,
        private: privateProfiles.length,
        privateLive: privateProfiles.filter((p: any) => activeUserIds.has(p.user_id)).length,
        business: businessProfiles.length,
        businessLive: businessProfiles.filter((p: any) => activeUserIds.has(p.user_id)).length,
        executor: executorProfiles.length,
        executorLive: executorProfiles.filter((p: any) => activeUserIds.has(p.user_id)).length
      });
    } catch (error) {
      console.error('Error loading user stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadUserStats();
  }, [loadUserStats]);

  // Auto-close success notifications after 3 seconds
  useEffect(() => {
    if (showNotificationModal && notificationType === 'success') {
      const timer = setTimeout(() => {
        setShowNotificationModal(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showNotificationModal, notificationType]);

  const loadUsers = useCallback(async () => {
    // Prevent multiple simultaneous loads
    if (isLoadingRef.current) {
      return;
    }
    
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Get valid access token (with automatic refresh if needed)
      const token = await getValidAccessToken();
      
      if (!token) {
        setError("Sesiunea a expirat. Te rugăm să te reconectezi.");
        setUsers([]);
        setAccessToken(null);
        return;
      }

      const response = await fetch("/api/admin/users", {
        headers: {
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        
        // If token is invalid, try to refresh session once more
        if (response.status === 401 && payload?.error === 'Invalid access token') {
          console.log("[Admin] Token invalid, attempting to refresh session...");
          const refreshedToken = await getValidAccessToken();
          
          if (refreshedToken) {
            // Retry with new token
            const retryResponse = await fetch("/api/admin/users", {
              headers: {
              },
            });
            
            if (retryResponse.ok) {
              const retryPayload = await retryResponse.json();
              const fetchedUsers: AdminUser[] = (retryPayload?.users ?? []).map((user: AdminUser) => ({
                ...user,
                isAdmin: Boolean(user.isAdmin),
                role: user.role ?? 'user',
              }));
              const regularUsers = fetchedUsers.filter((user) => !user.isAdmin);
              setUsers(regularUsers);
              isLoadingRef.current = false;
              setIsLoading(false);
              return;
            }
          }
        }
        
        throw new Error(payload?.error || "Nu am putut încărca utilizatorii din Supabase.");
      }

      const payload = await response.json();
      const fetchedUsers: AdminUser[] = (payload?.users ?? []).map((user: AdminUser) => ({
        ...user,
        isAdmin: Boolean(user.isAdmin),
        role: user.role ?? 'user',
      }));
      const regularUsers = fetchedUsers.filter((user) => !user.isAdmin);
      setUsers(regularUsers);
    } catch (err: any) {
      console.error("Eroare la încărcarea utilizatorilor:", err);
      setError(err?.message || "A apărut o eroare neașteptată la încărcarea utilizatorilor.");
      setUsers([]);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [getValidAccessToken]); // Include getValidAccessToken dependency

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Update selectedUser when users list changes (if selectedUser exists)
  useEffect(() => {
    if (selectedUser && users.length > 0) {
      const updatedUser = users.find((user) => user.id === selectedUser.id);
      if (updatedUser) {
        setSelectedUser(updatedUser);
        generateRecommendations(updatedUser);
      }
    }
  }, [users]); // Only depend on users, not selectedUser to avoid infinite loop

  const openedUserIdFromUrl = useRef<string | null>(null);
  // Deschide profilul utilizatorului când URL are ?userId=...
  useEffect(() => {
    const userId = searchParams.get("userId");
    if (!userId || users.length === 0) return;
    if (openedUserIdFromUrl.current === userId) return;
    const user = users.find((u) => u.id === userId);
    if (user) {
      openedUserIdFromUrl.current = userId;
      setSelectedUser(user);
      setShowUserModal(true);
      generateRecommendations(user);
      window.history.replaceState({}, "", "/admin/users");
    }
  }, [searchParams, users]);

  const handleViewUser = (user: AdminUser) => {
    setSelectedUser(user);
    setShowUserModal(true);
    generateRecommendations(user);
  };

  const generateRecommendations = (user: AdminUser) => {
    const recommendationsList: Recommendation[] = [];
    
    const unlockedCount = user.unlockedProducts.length;
    const accessedCount = user.activity.filter(
      (activity) =>
        activity.event === 'auction_view' ||
        activity.event === 'auction_access' ||
        activity.event === 'auction_opened'
    ).length;

    if (unlockedCount > 0 || accessedCount > 0) {
      recommendationsList.push({
        type: 'similar_auctions',
        title: 'Anunțuri Similar',
        description: `Bazat pe ${unlockedCount} anunțuri deblocate și ${accessedCount} accesate`,
        priority: 'high'
      });
    }

    const favoriteCount = user.favoriteAuctions.length;
    if (favoriteCount > 0) {
      recommendationsList.push({
        type: 'favorites_category',
        title: 'Din Categoriile Preferate',
        description: `${favoriteCount} anunțuri marcate ca favorite`,
        priority: 'high'
      });
    }

    const highValuePayments = user.payments.filter((p) => p.amount > 1000).length;
    if (highValuePayments > 0) {
      recommendationsList.push({
        type: 'premium_auctions',
        title: 'Anunțuri Premium',
        description: `${highValuePayments} plăți peste 1000 Lei - sugerează produse premium`,
        priority: 'medium'
      });
    }

    const tokenSpending = user.tokens.totalSpent;
    if (tokenSpending > 10) {
      recommendationsList.push({
        type: 'token_user',
        title: 'Utilizator Activ cu Tokeni',
        description: `${tokenSpending} tokeni cheltuiți - sugerează anunțuri exclusive`,
        priority: 'medium'
      });
    }

    const recentActivity = user.activity.filter((a) => {
      const activityDate = new Date(a.createdAt);
      const daysDiff = (Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7;
    }).length;

    if (recentActivity > 5) {
      recommendationsList.push({
        type: 'active_user',
        title: 'Utilizator Foarte Activ',
        description: `${recentActivity} activități în ultimele 7 zile - sugerează anunțuri noi`,
        priority: 'high'
      });
    }

    const wonAuctions = user.auctionHistory.filter(
      (h) => h.status === 'won' || h.status === 'câștigat'
    ).length;
    if (wonAuctions > 0) {
      recommendationsList.push({
        type: 'winner_pattern',
        title: 'Model de Câștigător',
        description: `${wonAuctions} licitații câștigate - sugerează anunțuri similare`,
        priority: 'high'
      });
    }

    setRecommendations(recommendationsList);
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotificationModal(true);
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) return;
    
    setIsResettingPassword(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        showNotification("Sesiunea a expirat. Te rugăm să te reconectezi și să încerci din nou.", 'error');
        return;
      }

      const response = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          newPassword,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Nu am putut reseta parola utilizatorului.');
      }

      showNotification(`Parola pentru ${selectedUser.email} a fost resetată cu succes!`, 'success');
      setShowResetPasswordModal(false);
      setNewPassword('');
    } catch (err: any) {
      console.error('Eroare resetare parolă:', err);
      showNotification(err?.message || 'Nu am putut reseta parola. Încearcă din nou.', 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleCreditTokensUpdate = async () => {
    if (!selectedUser) return;

    if (creditAmount === 0 && tokensAmount === 0) {
      showNotification('Introdu o valoare de credit sau tokeni pentru a salva.', 'error');
      return;
    }

    setIsSavingTokens(true);

    try {
      const token = await getValidAccessToken();
      if (!token) {
        showNotification("Sesiunea a expirat. Te rugăm să te reconectezi și să încerci din nou.", 'error');
        return;
      }

      const response = await fetch('/api/admin/users/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          tokensAmount,
          tokensOperation,
          creditAmount,
          creditOperation,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Nu am putut actualiza tokenii / creditul utilizatorului.');
      }

      await loadUsers();

      const updatedUser = users.find((user) => user.id === selectedUser.id);
      if (updatedUser) {
        setSelectedUser(updatedUser);
      }

      showNotification(`Credit și tokeni actualizați cu succes pentru ${selectedUser.email}!`, 'success');
      setShowCreditTokensModal(false);
      setCreditAmount(0);
      setTokensAmount(0);
      setCreditOperation('add');
      setTokensOperation('add');
    } catch (err: any) {
      console.error('Eroare la actualizarea creditului/tokenilor:', err);
      showNotification(err?.message || 'Nu am putut actualiza creditul/tokenii. Încearcă din nou.', 'error');
    } finally {
      setIsSavingTokens(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    const expected = selectedUser.email.trim().toLowerCase();
    if (deleteConfirmEmail.trim().toLowerCase() !== expected) {
      showNotification("Introdu exact adresa de email a utilizatorului pentru confirmare.", "error");
      return;
    }

    setIsDeletingUser(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        showNotification("Sesiunea a expirat. Te rugăm să te reconectezi și să încerci din nou.", "error");
        return;
      }

      const response = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: selectedUser.id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Nu am putut șterge utilizatorul.");
      }

      const deletedEmail = selectedUser.email;
      setShowDeleteUserModal(false);
      setDeleteConfirmEmail("");
      setShowUserModal(false);
      setSelectedUser(null);
      await loadUsers();
      await loadUserStats();
      showNotification(`Utilizatorul ${deletedEmail} a fost șters definitiv.`, "success");
    } catch (err: any) {
      console.error("Eroare la ștergerea utilizatorului:", err);
      showNotification(err?.message || "Nu am putut șterge utilizatorul. Încearcă din nou.", "error");
    } finally {
      setIsDeletingUser(false);
    }
  };

  const getFilteredUsers = () => {
    let filtered = users;

    // Filter by search term
    if (searchTerm) {
      const q = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((user) => {
        const uname = (user.username ?? "").toLowerCase();
        return (
          user.email.toLowerCase().includes(q) ||
          user.firstName.toLowerCase().includes(q) ||
          user.lastName.toLowerCase().includes(q) ||
          user.id.toLowerCase().includes(q) ||
          (uname && uname.includes(q)) ||
          (user.companyName && user.companyName.toLowerCase().includes(q))
        );
      });
    }

    // Filter by status
    if (filterStatus === 'active') {
      const recentActivity = filtered.filter(user => {
        const recent = user.activity.filter((a) => {
          const activityDate = new Date(a.createdAt);
          const daysDiff = (Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysDiff <= 30;
        });
        return recent.length > 0;
      });
      filtered = recentActivity;
    }

    if (filterStatus === 'premium') {
      filtered = filtered.filter(user => 
        user.tokens.level !== 'Basic' || user.tokens.balance > 100
      );
    }

    // Filter by account type
    if (filterAccountType === 'business') {
      filtered = filtered.filter(user => user.accountType === 'business');
    } else if (filterAccountType === 'private') {
      filtered = filtered.filter(user => user.accountType === 'private');
    } else if (filterAccountType === 'executor') {
      filtered = filtered.filter(user => user.accountType === 'executor');
    }

    return filtered;
  };

  const getUserStatus = (user: AdminUser) => {
    if (user.isAdmin) {
      return { text: `Administrator (${(user.role || 'admin').toUpperCase()})`, color: 'bg-blue-500 text-white' };
    }
    if (user.accountType === 'executor') {
      if (user.companyVerified) {
        return { text: 'Cont Executor', color: 'bg-blue-500 text-white' };
      } else {
        return { text: 'Executor - Ne verificat', color: 'bg-blue-400 text-white' };
      }
    }
    if (user.accountType === 'business' && user.companyVerified) {
      return { text: 'Cont Business', color: 'bg-blue-500 text-white' };
    } else if (user.accountType === 'business' && !user.companyVerified) {
      return { text: 'Business - Ne verificat', color: 'bg-yellow-500 text-white' };
    }
    return { text: 'PRIVAT', color: 'bg-gray-500 text-white' };
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('ro-RO');
    } catch {
      return dateString;
    }
  };

  const getTotalCredit = (payments: any[]) => {
    return payments.reduce((total, payment) => total + (payment.amount || 0), 0);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 lg:p-8">
      {error ? (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-4 bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent">
          Administrare Utilizatori
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Gestionează utilizatorii, resetează parole și analizează comportamentul
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <button
          onClick={() => { setFilterStatus('all'); setFilterAccountType('all'); }}
          className={`bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-2 transition-all cursor-pointer hover:scale-105 ${
            filterStatus === 'all' && filterAccountType === 'all' 
              ? 'border-blue-500 ring-2 ring-blue-200' 
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-blue-600 rounded flex items-center justify-center flex-shrink-0">
              <i className="ri-user-line text-sm text-white"></i>
            </div>
            <p className="text-blue-600 text-xs font-medium">TOTAL UTILIZATORI</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-600">
              LIVE: <span className="text-2xl font-bold text-green-600">{userStats.totalLive}</span>
            </p>
            <p className="text-sm text-gray-600">
              TOTAL: <span className="text-base font-bold text-gray-900">{userStats.total}</span>
            </p>
          </div>
        </button>

        <button
          onClick={() => setFilterAccountType('business')}
          className={`bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-2 transition-all cursor-pointer hover:scale-105 ${
            filterAccountType === 'business' 
              ? 'border-yellow-500 ring-2 ring-yellow-200' 
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded flex items-center justify-center flex-shrink-0">
              <i className="ri-building-line text-sm text-white"></i>
            </div>
            <p className="text-yellow-600 text-xs font-medium">CONTURI BUSINESS</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-600">
              LIVE: <span className="text-2xl font-bold text-green-600">{userStats.businessLive}</span>
            </p>
            <p className="text-sm text-gray-600">
              TOTAL: <span className="text-base font-bold text-gray-900">{userStats.business}</span>
            </p>
          </div>
        </button>

        <button
          onClick={() => setFilterAccountType('executor')}
          className={`bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-2 transition-all cursor-pointer hover:scale-105 ${
            filterAccountType === 'executor' 
              ? 'border-blue-500 ring-2 ring-blue-200' 
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-blue-600 rounded flex items-center justify-center flex-shrink-0">
              <i className="ri-gavel-line text-sm text-white"></i>
            </div>
            <p className="text-blue-600 text-xs font-medium">CONTURI EXECUTORI</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-600">
              LIVE: <span className="text-2xl font-bold text-green-600">{userStats.executorLive}</span>
            </p>
            <p className="text-sm text-gray-600">
              TOTAL: <span className="text-base font-bold text-gray-900">{userStats.executor}</span>
            </p>
          </div>
        </button>

        <button
          onClick={() => setFilterAccountType('private')}
          className={`bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-2 transition-all cursor-pointer hover:scale-105 ${
            filterAccountType === 'private' 
              ? 'border-gray-500 ring-2 ring-gray-200' 
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 bg-gradient-to-r from-gray-500 to-gray-600 rounded flex items-center justify-center flex-shrink-0">
              <i className="ri-user-line text-sm text-white"></i>
            </div>
            <p className="text-gray-600 text-xs font-medium">CONTURI PRIVATE</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-600">
              LIVE: <span className="text-2xl font-bold text-green-600">{userStats.privateLive}</span>
            </p>
            <p className="text-sm text-gray-600">
              TOTAL: <span className="text-base font-bold text-gray-900">{userStats.private}</span>
            </p>
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg border border-gray-200 mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Caută după nume, username, UUID sau email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setFilterStatus('all'); setFilterAccountType('all'); }}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterStatus === 'all' && filterAccountType === 'all'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Toți
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterStatus === 'active'
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Activi
            </button>
            <button
              onClick={() => setFilterStatus('premium')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterStatus === 'premium'
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Premium
            </button>
            <button
              onClick={() => setFilterAccountType('business')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterAccountType === 'business'
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Business
            </button>
            <button
              onClick={() => setFilterAccountType('private')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterAccountType === 'private'
                  ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              PRIVAT
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700">Utilizator</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden md:table-cell">Username</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden lg:table-cell">UUID</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden md:table-cell">Email</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden lg:table-cell">Status</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden lg:table-cell">LIVE</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden xl:table-cell">Ultima Activitate</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden xl:table-cell">Locație</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden lg:table-cell">Tokeni</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 hidden xl:table-cell">Credit</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-2 py-4 text-center text-xs text-gray-600">
                    Se încarcă utilizatorii din Supabase...
                  </td>
                </tr>
              ) : getFilteredUsers().map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={`${user.firstName} ${user.lastName}`}
                          className="w-6 h-6 rounded-full object-cover border border-gray-200"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs ${user.avatar ? 'hidden' : ''}`}
                      >
                        {user.firstName.charAt(0).toUpperCase()}{user.lastName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </p>
                        {user.username ? (
                          <p className="text-[10px] text-blue-600 font-medium truncate" title={`@${user.username}`}>
                            @{user.username}
                          </p>
                        ) : null}
                        <p
                          className="text-[10px] text-gray-400 font-mono truncate max-w-[160px] md:hidden"
                          title={user.id}
                        >
                          {user.id}
                        </p>
                        <p className="text-xs text-gray-500 md:hidden">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden md:table-cell">
                    {user.username ? (
                      <span className="text-blue-700 font-medium">@{user.username}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden lg:table-cell">
                    <span className="font-mono text-[10px] text-gray-600 break-all" title={user.id}>
                      {user.id}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden md:table-cell">{user.email}</td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden lg:table-cell">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getUserStatus(user).color}`}>
                      {getUserStatus(user).text}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden lg:table-cell">
                    {user.isLive ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                        LIVE
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Offline</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden xl:table-cell">
                    {user.lastActivityDate ? (
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-900">
                          {new Date(user.lastActivityDate).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(user.lastActivityDate).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Niciodată</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden xl:table-cell">
                    {user.ipAddress ? (
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-900 font-mono">IP: {user.ipAddress}</span>
                        {(user.city || user.country) ? (
                          <span className="text-xs text-gray-500">
                            {[user.city, user.country].filter(Boolean).join(', ') || '-'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Locație necunoscută</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1">
                      <i className="ri-coins-line text-yellow-500 text-xs"></i>
                      {user.tokens.balance}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-gray-700 hidden xl:table-cell">
                    {getTotalCredit(user.payments).toLocaleString('ro-RO')} Lei
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => handleViewUser(user)}
                      className="px-2 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded hover:from-blue-600 hover:to-blue-700 transition-all text-xs"
                    >
                      Vezi Detalii
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowUserModal(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedUser.avatar ? (
                    <img
                      src={selectedUser.avatar}
                      alt={`${selectedUser.firstName} ${selectedUser.lastName}`}
                      className="w-10 h-10 rounded-full object-cover border border-gray-200"
                      onError={(e) => {
                        // Fallback to initials if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div 
                    className={`w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm ${selectedUser.avatar ? 'hidden' : ''}`}
                  >
                    {selectedUser.firstName.charAt(0).toUpperCase()}{selectedUser.lastName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h2 className="text-base font-bold text-gray-900">
                        {selectedUser.firstName} {selectedUser.lastName}
                      </h2>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getUserStatus(selectedUser).color}`}>
                        {getUserStatus(selectedUser).text}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{selectedUser.email}</p>
                    {selectedUser.username ? (
                      <p className="text-xs text-blue-600 font-medium mt-0.5">@{selectedUser.username}</p>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                >
                  <i className="ri-close-line text-base text-gray-700"></i>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Personal Information */}
              <div className="bg-gray-50 rounded p-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                  <i className="ri-user-line text-blue-600 text-sm"></i>
                  Informații Personale
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-600 mb-0.5">Username</p>
                    <p className="text-xs text-gray-900">
                      {selectedUser.username ? (
                        <span className="text-blue-700 font-medium">@{selectedUser.username}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-600 mb-0.5">UUID utilizator</p>
                    <p className="text-xs text-gray-900 font-mono break-all select-all">{selectedUser.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Nume</p>
                    <p className="text-xs text-gray-900">{selectedUser.firstName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Prenume</p>
                    <p className="text-xs text-gray-900">{selectedUser.lastName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Email</p>
                    <p className="text-xs text-gray-900">{selectedUser.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Telefon</p>
                    <p className="text-xs text-gray-900">{selectedUser.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Data Nașterii</p>
                    <p className="text-xs text-gray-900">{formatDate(selectedUser.dateOfBirth || '')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Adresă</p>
                    <p className="text-xs text-gray-900">{selectedUser.address || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Company Information */}
              {selectedUser.accountType === 'business' && (
                <div className="bg-gray-50 rounded p-3">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                    <i className="ri-building-line text-blue-600 text-sm"></i>
                    Informații Firmă
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600 mb-0.5">Denumire Firmă</p>
                      <p className="text-xs text-gray-900">{selectedUser.companyName || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-0.5">CUI</p>
                      <p className="text-xs text-gray-900">{selectedUser.companyCui || 'N/A'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-gray-600 mb-0.5">Adresă Firmă</p>
                      <p className="text-xs text-gray-900">{selectedUser.companyAddress || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-0.5">Status Verificare</p>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        selectedUser.companyVerified 
                          ? 'bg-green-500 text-gray-900' 
                          : 'bg-yellow-500 text-gray-900'
                      }`}>
                        {selectedUser.companyVerified ? 'Verificat' : 'Ne verificat'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tokens & Credit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      <i className="ri-coins-line text-yellow-600 text-sm"></i>
                      Tokeni
                    </h3>
                    <button
                      onClick={() => {
                        setShowCreditTokensModal(true);
                        setTokensAmount(0);
                        setCreditAmount(0);
                      }}
                      className="px-2 py-1 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded hover:from-yellow-600 hover:to-yellow-700 transition-all text-xs"
                    >
                      <i className="ri-edit-line mr-1"></i>
                      Editează
                    </button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-600">Sold</span>
                      <span className="text-xs font-semibold text-gray-900">{selectedUser.tokens.balance}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-600">Total Câștigați</span>
                      <span className="text-xs font-semibold text-gray-900">{selectedUser.tokens.totalEarned}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-600">Total Cheltuiți</span>
                      <span className="text-xs font-semibold text-gray-900">{selectedUser.tokens.totalSpent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-600">Nivel</span>
                      <span className="text-xs font-semibold text-gray-900">{selectedUser.tokens.level}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      <i className="ri-money-dollar-circle-line text-green-600 text-sm"></i>
                      Credit
                    </h3>
                    <button
                      onClick={() => {
                        setShowCreditTokensModal(true);
                        setTokensAmount(0);
                        setCreditAmount(0);
                      }}
                      className="px-2 py-1 bg-gradient-to-r from-green-500 to-green-600 text-white rounded hover:from-green-600 hover:to-green-700 transition-all text-xs"
                    >
                      <i className="ri-edit-line mr-1"></i>
                      Editează
                    </button>
                  </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-600">Total Credit</span>
                        <span className="text-sm font-bold text-green-600">
                          {getTotalCredit(selectedUser.payments).toLocaleString('ro-RO')} Lei
                        </span>
                      </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-600">Număr Plăți</span>
                      <span className="text-xs font-semibold text-gray-900">{selectedUser.payments.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">Credit pentru cumpărarea pachetelor cu tokeni</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Unlocked Products */}
              <div className="bg-gray-50 rounded p-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                  <i className="ri-lock-unlock-line text-blue-600 text-sm"></i>
                  Produse Deblocate cu Tokeni ({selectedUser.unlockedProducts.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedUser.unlockedProducts.length > 0 ? (
                    selectedUser.unlockedProducts.map((productId, index) => (
                      <span
                        key={index}
                        className="px-2 py-0.5 bg-blue-500/20 border border-blue-400/30 rounded text-xs text-blue-200"
                      >
                        {productId}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-gray-600">Niciun produs deblocat</p>
                  )}
                </div>
              </div>

              {/* Payments */}
              <div className="bg-gray-50 rounded p-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                  <i className="ri-bank-card-line text-blue-600 text-sm"></i>
                  Plăți ({selectedUser.payments.length})
                </h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {selectedUser.payments.length > 0 ? (
                    selectedUser.payments.map((payment: PaymentRecord, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedPayment(payment);
                          setShowPaymentDetailsModal(true);
                        }}
                        className="w-full flex justify-between items-center p-1.5 bg-white rounded hover:bg-gray-100 transition-colors cursor-pointer text-left"
                      >
                        <div>
                          <p className="text-xs text-gray-900">{payment.invoiceNumber || payment.id}</p>
                          <p className="text-xs text-gray-600">{formatDate(payment.createdAt)}</p>
                        </div>
                        <span className="text-xs font-semibold text-green-600">
                          {payment.amount?.toLocaleString('ro-RO') || '0'} {payment.currency}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-gray-600">Nicio plată înregistrată</p>
                  )}
                </div>
              </div>

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className="bg-gradient-to-r from-blue-500/20 to-blue-500/20 rounded p-3 border border-blue-400/30">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                    <i className="ri-lightbulb-line text-yellow-600 text-sm"></i>
                    Recomandări Bazate pe Comportament
                  </h3>
                  <div className="space-y-2">
                    {recommendations.map((rec, index) => (
                      <div key={index} className="bg-gray-50 rounded p-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs font-semibold text-gray-900">{rec.title}</p>
                            <p className="text-xs text-gray-600 mt-0.5">{rec.description}</p>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            rec.priority === 'high' 
                              ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                              : 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                          }`}>
                            {rec.priority === 'high' ? 'Prioritate Mare' : 'Prioritate Medie'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowResetPasswordModal(true);
                    }}
                    className="flex-1 px-3 py-1.5 text-xs bg-gradient-to-r from-red-500 to-red-600 text-white rounded hover:from-red-600 hover:to-red-700 transition-all"
                  >
                    <i className="ri-lock-password-line mr-1"></i>
                    Resetează Parola
                  </button>
                  <button
                    onClick={() => {
                      generateRecommendations(selectedUser);
                    }}
                    className="flex-1 px-3 py-1.5 text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded hover:from-blue-600 hover:to-blue-700 transition-all"
                  >
                    <i className="ri-lightbulb-line mr-1"></i>
                    Generează Recomandări
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmEmail("");
                    setShowDeleteUserModal(true);
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-red-600 text-red-700 bg-red-50 rounded hover:bg-red-100 transition-all"
                >
                  <i className="ri-delete-bin-7-line mr-1" aria-hidden />
                  Șterge utilizatorul definitiv
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete user confirmation */}
      {showDeleteUserModal && selectedUser && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteUserModal(false);
              setDeleteConfirmEmail("");
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-red-200 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-red-100">
              <h3 className="text-lg font-bold text-gray-900">Ștergere definitivă</h3>
              <p className="text-xs text-gray-600 mt-1">
                Contul <span className="font-semibold">{selectedUser.email}</span> va fi eliminat din sistem (autentificare și date legate, unde baza de date permite). Acțiunea nu poate fi anulată.
              </p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Scrie adresa de email pentru confirmare
                </label>
                <input
                  type="email"
                  autoComplete="off"
                  value={deleteConfirmEmail}
                  onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                  placeholder={selectedUser.email}
                  className="w-full px-3 py-1.5 text-sm rounded bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteUserModal(false);
                    setDeleteConfirmEmail("");
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-all"
                >
                  Anulează
                </button>
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={
                    isDeletingUser ||
                    deleteConfirmEmail.trim().toLowerCase() !== selectedUser.email.trim().toLowerCase()
                  }
                  className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingUser ? "Se șterge…" : "Șterge definitiv"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && selectedUser && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowResetPasswordModal(false);
              setNewPassword('');
            }
          }}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Resetează Parola</h3>
              <p className="text-xs text-gray-600 mt-0.5">Pentru: {selectedUser.email}</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Noua Parolă
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Introdu noua parolă..."
                  className="w-full px-3 py-1.5 text-sm rounded bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setNewPassword('');
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-all"
                >
                  Anulează
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={!newPassword || isResettingPassword}
                  className="flex-1 px-3 py-1.5 text-xs bg-gradient-to-r from-red-500 to-red-600 text-white rounded hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResettingPassword ? 'Se actualizează...' : 'Resetează'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit & Tokens Update Modal */}
      {showCreditTokensModal && selectedUser && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreditTokensModal(false);
              setCreditAmount(0);
              setTokensAmount(0);
              setCreditOperation('add');
              setTokensOperation('add');
            }
          }}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Gestionează Credit & Tokeni</h3>
              <p className="text-xs text-gray-600 mt-0.5">Pentru: {selectedUser.email}</p>
            </div>
            <div className="p-4 space-y-4">
              {/* Credit Section */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Credit (Lei) - Pentru cumpărarea pachetelor cu tokeni
                </label>
                <div className="flex gap-1.5 mb-1.5">
                  <button
                    onClick={() => setCreditOperation('add')}
                    className={`flex-1 px-2 py-1.5 rounded text-xs transition-all ${
                      creditOperation === 'add'
                        ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Adaugă
                  </button>
                  <button
                    onClick={() => setCreditOperation('subtract')}
                    className={`flex-1 px-2 py-1.5 rounded text-xs transition-all ${
                      creditOperation === 'subtract'
                        ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Scade
                  </button>
                </div>
                <input
                  type="number"
                  value={creditAmount || ''}
                  onChange={(e) => setCreditAmount(parseFloat(e.target.value) || 0)}
                  placeholder="Introdu suma în Lei..."
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-1.5 text-sm rounded bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                {creditAmount > 0 && (
                  <p className="text-xs text-gray-600 mt-1">
                    {creditOperation === 'add' ? '+' : '-'} {creditAmount} Lei (pentru cumpărarea pachetelor cu tokeni)
                  </p>
                )}
              </div>

              {/* Tokens Section */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Tokeni
                </label>
                <div className="flex gap-1.5 mb-1.5">
                  <button
                    onClick={() => setTokensOperation('add')}
                    className={`flex-1 px-2 py-1.5 rounded text-xs transition-all ${
                      tokensOperation === 'add'
                        ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Adaugă
                  </button>
                  <button
                    onClick={() => setTokensOperation('subtract')}
                    className={`flex-1 px-2 py-1.5 rounded text-xs transition-all ${
                      tokensOperation === 'subtract'
                        ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Scade
                  </button>
                </div>
                <input
                  type="number"
                  value={tokensAmount || ''}
                  onChange={(e) => setTokensAmount(parseInt(e.target.value) || 0)}
                  placeholder="Introdu numărul de tokeni..."
                  min="0"
                  className="w-full px-3 py-1.5 text-sm rounded bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                {tokensAmount > 0 && (
                  <p className="text-xs text-gray-600 mt-1">
                    {tokensOperation === 'add' ? '+' : '-'} {tokensAmount} Tokeni
                  </p>
                )}
              </div>

              {/* Current Values */}
              <div className="bg-gray-50 rounded p-2 space-y-0.5">
                <p className="text-xs text-gray-600">Valori curente:</p>
                <p className="text-xs text-gray-900">
                  Credit: <span className="font-semibold text-green-600">{getTotalCredit(selectedUser.payments).toLocaleString('ro-RO')} Lei</span>
                </p>
                <p className="text-xs text-gray-900">
                  Tokeni: <span className="font-semibold text-yellow-600">{selectedUser.tokens.balance}</span>
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowCreditTokensModal(false);
                    setCreditAmount(0);
                    setTokensAmount(0);
                    setCreditOperation('add');
                    setTokensOperation('add');
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-all"
                >
                  Anulează
                </button>
                <button
                  onClick={handleCreditTokensUpdate}
                  disabled={(creditAmount === 0 && tokensAmount === 0) || isSavingTokens}
                  className="flex-1 px-3 py-1.5 text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingTokens ? 'Se salvează...' : 'Salvează'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Details Modal */}
      {showPaymentDetailsModal && selectedPayment && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => {
            setShowPaymentDetailsModal(false);
            setSelectedPayment(null);
          }}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Detalii Plată</h3>
                <button
                  onClick={() => {
                    setShowPaymentDetailsModal(false);
                    setSelectedPayment(null);
                  }}
                  className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                >
                  <i className="ri-close-line text-base text-gray-700"></i>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Basic Payment Info */}
              <div className="bg-gray-50 rounded p-3">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Informații Generale</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">ID Plată:</span>
                    <span className="text-xs text-gray-900 font-mono">{selectedPayment.id}</span>
                  </div>
                  {selectedPayment.invoiceNumber && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-600">Număr Factură:</span>
                      <span className="text-xs text-gray-900">{selectedPayment.invoiceNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Sumă:</span>
                    <span className={`text-xs font-semibold ${selectedPayment.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedPayment.amount >= 0 ? '+' : ''}{selectedPayment.amount?.toLocaleString('ro-RO') || '0'} {selectedPayment.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Tip:</span>
                    <span className="text-xs text-gray-900">{selectedPayment.type || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Data:</span>
                    <span className="text-xs text-gray-900">
                      {new Date(selectedPayment.createdAt).toLocaleDateString('ro-RO', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {selectedPayment.description && (
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-600 mb-1">Descriere:</span>
                      <span className="text-xs text-gray-900">{selectedPayment.description}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata Details */}
              {selectedPayment.metadata && Object.keys(selectedPayment.metadata).length > 0 && (
                <div className="bg-gray-50 rounded p-3">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Detalii Suplimentare</h4>
                  <div className="space-y-2">
                    {Object.entries(selectedPayment.metadata).map(([key, value]) => (
                      <div key={key} className="flex flex-col">
                        <span className="text-xs text-gray-600 mb-0.5 capitalize">
                          {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                        </span>
                        <span className="text-xs text-gray-900">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product/Auction Info if available */}
              {selectedPayment.metadata?.productId && (
                <div className="bg-blue-50 rounded p-3 border border-blue-200">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
                    <i className="ri-auction-line text-blue-600"></i>
                    Anunț Activ
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-blue-700">ID Anunț:</span>
                      <span className="text-xs text-blue-900 font-mono">{selectedPayment.metadata.productId}</span>
                    </div>
                    {selectedPayment.metadata.productTitle && (
                      <div className="flex flex-col">
                        <span className="text-xs text-blue-700">Titlu:</span>
                        <span className="text-xs text-blue-900">{selectedPayment.metadata.productTitle}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Info if available */}
              {selectedPayment.metadata?.action && (
                <div className="bg-blue-50 rounded p-3 border border-blue-200">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
                    <i className="ri-settings-3-line text-blue-600"></i>
                    Acțiune
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-blue-700">Tip Acțiune:</span>
                      <span className="text-xs text-blue-900 capitalize">{selectedPayment.metadata.action}</span>
                    </div>
                    {selectedPayment.metadata.actionType && (
                      <div className="flex justify-between">
                        <span className="text-xs text-blue-700">Detalii:</span>
                        <span className="text-xs text-blue-900">{selectedPayment.metadata.actionType}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Token Package Info if available */}
              {selectedPayment.metadata?.packageId && (
                <div className="bg-yellow-50 rounded p-3 border border-yellow-200">
                  <h4 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-1.5">
                    <i className="ri-coins-line text-yellow-600"></i>
                    Pachet Tokeni
                  </h4>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-yellow-700">ID Pachet:</span>
                      <span className="text-xs text-yellow-900">{selectedPayment.metadata.packageId}</span>
                    </div>
                    {selectedPayment.metadata.tokensAmount && (
                      <div className="flex justify-between">
                        <span className="text-xs text-yellow-700">Tokeni:</span>
                        <span className="text-xs text-yellow-900 font-semibold">{selectedPayment.metadata.tokensAmount}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setShowPaymentDetailsModal(false);
                  setSelectedPayment(null);
                }}
                className="w-full px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-all"
              >
                Închide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {showNotificationModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={() => setShowNotificationModal(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-4 border-b ${notificationType === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center gap-2">
                {notificationType === 'success' ? (
                  <i className="ri-checkbox-circle-line text-green-600 text-xl"></i>
                ) : (
                  <i className="ri-error-warning-line text-red-600 text-xl"></i>
                )}
                <h3 className={`text-sm font-semibold ${notificationType === 'success' ? 'text-green-900' : 'text-red-900'}`}>
                  {notificationType === 'success' ? 'Succes' : 'Eroare'}
                </h3>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-700 mb-4">{notificationMessage}</p>
              <button
                onClick={() => setShowNotificationModal(false)}
                className={`w-full px-3 py-1.5 text-xs rounded transition-all ${
                  notificationType === 'success'
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}