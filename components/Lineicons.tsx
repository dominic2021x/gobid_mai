import React from 'react';

interface LineIconProps {
  name: string;
  size?: 's' | 'm' | 'l' | 'xl';
  className?: string;
  type?: 'regular' | 'solid';
}

export const LineIcon: React.FC<LineIconProps> = ({ 
  name, 
  size = 'm', 
  className = '', 
  type = 'regular' 
}) => {
  const sizeClass = {
    's': 'text-sm',
    'm': 'text-base', 
    'l': 'text-lg',
    'xl': 'text-xl'
  }[size] || 'text-base';

  const typeClass = type === 'solid' ? 'lni' : 'lni';
  
  return (
    <i className={`lni lni-${name} ${sizeClass} ${className}`}></i>
  );
};

// Predefined icon components for common use cases
export const SearchIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="search" size={size} className={className} />
);

export const CoinsIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="coins" size={size} className={className} />
);

export const SettingsIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="cog" size={size} className={className} />
);

export const CreditCardIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="credit-cards" size={size} className={className} />
);

export const HeartIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="heart" size={size} className={className} />
);

export const SupportIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="customer-service" size={size} className={className} />
);

export const StarIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="star" size={size} className={className} />
);

export const NotificationIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="bell" size={size} className={className} />
);

export const AuctionIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="hammer" size={size} className={className} />
);

export const MoneyIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="money-location" size={size} className={className} />
);

export const ClockIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="clock" size={size} className={className} />
);

export const LocationIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="map-marker" size={size} className={className} />
);

export const UserIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="user" size={size} className={className} />
);

export const CheckIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="checkmark" size={size} className={className} />
);

export const CloseIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="cross-circle" size={size} className={className} />
);

export const PlusIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="plus" size={size} className={className} />
);

export const MinusIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="minus" size={size} className={className} />
);

export const ArrowLeftIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="arrow-left" size={size} className={className} />
);

export const ArrowRightIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="arrow-right" size={size} className={className} />
);

export const ArrowUpIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="arrow-up" size={size} className={className} />
);

export const ArrowDownIcon: React.FC<{ size?: 's' | 'm' | 'l' | 'xl'; className?: string }> = ({ size = 'm', className = '' }) => (
  <LineIcon name="arrow-down" size={size} className={className} />
);
