"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HeartIcon, NotificationIcon, LockClosedIcon, LocationIcon, CoinsIcon } from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DashboardFooter from "@/components/DashboardFooter";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import supabase from "@/lib/supabase";
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";
import { ProductConditionBadge } from "@/components/ProductConditionBadge";
import { PieseAutoMarcaInlineSpan } from "@/components/piese-auto/PieseAutoMarcaBadges";
import { getMarcaFromListing, isPieseAutoListingProduct } from "@/lib/piese-auto/listing-marca";

const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const formatTimeLeft = (seconds: number) => {
  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} zile ${hours} ore`;
  if (hours > 0) return `${hours} ore ${minutes} minute`;
  if (minutes > 0) return `${minutes} minute`;
  return seconds > 0 ? `${seconds} secunde` : 'Informații';
};

const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  
  const day = d.getDate().toString().padStart(2, '0');
  const monthNames = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  
  return `${day} ${month} ${year}`;
};

// Helper functions pentru detectare tip produs
const isLicitatiiPublice = (product: { saleType?: string; productType?: string }) => {
  return product.saleType === 'licitatie-publica' || product.productType === 'licitatii-publice';
};

const isConditionNew = (condition: string | undefined) => {
  if (!condition) return false;
  const c = String(condition).trim().toLowerCase();
  return c === 'nou' || c === 'nouă';
};

const getDisplayCity = (location: string | undefined): string => {
  if (!location || !String(location).trim()) return '';
  const s = String(location).trim();
  const locMatch = s.match(/loc\.\s*([^,]+)/i);
  if (locMatch) return locMatch[1].trim();
  const judMatch = s.match(/jud\.\s*([^,]+)/i);
  if (judMatch) return judMatch[1].trim();
  const first = s.split(',')[0].trim();
  const parts = first.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last && last.length <= 25) return last;
  return first.length <= 30 ? first : s;
};

interface FavoriteList {
  id: string;
  name: string;
  items: string[];
  createdAt: string;
  pin?: string;
  isPrivate?: boolean;
  description?: string;
}

export default function ExecutorFavoritesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : "/dashboard/executor";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteLists, setFavoriteLists] = useState<FavoriteList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListPin, setNewListPin] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinToVerify, setPinToVerify] = useState('');
  const [listToUnlock, setListToUnlock] = useState<string | null>(null);
  const [unlockedLists, setUnlockedLists] = useState<Set<string>>(new Set());
  const [showSetPinModal, setShowSetPinModal] = useState(false);
  const [listToSetPin, setListToSetPin] = useState<string | null>(null);
  const [pinToSet, setPinToSet] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [listToEdit, setListToEdit] = useState<string | null>(null);
  const [editListName, setEditListName] = useState('');
  const [editListDescription, setEditListDescription] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [listToDelete, setListToDelete] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [listToShare, setListToShare] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [listsWithProducts, setListsWithProducts] = useState<Array<{
    list: FavoriteList;
    products: any[];
  }>>([]);
  const [viewMode, setViewMode] = useState<'lists' | 'products'>('lists');
  const [unlockedAuctions, setUnlockedAuctions] = useState<string[]>([]);
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: 'Basic',
    package: 'Basic' as string
  });

  // Load favorites and lists on mount
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }

        // Load favorites from API
        const favoritesResponse = await dashboardApiFetch('/api/user/favorites', {
          headers: {
          }
        });

        if (!favoritesResponse.ok) {
          setLoading(false);
          return;
        }
        
        const favoritesData = await favoritesResponse.json();
        const favorites = favoritesData.favorites || [];
        const favoriteListsData = favoritesData.favoriteLists || [];
        
        // Load favorite lists
        let currentActiveListId = activeListId;
        if (favoriteListsData.length > 0) {
          const lists: FavoriteList[] = favoriteListsData.map((list: any) => ({
            id: list.id,
            name: list.name,
            items: favorites.filter((f: any) => f.favorite_list_id === list.id).map((f: any) => f.item_id),
            createdAt: list.created_at,
            description: list.description || undefined,
            pin: list.pin || undefined,
            isPrivate: list.is_private || !!list.pin
          }));
          setFavoriteLists(lists);
          
          // Check if there's a list parameter in the URL (for shared links)
          const listParam = searchParams.get('list');
          if (listParam && lists.find((l: FavoriteList) => l.id === listParam)) {
            currentActiveListId = listParam;
            setActiveListId(currentActiveListId);
            // Remove the query parameter from URL after setting the list
            router.replace(`${basePath}/favorites`);
          } else if (!currentActiveListId) {
            // Set active list (default or first) only if not already set
            const defaultList = lists.find((l: FavoriteList) => l.id === 'default-list') || lists[0];
            currentActiveListId = defaultList.id;
            setActiveListId(currentActiveListId);
          }
        } else {
          // Create default list if none exists
          const defaultListId = 'default-list';
          try {
            const createListResponse = await dashboardApiFetch('/api/user/favorite-lists', {
              method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                id: defaultListId,
                name: 'Lista mea',
                isDefault: true
                      })
                    });

            if (createListResponse.ok) {
              const defaultList: FavoriteList = {
                id: defaultListId,
                name: 'Lista mea',
                items: [],
                createdAt: new Date().toISOString()
              };
              setFavoriteLists([defaultList]);
              currentActiveListId = defaultListId;
              setActiveListId(currentActiveListId);
            }
          } catch (error) {
            // Error creating default list
          }
        }
        
        // Filter favorites by active list if one is selected
        let favoritesToLoad = favorites;
        if (currentActiveListId) {
          favoritesToLoad = favorites.filter((f: any) => f.favorite_list_id === currentActiveListId);
        }

        // Get ALL item IDs from filtered favorites
        const allItemIds = favoritesToLoad.map((f: any) => f.item_id);

        setFavoriteIds(allItemIds);
        
        if (allItemIds.length === 0) {
          setProducts([]);
          setLoading(false);
          return;
        }

        // Load products via API route (uses supabaseAdmin to bypass RLS)
        const productsResponse = await dashboardApiFetch('/api/user/favorites/products', {
            headers: {
          }
        });

        if (!productsResponse.ok) {
          setLoading(false);
          return;
        }

        const productsData = await productsResponse.json();
        const allProducts = productsData.products || [];

        // Filter products by active list if one is selected
        let uniqueProducts = allProducts;
        if (currentActiveListId) {
          const activeListItems = favorites
            .filter((f: any) => f.favorite_list_id === currentActiveListId)
            .map((f: any) => f.item_id);
          uniqueProducts = allProducts.filter((p: any) => 
            activeListItems.includes(p.id) || activeListItems.includes(p.slug)
          );
        }

        // Map to display format (same as /ro page)
        const mappedProducts = uniqueProducts.map((row: any) => {
                    const images = Array.isArray(row?.images)
                      ? row.images.filter((img: any) => typeof img === 'string')
                      : [];
          const mainImage = getProductDisplayImage({ images: row?.images, image: images[0], category: row?.category, subcategory: row?.subcategory, main_category: row?.main_category });
          
          const startingPrice = typeof row?.starting_price === 'number'
                        ? row.starting_price
                        : row?.starting_price_ron ?? 0;

                    const endTimeIso = row?.auction_date ?? row?.end_time ?? null;
                    const endTimeDate = endTimeIso
                      ? new Date(endTimeIso)
                      : new Date(Date.now() + 48 * 60 * 60 * 1000);
                    const timeLeftSeconds = Math.max(
                      0,
                      Math.floor((endTimeDate.getTime() - Date.now()) / 1000)
                    );

                    return {
            id: row?.id ?? '',
            slug: row?.slug ?? '',
                      title: row?.title ?? 'Produs',
                      description: row?.description ?? '',
                      currentBid: startingPrice,
                      startingBid: startingPrice,
                      timeLeft: formatTimeLeft(timeLeftSeconds),
                      timeLeftSeconds,
                      image: mainImage,
                      images: images.length > 0 ? images : [mainImage],
                      category: row?.category ?? 'diverse',
                      subcategory: row?.subcategory ?? 'diverse',
                      location: row?.auction_location ?? row?.address ?? row?.city ?? 'București',
                      year: row?.created_at ? new Date(row.created_at).getFullYear() : new Date().getFullYear(),
                      condition: row?.condition ?? 'Disponibil',
                      brand: typeof row?.brand === 'string' ? row.brand : undefined,
                      seller: row?.seller ?? 'Organizator licitație',
                      shipping: row?.shipping ?? 'Conform condițiilor licitației',
                      paymentMethods: Array.isArray(row?.payment_methods) ? row.payment_methods : ['Transfer bancar'],
                      returnPolicy: row?.return_policy ?? 'Conform regulamentului licitației',
                      warranty: row?.warranty ?? 'Nu se aplică',
                      saleType: row?.sale_type ?? 'vanzare-directa',
                      auctionDate: row?.auction_date ?? undefined,
                      createdAt: row?.created_at ?? undefined,
                      address: row?.address ?? undefined,
                      coordinates: row?.coordinates ?? undefined,
                      customFields: row?.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {},
                      productType: row?.product_type,
                      currency: row?.currency || 'RON',
                      startingPrice: startingPrice,
                      url: (() => {
                        if (row?.url) return row.url;
                        if (row?.slug) {
                          const productTypeRoutes: Record<string, string> = {
                            'licitatii-publice': 'licitatii-publice',
                            'live-bid': 'licitatii-live',
                            'buy-now': 'cumpara-acum',
                          };
                          const productType = row?.product_type || 'produse';
                          const route = productTypeRoutes[productType] || 'produse';
                          return `/${route}/${row.slug}`;
                        }
                        return `/products/${row.id}`;
                      })()
                    };
                  });
                  
                  setProducts(mappedProducts);
        
        // Load products for each list to display in list cards
        const listsWithProductsData = await Promise.all(
          favoriteListsData.map(async (list: any) => {
            const listFavorites = favorites.filter((f: any) => f.favorite_list_id === list.id);
            const listItemIds = listFavorites.map((f: any) => f.item_id);
            
            if (listItemIds.length === 0) {
              return { 
                list: {
                id: list.id,
                name: list.name,
                items: [],
                  createdAt: list.created_at,
                  description: list.description || undefined,
                  pin: list.pin || undefined,
                  isPrivate: list.is_private || !!list.pin
                }, 
                products: [] 
              };
            }
            
            try {
              const listProductsResponse = await dashboardApiFetch('/api/user/favorites/products', {
            headers: {
                }
              });
              
              if (listProductsResponse.ok) {
                const listProductsData = await listProductsResponse.json();
                const allListProducts = listProductsData.products || [];
                const listProducts = allListProducts.filter((p: any) => 
                  listItemIds.includes(p.id) || listItemIds.includes(p.slug)
                );
                
                return {
                  list: {
                    id: list.id,
                    name: list.name,
                    items: listItemIds,
                    createdAt: list.created_at,
                    description: list.description || undefined,
                    pin: list.pin || undefined,
                    isPrivate: list.is_private || !!list.pin
                  },
                  products: listProducts.slice(0, 3) // Only first 3 for preview
                };
          }
        } catch (error) {
              console.error('Error loading products for list:', error);
            }
            
            return { 
              list: {
                id: list.id,
                name: list.name,
                items: listItemIds,
                createdAt: list.created_at,
                pin: list.pin || undefined,
                isPrivate: list.is_private || !!list.pin
              }, 
              products: [] 
            };
          })
        );
        
        setListsWithProducts(listsWithProductsData);
      } catch (error: any) {
        // Error loading favorites
      } finally {
        setLoading(false);
      }
    };

    loadFavorites();
    
    // Load tokens and unlocked auctions
    const loadTokensAndUnlocked = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        // Load tokens
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          headers: {
          }
        });
        
        if (tokensResponse.ok) {
          const tokensData = await tokensResponse.json();
          if (!tokensData.error) {
            setUserTokens({
              balance: tokensData.balance || 0,
              totalEarned: tokensData.totalEarned || 0,
              totalSpent: tokensData.totalSpent || 0,
              level: tokensData.level || 'Basic',
              package: tokensData.package || 'Basic'
            });
          }
        }
        
        // Load unlocked auctions from localStorage
        if (typeof window !== 'undefined') {
          const savedUnlocked = localStorage.getItem('unlockedAuctions');
          if (savedUnlocked) {
            try {
              const unlocked = JSON.parse(savedUnlocked);
              setUnlockedAuctions(Array.isArray(unlocked) ? unlocked : []);
            } catch (e) {
              setUnlockedAuctions([]);
            }
          }
        }
      } catch (error) {
        console.error('Error loading tokens and unlocked auctions:', error);
      }
    };
    
    loadTokensAndUnlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload products when active list changes
  useEffect(() => {
    if (!activeListId) return;
    
    const reloadProductsForList = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Reload favorites to get updated list assignments
        const favoritesResponse = await dashboardApiFetch('/api/user/favorites', {
        headers: {
        }
      });

        if (!favoritesResponse.ok) return;

        const favoritesData = await favoritesResponse.json();
        const favorites = favoritesData.favorites || [];
        
        // Filter favorites by active list
        const favoritesToLoad = favorites.filter((f: any) => f.favorite_list_id === activeListId);
        const allItemIds = favoritesToLoad.map((f: any) => f.item_id);
        
        if (allItemIds.length === 0) {
          setProducts([]);
        return;
      }

        // Load products
        const productsResponse = await dashboardApiFetch('/api/user/favorites/products', {
        headers: {
        }
      });

        if (!productsResponse.ok) return;

        const productsData = await productsResponse.json();
        const allProducts = productsData.products || [];

        // Filter products by active list
        const activeListItems = favoritesToLoad.map((f: any) => f.item_id);
        const filteredProducts = allProducts.filter((p: any) => 
          activeListItems.includes(p.id) || activeListItems.includes(p.slug)
        );

        // Map to display format
        const mappedProducts = filteredProducts.map((row: any) => {
          const images = Array.isArray(row?.images)
            ? row.images.filter((img: any) => typeof img === 'string')
            : [];
          const mainImage = getProductDisplayImage({ images: row?.images, image: images[0], category: row?.category, subcategory: row?.subcategory, main_category: row?.main_category });
          
          const startingPrice = typeof row?.starting_price === 'number'
            ? row.starting_price
            : row?.starting_price_ron ?? 0;

          const endTimeIso = row?.auction_date ?? row?.end_time ?? null;
          const endTimeDate = endTimeIso
            ? new Date(endTimeIso)
            : new Date(Date.now() + 48 * 60 * 60 * 1000);
          const timeLeftSeconds = Math.max(
            0,
            Math.floor((endTimeDate.getTime() - Date.now()) / 1000)
          );

          return {
            id: row?.id ?? '',
            slug: row?.slug ?? '',
            title: row?.title ?? 'Produs',
            description: row?.description ?? '',
            currentBid: startingPrice,
            startingBid: startingPrice,
            timeLeft: formatTimeLeft(timeLeftSeconds),
            timeLeftSeconds,
            image: mainImage,
            images: images.length > 0 ? images : [mainImage],
            category: row?.category ?? 'diverse',
            subcategory: row?.subcategory ?? 'diverse',
            location: row?.auction_location ?? row?.address ?? row?.city ?? 'București',
            year: row?.created_at ? new Date(row.created_at).getFullYear() : new Date().getFullYear(),
            condition: row?.condition ?? 'Disponibil',
            brand: typeof row?.brand === 'string' ? row.brand : undefined,
            seller: row?.seller ?? 'Organizator licitație',
            shipping: row?.shipping ?? 'Conform condițiilor licitației',
            paymentMethods: Array.isArray(row?.payment_methods) ? row.payment_methods : ['Transfer bancar'],
            returnPolicy: row?.return_policy ?? 'Conform regulamentului licitației',
            warranty: row?.warranty ?? 'Nu se aplică',
            saleType: row?.sale_type ?? 'vanzare-directa',
            auctionDate: row?.auction_date ?? undefined,
            createdAt: row?.created_at ?? undefined,
            address: row?.address ?? undefined,
            coordinates: row?.coordinates ?? undefined,
            customFields: row?.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {},
            productType: row?.product_type,
            currency: row?.currency || 'RON',
            startingPrice: startingPrice,
            url: (() => {
              if (row?.url) return row.url;
              if (row?.slug) {
                const productTypeRoutes: Record<string, string> = {
                  'licitatii-publice': 'licitatii-publice',
                  'live-bid': 'licitatii-live',
                  'buy-now': 'cumpara-acum',
                };
                const productType = row?.product_type || 'produse';
                const route = productTypeRoutes[productType] || 'produse';
                return `/${route}/${row.slug}`;
              }
              return `/products/${row.id}`;
            })()
          };
        });

        setProducts(mappedProducts);
    } catch (error) {
        // Error reloading products for list
      }
    };

    reloadProductsForList();
  }, [activeListId]);

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      alert('Numele listei este obligatoriu!');
        return;
      }
      
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShowAuthModal(true);
        return;
      }

      const newListId = `list-${Date.now()}`;
      const response = await dashboardApiFetch('/api/user/favorite-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newListId,
          name: newListName.trim(),
          description: newListDescription.trim() || null,
          pin: newListPin.trim() || null,
          isDefault: false
        })
      });

      if (response.ok) {
        const newList: FavoriteList = {
          id: newListId,
          name: newListName.trim(),
          items: [],
          createdAt: new Date().toISOString()
        };
        setFavoriteLists([...favoriteLists, newList]);
        setActiveListId(newListId);
        setNewListName('');
        setNewListDescription('');
        setNewListPin('');
        setShowCreateListModal(false);
      } else {
        throw new Error('Failed to create list');
      }
    } catch (error) {
      alert('Eroare la crearea listei. Te rugăm să încerci din nou.');
    }
  };

  const handleRemoveFavorite = async (productId: string) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

      const response = await dashboardApiFetch('/api/user/favorites', {
        method: 'DELETE',
          headers: {
          'Content-Type': 'application/json',
          },
          body: JSON.stringify({
          item_id: productId,
          item_type: 'product'
          })
        });

      if (response.ok) {
        setProducts(products.filter(p => p.id !== productId));
        setFavoriteIds(favoriteIds.filter(id => id !== productId));
        // Update lists
        setFavoriteLists(favoriteLists.map(list => ({
          ...list,
          items: list.items.filter(id => id !== productId)
        })));
      }
      } catch (error) {
      // Error removing favorite
    }
  };

  const isAuctionUnlocked = (product: { id: string; saleType?: string; productType?: string }) => {
    if (!isLicitatiiPublice(product)) return true;
    return unlockedAuctions.includes(product.id);
  };

  const handleUnlockAuction = async (auctionId: string) => {
    if (userTokens.balance < 1) {
      alert('Nu ai suficienți tokens! Soldul tău: ' + userTokens.balance + ' tokens');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
      const userId = session?.user?.id || savedSupabaseUserId;
      
      if (!userId) {
        setShowAuthModal(true);
        return;
      }

      const newBalance = userTokens.balance - 1;
      const newTotalSpent = userTokens.totalSpent + 1;

      // Update tokens in Supabase
      const tokensResponse = await dashboardApiFetch('/api/tokens', {
        method: 'PUT',
        headers: {
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          balance: newBalance,
          totalEarned: userTokens.totalEarned,
          totalSpent: newTotalSpent,
          level: userTokens.level,
          package: userTokens.package
        })
      });

      if (!tokensResponse.ok) {
        throw new Error('Failed to update tokens');
      }

      // Add unlocked auction to Supabase
      const unlockedResponse = await dashboardApiFetch('/api/user/unlocked-auctions', {
        method: 'POST',
        headers: {
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auctionId
        })
      });

      if (!unlockedResponse.ok) {
        throw new Error('Failed to save unlocked auction');
      }

      // Update local state
      const updatedTokens = {
        ...userTokens,
        balance: newBalance,
        totalSpent: newTotalSpent
      };
      setUserTokens(updatedTokens);
      localStorage.setItem('userTokens', JSON.stringify(updatedTokens));

      const newUnlocked = [...unlockedAuctions, auctionId];
      setUnlockedAuctions(newUnlocked);
      localStorage.setItem('unlockedAuctions', JSON.stringify(newUnlocked));

      alert('Anunțul a fost deblocat cu succes! Ai cheltuit 1 token.');
    } catch (error) {
      console.error('Error unlocking auction:', error);
      alert('Eroare la deblocarea anunțului. Te rugăm să încerci din nou.');
    }
  };

  if (loading) {
  return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <UniversalHeader
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Se încarcă...</p>
        </div>
          </div>
        <DashboardFooter isDarkMode={isDarkMode} />
        </div>
    );
  }
      
  return (
    <div className={`min-h-screen flex flex-col relative ${isDarkMode ? 'bg-gray-900/30' : 'bg-gray-50/30'}`}>
      {/* Background Emblem */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.06] dark:opacity-[0.08] md:opacity-[0.04] md:dark:opacity-[0.05] pointer-events-none"
        style={{ backgroundImage: `url(${bgEmblem})` }}
      />

      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />

      {/* Panel Badge */}
      <div className="fixed top-20 right-2 md:top-24 md:right-4 z-0">
        <div className={`inline-flex items-center gap-1.5 md:gap-2 px-2 py-1 md:px-3 md:py-1.5 rounded-lg ${
          isDarkMode 
            ? 'bg-blue-600/20 border border-blue-500/30' 
            : 'bg-blue-50 border border-blue-200'
        }`}>
          <i className={`ri-shield-user-line text-xs md:text-sm ${
            isDarkMode ? 'text-blue-300' : 'text-blue-600'
          }`}></i>
          <span className={`text-[10px] md:text-xs font-medium ${
            isDarkMode ? 'text-blue-200' : 'text-blue-700'
          }`}>
            {basePath?.includes("lichidator") ? "Panel privat pentru lichidatori" : "Panel privat de executori"}
          </span>
        </div>
      </div>

      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4 flex-1 relative z-10">
        <div className="mb-6">
          <BackButton
            fallbackHref={basePath}
            label="Înapoi"
            className="shadow-md"
          />
        </div>
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
              <HeartIcon size="m" className="text-white" />
            </div>
            <div>
              <h2 className={`text-xl sm:text-2xl md:text-3xl font-bold mb-2 ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent' 
                  : 'text-gray-900'
              }`}>
                Panel favorite
              </h2>
            </div>
          </div>
        </div>

        <div className="mb-4 sm:mb-6">
          <p className={`text-xs sm:text-sm mb-3 sm:mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Creează colecții și liste personale și împărtășește-le cu alții.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 mb-4">
            <button className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
              isDarkMode 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'bg-orange-100 text-orange-600 border border-orange-200'
            }`}>
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Liste
            </button>
                      <button
              onClick={() => setShowCreateListModal(true)}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base whitespace-nowrap ${
                isDarkMode
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'bg-orange-500 hover:bg-orange-600 text-white'
              }`}
            >
              + Adaugă nouă
                      </button>
                  </div>
                </div>

        {viewMode === 'lists' ? (
          listsWithProducts.length === 0 ? (
          <div className="text-center py-8">
            <HeartIcon size="m" className={`mx-auto mb-2 ${isDarkMode ? 'text-gray-700' : 'text-gray-400'}`} />
            <h3 className={`text-lg font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Nu ai liste
            </h3>
            <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Creează prima ta listă pentru a organiza anunțurile favorite
            </p>
                <button
                  onClick={() => setShowCreateListModal(true)}
              className="inline-block px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              Creează Listă
                </button>
              </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {listsWithProducts.map(({ list, products: listProducts }) => {
              const totalItems = list.items.length;
              const previewProducts = listProducts.slice(0, 3);
              const remainingCount = totalItems > 3 ? totalItems - 3 : 0;
              
              return (
                <div
                  key={list.id}
                  className={`rounded-xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg ${
                    isDarkMode ? 'bg-gray-800' : 'bg-white'
                  }`}
                  onClick={() => {
                    // Check if list has PIN and is not unlocked
                    if ((list.pin || list.isPrivate) && !unlockedLists.has(list.id)) {
                      setListToUnlock(list.id);
                      setShowPinModal(true);
                    } else {
                      setActiveListId(list.id);
                      setViewMode('products');
                    }
                  }}
                >
                  <div className="flex items-center gap-2 sm:gap-4 p-2 sm:p-4">
                    {/* Product Preview Images - 3 images max - Clickable, propagates to parent */}
                    <div className="flex-shrink-0 flex gap-1 sm:gap-1.5">
                      {previewProducts.length > 0 ? (
                        <>
                          {previewProducts.map((product: any, idx: number) => {
                            const mainImage = getProductDisplayImage(product);
                            
                            return (
                              <div
                                key={idx}
                                className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 cursor-pointer"
                              >
                                <img
                                  src={mainImage}
                                  alt={product.title || 'Produs'}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = '/no-image-placeholder.svg';
                                  }}
                                />
            </div>
                            );
                          })}
                          {remainingCount > 0 && (
                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center font-bold text-orange-500 bg-gray-100 text-xs sm:text-sm cursor-pointer">
                              +{remainingCount}
          </div>
        )}
                        </>
                      ) : (
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center bg-gray-200">
                          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
          </div>
        )}
                    </div>

                    {/* List Info - Clickable area, click propagates to parent card */}
                    <div className="flex-1 min-w-0 cursor-pointer">
                      <h3 className={`text-sm sm:text-base font-semibold mb-0.5 ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        {list.name}
                      </h3>
                      {list.description && (
                        <p className={`text-xs mb-1 line-clamp-1 sm:line-clamp-none ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          {list.description}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex-shrink-0 flex items-center gap-0.5 sm:gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* Lock/Unlock */}
                  <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setListToSetPin(list.id);
                          setShowSetPinModal(true);
                        }}
                        className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                          list.pin || list.isPrivate
                            ? 'bg-gray-100 hover:bg-gray-200 text-orange-500'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-400'
                        }`}
                        title={list.pin || list.isPrivate ? "Listă protejată cu PIN" : "Listă publică - Click pentru a seta PIN"}
                      >
                        {list.pin || list.isPrivate ? (
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                          </svg>
                        )}
                  </button>
                      
                      {/* Edit */}
                  <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setListToEdit(list.id);
                          setEditListName(list.name);
                          setEditListDescription(list.description || '');
                          setShowEditModal(true);
                        }}
                        className="p-1.5 sm:p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-orange-500 transition-colors"
                        title="Editează listă"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                  </button>
                      
                      {/* View */}
                      <button
                        onClick={() => {
                          setActiveListId(list.id);
                          setViewMode('products');
                        }}
                        className="p-1.5 sm:p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-orange-500 transition-colors"
                        title="Vezi listă"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                      </button>
                      
                      {/* Delete */}
                        <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setListToDelete(list.id);
                          setShowDeleteModal(true);
                        }}
                        className="p-1.5 sm:p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-orange-500 transition-colors"
                        title="Șterge listă"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        </button>
                      
                      {/* Share */}
                            <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentList = favoriteLists.find(l => l.id === list.id);
                          if (currentList) {
                            const shareUrl = `${window.location.origin}${basePath}/favorites?list=${list.id}`;
                            setShareLink(shareUrl);
                            setListToShare(list.id);
                            setShowShareModal(true);
                          }
                        }}
                        className="p-1.5 sm:p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-orange-500 transition-colors"
                        title="Partajează listă"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.885 12.938 9 12.482 9 12c0-.482-.115-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                            </button>
                          </div>
                        </div>
                      </div>
              );
            })}
                          </div>
        )
        ) : (
          // Products view when a list is selected
          activeListId ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                          <button
                            onClick={() => {
                    setActiveListId(null);
                    setViewMode('lists');
                            }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                              isDarkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                      : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-300'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Înapoi la liste
                          </button>
                <h2 className={`text-lg font-semibold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {favoriteLists.find(l => l.id === activeListId)?.name || 'Listă'}
                </h2>
                        </div>
              {products.length === 0 ? (
                <div className="text-center py-8">
                  <HeartIcon size="m" className={`mx-auto mb-2 ${isDarkMode ? 'text-gray-700' : 'text-gray-400'}`} />
                  <h3 className={`text-lg font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Lista este goală
                  </h3>
                  <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Nu există produse în această listă
                  </p>
                    </div>
              ) : (
                <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 px-1 md:px-0`}>
                {products.map((product) => (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => { window.location.href = product.url || `/products/${product.id}`; }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.href = product.url || `/products/${product.id}`; } }}
                    className={`group backdrop-blur-sm rounded-xl shadow-lg overflow-hidden transition-all duration-300 border hover:shadow-xl hover:scale-105 cursor-pointer ${
                    isDarkMode 
                      ? 'bg-white/5 border-white/10' 
                      : 'bg-white/30 border-gray-200/50'
                    }`}
                  >
                    {/* Image */}
                    <div className={`relative h-32 md:h-40 overflow-hidden flex-shrink-0 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      <div className="h-full w-full bg-cover bg-center" style={{backgroundImage: `url(${getProductDisplayImage(product)})`}}></div>
                      {/* Badge-uri (stânga sus): marcă piese auto + Detalii / Exclusiv */}
                      {(() => {
                        const showMarca =
                          isPieseAutoListingProduct(product) &&
                          getMarcaFromListing(product).length > 0;
                        const showType =
                          product.productType === "details-only" || isLicitatiiPublice(product);
                        if (!showMarca && !showType) return null;
                        return (
                          <div className="absolute top-0.5 left-0.5 z-10 flex flex-col gap-0.5">
                            <PieseAutoMarcaInlineSpan listing={product} />
                            {product.productType === "details-only" && (
                              <span className="inline-flex items-center gap-0.5 px-0.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/80 text-white backdrop-blur-sm shadow">
                                <i className="ri-information-line text-[10px]"></i>
                                Detalii
                              </span>
                            )}
                            {isLicitatiiPublice(product) && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-extrabold tracking-wide text-white shadow border border-blue-300/40 bg-gradient-to-r from-blue-600 via-blue-600 to-sky-500">
                                <i className="text-[10px] ri-shield-star-line"></i>
                                Exclusiv
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <div className="absolute top-0.5 right-0.5 flex space-x-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFavorite(product.id);
                          }}
                          className={`gobid-heart-bounce p-0.5 rounded-full transition-all duration-300 shadow hover:shadow-md ${
                            true // isFavorite - întotdeauna true în favorites
                              ? 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600'
                              : (isDarkMode
                                  ? 'bg-white/30 backdrop-blur-md text-red-300 hover:bg-white/40 ring-1 ring-white/20'
                                  : 'bg-white/85 backdrop-blur-md text-red-600 hover:bg-white ring-1 ring-black/10')
                          }`}
                          title="Elimină din favorite"
                        >
                          <HeartIcon
                            size="s"
                            className="text-white fill-white"
                            strokeWidth={1.75}
                          />
                        </button>
                        {isLicitatiiPublice(product) && (
                          <div className={`px-0.5 py-0.5 rounded shadow border flex items-center justify-center ${
                            isAuctionUnlocked(product)
                              ? 'bg-gradient-to-r from-green-600 to-green-500 text-white border-green-400' 
                              : 'bg-gradient-to-r from-red-600 to-red-500 text-white border-red-400'
                          }`}>
                            {isAuctionUnlocked(product) ? (
                              <LockClosedIcon size="s" className="text-white" strokeWidth={2} />
                            ) : (
                              <LockClosedIcon size="s" className="text-white" strokeWidth={2} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className={`p-2`}>
                      <div className="mb-1">
                        <h3 
                          className={`text-xs md:text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-black'} line-clamp-2 group-hover:text-yellow-500 group-focus:text-yellow-500 group-active:text-yellow-500 leading-tight`} 
                          title={product.title}
                        >
                          {product.title}
                        </h3>
                        {/* Tip: Licitație publică sau Nou/Uzat (anunțuri useri privați) */}
                        {(product.saleType || product.condition) && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {isLicitatiiPublice(product) ? (
                              <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium ${
                                isDarkMode
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-blue-500/20 text-blue-800 border border-blue-500/30'
                              }`}>
                                <i className="text-[10px] ri-auction-line"></i>
                                Licitație Publică
                              </span>
                            ) : (
                              <ProductConditionBadge
                                kind={isConditionNew(product.condition) ? "nou" : "uzat"}
                                isDarkMode={isDarkMode}
                                showIcon
                                size="compact"
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Always visible content */}
                      <div className={`mb-1 block`}>
                        <div className="flex items-center gap-1">
                          {isLicitatiiPublice(product) && (
                            <span className={`text-[10px] transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Oferta:</span>
                          )}
                          <span className={`text-xs md:text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {formatNumber(product.currentBid || product.startingBid || 0)} {product.currency || 'RON'}
                          </span>
                        </div>
                        {isLicitatiiPublice(product) && product.timeLeft && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[10px] transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Timp:</span>
                            <span 
                              suppressHydrationWarning
                              className={`text-xs md:text-sm font-semibold transition-colors ${
                                (product.timeLeftSeconds <= 0 || product.timeLeft === 'Terminat' || product.timeLeft === 'Licitația s-a încheiat')
                                  ? 'text-red-600'
                                  : isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {(product.timeLeftSeconds <= 0 || product.timeLeft === 'Terminat') ? 'Licitația s-a încheiat' : product.timeLeft}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Blurred + Deblochează doar pentru licitații publice; anunțuri useri privați mereu deblocate */}
                      {isLicitatiiPublice(product) && !isAuctionUnlocked(product) ? (
                        <div className="mb-1 space-y-1">
                          {/* 1 Token + Deblochează */}
                          <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center space-x-0.5">
                              <CoinsIcon size="s" className="text-yellow-500" />
                              <span className={`text-[10px] font-medium ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>1 Token</span>
                            </div>
                            <button
                              onClick={(e) => { 
                                e.preventDefault();
                                e.stopPropagation();
                                handleUnlockAuction(product.id);
                              }}
                              className="px-1.5 py-0.5 bg-yellow-500 text-white rounded text-[10px] font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={userTokens.balance < 1}
                            >
                              Deblochează
                            </button>
                          </div>
                          {/* Locație deblocată – doar orașul */}
                          {product.location && (
                            <div className="flex items-center space-x-0.5">
                              <LocationIcon size="s" className="text-gray-500" />
                              <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{getDisplayCity(product.location) || product.location}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Unlocked content - Essential details */
                        <div className="space-y-0.5">
                          {!isLicitatiiPublice(product) && product.location && (
                            <div className="flex items-center space-x-0.5">
                              <LocationIcon size="s" className="text-gray-500" />
                              <span className={`text-[10px] transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{getDisplayCity(product.location) || product.location}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Publicat – jos de tot, dreapta; doar la useri (anunțuri normale) */}
                      {(() => {
                        // Verifică dacă este anunț normal (nu licitație publică)
                        const isNormalProduct = !isLicitatiiPublice(product);
                        if (!isNormalProduct) return null;
                        
                        // Încearcă să găsească data de publicare
                        const publishedAt = product.createdAt || product.auctionDate || (product as any).created_at;
                        
                        // Dacă nu există dată, folosește data curentă ca fallback (pentru test)
                        // În producție, poți elimina acest fallback
                        const dateToUse = publishedAt || new Date().toISOString();
                        
                        const formattedDate = formatDate(dateToUse);
                        if (!formattedDate) return null;
                        
                        return (
                          <div className="mt-1 flex justify-end">
                            <span className={`text-[10px] transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              Publicat: {formattedDate}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Selectează o listă pentru a vedea produsele
              </p>
                              </div>
          )
        )}
                          </div>

      {/* Create List Modal */}
      {showCreateListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`w-full max-w-md mx-4 p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h2 className={`text-lg font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Creează listă nouă
            </h2>
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Numele listei *"
              className={`w-full px-3 py-2 text-sm rounded-lg border mb-3 ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateList();
                }
              }}
            />
            <textarea
              value={newListDescription}
              onChange={(e) => setNewListDescription(e.target.value)}
              placeholder="Descrierea listei (opțional)"
              rows={3}
              className={`w-full px-3 py-2 text-sm rounded-lg border mb-3 ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <input
              type="password"
              value={newListPin}
              onChange={(e) => setNewListPin(e.target.value)}
              placeholder="PIN (opțional - 4-6 cifre, lasă gol pentru listă publică)"
              maxLength={6}
              className={`w-full px-3 py-2 text-sm rounded-lg border mb-3 ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <div className="flex gap-2">
                              <button 
                onClick={handleCreateList}
                className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                              >
                Creează
                              </button>
                          <button
                            onClick={() => {
                  setShowCreateListModal(false);
                  setNewListName('');
                  setNewListDescription('');
                  setNewListPin('');
              }}
                className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                              isDarkMode
                  ? 'bg-gray-700 text-white hover:bg-gray-600' 
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                            }`}
                          >
              Anulează
                          </button>
                        </div>
                    </div>
          </div>
        )}

      {/* Edit List Modal */}
      {showEditModal && listToEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`w-full max-w-md mx-4 p-6 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h2 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Editează listă
            </h2>
            <input
              type="text"
              value={editListName}
              onChange={(e) => setEditListName(e.target.value)}
              placeholder="Numele listei *"
              className={`w-full px-3 py-2 text-sm rounded-lg border mb-3 ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <textarea
              value={editListDescription}
              onChange={(e) => setEditListDescription(e.target.value)}
              placeholder="Descrierea listei (opțional)"
              rows={3}
              className={`w-full px-3 py-2 text-sm rounded-lg border mb-4 ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!editListName.trim()) {
                    alert('Numele listei este obligatoriu!');
                    return;
                  }
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                      const requestBody = {
                        id: listToEdit,
                        name: editListName.trim(),
                        description: editListDescription.trim() || null
                      };
                      
                      console.log('Updating list with:', requestBody);
                      
                      const response = await dashboardApiFetch('/api/user/favorite-lists', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestBody)
                      });
                      
                      console.log('Response status:', response.status, response.statusText);
                      
                      let responseData = null;
                      let responseText = '';
                      
                      try {
                        responseText = await response.text();
                        console.log('Response text length:', responseText.length);
                        console.log('Response text:', responseText.substring(0, 200)); // First 200 chars
                        
                        if (responseText && responseText.trim()) {
                          try {
                            responseData = JSON.parse(responseText);
                            console.log('Parsed response data type:', typeof responseData);
                            console.log('Parsed response data keys:', responseData ? Object.keys(responseData) : 'null');
                            console.log('Parsed response data:', responseData);
                          } catch (e) {
                            console.error('Failed to parse response as JSON:', e);
                            responseData = { error: responseText || 'Empty response' };
                          }
                        } else {
                          console.warn('Response text is empty or whitespace');
                          responseData = null;
                        }
                      } catch (e) {
                        console.error('Error reading response:', e);
                        responseData = { error: 'Failed to read response' };
                      }
                      
                      // Check if response is OK (status 200-299)
                      const isSuccess = response.status >= 200 && response.status < 300;
                      
                      console.log('Response status:', response.status, 'Is success:', isSuccess);
                      console.log('Response data:', responseData);
                      
                      // If status is 200-299, consider it successful
                      if (isSuccess) {
                        // Update was successful
                        console.log('Update successful');
                        const updatedName = editListName.trim();
                        const updatedDescription = editListDescription.trim() || undefined;
                        
                        // Update local state
                        setFavoriteLists(favoriteLists.map(l => 
                          l.id === listToEdit 
                            ? { ...l, name: updatedName, description: updatedDescription }
                            : l
                        ));
                        setListsWithProducts(listsWithProducts.map(l => 
                          l.list.id === listToEdit
                            ? { ...l, list: { ...l.list, name: updatedName, description: updatedDescription } }
                            : l
                        ));
                        setShowEditModal(false);
                        setEditListName('');
                        setEditListDescription('');
                        setListToEdit(null);
                      } else {
                        // Response is not OK
                        const errorMessage = (responseData && typeof responseData === 'object' && 'error' in responseData) 
                          ? (responseData.error || responseData.details || 'Unknown error')
                          : (responseText || `HTTP ${response.status}: ${response.statusText}`);
                        
                        console.error('Error updating list:', {
                          status: response.status,
                          statusText: response.statusText,
                          responseText: responseText,
                          responseData: responseData
                        });
                        alert(`Eroare la actualizarea listei: ${errorMessage}`);
                      }
                    }
                  } catch (error) {
                    console.error('Error updating list:', error);
                    alert('Eroare la actualizarea listei');
                  }
                }}
                className="flex-1 px-3 py-2 text-sm bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
              >
                Salvează
              </button>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditListName('');
                  setEditListDescription('');
                  setListToEdit(null);
                }}
                className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                  isDarkMode 
                    ? 'bg-gray-700 text-white hover:bg-gray-600' 
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                }`}
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && listToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`w-full max-w-md mx-4 p-6 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h2 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Șterge listă
            </h2>
            <p className={`text-sm mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Ești sigur că vrei să ștergi această listă? Această acțiune nu poate fi anulată.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                      const response = await dashboardApiFetch(`/api/user/favorite-lists?listId=${listToDelete}`, {
                        method: 'DELETE',
                        headers: {
                        }
                      });
                      if (response.ok) {
                        setFavoriteLists(favoriteLists.filter(l => l.id !== listToDelete));
                        setListsWithProducts(listsWithProducts.filter(l => l.list.id !== listToDelete));
                        if (activeListId === listToDelete) {
                          setActiveListId(null);
                          setViewMode('lists');
                        }
                        setShowDeleteModal(false);
                        setListToDelete(null);
                      } else {
                        alert('Eroare la ștergerea listei');
                      }
                    }
                  } catch (error) {
                    console.error('Error deleting list:', error);
                    alert('Eroare la ștergerea listei');
                  }
                }}
                className="flex-1 px-3 py-2 text-sm bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Șterge
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setListToDelete(null);
                }}
                className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                  isDarkMode 
                    ? 'bg-gray-700 text-white hover:bg-gray-600' 
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                }`}
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share List Modal */}
      {showShareModal && listToShare && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`w-full max-w-md mx-4 p-6 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h2 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Partajează listă
            </h2>
            <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Copiază linkul de mai jos pentru a partaja această listă cu alții:
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={shareLink}
                readOnly
                className={`flex-1 px-3 py-2 text-sm rounded-lg border ${
                      isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-gray-100 border-gray-300 text-gray-900'
                }`}
              />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch (error) {
                    console.error('Failed to copy:', error);
                    // Fallback: select text
                    const input = document.createElement('input');
                    input.value = shareLink;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {copied ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copiat!
                      </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copiază
                  </span>
                )}
                  </button>
            </div>
            <div className="flex gap-2">
            <button
              onClick={() => {
                  setShowShareModal(false);
                  setShareLink('');
                  setListToShare(null);
                  setCopied(false);
                }}
                className={`flex-1 px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                isDarkMode 
                  ? 'bg-gray-700 text-white hover:bg-gray-600' 
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
                Închide
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        isDarkMode={isDarkMode}
      />

      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}


