"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, PhotoIcon, CloseIcon, CheckIcon, PlusIcon, EyeIcon, PencilIcon, TrashIcon } from "./HeroIcons";

// LogoBox component - identic cu originalul
const LogoBox = () => {
  return (
    <a href="/" className="logo">
      <span className="logo-light">
        <span className="logo-lg">
          <div className="text-2xl font-bold text-blue-600">Licitatii</div>
        </span>
        <span className="logo-sm">
          <div className="text-lg font-bold text-blue-600">L</div>
        </span>
      </span>
      <span className="logo-dark">
        <span className="logo-lg">
          <div className="text-2xl font-bold text-white">Licitatii</div>
        </span>
        <span className="logo-sm">
          <div className="text-lg font-bold text-white">L</div>
        </span>
      </span>
    </a>
  );
};

// HoverMenuToggle component - identic cu originalul
const HoverMenuToggle = ({ onToggle }: { onToggle: () => void }) => {
  const [isHover, setIsHover] = useState(false);
  
  const handleHoverMenu = () => {
    setIsHover(!isHover);
    onToggle();
  };

  return (
    <button onClick={handleHoverMenu} className="button-sm-hover">
      {isHover ? (
        <div className="w-5 h-5 rounded-full border-2 border-gray-400"></div>
      ) : (
        <div className="w-5 h-5 rounded-full bg-blue-500"></div>
      )}
    </button>
  );
};

// MenuItemLink component - identic cu originalul
const MenuItemLink = ({ item, className, onClick }: { item: any, className: string, onClick?: () => void }) => {
  return (
    <Link href={item.url ?? ''} onClick={onClick} target={item.target} className={className}>
      {item.icon && (
        <span className="menu-icon">
          <div className="text-lg">{item.icon}</div>
        </span>
      )}
      <span className="menu-text">{item.label}</span>
      {item.badge && (
        <span className={`badge rounded-pill text-end bg-${item.badge.variant}`}>
          {item.badge.text}
        </span>
      )}
    </Link>
  );
};

// MenuItem component - identic cu originalul
const MenuItem = ({ item, className, linkClassName, level, onClick }: { 
  item: any, 
  className: string, 
  linkClassName: string, 
  level: number,
  onClick?: () => void 
}) => {
  return (
    <li className={className}>
      <MenuItemLink item={item} className={linkClassName} onClick={onClick} />
    </li>
  );
};

// MenuItemWithChildren component - identic cu originalul
const MenuItemWithChildren = ({
  item,
  className,
  linkClassName,
  subMenuClassName,
  activeMenuItems,
  toggleMenu,
  level,
  onClick
}: {
  item: any;
  className: string;
  linkClassName: string;
  subMenuClassName: string;
  activeMenuItems: string[];
  toggleMenu: (item: any, status: boolean) => void;
  level: number;
  onClick?: () => void;
}) => {
  const [open, setOpen] = useState(activeMenuItems.includes(item.key));
  const level1 = level === 1;

  useEffect(() => {
    const isActive = activeMenuItems.includes(item.key);
    if (isActive !== open) {
      setOpen(isActive);
    }
  }, [activeMenuItems, item.key, open]);

  const toggleMenuItem = (e: React.MouseEvent) => {
    e.preventDefault();
    const status = !open;
    setOpen(status);
    if (toggleMenu) toggleMenu(item, status);
    return false;
  };

  const getActiveClass = useCallback((item: any) => {
    return activeMenuItems?.includes(item.key) ? 'active' : '';
  }, [activeMenuItems]);

  return (
    <li className={className}>
      <div onClick={toggleMenuItem} aria-expanded={open} role="button" className={linkClassName}>
        {item.icon && (
          <span className="menu-icon">
            <div className="text-lg">{item.icon}</div>
          </span>
        )}
        {level1 ? (
          <span className="menu-text">{item.label}</span>
        ) : (
          <Link href="" className="side-nav-link">
            <span className="menu-text">{item.label}</span>
            <div className="menu-arrow">
              <div className="text-sm">→</div>
            </div>
          </Link>
        )}
        {!item.badge ? (
          <>
            {level1 && (
              <span className="menu-arrow">
                <div className="text-sm">→</div>
              </span>
            )}
          </>
        ) : (
          <span className={`badge rounded-pill text-end bg-${item.badge.variant}`}>
            {item.badge.text}
          </span>
        )}
      </div>
      {open && item.children && item.children.length > 0 && (
        <div>
          <ul className={subMenuClassName}>
            {(item.children || []).map((child: any, idx: number) => (
              <React.Fragment key={child.key + idx}>
                {child.children ? (
                  <MenuItemWithChildren
                    item={child}
                    linkClassName={`nav-link ${getActiveClass(child)}`}
                    activeMenuItems={activeMenuItems}
                    className={`side-nav-item ${getActiveClass(child)}`}
                    level={level + 1}
                    subMenuClassName="sub-menu"
                    toggleMenu={toggleMenu}
                    onClick={onClick}
                  />
                ) : (
                  <MenuItem
                    level={level + 1}
                    item={child}
                    className={`side-nav-item ${getActiveClass(child)}`}
                    linkClassName={`side-nav-link ${getActiveClass(child)}`}
                    onClick={onClick}
                  />
                )}
              </React.Fragment>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
};

// AppMenu component - identic cu originalul
const AppMenu = ({ menuItems, onMenuClick }: { menuItems: any[], onMenuClick?: () => void }) => {
  const pathname = usePathname();
  const [activeMenuItems, setActiveMenuItems] = useState<string[]>([]);

  // Auto-open parent menus based on current path
  useEffect(() => {
    if (!pathname) return;
    
    // Special handling for newsletter and modules pages
    if (pathname === '/admin/newsletter' || pathname === '/admin/modules') {
      // Set active menu items immediately
      setActiveMenuItems(['modules']);
      // Force re-render after a short delay to ensure menu opens
      const timeoutId = setTimeout(() => {
        setActiveMenuItems(['modules']);
      }, 50);
      return () => clearTimeout(timeoutId);
    }
    
    const findActiveMenuKeys = (items: any[], parentKeys: string[] = []): string[] => {
      for (const item of items) {
        // Check if current path matches this menu item's URL
        if (item.url && (pathname === item.url || pathname.startsWith(item.url + '/'))) {
          // If found, return this key plus all parent keys
          return [...parentKeys, item.key];
        }
        // If this item has children, search recursively
        if (item.children && item.children.length > 0) {
          const found = findActiveMenuKeys(item.children, [...parentKeys, item.key]);
          if (found.length > 0) return found;
        }
      }
      return [];
    };
    
    const activeKeys = findActiveMenuKeys(menuItems);
    if (activeKeys.length > 0) {
      setActiveMenuItems(activeKeys);
    }
  }, [pathname, menuItems]);

  const toggleMenu = (menuItem: any, show: boolean) => {
    if (show) {
      setActiveMenuItems([menuItem.key, ...findAllParent(menuItems, menuItem)]);
    }
  };

  const getActiveClass = useCallback((item: any) => {
    return activeMenuItems?.includes(item.key) ? 'active' : '';
  }, [activeMenuItems]);

  return (
    <ul className="side-nav">
      {(menuItems || []).map((item, idx) => (
        <React.Fragment key={item.key + idx}>
          {item.isTitle ? (
            <li className={`side-nav-title ${idx !== 0 ? 'mt-2' : ''}`}>
              {item.label}
            </li>
          ) : (
            <>
              {item.children ? (
                <MenuItemWithChildren
                  item={item}
                  toggleMenu={toggleMenu}
                  className={`side-nav-item ${getActiveClass(item)}`}
                  level={1}
                  linkClassName={`side-nav-link ${getActiveClass(item)}`}
                  subMenuClassName="sub-menu"
                  activeMenuItems={activeMenuItems}
                  onClick={onMenuClick}
                />
              ) : (
                <MenuItem
                  item={item}
                  level={1}
                  linkClassName={`side-nav-link ${getActiveClass(item)}`}
                  className={`side-nav-item ${getActiveClass(item)}`}
                  onClick={onMenuClick}
                />
              )}
            </>
          )}
        </React.Fragment>
      ))}
    </ul>
  );
};

// Helper functions - identice cu originalul
const findAllParent = (menuItems: any[], menuItem: any): string[] => {
  let parents: string[] = [];
  const parent = findMenuItem(menuItems, menuItem.parentKey);
  if (parent) {
    parents.push(parent.key);
    if (parent.parentKey) {
      parents = [...parents, ...findAllParent(menuItems, parent)];
    }
  }
  return parents;
};

const findMenuItem = (menuItems: any[], menuItemKey: string): any => {
  if (menuItems && menuItemKey) {
    for (const item of menuItems) {
      if (item.key === menuItemKey) {
        return item;
      }
      const found = findMenuItem(item.children, menuItemKey);
      if (found) return found;
    }
  }
  return null;
};

// Main LeftSideBar component - identic cu originalul
const LeftSideBar = ({ onMenuClick }: { onMenuClick?: () => void }) => {
  const [showBackdrop, setShowBackdrop] = useState(false);

  const toggleBackdrop = () => {
    setShowBackdrop(!showBackdrop);
  };

  // Menu items traduse în română - identice cu originalul
  const menuItems = [
    {
      key: 'navigation',
      label: 'Navigare',
      isTitle: true
    },
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: '📊',
      badge: {
        text: '5',
        variant: 'danger'
      },
      url: '/admin'
    },
    {
      key: 'calendar',
      label: 'Calendar',
      icon: '📅',
      url: '/admin/calendar'
    },
    {
      key: 'email',
      label: 'Email',
      icon: '📧',
      url: '/admin/email'
    },
    {
      key: 'tickets',
      label: 'Tichete',
      icon: '🎫',
      url: '/admin/tickets'
    },
    {
      key: 'newsletter',
      label: 'Newsletter',
      icon: '📬',
      url: '/admin/newsletter'
    },
    {
      key: 'users',
      label: 'Utilizatori',
      icon: '👥',
      url: '/admin/users'
    },
    {
      key: 'admin-users',
      label: 'Administratori',
      icon: '🛡️',
      url: '/admin/users/admins'
    },
    {
      key: 'modules',
      label: 'Module',
      icon: '⚙️',
      url: '/admin/modules'
    },
    {
      key: 'payments',
      label: 'Plăți',
      icon: '💳',
      children: [
        {
          key: 'payu-settings',
          label: 'PayU (opțional) – setări',
          url: '/admin/modules',
          parentKey: 'payments'
        },
        {
          key: 'netopia-settings',
          label: 'Netopia Payments Setări',
          url: '/admin/modules',
          parentKey: 'payments'
        }
      ]
    },
    {
      key: 'pages',
      label: 'Pagini',
      icon: '📄',
      children: [
        {
          key: 'starter-page',
          label: 'Pagina de Start',
          url: '/admin/pages/starter-page',
          parentKey: 'pages'
        },
        {
          key: 'pricing',
          label: 'Prețuri',
          url: '/admin/pages/pricing',
          parentKey: 'pages'
        },
        {
          key: 'faq',
          label: 'Întrebări Frecvente',
          url: '/admin/pages/faq',
          parentKey: 'pages'
        },
        {
          key: 'maintenance',
          label: 'Întreținere',
          url: '/admin/maintenance',
          parentKey: 'pages'
        },
        {
          key: 'timeline',
          label: 'Cronologie',
          url: '/admin/pages/timeline',
          parentKey: 'pages'
        },
        {
          key: 'coming-soon',
          label: 'În Curând',
          url: '/admin/coming-soon',
          parentKey: 'pages'
        },
        {
          key: 'terms-conditions',
          label: 'Termeni și Condiții',
          url: '/admin/pages/terms-conditions',
          parentKey: 'pages'
        }
      ]
    },
    {
      key: 'products',
      label: 'Produse',
      icon: '🛍️',
      children: [
        {
          key: 'add-product',
          label: 'Adaugă Produs',
          url: '/admin/add-product',
          parentKey: 'products'
        },
        {
          key: 'manage-products',
          label: 'Gestionează Produse',
          url: '/admin/products',
          parentKey: 'products'
        }
      ]
    },
    {
      key: 'settings',
      label: 'Setări',
      icon: '⚙️',
      children: [
        {
          key: 'tts-settings',
          label: 'Setări TTS (Voce)',
          url: '/admin/tts-settings',
          parentKey: 'settings'
        }
      ]
    }
  ];

  return (
    <div className="sidenav-menu">
      <LogoBox />
      <HoverMenuToggle onToggle={toggleBackdrop} />
      <button className="button-close-fullsidebar" onClick={toggleBackdrop}>
        <CloseIcon size="s" />
      </button>
      <div className="overflow-y-auto">
        <div className="sidenav-user">
          <div className="dropdown-center">
            <button className="topbar-link text-reset drop-arrow-none px-2 d-flex align-items-center justify-content-center">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold me-2">
                M
              </div>
              <span className="d-flex flex-column gap-1 sidebar-user-name">
                <h4 className="my-0 fw-bold text-sm">Maxine Kennedy</h4>
                <h6 className="my-0 text-xs text-gray-500">Admin Head</h6>
              </span>
              <span>
                <div className="text-sm">▼</div>
              </span>
            </button>
            <div className="dropdown-menu-end">
              <div className="noti-title">
                <h6 className="text-overflow m-0">Bun venit!</h6>
              </div>
              <div className="dropdown-item">
                <div className="me-1 text-sm">👤</div>
                <span className="align-middle">Contul Meu</span>
              </div>
              <div className="dropdown-item">
                <div className="me-1 text-sm">💳</div>
                <span className="align-middle">
                  Portofel: <span className="fw-semibold">89.25k Lei</span>
                </span>
              </div>
              <div className="dropdown-item">
                <div className="me-1 text-sm">⚙️</div>
                <span className="align-middle">Setări</span>
              </div>
              <div className="dropdown-item">
                <div className="me-1 text-sm">❓</div>
                <span className="align-middle">Suport</span>
              </div>
              <div className="dropdown-divider" />
              <div className="dropdown-item">
                <div className="me-1 text-sm">🔒</div>
                <span className="align-middle">Blochează Ecranul</span>
              </div>
              <div className="dropdown-item active fw-semibold text-red-500">
                <div className="me-1 text-sm">🚪</div>
                <span className="align-middle">Deconectare</span>
              </div>
            </div>
          </div>
        </div>
        <AppMenu menuItems={menuItems} onMenuClick={onMenuClick} />
        <div className="help-box text-center">
          <h5 className="fw-semibold text-base">Acces Nelimitat</h5>
          <p className="mb-3 opacity-75 text-sm">Actualizează planul pentru a avea acces la rapoarte nelimitate</p>
          <a href="" className="btn btn-danger btn-sm">
            Actualizează
          </a>
        </div>
        <div className="clearfix" />
      </div>
    </div>
  );
};

export default LeftSideBar;

