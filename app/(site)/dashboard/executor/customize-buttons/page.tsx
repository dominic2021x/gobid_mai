"use client";

import { useEffect, useMemo, useState } from "react";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DashboardFooter from "@/components/DashboardFooter";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
    url: "/dashboard/executor/my-products",
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
    url: "/dashboard/executor/tokens",
    icon: "ri-coins-line",
    color: "yellow",
    isDefault: true
  },
  {
    id: "settings",
    label: "Setări",
    url: "/dashboard/executor/settings",
    icon: "ri-settings-3-line",
    color: "blue",
    isDefault: true
  },
  {
    id: "payments",
    label: "Plăți",
    url: "/dashboard/executor/payments",
    icon: "ri-bank-card-line",
    color: "green",
    isDefault: true
  },
  {
    id: "favorites",
    label: "Favorite",
    url: "/dashboard/executor/favorites",
    icon: "ri-heart-line",
    color: "red",
    isDefault: true
  },
  {
    id: "support",
    label: "Suport",
    url: "/dashboard/executor/support",
    icon: "ri-customer-service-2-line",
    color: "teal",
    isDefault: true
  },
  {
    id: "add-auction",
    label: "Adaugă licitație",
    url: "/dashboard/executor/add-auction",
    icon: "ri-add-circle-line",
    color: "blue",
    isDefault: false
  },
  {
    id: "import-auctions",
    label: "Import licitații",
    url: "/dashboard/executor/import-auctions",
    icon: "ri-upload-cloud-2-line",
    color: "pink",
    isDefault: false
  },
  {
    id: "add-credit",
    label: "Adaugă Credit",
    url: "/dashboard/payments?tab=add-credit",
    icon: "ri-wallet-3-line",
    color: "green",
    isDefault: false
  },
  {
    id: "invoices",
    label: "Facturi",
    url: "/dashboard/payments?tab=invoices",
    icon: "ri-file-list-3-line",
    color: "blue",
    isDefault: false
  },
  {
    id: "reports",
    label: "Rapoarte",
    url: "/dashboard/executor/reports",
    icon: "ri-bar-chart-line",
    color: "blue",
    isDefault: false
  },
  {
    id: "documents",
    label: "Documente",
    url: "/dashboard/executor/documents",
    icon: "ri-folder-line",
    color: "teal",
    isDefault: false
  },
  {
    id: "calendar",
    label: "Calendar",
    url: "/dashboard/executor/calendar",
    icon: "ri-calendar-line",
    color: "blue",
    isDefault: false
  },
  {
    id: "history",
    label: "Istoric",
    url: "/dashboard/executor/history",
    icon: "ri-history-line",
    color: "gray",
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
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : "/dashboard/executor";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const buttonsWithBase = useMemo(() => ALL_BUTTONS.map(b => ({ ...b, url: b.url.startsWith("/dashboard/executor") ? basePath + b.url.slice("/dashboard/executor".length) : b.url })), [basePath]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeButtons, setActiveButtons] = useState<CustomButton[]>([]);
  const [availableButtons, setAvailableButtons] = useState<CustomButton[]>([]);
  const [draggedButton, setDraggedButton] = useState<CustomButton | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [needsHelp, setNeedsHelp] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHoveringTutorial, setIsHoveringTutorial] = useState(false);
  const [tutorialAnimation, setTutorialAnimation] = useState<'idle' | 'dragging' | 'adding' | 'deleting'>('idle');
  const [tutorialTarget, setTutorialTarget] = useState<{ x: number; y: number } | null>(null);
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
          // Fallback to localStorage if no session
          loadFromLocalStorage();
          return;
        }

        const user = sessionData?.session?.user;
        if (!user) {
          // No user logged in, use localStorage
          loadFromLocalStorage();
          return;
        }

        setCurrentUserId(user.id);

        // Load buttons from database
        const { data: buttonData, error: buttonError } = await supabase
          .from('executor_custom_buttons')
          .select('button_config')
          .eq('user_id', user.id)
          .maybeSingle();

        if (buttonError && buttonError.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error('Error loading buttons from database:', buttonError);
          // Fallback to localStorage
          loadFromLocalStorage();
          return;
        }

        let active: CustomButton[] = [];
        
        if (buttonData && buttonData.button_config) {
          try {
            active = JSON.parse(JSON.stringify(buttonData.button_config));
          } catch (e) {
            console.error('Error parsing button config:', e);
            active = buttonsWithBase.filter(b => b.isDefault);
          }
        } else {
          // No saved buttons, use defaults
          active = buttonsWithBase.filter(b => b.isDefault);
        }

        // Get active button IDs
        const activeIds = new Set(active.map(b => b.id));
        
        // Available buttons are those not in active
        const available = ALL_BUTTONS.filter(b => !activeIds.has(b.id));
        
        // Add any custom buttons that aren't in ALL_BUTTONS
        const customButtons = active.filter(b => !ALL_BUTTONS.find(ab => ab.id === b.id));
        available.push(...customButtons);

        setActiveButtons(active);
        setAvailableButtons(available);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading buttons:', error);
        loadFromLocalStorage();
      }
    };

    const loadFromLocalStorage = () => {
      // Fallback to localStorage if database fails
      const savedButtons = localStorage.getItem('executor_custom_buttons');
      let active: CustomButton[] = [];
      
      if (savedButtons) {
        try {
          active = JSON.parse(savedButtons);
        } catch (e) {
          active = buttonsWithBase.filter(b => b.isDefault);
        }
      } else {
        active = buttonsWithBase.filter(b => b.isDefault);
      }

      const activeIds = new Set(active.map(b => b.id));
      const available = buttonsWithBase.filter(b => !activeIds.has(b.id));
      const customButtons = active.filter(b => !buttonsWithBase.find(ab => ab.id === b.id));
      available.push(...customButtons);

      setActiveButtons(active);
      setAvailableButtons(available);
      setIsLoading(false);
    };

    loadUserButtons();

    // Check if user needs tutorial
    const hasSeenTutorial = localStorage.getItem('executor_buttons_tutorial_seen');
    if (!hasSeenTutorial) {
      setNeedsHelp(true);
    }

    // Mouse tracking for custom cursor
    const handleMouseMove = (e: MouseEvent) => {
      if (!showTutorial) {
        setMousePosition({ x: e.clientX, y: e.clientY });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Tutorial animation sequence
    let tutorialTimeout: NodeJS.Timeout | null = null;
    let currentStepRef = { current: 0 };
    
    const getElementPosition = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      // Use getBoundingClientRect which gives viewport-relative positions
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    };

    // Update hand position on scroll to keep it fixed relative to viewport
    const handleScroll = () => {
      if (!showTutorial || !tutorialTarget) return;
      
      // Recalculate positions of elements relative to viewport
      if (currentStepRef.current === 1) {
        const firstButton = document.querySelector('[data-button-id]');
        const pos = firstButton ? getElementPosition(firstButton) : null;
        if (pos) setTutorialTarget(pos);
      } else if (currentStepRef.current === 2) {
        const activeSection = document.querySelector('[data-section="active"]');
        const pos = activeSection ? getElementPosition(activeSection) : null;
        if (pos) setTutorialTarget({ x: pos.x, y: pos.y - 50 });
      } else if (currentStepRef.current === 3) {
        const addButton = document.querySelector('[data-add-button]');
        const pos = addButton ? getElementPosition(addButton) : null;
        if (pos) setTutorialTarget(pos);
      }
    };

    if (showTutorial) {
      window.addEventListener('scroll', handleScroll, true);
    }

    const runTutorialStep = () => {
      if (!showTutorial) return;
      
      currentStepRef.current++;
      
      if (currentStepRef.current === 1) {
        // Step 1: Move to first active button and demonstrate drag
        const firstButton = document.querySelector('[data-button-id]');
        const pos = getElementPosition(firstButton);
        if (pos) {
          setTutorialTarget(pos);
          setTutorialAnimation('idle');
          
          // After 1.5s, show dragging animation
          tutorialTimeout = setTimeout(() => {
            if (!showTutorial) return;
            setTutorialAnimation('dragging');
            // Move down to available section (simulating drag)
            tutorialTimeout = setTimeout(() => {
              if (!showTutorial) return;
              const availableSection = document.querySelector('[data-section="available"]');
              const availablePos = getElementPosition(availableSection);
              if (availablePos) {
                setTutorialTarget({ x: availablePos.x, y: availablePos.y - 50 });
              }
              // Stay there for 2s, then move to next step
              tutorialTimeout = setTimeout(() => {
                runTutorialStep();
              }, 2000);
            }, 2000);
          }, 1500);
        } else {
          // If no button found, try next step after delay
          tutorialTimeout = setTimeout(() => runTutorialStep(), 2000);
        }
      } else if (currentStepRef.current === 2) {
        // Step 2: Move back to active section and demonstrate reordering
        const activeSection = document.querySelector('[data-section="active"]');
        const pos = getElementPosition(activeSection);
        if (pos) {
          setTutorialTarget({ x: pos.x, y: pos.y - 50 });
          setTutorialAnimation('dragging');
          
          // Stay for 3s to show reordering, then move to next step
          tutorialTimeout = setTimeout(() => {
            runTutorialStep();
          }, 3000);
        } else {
          tutorialTimeout = setTimeout(() => runTutorialStep(), 2000);
        }
      } else if (currentStepRef.current === 3) {
        // Step 3: Move to add button
        const addButton = document.querySelector('[data-add-button]');
        const pos = getElementPosition(addButton);
        if (pos) {
          setTutorialTarget(pos);
          setTutorialAnimation('adding');
          
          // Stay for 2s, then restart
          tutorialTimeout = setTimeout(() => {
            currentStepRef.current = 0;
            runTutorialStep();
          }, 2000);
        } else {
          tutorialTimeout = setTimeout(() => {
            currentStepRef.current = 0;
            runTutorialStep();
          }, 2000);
        }
      }
    };
    
    if (showTutorial) {
      // Initialize hand position to center if no target
      if (!tutorialTarget) {
        setTutorialTarget({ 
          x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, 
          y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0 
        });
      }
      
      // Start tutorial after a short delay
      tutorialTimeout = setTimeout(() => {
        runTutorialStep();
      }, 500);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll, true);
      if (tutorialTimeout) clearTimeout(tutorialTimeout);
    };
  }, [showTutorial]);

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
    localStorage.setItem('executor_custom_buttons', JSON.stringify(active));
    
    // Update available buttons
    const activeIds = new Set(active.map(b => b.id));
    const available = buttonsWithBase.filter(b => !activeIds.has(b.id));
    const customButtons = active.filter(b => !buttonsWithBase.find(ab => ab.id === b.id));
    available.push(...customButtons);
    setAvailableButtons(available);

    // Save to database if user is logged in
    if (currentUserId) {
      try {
        const { error } = await supabase
          .from('executor_custom_buttons')
          .upsert({
            user_id: currentUserId,
            button_config: active,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });

        if (error) {
          console.error('Error saving buttons to database:', error);
          // Continue anyway, localStorage is already saved
        } else {
          // Notify other components that buttons were updated
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('buttonsUpdated'));
          }
        }
      } catch (error) {
        console.error('Error saving buttons:', error);
        // Continue anyway, localStorage is already saved
      }
    } else {
      // Even if not logged in, dispatch event for localStorage sync
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('buttonsUpdated'));
      }
    }
  };

  const handleDragStart = (button: CustomButton, index: number, fromActive: boolean) => {
    setDraggedButton({ ...button, isDefault: fromActive ? button.isDefault : false });
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index?: number) => {
    e.preventDefault();
    if (index !== undefined) {
      setDropTargetIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDropTargetIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetArea: 'active' | 'available', targetIndex?: number) => {
    e.preventDefault();
    if (!draggedButton || draggedIndex === null) return;

    if (targetArea === 'active') {
      if (targetIndex !== undefined) {
        // Reordering within active buttons
        const updated = [...activeButtons];
        const isFromActive = activeButtons.find(b => b.id === draggedButton.id);
        
        if (isFromActive) {
          // Reorder within active
          updated.splice(draggedIndex, 1);
          updated.splice(targetIndex, 0, draggedButton);
        } else {
          // Move from available to active at specific position
          updated.splice(targetIndex, 0, draggedButton);
        }
        saveButtons(updated);
      } else {
        // Move to active (append)
        if (!activeButtons.find(b => b.id === draggedButton.id)) {
          const updated = [...activeButtons, draggedButton];
          saveButtons(updated);
        }
      }
    } else {
      // Move to available
      const updated = activeButtons.filter(b => b.id !== draggedButton.id);
      saveButtons(updated);
    }

    setDraggedButton(null);
    setDraggedIndex(null);
    setDropTargetIndex(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Ești sigur că vrei să ștergi acest buton?')) {
      const updated = activeButtons.filter(b => b.id !== id);
      saveButtons(updated);
    }
  };

  const handleAdd = () => {
    if (!newButton.label || !newButton.url) {
      alert('Completează toate câmpurile!');
      return;
    }

    const button: CustomButton = {
      id: `custom-${Date.now()}`,
      label: newButton.label!,
      url: newButton.url!,
      icon: newButton.icon || "ri-link",
      color: newButton.color || "blue"
    };

    const updated = [...activeButtons, button];
    saveButtons(updated);
    setNewButton({ label: "", url: "", icon: "ri-link", color: "blue" });
    setShowAddModal(false);
  };

  const getColorClass = (color: string, isDark: boolean) => {
    const colorMap: Record<string, { light: string; dark: string }> = {
      orange: { light: "bg-orange-500", dark: "bg-orange-600" },
      blue: { light: "bg-blue-500", dark: "bg-blue-600" },
      yellow: { light: "bg-yellow-500", dark: "bg-yellow-600" },
      green: { light: "bg-green-500", dark: "bg-green-600" },
      red: { light: "bg-red-500", dark: "bg-red-600" },
      teal: { light: "bg-teal-500", dark: "bg-teal-600" },
      pink: { light: "bg-pink-500", dark: "bg-pink-600" },
      gray: { light: "bg-gray-500", dark: "bg-gray-600" }
    };

    return isDark ? colorMap[color]?.dark || colorMap.blue.dark : colorMap[color]?.light || colorMap.blue.light;
  };

  const renderButton = (button: CustomButton, index: number, isActive: boolean) => (
    <div
      key={button.id}
      draggable
      onDragStart={() => handleDragStart(button, index, isActive)}
      onDragOver={(e) => handleDragOver(e, index)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, isActive ? 'active' : 'available', index)}
      className={`${getColorClass(button.color, isDarkMode)} p-4 rounded-xl text-white shadow-lg cursor-move hover:shadow-xl transition-all relative group ${
        dropTargetIndex === index && draggedIndex !== index ? 'ring-4 ring-blue-400 ring-offset-2' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70 font-bold">#{index + 1}</span>
          <i className={`${button.icon} text-2xl`}></i>
        </div>
        {isActive && !button.isDefault && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(button.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 bg-red-500/80 hover:bg-red-600 rounded transition-opacity"
            title="Șterge"
          >
            <i className="ri-delete-bin-line text-sm"></i>
          </button>
        )}
      </div>
      <h3 className="font-semibold text-sm">{button.label}</h3>
      <p className="text-xs opacity-80 mt-1 truncate">{button.url}</p>
      <div className="absolute top-2 right-2 opacity-50">
        <i className="ri-drag-move-2-line text-lg"></i>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen transition-all duration-300 relative overflow-hidden bg-gradient-to-br from-gray-50/30 via-white/30 to-gray-50/30 dark:from-gray-900/30 dark:via-gray-800/30 dark:to-gray-700/30">
      {/* Background Emblem */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.06] dark:opacity-[0.08] md:opacity-[0.04] md:dark:opacity-[0.05]"
        style={{ backgroundImage: `url(${bgEmblem})` }}
      />
      {/* Custom Animated Cursor - Live Tutorial */}
      {showTutorial && (
        <>
          {/* Animated Hand with Modern Tooltip - Always visible during tutorial */}
          <div
            className="fixed pointer-events-none z-[100] transition-all duration-1000 ease-out"
            style={{
              left: tutorialTarget ? `${tutorialTarget.x}px` : (typeof window !== 'undefined' ? `${window.innerWidth / 2}px` : '50%'),
              top: tutorialTarget ? `${tutorialTarget.y}px` : (typeof window !== 'undefined' ? `${window.innerHeight / 2}px` : '50%'),
              transform: 'translate(-50%, -50%)',
              visibility: 'visible',
              opacity: 1,
            }}
          >
            <div className="relative flex flex-col items-center">
              {/* Hand icon with 3D effect */}
              <div 
                className="relative transform transition-all duration-500"
                style={{
                  transform: `${
                    tutorialAnimation === 'dragging' 
                      ? 'perspective(1000px) rotateY(20deg) rotateX(-10deg) scale(1.3)' :
                      tutorialAnimation === 'adding'
                      ? 'perspective(1000px) rotateY(-20deg) rotateX(10deg) scale(1.2)' :
                      'perspective(1000px) rotateY(10deg) rotateX(-10deg) scale(1)'
                  }`,
                  animation: tutorialAnimation === 'dragging' ? 'dragHand 1s ease-in-out infinite' : 'none',
                }}
              >
                {/* Glow effect */}
                <div className={`absolute inset-0 rounded-full blur-2xl opacity-50 ${
                  tutorialAnimation === 'dragging' ? 'bg-blue-500 animate-pulse' :
                  tutorialAnimation === 'adding' ? 'bg-green-500 animate-pulse' :
                  tutorialAnimation === 'deleting' ? 'bg-red-500 animate-pulse' :
                  'bg-blue-500 animate-pulse'
                }`} style={{
                  width: '120%',
                  height: '120%',
                  left: '-10%',
                  top: '-10%',
                }}></div>
                
                <div className="text-7xl filter drop-shadow-2xl relative z-10" style={{
                  textShadow: '0 0 30px rgba(59, 130, 246, 0.8), 0 0 60px rgba(59, 130, 246, 0.4)',
                }}>
                  {tutorialAnimation === 'dragging' ? '✊' : '👆'}
                </div>
              </div>

              {/* Modern Tooltip below hand */}
              <div 
                className="absolute top-full mt-4 transform transition-all duration-300"
                style={{
                  minWidth: '280px',
                  maxWidth: '320px',
                }}
              >
                <div className="relative">
                  {/* Glassmorphism tooltip */}
                  <div 
                    className="backdrop-blur-sm bg-white/30 dark:bg-white/5 rounded-2xl p-4 shadow-2xl border border-white/10 dark:border-white/10 relative"
                    style={{
                      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    {/* Close Button X - Top Right */}
                    <button
                      onClick={() => {
                        setShowTutorial(false);
                        setTutorialStep(0);
                        setTutorialAnimation('idle');
                        setTutorialTarget(null);
                        localStorage.setItem('executor_buttons_tutorial_seen', 'true');
                      }}
                      className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-full shadow-lg hover:shadow-red-500/50 transform hover:scale-110 transition-all flex items-center justify-center z-20 pointer-events-auto"
                      title="Închide tutorial"
                    >
                      <i className="ri-close-line text-xs font-bold"></i>
                    </button>

                    {/* Arrow pointing up */}
                    <div 
                      className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 backdrop-blur-sm bg-white/30 dark:bg-white/5 border-l border-t border-white/10 dark:border-white/10 rotate-45"
                      style={{
                        boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.1)',
                      }}
                    ></div>
                    
                    <div className="relative z-10 pr-6">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          tutorialAnimation === 'dragging' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                          tutorialAnimation === 'adding' ? 'bg-gradient-to-br from-green-500 to-green-600' :
                          tutorialAnimation === 'deleting' ? 'bg-gradient-to-br from-red-500 to-red-600' :
                          'bg-gradient-to-br from-blue-500 to-blue-600'
                        } shadow-lg`}>
                          <i className={`text-white text-sm ${
                            tutorialAnimation === 'dragging' ? 'ri-drag-move-2-line' :
                            tutorialAnimation === 'adding' ? 'ri-add-line' :
                            tutorialAnimation === 'deleting' ? 'ri-delete-bin-line' :
                            'ri-lightbulb-line'
                          }`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 leading-tight">
                            {tutorialAnimation === 'idle' && 'Urmărește mâna pentru a învăța'}
                            {tutorialAnimation === 'dragging' && 'Trage butonul pentru a-l muta'}
                            {tutorialAnimation === 'adding' && 'Apasă butonul + pentru a adăuga'}
                            {tutorialAnimation === 'deleting' && 'Treci mouse-ul peste buton pentru a șterge'}
                          </h3>
                          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                            {tutorialAnimation === 'idle' && 'Mâna va demonstra cum să muți și să personalizezi butoanele'}
                            {tutorialAnimation === 'dragging' && 'Trage butonul între secțiuni pentru a-l activa sau dezactiva'}
                            {tutorialAnimation === 'adding' && 'Poți adăuga butoane noi personalizate cu URL-uri proprii'}
                            {tutorialAnimation === 'deleting' && 'Butoanele personalizate pot fi șterse, cele default doar mutate'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      <UniversalHeader 
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Panel Badge */}
      <div className="fixed top-32 right-2 md:top-40 md:left-4 z-50">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        <div className="mb-6">
          <BackButton fallbackHref={basePath} label="Înapoi" className="shadow-md" />
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Se încarcă butoanele...
              </p>
            </div>
          </div>
        ) : (
          <>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Personalizează Acțiuni Rapide
              </h1>
              <button
                onClick={() => {
                  setShowTutorial(true);
                  setTutorialStep(0);
                }}
                className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transform hover:scale-110 transition-all flex items-center justify-center"
                title="Vezi tutorial"
              >
                <i className="ri-question-line text-xl"></i>
              </button>
            </div>
            <button
              data-add-button
              onClick={() => setShowAddModal(true)}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-110 transition-all flex items-center justify-center"
              title="Adaugă buton nou"
            >
              <i className="ri-add-line text-2xl"></i>
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            Trage butoanele pentru a le muta între secțiuni. Butoanele din partea de sus apar pe dashboard.
          </p>
        </div>

        {/* Active Buttons Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Butoane Active ({activeButtons.length})
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Aceste butoane apar în secțiunea "Acțiuni rapide" pe dashboard
          </p>
          <div
            data-section="active"
            onDragOver={(e) => handleDragOver(e)}
            onDrop={(e) => handleDrop(e, 'active')}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 min-h-[200px] p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50"
          >
            {activeButtons.length === 0 ? (
              <div className="col-span-full flex items-center justify-center h-32 text-gray-400 dark:text-gray-500">
                <div className="text-center">
                  <i className="ri-inbox-line text-4xl mb-2"></i>
                  <p>Trage butoane aici pentru a le activa</p>
                </div>
              </div>
            ) : (
              activeButtons.map((button, index) => (
                <div key={button.id} data-button-id={button.id}>
                  {renderButton(button, index, true)}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available Buttons Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Butoane Disponibile ({availableButtons.length})
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Trage butoanele aici pentru a le dezactiva
          </p>
          <div
            data-section="available"
            onDragOver={(e) => handleDragOver(e)}
            onDrop={(e) => handleDrop(e, 'available')}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 min-h-[200px] p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50"
          >
            {availableButtons.length === 0 ? (
              <div className="col-span-full flex items-center justify-center h-32 text-gray-400 dark:text-gray-500">
                <div className="text-center">
                  <i className="ri-inbox-line text-4xl mb-2"></i>
                  <p>Toate butoanele sunt active</p>
                </div>
              </div>
            ) : (
              availableButtons.map((button, index) => renderButton(button, index, false))
            )}
          </div>
        </div>

        {/* Help Modal */}
        {needsHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center animate-pulse">
                  <i className="ri-question-line text-3xl text-blue-600 dark:text-blue-400"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Ai nevoie de ajutor?
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Vrei să îți explic cum poți personaliza butoanele acțiunilor rapide?
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setNeedsHelp(false);
                    localStorage.setItem('executor_buttons_tutorial_seen', 'true');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                >
                  Nu, mulțumesc
                </button>
                <button
                  onClick={() => {
                    setNeedsHelp(false);
                    setShowTutorial(true);
                    setTutorialStep(0);
                    localStorage.setItem('executor_buttons_tutorial_seen', 'true');
                  }}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Da, arată-mi
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Add Button Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Adaugă Buton Nou
                </h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewButton({ label: "", url: "", icon: "ri-link", color: "blue" });
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Label *
                  </label>
                  <input
                    type="text"
                    value={newButton.label || ""}
                    onChange={(e) => setNewButton({ ...newButton, label: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/30 dark:bg-white/5 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white"
                    placeholder="Ex: Produsele mele"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    URL *
                  </label>
                  <input
                    type="text"
                    value={newButton.url || ""}
                    onChange={(e) => setNewButton({ ...newButton, url: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/30 dark:bg-white/5 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white"
                    placeholder={`Ex: ${basePath}/my-products`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Icon (RemixIcon class)
                  </label>
                  <input
                    type="text"
                    value={newButton.icon || ""}
                    onChange={(e) => setNewButton({ ...newButton, icon: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/30 dark:bg-white/5 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white"
                    placeholder="Ex: ri-box-3-line"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Vezi iconițe la: <a href="https://remixicon.com" target="_blank" className="text-blue-500 hover:underline">remixicon.com</a>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Culoare
                  </label>
                  <select
                    value={newButton.color || "blue"}
                    onChange={(e) => setNewButton({ ...newButton, color: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/30 dark:bg-white/5 border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-white"
                  >
                    {COLOR_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                >
                  Anulează
                </button>
                <button
                  onClick={handleAdd}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Adaugă
                </button>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Dashboard Footer */}
      <DashboardFooter isDarkMode={isDarkMode} />

      {/* 3D Animation Styles */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% {
            transform: perspective(1000px) rotateY(15deg) translateY(0px);
          }
          50% {
            transform: perspective(1000px) rotateY(15deg) translateY(-10px);
          }
        }

        @keyframes dragAnimation {
          0%, 100% {
            transform: perspective(1000px) rotateX(20deg) translateY(0px) translateX(0px);
          }
          25% {
            transform: perspective(1000px) rotateX(20deg) translateY(-5px) translateX(10px);
          }
          50% {
            transform: perspective(1000px) rotateX(20deg) translateY(-10px) translateX(20px);
          }
          75% {
            transform: perspective(1000px) rotateX(20deg) translateY(-5px) translateX(10px);
          }
        }

        @keyframes rotate3D {
          0% {
            transform: perspective(1000px) rotateY(0deg) rotateX(0deg);
          }
          25% {
            transform: perspective(1000px) rotateY(90deg) rotateX(10deg);
          }
          50% {
            transform: perspective(1000px) rotateY(180deg) rotateX(0deg);
          }
          75% {
            transform: perspective(1000px) rotateY(270deg) rotateX(-10deg);
          }
          100% {
            transform: perspective(1000px) rotateY(360deg) rotateX(0deg);
          }
        }

        @keyframes pulse3D {
          0%, 100% {
            transform: perspective(1000px) rotateZ(5deg) scale(1);
          }
          50% {
            transform: perspective(1000px) rotateZ(-5deg) scale(1.1);
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes dragHand {
          0%, 100% {
            transform: perspective(1000px) rotateY(20deg) rotateX(-10deg) scale(1.3) translateY(0px);
          }
          50% {
            transform: perspective(1000px) rotateY(20deg) rotateX(-10deg) scale(1.3) translateY(-10px);
          }
        }

        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
