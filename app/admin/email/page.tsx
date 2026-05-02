"use client";

import React, { useState, useEffect } from "react";

interface NewsletterSubscriber {
  id: string;
  email: string;
  name?: string;
  subscribedAt: string;
  status: 'active' | 'unsubscribed';
}

interface NewsletterCampaign {
  id: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  sentAt?: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  recipientCount: number;
  sentCount?: number;
  failedCount?: number;
}

export default function EmailPage() {
  const [activeTab, setActiveTab] = useState<'emails' | 'newsletter' | 'subscribers'>('newsletter');
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSubscriberModal, setShowSubscriberModal] = useState(false);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    subject: '',
    htmlContent: '',
    textContent: ''
  });
  const [newSubscriber, setNewSubscriber] = useState({
    email: '',
    name: ''
  });
  const [resendEnabled, setResendEnabled] = useState(false);

  useEffect(() => {
    loadSubscribers();
    loadCampaigns();
    checkResendStatus();
  }, []);

  const checkResendStatus = () => {
    try {
      const resendConfig = localStorage.getItem('resend_config');
      const modules = JSON.parse(localStorage.getItem('admin_modules') || '[]');
      const resendModule = modules.find((m: any) => m.id === 'resend');
      
      if (resendConfig && resendModule?.enabled) {
        setResendEnabled(true);
      }
    } catch (e) {
      console.error('Error checking Resend status:', e);
    }
  };

  const loadSubscribers = () => {
    try {
      const saved = localStorage.getItem('newsletter_subscribers');
      if (saved) {
        setSubscribers(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading subscribers:', e);
    }
  };

  const loadCampaigns = () => {
    try {
      const saved = localStorage.getItem('newsletter_campaigns');
      if (saved) {
        setCampaigns(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading campaigns:', e);
    }
  };

  const saveSubscribers = (updated: NewsletterSubscriber[]) => {
    setSubscribers(updated);
    localStorage.setItem('newsletter_subscribers', JSON.stringify(updated));
  };

  const saveCampaigns = (updated: NewsletterCampaign[]) => {
    setCampaigns(updated);
    localStorage.setItem('newsletter_campaigns', JSON.stringify(updated));
  };

  const handleAddSubscriber = () => {
    if (!newSubscriber.email) {
      setMessage({ type: 'error', text: 'Completează adresa de email!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }

    const subscriber: NewsletterSubscriber = {
      id: `SUB-${Date.now()}`,
      email: newSubscriber.email,
      name: newSubscriber.name || '',
      subscribedAt: new Date().toISOString(),
      status: 'active'
    };

    const updated = [...subscribers, subscriber];
    saveSubscribers(updated);
    setNewSubscriber({ email: '', name: '' });
    setShowSubscriberModal(false);
    setMessage({ type: 'success', text: 'Abonat adăugat cu succes!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleSendNewsletter = async () => {
    if (!newCampaign.subject || !newCampaign.htmlContent) {
      setMessage({ type: 'error', text: 'Completează subiectul și conținutul!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }

    if (!resendEnabled) {
      setMessage({ type: 'error', text: 'Resend nu este configurat sau activat! Configurează Resend în Module.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
      return;
    }

    const activeSubscribers = subscribers.filter(s => s.status === 'active');
    if (activeSubscribers.length === 0) {
      setMessage({ type: 'error', text: 'Nu există abonați activi!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }

    setIsLoading(true);

    try {
      // Create campaign
      const campaign: NewsletterCampaign = {
        id: `CAMPAIGN-${Date.now()}`,
        subject: newCampaign.subject,
        htmlContent: newCampaign.htmlContent,
        textContent: newCampaign.textContent,
        status: 'sending',
        recipientCount: activeSubscribers.length,
        sentAt: new Date().toISOString()
      };

      // Get Resend config
      const resendConfig = JSON.parse(localStorage.getItem('resend_config') || '{}');

      // Send emails to all active subscribers via API route
      let sentCount = 0;
      let failedCount = 0;
      const recipientEmails = activeSubscribers.map(s => s.email);

      // Send email via API route
      const response = await fetch('/api/resend/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipientEmails,
          subject: campaign.subject,
          html: campaign.htmlContent,
          text: campaign.textContent,
          config: resendConfig
        }),
      });

      const result = await response.json();

      if (result.success) {
        sentCount = activeSubscribers.length;
        campaign.status = 'sent';
        campaign.sentCount = sentCount;
        
        setMessage({ type: 'success', text: `Newsletter trimis cu succes la ${sentCount} abonați!` });
      } else {
        failedCount = activeSubscribers.length;
        campaign.status = 'failed';
        campaign.failedCount = failedCount;
        
        setMessage({ type: 'error', text: `Eroare la trimitere: ${result.message}` });
      }

      // Save campaign
      const updatedCampaigns = [campaign, ...campaigns];
      saveCampaigns(updatedCampaigns);

      // Reset form
      setNewCampaign({ subject: '', htmlContent: '', textContent: '' });
      setShowSendModal(false);

      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error: any) {
      console.error('Error sending newsletter:', error);
      setMessage({ type: 'error', text: `Eroare: ${error.message || 'Eroare la trimiterea newsletter-ului'}` });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = (subscriberId: string) => {
    const updated = subscribers.map(s =>
      s.id === subscriberId ? { ...s, status: 'unsubscribed' as const } : s
    );
    saveSubscribers(updated);
    setMessage({ type: 'success', text: 'Abonat dezabonat cu succes!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleDeleteSubscriber = (subscriberId: string) => {
    const updated = subscribers.filter(s => s.id !== subscriberId);
    saveSubscribers(updated);
    setMessage({ type: 'success', text: 'Abonat șters cu succes!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const emailsData = [
    {
      id: "#E001",
      from: "john.doe@company.com",
      subject: "Contract Proposal Discussion",
      priority: "High",
      priorityColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      status: "Unread",
      statusColor: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      date: "23 Dec, 2024",
      time: "10:30 AM"
    },
    {
      id: "#E002",
      from: "sarah.wilson@client.com",
      subject: "Meeting Schedule Update",
      priority: "Medium",
      priorityColor: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
      status: "Read",
      statusColor: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
      date: "23 Dec, 2024",
      time: "09:15 AM"
    },
    {
      id: "#E003",
      from: "mike.chen@partner.com",
      subject: "Project Status Report",
      priority: "Low",
      priorityColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      status: "Replied",
      statusColor: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-400",
      date: "22 Dec, 2024",
      time: "4:45 PM"
    },
    {
      id: "#E004",
      from: "anna.smith@vendor.com",
      subject: "Invoice Payment Confirmation",
      priority: "High",
      priorityColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      status: "Unread",
      statusColor: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      date: "22 Dec, 2024",
      time: "2:20 PM"
    },
    {
      id: "#E005",
      from: "david.brown@support.com",
      subject: "Technical Support Request",
      priority: "Medium",
      priorityColor: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
      status: "In Progress",
      statusColor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
      date: "21 Dec, 2024",
      time: "11:30 AM"
    }
  ];

  return (
    <div className="p-5">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Gestionare Email-uri</h1>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('newsletter')}
                className={`px-4 py-2 text-sm rounded-md transition-all ${
                  activeTab === 'newsletter'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Newsletter
              </button>
              <button
                onClick={() => setActiveTab('subscribers')}
                className={`px-4 py-2 text-sm rounded-md transition-all ${
                  activeTab === 'subscribers'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Abonați ({subscribers.filter(s => s.status === 'active').length})
              </button>
              <button
                onClick={() => setActiveTab('emails')}
                className={`px-4 py-2 text-sm rounded-md transition-all ${
                  activeTab === 'emails'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Email-uri
              </button>
            </div>
          </div>
          {activeTab === 'newsletter' && (
            <button
              onClick={() => setShowSendModal(true)}
              disabled={!resendEnabled}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-md hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-send-plane-line mr-2"></i>
              Trimite Newsletter
            </button>
          )}
          {activeTab === 'subscribers' && (
            <button
              onClick={() => setShowSubscriberModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-md hover:from-green-600 hover:to-green-700 transition-all"
            >
              <i className="ri-user-add-line mr-2"></i>
              Adaugă Abonat
            </button>
          )}
        </div>
      </div>

      {/* Message */}
      {message.text && (
        <div className={`mb-6 p-4 rounded-lg backdrop-blur-lg shadow-xl border ${
          message.type === 'success'
            ? 'bg-green-500/20 text-green-300 border-green-400/30'
            : 'bg-red-500/20 text-red-300 border-red-400/30'
        }`}>
          {message.text}
        </div>
      )}

      {/* Resend Status Warning */}
      {activeTab === 'newsletter' && !resendEnabled && (
        <div className="mb-6 p-4 rounded-lg bg-yellow-500/20 text-yellow-300 border border-yellow-400/30">
          <div className="flex items-center gap-2">
            <i className="ri-error-warning-line text-xl"></i>
            <div>
              <p className="font-semibold">Resend nu este configurat!</p>
              <p className="text-sm">Configurează și activează Resend în <a href="/admin/modules" className="underline">Module</a> pentru a putea trimite newsletter-uri.</p>
            </div>
          </div>
        </div>
      )}

      {/* Newsletter Tab */}
      {activeTab === 'newsletter' && (
        <div className="space-y-6">
          {/* Campaigns List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Campanii Newsletter</h2>
            {campaigns.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <i className="ri-mail-send-line text-4xl mb-2"></i>
                <p>Nu există campanii newsletter</p>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{campaign.subject}</h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300 mt-2">
                          <span>Destinatari: {campaign.recipientCount}</span>
                          {campaign.sentCount !== undefined && <span>Trimiși: {campaign.sentCount}</span>}
                          {campaign.failedCount !== undefined && <span>Eșuate: {campaign.failedCount}</span>}
                          {campaign.sentAt && <span>Data: {new Date(campaign.sentAt).toLocaleString('ro-RO')}</span>}
                        </div>
                        <div className="mt-2">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            campaign.status === 'sent' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                            campaign.status === 'sending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                            campaign.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                            'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                          }`}>
                            {campaign.status === 'sent' ? 'Trimis' :
                             campaign.status === 'sending' ? 'Se trimite' :
                             campaign.status === 'failed' ? 'Eșuat' : 'Draft'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subscribers Tab */}
      {activeTab === 'subscribers' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50 dark:bg-gray-800/70">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nume</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data Abonare</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {subscribers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      Nu există abonați
                    </td>
                  </tr>
                ) : (
                  subscribers.map((subscriber) => (
                    <tr key={subscriber.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{subscriber.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{subscriber.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(subscriber.subscribedAt).toLocaleDateString('ro-RO')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          subscriber.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        }`}>
                          {subscriber.status === 'active' ? 'Activ' : 'Dezabonat'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          {subscriber.status === 'active' && (
                            <button
                              onClick={() => handleUnsubscribe(subscriber.id)}
                              className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400"
                              title="Dezabonează"
                            >
                              <i className="ri-notification-off-line"></i>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteSubscriber(subscriber.id)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400"
                            title="Șterge"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Emails Tab (Original) */}
      {activeTab === 'emails' && (
        <div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">TOTAL EMAILS</p>
              <p className="text-3xl font-bold">1,245</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-mail-line text-2xl"></i>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">UNREAD</p>
              <p className="text-3xl font-bold">23</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-mail-unread-line text-2xl"></i>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">SENT TODAY</p>
              <p className="text-3xl font-bold">45</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-send-plane-line text-2xl"></i>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">DRAFTS</p>
              <p className="text-3xl font-bold">12</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-draft-line text-2xl"></i>
            </div>
          </div>
        </div>
      </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">TOTAL EMAILS</p>
                  <p className="text-3xl font-bold">1,245</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <i className="ri-mail-line text-2xl"></i>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">UNREAD</p>
                  <p className="text-3xl font-bold">23</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <i className="ri-mail-unread-line text-2xl"></i>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">SENT TODAY</p>
                  <p className="text-3xl font-bold">45</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <i className="ri-send-plane-line text-2xl"></i>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">DRAFTS</p>
                  <p className="text-3xl font-bold">12</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <i className="ri-draft-line text-2xl"></i>
                </div>
              </div>
            </div>
          </div>

          {/* Emails Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800/50 dark:bg-gray-800/70">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">From</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subject</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {emailsData.map((email, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {email.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center mr-3">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              {email.from.split('@')[0].split('.').map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{email.from}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {email.subject}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${email.priorityColor}`}>
                          {email.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${email.statusColor}`}>
                          {email.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {email.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {email.time}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          <i className="ri-more-2-fill"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Send Newsletter Modal */}
      {showSendModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowSendModal(false)}
        >
          <div
            className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-3xl w-full shadow-2xl border border-white/20 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Trimite Newsletter</h2>
              <button
                onClick={() => setShowSendModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Subiect *
                </label>
                <input
                  type="text"
                  value={newCampaign.subject}
                  onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Subiect newsletter"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Conținut HTML *
                </label>
                <textarea
                  value={newCampaign.htmlContent}
                  onChange={(e) => setNewCampaign({ ...newCampaign, htmlContent: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  rows={10}
                  placeholder="<html>...</html>"
                />
                <p className="text-xs text-gray-400 mt-1">
                  HTML pentru newsletter (se trimite la {subscribers.filter(s => s.status === 'active').length} abonați activi)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Conținut Text (opțional)
                </label>
                <textarea
                  value={newCampaign.textContent}
                  onChange={(e) => setNewCampaign({ ...newCampaign, textContent: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  rows={5}
                  placeholder="Text alternativ pentru clienții care nu suportă HTML"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSendModal(false)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all duration-300"
              >
                Anulează
              </button>
              <button
                onClick={handleSendNewsletter}
                disabled={isLoading || !newCampaign.subject || !newCampaign.htmlContent || !resendEnabled}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Se trimite...
                  </>
                ) : (
                  <>
                    <i className="ri-send-plane-line mr-2"></i>
                    Trimite Newsletter
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Subscriber Modal */}
      {showSubscriberModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowSubscriberModal(false)}
        >
          <div
            className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Adaugă Abonat</h2>
              <button
                onClick={() => setShowSubscriberModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  value={newSubscriber.email}
                  onChange={(e) => setNewSubscriber({ ...newSubscriber, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nume (opțional)
                </label>
                <input
                  type="text"
                  value={newSubscriber.name}
                  onChange={(e) => setNewSubscriber({ ...newSubscriber, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Nume complet"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSubscriberModal(false)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all duration-300"
              >
                Anulează
              </button>
              <button
                onClick={handleAddSubscriber}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-300 font-medium"
              >
                Adaugă Abonat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
