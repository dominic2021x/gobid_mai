'use client';

import { getPaymentProvider } from '@/lib/payments/getPaymentProvider';
import { startApplePurchase } from '@/lib/payments/apple/startApplePurchase';

type Props = {
  selectedProductForPremium: string | null;
  isProcessingPremium: boolean;
  disabled: boolean;
  userCreditCoversAmount: boolean;
  totalAmount: number;
  premiumWeeks: number;
  onNetopiaOrCredit: () => Promise<void>;
  onAppleSuccess: () => Promise<void> | void;
  onAppleError: (message: string) => void;
};

export default function PremiumPurchaseButton(props: Props) {
  const {
    selectedProductForPremium,
    isProcessingPremium,
    disabled,
    userCreditCoversAmount,
    totalAmount,
    premiumWeeks,
    onNetopiaOrCredit,
    onAppleSuccess,
    onAppleError,
  } = props;

  const provider = getPaymentProvider();

  const handleClick = async () => {

    // În aplicația iOS (App Store), promovarea premium se plătește exclusiv prin In-App Purchase.
    if (provider === 'apple_iap') {
      if (!selectedProductForPremium) {
        onAppleError('Te rog selectează un produs pentru promovare premium');
        return;
      }

      const appleProductId =
        premiumWeeks >= 4 ? 'ro.gobid.promovare2' : 'ro.gobid.promovare1';

      const result = await startApplePurchase(appleProductId, selectedProductForPremium);
      if (!result.ok) {
        if (!result.cancelled) onAppleError(result.message);
        return;
      }

      await onAppleSuccess();
      return;
    }

    if (userCreditCoversAmount) {
      await onNetopiaOrCredit();
      return;
    }

    await onNetopiaOrCredit();
  };

  return (
    <button
      onClick={() => void handleClick()}
      disabled={disabled}
      className={`w-full py-2 sm:py-3 px-4 sm:px-6 rounded-lg font-semibold text-sm sm:text-base transition-all ${
        disabled
          ? 'bg-gray-400 cursor-not-allowed text-white'
          : 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg hover:shadow-xl'
      }`}
    >
      {isProcessingPremium ? (
        <>
          <i className="ri-loader-4-line animate-spin mr-2"></i>
          Se procesează...
        </>
      ) : (
        <>
          <i className="ri-star-fill mr-2"></i>
          {provider === 'apple_iap' ? (
            <>Cumpără promovare (App Store)</>
          ) : userCreditCoversAmount ? (
            <>Plătește cu Credit ({totalAmount.toFixed(2)} Lei)</>
          ) : (
            <>Plătește {totalAmount.toFixed(2)} Lei și Activează Premium</>
          )}
        </>
      )}
    </button>
  );
}

