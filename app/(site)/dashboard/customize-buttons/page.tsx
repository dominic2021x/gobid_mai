"use client";

import { useEffect, useState } from "react";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  SearchIcon,
  CoinsIcon,
  SettingsIcon,
  CreditCardIcon,
  HeartIcon,
  SupportIcon
} from "@/components/HeroIcons";

interface CustomButton {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  isDefault?: boolean;
}

const ALL_BUTTONS: CustomButton[] = [
  {
    id: "my-products",
    label: "Produsele mele",
    url: "/dashboard/my-products",
    icon: "ri-box-3-line",
    color: "orange",
    isDefault: true
  },
  {
    id: "search",
    label: "Caută licitații",
    url: "/ro",
    icon: "ri-search-line",
    color: "blue",
    isDefault: true
  },
  {
    id: "tokens",
    label: "Token-uri",
    url: "/dashboard/tokens",
    icon: "ri-coins-line",
    color: "yellow",
    isDefault: true
  },
  {
    id: "settings",
    label: "Setări",
    url: "/dashboard/settings",
    icon: "ri-settings-3-line",
    color: "blue",
    isDefault: true
  },
  {
    id: "payments",
    label: "Plăți",
    url: "/dashboard/payments",
    icon: "ri-bank-card-line",
    color: "green",
    isDefault: true
  },
  {
    id: "favorites",
    label: "Favorite",
    url: "/dashboard/favorites",
    icon: "ri-heart-line",
    color: "red",
    isDefault: true
  },
  {
    id: "my-bids",
    label: "Ofertele mele",
    url: "/dashboard/ofertele_mele",
    icon: "ri-auction-line",
    color: "cyan",
    isDefault: true
  },
  {
    id: "support",
    label: "Suport",
    url: "/dashboard/support",
    icon: "ri-customer-service-2-line",
    color: "teal",
    isDefault: true
  },
  {
    id: "watchlist",
    label: "Watchlist",
    url: "/dashboard/watchlist",
    icon: "ri-bookmark-line",
    color: "pink",
    isDefault: false
  },
  {
    id: "history",
    label: "Istoric",
    url: "/dashboard/history",
    icon: "ri-history-line",
    color: "gray",
    isDefault: false
  },
  {
    id: "notifications",
    label: "Notificări",
    url: "/dashboard/notifications",
    icon: "ri-notification-line",
    color: "yellow",
    isDefault: false
  }
];

const COLOR_OPTIONS = [
  { value: "orange", label: "Portocaliu" },
  { value: "blue", label: "Albastru" },
  { value: "yellow", label: "Galben" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Verde" },
  { value: "red", label: "Roșu" },
  { value: "teal", label: "Teal" },
  { value: "blue", label: "Mov" },
  { value: "pink", label: "Roz" },
  { value: "gray", label: "Gri" }
];

export default function CustomizeButtonsPage() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeButtons, setActiveButtons] = useState<CustomButton[]>([]);
  const [availableButtons, setAvailableButtons] = useState<CustomButton[]>([]);
  const [draggedButton, setDraggedButton] = useState<CustomButton | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [shiftDirection, setShiftDirection] = useState<'left' | 'right' | null>(null);
  const [draggedFromActive, setDraggedFromActive] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newButton, setNewButton] = useState<Partial<CustomButton>>({
    label: "",
    url: "",
    icon: "ri-link",
    color: "blue"
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const saved = localStorage.getItem('darkMode');
    const initialDarkMode = saved === 'true';
    setIsDarkMode(initialDarkMode);
    
    const htmlElement = document.documentElement;
    if (initialDarkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }

    // Load user session and buttons from database
    const loadUserButtons = async () => {
      try {
        setIsLoading(true);
        
        // Get current user
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Error getting session:', sessionError);
          loadFromLocalStorage();
          return;
        }

        const user = sessionData?.session?.user;
        if (!user) {
          loadFromLocalStorage();
          return;
        }

        setCurrentUserId(user.id);

        // Load buttons from database - use user_custom_buttons table
        const { data: buttonData, error: buttonError } = await supabase
          .from('user_custom_buttons')
          .select('button_config')
          .eq('user_id', user.id)
          .maybeSingle();

        if (buttonError) {
          // PGRST116 = no rows returned (table might not exist or no data)
          // PGRST205 = table not found in schema cache (table doesn't exist)
          // Pentru utilizatori noi, este normal să nu existe înregistrări sau tabelul să nu existe
          // Verificăm dacă eroarea este goală sau nu are cod (ceea ce înseamnă "no rows found")
          if (buttonError.code === 'PGRST116' || buttonError.code === 'PGRST205' || !buttonError.code || Object.keys(buttonError).length === 0) {
            // No data found or table doesn't exist, use default buttons (normal pentru utilizatori noi)
            // Nu logăm nimic pentru aceste erori normale
            loadFromLocalStorage();
            return;
          }
          
          // Eroare reală (nu doar "no rows found" sau "table not found")
          console.error('Error loading buttons from database:', {
            code: buttonError.code,
            message: buttonError.message,
            details: buttonError.details,
            hint: buttonError.hint
          });
          loadFromLocalStorage();
          return;
        }

        let active: CustomButton[] = [];
        
        if (buttonData && buttonData.button_config) {
          try {
            // button_config is already a JSON object, no need to parse
            active = Array.isArray(buttonData.button_config) 
              ? buttonData.button_config 
              : JSON.parse(JSON.stringify(buttonData.button_config));
          } catch (e) {
            console.error('Error parsing button config:', e);
            // Fallback to default buttons
            active = ALL_BUTTONS.filter(b => b.isDefault);
          }
        } else {
          // No saved buttons, use default buttons
          active = ALL_BUTTONS.filter(b => b.isDefault);
        }

        setActiveButtons(active);
        const activeIds = new Set(active.map(b => b.id));
        const available = ALL_BUTTONS.filter(b => !activeIds.has(b.id));
        const customButtons = active.filter(b => !ALL_BUTTONS.find(ab => ab.id === b.id));
        available.push(...customButtons);
        setAvailableButtons(available);
        
        // Also save to localStorage as backup
        localStorage.setItem('user_custom_buttons', JSON.stringify(active));
      } catch (error) {
        console.error('Error loading buttons:', error);
        loadFromLocalStorage();
      } finally {
        setIsLoading(false);
      }
    };

    const loadFromLocalStorage = () => {
      const savedButtons = localStorage.getItem('user_custom_buttons');
      if (savedButtons) {
        try {
          const buttons = JSON.parse(savedButtons);
          setActiveButtons(buttons);
          const activeIds = new Set(buttons.map((b: CustomButton) => b.id));
          const available = ALL_BUTTONS.filter(b => !activeIds.has(b.id));
          const customButtons = buttons.filter((b: CustomButton) => !ALL_BUTTONS.find(ab => ab.id === b.id));
          available.push(...customButtons);
          setAvailableButtons(available);
        } catch (e) {
          setActiveButtons(ALL_BUTTONS.filter(b => b.isDefault));
          setAvailableButtons(ALL_BUTTONS.filter(b => !b.isDefault));
        }
      } else {
        setActiveButtons(ALL_BUTTONS.filter(b => b.isDefault));
        setAvailableButtons(ALL_BUTTONS.filter(b => !b.isDefault));
      }
      setIsLoading(false);
    };

    loadUserButtons();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const htmlElement = document.documentElement;
    if (isDarkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
    
    const htmlElement = document.documentElement;
    if (newMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
  };

  const saveButtons = async (active: CustomButton[]) => {
    setActiveButtons(active);
    
    // Also save to localStorage as backup
    localStorage.setItem('user_custom_buttons', JSON.stringify(active));
    
    // Update available buttons
    const activeIds = new Set(active.map(b => b.id));
    const available = ALL_BUTTONS.filter(b => !activeIds.has(b.id));
    const customButtons = active.filter(b => !ALL_BUTTONS.find(ab => ab.id === b.id));
    available.push(...customButtons);
    setAvailableButtons(available);

    // Save to database if user is logged in
    if (currentUserId) {
      try {
        const { error } = await supabase
          .from('user_custom_buttons')
          .upsert({
            user_id: currentUserId,
            button_config: active,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });

        if (error) {
          console.error('Error saving buttons to database:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          });
          // Continue anyway, localStorage is already saved
        } else {
          // Notify other components that buttons were updated
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('userButtonsUpdated'));
          }
        }
      } catch (error: any) {
        console.error('Error saving buttons:', error);
        // Continue anyway, localStorage is already saved
      }
    } else {
      // Even if not logged in, dispatch event for localStorage sync
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('userButtonsUpdated'));
      }
    }
  };

  const handleDragStart = (button: CustomButton, index: number, fromActive: boolean) => {
    setDraggedButton(button);
    setDraggedIndex(index);
    setDraggedFromActive(fromActive);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDropTargetIndex(index);
    
    // Calculate shift direction based on drag position
    if (draggedIndex !== null && draggedIndex !== index) {
      if (draggedIndex > index) {
        // Dragging from right to left, target should shift right
        setShiftDirection('right');
      } else {
        // Dragging from left to right, target should shift left
        setShiftDirection('left');
      }
    } else {
      setShiftDirection(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number, toActive: boolean) => {
    e.preventDefault();
    
    if (!draggedButton || draggedIndex === null) return;

    const newActive = [...activeButtons];
    const newAvailable = [...availableButtons];

    if (draggedFromActive && toActive) {
      // Moving within active buttons - implement shift logic
      if (draggedIndex !== targetIndex) {
        // Remove the dragged button from its original position
        const [removedButton] = newActive.splice(draggedIndex, 1);
        
        // Insert it at the target position
        // This automatically shifts the button at targetIndex to make room
        newActive.splice(targetIndex, 0, removedButton);
        
        saveButtons(newActive);
      }
    } else if (!draggedFromActive && toActive) {
      // Moving from available to active
      newAvailable.splice(draggedIndex, 1);
      newActive.splice(targetIndex, 0, draggedButton);
      saveButtons(newActive);
      setAvailableButtons(newAvailable);
    } else if (draggedFromActive && !toActive) {
      // Moving from active to available
      newActive.splice(draggedIndex, 1);
      newAvailable.splice(targetIndex, 0, draggedButton);
      saveButtons(newActive);
      setAvailableButtons(newAvailable);
    } else {
      // Moving within available buttons
      if (draggedIndex !== targetIndex) {
        const [removedButton] = newAvailable.splice(draggedIndex, 1);
        newAvailable.splice(targetIndex, 0, removedButton);
        setAvailableButtons(newAvailable);
      }
    }

    setDraggedButton(null);
    setDraggedIndex(null);
    setDropTargetIndex(null);
    setShiftDirection(null);
    setDraggedFromActive(false);
  };

  const handleRemove = (index: number) => {
    const button = activeButtons[index];
    const newActive = activeButtons.filter((_, i) => i !== index);
    saveButtons(newActive);
    
    // Add back to available if it's a default button
    if (ALL_BUTTONS.find(b => b.id === button.id)) {
      setAvailableButtons([...availableButtons, button]);
    }
  };

  const handleAdd = () => {
    if (!newButton.label || !newButton.url) {
      alert('Te rugăm să completezi toate câmpurile obligatorii.');
      return;
    }

    const button: CustomButton = {
      id: `custom-${Date.now()}`,
      label: newButton.label!,
      url: newButton.url!,
      icon: newButton.icon || 'ri-link',
      color: newButton.color || 'blue'
    };

    saveButtons([...activeButtons, button]);
    setNewButton({ label: "", url: "", icon: "ri-link", color: "blue" });
    setShowAddModal(false);
  };

  const getColorClass = (color: string) => {
    const colorMap: Record<string, { light: string; dark: string }> = {
      orange: { light: "bg-orange-500 hover:bg-orange-600", dark: "bg-orange-600 hover:bg-orange-700" },
      blue: { light: "bg-blue-500 hover:bg-blue-600", dark: "bg-blue-600 hover:bg-blue-700" },
      yellow: { light: "bg-yellow-500 hover:bg-yellow-600", dark: "bg-yellow-600 hover:bg-yellow-700" },
      green: { light: "bg-green-500 hover:bg-green-600", dark: "bg-green-600 hover:bg-green-700" },
      red: { light: "bg-red-500 hover:bg-red-600", dark: "bg-red-600 hover:bg-red-700" },
      teal: { light: "bg-teal-500 hover:bg-teal-600", dark: "bg-teal-600 hover:bg-teal-700" },
      pink: { light: "bg-pink-500 hover:bg-pink-600", dark: "bg-pink-600 hover:bg-pink-700" },
      gray: { light: "bg-gray-500 hover:bg-gray-600", dark: "bg-gray-600 hover:bg-gray-700" },
      cyan: { light: "bg-cyan-500 hover:bg-cyan-600", dark: "bg-cyan-600 hover:bg-cyan-700" }
    };
    return isDarkMode ? colorMap[color]?.dark || colorMap.blue.dark : colorMap[color]?.light || colorMap.blue.light;
  };

  const getGradientClass = (color: string) => {
    const gradientMap: Record<string, { light: string; dark: string }> = {
      orange: { light: "bg-gradient-to-r from-orange-500 via-orange-500 to-orange-500 hover:from-orange-600 hover:via-orange-600 hover:to-orange-600", dark: "bg-gradient-to-r from-orange-600 via-orange-600 to-orange-600 hover:from-orange-700 hover:via-orange-700 hover:to-orange-700" },
      blue: { light: "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600", dark: "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" },
      yellow: { light: "bg-gradient-to-r from-yellow-500 via-yellow-500 to-yellow-500 hover:from-yellow-600 hover:via-yellow-600 hover:to-yellow-600", dark: "bg-gradient-to-r from-yellow-600 via-yellow-600 to-yellow-600 hover:from-yellow-700 hover:via-yellow-700 hover:to-yellow-700" },
      green: { light: "bg-gradient-to-r from-green-500 via-green-500 to-green-500 hover:from-green-600 hover:via-green-600 hover:to-green-600", dark: "bg-gradient-to-r from-green-600 via-green-600 to-green-600 hover:from-green-700 hover:via-green-700 hover:to-green-700" },
      red: { light: "bg-gradient-to-r from-red-500 via-red-500 to-red-500 hover:from-red-600 hover:via-red-600 hover:to-red-600", dark: "bg-gradient-to-r from-red-600 via-red-600 to-red-600 hover:from-red-700 hover:via-red-700 hover:to-red-700" },
      teal: { light: "bg-gradient-to-r from-teal-500 via-teal-500 to-teal-500 hover:from-teal-600 hover:via-teal-600 hover:to-teal-600", dark: "bg-gradient-to-r from-teal-600 via-teal-600 to-teal-600 hover:from-teal-700 hover:via-teal-700 hover:to-teal-700" },
      pink: { light: "bg-gradient-to-r from-pink-500 via-pink-500 to-pink-500 hover:from-pink-600 hover:via-pink-600 hover:to-pink-600", dark: "bg-gradient-to-r from-pink-600 via-pink-600 to-pink-600 hover:from-pink-700 hover:via-pink-700 hover:to-pink-700" },
      gray: { light: "bg-gradient-to-r from-gray-500 via-gray-500 to-gray-500 hover:from-gray-600 hover:via-gray-600 hover:to-gray-600", dark: "bg-gradient-to-r from-gray-600 via-gray-600 to-gray-600 hover:from-gray-700 hover:via-gray-700 hover:to-gray-700" },
      cyan: { light: "bg-gradient-to-r from-cyan-500 via-cyan-500 to-cyan-500 hover:from-cyan-600 hover:via-cyan-600 hover:to-cyan-600", dark: "bg-gradient-to-r from-cyan-600 via-cyan-600 to-cyan-600 hover:from-cyan-700 hover:via-cyan-700 hover:to-cyan-700" }
    };
    return isDarkMode ? gradientMap[color]?.dark || gradientMap.blue.dark : gradientMap[color]?.light || gradientMap.blue.light;
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className={`animate-spin rounded-full h-12 w-12 border-b-2 mx-auto ${
              isDarkMode ? 'border-white' : 'border-gray-900'
            }`}></div>
            <p className={`mt-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Se încarcă...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="mb-4">
            <BackButton fallbackHref="/dashboard" label="Înapoi" className="shadow-md" />
          </div>
          
          <h1 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Personalizează Acțiunile Rapide
          </h1>
          <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
            Trage și plasează butoanele pentru a le reordona sau elimină-le. Poți adăuga și butoane personalizate.
          </p>
        </div>

        {/* Active Buttons Section */}
        <section className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-6 shadow-lg mb-6`}>
          <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Butoane Active
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {activeButtons.map((button, index) => (
              <div
                key={button.id}
                draggable
                onDragStart={() => handleDragStart(button, index, true)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedFromActive) {
                    // Dragging within active buttons
                    handleDragOver(e, index);
                  } else {
                    // Dragging from available to active
                    setDropTargetIndex(index);
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetIndex === index) {
                    setDropTargetIndex(null);
                    setShiftDirection(null);
                  }
                }}
                onDrop={(e) => {
                  if (draggedFromActive) {
                    // Dropping within active buttons
                    handleDrop(e, index, true);
                  } else {
                    // Dropping available button into active section
                    handleDrop(e, index, true);
                  }
                }}
                className={`${getGradientClass(button.color)} p-4 rounded-xl text-center text-white shadow-xl hover:shadow-2xl transform hover:scale-[1.02] transition-all duration-300 relative group cursor-move overflow-hidden ${
                  dropTargetIndex === index && (
                    (draggedIndex !== null && draggedIndex !== index && draggedFromActive) ||
                    (!draggedFromActive)
                  )
                    ? 'ring-4 ring-white ring-opacity-75 scale-105 z-10' 
                    : ''
                }`}
                style={{
                  transform: dropTargetIndex === index && draggedIndex !== null && draggedIndex !== index && shiftDirection
                    ? `translateX(${shiftDirection === 'left' ? '-20px' : '20px'}) scale(1.05)`
                    : undefined,
                  transition: 'transform 0.2s ease-out'
                }}
              >
                {/* Efect de lumină care se mișcă de la stânga la dreapta */}
                <span 
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                    width: '100%',
                    height: '100%',
                    zIndex: 1
                  }}
                />
                <button
                  onClick={() => handleRemove(index)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs z-20"
                  title="Elimină"
                >
                  <i className="ri-close-line"></i>
                </button>
                <div className="text-2xl mb-2 flex justify-center relative z-10">
                  {button.id === 'search' ? (
                    <SearchIcon size="l" />
                  ) : button.id === 'tokens' ? (
                    <CoinsIcon size="l" />
                  ) : button.id === 'settings' ? (
                    <SettingsIcon size="l" />
                  ) : button.id === 'payments' ? (
                    <CreditCardIcon size="l" />
                  ) : button.id === 'favorites' ? (
                    <HeartIcon size="l" />
                  ) : button.id === 'support' ? (
                    <SupportIcon size="l" />
                  ) : button.id === 'my-bids' ? (
                    <i className="ri-auction-line text-3xl"></i>
                  ) : (
                    <i className={`${button.icon} text-3xl`}></i>
                  )}
                </div>
                <span className="text-sm font-medium relative z-10">{button.label}</span>
              </div>
            ))}
            {activeButtons.length === 0 && (
              <div 
                className={`col-span-full text-center py-8 rounded-xl border-2 border-dashed transition-all ${
                  isDarkMode 
                    ? 'text-gray-400 border-gray-600' 
                    : 'text-gray-600 border-gray-300'
                } ${
                  dropTargetIndex === activeButtons.length && !draggedFromActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : ''
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!draggedFromActive) {
                    setDropTargetIndex(activeButtons.length);
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetIndex === activeButtons.length) {
                    setDropTargetIndex(null);
                  }
                }}
                onDrop={(e) => {
                  if (!draggedFromActive) {
                    handleDrop(e, activeButtons.length, true);
                  }
                }}
              >
                Nu ai butoane active. Adaugă butoane din secțiunea de mai jos.
              </div>
            )}
            {/* Drop zone at the end of active buttons for available buttons */}
            {activeButtons.length > 0 && !draggedFromActive && (
              <div
                className={`col-span-full h-20 rounded-xl border-2 border-dashed transition-all ${
                  isDarkMode 
                    ? 'border-gray-600' 
                    : 'border-gray-300'
                } ${
                  dropTargetIndex === activeButtons.length
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'opacity-0'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!draggedFromActive) {
                    setDropTargetIndex(activeButtons.length);
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetIndex === activeButtons.length) {
                    setDropTargetIndex(null);
                  }
                }}
                onDrop={(e) => {
                  if (!draggedFromActive) {
                    handleDrop(e, activeButtons.length, true);
                  }
                }}
              />
            )}
          </div>
          
          {/* Buton Salvează schimbările */}
          <div className="flex justify-end mt-4">
            <button
              onClick={async () => {
                // Salvează schimbările curente
                await saveButtons(activeButtons);
                // Redirecționează la Dashboard
                router.push('/dashboard');
              }}
              className={`group relative px-6 py-2.5 rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 overflow-hidden ${
                isDarkMode
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white'
                  : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white'
              }`}
            >
              {/* Efect de lumină care se mișcă de la stânga la dreapta */}
              <span 
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none'
                }}
              />
              <span className="relative z-10 flex items-center">
                <i className="ri-save-line mr-2"></i>
                Salvează schimbările
              </span>
            </button>
          </div>
        </section>

        {/* Available Buttons Section */}
        {availableButtons.length > 0 && (
          <section 
            className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-6 shadow-lg mb-6`}
            onDragOver={(e) => {
              if (draggedFromActive) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              if (draggedFromActive) {
                // Dropping active button at the end of available section
                handleDrop(e, availableButtons.length, false);
              }
            }}
          >
            <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Butoane Disponibile
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {availableButtons.map((button, index) => (
                <div
                  key={button.id}
                  draggable
                  onDragStart={() => handleDragStart(button, index, false)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedFromActive) {
                      // Dragging from active to available
                      setDropTargetIndex(index);
                    } else {
                      // Dragging within available
                      handleDragOver(e, index);
                    }
                  }}
                  onDragLeave={() => {
                    if (dropTargetIndex === index) {
                      setDropTargetIndex(null);
                      setShiftDirection(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (draggedFromActive) {
                      // Dropping active button into available section
                      handleDrop(e, index, false);
                    } else {
                      // Dropping available button within available section (reordering)
                      handleDrop(e, index, false);
                    }
                  }}
                  onClick={() => {
                    saveButtons([...activeButtons, button]);
                    setAvailableButtons(availableButtons.filter((_, i) => i !== index));
                  }}
                  className={`${getGradientClass(button.color)} p-4 rounded-xl text-center text-white shadow-xl hover:shadow-2xl transform hover:scale-[1.02] transition-all duration-300 cursor-pointer opacity-75 hover:opacity-100 ${
                    dropTargetIndex === index && draggedFromActive ? 'ring-4 ring-white ring-opacity-75 scale-105 z-10' : ''
                  }`}
                  style={{
                    transform: dropTargetIndex === index && draggedFromActive
                      ? 'translateX(0px) scale(1.05)'
                      : undefined,
                    transition: 'transform 0.2s ease-out'
                  }}
                >
                  <div className="text-2xl mb-2 flex justify-center">
                    {button.id === 'search' ? (
                      <SearchIcon size="l" />
                    ) : button.id === 'tokens' ? (
                      <CoinsIcon size="l" />
                    ) : button.id === 'settings' ? (
                      <SettingsIcon size="l" />
                    ) : button.id === 'payments' ? (
                      <CreditCardIcon size="l" />
                    ) : button.id === 'favorites' ? (
                      <HeartIcon size="l" />
                    ) : button.id === 'support' ? (
                      <SupportIcon size="l" />
                    ) : button.id === 'my-bids' ? (
                      <i className="ri-auction-line text-3xl"></i>
                    ) : (
                      <i className={`${button.icon} text-3xl`}></i>
                    )}
                  </div>
                  <span className="text-sm font-medium">{button.label}</span>
                  <div className="mt-2 text-xs opacity-75">Click pentru a adăuga</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Add Custom Button Section */}
        <section className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-6 shadow-lg`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Adaugă Buton Personalizat
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              className={`group relative px-4 py-2 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 overflow-hidden ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white' 
                  : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
              }`}
            >
              {/* Efect de lumină care se mișcă de la stânga la dreapta */}
              <span 
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                  width: '100%',
                  height: '100%',
                  zIndex: 1
                }}
              />
              <span className="relative z-10 flex items-center">
                <i className="ri-add-line mr-2"></i>
                Adaugă Buton
              </span>
            </button>
          </div>
        </section>

        {/* Add Modal */}
        {showAddModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => {
              setShowAddModal(false);
              setNewButton({ label: "", url: "", icon: "ri-link", color: "blue" });
            }}
          >
            <div 
              className={`w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl p-6`}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Buton Nou
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Label *
                  </label>
                  <input
                    type="text"
                    value={newButton.label}
                    onChange={(e) => setNewButton({ ...newButton, label: e.target.value })}
                    placeholder="Ex: Pagina mea"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    URL *
                  </label>
                  <input
                    type="text"
                    value={newButton.url}
                    onChange={(e) => setNewButton({ ...newButton, url: e.target.value })}
                    placeholder="Ex: /dashboard/my-page"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Icon (RemixIcon class)
                  </label>
                  <input
                    type="text"
                    value={newButton.icon}
                    onChange={(e) => setNewButton({ ...newButton, icon: e.target.value })}
                    placeholder="ri-link"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Ex: ri-link, ri-home-line, ri-settings-line
                  </p>
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Culoare
                  </label>
                  <select
                    value={newButton.color}
                    onChange={(e) => setNewButton({ ...newButton, color: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    {COLOR_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewButton({ label: "", url: "", icon: "ri-link", color: "blue" });
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                  }`}
                >
                  Anulează
                </button>
                <button
                  onClick={handleAdd}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  Adaugă
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}





































