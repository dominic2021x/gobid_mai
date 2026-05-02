"use client";

import { useState, useEffect } from "react";
import { HeartIcon } from "./HeroIcons";
import supabase from "@/lib/supabase";

interface FavoriteList {
  id: string;
  name: string;
  items: string[];
  createdAt: string;
}

interface AddToFavoriteListModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productTitle?: string;
  isDarkMode?: boolean;
  onSuccess?: () => void;
  itemType?: 'auction' | 'product' | 'user';
}

export default function AddToFavoriteListModal({
  isOpen,
  onClose,
  productId,
  productTitle,
  isDarkMode = false,
  onSuccess,
  itemType = 'product'
}: AddToFavoriteListModalProps) {
  const [favoriteLists, setFavoriteLists] = useState<FavoriteList[]>([]);
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [alreadyInFavorites, setAlreadyInFavorites] = useState(false);

  // Load favorite lists
  useEffect(() => {
    if (isOpen) {
      loadFavoriteLists();
      loadCurrentSelections();
      checkIfAlreadyInFavorites();
    }
  }, [isOpen, productId]);

  const checkIfAlreadyInFavorites = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAlreadyInFavorites(false);
        return;
      }

      const response = await fetch('/api/user/favorites', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const favorites = data.favorites || [];
        const exists = favorites.some((f: any) => f.item_id === productId && f.item_type === itemType);
        setAlreadyInFavorites(exists);
      }
    } catch (error) {
      console.error('Error checking if already in favorites:', error);
      setAlreadyInFavorites(false);
    }
  };

  const loadFavoriteLists = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/user/favorites', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const listsData = data.favoriteLists || [];
        const favorites = data.favorites || [];

        // If no lists exist, create "LISTA 1" automatically
        if (listsData.length === 0) {
          const userId = session.user.id;
          const lista1Id = `lista-1-${userId}`;
          
          try {
            const createResponse = await fetch('/api/user/favorite-lists', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                id: lista1Id,
                name: 'LISTA 1'
              })
            });

            if (createResponse.ok) {
              const newList = await createResponse.json();
              const lists: FavoriteList[] = [{
                id: newList.id,
                name: newList.name,
                items: [],
                createdAt: newList.created_at || new Date().toISOString()
              }];
              setFavoriteLists(lists);
              // Automatically select the newly created list
              setSelectedLists(new Set([newList.id]));
              return;
            }
          } catch (createError) {
            console.error('Error creating LISTA 1:', createError);
          }
        }

        const lists: FavoriteList[] = listsData.map((list: any) => ({
          id: list.id,
          name: list.name,
          items: favorites.filter((f: any) => f.favorite_list_id === list.id).map((f: any) => f.item_id),
          createdAt: list.created_at
        }));

        setFavoriteLists(lists);
      }
    } catch (error) {
      console.error('Error loading favorite lists:', error);
    }
  };

  const loadCurrentSelections = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/user/favorites', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const favorites = data.favorites || [];
        
        // Find lists that already contain this product
        const listsWithProduct = favorites
          .filter((f: any) => f.item_id === productId)
          .map((f: any) => f.favorite_list_id);

        setSelectedLists(new Set(listsWithProduct));
      }
    } catch (error) {
      console.error('Error loading current selections:', error);
    }
  };

  const handleToggleList = (listId: string) => {
    const newSelected = new Set(selectedLists);
    if (newSelected.has(listId)) {
      newSelected.delete(listId);
    } else {
      newSelected.add(listId);
    }
    setSelectedLists(newSelected);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get current favorites to see which lists already have this product
      const favoritesResponse = await fetch('/api/user/favorites', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!favoritesResponse.ok) return;

      const favoritesData = await favoritesResponse.json();
      const currentFavorites = favoritesData.favorites || [];
      const currentListsWithProduct = currentFavorites
        .filter((f: any) => f.item_id === productId)
        .map((f: any) => f.favorite_list_id);

      // Add to selected lists that don't already have it
      const listsToAdd = Array.from(selectedLists).filter(id => !currentListsWithProduct.includes(id));
      
      // Remove from lists that are not selected but currently have it
      const listsToRemove = currentListsWithProduct.filter((id: string) => !selectedLists.has(id));

      // If no lists are selected and item is not in any list, add it without favoriteListId
      // This will trigger automatic creation of "LISTA 1" in the API
      if (listsToAdd.length === 0 && currentListsWithProduct.length === 0) {
        const addResponse = await fetch('/api/user/favorites', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            itemId: productId,
            itemType: itemType
            // No favoriteListId - API will create "LISTA 1" automatically
          })
        });

        if (addResponse.ok) {
          const responseData = await addResponse.json();
          if (responseData.alreadyExists) {
            setAlreadyInFavorites(true);
          } else {
            // Reload lists to show the newly created "LISTA 1"
            await loadFavoriteLists();
          }
        } else {
          const errorData = await addResponse.json().catch(() => ({}));
          console.error('Failed to add favorite:', addResponse.status, errorData);
        }
      } else {
        // Add to new lists
        for (const listId of listsToAdd) {
          const addResponse = await fetch('/api/user/favorites', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              itemId: productId,
              itemType: itemType,
              favoriteListId: listId
            })
          });

          if (addResponse.ok) {
            const responseData = await addResponse.json();
            // Check if item was already in favorites
            if (responseData.alreadyExists) {
              setAlreadyInFavorites(true);
              // Don't continue adding to other lists if already exists
              break;
            }
          } else {
            const errorData = await addResponse.json().catch(() => ({}));
            console.error('Failed to add favorite:', addResponse.status, errorData);
          }
        }
      }

      // Remove from unselected lists
      for (const listId of listsToRemove) {
        const favoriteToRemove = currentFavorites.find(
          (f: any) => f.item_id === productId && f.favorite_list_id === listId
        );
        
        if (favoriteToRemove) {
          // DELETE endpoint expects itemId, itemType, and optional favoriteListId as query params
          const deleteResponse = await fetch(`/api/user/favorites?itemId=${productId}&itemType=${itemType}&favoriteListId=${listId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });

          if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json().catch(() => ({}));
            console.error('Failed to remove favorite:', deleteResponse.status, errorData);
          }
        }
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      console.error('Error saving favorite lists:', error);
      alert('Eroare la salvarea listelor. Te rugăm să încerci din nou.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      alert('Numele listei este obligatoriu!');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShowAuthModal(true);
        setLoading(false);
        return;
      }

      const newListId = `list-${Date.now()}`;
      const requestBody: any = {
        id: newListId,
        name: newListName.trim(),
        isDefault: false
      };
      
      // Only include description if it's not empty
      if (newListDescription.trim()) {
        requestBody.description = newListDescription.trim();
      }

      const response = await fetch('/api/user/favorite-lists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to create list:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to create list');
      }

      const createdList = await response.json();
      const newList: FavoriteList = {
        id: newListId,
        name: newListName.trim(),
        items: [],
        createdAt: createdList.created_at || new Date().toISOString()
      };
      setFavoriteLists([...favoriteLists, newList]);
      setSelectedLists(new Set([...selectedLists, newListId]));
      setNewListName('');
      setNewListDescription('');
      setShowCreateListModal(false);
    } catch (error: any) {
      console.error('Error creating list:', error);
      alert(`Eroare la crearea listei: ${error.message || 'Te rugăm să încerci din nou.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Filter out "Lista Useri favoriti" when saving auctions or products (only for users)
  const filteredLists = favoriteLists.filter(list => {
    const matchesSearch = list.name.toLowerCase().includes(searchQuery.toLowerCase());
    // Hide "Lista Useri favoriti" when saving auctions or products
    if (list.id === 'lista-useri-favoriti' && itemType !== 'user') {
      return false;
    }
    return matchesSearch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl ${
        isDarkMode ? 'bg-gray-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          isDarkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </div>
            <h2 className={`text-lg font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Liste / Colecții
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
              isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {alreadyInFavorites ? (
            <div className={`mb-4 p-4 rounded-lg border-2 ${
              isDarkMode 
                ? 'bg-blue-900/20 border-blue-500/50' 
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 p-2 rounded-lg ${
                  isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                }`}>
                  <svg className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold text-sm mb-1 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Este deja salvat la favorite
                  </h3>
                  <p className={`text-xs mb-3 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Acest produs este deja salvat în favorite. Poți să-l vezi în lista ta de favorite.
                  </p>
                  <a
                    href="/favorites"
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      isDarkMode
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                    onClick={() => onClose()}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                    </svg>
                    Vezi favorite
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className={`text-sm ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Adaugă acest produs la o colecție.
                </p>
                <span className={`text-sm font-semibold ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {selectedLists.size} {selectedLists.size === 1 ? 'listă' : 'liste'}
                </span>
              </div>

              {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută ..."
              className={`w-full px-4 py-2 rounded-lg border text-sm ${
                isDarkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>

          {/* Lists */}
          <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
            {filteredLists.length === 0 ? (
              <div className={`text-center py-8 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                <p className="text-sm">Nu există liste</p>
              </div>
            ) : (
              filteredLists.map((list) => (
                <div
                  key={list.id}
                  onClick={() => handleToggleList(list.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                    selectedLists.has(list.id)
                      ? isDarkMode
                        ? 'bg-blue-900/30 border-2 border-blue-500'
                        : 'bg-blue-50 border-2 border-blue-500'
                      : isDarkMode
                        ? 'bg-gray-700/50 border-2 border-transparent hover:bg-gray-700'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                >
                  {/* Icon */}
                  <div className={`p-2 rounded-lg flex-shrink-0 ${
                    isDarkMode ? 'bg-gray-600' : 'bg-gray-200'
                  }`}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                    </svg>
                  </div>

                  {/* List Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold text-sm ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {list.name}
                    </h3>
                    <p className={`text-xs mt-0.5 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {list.items.length} {list.items.length === 1 ? 'produs' : 'produse'}
                    </p>
                  </div>

                  {/* Checkbox */}
                  <div className="flex-shrink-0">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      selectedLists.has(list.id)
                        ? 'bg-blue-600 border-blue-600'
                        : isDarkMode
                          ? 'border-gray-500'
                          : 'border-gray-300'
                    }`}>
                      {selectedLists.has(list.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* External Link Icon */}
                  <div className="flex-shrink-0">
                    <svg className={`w-4 h-4 ${
                      isDarkMode ? 'text-gray-500' : 'text-gray-400'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </div>
              ))
            )}
          </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreateListModal(true)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Creează Nouă
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                    loading
                      ? 'bg-orange-400 cursor-not-allowed'
                      : 'bg-orange-500 hover:bg-orange-600'
                  }`}
                >
                  {loading ? 'Se salvează...' : 'Salvează'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create New List Modal */}
      {showCreateListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  isDarkMode ? 'bg-orange-900/30' : 'bg-orange-100'
                }`}>
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h2 className={`text-lg font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Creează listă nouă
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowCreateListModal(false);
                  setNewListName('');
                  setNewListDescription('');
                }}
                className={`p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* List Name */}
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Numele listei: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Introdu numele listei..."
                  className={`w-full px-4 py-2.5 rounded-lg border text-sm ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
                  }`}
                  autoFocus
                />
              </div>

              {/* List Description */}
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Descrierea listei <span className={`text-xs font-normal ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>(opțional)</span>
                </label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="Adaugă câteva note la lista ta nouă..."
                  rows={4}
                  className={`w-full px-4 py-2.5 rounded-lg border text-sm resize-y ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
                  }`}
                />
              </div>

              {/* Action Button */}
              <button
                onClick={handleCreateList}
                disabled={loading || !newListName.trim()}
                className={`w-full px-4 py-3 rounded-lg font-medium text-white transition-colors ${
                  loading || !newListName.trim()
                    ? 'bg-orange-400 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                {loading ? 'Se creează...' : 'Creează Listă'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authentication Modal */}
      {showAuthModal && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => setShowAuthModal(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          {/* Modal Content */}
          <div 
            className={`relative w-full max-w-md rounded-2xl shadow-2xl border transform transition-all ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowAuthModal(false)}
              className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${
                isDarkMode 
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              <i className="ri-close-line text-xl"></i>
            </button>

            {/* Modal Body */}
            <div className="p-6 md:p-8">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  isDarkMode 
                    ? 'bg-red-500/20' 
                    : 'bg-red-100'
                }`}>
                  <i className="ri-lock-line text-3xl text-red-500"></i>
                </div>
              </div>

              {/* Title */}
              <h3 className={`text-xl md:text-2xl font-bold text-center mb-2 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Autentificare necesară
              </h3>

              {/* Message */}
              <p className={`text-sm md:text-base text-center mb-6 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Trebuie să fii autentificat pentru a crea liste.
              </p>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowAuthModal(false)}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                    isDarkMode 
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Anulează
                </button>
                <button
                  onClick={() => {
                    setShowAuthModal(false);
                    window.location.href = '/auth?mode=login';
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl"
                >
                  Autentifică-te
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

