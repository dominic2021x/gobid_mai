"use client";

import React, { useState, useEffect } from "react";
import supabase from "@/lib/supabase";

interface Report {
  id: string;
  reporter_user_id: string;
  reported_user_id: string | null;
  product_id: string | null;
  conversation_id: string | null;
  product_title: string;
  reported_user_name: string;
  reporter_name: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReportChat {
  id: string;
  report_id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ReportChatMessage {
  id: string;
  chat_id: string;
  sender_user_id: string | null;
  is_admin: boolean;
  is_system_message: boolean;
  message_text: string;
  is_read: boolean;
  created_at: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedReportChat, setSelectedReportChat] = useState<ReportChat | null>(null);
  const [reportChatMessages, setReportChatMessages] = useState<ReportChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [adminNotes, setAdminNotes] = useState('');
  const [statusChange, setStatusChange] = useState<string>('');

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  useEffect(() => {
    if (selectedReport) {
      loadReportChat(selectedReport.id);
    }
  }, [selectedReport]);

  useEffect(() => {
    if (selectedReportChat) {
      loadReportChatMessages(selectedReportChat.id);
    }
  }, [selectedReportChat]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error('No session');
        return;
      }

      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('limit', '100');

      const response = await fetch(`/api/user/report?${params.toString()}`, {
        method: 'GET',
        headers: {
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load reports:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        // Arată eroarea în UI pentru debugging
        alert(`Eroare la încărcarea rapoartelor: ${errorData.error || errorData.message || 'Eroare necunoscută'}\n\nStatus: ${response.status}\n\nDetalii: ${JSON.stringify(errorData, null, 2)}`);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReportChat = async (reportId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await fetch('/api/report-chat', {
        method: 'GET',
        headers: {
        },
      });

      if (response.ok) {
        const data = await response.json();
        const chat = data.chats?.find((c: ReportChat) => c.report_id === reportId);
        if (chat) {
          setSelectedReportChat(chat);
        } else {
          setSelectedReportChat(null);
          setReportChatMessages([]);
        }
      }
    } catch (error) {
      console.error('[loadReportChat] Error:', error);
    }
  };

  const loadReportChatMessages = async (chatId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await fetch(`/api/report-chat/messages?chatId=${chatId}`, {
        method: 'GET',
        headers: {
        },
      });

      if (response.ok) {
        const data = await response.json();
        setReportChatMessages(data.messages || []);
      }
    } catch (error) {
      console.error('[loadReportChatMessages] Error:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedReportChat) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await fetch('/api/report-chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: selectedReportChat.id,
          messageText: newMessage.trim(),
          isSystemMessage: false
        }),
      });

      if (response.ok) {
        setNewMessage('');
        await loadReportChatMessages(selectedReportChat.id);
        // Scroll la ultimul mesaj
        setTimeout(() => {
          const messagesContainer = document.getElementById('report-chat-messages');
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }, 100);
      } else {
        alert('Eroare la trimiterea mesajului');
      }
    } catch (error) {
      console.error('[sendMessage] Error:', error);
      alert('Eroare la trimiterea mesajului');
    }
  };

  const updateReportStatus = async (reportId: string, newStatus: string, notes?: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        return;
      }

      const { data: currentUser } = await supabase.auth.getUser();
      const updateData: any = {
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.user?.id || null,
      };

      if (notes) {
        updateData.admin_notes = notes;
      }

      const { error } = await supabase
        .from('user_reports')
        .update(updateData)
        .eq('id', reportId);

      if (error) {
        console.error('Error updating report:', error);
        alert('Eroare la actualizarea raportului');
      } else {
        await loadReports();
        setSelectedReport(null);
        setAdminNotes('');
        setStatusChange('');
      }
    } catch (error) {
      console.error('Error updating report:', error);
      alert('Eroare la actualizarea raportului');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-orange-500 text-white';
      case 'reviewed': return 'bg-blue-500 text-white';
      case 'resolved': return 'bg-green-500 text-white';
      case 'dismissed': return 'bg-gray-500 text-white';
      default: return 'bg-gray-400 text-white';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'În așteptare';
      case 'reviewed': return 'Examinat';
      case 'resolved': return 'Rezolvat';
      case 'dismissed': return 'Respins';
      default: return status;
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'spam': return 'Spam sau mesaje nedorite';
      case 'harassment': return 'Hărțuire sau comportament abuziv';
      case 'fake': return 'Cont fals sau fraudulos';
      case 'inappropriate': return 'Conținut neadecvat';
      case 'scam': return 'Înșelătorie sau scam';
      case 'other': return 'Alt motiv';
      default: return reason;
    }
  };

  const standardResponses = [
    {
      label: 'Confirmare primire raport',
      message: 'Bună ziua,\n\nVă mulțumim pentru raportul trimis. Am primit raportul dvs. și îl vom examina în cel mai scurt timp posibil.\n\nVă vom contacta în curând cu privire la acest caz.\n\nCu respect,\nEchipa GoBid'
    },
    {
      label: 'Raport în curs de examinare',
      message: 'Bună ziua,\n\nVă informăm că raportul dvs. este în curs de examinare de către echipa noastră.\n\nVă vom ține la curent cu privire la statusul investigației.\n\nVă mulțumim pentru răbdare.\n\nCu respect,\nEchipa GoBid'
    },
    {
      label: 'Măsuri întreprinse',
      message: 'Bună ziua,\n\nÎn urma examinării raportului dvs., am luat măsuri corespunzătoare conform termenilor și condițiilor platformei noastre.\n\nVă mulțumim pentru colaborarea dvs. în menținerea unui mediu sigur pentru toți utilizatorii.\n\nCu respect,\nEchipa GoBid'
    },
    {
      label: 'Raport rezolvat',
      message: 'Bună ziua,\n\nVă informăm că raportul dvs. a fost rezolvat. Cazul a fost tratat conform procedurilor noastre.\n\nDacă întâmpinați alte probleme în viitor, vă rugăm să nu ezitați să ne contactați.\n\nCu respect,\nEchipa GoBid'
    },
    {
      label: 'Cerere informații suplimentare',
      message: 'Bună ziua,\n\nPentru a putea examina complet raportul dvs., am nevoie de câteva informații suplimentare.\n\nVă rugăm să ne furnizați mai multe detalii despre situația raportată.\n\nVă mulțumim pentru înțelegere.\n\nCu respect,\nEchipa GoBid'
    },
    {
      label: 'Raport respins - motive insuficiente',
      message: 'Bună ziua,\n\nDupă examinarea raportului dvs., am constatat că nu există suficiente dovezi pentru a lua măsuri disciplinare.\n\nÎn cazul în care apare informații noi, vă rugăm să ne contactați din nou.\n\nCu respect,\nEchipa GoBid'
    },
    {
      label: 'Răspuns generic de asistență',
      message: 'Bună ziua,\n\nVă mulțumim că ne-ați contactat. Echipa noastră de asistență vă va ajuta în cel mai scurt timp posibil.\n\nDacă aveți întrebări suplimentare, vă rugăm să nu ezitați să ne contactați.\n\nCu respect,\nEchipa GoBid'
    },
    {
      label: 'Întâmpinare problemă tehnice',
      message: 'Bună ziua,\n\nVă mulțumim pentru raportare. Pare să fie o problemă tehnică pe care o investigăm în prezent.\n\nVă vom ține la curent cu progresul și vă mulțumim pentru răbdare.\n\nCu respect,\nEchipa GoBid'
    }
  ];

  const handleStandardResponseSelect = (response: string) => {
    setNewMessage(response);
    // Focus pe input după selectare
    setTimeout(() => {
      const input = document.querySelector('input[placeholder="Scrie un mesaj către utilizator..."]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 100);
  };

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapoarte utilizatori</h1>
          <p className="text-sm text-gray-600 mt-1">Gestionare rapoarte trimise de utilizatori</p>
        </div>
        {pendingCount > 0 && (
          <div className="px-4 py-2 bg-orange-100 text-orange-800 rounded-lg font-semibold">
            {pendingCount} {pendingCount === 1 ? 'raport' : 'rapoarte'} în așteptare
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Toate ({reports.length})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'pending'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          În așteptare ({pendingCount})
        </button>
        <button
          onClick={() => setStatusFilter('reviewed')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'reviewed'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Examinat ({reports.filter(r => r.status === 'reviewed').length})
        </button>
        <button
          onClick={() => setStatusFilter('resolved')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'resolved'
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Rezolvat ({reports.filter(r => r.status === 'resolved').length})
        </button>
        <button
          onClick={() => setStatusFilter('dismissed')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'dismissed'
              ? 'bg-gray-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Respins ({reports.filter(r => r.status === 'dismissed').length})
        </button>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Se încarcă rapoartele...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Nu există rapoarte {statusFilter !== 'all' ? `cu statusul "${getStatusLabel(statusFilter)}"` : ''}
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedReport(report);
                setAdminNotes(report.admin_notes || '');
                setStatusChange(report.status);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(report.status)}`}>
                      {getStatusLabel(report.status)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(report.created_at).toLocaleDateString('ro-RO', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{report.product_title}</h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      <span className="font-medium">Raportat:</span> {report.reported_user_name}
                    </p>
                    <p>
                      <span className="font-medium">Raportat de:</span> {report.reporter_name}
                    </p>
                    <p>
                      <span className="font-medium">Motiv:</span> {getReasonLabel(report.reason)}
                    </p>
                  </div>
                  <p className="text-sm text-gray-700 mt-2 line-clamp-2">{report.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => {
            setSelectedReport(null);
            setAdminNotes('');
            setStatusChange('');
          }}
        >
          <div
            className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Detalii raport</h2>
              <button
                onClick={() => {
                  setSelectedReport(null);
                  setAdminNotes('');
                  setStatusChange('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Report Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">Status</label>
                  <div className="mt-1">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedReport.status)}`}>
                      {getStatusLabel(selectedReport.status)}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Data raportului</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(selectedReport.created_at).toLocaleString('ro-RO')}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Produs</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedReport.product_title}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Motiv</label>
                  <p className="mt-1 text-sm text-gray-900">{getReasonLabel(selectedReport.reason)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Utilizator raportat</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedReport.reported_user_name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Raportat de</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedReport.reporter_name}</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-semibold text-gray-900">Descriere</label>
                <div className="mt-2 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedReport.description}</p>
                </div>
              </div>

              {/* Chat conversație */}
              {selectedReportChat && (
                <div className="border-t border-gray-200 pt-6 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Conversație cu utilizatorul</h3>
                  
                  {/* Mesajele din chat */}
                  <div 
                    id="report-chat-messages"
                    className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto space-y-4"
                  >
                    {reportChatMessages.length === 0 ? (
                      <div className="text-center py-4 text-gray-500 text-sm">Nu există mesaje încă</div>
                    ) : (
                      reportChatMessages.map((msg) => {
                        const isSystemMessage = msg.is_system_message === true || msg.sender_user_id === null;
                        const isAdminMessage = msg.is_admin === true;

                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isAdminMessage ? 'justify-end' : 'justify-start'}`}
                          >
                            {isSystemMessage ? (
                              <div className="flex justify-center my-2 w-full">
                                <div className="inline-flex flex-col items-center gap-1 max-w-[85%]">
                                  <div className="relative group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200/50 shadow-sm text-center">
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.message_text}</p>
                                  </div>
                                  <span className="text-xs text-gray-400">
                                    {new Date(msg.created_at).toLocaleString('ro-RO', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className={`flex gap-2 max-w-[70%] ${isAdminMessage ? 'flex-row-reverse' : ''}`}>
                                <div className={`px-4 py-2 rounded-lg ${isAdminMessage ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                                  <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>
                                  <span className={`text-xs mt-1 block ${isAdminMessage ? 'text-blue-100' : 'text-gray-500'}`}>
                                    {new Date(msg.created_at).toLocaleTimeString('ro-RO', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Răspunsuri standard */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Răspunsuri standard
                    </label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          const selectedResponse = standardResponses.find(r => r.label === e.target.value);
                          if (selectedResponse) {
                            handleStandardResponseSelect(selectedResponse.message);
                          }
                        }
                        e.target.value = '';
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Selectează un răspuns standard...</option>
                      {standardResponses.map((response, index) => (
                        <option key={index} value={response.label}>
                          {response.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Input pentru mesaje */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Mesaj personalizat
                    </label>
                    <div className="flex gap-2">
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder="Scrie un mesaj către utilizator... (Ctrl+Enter pentru trimitere)"
                        rows={4}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                        className="px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start h-fit"
                      >
                        Trimite
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Actions */}
              <div className="border-t border-gray-200 pt-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Schimbă status</label>
                  <select
                    value={statusChange}
                    onChange={(e) => setStatusChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pending">În așteptare</option>
                    <option value="reviewed">Examinat</option>
                    <option value="resolved">Rezolvat</option>
                    <option value="dismissed">Respins</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Notițe admin</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={4}
                    placeholder="Adaugă notițe pentru acest raport..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedReport(null);
                      setSelectedReportChat(null);
                      setReportChatMessages([]);
                      setNewMessage('');
                      setAdminNotes('');
                      setStatusChange('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    Anulează
                  </button>
                  <button
                    onClick={() => {
                      if (statusChange && statusChange !== selectedReport.status) {
                        updateReportStatus(selectedReport.id, statusChange, adminNotes);
                      } else if (adminNotes && adminNotes !== selectedReport.admin_notes) {
                        updateReportStatus(selectedReport.id, selectedReport.status, adminNotes);
                      }
                    }}
                    disabled={statusChange === selectedReport.status && adminNotes === (selectedReport.admin_notes || '')}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Salvează modificări
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
