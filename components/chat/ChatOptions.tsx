/**
 * ChatOptions.tsx
 * Opțiuni de departamente (Support, Plăți, Licitații, Cont)
 * Design modern cu carduri interactive
 */

"use client";

type Department = 'none' | 'support' | 'payments' | 'auctions' | 'account';

interface DepartmentInfo {
  name: string;
  icon: string;
  description: string;
}

interface ChatOptionsProps {
  departments: Record<string, DepartmentInfo>;
  onSelect: (department: Exclude<Department, 'none'>) => void;
}

export default function ChatOptions({
  departments,
  onSelect,
}: ChatOptionsProps) {
  return (
    <div className="px-3 py-3 bg-[#F0F2F5] border-t border-gray-200">
      <p className="text-xs text-gray-600 text-center mb-2 px-2 font-medium">
        Alegeți un departament:
      </p>
      <div className="grid grid-cols-1 gap-2">
        {Object.entries(departments).map(([key, dept]) => (
          <button
            key={key}
            onClick={() => onSelect(key as Exclude<'none' | 'support' | 'payments' | 'auctions' | 'account', 'none'>)}
            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-[#dcf8c6] hover:border-[#25D366] transition-all text-left group shadow-sm hover:shadow-md transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl transform group-hover:scale-110 transition-transform">
                {dept.icon}
              </span>
              <div>
                <div className="text-sm font-medium text-gray-900">{dept.name}</div>
                <div className="text-xs text-gray-500">{dept.description}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
