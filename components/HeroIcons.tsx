import React from 'react';
import {
  MagnifyingGlassIcon,
  CurrencyDollarIcon,
  Cog6ToothIcon,
  CreditCardIcon as HeroCreditCardIcon,
  HeartIcon as HeroHeartIcon,
  ChatBubbleLeftRightIcon,
  StarIcon as HeroStarIcon,
  BellIcon,
  ClockIcon as HeroClockIcon,
  MapPinIcon,
  UserIcon as HeroUserIcon,
  CheckIcon as HeroCheckIcon,
  XMarkIcon,
  PlusIcon as HeroPlusIcon,
  MinusIcon as HeroMinusIcon,
  ArrowLeftIcon as HeroArrowLeftIcon,
  ArrowRightIcon as HeroArrowRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  LockClosedIcon as HeroLockClosedIcon,
  LockOpenIcon as HeroLockOpenIcon,
  TrophyIcon as HeroTrophyIcon,
  DocumentTextIcon as HeroDocumentTextIcon,
  EyeIcon as HeroEyeIcon,
  PencilIcon as HeroPencilIcon,
  TrashIcon as HeroTrashIcon,
  PhotoIcon as HeroPhotoIcon
} from '@heroicons/react/24/outline';

interface HeroIconProps {
  size?: 's' | 'm' | 'l' | 'xl';
  className?: string;
  strokeWidth?: number;
}

const getSizeClass = (size: string) => {
  switch (size) {
    case 's': return 'w-4 h-4';
    case 'm': return 'w-5 h-5';
    case 'l': return 'w-6 h-6';
    case 'xl': return 'w-6 h-6';
    default: return 'w-5 h-5';
  }
};

// Predefined icon components for common use cases
export const SearchIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <MagnifyingGlassIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const CoinsIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <CurrencyDollarIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const SettingsIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <Cog6ToothIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const CreditCardIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroCreditCardIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const HeartIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '', strokeWidth = 1.5 }) => {
  return <HeroHeartIcon className={`${getSizeClass(size)} ${className}`} strokeWidth={strokeWidth} />;
};

export const SupportIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <ChatBubbleLeftRightIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const StarIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroStarIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const NotificationIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <BellIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const ClockIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroClockIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const LocationIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <MapPinIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const UserIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroUserIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const CheckIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroCheckIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const CloseIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <XMarkIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const PlusIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroPlusIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const MinusIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroMinusIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const ArrowLeftIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroArrowLeftIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const ArrowRightIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroArrowRightIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const ArrowUpIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <ChevronUpIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const ArrowDownIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <ChevronDownIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const LockClosedIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '', strokeWidth = 1.5 }) => {
  return <HeroLockClosedIcon className={`${getSizeClass(size)} ${className}`} strokeWidth={strokeWidth} />;
};

export const LockOpenIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '', strokeWidth = 1.5 }) => {
  return <HeroLockOpenIcon className={`${getSizeClass(size)} ${className}`} strokeWidth={strokeWidth} />;
};

export const TrophyIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroTrophyIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const DocumentTextIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroDocumentTextIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const EyeIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroEyeIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const PencilIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroPencilIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const TrashIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroTrashIcon className={`${getSizeClass(size)} ${className}`} />;
};

export const PhotoIcon: React.FC<HeroIconProps> = ({ size = 'm', className = '' }) => {
  return <HeroPhotoIcon className={`${getSizeClass(size)} ${className}`} />;
};