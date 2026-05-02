"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import supabase from "@/lib/supabase";
import { AdminUser } from "../types";

const ADMIN_ROLE_VALUES = ["admin", "superadmin", "administrator", "super_user", "manager"];
const SUPER_ADMIN_ROLES = ["super_user", "superadmin", "administrator", "owner"];

const ADMIN_PAGE_DEFINITIONS: Array<{ slug: string; label: string; path: string }> = [
  { slug: "dashboard", label: "Dashboard", path: "/admin" },
  { slug: "add-product", label: "Adaugă Produs", path: "/admin/add-product" },
  { slug: "ai-drive", label: "AI Drive", path: "/admin/ai-drive" },
  { slug: "ai-monitor", label: "AI Monitor", path: "/admin/ai-monitor" },
  { slug: "autopilot", label: "Autopilot AI", path: "/admin/autopilot" },
  { slug: "calendar", label: "Calendar", path: "/admin/calendar" },
  { slug: "chat", label: "Chat (Client)", path: "/admin/chat" },
  { slug: "chats", label: "Chat Admin", path: "/admin/chats" },
  { slug: "email", label: "Campanii Email", path: "/admin/email" },
  { slug: "idee-video", label: "Idei Video", path: "/admin/idee-video" },
  { slug: "kanban-board", label: "Kanban Board", path: "/admin/kanban-board" },
  { slug: "modules", label: "Module", path: "/admin/modules" },
  { slug: "newsletter", label: "Newsletter", path: "/admin/newsletter" },
  { slug: "products", label: "Produse", path: "/admin/products" },
  { slug: "review", label: "Review AI", path: "/admin/review" },
  { slug: "statistici", label: "Statistici", path: "/admin/statistici" },
  { slug: "tickets", label: "Tichete Suport", path: "/admin/tickets" },
  { slug: "tts-settings", label: "Setări TTS", path: "/admin/tts-settings" },
  { slug: "users", label: "Utilizatori", path: "/admin/users" },
  { slug: "users-admins", label: "Administratori", path: "/admin/users/admins" },
];

function normalizeRole(user: AdminUser): string {
  return String(user.role || "").toLowerCase();
}

function isSuperAdminRoleName(role?: string) {
  if (!role) return false;
  return SUPER_ADMIN_ROLES.includes(role.toLowerCase());
}

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  const loadAdmins = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Nu am putut obține sesiunea curentă:", sessionError);
        setError("Nu am putut obține sesiunea utilizatorului. Reîncearcă sau reconectează-te.");
        setAdmins([]);
        setIsLoading(false);
        return;
      }

      const token = sessionData?.session?.access_token ?? null;
      setAccessToken(token);
      if (!token) {
        setError("Sesiunea a expirat. Te rugăm să te reconectezi.");
        setAdmins([]);
        setIsLoading(false);
        return;
      }

      const currentUser = sessionData?.session?.user;
      const currentRole =
        currentUser?.user_metadata?.role ||
        currentUser?.app_metadata?.role ||
        (Array.isArray(currentUser?.app_metadata?.roles)
          ? currentUser.app_metadata.roles[0]
          : undefined);
      const normalizedCurrentRole =
        typeof currentRole === "string" ? currentRole.toLowerCase() : "";

      if (!SUPER_ADMIN_ROLES.includes(normalizedCurrentRole)) {
        setError("Această pagină este disponibilă doar pentru Super Admin.");
        setIsUnauthorized(true);
        setAdmins([]);
        setIsLoading(false);
        return;
      }
      setIsUnauthorized(false);

      const response = await fetch("/api/admin/users?adminOnly=1", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Nu am putut încărca administratorii din Supabase.");
      }

      const payload = await response.json();
      const fetchedUsers: AdminUser[] = (payload?.users ?? []).map((user: AdminUser) => {
        const normalizedRole = normalizeRole(user);
        const isAdmin =
          Boolean(user.isAdmin) || ADMIN_ROLE_VALUES.includes(normalizedRole);

        return {
          ...user,
          role: normalizedRole || "admin",
          isAdmin,
        };
      });

      const onlyAdmins = fetchedUsers.filter((user) => user.isAdmin);
      setAdmins(onlyAdmins);

      if (onlyAdmins.length > 0) {
        setSelectedAdmin((prev) => {
          if (prev) {
            const stillExists = onlyAdmins.find((admin) => admin.id === prev.id);
            return stillExists ?? onlyAdmins[0];
          }
          return onlyAdmins[0];
        });
      } else {
        setSelectedAdmin(null);
      }
    } catch (err: any) {
      console.error("Eroare la încărcarea administratorilor:", err);
      setError(err?.message || "A apărut o eroare neașteptată la încărcarea administratorilor.");
      setAdmins([]);
      setSelectedAdmin(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const loadPermissions = useCallback(
    async (userId: string) => {
      if (!accessToken || !userId) {
        setPermissions({});
        return;
      }

      try {
        const response = await fetch(`/api/admin/users/permissions?userId=${encodeURIComponent(userId)}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Nu am putut încărca permisiunile.");
        }

        const payload = await response.json();
        const perms = payload?.permissions ?? [];
        const map: Record<string, boolean> = {};
        perms.forEach((row: { page: string; canAccess: boolean }) => {
          if (row?.page) {
            map[row.page] = Boolean(row.canAccess);
          }
        });
        setPermissions(map);
      } catch (err: any) {
        console.error("Eroare la încărcarea permisiunilor:", err);
        setPermissions({});
        setError(err?.message || "Nu am putut încărca permisiunile administratorului.");
      }
    },
    [accessToken]
  );

  useEffect(() => {
    if (selectedAdmin) {
      loadPermissions(selectedAdmin.id);
    } else {
      setPermissions({});
    }
  }, [selectedAdmin, loadPermissions]);

  const formatDate = useCallback((dateString?: string | null) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString("ro-RO");
    } catch {
      return dateString;
    }
  }, []);

  const roleLabel = useCallback((admin: AdminUser) => {
    const role = normalizeRole(admin);
    if (role === "super_user" || role === "superuser" || role === "owner") {
      return "Super Admin";
    }
    if (role === "manager") {
      return "Manager";
    }
    if (role === "administrator" || role === "superadmin") {
      return "Administrator";
    }
    return "Admin";
  }, []);

  const togglePermission = (pageSlug: string) => {
    setPermissions((prev) => ({
      ...prev,
      [pageSlug]: !prev[pageSlug],
    }));
  };

  const handleSavePermissions = async () => {
    if (!selectedAdmin || !accessToken) return;

    setIsSavingPermissions(true);
    try {
      const serialized = ADMIN_PAGE_DEFINITIONS.map((page) => ({
        page: page.slug,
        canAccess: Boolean(permissions[page.slug]),
      }));

      const response = await fetch("/api/admin/users/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: selectedAdmin.id,
          permissions: serialized,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Nu am putut salva permisiunile.");
      }

      alert("Permisiunile au fost salvate cu succes.");
    } catch (err: any) {
      console.error("Eroare la salvarea permisiunilor:", err);
      alert(err?.message || "Nu am putut salva permisiunile. Încearcă din nou.");
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const totalAdmins = admins.length;
  const highlightedAdmin = useMemo(() => selectedAdmin, [selectedAdmin]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 lg:p-8">
      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {isUnauthorized ? (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-6">
          Această pagină este disponibilă doar pentru conturile cu rol Super Admin.
        </div>
      ) : (
        <>
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-4 text-gray-900">
              Administratori Platformă
            </h1>
            <p className="text-sm sm:text-base text-gray-600 max-w-2xl">
              Vizualizează conturile cu acces administrativ și configurează permisiunile pentru fiecare pagină.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
                    <i className="ri-shield-user-line text-blue-500"></i>
                    Lista Administratorilor
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {totalAdmins} cont{totalAdmins === 1 ? "" : "uri"} cu rol administrativ
                  </p>
                </div>
                <button
                  onClick={loadAdmins}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs sm:text-sm text-gray-700 transition-colors"
                >
                  Reîncarcă
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700">
                        Administrator
                      </th>
                      <th className="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 hidden md:table-cell">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 hidden lg:table-cell">
                        Rol
                      </th>
                      <th className="px-4 py-3 text-left text-xs sm:text-sm font-medium text-gray-300 hidden xl:table-cell">
                        Creat la
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {isLoading ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-600">
                          Se încarcă administratorii din Supabase...
                        </td>
                      </tr>
                    ) : admins.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-600">
                          Nu există administratori înregistrați în acest moment.
                        </td>
                      </tr>
                    ) : (
                      admins.map((admin) => {
                        const isSelected = highlightedAdmin?.id === admin.id;
                        return (
                          <tr
                            key={admin.id}
                            className={`hover:bg-gray-50 transition-colors cursor-pointer ${isSelected ? "bg-gray-50" : ""}`}
                            onClick={() => setSelectedAdmin(admin)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs sm:text-sm">
                                  {admin.firstName.charAt(0).toUpperCase()}
                                  {admin.lastName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm sm:text-base font-medium text-gray-900">
                                    {admin.firstName} {admin.lastName}
                                  </p>
                                  <p className="text-xs text-gray-500 md:hidden">{admin.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-300 hidden md:table-cell">
                              {admin.email}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell capitalize">
                              {roleLabel(admin)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 hidden xl:table-cell">
                              {formatDate(admin.createdAt)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <i className="ri-user-voice-line text-blue-600"></i>
                  Detalii Administrator
                </h2>
                <p className="text-xs text-gray-600">
                  Selectează un administrator din tabel pentru a vedea detalii suplimentare.
                </p>
              </div>

              {highlightedAdmin ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">Nume complet</p>
                    <p className="text-sm text-gray-900 font-medium">
                      {highlightedAdmin.firstName} {highlightedAdmin.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">Email</p>
                    <p className="text-sm text-white">{highlightedAdmin.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">Rol administrativ</p>
                    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                      <i className="ri-shield-star-line"></i>
                      {roleLabel(highlightedAdmin)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">Creat la</p>
                      <p className="text-sm text-gray-900">{formatDate(highlightedAdmin.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">Tokeni</p>
                      <p className="text-sm text-gray-900">
                        {highlightedAdmin.tokens.balance} tokeni (nivel {highlightedAdmin.tokens.level})
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">Activitate recentă</p>
                    <p className="text-sm text-gray-900">
                      {highlightedAdmin.activity.length > 0
                        ? `${highlightedAdmin.activity.length} eveniment${highlightedAdmin.activity.length === 1 ? "" : "e"} înregistrat${highlightedAdmin.activity.length === 1 ? "" : "e"}`
                        : "Fără activitate înregistrată"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  Selectează un administrator din listă pentru a vedea detalii suplimentare.
                </div>
              )}

              {highlightedAdmin ? (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                        <i className="ri-checkbox-line text-green-600"></i>
                        Permisiuni de acces
                      </h3>
                      <p className="text-xs text-gray-600">
                        Bifează paginile la care administratorul selectat are voie să acceseze.
                      </p>
                    </div>
                    {isSuperAdminRoleName(highlightedAdmin.role) ? null : (
                      <button
                        onClick={handleSavePermissions}
                        disabled={isSavingPermissions}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSavingPermissions ? "Se salvează..." : "Salvează permisiuni"}
                      </button>
                    )}
                  </div>

                  {isSuperAdminRoleName(highlightedAdmin.role) ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
                      Acest administrator este Super Admin și are acces complet la întregul panou.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 max-h-[45vh] overflow-y-auto pr-1">
                      {ADMIN_PAGE_DEFINITIONS.map((page) => {
                        const checked = permissions[page.slug] ?? false;
                        return (
                          <label
                            key={page.slug}
                            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
                          >
                            <div>
                              <span className="font-medium text-gray-900">{page.label}</span>
                              <p className="text-xs text-gray-500">{page.path}</p>
                            </div>
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-green-500"
                              checked={checked}
                              onChange={() => togglePermission(page.slug)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
