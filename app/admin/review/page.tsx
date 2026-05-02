"use client";

import { useEffect, useState } from 'react';

interface BlockedTask {
  id: string;
  type: string;
  payload: any;
  status: string;
  cost_usd: number;
  created_at: string;
  review_comment?: string;
  risk_score?: number;
  risk_explanation?: string;
}

export default function ReviewPanel() {
  const [tasks, setTasks] = useState<BlockedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    // Detect dark mode
    const savedDarkMode = localStorage.getItem('adminDarkMode');
    if (savedDarkMode !== null) {
      setIsDarkMode(JSON.parse(savedDarkMode));
    }

    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tasks/list');
      const data = await res.json();
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveTask = async (id: string) => {
    try {
      setProcessing(id);
      const res = await fetch('/api/tasks/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (data.success) {
        // Reîncarcă lista
        await load();
      } else {
        alert(`Eroare: ${data.error || 'Nu s-a putut aproba task-ul'}`);
      }
    } catch (error: any) {
      console.error('Error approving task:', error);
      alert(`Eroare: ${error.message || 'Nu s-a putut aproba task-ul'}`);
    } finally {
      setProcessing(null);
    }
  };

  const rejectTask = async (id: string) => {
    try {
      setProcessing(id);
      const res = await fetch('/api/tasks/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (data.success) {
        // Reîncarcă lista
        await load();
      } else {
        alert(`Eroare: ${data.error || 'Nu s-a putut respinge task-ul'}`);
      }
    } catch (error: any) {
      console.error('Error rejecting task:', error);
      alert(`Eroare: ${error.message || 'Nu s-a putut respinge task-ul'}`);
    } finally {
      setProcessing(null);
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'seo':
        return 'bg-blue-100 text-blue-800';
      case 'article':
        return 'bg-blue-100 text-blue-800';
      case 'video':
        return 'bg-pink-100 text-pink-800';
      case 'social':
        return 'bg-green-100 text-green-800';
      case 'email':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className={`text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Se încarcă...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} transition-colors duration-300`}>
      <div className="max-w-5xl mx-auto p-8 md:p-10">
        <div className="mb-8">
          <h1 className={`text-4xl font-bold mb-2 text-center ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            🧑‍⚖️ Panou de Revizuire AI
          </h1>
          <p className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Task-uri blocate de Safety Rails care necesită aprobare manuală
          </p>
        </div>

        {tasks.length === 0 ? (
          <div
            className={`text-center p-12 rounded-xl border ${
              isDarkMode
                ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700'
                : 'bg-white border-gray-200'
            }`}
          >
            <div className="text-6xl mb-4">✅</div>
            <p className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Nu există task-uri blocate
            </p>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Toate task-urile au fost procesate sau nu există task-uri care necesită aprobare.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`border rounded-xl p-6 shadow-lg transition-all duration-300 ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 hover:border-gray-600'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getTypeIcon(task.type)}</span>
                    <div>
                      <h2
                        className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                      >
                        {task.type.toUpperCase()}
                      </h2>
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${getTypeColor(
                          task.type
                        )}`}
                      >
                        {task.type}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-2">
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {new Date(task.created_at).toLocaleString('ro-RO')}
                    </span>
                    {task.cost_usd > 0 && (
                      <span
                        className={`text-sm font-semibold ${
                          isDarkMode ? 'text-yellow-400' : 'text-yellow-600'
                        }`}
                      >
                        Cost: ${Number(task.cost_usd).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Payload Preview */}
                <div
                  className={`p-4 rounded-lg mt-4 overflow-x-auto ${
                    isDarkMode ? 'bg-gray-900/50' : 'bg-gray-50'
                  }`}
                >
                  <pre className="text-sm whitespace-pre-wrap break-words">
                    {JSON.stringify(task.payload, null, 2)}
                  </pre>
                </div>

                {/* Review Comment / Reason */}
                {task.review_comment && (
                  <div
                    className={`mt-4 p-3 rounded-lg border ${
                      isDarkMode
                        ? 'bg-orange-900/20 border-orange-500/30'
                        : 'bg-orange-50 border-orange-200'
                    }`}
                  >
                    <p className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                      🛡️ Motiv blocare:
                    </p>
                    <p className={`text-sm ${isDarkMode ? 'text-orange-200' : 'text-orange-600'}`}>
                      {task.review_comment}
                    </p>
                  </div>
                )}

                {/* Risk Score */}
                {task.risk_score !== undefined && task.risk_score !== null && (
                  <div className="flex items-center gap-3 mt-4">
                    <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      🔎 Risc estimat:
                    </span>
                    <span
                      className={`font-bold text-lg ${
                        task.risk_score < 25
                          ? isDarkMode
                            ? 'text-green-400'
                            : 'text-green-600'
                          : task.risk_score < 60
                            ? isDarkMode
                              ? 'text-yellow-400'
                              : 'text-yellow-600'
                            : isDarkMode
                              ? 'text-red-400'
                              : 'text-red-600'
                      }`}
                    >
                      {task.risk_score} / 100
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        task.risk_score < 25
                          ? isDarkMode
                            ? 'bg-green-900/30 text-green-300'
                            : 'bg-green-100 text-green-700'
                          : task.risk_score < 60
                            ? isDarkMode
                              ? 'bg-yellow-900/30 text-yellow-300'
                              : 'bg-yellow-100 text-yellow-700'
                            : isDarkMode
                              ? 'bg-red-900/30 text-red-300'
                              : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {task.risk_score < 25
                        ? 'Risc Scăzut'
                        : task.risk_score < 60
                          ? 'Risc Mediu'
                          : task.risk_score < 80
                            ? 'Risc Ridicat'
                            : 'Risc Critic'}
                    </span>
                  </div>
                )}

                {/* Risk Explanation */}
                {task.risk_explanation && (
                  <div
                    className={`mt-4 p-3 rounded-lg border-l-4 ${
                      task.risk_score !== undefined && task.risk_score !== null
                        ? task.risk_score < 25
                          ? isDarkMode
                            ? 'bg-green-900/10 border-green-500/50'
                            : 'bg-green-50 border-green-400'
                          : task.risk_score < 60
                            ? isDarkMode
                              ? 'bg-yellow-900/10 border-yellow-500/50'
                              : 'bg-yellow-50 border-yellow-400'
                            : isDarkMode
                              ? 'bg-red-900/10 border-red-500/50'
                              : 'bg-red-50 border-red-400'
                        : isDarkMode
                          ? 'bg-gray-800/50 border-gray-500/50'
                          : 'bg-gray-50 border-gray-400'
                    }`}
                  >
                    <p className={`text-sm font-semibold mb-1 ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-800'
                    }`}>
                      💬 Explicație AI:
                    </p>
                    <p className={`text-sm italic ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {task.risk_explanation}
                    </p>
                  </div>
                )}

                {/* Safety Rails Message */}
                {task.payload?.safety_rail_message && (
                  <div
                    className={`mt-3 p-3 rounded-lg border ${
                      isDarkMode
                        ? 'bg-red-900/20 border-red-500/30'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <p className={`text-sm ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
                      <strong>Safety Rails:</strong> {task.payload.safety_rail_message}
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => approveTask(task.id)}
                    disabled={processing === task.id}
                    className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                      processing === task.id
                        ? 'bg-gray-400 cursor-not-allowed text-white'
                        : isDarkMode
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    {processing === task.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Procesare...
                      </span>
                    ) : (
                      '✅ Aprobă'
                    )}
                  </button>
                  <button
                    onClick={() => rejectTask(task.id)}
                    disabled={processing === task.id}
                    className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                      processing === task.id
                        ? 'bg-gray-400 cursor-not-allowed text-white'
                        : isDarkMode
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-red-500 hover:bg-red-600 text-white'
                    }`}
                  >
                    {processing === task.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Procesare...
                      </span>
                    ) : (
                      '❌ Respinge'
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={load}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              isDarkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? '⏳ Se încarcă...' : '🔄 Actualizează'}
          </button>
          <button
            onClick={async () => {
              try {
                setLoading(true);
                const res = await fetch('/api/tasks/risk-evaluate');
                const data = await res.json();
                if (data.success) {
                  alert(`✅ Evaluare risc completă: ${data.evaluated} task-uri evaluate`);
                  await load();
                } else {
                  alert(`❌ Eroare: ${data.error || 'Nu s-a putut evalua riscul'}`);
                }
              } catch (error: any) {
                alert(`❌ Eroare: ${error.message || 'Nu s-a putut evalua riscul'}`);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              isDarkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            🎯 Evaluează Risc
          </button>
        </div>
      </div>
    </div>
  );
}

