"use client";

import React, { useState, useEffect, useRef } from "react";
export default function TicketsPage() {
  const [ticketsData, setTicketsData] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [adminNotifications, setAdminNotifications] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState<{ticketId?: string, isBulk?: boolean, count?: number} | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  
  // AI Toggle for chat tickets
  const [aiEnabled, setAiEnabled] = useState<{[ticketId: string]: boolean}>({});
  // Setări Asistenți AI - removed (alt sistem); kept for compatibility
  const [showAssistantSettings] = useState(false);
  
  // Cache for user info to avoid repeated API calls
  const [userInfoCache, setUserInfoCache] = useState<{[key: string]: {userEmail: string, userAvatar: string, userName: string, userInitial: string}}>({});

  // Echipă suport (identică cu dashboard/executor/support) – pentru afișare același agent ca la user
  const SUPPORT_AGENTS = [
    { avatar: '/avatare/Alina.png', name: 'Alina' },
    { avatar: '/avatare/Andreea.png', name: 'Andreea' },
    { avatar: '/avatare/Cristina.png', name: 'Cristina' },
    { avatar: '/avatare/Iulia.png', name: 'Iulia' },
    { avatar: '/avatare/Simona.png', name: 'Simona' },
  ];

  const resolveAgentFromMessage = (msg: any): { avatar: string; name: string } => {
    if (!msg) return SUPPORT_AGENTS[0];
    const idx = typeof msg.agentIndex === 'number' && msg.agentIndex >= 0 && msg.agentIndex < SUPPORT_AGENTS.length
      ? msg.agentIndex
      : (() => {
          const attachments = msg.attachments || [];
          const meta = attachments.find((a: any) => a && (a.type === 'agent_meta' || typeof a?.agentIndex !== 'undefined'));
          if (!meta) return null;
          const n = Number(meta.agentIndex);
          if (!Number.isFinite(n)) return null;
          const i = Math.trunc(n);
          return i >= 0 && i < SUPPORT_AGENTS.length ? i : null;
        })();
    const agent = idx != null ? SUPPORT_AGENTS[idx] : null;
    if (agent) return agent;
    if (Array.isArray(msg.attachments)) {
      const meta = msg.attachments.find((a: any) => a?.agentName);
      if (meta?.agentName && meta?.agentAvatar) return { name: meta.agentName, avatar: meta.agentAvatar };
    }
    return SUPPORT_AGENTS[0];
  };

  const getPrimaryAgentFromTicket = (ticket: any) => {
    const messages = Array.isArray(ticket?.messages) ? ticket.messages : [];
    const firstAi = messages.find((m: any) => m.sender === 'ai');
    return firstAi ? resolveAgentFromMessage(firstAi) : SUPPORT_AGENTS[0];
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500 text-white';
      case 'In asteptare raspuns': return 'bg-orange-500 text-white';
      case 'Am raspuns': return 'bg-blue-500 text-white';
      case 'Am primit raspuns': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  // Helper function to get user info from ticket (synchronous version for immediate use)
  const getUserInfoFromTicket = (ticket: any) => {
    const cacheKey = `${ticket.id}_${ticket.userEmail || ''}_${ticket.userId || ''}`;
    
    // Return cached value if available
    if (userInfoCache[cacheKey]) {
      return userInfoCache[cacheKey];
    }
    
    let userEmail = ticket.userEmail || '';
    let userAvatar = '';
    let userName = '';
    let userInitial = 'U';
    
    // Try to extract email from localStorage keys if not present
    if (!userEmail && typeof window !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('userTickets_')) {
            const emailFromKey = key.replace('userTickets_', '');
            const userTickets = JSON.parse(localStorage.getItem(key) || '[]');
            if (userTickets.some((t: any) => t.id === ticket.id)) {
              userEmail = emailFromKey;
              break;
            }
          }
        }
      } catch (e) {
        console.error('Error extracting email:', e);
      }
    }
    
    // Try to get user info from localStorage
    if (typeof window !== 'undefined') {
      try {
        // Try userInfo_${email} first
        if (userEmail) {
          const userInfoKey = `userInfo_${userEmail}`;
          const userInfoData = localStorage.getItem(userInfoKey);
          if (userInfoData) {
            const userInfo = JSON.parse(userInfoData);
            if (userInfo.avatar) userAvatar = userInfo.avatar;
            if (userInfo.firstName && userInfo.lastName) {
              userName = `${userInfo.firstName} ${userInfo.lastName}`;
              userInitial = userInfo.firstName.charAt(0).toUpperCase();
            } else if (userInfo.firstName) {
              userName = userInfo.firstName;
              userInitial = userInfo.firstName.charAt(0).toUpperCase();
            } else if (userInfo.email) {
              userName = userInfo.email.split('@')[0];
              userInitial = userName.charAt(0).toUpperCase();
            }
          }
        }
        
        // Also search all userInfo_* keys (but skip general userInfo which is admin's)
        if (!userAvatar || !userName) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('userInfo_') && key !== 'userInfo') {
              const userInfoData = localStorage.getItem(key);
              if (userInfoData) {
                const userInfo = JSON.parse(userInfoData);
                // Only use if email matches or if we don't have email yet
                if (!userEmail || userInfo.email === userEmail || key === `userInfo_${userEmail}`) {
                  if (userInfo.avatar && !userAvatar) {
                    userAvatar = userInfo.avatar;
                  }
                  if (!userName && userInfo.firstName && userInfo.lastName) {
                    userName = `${userInfo.firstName} ${userInfo.lastName}`;
                    userInitial = userInfo.firstName.charAt(0).toUpperCase();
                    if (userAvatar) break;
                  } else if (!userName && userInfo.firstName) {
                    userName = userInfo.firstName;
                    userInitial = userInfo.firstName.charAt(0).toUpperCase();
                    if (userAvatar) break;
                  } else if (!userName && userInfo.email) {
                    userName = userInfo.email.split('@')[0];
                    userInitial = userName.charAt(0).toUpperCase();
                    if (userAvatar) break;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('Error loading user info from localStorage:', e);
      }
    }
    
    // Final fallback: use ticket info or email username
    if (!userName) {
      if (ticket.requestedBy && ticket.requestedBy !== 'Utilizator' && ticket.requestedBy !== 'Domi Admin') {
        userName = ticket.requestedBy;
        userInitial = userName.charAt(0).toUpperCase();
      } else if (ticket.userName && ticket.userName !== 'Utilizator' && ticket.userName !== 'Domi Admin') {
        userName = ticket.userName;
        userInitial = userName.charAt(0).toUpperCase();
      } else if (userEmail) {
        userName = userEmail.split('@')[0];
        userInitial = userName.charAt(0).toUpperCase();
      } else {
        userName = 'Utilizator';
        userInitial = 'U';
      }
    } else if (!userInitial || userInitial === 'U') {
      userInitial = userName.charAt(0).toUpperCase() || 'U';
    }
    
    const result = { userEmail, userAvatar, userName, userInitial };
    
    // Cache the result
    setUserInfoCache(prev => ({ ...prev, [cacheKey]: result }));
    
    return result;
  };

  // Load user info from Supabase when ticket is selected
  useEffect(() => {
    if (!selectedTicket) return;
    
    const loadUserInfoFromSupabase = async () => {
      const userId = selectedTicket.userId || selectedTicket.user_id;
      const userEmail = selectedTicket.userEmail || '';
      
      if (!userId && !userEmail) return;
      
      try {
        const params = new URLSearchParams();
        if (userId) params.append('userId', userId);
        if (userEmail) params.append('email', userEmail);
        
        const response = await fetch(`/api/admin/users/profiles?${params.toString()}`);
        if (response.ok) {
          const result = await response.json();
          if (result.profile) {
            const profile = result.profile;
            const cacheKey = `${selectedTicket.id}_${userEmail}_${userId || ''}`;
            
            let userAvatar = '';
            let userName = '';
            let userInitial = 'U';
            
            if (profile.avatar_url) userAvatar = profile.avatar_url;
            if (profile.first_name && profile.last_name) {
              userName = `${profile.first_name} ${profile.last_name}`;
              userInitial = profile.first_name.charAt(0).toUpperCase();
            } else if (profile.first_name) {
              userName = profile.first_name;
              userInitial = profile.first_name.charAt(0).toUpperCase();
            } else if (userEmail) {
              userName = userEmail.split('@')[0];
              userInitial = userName.charAt(0).toUpperCase();
            }
            
            // Update cache with Supabase data
            if (userName || userAvatar) {
              setUserInfoCache(prev => ({
                ...prev,
                [cacheKey]: {
                  userEmail,
                  userAvatar: userAvatar || prev[cacheKey]?.userAvatar || '',
                  userName: userName || prev[cacheKey]?.userName || 'Utilizator',
                  userInitial: userInitial || prev[cacheKey]?.userInitial || 'U',
                }
              }));
            }
          }
        }
      } catch (e) {
        console.error('Error loading user info from Supabase:', e);
      }
    };
    
    loadUserInfoFromSupabase();
  }, [selectedTicket?.id, selectedTicket?.userId, selectedTicket?.userEmail]);

  const handleReplyToTicket = (ticket: any) => {
    // Ensure messages is always an array
    const ticketWithMessages = {
      ...ticket,
      messages: Array.isArray(ticket.messages) ? ticket.messages : []
    };
    setSelectedTicket(ticketWithMessages);
    setShowReplyModal(true);
    setReplyMessage('');
    
    // Enable AI by default for chat tickets if not already set
    if (ticket.subject === 'Chat Tichet AI' && aiEnabled[ticket.id] === undefined) {
      setAiEnabled(prev => ({ ...prev, [ticket.id]: true }));
    }
    
    // Auto scroll to last message after modal opens
    setTimeout(() => {
      const messagesContainer = document.getElementById('admin-messages-container');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 100);
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim() || !selectedTicket) return;

    const adminMessage = replyMessage.trim();

    // Save message to Supabase first
    try {
      const response = await fetch('/api/support/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          sender: 'admin',
          message: adminMessage,
          attachments: [],
          timestamp: new Date().toISOString(),
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save message to Supabase');
      }

      console.log('[Admin] Message saved to Supabase');

      // Map Supabase message to local format
      const savedMessage = {
        id: result.message.id,
        sender: result.message.sender,
        message: result.message.message,
        timestamp: result.message.timestamp,
        attachments: result.message.attachments || [],
      };

      // Check if AI is disabled (admin is replying personally)
      const isAdminPersonalReply = aiEnabled[selectedTicket.id] === false;
      
      // Check if this is the first admin message in this chat
      const existingMessages = Array.isArray(selectedTicket.messages) ? selectedTicket.messages : [];
      const hasPreviousAdminMessages = existingMessages.some((msg: any) => msg.sender === 'admin');
      const isFirstAdminMessage = !hasPreviousAdminMessages;

      // Create notification for user
      let notification;
      if (isAdminPersonalReply && isFirstAdminMessage) {
        // Special notification when admin joins the conversation personally
        notification = {
          id: Date.now().toString(),
          type: 'admin_joined',
          title: 'Suportul tehnic s-a alăturat conversației',
          message: `Un agent de suport tehnic s-a alăturat conversației pentru tichetul #${selectedTicket.id}. Vei primi răspunsuri directe de la echipa noastră.`,
          timestamp: new Date().toISOString(),
          read: false,
          ticketId: selectedTicket.id
        };
      } else {
        // Regular notification for admin reply
        notification = {
        id: Date.now().toString(),
        type: 'ticket_reply',
          title: isAdminPersonalReply ? 'Răspuns de la suportul tehnic' : 'Răspuns la tichetul tău',
          message: isAdminPersonalReply 
            ? `Suportul tehnic a răspuns la tichetul #${selectedTicket.id}`
            : `Admin-ul a răspuns la tichetul #${selectedTicket.id}`,
        timestamp: new Date().toISOString(),
        read: false,
        ticketId: selectedTicket.id
      };
      }

      // Add system message if admin is joining personally for the first time
      let messagesToAdd = [savedMessage];
      let systemMessage = null;
      if (isAdminPersonalReply && isFirstAdminMessage) {
        // Save system message to Supabase
        try {
          const systemResponse = await fetch('/api/support/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId: selectedTicket.id,
              sender: 'system',
              message: '🔵 Suportul tehnic s-a alăturat conversației. Vei primi răspunsuri directe de la echipa noastră.',
              attachments: [],
              timestamp: new Date().toISOString(),
            }),
          });

          if (systemResponse.ok) {
            const systemResult = await systemResponse.json();
            if (systemResult.success && systemResult.message) {
              systemMessage = {
                id: systemResult.message.id,
                sender: 'system',
                message: systemResult.message.message,
                timestamp: systemResult.message.timestamp,
                attachments: []
              };
            }
          }
        } catch (e) {
          console.error('[Admin] Error saving system message to Supabase:', e);
        }

        // Fallback to local system message if Supabase failed
        if (!systemMessage) {
          systemMessage = {
            id: `system_${Date.now()}`,
            sender: 'system',
            message: '🔵 Suportul tehnic s-a alăturat conversației. Vei primi răspunsuri directe de la echipa noastră.',
            timestamp: new Date().toISOString(),
            attachments: []
          };
        }
        
        messagesToAdd = [systemMessage, savedMessage];
      }

      // Update ticket with message(s)
      const updatedTicket = {
        ...selectedTicket,
        messages: [...(selectedTicket.messages || []), ...messagesToAdd],
        status: 'Am raspuns',
        lastReply: savedMessage.timestamp
      };

      const updatedTickets = ticketsData.map(ticket => 
        ticket.id === selectedTicket.id ? updatedTicket : ticket
      );

      setTicketsData(updatedTickets);
      setSelectedTicket(updatedTicket);

      // Update localStorage as cache
      const userKey = `userTickets_${selectedTicket.userEmail || 'default'}`;
      const userTickets = localStorage.getItem(userKey);
      if (userTickets) {
        const tickets = JSON.parse(userTickets);
        const updatedUserTickets = tickets.map((ticket: any) => 
          ticket.id === selectedTicket.id ? updatedTicket : ticket
        );
        localStorage.setItem(userKey, JSON.stringify(updatedUserTickets));
      }

      // Also update general tickets
      const generalTickets = localStorage.getItem('userTickets');
      if (generalTickets) {
        const tickets = JSON.parse(generalTickets);
        const updatedGeneralTickets = tickets.map((ticket: any) => 
          ticket.id === selectedTicket.id ? updatedTicket : ticket
        );
        localStorage.setItem('userTickets', JSON.stringify(updatedGeneralTickets));
      }

      // Add notification to user's notifications
      const userNotificationsKey = `notifications_${selectedTicket.userEmail || 'default'}`;
      const existingNotifications = localStorage.getItem(userNotificationsKey);
      const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];
      notifications.unshift(notification);
      localStorage.setItem(userNotificationsKey, JSON.stringify(notifications));

      // Also add to general notifications
      const generalNotifications = localStorage.getItem('notifications');
      const allNotifications = generalNotifications ? JSON.parse(generalNotifications) : [];
      allNotifications.unshift(notification);
      localStorage.setItem('notifications', JSON.stringify(allNotifications));

      setShowReplyModal(false);
      setReplyMessage('');
      
      // Auto scroll to last message after sending
      setTimeout(() => {
        const messagesContainer = document.getElementById('admin-messages-container');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 100);
    } catch (supabaseError: any) {
      console.error('[Admin] Error saving message to Supabase, saving to localStorage only:', supabaseError);
      
      // Fallback: save to localStorage only
      const message = {
        id: Date.now().toString(),
        sender: 'admin',
        message: adminMessage,
        timestamp: new Date().toISOString(),
        attachments: []
      };

      const updatedTicket = {
        ...selectedTicket,
        messages: [...(selectedTicket.messages || []), message],
        status: 'Am raspuns',
        lastReply: message.timestamp
      };

      const updatedTickets = ticketsData.map(ticket => 
        ticket.id === selectedTicket.id ? updatedTicket : ticket
      );

      setTicketsData(updatedTickets);
      setSelectedTicket(updatedTicket);

      // Update localStorage
      const userKey = `userTickets_${selectedTicket.userEmail || 'default'}`;
      const userTickets = localStorage.getItem(userKey);
      if (userTickets) {
        const tickets = JSON.parse(userTickets);
        const updatedUserTickets = tickets.map((ticket: any) => 
          ticket.id === selectedTicket.id ? updatedTicket : ticket
        );
        localStorage.setItem(userKey, JSON.stringify(updatedUserTickets));
      }

      const generalTickets = localStorage.getItem('userTickets');
      if (generalTickets) {
        const tickets = JSON.parse(generalTickets);
        const updatedGeneralTickets = tickets.map((ticket: any) => 
          ticket.id === selectedTicket.id ? updatedTicket : ticket
        );
        localStorage.setItem('userTickets', JSON.stringify(updatedGeneralTickets));
      }

      setShowReplyModal(false);
      setReplyMessage('');
    }
  };

  const handleChangeStatus = async (ticketId: string, newStatus: string) => {
    // Update status in Supabase first
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ticketId,
          status: newStatus,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update ticket status in Supabase');
      }

      console.log('[Admin] Ticket status updated in Supabase:', ticketId, newStatus);
    } catch (supabaseError: any) {
      console.error('[Admin] Error updating ticket status in Supabase:', supabaseError);
      // Continue with localStorage update as fallback
    }

    const updatedTickets = ticketsData.map(ticket => {
      if (ticket.id === ticketId) {
        return { ...ticket, status: newStatus };
      }
      return ticket;
    });

    setTicketsData(updatedTickets);

    // Update localStorage as cache
    const ticket = ticketsData.find(t => t.id === ticketId);
    if (ticket) {
      const userKey = `userTickets_${ticket.userEmail || 'default'}`;
      const userTickets = localStorage.getItem(userKey);
      if (userTickets) {
        const tickets = JSON.parse(userTickets);
        const updatedUserTickets = tickets.map((t: any) => {
          if (t.id === ticketId) {
            return { ...t, status: newStatus };
          }
          return t;
        });
        localStorage.setItem(userKey, JSON.stringify(updatedUserTickets));
      }

      // Also update general tickets
      const generalTickets = localStorage.getItem('userTickets');
      if (generalTickets) {
        const tickets = JSON.parse(generalTickets);
        const updatedGeneralTickets = tickets.map((t: any) => {
          if (t.id === ticketId) {
            return { ...t, status: newStatus };
          }
          return t;
        });
        localStorage.setItem('userTickets', JSON.stringify(updatedGeneralTickets));
      }
    }

    setShowActionsMenu(null);
  };

  // Auto scroll to last message when selectedTicket changes
  React.useEffect(() => {
    if (selectedTicket && showReplyModal) {
      setTimeout(() => {
        const messagesContainer = document.getElementById('admin-messages-container');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 100);
    }
  }, [selectedTicket, showReplyModal]);

  // Live polling for new messages when a ticket is open
  useEffect(() => {
    if (!selectedTicket || !showReplyModal) return;

    const pollForNewMessages = async () => {
      try {
        // Fetch latest messages from Supabase
        const response = await fetch(`/api/support/messages?ticketId=${selectedTicket.id}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.messages) {
            const currentMessages = Array.isArray(selectedTicket.messages) ? selectedTicket.messages : [];
            const newMessages = result.messages || [];
            
            // Check if there are new messages (by comparing count or IDs)
            const hasNewMessages = newMessages.length !== currentMessages.length ||
              newMessages.some((msg: any, idx: number) => 
                !currentMessages[idx] || 
                currentMessages[idx].id !== msg.id || 
                currentMessages[idx].message !== msg.message
              );

            if (hasNewMessages) {
              // Update selected ticket with new messages
              const updatedTicket = {
                ...selectedTicket,
                messages: newMessages.map((msg: any) => ({
                  id: msg.id,
                  sender: msg.sender,
                  message: msg.message,
                  timestamp: msg.timestamp,
                  attachments: msg.attachments || [],
                })),
              };

              setSelectedTicket(updatedTicket);

              // Update ticketsData
              const updatedTicketsData = ticketsData.map(ticket => 
                ticket.id === selectedTicket.id ? updatedTicket : ticket
              );
              setTicketsData(updatedTicketsData);

              // Auto scroll to bottom
              setTimeout(() => {
                const messagesContainer = document.getElementById('admin-messages-container');
                if (messagesContainer) {
                  messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
              }, 100);
            }
          }
        }
      } catch (error) {
        console.error('[Admin] Error polling for messages:', error);
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollForNewMessages, 2000);
    
    // Initial poll
    pollForNewMessages();

    return () => clearInterval(interval);
  }, [selectedTicket?.id, showReplyModal, ticketsData]);

  const handleDeleteTicket = (ticketId: string) => {
    setDeleteConfirmData({ ticketId });
    setShowDeleteConfirm(true);
    setShowActionsMenu(null);
  };

  const confirmDeleteTicket = () => {
    if (!deleteConfirmData?.ticketId) return;

    const ticketId = deleteConfirmData.ticketId;
    const updatedTickets = ticketsData.filter(ticket => ticket.id !== ticketId);
    setTicketsData(updatedTickets);

    // Update localStorage
    const userKey = `userTickets_${ticketId.split('_')[0] || 'default'}`;
    const userTickets = localStorage.getItem(userKey);
    if (userTickets) {
      const tickets = JSON.parse(userTickets);
      const updatedUserTickets = tickets.filter((ticket: any) => ticket.id !== ticketId);
      localStorage.setItem(userKey, JSON.stringify(updatedUserTickets));
    }

    // Also update general tickets
    const generalTickets = localStorage.getItem('userTickets');
    if (generalTickets) {
      const tickets = JSON.parse(generalTickets);
      const updatedGeneralTickets = tickets.filter((ticket: any) => ticket.id !== ticketId);
      localStorage.setItem('userTickets', JSON.stringify(updatedGeneralTickets));
    }

    // Also check all user-specific tickets
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('userTickets_')) {
        const userTickets = localStorage.getItem(key);
        if (userTickets) {
          const tickets = JSON.parse(userTickets);
          const updatedUserTickets = tickets.filter((ticket: any) => ticket.id !== ticketId);
          localStorage.setItem(key, JSON.stringify(updatedUserTickets));
        }
      }
    }

    setShowDeleteConfirm(false);
    setDeleteConfirmData(null);
  };

  // Bulk selection functions
  const handleSelectTicket = (ticketId: string) => {
    setSelectedTickets(prev => 
      prev.includes(ticketId) 
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const handleSelectAll = () => {
    const filteredTickets = getFilteredTickets();
    if (selectedTickets.length === filteredTickets.length) {
      setSelectedTickets([]);
    } else {
      setSelectedTickets(filteredTickets.map(ticket => ticket.id));
    }
  };

  const handleBulkStatusChange = (newStatus: string) => {
    selectedTickets.forEach(ticketId => {
      handleChangeStatus(ticketId, newStatus);
    });
    setSelectedTickets([]);
    setShowBulkActions(false);
  };

  const handleBulkDelete = () => {
    setDeleteConfirmData({ isBulk: true, count: selectedTickets.length });
    setShowDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    if (!deleteConfirmData?.isBulk) return;

    // Filter out deleted tickets from state
    const updatedTickets = ticketsData.filter(ticket => !selectedTickets.includes(ticket.id));
    setTicketsData(updatedTickets);

    // Update localStorage for each deleted ticket
    selectedTickets.forEach(ticketId => {
      // Also check all user-specific tickets
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('userTickets_')) {
          const userTickets = localStorage.getItem(key);
          if (userTickets) {
            const tickets = JSON.parse(userTickets);
            const updatedUserTickets = tickets.filter((ticket: any) => ticket.id !== ticketId);
            localStorage.setItem(key, JSON.stringify(updatedUserTickets));
          }
        }
      }

      // Also update general tickets
      const generalTickets = localStorage.getItem('userTickets');
      if (generalTickets) {
        const tickets = JSON.parse(generalTickets);
        const updatedGeneralTickets = tickets.filter((ticket: any) => ticket.id !== ticketId);
        localStorage.setItem('userTickets', JSON.stringify(updatedGeneralTickets));
      }
    });
    
    setSelectedTickets([]);
    setShowBulkActions(false);
    setShowDeleteConfirm(false);
    setDeleteConfirmData(null);
  };

  // Handle delete message
  const handleDeleteMessage = async (messageIndex: number) => {
    if (!selectedTicket || !selectedTicket.messages) return;

    const messages = Array.isArray(selectedTicket.messages) ? selectedTicket.messages : [];
    if (messageIndex < 0 || messageIndex >= messages.length) return;

    const messageToDelete = messages[messageIndex];
    const messageId = messageToDelete.id;

    // Remove message from array
    const updatedMessages = messages.filter((_: any, index: number) => index !== messageIndex);
    
    // Update ticket with new messages
    const updatedTicket = {
      ...selectedTicket,
      messages: updatedMessages
    };

    // Update state immediately for UI responsiveness
    setSelectedTicket(updatedTicket);

    // Update ticketsData state
    const updatedTicketsData = ticketsData.map(ticket => 
      ticket.id === selectedTicket.id ? updatedTicket : ticket
    );
    setTicketsData(updatedTicketsData);

    // Update Supabase: Delete the message and sync all remaining messages
    try {
      // First, try to delete the specific message if it has an ID
      if (messageId) {
        const deleteResponse = await fetch(`/api/support/messages/${messageId}`, {
          method: 'DELETE',
        });

        if (!deleteResponse.ok) {
          console.error('[Admin] Error deleting message from Supabase:', await deleteResponse.text());
        }
      }

      // Then, sync all remaining messages to Supabase to ensure consistency
      // This ensures that even if some messages don't have IDs, the final state is saved
      const syncResponse = await fetch('/api/support/tickets/sync-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          messages: updatedMessages,
        }),
      });

      if (!syncResponse.ok) {
        console.error('[Admin] Error syncing messages to Supabase:', await syncResponse.text());
      }
    } catch (error) {
      console.error('[Admin] Error updating Supabase:', error);
      // Continue with localStorage update even if Supabase fails
    }

    // Find user email from ticket
    let userEmail = selectedTicket.userEmail || '';
    
    // Try to extract email from localStorage keys if not present
    if (!userEmail && typeof window !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('userTickets_')) {
            const emailFromKey = key.replace('userTickets_', '');
            const userTickets = JSON.parse(localStorage.getItem(key) || '[]');
            if (userTickets.some((t: any) => t.id === selectedTicket.id)) {
              userEmail = emailFromKey;
              break;
            }
          }
        }
      } catch (e) {
        console.error('Error extracting email:', e);
      }
    }

    // Update user's localStorage
    if (userEmail && typeof window !== 'undefined') {
      const userKey = `userTickets_${userEmail}`;
      const userTickets = localStorage.getItem(userKey);
      if (userTickets) {
        const tickets = JSON.parse(userTickets);
        const updatedUserTickets = tickets.map((ticket: any) => 
          ticket.id === selectedTicket.id ? updatedTicket : ticket
        );
        localStorage.setItem(userKey, JSON.stringify(updatedUserTickets));
      }
    }

    // Also update general tickets
    const generalTickets = localStorage.getItem('userTickets');
    if (generalTickets) {
      const tickets = JSON.parse(generalTickets);
      const updatedGeneralTickets = tickets.map((ticket: any) => 
        ticket.id === selectedTicket.id ? updatedTicket : ticket
      );
      localStorage.setItem('userTickets', JSON.stringify(updatedGeneralTickets));
    }

    // Also update all user-specific tickets
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('userTickets_')) {
          const userTickets = localStorage.getItem(key);
          if (userTickets) {
            const tickets = JSON.parse(userTickets);
            const hasTicket = tickets.some((t: any) => t.id === selectedTicket.id);
            if (hasTicket) {
              const updatedUserTickets = tickets.map((ticket: any) => 
                ticket.id === selectedTicket.id ? updatedTicket : ticket
              );
              localStorage.setItem(key, JSON.stringify(updatedUserTickets));
            }
          }
        }
      }
    }
  };

  // Auto-focus pe butonul de ștergere și keyboard shortcuts pentru modal
  useEffect(() => {
    if (showDeleteConfirm && deleteButtonRef.current) {
      // Focus automat pe butonul de ștergere
      setTimeout(() => {
        deleteButtonRef.current?.focus();
      }, 100);
    }
  }, [showDeleteConfirm]);

  // Keyboard shortcuts pentru modalul de ștergere
  useEffect(() => {
    if (!showDeleteConfirm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Confiră ștergerea cu Enter
        if (deleteConfirmData?.isBulk) {
          confirmBulkDelete();
        } else if (deleteConfirmData?.ticketId) {
          confirmDeleteTicket();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Anulează cu Escape
        setShowDeleteConfirm(false);
        setDeleteConfirmData(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDeleteConfirm, deleteConfirmData]);

  // Filter function
  const getFilteredTickets = () => {
    if (statusFilter === 'all') {
      return ticketsData;
    }
    if (statusFilter === 'high_priority') {
      return ticketsData.filter(ticket => ticket.priority === 'high');
    }
    if (statusFilter === 'chat') {
      return ticketsData.filter(ticket => ticket.subject === 'Chat Tichet AI');
    }
    return ticketsData.filter(ticket => ticket.status === statusFilter);
  };

  // Handle ticket highlighting from notifications
  useEffect(() => {
    const handleHighlightTicket = (event: CustomEvent) => {
      const ticketId = event.detail.ticketId;
      if (ticketId) {
        // Find the ticket row and highlight it
        setTimeout(() => {
          const ticketElement = document.querySelector(`[data-ticket-id="${ticketId}"]`);
          if (ticketElement) {
            ticketElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add highlight effect
            ticketElement.classList.add('ring-2', 'ring-yellow-400', 'ring-opacity-75');
            setTimeout(() => {
              ticketElement.classList.remove('ring-2', 'ring-yellow-400', 'ring-opacity-75');
            }, 3000);
          }
        }, 500);
      }
    };

    // Listen for highlight events
    window.addEventListener('highlightTicket', handleHighlightTicket as EventListener);
    
    // Check for stored highlight ID
    const highlightId = localStorage.getItem('highlightTicketId');
    if (highlightId) {
      localStorage.removeItem('highlightTicketId');
      setTimeout(() => {
        const ticketElement = document.querySelector(`[data-ticket-id="${highlightId}"]`);
        if (ticketElement) {
          ticketElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ticketElement.classList.add('ring-2', 'ring-yellow-400', 'ring-opacity-75');
          setTimeout(() => {
            ticketElement.classList.remove('ring-2', 'ring-yellow-400', 'ring-opacity-75');
          }, 3000);
        }
      }, 500);
    }

    return () => {
      window.removeEventListener('highlightTicket', handleHighlightTicket as EventListener);
    };
  }, []);

  // Load tickets from Supabase (admin can see all tickets)
  useEffect(() => {
    const loadTickets = async () => {
      try {
        console.log('[Admin] Loading all tickets from Supabase...');
        
        // Admin can fetch all tickets - we'll need to get all unique user emails first
        // For now, let's try to fetch all tickets without filtering by user
        // Note: This requires admin access, so we'll use a different approach
        
        // Get all tickets from Supabase (admin endpoint or direct query)
        // Since we're using supabaseAdmin in API routes, we can create an admin endpoint
        // For now, let's load from localStorage as fallback and also try to fetch from Supabase
        
        // Try to load from Supabase via API (we'll need to create an admin endpoint)
        // For now, fallback to localStorage but also try Supabase
        const response = await fetch('/api/support/tickets/all');
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.tickets) {
            console.log(`[Admin] Loaded ${result.tickets.length} tickets from Supabase`);
            // Map Supabase format to local format
            const mappedTickets = result.tickets.map((ticket: any) => ({
              id: ticket.id,
              subject: ticket.subject,
              category: ticket.category,
              priority: ticket.priority,
              status: ticket.status,
              createdAt: ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('ro-RO') : ticket.created_at,
              updatedAt: ticket.updated_at,
              requestedBy: ticket.requested_by,
              assignee: ticket.assignee,
              userEmail: ticket.user_email,
              userId: ticket.user_id,
              messages: (ticket.messages || []).map((msg: any) => ({
                id: msg.id,
                sender: msg.sender,
                message: msg.message,
                timestamp: msg.timestamp,
                attachments: msg.attachments || [],
              })),
            }));
            
            // Sort tickets by creation date (newest first)
            mappedTickets.sort((a: any, b: any) => {
              const dateA = new Date(a.createdAt || a.updatedAt || 0);
              const dateB = new Date(b.createdAt || b.updatedAt || 0);
              return dateB.getTime() - dateA.getTime();
            });
            
            setTicketsData(mappedTickets);
            return;
          }
        }
      } catch (error) {
        console.error('[Admin] Error loading tickets from Supabase:', error);
      }
      
      // Fallback: Load from localStorage
      console.log('[Admin] Falling back to localStorage...');
      const allTickets: any[] = [];
      const seenIds = new Set<string>();
      
      // Load tickets from all users (simulate admin access to all user tickets)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('userTickets_')) {
          const userTickets = JSON.parse(localStorage.getItem(key) || '[]');
          userTickets.forEach((ticket: any) => {
            if (!seenIds.has(ticket.id)) {
              seenIds.add(ticket.id);
              allTickets.push(ticket);
            }
          });
        }
      }
      
      // Also check for the general userTickets key
      const generalTickets = localStorage.getItem('userTickets');
      if (generalTickets) {
        const generalTicketsArray = JSON.parse(generalTickets);
        generalTicketsArray.forEach((ticket: any) => {
          if (!seenIds.has(ticket.id)) {
            seenIds.add(ticket.id);
            allTickets.push(ticket);
          }
        });
      }
      
      // Sort tickets by creation date (newest first)
      allTickets.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.updatedAt || 0);
        const dateB = new Date(b.createdAt || b.updatedAt || 0);
        return dateB.getTime() - dateA.getTime();
      });
      
      setTicketsData(allTickets);
    };

    loadTickets();
    
    // Load admin notifications
    const loadAdminNotifications = () => {
      const notifications = localStorage.getItem('adminNotifications');
      if (notifications) {
        setAdminNotifications(JSON.parse(notifications));
      }
    };
    
    loadAdminNotifications();
    
    // Clean up any existing duplicates
    const cleanupDuplicates = () => {
      const generalTickets = localStorage.getItem('userTickets');
      if (generalTickets) {
        const tickets = JSON.parse(generalTickets);
        const uniqueTickets = tickets.filter((ticket: any, index: number, self: any[]) => 
          index === self.findIndex((t: any) => t.id === ticket.id)
        );
        if (uniqueTickets.length !== tickets.length) {
          console.log(`Removed ${tickets.length - uniqueTickets.length} duplicate tickets`);
          localStorage.setItem('userTickets', JSON.stringify(uniqueTickets));
        }
      }
    };
    
    cleanupDuplicates();
    
    // Listen for storage changes
    const handleStorageChange = () => {
      loadTickets();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Close actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showActionsMenu) {
        setShowActionsMenu(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showActionsMenu]);

  return (
    <div className="min-h-screen transition-all duration-300 bg-gray-50" data-theme="light">
    <div className="p-5">
        {/* Header - Modern Glassmorphism Design */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-center space-x-4 flex-1">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 rounded-full flex items-center justify-center shadow-2xl">
                <i className="ri-customer-service-line text-white text-2xl"></i>
              </div>
              <h1 className="text-4xl font-bold text-gray-900">
                Panel de Tichete
              </h1>
            </div>
          </div>
        </div>

        {/* Bulk Actions - Modern Glassmorphism Design */}
        {selectedTickets.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-8">
          <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-gray-900 font-medium">
                  {selectedTickets.length} selectate
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowBulkActions(!showBulkActions)}
                    className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                  >
                    <i className="ri-settings-3-line mr-2"></i>
                    Acțiuni
                  </button>
                  <button
                    onClick={() => setSelectedTickets([])}
                    className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                  >
                    <i className="ri-close-line mr-2"></i>
                    Anulează
                  </button>
                </div>
              </div>
            </div>

            {/* Bulk Actions Dropdown */}
            {showBulkActions && (
              <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleBulkStatusChange('active')}
                    className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                  >
                    <i className="ri-check-line mr-2"></i>
                    Marchează ca Activ
                  </button>
                  <button
                    onClick={() => handleBulkStatusChange('In asteptare raspuns')}
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                  >
                    <i className="ri-time-line mr-2"></i>
                    Marchează ca În Așteptare
                  </button>
                  <button
                    onClick={() => handleBulkStatusChange('Am raspuns')}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                  >
                    <i className="ri-reply-line mr-2"></i>
                    Marchează ca Am Răspuns
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                  >
                    <i className="ri-delete-bin-line mr-2"></i>
                    Șterge Selectate
                  </button>
                </div>
            </div>
            )}
          </div>
        )}
        
        {/* Stats Cards - Modern Glassmorphism Design */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <button 
            onClick={() => setStatusFilter('all')}
            className={`bg-white rounded-2xl p-6 shadow-sm border transition-all duration-300 cursor-pointer hover:shadow-md hover:scale-[1.02] ${
              statusFilter === 'all' 
                ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-50' 
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
          <div className="flex items-center justify-between">
            <div>
                <p className="text-gray-500 text-sm font-medium">TOTAL TICHETE</p>
                <p className="text-3xl font-bold text-gray-900">{ticketsData.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-ticket-line text-2xl text-blue-600"></i>
              </div>
            </div>
          </button>
          
          <button 
            onClick={() => setStatusFilter('active')}
            className={`bg-white rounded-2xl p-6 shadow-sm border transition-all duration-300 cursor-pointer hover:shadow-md hover:scale-[1.02] ${
              statusFilter === 'active' 
                ? 'border-amber-500 ring-2 ring-amber-500 ring-opacity-50' 
                : 'border-gray-200 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">TICHETE ÎN AȘTEPTARE</p>
                <p className="text-3xl font-bold text-gray-900">{ticketsData.filter(t => t.status === 'active').length}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <i className="ri-time-line text-2xl text-amber-600"></i>
            </div>
          </div>
          </button>
        
          <button 
            onClick={() => setStatusFilter('high_priority')}
            className={`bg-white rounded-2xl p-6 shadow-sm border transition-all duration-300 cursor-pointer hover:shadow-md hover:scale-[1.02] ${
              statusFilter === 'high_priority' 
                ? 'border-red-500 ring-2 ring-red-500 ring-opacity-50' 
                : 'border-gray-200 hover:border-red-300'
            }`}
          >
          <div className="flex items-center justify-between">
            <div>
                <p className="text-gray-500 text-sm font-medium">PRIORITATE MARE</p>
                <p className="text-3xl font-bold text-gray-900">{ticketsData.filter(t => t.priority === 'high').length}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <i className="ri-arrow-up-line text-2xl text-red-600"></i>
              </div>
            </div>
          </button>
          
          <button 
            onClick={() => setStatusFilter('chat')}
            className={`bg-white rounded-2xl p-6 shadow-sm border transition-all duration-300 cursor-pointer hover:shadow-md hover:scale-[1.02] ${
              statusFilter === 'chat' 
                ? 'border-blue-400 ring-2 ring-blue-400 ring-opacity-75' 
                : 'border-blue-400/30'
            }`}
          >
          <div className="flex items-center justify-between">
            <div>
                <p className="text-blue-200 text-sm font-medium">TICHET CHAT</p>
                <p className="text-3xl font-bold text-blue-100">{ticketsData.filter(t => t.subject === 'Chat Tichet AI').length}</p>
            </div>
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                <i className="ri-chat-3-line text-2xl text-white"></i>
            </div>
          </div>
          </button>
      </div>

        {/* Status Filters - Above Table */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-gray-700 font-medium">Filtre Status:</span>
            <div className="flex items-center space-x-2 flex-wrap">
              <button 
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 text-sm rounded-lg transition-all duration-300 ${
                  statusFilter === 'all' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Toate
              </button>
              <button 
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 text-sm rounded-lg transition-all duration-300 ${
                  statusFilter === 'active' 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Activ
              </button>
              <button 
                onClick={() => setStatusFilter('In asteptare raspuns')}
                className={`px-3 py-1 text-sm rounded-lg transition-all duration-300 ${
                  statusFilter === 'In asteptare raspuns' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                În Așteptare
              </button>
              <button 
                onClick={() => setStatusFilter('Am raspuns')}
                className={`px-3 py-1 text-sm rounded-lg transition-all duration-300 ${
                  statusFilter === 'Am raspuns' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Am Răspuns
              </button>
          </div>
        </div>
      </div>

        {/* Tickets Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedTickets.length === getFilteredTickets().length && getFilteredTickets().length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Solicitat De</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Subiect</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Atribuit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Prioritate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Data Creării</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Acțiune</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-gray-200">
              {ticketsData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="text-4xl mb-4">🎫</div>
                      <p className="text-gray-500">
                      Nu există tichete de suport. Când clienții vor crea tichete noi, acestea vor apărea aici.
                    </p>
                  </td>
                </tr>
              ) : (
                  getFilteredTickets().map((ticket, index) => (
                    <tr 
                      key={index} 
                      data-ticket-id={ticket.id}
                      className={`hover:bg-gray-50 transition-all duration-300 cursor-pointer ${
                        ticket.status === 'In asteptare raspuns' || ticket.status === 'active' ? 'bg-red-50' : 'bg-white'
                      }`}
                      onClick={() => handleReplyToTicket(ticket)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedTickets.includes(ticket.id)}
                          onChange={() => handleSelectTicket(ticket.id)}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{ticket.id || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {(() => {
                          const { userAvatar, userName, userInitial } = getUserInfoFromTicket(ticket);
                          const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || userInitial;
                          return (
                            <>
                              {userAvatar ? (
                                <img
                                  src={userAvatar}
                                  alt={userName}
                                  className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 mr-3"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div 
                                className={`w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mr-3 ${userAvatar ? 'hidden' : ''}`}
                              >
                                {userInitials}
                              </div>
                              <div className="text-sm font-medium text-gray-900">{userName}</div>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {ticket.subject || ticket.title || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {ticket.subject === 'Chat Tichet AI' ? (() => {
                          const agent = getPrimaryAgentFromTicket(ticket);
                          return (
                            <>
                              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center mr-3 ring-1 ring-gray-200">
                                <img
                                  src={agent.avatar}
                                  alt={agent.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) parent.innerHTML = `<span class="text-xs font-medium text-gray-600">${agent.name.charAt(0)}</span>`;
                                  }}
                                />
                              </div>
                              <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                            </>
                          );
                        })() : (
                          <>
                            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mr-3">
                              <span className="text-xs font-medium text-gray-600">
                                {((ticket.assignee || 'A').toString()).split(' ').map((n: string) => n[0]).join('')}
                              </span>
                            </div>
                            <div className="text-sm font-medium text-gray-900">{ticket.assignee || 'Nedefinit'}</div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(ticket.priority || 'medium')}`}>
                          {ticket.priority || 'Medie'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(ticket.status || 'active')}`}>
                          {ticket.status || 'Activ'}
                      </span>
                    </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(() => {
                          const createdDate = ticket.createdDate || ticket.createdAt;
                          if (!createdDate) return 'N/A';
                          
                          const now = new Date();
                          let ticketDate;
                          
                          // Try to parse the date - handle both ISO format and Romanian format
                          if (createdDate.includes('/')) {
                            // Romanian format: "27/10/2025, 14:30"
                            const [datePart, timePart] = createdDate.split(', ');
                            const [day, month, year] = datePart.split('/');
                            const [hour, minute] = timePart.split(':');
                            ticketDate = new Date(year, month - 1, day, hour, minute);
                          } else {
                            // ISO format or other formats
                            ticketDate = new Date(createdDate);
                          }
                          
                          // Check if date is valid
                          if (isNaN(ticketDate.getTime())) {
                            return 'Data invalidă';
                          }
                          
                          const diffMinutes = Math.floor((now.getTime() - ticketDate.getTime()) / (1000 * 60));
                          const diffHours = Math.floor(diffMinutes / 60);
                          const remainingMinutes = diffMinutes % 60;
                          
                          const timeString = ticketDate.toLocaleString('ro-RO', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Europe/Bucharest'
                          });
                          
                          const minutesText = diffHours > 0 
                            ? `${diffHours}h ${remainingMinutes}m` 
                            : `${diffMinutes}m`;
                          
                          return (
                            <div className="flex flex-col">
                              <span>{timeString}</span>
                              <span className={`text-xs ${diffMinutes > 60 ? 'text-red-400' : 'text-gray-400'}`}>
                                ({minutesText})
                              </span>
                            </div>
                          );
                        })()}
                    </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => handleReplyToTicket(ticket)}
                            className="text-gray-600 hover:text-blue-600 transition-colors bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border border-blue-200"
                            title="Răspunde la tichet"
                          >
                            <i className="ri-reply-line"></i>
                          </button>
                          <div className="relative">
                            <button 
                              onClick={() => setShowActionsMenu(showActionsMenu === ticket.id ? null : ticket.id)}
                              className="text-gray-600 hover:text-blue-600 transition-colors bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border border-blue-200"
                            >
                        <i className="ri-more-2-fill"></i>
                      </button>
                            
                            {/* Actions Dropdown */}
                            {showActionsMenu === ticket.id && (
                              <div className="absolute right-0 top-12 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px]">
                                <div className="py-2">
                                  <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Schimbă Status
                                  </div>
                                  <button
                                    onClick={() => handleChangeStatus(ticket.id, 'active')}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center"
                                  >
                                    <i className="ri-play-circle-line mr-2 text-green-400"></i>
                                    Activ
                                  </button>
                                  <button
                                    onClick={() => handleChangeStatus(ticket.id, 'in-progress')}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center"
                                  >
                                    <i className="ri-time-line mr-2 text-yellow-400"></i>
                                    În Progres
                                  </button>
                                  <button
                                    onClick={() => handleChangeStatus(ticket.id, 'resolved')}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center"
                                  >
                                    <i className="ri-check-circle-line mr-2 text-red-400"></i>
                                    Rezolvat
                                  </button>
                                  <div className="border-t border-gray-600 my-1"></div>
                                  <button
                                    onClick={() => handleDeleteTicket(ticket.id)}
                                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-900/30 transition-colors flex items-center"
                                  >
                                    <i className="ri-delete-bin-line mr-2"></i>
                                    Șterge Tichet
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Reply Modal - Chat Style */}
      {showReplyModal && selectedTicket && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            // Închide modal-ul când se dă click pe backdrop
            if (e.target === e.currentTarget) {
              setShowReplyModal(false);
            }
          }}
        >
          <div 
            className={`${selectedTicket.subject === 'Chat Tichet AI' ? 'bg-white' : 'bg-white'} rounded-2xl shadow-xl border border-gray-200 ${selectedTicket.subject === 'Chat Tichet AI' ? 'w-full max-w-md' : 'max-w-4xl w-full'} h-[85vh] sm:h-[90vh] overflow-hidden flex flex-col`}
            onClick={(e) => {
              // Previne închiderea când se dă click pe conținutul modal-ului
              e.stopPropagation();
            }}
          >
            {/* Modal Header */}
            {selectedTicket.subject === 'Chat Tichet AI' ? (
              // Header Chat Style pentru Chat AI (exact ca poza 2)
              <div className={`flex items-center justify-between p-4 border-b ${
                false ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}>
                <div className="flex items-center gap-3">
                  {/* Profile Picture - același agent cu care vorbește userul */}
                  {(() => {
                    const primaryAgent = getPrimaryAgentFromTicket(selectedTicket);
                    return (
                    <>
                    <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center overflow-hidden">
                      <img 
                        src={primaryAgent.avatar} 
                        alt={primaryAgent.name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.innerHTML = `<span class="text-white font-bold text-lg">${primaryAgent.name.charAt(0)}</span>`;
                          }
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  </div>
                  <div>
                    <h3 className={`text-lg font-semibold ${false ? 'text-white' : 'text-gray-900'}`}>
                      {primaryAgent.name}
                    </h3>
                    <p className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'}`}>
                      {aiEnabled[selectedTicket.id] !== false 
                        ? 'Asistenta ta virtuală • Activ acum' 
                        : 'AI dezactivat • Admin răspunde manual'}
                    </p>
                  </div>
                    </>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  {/* AI Toggle Button */}
                  <button
                    onClick={() => {
                      const currentAiState = aiEnabled[selectedTicket.id] !== false; // Default true for chat tickets
                      setAiEnabled(prev => ({ ...prev, [selectedTicket.id]: !currentAiState }));
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                      aiEnabled[selectedTicket.id] !== false
                        ? false 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30' 
                          : 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                        : false
                          ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30'
                          : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                    }`}
                    title={aiEnabled[selectedTicket.id] !== false ? 'AI activat - Click pentru a dezactiva' : 'AI dezactivat - Click pentru a activa'}
                  >
                    {aiEnabled[selectedTicket.id] !== false ? 'AI ON' : 'AI OFF'}
                  </button>
                  <button
                    onClick={() => setShowReplyModal(false)}
                    className={`p-2 rounded-lg transition-colors duration-200 ${
                      false 
                        ? 'hover:bg-gray-700 text-white' 
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    <i className="ri-close-line text-lg"></i>
                  </button>
                </div>
              </div>
            ) : (
              // Header Normal pentru Tichete
            <div className="p-6 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <i className="ri-customer-service-line text-blue-600 text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">Tichet Suport</h3>
                    <p className="text-gray-600">#{selectedTicket.id} - {selectedTicket.subject || selectedTicket.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowReplyModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>
            )}

            {/* Messages Area */}
            <div id="admin-messages-container" className={`flex-1 overflow-y-auto ${
              selectedTicket.subject === 'Chat Tichet AI' 
                ? false ? 'bg-gray-900 p-4' : 'bg-gray-50 p-4'
                : 'p-6 bg-gray-50'
            }`}>
              <div className={selectedTicket.subject === 'Chat Tichet AI' ? 'space-y-4' : 'space-y-4'}>
                {(() => {
                  const messages = Array.isArray(selectedTicket.messages) ? selectedTicket.messages : [];
                  if (messages.length > 0) {
                    return messages.map((msg: any, index: number) => {
                    const isChatStyle = (selectedTicket.subject === 'Chat Tichet AI');
                    // System message - centered with special styling
                    if (msg.sender === 'system') {
                      return (
                        <div key={index} className="flex justify-center my-4">
                          <div className={`px-4 py-2 rounded-lg text-sm text-center max-w-md ${
                            false ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30' : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}>
                            <p className="font-medium">{msg.message}</p>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div key={index} className={`flex items-start gap-3 ${
                        msg.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}>
                        {/* Avatar pentru AI - același agent ca la user */}
                        {isChatStyle && msg.sender !== 'user' && msg.sender !== 'admin' && msg.sender !== 'system' && (() => {
                          const agent = resolveAgentFromMessage(msg);
                          return (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            <img 
                              src={agent.avatar} 
                              alt={agent.name} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = `<span class="text-white font-bold">${agent.name.charAt(0)}</span>`;
                                }
                              }}
                            />
                          </div>
                          );
                        })()}
                        
                        <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} max-w-[75%]`}>
                          {isChatStyle && msg.sender !== 'user' && msg.sender !== 'admin' && (() => {
                            const agent = resolveAgentFromMessage(msg);
                            return (
                            <span className={`text-xs font-semibold mb-1 ${false ? 'text-gray-300' : 'text-gray-700'}`}>
                              {agent.name}
                            </span>
                            );
                          })()}
                          {isChatStyle && msg.sender === 'user' && (() => {
                            const { userName } = getUserInfoFromTicket(selectedTicket);
                            return userName ? (
                              <span className={`text-xs font-semibold mb-1 ${false ? 'text-gray-300' : 'text-gray-700'}`}>
                                {userName}
                              </span>
                            ) : null;
                          })()}
                          {!isChatStyle && (
                        <div className="flex items-center gap-2 mb-2">
                          {msg.sender === 'admin' && (
                            <>
                              <i className="ri-admin-line text-sm"></i>
                              <span className="text-sm font-medium opacity-80">Admin</span>
                            </>
                          )}
                          {msg.sender === 'user' && (() => {
                            const { userAvatar, userName, userInitial } = getUserInfoFromTicket(selectedTicket);
                            return (
                              <>
                                {userAvatar ? (
                                  <img
                                    src={userAvatar}
                                    alt={userName}
                                    className="w-6 h-6 rounded-full object-cover border border-white/30"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const fallback = target.nextElementSibling as HTMLElement;
                                      if (fallback) fallback.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div 
                                  className={`w-6 h-6 bg-white/20 rounded-full flex items-center justify-center ${userAvatar ? 'hidden' : ''}`}
                                >
                                  <span className="text-xs font-bold">
                                    {userInitial}
                                  </span>
                                </div>
                                <span className="text-sm font-medium opacity-80">
                                  {userName}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                          )}
                          <div
                            className={`p-3 rounded-2xl relative group ${
                              msg.sender === 'user'
                                ? false
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-blue-500 text-white'
                                : msg.sender === 'admin'
                                ? false
                                  ? 'bg-gray-700 text-white'
                                  : 'bg-gray-200 text-gray-800'
                                : false
                                ? 'bg-gray-700 text-white'
                                : 'bg-white text-gray-900 shadow-sm border border-gray-200'
                            }`}
                          >
                            <p className="whitespace-pre-wrap text-sm leading-relaxed pr-8">{msg.message}</p>
                            {/* Delete button - visible on hover */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Sigur vrei să ștergi acest mesaj? Mesajul va fi șters și pentru utilizator.')) {
                                  handleDeleteMessage(index);
                                }
                              }}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded hover:bg-red-500/20 text-red-500 hover:text-red-600"
                              title="Șterge mesaj"
                            >
                              <i className="ri-delete-bin-line text-sm"></i>
                            </button>
                      </div>
                          {msg.timestamp && (
                            <span className={`text-xs mt-1 ${false ? 'text-gray-500' : 'text-gray-400'}`}>
                              {(() => {
                                try {
                                  const date = new Date(msg.timestamp);
                                  return date.toLocaleString('ro-RO', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    timeZone: 'Europe/Bucharest'
                                  });
                                } catch (e) {
                                  return msg.timestamp;
                                }
                              })()}
                            </span>
                          )}
                    </div>
                        
                        {/* User Avatar pentru chat style */}
                        {isChatStyle && msg.sender === 'user' && (() => {
                          const { userAvatar, userName, userInitial } = getUserInfoFromTicket(selectedTicket);
                          return (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              false ? 'bg-gray-700' : 'bg-gray-300'
                            }`}>
                              {userAvatar ? (
                                <img
                                  src={userAvatar}
                                  alt={userName}
                                  className="w-full h-full object-cover rounded-full"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div className={`w-full h-full flex items-center justify-center ${userAvatar ? 'hidden' : ''}`}>
                                <span className={`font-bold text-xs ${false ? 'text-white' : 'text-gray-700'}`}>
                                  {userInitial}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                    </div>
                  );
                  });
                  } else {
                    return (
                      <div className={`text-center py-8 ${false ? 'text-gray-400' : 'text-gray-500'}`}>
                        {selectedTicket.subject === 'Chat Tichet AI' ? (() => {
                            const primaryAgent = getPrimaryAgentFromTicket(selectedTicket);
                            return (
                          <>
                            <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-blue-500 to-blue-600">
                              <img src={primaryAgent.avatar} alt={primaryAgent.name} className="w-full h-full object-cover" onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) parent.innerHTML = `<span class="text-white font-bold text-2xl">${primaryAgent.name.charAt(0)}</span>`;
                              }} />
                            </div>
                            <p className="font-medium">Bună, eu sunt asistenta ta virtuală {primaryAgent.name}.</p>
                            <p className={`text-sm mt-2 ${false ? 'text-gray-300' : 'text-gray-600'}`}>
                              Cum te pot ajuta astăzi?
                            </p>
                          </>
                        );
                        })() : (
                          <>
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <i className="ri-message-3-line text-gray-400 text-2xl"></i>
                    </div>
                    <p className="text-gray-500">Nu există mesaje încă</p>
                    <p className="text-gray-400 text-sm">Scrie primul mesaj pentru a începe conversația</p>
                          </>
                )}
                      </div>
                    );
                  }
                })()}
              </div>
            </div>

            {/* Reply Form */}
            <div className={`p-4 border-t ${
              selectedTicket.subject === 'Chat Tichet AI'
                ? false ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
                : 'p-6 bg-white border-t border-gray-200'
            }`}>
              {selectedTicket.subject === 'Chat Tichet AI' ? (
                // Chat Input Style pentru Chat AI
                <>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder={aiEnabled[selectedTicket.id] !== false ? "Scrie un mesaj..." : "Scrie răspunsul tău manual..."}
                      disabled={false}
                      className={`flex-1 px-4 py-3 rounded-xl border transition-all ${
                        false
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
                          : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                      } focus:outline-none disabled:opacity-50`}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={!replyMessage.trim()}
                      className={`p-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        false
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      } shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95`}
                    >
                      <i className="ri-send-plane-fill text-lg"></i>
                    </button>
                  </div>
                  <p className={`text-xs mt-2 text-center ${
                    false ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {aiEnabled[selectedTicket.id] !== false 
                      ? 'Asistent AI va răspunde automat' 
                      : 'AI dezactivat - Răspunzi manual'}
                  </p>
                </>
              ) : (
                // Normal Form pentru Tichete
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Răspunsul tău
                  </label>
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Scrie răspunsul tău..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 resize-none transition-all duration-200"
                    rows={4}
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowReplyModal(false)}
                    className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors duration-200"
                  >
                    Anulează
                  </button>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyMessage.trim()}
                    className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                      !replyMessage.trim()
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                    }`}
                  >
                    Trimite Răspunsul
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-800 via-gray-700 to-gray-800 rounded-2xl shadow-2xl border border-gray-600/50 w-full max-w-md transform transition-all">
            <div className="p-6">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                  <i className="ri-delete-bin-line text-red-400 text-3xl"></i>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-white text-center mb-2">
                Confirmă ștergerea
              </h3>

              {/* Message */}
              <p className="text-gray-300 text-center mb-6">
                {deleteConfirmData?.isBulk 
                  ? `Ești sigur că vrei să ștergi ${deleteConfirmData.count} ticheturi? Această acțiune nu poate fi anulată.`
                  : 'Ești sigur că vrei să ștergi acest tichet? Această acțiune nu poate fi anulată.'}
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmData(null);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg"
                >
                  Anulează
                </button>
                <button
                  ref={deleteButtonRef}
                  onClick={() => {
                    if (deleteConfirmData?.isBulk) {
                      confirmBulkDelete();
                    } else {
                      confirmDeleteTicket();
                    }
                  }}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-white"
                  autoFocus
                >
                  Șterge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

