"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AutopilotTask {
  id: string;
  type: string;
  payload: any;
  status: string;
  cost_usd: number;
  created_at: string;
}

interface SpendStats {
  monthSpend: number;
  monthLimit: number;
  remaining: number;
  dailySpend: { day: string; amount: number }[];
}

export default function AutopilotAdminPage() {
  const [enabled, setEnabled] = useState(true);
  const [limit, setLimit] = useState(150);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [tasks, setTasks] = useState<AutopilotTask[]>([]);
  const [spendStats, setSpendStats] = useState<SpendStats | null>(null);
  const [safetyRails, setSafetyRails] = useState({
    checkBudget: true,
    checkDuplicate: true,
    checkModeration: true,
    enableFallback: true,
  });

  useEffect(() => {
    // Încarcă setările din Supabase
    loadSettings();

    // Încarcă task-urile
    loadTasks();
    loadSpendStats();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/admin/autopilot/settings');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.settings) {
          setEnabled(result.settings.enabled ?? true);
          setLimit(result.settings.limitRon ?? 750);
          if (result.settings.safetyRails) {
            setSafetyRails(result.settings.safetyRails);
          }
        }
      }
    } catch (error) {
      console.error('Error loading autopilot settings from Supabase:', error);
      // Fallback la localStorage
      const savedEnabled = localStorage.getItem('autopilot_enabled');
      const savedLimit = localStorage.getItem('autopilot_limit_ron');
      
      if (savedEnabled !== null) {
        setEnabled(savedEnabled === 'true');
      } else {
        setEnabled(process.env.NEXT_PUBLIC_AUTOPILOT_ENABLED === 'true');
      }
      
      if (savedLimit) {
        setLimit(Number(savedLimit));
      } else {
        setLimit(750); // Default 750 Lei
      }

      const savedSafetyRails = localStorage.getItem('autopilot_safety_rails');
      if (savedSafetyRails) {
        setSafetyRails(JSON.parse(savedSafetyRails));
      }
    }
  };

  const loadTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('autopilot_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading tasks:', error);
        return;
      }

      setTasks(data || []);
    } catch (error) {
      console.error('Error in loadTasks:', error);
    }
  };

  const loadSpendStats = async () => {
    try {
      const response = await fetch('/api/autopilot/stats');
      const data = await response.json();
      if (data.success) {
        setSpendStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading spend stats:', error);
    }
  };

  const triggerNow = async () => {
    setRunning(true);
    setLog((l) => [`🔄 Rulare inițiată: ${new Date().toLocaleString('ro-RO')}`, ...l]);

    try {
      const response = await fetch('/api/cron/autopilot');
      const data = await response.json();

      setRunning(false);

      if (data.success) {
        setLog((l) => [
          `✅ Rulare completă: ${data.executed} task-uri executate, ${data.failed} eșuate, Cost: ${data.total_cost_usd?.toFixed(2) || '0.00'} Lei`,
          ...l,
        ]);
        await loadTasks();
        await loadSpendStats();
      } else {
        setLog((l) => [`❌ Eroare: ${data.error || 'Unknown error'}`, ...l]);
      }
    } catch (error: any) {
      setRunning(false);
      setLog((l) => [`❌ Eroare: ${error.message || 'Unknown error'}`, ...l]);
    }
  };

  const saveSettings = async () => {
    try {
      const response = await fetch('/api/admin/autopilot/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled,
          limitRon: limit,
          safetyRails,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setLog((l) => [`💾 Setări salvate în Supabase: Enabled=${enabled}, Limită=${limit} Lei`, ...l]);
        
        // Salvează și în localStorage ca backup
        localStorage.setItem('autopilot_enabled', enabled.toString());
        localStorage.setItem('autopilot_limit_ron', limit.toString());
        localStorage.setItem('autopilot_safety_rails', JSON.stringify(safetyRails));
      } else {
        const error = await response.json();
        setLog((l) => [`❌ Eroare la salvarea setărilor: ${error.error || 'Unknown error'}`, ...l]);
      }
    } catch (error: any) {
      console.error('Error saving autopilot settings:', error);
      setLog((l) => [`❌ Eroare: ${error.message || 'Failed to save settings'}`, ...l]);
      
      // Fallback la localStorage
      localStorage.setItem('autopilot_enabled', enabled.toString());
      localStorage.setItem('autopilot_limit_ron', limit.toString());
      localStorage.setItem('autopilot_safety_rails', JSON.stringify(safetyRails));
      setLog((l) => [`💾 Setări salvate în localStorage (fallback)`, ...l]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-green-500';
      case 'running':
        return 'bg-blue-500';
      case 'failed':
        return 'bg-red-500';
      case 'queued':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'seo':
        return '🔍';
      case 'article':
        return '📝';
      case 'video':
        return '🎥';
      case 'social':
        return '📱';
      case 'email':
        return '📧';
      default:
        return '⚙️';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-gray-900">
            🧠 Autopilot AI — Panou de Control
          </h1>
          <p className="text-lg text-gray-600">
            Sistem automat de producție bazat pe performanță și buget
          </p>
        </div>

        {/* Statistici Cheltuială */}
        {spendStats && (
          <div
            className="mb-6 p-6 rounded-xl border shadow-lg bg-white border-gray-200"
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-900">
              💰 Statistici Cheltuială
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className="p-4 rounded-lg bg-gray-50"
              >
                <p className="text-sm text-gray-600">
                  Cheltuit (lună)
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {spendStats.monthSpend.toFixed(2)} Lei
                </p>
              </div>
              <div
                className="p-4 rounded-lg bg-gray-50"
              >
                <p className="text-sm text-gray-600">
                  Limită (lună)
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {spendStats.monthLimit.toFixed(2)} Lei
                </p>
              </div>
              <div
                className="p-4 rounded-lg bg-gray-50"
              >
                <p className="text-sm text-gray-600">
                  Rămas
                </p>
                <p
                  className={`text-2xl font-bold ${
                    spendStats.remaining > 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {spendStats.remaining.toFixed(2)} Lei
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div
                className="h-4 rounded-full overflow-hidden bg-gray-200"
              >
                <div
                  className={`h-full transition-all duration-500 ${
                    spendStats.monthSpend / spendStats.monthLimit > 0.9
                      ? 'bg-red-500'
                      : spendStats.monthSpend / spendStats.monthLimit > 0.7
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (spendStats.monthSpend / spendStats.monthLimit) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs mt-2 text-gray-600">
                {((spendStats.monthSpend / spendStats.monthLimit) * 100).toFixed(1)}% din buget
                utilizat
              </p>
            </div>
          </div>
        )}

        {/* Setări */}
        <div
          className="mb-6 p-6 rounded-xl border shadow-lg bg-white border-gray-200"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900">
            ⚙️ Setări
          </h2>

          <div className="space-y-4">
            {/* Toggle Enabled */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-gray-900">
                Autopilot Activat
              </span>
            </label>

            {/* Cost Limit */}
            <div>
              <label
                className="block text-sm font-medium mb-2 text-gray-700"
              >
                Limită Cost Lunar (Lei)
              </label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                min="50"
                max="5000"
                step="50"
                className="w-full md:w-48 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs mt-1 text-gray-600">
                Bugetul maxim pentru luna curentă (în Lei)
              </p>
            </div>

            {/* Butoane Acțiune */}
            <div className="flex gap-3">
              <button
                onClick={saveSettings}
                className="px-4 py-2 rounded-lg font-medium transition-colors bg-blue-500 hover:bg-blue-600 text-white"
              >
                💾 Salvează Setări
              </button>
              <button
                onClick={triggerNow}
                disabled={running}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  running
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {running ? '⏳ Rulează...' : '🚀 Rulează Acum'}
              </button>
              <button
                onClick={() => {
                  loadTasks();
                  loadSpendStats();
                }}
                className="px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 hover:bg-gray-300 text-gray-900"
              >
                🔄 Actualizează
              </button>
            </div>
          </div>
        </div>

        {/* Safety Rails */}
        <div
          className="mb-6 p-6 rounded-xl border shadow-lg bg-white border-gray-200"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900">
            🛡️ Safety Rails
          </h2>
          <p className="text-sm mb-4 text-gray-600">
            Toate verificările rulează automat înaintea fiecărui task.
          </p>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={safetyRails.checkBudget}
                onChange={(e) => {
                  const updated = { ...safetyRails, checkBudget: e.target.checked };
                  setSafetyRails(updated);
                  // Va fi salvat când se apasă "Salvează Setări"
                }}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-900">
                ✅ Verificare buget
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={safetyRails.checkDuplicate}
                onChange={(e) => {
                  const updated = { ...safetyRails, checkDuplicate: e.target.checked };
                  setSafetyRails(updated);
                  // Va fi salvat când se apasă "Salvează Setări"
                }}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-900">
                ✅ Detectare duplicate
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={safetyRails.checkModeration}
                onChange={(e) => {
                  const updated = { ...safetyRails, checkModeration: e.target.checked };
                  setSafetyRails(updated);
                  // Va fi salvat când se apasă "Salvează Setări"
                }}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-900">
                ✅ Filtrare conținut nepotrivit
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={safetyRails.enableFallback}
                onChange={(e) => {
                  const updated = { ...safetyRails, enableFallback: e.target.checked };
                  setSafetyRails(updated);
                  // Va fi salvat când se apasă "Salvează Setări"
                }}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-900">
                ✅ Fallback GPT automat
              </span>
            </label>
          </div>

          <div
            className={`mt-4 p-3 rounded-lg ${
              'bg-green-50 border border-green-200'
            }`}
          >
            <p className="text-sm text-green-700">
              🛡️ <strong>Safety Rails Active</strong> - Sistemul protejează automat împotriva erorilor, conținutului duplicat și depășirilor de buget.
            </p>
          </div>
        </div>

        {/* Jurnal Rulări */}
        <div
          className="mb-6 p-6 rounded-xl border shadow-lg bg-white border-gray-200"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900">
            📋 Jurnal Rulări
          </h2>
          <div
            className="max-h-48 overflow-y-auto space-y-2 bg-gray-50 p-4 rounded-lg"
          >
            {log.length === 0 ? (
              <p className="text-sm text-gray-500">
                Niciun jurnal disponibil
              </p>
            ) : (
              log.map((entry, i) => (
                <p key={i} className="text-sm font-mono text-gray-700">
                  {entry}
                </p>
              ))
            )}
          </div>
        </div>

        {/* Task-uri Recente */}
        <div
          className="p-6 rounded-xl border shadow-lg bg-white border-gray-200"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900">
            📊 Task-uri Recente
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-4 text-gray-700">
                    Tip
                  </th>
                  <th className="text-left py-2 px-4 text-gray-700">
                    Status
                  </th>
                  <th className="text-left py-2 px-4 text-gray-700">
                    Cost
                  </th>
                  <th className="text-left py-2 px-4 text-gray-700">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-8 text-gray-500"
                    >
                      Nu există task-uri
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-gray-200"
                    >
                      <td className="py-2 px-4 text-gray-900">
                        <span className="flex items-center gap-2">
                          <span>{getTypeIcon(task.type)}</span>
                          <span className="capitalize">{task.type}</span>
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            task.status === 'done'
                              ? 'bg-green-100 text-green-800'
                              : task.status === 'running'
                                ? 'bg-blue-100 text-blue-800'
                                : task.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : task.status === 'blocked'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {task.status === 'blocked' ? '🛡️ Blocked' : task.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-gray-900">
                        {Number(task.cost_usd || 0).toFixed(2)} Lei
                      </td>
                      <td className="py-2 px-4 text-gray-600">
                        {new Date(task.created_at).toLocaleString('ro-RO')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
