"use client";

import { useState, useEffect } from 'react';
import { 
  ChatBubbleLeftRightIcon, 
  MicrophoneIcon, 
  SpeakerWaveIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  CpuChipIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

// Icon mapping pentru module
const IconMap: Record<string, any> = {
  ChatBubbleLeftRightIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  CpuChipIcon,
  ArrowPathIcon,
};

interface AIModule {
  id: string;
  name: string;
  description: string;
  icon: any;
  status: 'active' | 'inactive' | 'error';
  lastRun?: string;
  logs: LogEntry[];
  config: any;
}

interface LogEntry {
  id: string;
  timestamp: string;
  module: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: any;
  duration?: number;
}

export default function AIMonitorPage() {
  const [modules, setModules] = useState<AIModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5); // seconds

  useEffect(() => {
    loadModules();
    
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadModules();
      }, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  const loadModules = async () => {
    try {
      const response = await fetch('/api/admin/ai/modules');
      if (response.ok) {
        const data = await response.json();
        setModules(data.modules || []);
      }
    } catch (error) {
      console.error('Error loading modules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModuleLogs = async (moduleId: string) => {
    try {
      const response = await fetch(`/api/admin/ai/logs?module=${moduleId}&limit=100`);
      if (response.ok) {
        const data = await response.json();
        setModules(prev => prev.map(m => 
          m.id === moduleId ? { ...m, logs: data.logs || [] } : m
        ));
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  };

  const testModule = async (moduleId: string, testData?: any) => {
    try {
      const response = await fetch('/api/admin/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, testData }),
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Test completed: ${JSON.stringify(result, null, 2)}`);
        loadModules();
        if (selectedModule === moduleId) {
          loadModuleLogs(moduleId);
        }
      } else {
        const error = await response.json();
        alert(`Test failed: ${error.error}`);
      }
    } catch (error: any) {
      alert(`Test error: ${error.message}`);
    }
  };

  const selectedModuleData = modules.find(m => m.id === selectedModule);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400';
      case 'inactive':
        return 'text-gray-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 border-green-500/50';
      case 'inactive':
        return 'bg-gray-500/20 border-gray-500/50';
      case 'error':
        return 'bg-red-500/20 border-red-500/50';
      default:
        return 'bg-gray-500/20 border-gray-500/50';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-green-400 bg-green-500/20';
      case 'info':
        return 'text-blue-400 bg-blue-500/20';
      case 'warning':
        return 'text-yellow-400 bg-yellow-500/20';
      case 'error':
        return 'text-red-400 bg-red-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircleIcon className="w-4 h-4" />;
      case 'info':
        return <InformationCircleIcon className="w-4 h-4" />;
      case 'warning':
        return <ExclamationTriangleIcon className="w-4 h-4" />;
      case 'error':
        return <XCircleIcon className="w-4 h-4" />;
      default:
        return <InformationCircleIcon className="w-4 h-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen p-8 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className={`mt-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Loading AI modules...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-8 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                AI Modules Monitor
              </h1>
              <p className={`mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Monitorizează și debug toate modulele AI
              </p>
            </div>
            <div className="flex items-center gap-4">
              <label className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <span>Auto-refresh</span>
              </label>
              {autoRefresh && (
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className={`px-3 py-2 rounded-lg border ${
                    isDarkMode 
                      ? 'bg-gray-800 border-gray-700 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                </select>
              )}
              <button
                onClick={loadModules}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  isDarkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-white'
                    : 'bg-white hover:bg-gray-100 text-gray-900 border border-gray-300'
                }`}
              >
                <ArrowPathIcon className="w-5 h-5" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Modules List */}
          <div className="lg:col-span-1">
            <div className={`rounded-lg border p-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Module AI
              </h2>
              <div className="space-y-2">
                {modules.map((module) => (
                  <button
                    key={module.id}
                    onClick={() => {
                      setSelectedModule(module.id);
                      loadModuleLogs(module.id);
                    }}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      selectedModule === module.id
                        ? isDarkMode
                          ? 'bg-blue-500/20 border-blue-500/50'
                          : 'bg-blue-50 border-blue-300'
                        : isDarkMode
                        ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {(() => {
                          const IconComponent = IconMap[module.icon] || CpuChipIcon;
                          return <IconComponent className={`w-6 h-6 mt-1 ${getStatusColor(module.status)}`} />;
                        })()}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              {module.name}
                            </h3>
                            <span className={`px-2 py-0.5 rounded text-xs ${getStatusBg(module.status)} ${getStatusColor(module.status)}`}>
                              {module.status}
                            </span>
                          </div>
                          <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {module.description}
                          </p>
                          {module.lastRun && (
                            <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              Last run: {new Date(module.lastRun).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Module Details & Logs */}
          <div className="lg:col-span-2">
            {selectedModuleData ? (
              <div className="space-y-6">
                {/* Module Info */}
                <div className={`rounded-lg border p-6 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const IconComponent = IconMap[selectedModuleData.icon] || CpuChipIcon;
                        return <IconComponent className={`w-8 h-8 ${getStatusColor(selectedModuleData.status)}`} />;
                      })()}
                      <div>
                        <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {selectedModuleData.name}
                        </h2>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {selectedModuleData.description}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => testModule(selectedModuleData.id)}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                        isDarkMode
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                    >
                      <PlayIcon className="w-5 h-5" />
                      Test Module
                    </button>
                  </div>

                  {/* Config */}
                  {selectedModuleData.config && (
                    <div className={`mt-4 p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Configuration
                      </h3>
                      <pre className={`text-xs overflow-auto ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {JSON.stringify(selectedModuleData.config, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Logs */}
                <div className={`rounded-lg border p-6 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Logs ({selectedModuleData.logs?.length || 0})
                    </h3>
                    <button
                      onClick={() => loadModuleLogs(selectedModuleData.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
                        isDarkMode
                          ? 'bg-gray-700 hover:bg-gray-600 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                      }`}
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                      Refresh
                    </button>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {selectedModuleData.logs && selectedModuleData.logs.length > 0 ? (
                      selectedModuleData.logs.map((log) => (
                        <div
                          key={log.id}
                          className={`p-3 rounded-lg border ${isDarkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-1.5 rounded ${getLogLevelColor(log.level)}`}>
                              {getLogIcon(log.level)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {new Date(log.timestamp).toLocaleString()}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${getLogLevelColor(log.level)}`}>
                                  {log.level}
                                </span>
                                {log.duration && (
                                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                    {log.duration}ms
                                  </span>
                                )}
                              </div>
                              <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                {log.message}
                              </p>
                              {log.details && (
                                <details className="mt-2">
                                  <summary className={`text-xs cursor-pointer ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Details
                                  </summary>
                                  <pre className={`mt-2 text-xs overflow-auto p-2 rounded ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        No logs available
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`rounded-lg border p-12 text-center ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <CpuChipIcon className={`w-16 h-16 mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                <p className={`text-lg ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Select a module to view details and logs
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

