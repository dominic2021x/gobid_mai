"use client";

import React, { useState } from 'react';
import { UserIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

interface AvatarProps {
  name?: string;
  email?: string;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showDropdown?: boolean;
  isDarkMode?: boolean;
}

const Avatar: React.FC<AvatarProps> = ({
  name = "Admin User",
  email = "admin@gobid.ro",
  imageUrl,
  size = 'md',
  showDropdown = true,
  isDarkMode = true
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'w-8 h-8 text-xs';
      case 'md': return 'w-10 h-10 text-sm';
      case 'lg': return 'w-12 h-12 text-base';
      case 'xl': return 'w-16 h-16 text-lg';
      default: return 'w-10 h-10 text-sm';
    }
  };

  const getInitials = () => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleLogout = () => {
    // Implement logout logic here
    console.log('Logout clicked');
    setIsDropdownOpen(false);
  };

  const handleSettings = () => {
    // Implement settings navigation here
    console.log('Settings clicked');
    setIsDropdownOpen(false);
  };

  return (
    <div className="relative">
      {/* Avatar Button */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className={`${getSizeClasses()} rounded-full flex items-center justify-center font-semibold transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode 
            ? 'bg-blue-600 text-white hover:bg-blue-700' 
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span className="select-none">{getInitials()}</span>
        )}
      </button>

      {/* Dropdown Menu */}
      {showDropdown && isDropdownOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsDropdownOpen(false)}
          />
          
          {/* Dropdown Content */}
          <div className={`absolute right-0 mt-2 w-64 rounded-lg shadow-lg z-20 ${
            isDarkMode 
              ? 'bg-gray-800 border border-gray-700' 
              : 'bg-white border border-gray-200'
          }`}>
            {/* User Info */}
            <div className={`px-4 py-3 border-b ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`${getSizeClasses()} rounded-full flex items-center justify-center font-semibold ${
                  isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                }`}>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="select-none">{getInitials()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {name}
                  </p>
                  <p className={`text-xs truncate ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {email}
                  </p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <button
                onClick={handleSettings}
                className={`w-full flex items-center px-4 py-2 text-sm transition-colors ${
                  isDarkMode 
                    ? 'text-gray-300 hover:bg-gray-700 hover:text-white' 
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Cog6ToothIcon className="w-4 h-4 mr-3" />
                Setări Profil
              </button>
              
              <button
                onClick={handleLogout}
                className={`w-full flex items-center px-4 py-2 text-sm transition-colors ${
                  isDarkMode 
                    ? 'text-red-400 hover:bg-gray-700 hover:text-red-300' 
                    : 'text-red-600 hover:bg-gray-100 hover:text-red-700'
                }`}
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4 mr-3" />
                Deconectare
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Avatar;


















