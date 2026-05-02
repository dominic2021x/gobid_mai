"use client";

import { useState, useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import supabase from '@/lib/supabase';
import { uploadImageFile } from '@/lib/upload/client-image-upload';
import { PaperClipIcon, FaceSmileIcon, TrashIcon, PencilIcon, XMarkIcon, PhotoIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string;
  name: string;
}

interface Conversation {
  id: string;
  participant1_id: string;
  participant2_id: string;
  last_message_at: string | null;
  conversation_type: 'direct' | 'group';
  group_name?: string | null;
  group_avatar?: string | null;
  created_by?: string | null;
}

interface ConversationListItem {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatar?: string | null;
  last_message_at: string | null;
  other_user_id?: string; // Pentru conversații directe
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
  attachment_urls?: string[] | null;
}

type InternalChatUserProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export default function AdminInternalChat() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isCurrentUserAdmin, setIsCurrentUserAdmin] = useState<boolean>(false);
  
  // Group creation modal
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupAvatarFile, setGroupAvatarFile] = useState<File | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(null);
  const groupAvatarFileInputRef = useRef<HTMLInputElement>(null);
  
  // Error modal
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Delete conversation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  
  // Message edit/delete
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);
  
  // Group participants management
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<Array<{
    user_id: string;
    role: string;
    user: AdminUser | null;
  }>>([]);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
  const [showAddParticipantsModal, setShowAddParticipantsModal] = useState(false);
  const [selectedParticipantsToAdd, setSelectedParticipantsToAdd] = useState<string[]>([]);
  
  // Group avatar edit
  const [showGroupAvatarModal, setShowGroupAvatarModal] = useState(false);
  const [groupAvatarEditFile, setGroupAvatarEditFile] = useState<File | null>(null);
  const [groupAvatarEditPreview, setGroupAvatarEditPreview] = useState<string | null>(null);
  const [isUploadingGroupAvatar, setIsUploadingGroupAvatar] = useState(false);
  const groupAvatarEditFileInputRef = useRef<HTMLInputElement>(null);
  
  // Group name edit
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [isSavingGroupName, setIsSavingGroupName] = useState(false);
  const groupNameInputRef = useRef<HTMLInputElement>(null);
  
  // Image upload and emoji
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Avatar change modal
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  
  // Unread messages count
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // User online status
  const [userOnlineStatus, setUserOnlineStatus] = useState<Record<string, { isOnline: boolean; lastSeen: string | null }>>({});
  
  // Typing indicators
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({}); // conversationId -> userId
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<any>(null);

  useEffect(() => {
    loadAdminUsers();
  }, []);

  useEffect(() => {
    if (currentUserId && adminUsers.length > 0) {
      loadConversations();
      loadUnreadCounts();
    }
  }, [currentUserId, adminUsers]);

  useEffect(() => {
    if (currentUserId && adminUsers.length > 0) {
      // Load online status initially
      loadUserOnlineStatus();
      
      // Reload unread counts and online status periodically without subscribing to every activity log insert.
      const interval = setInterval(() => {
        loadUnreadCounts();
        loadUserOnlineStatus();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [currentUserId, adminUsers]);

  useEffect(() => {
    if (selectedConversationId && currentUserId) {
      loadConversationDetails();
    }
  }, [selectedConversationId, currentUserId]);

  useEffect(() => {
    if (selectedConversation && currentUserId) {
      loadMessages();
      
      // Subscribe to new messages for this conversation
      const channel = supabase
        .channel(`admin-chat-${selectedConversation.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'admin_internal_messages',
            filter: `conversation_id=eq.${selectedConversation.id}`,
          },
          (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            loadMessages();
            loadUnreadCounts();
            // Reload conversations to update last_message_at
            loadConversations();
            // Clear typing indicator when message is received
            setTypingUsers(prev => {
              const updated = { ...prev };
              delete updated[selectedConversation.id];
              return updated;
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'admin_internal_messages',
            filter: `conversation_id=eq.${selectedConversation.id}`,
          },
          (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            // Update when messages are marked as read
            loadMessages();
            loadUnreadCounts();
          }
        )
        .on(
          'broadcast',
          { event: 'typing' },
          (payload: { payload: { userId: string; conversationId: string } }) => {
            const { userId, conversationId } = payload.payload;
            // Only show typing indicator if it's not the current user
            if (userId !== currentUserId && conversationId === selectedConversation.id) {
              setTypingUsers(prev => ({
                ...prev,
                [conversationId]: userId,
              }));
              // Clear typing indicator after 3 seconds
              setTimeout(() => {
                setTypingUsers(prev => {
                  const updated = { ...prev };
                  delete updated[conversationId];
                  return updated;
                });
              }, 3000);
            }
          }
        )
        .subscribe();

      // Set up typing channel reference
      typingChannelRef.current = channel;

      return () => {
        supabase.removeChannel(channel);
        typingChannelRef.current = null;
        // Clear typing indicators when leaving conversation
        setTypingUsers({});
      };
    }
  }, [selectedConversation, currentUserId]);

  // Global listener for new messages (for notifications)
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('admin-chat-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_internal_messages',
        },
        async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const newMessage = payload.new as any;
          
          // Only notify if message is not from current user and conversation is not selected
          if (newMessage.sender_id !== currentUserId) {
            // Check if this conversation is currently selected
            if (selectedConversationId !== newMessage.conversation_id) {
              // Play sound notification
              playNotificationSound();
              // Update unread counts
              setTimeout(() => {
                loadUnreadCounts();
              }, 500);
            }
          }
          // Always reload conversations to update last_message_at and order
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admin_internal_conversations',
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          // Update conversations list when last_message_at changes
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, selectedConversationId, adminUsers]);

  const loadAdminUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setIsLoading(false);
        return;
      }

      const currentUserId = session.user.id;
      setCurrentUserId(currentUserId);

      const response = await fetch(`/api/admin/internal-chat/users?t=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        const otherUsers = data.users || [];

        // Get current user's profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, avatar_url, is_admin')
          .eq('user_id', currentUserId)
          .maybeSingle();
        
        // Set admin status
        setIsCurrentUserAdmin(profile?.is_admin || false);

        // Add current user to the list
        const currentUser: AdminUser = {
          id: currentUserId,
          email: session.user.email || '',
          firstName: profile?.first_name || session.user.user_metadata?.first_name || '',
          lastName: profile?.last_name || session.user.user_metadata?.last_name || '',
          avatar: profile?.avatar_url || session.user.user_metadata?.avatar_url || '',
          name: `${profile?.first_name || session.user.user_metadata?.first_name || ''} ${profile?.last_name || session.user.user_metadata?.last_name || ''}`.trim() || session.user.email || '',
        };

        setAdminUsers([currentUser, ...otherUsers]);
      } else {
        console.error('Error loading admin users:', response.statusText);
      }
    } catch (error) {
      console.error('Error loading admin users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversations = async () => {
    if (!currentUserId) return;

    try {
      // Load direct conversations
      const { data: directConvs, error: directError } = await supabase
        .from('admin_internal_conversations')
        .select('*')
        .eq('conversation_type', 'direct')
        .or(`participant1_id.eq.${currentUserId},participant2_id.eq.${currentUserId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      // Load group conversations (where user is a participant)
      const { data: groupParticipants, error: participantsError } = await supabase
        .from('admin_internal_conversation_participants')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      const groupConvIds =
        groupParticipants?.map((p: { conversation_id: string }) => p.conversation_id) || [];

      const { data: groupConvs, error: groupError } = groupConvIds.length > 0
        ? await supabase
            .from('admin_internal_conversations')
            .select('*')
            .eq('conversation_type', 'group')
            .in('id', groupConvIds)
            .order('last_message_at', { ascending: false, nullsFirst: false })
        : { data: [], error: null };

      // Combine and format conversations
      const convList: ConversationListItem[] = [];

      // Get user profiles for direct conversations
      const otherUserIds = directConvs?.map((conv: Conversation) =>
        conv.participant1_id === currentUserId ? conv.participant2_id : conv.participant1_id
      ) || [];
      
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, first_name, last_name, avatar_url')
        .in('user_id', otherUserIds.length > 0 ? otherUserIds : ['']);
      
      const profileRows: InternalChatUserProfileRow[] = (profiles ?? []) as InternalChatUserProfileRow[];
      const profilesMap = new Map(profileRows.map((p) => [p.user_id, p] as const));

      // Add direct conversations
      directConvs?.forEach((conv: Conversation) => {
        const otherUserId = conv.participant1_id === currentUserId 
          ? conv.participant2_id 
          : conv.participant1_id;
        const profile = profilesMap.get(otherUserId);
        const otherUser = adminUsers.find(u => u.id === otherUserId);
        const name = otherUser?.name || (profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Utilizator') || 'Utilizator';
        const avatar = otherUser?.avatar || profile?.avatar_url || null;
        
        convList.push({
          id: conv.id,
          type: 'direct',
          name,
          avatar,
          last_message_at: conv.last_message_at,
          other_user_id: otherUserId,
        });
      });

      // Add group conversations
      groupConvs?.forEach((conv: Conversation) => {
        convList.push({
          id: conv.id,
          type: 'group',
          name: conv.group_name || 'Grup fără nume',
          avatar: conv.group_avatar || null,
          last_message_at: conv.last_message_at,
        });
      });

      // Sort by last_message_at
      convList.sort((a, b) => {
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      setConversations(convList);
      // Load unread counts after conversations are loaded
      loadUnreadCounts();
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const loadConversationDetails = async () => {
    if (!selectedConversationId || !currentUserId) return;

    try {
      const { data, error } = await supabase
        .from('admin_internal_conversations')
        .select('*')
        .eq('id', selectedConversationId)
        .single();

      if (error) {
        console.error('Error loading conversation details:', error);
      } else {
        setSelectedConversation(data);
        // Load participants if it's a group
        if (data.conversation_type === 'group') {
          loadGroupParticipants(data.id);
        }
      }
    } catch (error) {
      console.error('Error loading conversation details:', error);
    }
  };

  const loadGroupParticipants = async (conversationId: string) => {
    setIsLoadingParticipants(true);
    try {
      const { data, error } = await supabase
        .from('admin_internal_conversation_participants')
        .select('user_id, role')
        .eq('conversation_id', conversationId);

      if (error) {
        console.error('Error loading participants:', error);
        setGroupParticipants([]);
      } else {
        // Map participants with user info
        const participantsWithUsers = (data || []).map((p: { user_id: string; role: string }) => ({
          user_id: p.user_id,
          role: p.role,
          user: adminUsers.find(u => u.id === p.user_id) || null,
        }));
        setGroupParticipants(participantsWithUsers);
      }
    } catch (error) {
      console.error('Error loading participants:', error);
      setGroupParticipants([]);
    } finally {
      setIsLoadingParticipants(false);
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!selectedConversation || !currentUserId) return;

    try {
      const { error } = await supabase
        .from('admin_internal_conversation_participants')
        .delete()
        .eq('conversation_id', selectedConversation.id)
        .eq('user_id', userId);

      if (error) {
        console.error('Error removing participant:', error);
        setErrorMessage('Eroare la eliminarea participanților. Te rog încearcă din nou.');
        setShowErrorModal(true);
      } else {
        // Reload participants
        await loadGroupParticipants(selectedConversation.id);
      }
    } catch (error) {
      console.error('Error removing participant:', error);
      setErrorMessage('Eroare la eliminarea participanților. Te rog încearcă din nou.');
      setShowErrorModal(true);
    }
  };

  const handleAddParticipants = async () => {
    if (!selectedConversation || selectedParticipantsToAdd.length === 0) return;

    try {
      const { error } = await supabase
        .from('admin_internal_conversation_participants')
        .insert(
          selectedParticipantsToAdd.map(userId => ({
            conversation_id: selectedConversation.id,
            user_id: userId,
            role: 'member',
          }))
        );

      if (error) {
        console.error('Error adding participants:', error);
        setErrorMessage('Eroare la adăugarea participanților. Te rog încearcă din nou.');
        setShowErrorModal(true);
      } else {
        // Reload participants
        await loadGroupParticipants(selectedConversation.id);
        setShowAddParticipantsModal(false);
        setSelectedParticipantsToAdd([]);
      }
    } catch (error) {
      console.error('Error adding participants:', error);
      setErrorMessage('Eroare la adăugarea participanților. Te rog încearcă din nou.');
      setShowErrorModal(true);
    }
  };

  const loadMessages = async () => {
    if (!selectedConversation) return;

    try {
      const { data, error } = await supabase
        .from('admin_internal_messages')
        .select('*')
        .eq('conversation_id', selectedConversation.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading messages:', error);
      } else {
        setMessages(data || []);
        markMessagesAsRead();
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedConversation || !currentUserId) return;

    try {
      await supabase
        .from('admin_internal_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', selectedConversation.id)
        .neq('sender_id', currentUserId)
        .is('read_at', null);
      
      // Update unread count for this conversation
      setUnreadCounts(prev => {
        const newCounts = { ...prev };
        newCounts[selectedConversation.id] = 0;
        return newCounts;
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const loadUnreadCounts = async () => {
    if (!currentUserId) return;

    try {
      // Get all conversations where user is a participant
      const { data: directConvs } = await supabase
        .from('admin_internal_conversations')
        .select('id')
        .eq('conversation_type', 'direct')
        .or(`participant1_id.eq.${currentUserId},participant2_id.eq.${currentUserId}`);

      const { data: groupParticipants } = await supabase
        .from('admin_internal_conversation_participants')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      const groupConvIds =
        groupParticipants?.map((p: { conversation_id: string }) => p.conversation_id) || [];
      const directConvIds = directConvs?.map((c: { id: string }) => c.id) || [];
      const allConvIds = [...directConvIds, ...groupConvIds];

      if (allConvIds.length === 0) return;

      // Count unread messages for each conversation
      const { data: unreadMessages } = await supabase
        .from('admin_internal_messages')
        .select('conversation_id')
        .in('conversation_id', allConvIds)
        .neq('sender_id', currentUserId)
        .is('read_at', null);

      const counts: Record<string, number> = {};
      unreadMessages?.forEach((msg: { conversation_id: string }) => {
        counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1;
      });

      setUnreadCounts(counts);
    } catch (error) {
      console.error('Error loading unread counts:', error);
    }
  };

  const playNotificationSound = () => {
    try {
      // Create a Telegram-like notification sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Telegram-like sound: two short beeps
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);

      // Second beep
      setTimeout(() => {
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();
        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);
        oscillator2.frequency.value = 600;
        oscillator2.type = 'sine';
        gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        oscillator2.start(audioContext.currentTime);
        oscillator2.stop(audioContext.currentTime + 0.15);
      }, 120);
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  };

  const loadUserOnlineStatus = async () => {
    if (!currentUserId || adminUsers.length === 0) return;

    try {
      const userIds = adminUsers.map(u => u.id);
      
      // Get last activity for each user (check last 30 days for better performance)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      // Get recent activities (last 10 minutes) for online check
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      const [recentActivities, allActivities] = await Promise.all([
        supabase
          .from('user_activity_logs')
          .select('user_id, created_at')
          .in('user_id', userIds)
          .gte('created_at', tenMinutesAgo)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_activity_logs')
          .select('user_id, created_at')
          .in('user_id', userIds)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
      ]);

      // Group by user_id and get most recent activity for online check
      const recentActivityMap = new Map<string, string>();
      recentActivities.data?.forEach((activity: { user_id: string; created_at: string }) => {
        if (activity.user_id && activity.created_at) {
          const existing = recentActivityMap.get(activity.user_id);
          if (!existing || new Date(activity.created_at) > new Date(existing)) {
            recentActivityMap.set(activity.user_id, activity.created_at);
          }
        }
      });

      // Group by user_id and get most recent activity ever (for last seen)
      const lastActivityMap = new Map<string, string>();
      allActivities.data?.forEach((activity: { user_id: string; created_at: string }) => {
        if (activity.user_id && activity.created_at) {
          const existing = lastActivityMap.get(activity.user_id);
          if (!existing || new Date(activity.created_at) > new Date(existing)) {
            lastActivityMap.set(activity.user_id, activity.created_at);
          }
        }
      });

      // Calculate online status (online if activity in last 5 minutes)
      const statusMap: Record<string, { isOnline: boolean; lastSeen: string | null }> = {};
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      adminUsers.forEach(user => {
        const recentActivity = recentActivityMap.get(user.id);
        const lastActivity = lastActivityMap.get(user.id);
        
        if (recentActivity) {
          const isOnline = new Date(recentActivity) > fiveMinutesAgo;
          statusMap[user.id] = {
            isOnline,
            lastSeen: lastActivity || recentActivity,
          };
        } else if (lastActivity) {
          statusMap[user.id] = {
            isOnline: false,
            lastSeen: lastActivity,
          };
        } else {
          statusMap[user.id] = {
            isOnline: false,
            lastSeen: null,
          };
        }
      });

      setUserOnlineStatus(statusMap);
    } catch (error) {
      console.error('Error loading user online status:', error);
    }
  };

  const formatLastSeen = (lastSeen: string | null): string => {
    if (!lastSeen) return 'Niciodată';
    
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - lastSeenDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Acum';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}z`;
    
    return lastSeenDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setSelectedImages([...selectedImages, ...fileArray]);

    // Create previews
    const previewPromises = fileArray.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    const previews = await Promise.all(previewPromises);
    setImagePreviews([...imagePreviews, ...previews]);

    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index));
    setImagePreviews(imagePreviews.filter((_, i) => i !== index));
  };

  const uploadImages = async (): Promise<string[]> => {
    if (selectedImages.length === 0) return [];

    setIsUploadingImages(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of selectedImages) {
        const result = await uploadImageFile(file);

        if (result.success && result.url) {
          uploadedUrls.push(result.url);
        } else {
          throw new Error((!result.success && result.error) || 'Eroare la încărcarea imaginii');
        }
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      throw error;
    } finally {
      setIsUploadingImages(false);
    }

    return uploadedUrls;
  };

  const commonEmojis = ['😀', '😂', '🥰', '😍', '🤔', '👍', '❤️', '🎉', '🔥', '✅', '❌', '👏', '🙏', '😊', '😎', '🤗', '😴', '😢', '😡', '🤮'];

  const insertEmoji = (emoji: string) => {
    setMessageInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return;

    try {
      const { error } = await supabase
        .from('admin_internal_conversations')
        .delete()
        .eq('id', conversationToDelete);

      if (error) {
        console.error('Error deleting conversation:', error);
        setErrorMessage('Eroare la ștergerea conversației. Te rog încearcă din nou.');
        setShowErrorModal(true);
      } else {
        // Reset selection if deleted conversation was selected
        if (selectedConversationId === conversationToDelete) {
          setSelectedConversationId(null);
        }
        // Reload conversations list
        loadConversations();
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      setErrorMessage('Eroare la ștergerea conversației. Te rog încearcă din nou.');
      setShowErrorModal(true);
    } finally {
      setShowDeleteModal(false);
      setConversationToDelete(null);
    }
  };

  const handleEditMessage = (messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setEditingMessageContent(currentContent);
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editingMessageContent.trim()) return;

    try {
      const { error } = await supabase
        .from('admin_internal_messages')
        .update({ content: editingMessageContent.trim() })
        .eq('id', editingMessageId);

      if (error) {
        console.error('Error updating message:', error);
        setErrorMessage('Eroare la actualizarea mesajului. Te rog încearcă din nou.');
        setShowErrorModal(true);
      } else {
        loadMessages();
        setEditingMessageId(null);
        setEditingMessageContent('');
      }
    } catch (error) {
      console.error('Error updating message:', error);
      setErrorMessage('Eroare la actualizarea mesajului. Te rog încearcă din nou.');
      setShowErrorModal(true);
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageContent('');
  };

  const handleDeleteMessage = async () => {
    if (!messageToDelete) return;

    try {
      console.log('Deleting message:', messageToDelete);
      const { data, error } = await supabase
        .from('admin_internal_messages')
        .delete()
        .eq('id', messageToDelete)
        .select();

      if (error) {
        console.error('Error deleting message:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        setErrorMessage(`Eroare la ștergerea mesajului: ${error.message || 'Eroare necunoscută'}. Te rog încearcă din nou.`);
        setShowErrorModal(true);
      } else {
        console.log('Message deleted successfully:', data);
        // Reload messages to reflect the deletion
        await loadMessages();
        // Also reload unread counts
        loadUnreadCounts();
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      setErrorMessage('Eroare la ștergerea mesajului. Te rog încearcă din nou.');
      setShowErrorModal(true);
    } finally {
      setShowDeleteMessageModal(false);
      setMessageToDelete(null);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Fișierul este prea mare. Dimensiunea maximă este 5MB.');
        setShowErrorModal(true);
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Vă rugăm să selectați o imagine validă.');
        setShowErrorModal(true);
        return;
      }
      
      setAvatarFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile || !currentUserId) return;

    setIsUploadingAvatar(true);
    try {
      const uploadData = await uploadImageFile(avatarFile);
      if (!uploadData.success) {
        throw new Error(uploadData.error);
      }
      if (!uploadData.url) {
        throw new Error('Eroare la încărcarea imaginii');
      }
      const avatarUrl = uploadData.url;

      // Update user_profiles with new avatar in Supabase
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: avatarUrl })
        .eq('user_id', currentUserId);

      if (updateError) {
        throw updateError;
      }

      // Update adminUsers state to reflect new avatar
      setAdminUsers(prev => prev.map(user => 
        user.id === currentUserId 
          ? { ...user, avatar: avatarUrl }
          : user
      ));

      // Close modal and reset state
      setShowAvatarModal(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      
      // Reload admin users to ensure consistency
      await loadAdminUsers();
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setErrorMessage(error.message || 'Eroare la încărcarea avatarului. Te rog încearcă din nou.');
      setShowErrorModal(true);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!currentUserId) return;

    setIsUploadingAvatar(true);
    try {
      // Update user_profiles to remove avatar in Supabase
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: null })
        .eq('user_id', currentUserId);

      if (updateError) {
        throw updateError;
      }

      // Update adminUsers state to reflect removed avatar
      setAdminUsers(prev => prev.map(user => 
        user.id === currentUserId 
          ? { ...user, avatar: '' }
          : user
      ));

      // Close modal and reset state
      setShowAvatarModal(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      
      // Reload admin users to ensure consistency
      await loadAdminUsers();
    } catch (error: any) {
      console.error('Error deleting avatar:', error);
      setErrorMessage(error.message || 'Eroare la ștergerea avatarului. Te rog încearcă din nou.');
      setShowErrorModal(true);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Function to send typing indicator
  const sendTypingIndicator = () => {
    if (!selectedConversation || !currentUserId || !typingChannelRef.current) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Send typing event
    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: currentUserId,
        conversationId: selectedConversation.id,
      },
    });

    // Set timeout to stop typing indicator after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      // Typing stopped
    }, 2000);
  };

  // Function to capitalize first letter after sentence endings (. ! ?) and at the start
  const capitalizeSentences = (text: string): string => {
    if (!text || text.length === 0) return text;
    
    // Capitalize first letter of the entire text
    let result = text.charAt(0).toUpperCase() + text.slice(1);
    
    // Capitalize first letter after sentence endings (. ! ?) followed by space
    result = result.replace(/([.!?]\s+)([a-zăâîșț])/g, (match, punctuation, letter) => {
      return punctuation + letter.toUpperCase();
    });
    
    return result;
  };

  const sendMessage = async () => {
    if (!selectedConversation || (!messageInput.trim() && selectedImages.length === 0) || isSending) return;

    setIsSending(true);
    try {
      // Upload images first
      let attachmentUrls: string[] = [];
      if (selectedImages.length > 0) {
        try {
          attachmentUrls = await uploadImages();
        } catch (error) {
          console.error('Error uploading images:', error);
          setErrorMessage('Eroare la încărcarea imaginilor. Te rog încearcă din nou.');
          setShowErrorModal(true);
          setIsSending(false);
          return;
        }
      }

      // Capitalize sentences in the message
      const processedContent = messageInput.trim() ? capitalizeSentences(messageInput.trim()) : '';

      const { error } = await supabase
        .from('admin_internal_messages')
        .insert({
          conversation_id: selectedConversation.id,
          sender_id: currentUserId!,
          content: processedContent,
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
        });

      if (error) {
        console.error('Error sending message:', error);
        setErrorMessage('Eroare la trimiterea mesajului. Te rog încearcă din nou.');
        setShowErrorModal(true);
      } else {
        setMessageInput('');
        setSelectedImages([]);
        setImagePreviews([]);
        // Clear typing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        // Update conversation last_message_at
        await supabase
          .from('admin_internal_conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', selectedConversation.id);
        loadMessages();
        loadConversations(); // Refresh conversations list
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setErrorMessage('Eroare la trimiterea mesajului. Te rog încearcă din nou.');
      setShowErrorModal(true);
    } finally {
      setIsSending(false);
    }
  };

  const createDirectConversation = async (otherUserId: string) => {
    if (!currentUserId || otherUserId === currentUserId) return;

    try {
      // Check if conversation already exists
      const { data: existingConv, error: checkError } = await supabase
        .from('admin_internal_conversations')
        .select('id')
        .eq('conversation_type', 'direct')
        .or(`and(participant1_id.eq.${currentUserId},participant2_id.eq.${otherUserId}),and(participant1_id.eq.${otherUserId},participant2_id.eq.${currentUserId})`)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing conversation:', checkError);
        return;
      }

      if (existingConv) {
        // Conversation already exists, just select it
        setSelectedConversationId(existingConv.id);
        return;
      }

      // Create new direct conversation
      const { data: newConv, error: convError } = await supabase
        .from('admin_internal_conversations')
        .insert({
          conversation_type: 'direct',
          participant1_id: currentUserId,
          participant2_id: otherUserId,
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating direct conversation:', convError);
        setErrorMessage('Eroare la crearea conversației. Te rog încearcă din nou.');
        setShowErrorModal(true);
        return;
      }

      // Reload conversations
      await loadConversations();

      // Select the new conversation
      setSelectedConversationId(newConv.id);
    } catch (error) {
      console.error('Error creating direct conversation:', error);
      setErrorMessage('Eroare la crearea conversației. Te rog încearcă din nou.');
      setShowErrorModal(true);
    }
  };

  const handleGroupAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Fișierul este prea mare. Dimensiunea maximă este 5MB.');
        setShowErrorModal(true);
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Vă rugăm să selectați o imagine validă.');
        setShowErrorModal(true);
        return;
      }
      
      setGroupAvatarFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setGroupAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadGroupAvatar = async (): Promise<string | null> => {
    if (!groupAvatarFile) return null;

    try {
      const uploadData = await uploadImageFile(groupAvatarFile);
      if (!uploadData.success) {
        throw new Error(uploadData.error);
      }
      if (!uploadData.url) {
        throw new Error('Eroare la încărcarea imaginii');
      }
      return uploadData.url;
    } catch (error: any) {
      console.error('Error uploading group avatar:', error);
      throw error;
    }
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedUserIds.length === 0 || !currentUserId || isCreatingGroup) return;

    setIsCreatingGroup(true);
    try {
      // Upload group avatar if provided
      let groupAvatarUrl: string | null = null;
      if (groupAvatarFile) {
        try {
          groupAvatarUrl = await uploadGroupAvatar();
        } catch (error) {
          console.error('Error uploading group avatar:', error);
          setErrorMessage('Eroare la încărcarea avatarului grupului. Te rog încearcă din nou.');
          setShowErrorModal(true);
          setIsCreatingGroup(false);
          return;
        }
      }

      // Create conversation (for groups, participant1_id and participant2_id are NULL)
      const { data: newConv, error: convError } = await supabase
        .from('admin_internal_conversations')
        .insert({
          conversation_type: 'group',
          group_name: groupName.trim(),
          group_avatar: groupAvatarUrl,
          participant1_id: null, // NULL for groups
          participant2_id: null, // NULL for groups
          created_by: currentUserId,
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating group:', convError);
        setErrorMessage('Eroare la crearea grupului. Te rog încearcă din nou.');
        setShowErrorModal(true);
        setIsCreatingGroup(false);
        return;
      }

      // Add participants (including creator)
      // Remove currentUserId from selectedUserIds if it's already there to avoid duplicates
      const uniqueSelectedIds = selectedUserIds.filter(id => id !== currentUserId);
      const participantIds = [currentUserId, ...uniqueSelectedIds];
      const participantsToInsert = participantIds.map((userId, index) => ({
        conversation_id: newConv.id,
        user_id: userId,
        role: index === 0 ? 'admin' : 'member', // Creator is admin
      }));
      
      console.log('Inserting participants:', participantsToInsert);
      console.log('Conversation:', newConv);
      
      const { data: insertedParticipants, error: participantsError } = await supabase
        .from('admin_internal_conversation_participants')
        .insert(participantsToInsert)
        .select();

      if (participantsError) {
        console.error('Error adding participants:', participantsError);
        console.error('Error details:', JSON.stringify(participantsError, null, 2));
        setErrorMessage(`Eroare la adăugarea participanților: ${participantsError.message || 'Eroare necunoscută'}. Te rog încearcă din nou.`);
        setShowErrorModal(true);
        setIsCreatingGroup(false);
        return;
      }
      
      console.log('Participants inserted successfully:', insertedParticipants);

      // Reset modal
      setShowCreateGroupModal(false);
      setGroupName('');
      setSelectedUserIds([]);
      setGroupAvatarFile(null);
      setGroupAvatarPreview(null);

      // Reload conversations
      await loadConversations();

      // Select the new group
      setSelectedConversationId(newConv.id);
    } catch (error) {
      console.error('Error creating group:', error);
      setErrorMessage('Eroare la crearea grupului. Te rog încearcă din nou.');
      setShowErrorModal(true);
      setIsCreatingGroup(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleRefresh = async () => {
    await loadAdminUsers();
    if (currentUserId) {
      await loadConversations();
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Acum';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}z`;
    
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  };

  const handleGroupAvatarEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Fișierul este prea mare. Dimensiunea maximă este 5MB.');
        setShowErrorModal(true);
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Vă rugăm să selectați o imagine validă.');
        setShowErrorModal(true);
        return;
      }
      
      setGroupAvatarEditFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setGroupAvatarEditPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGroupAvatarEditUpload = async () => {
    if (!groupAvatarEditFile || !selectedConversation || !currentUserId) return;

    setIsUploadingGroupAvatar(true);
    try {
      const uploadData = await uploadImageFile(groupAvatarEditFile);
      if (!uploadData.success) {
        throw new Error(uploadData.error);
      }
      if (!uploadData.url) {
        throw new Error('Eroare la încărcarea imaginii');
      }
      const avatarUrl = uploadData.url;
      
      console.log('Avatar uploaded:', avatarUrl);
      console.log('Updating group avatar in database for conversation:', selectedConversation.id);

      // Update group avatar in Supabase
      const { data: updateData, error: updateError } = await supabase
        .from('admin_internal_conversations')
        .update({ group_avatar: avatarUrl })
        .eq('id', selectedConversation.id)
        .select();

      if (updateError) {
        console.error('Error updating group avatar in database:', updateError);
        throw updateError;
      }
      
      console.log('Group avatar updated successfully:', updateData);

      // Reload conversations from database first
      await loadConversations();

      // Reload the selected conversation from database to get the latest data
      const { data: updatedConv, error: fetchError } = await supabase
        .from('admin_internal_conversations')
        .select('*')
        .eq('id', selectedConversation.id)
        .single();

      if (!fetchError && updatedConv) {
        // Update selectedConversation state with fresh data from database
        setSelectedConversation(updatedConv as Conversation);
        
        // Update conversations list to sync sidebar with the new avatar
        setConversations(prev => prev.map(conv => 
          conv.id === selectedConversation.id && conv.type === 'group'
            ? { ...conv, avatar: updatedConv.group_avatar || null }
            : conv
        ));
      } else {
        // Fallback: update both states manually
        setSelectedConversation({
          ...selectedConversation,
          group_avatar: avatarUrl,
        });
        setConversations(prev => prev.map(conv => 
          conv.id === selectedConversation.id && conv.type === 'group'
            ? { ...conv, avatar: avatarUrl }
            : conv
        ));
      }

      // Reset state and close modal
      setGroupAvatarEditFile(null);
      setGroupAvatarEditPreview(null);
      setShowGroupAvatarModal(false);
      if (groupAvatarEditFileInputRef.current) {
        groupAvatarEditFileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Error uploading group avatar:', error);
      setErrorMessage(error.message || 'Eroare la încărcarea avatarului grupului. Te rog încearcă din nou.');
      setShowErrorModal(true);
    } finally {
      setIsUploadingGroupAvatar(false);
    }
  };

  const handleGroupAvatarDelete = async () => {
    if (!selectedConversation || !currentUserId) return;

    setIsUploadingGroupAvatar(true);
    try {
      // Update group avatar to null in Supabase
      const { error: updateError } = await supabase
        .from('admin_internal_conversations')
        .update({ group_avatar: null })
        .eq('id', selectedConversation.id);

      if (updateError) {
        throw updateError;
      }

      // Reload conversations from database first
      await loadConversations();

      // Reload the selected conversation from database to get the latest data
      const { data: updatedConv, error: fetchError } = await supabase
        .from('admin_internal_conversations')
        .select('*')
        .eq('id', selectedConversation.id)
        .single();

      if (!fetchError && updatedConv) {
        // Update selectedConversation state with fresh data from database
        setSelectedConversation(updatedConv as Conversation);
        
        // Update conversations list to sync sidebar with the removed avatar
        setConversations(prev => prev.map(conv => 
          conv.id === selectedConversation.id && conv.type === 'group'
            ? { ...conv, avatar: null }
            : conv
        ));
      } else {
        // Fallback: update both states manually
        setSelectedConversation({
          ...selectedConversation,
          group_avatar: null,
        });
        setConversations(prev => prev.map(conv => 
          conv.id === selectedConversation.id && conv.type === 'group'
            ? { ...conv, avatar: null }
            : conv
        ));
      }

      // Reset state and close modal
      setGroupAvatarEditFile(null);
      setGroupAvatarEditPreview(null);
      setShowGroupAvatarModal(false);
    } catch (error: any) {
      console.error('Error deleting group avatar:', error);
      setErrorMessage(error.message || 'Eroare la ștergerea avatarului grupului. Te rog încearcă din nou.');
      setShowErrorModal(true);
    } finally {
      setIsUploadingGroupAvatar(false);
    }
  };

  const handleGroupNameEdit = () => {
    if (!selectedConversation || selectedConversation.conversation_type !== 'group') return;
    setEditingGroupName(selectedConversation.group_name || '');
    setIsEditingGroupName(true);
    // Focus input after state update
    setTimeout(() => {
      groupNameInputRef.current?.focus();
      groupNameInputRef.current?.select();
    }, 0);
  };

  const handleGroupNameSave = async () => {
    if (!selectedConversation || !editingGroupName.trim() || isSavingGroupName) return;

    const trimmedName = editingGroupName.trim();
    if (trimmedName === selectedConversation.group_name) {
      setIsEditingGroupName(false);
      return;
    }

    setIsSavingGroupName(true);
    try {
      // Update group name in Supabase
      const { data: updateData, error: updateError } = await supabase
        .from('admin_internal_conversations')
        .update({ group_name: trimmedName })
        .eq('id', selectedConversation.id)
        .select();

      if (updateError) {
        console.error('Error updating group name:', updateError);
        throw updateError;
      }

      console.log('Group name updated successfully:', updateData);

      // Reload conversations from database
      await loadConversations();

      // Reload the selected conversation from database
      const { data: updatedConv, error: fetchError } = await supabase
        .from('admin_internal_conversations')
        .select('*')
        .eq('id', selectedConversation.id)
        .single();

      if (!fetchError && updatedConv) {
        setSelectedConversation(updatedConv as Conversation);
        // Update conversations list to sync sidebar
        setConversations(prev => prev.map(conv => 
          conv.id === selectedConversation.id && conv.type === 'group'
            ? { ...conv, name: trimmedName }
            : conv
        ));
      }

      setIsEditingGroupName(false);
    } catch (error: any) {
      console.error('Error saving group name:', error);
      setErrorMessage(error.message || 'Eroare la salvarea numelui grupului. Te rog încearcă din nou.');
      setShowErrorModal(true);
    } finally {
      setIsSavingGroupName(false);
    }
  };

  const handleGroupNameCancel = () => {
    setIsEditingGroupName(false);
    setEditingGroupName('');
  };

  const getConversationDisplayName = () => {
    if (!selectedConversation) return '';
    if (selectedConversation.conversation_type === 'group') {
      return selectedConversation.group_name || 'Grup fără nume';
    }
    const otherUserId = selectedConversation.participant1_id === currentUserId
      ? selectedConversation.participant2_id
      : selectedConversation.participant1_id;
    const otherUser = adminUsers.find(u => u.id === otherUserId);
    return otherUser?.name || 'Utilizator';
  };

  const getConversationDisplayAvatar = () => {
    if (!selectedConversation) return null;
    if (selectedConversation.conversation_type === 'group') {
      return selectedConversation.group_avatar || null;
    }
    const otherUserId = selectedConversation.participant1_id === currentUserId
      ? selectedConversation.participant2_id
      : selectedConversation.participant1_id;
    const otherUser = adminUsers.find(u => u.id === otherUserId);
    return otherUser?.avatar || null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-gray-500">Se încarcă...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50">
      {/* Left Panel - Conversations List */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-semibold text-gray-900">Chat Intern</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Reîmprospătează lista"
              >
                <ArrowPathIcon className="w-5 h-5" />
              </button>
              {(() => {
                const currentUser = adminUsers.find(u => u.id === currentUserId);
                return (
                  <button
                    onClick={() => setShowAvatarModal(true)}
                    className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-gray-300 hover:border-blue-500 transition-colors group"
                    title="Schimbă avatarul"
                  >
                    {currentUser?.avatar ? (
                      <img
                        src={currentUser.avatar}
                        alt={currentUser.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold">
                        <span>{currentUser?.name?.charAt(0).toUpperCase() || 'U'}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium">Edit</span>
                    </div>
                  </button>
                );
              })()}
              <button
                onClick={() => setShowCreateGroupModal(true)}
                className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                title="Creează grup"
              >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
          </div>
          <p className="text-sm text-gray-500">Administratori și Manageri</p>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {(() => {
            const existingDirectUserIds = conversations
              .filter(c => c.type === 'direct')
              .map(c => c.other_user_id)
              .filter(Boolean) as string[];
            
            const availableAdmins = adminUsers.filter(
              user => user.id !== currentUserId && !existingDirectUserIds.includes(user.id)
            );

            return conversations.length === 0 && availableAdmins.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                Nu există conversații. Creează un grup sau începe o conversație!
              </div>
            ) : (
              <div>
                {/* Available Administrators Section */}
                {availableAdmins.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Administratori Disponibili
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {availableAdmins.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => createDirectConversation(user.id)}
                          className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0 relative">
                              {user.avatar ? (
                                <img
                                  src={user.avatar}
                                  alt={user.name}
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <span>{user.name.charAt(0).toUpperCase()}</span>
                              )}
                              {userOnlineStatus[user.id]?.isOnline && (
                                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                                <span>{user.name}</span>
                                {userOnlineStatus[user.id]?.isOnline && (
                                  <span className="text-xs text-green-500 font-normal">online</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 truncate">
                                {userOnlineStatus[user.id]?.isOnline 
                                  ? user.email 
                                  : userOnlineStatus[user.id]?.lastSeen 
                                    ? `Ultima dată: ${formatLastSeen(userOnlineStatus[user.id].lastSeen)}`
                                    : user.email}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

            {/* Direct Conversations Section */}
            {conversations.filter(c => c.type === 'direct').length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 border-t border-gray-200">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Conversații Directe
                  </h3>
                </div>
                <div className="divide-y divide-gray-200">
                  {conversations
                    .filter(c => c.type === 'direct')
                    .map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => setSelectedConversationId(conv.id)}
                        className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                          selectedConversationId === conv.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0 relative">
                            {conv.avatar ? (
                              <img
                                src={conv.avatar}
                                alt={conv.name}
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <span>{conv.name.charAt(0).toUpperCase()}</span>
                            )}
                            {conv.other_user_id && userOnlineStatus[conv.other_user_id]?.isOnline && (
                              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                              <span>{conv.name}</span>
                              {conv.other_user_id && userOnlineStatus[conv.other_user_id]?.isOnline && (
                                <span className="text-xs text-green-500 font-normal">online</span>
                              )}
                            </div>
                            {conv.other_user_id ? (
                              userOnlineStatus[conv.other_user_id]?.isOnline ? (
                                <div className="text-xs text-green-500">online</div>
                              ) : userOnlineStatus[conv.other_user_id]?.lastSeen ? (
                                <div className="text-xs text-gray-500">
                                  Ultima dată: {formatLastSeen(userOnlineStatus[conv.other_user_id].lastSeen)}
                                </div>
                              ) : (
                                <div className="text-xs text-gray-500">
                                  {conv.last_message_at ? formatTime(conv.last_message_at) : 'Niciodată'}
                                </div>
                              )
                            ) : conv.last_message_at ? (
                              <div className="text-xs text-gray-500">
                                {formatTime(conv.last_message_at)}
                              </div>
                            ) : null}
                          </div>
                          {unreadCounts[conv.id] > 0 && (
                            <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {unreadCounts[conv.id] > 99 ? '99+' : unreadCounts[conv.id]}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              </>
            )}

              {/* Groups Section */}
              {conversations.filter(c => c.type === 'group').length > 0 && (
                <>
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 border-t border-gray-200">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Grupuri
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {conversations
                      .filter(c => c.type === 'group')
                      .map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => setSelectedConversationId(conv.id)}
                          className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                            selectedConversationId === conv.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
                              {conv.avatar ? (
                                <img
                                  src={conv.avatar}
                                  alt={conv.name}
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <span>👥</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 truncate">
                                {conv.name}
                              </div>
                              {conv.last_message_at && (
                                <div className="text-xs text-gray-500">
                                  {formatTime(conv.last_message_at)}
                                </div>
                              )}
                            </div>
                            {unreadCounts[conv.id] > 0 && (
                              <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {unreadCounts[conv.id] > 99 ? '99+' : unreadCounts[conv.id]}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                  </div>
                </>
              )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Right Panel - Chat Window */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedConversation.conversation_type === 'group' && selectedConversation.created_by === currentUserId ? (
                    <button
                      onClick={() => {
                        setShowGroupAvatarModal(true);
                        setGroupAvatarEditPreview(selectedConversation.group_avatar || null);
                      }}
                      className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-gray-300 hover:border-blue-500 transition-colors group"
                      title="Schimbă avatarul grupului"
                    >
                      {getConversationDisplayAvatar() ? (
                        <img
                          src={getConversationDisplayAvatar()!}
                          alt={getConversationDisplayName()}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold">
                          <span>👥</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-xs font-medium">Edit</span>
                      </div>
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold relative">
                      {getConversationDisplayAvatar() ? (
                        <img
                          src={getConversationDisplayAvatar()!}
                          alt={getConversationDisplayName()}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : selectedConversation.conversation_type === 'group' ? (
                        <span>👥</span>
                      ) : (
                        <span>{getConversationDisplayName().charAt(0).toUpperCase()}</span>
                      )}
                      {selectedConversation.conversation_type === 'direct' && (() => {
                        const otherUserId = selectedConversation.participant1_id === currentUserId
                          ? selectedConversation.participant2_id
                          : selectedConversation.participant1_id;
                        return otherUserId && userOnlineStatus[otherUserId]?.isOnline && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                        );
                      })()}
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      {selectedConversation.conversation_type === 'group' && '👥 '}
                      {selectedConversation.conversation_type === 'group' && selectedConversation.created_by === currentUserId && isEditingGroupName ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            ref={groupNameInputRef}
                            type="text"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleGroupNameSave();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleGroupNameCancel();
                              }
                            }}
                            className="flex-1 px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            disabled={isSavingGroupName}
                          />
                          <button
                            onClick={handleGroupNameSave}
                            disabled={isSavingGroupName || !editingGroupName.trim()}
                            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Salvează"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleGroupNameCancel}
                            disabled={isSavingGroupName}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Anulează"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{getConversationDisplayName()}</span>
                          {selectedConversation.conversation_type === 'group' && selectedConversation.created_by === currentUserId && (
                            <button
                              onClick={handleGroupNameEdit}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              title="Editează numele grupului"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                      {selectedConversation.conversation_type === 'direct' && (() => {
                        const otherUserId = selectedConversation.participant1_id === currentUserId
                          ? selectedConversation.participant2_id
                          : selectedConversation.participant1_id;
                        return otherUserId && userOnlineStatus[otherUserId]?.isOnline && (
                          <span className="text-xs text-green-500 font-normal">online</span>
                        );
                      })()}
                    </div>
                    {selectedConversation.conversation_type === 'group' ? (
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        <span>Grup • {groupParticipants.length} participanți</span>
                        {isCurrentUserAdmin && (
                          <button
                            onClick={() => {
                              setConversationToDelete(selectedConversation.id);
                              setShowDeleteModal(true);
                            }}
                            className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Șterge grupul"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (() => {
                      const otherUserId = selectedConversation.participant1_id === currentUserId
                        ? selectedConversation.participant2_id
                        : selectedConversation.participant1_id;
                      const status = otherUserId ? userOnlineStatus[otherUserId] : null;
                      return status && !status.isOnline && status.lastSeen ? (
                        <div className="text-sm text-gray-500">
                          Ultima dată: {formatLastSeen(status.lastSeen)}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedConversation.conversation_type === 'group' && (
                    <button
                      onClick={() => setShowParticipantsModal(true)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Gestionează participanții"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.map((message) => {
                const isOwn = message.sender_id === currentUserId;
                const sender = adminUsers.find(u => u.id === message.sender_id);
                const senderName = sender?.name || sender?.firstName || sender?.email?.split('@')[0] || 'Utilizator necunoscut';
                return (
                  <div
                    key={message.id}
                    className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'} mb-4`}
                  >
                    {/* Avatar pentru mesajele primite (stânga) */}
                    {!isOwn && (
                      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {sender?.avatar ? (
                          <img
                            src={sender.avatar}
                            alt={senderName}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-gray-600 text-xs">{senderName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                    )}
                    
                    {/* Container pentru bubble și nume */}
                    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[70%]`}>
                      {/* Numele expeditorului */}
                      <div className={`text-xs font-medium text-gray-700 mb-1 px-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                        {senderName}
                      </div>
                      
                      {/* Bubble-ul mesajului */}
                      <div className="relative group">
                        <div
                          className={`px-3 py-2 rounded-lg ${
                            isOwn
                              ? 'bg-blue-500 text-white rounded-br-sm'
                              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                          }`}
                        >
                          {message.attachment_urls && message.attachment_urls.length > 0 && (
                            <div className="mb-2 space-y-2">
                              {message.attachment_urls.map((url, idx) => (
                                <img
                                  key={idx}
                                  src={url}
                                  alt={`Attachment ${idx + 1}`}
                                  className="max-w-full h-auto rounded-lg"
                                  style={{ maxHeight: '300px' }}
                                />
                              ))}
                            </div>
                          )}
                          {editingMessageId === message.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingMessageContent}
                                onChange={(e) => setEditingMessageContent(e.target.value)}
                                className="w-full px-2 py-1 text-sm bg-white text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={3}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={handleSaveEdit}
                                  className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                >
                                  Salvează
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-3 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                                >
                                  Anulează
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {message.content && (
                                <div className="text-base whitespace-pre-wrap break-words">{message.content}</div>
                              )}
                              <div
                                className={`text-xs mt-1 flex items-center gap-1 ${
                                  isOwn ? 'text-blue-100' : 'text-gray-500'
                                }`}
                              >
                                <span>{formatTime(message.created_at)}</span>
                                {isOwn && (
                                  <span className="flex items-center ml-1">
                                    <svg
                                      className={`w-3.5 h-3.5 ${message.read_at ? 'text-green-200' : 'text-white/70'}`}
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    <svg
                                      className={`w-3.5 h-3.5 ${message.read_at ? 'text-green-200' : 'text-white/70'}`}
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                      style={{ marginLeft: '-4px' }}
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        {isOwn && !editingMessageId && (
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditMessage(message.id, message.content)}
                              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-lg transition-colors flex items-center justify-center"
                              title="Editează mesaj"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setMessageToDelete(message.id);
                                setShowDeleteMessageModal(true);
                              }}
                              className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded shadow-lg transition-colors flex items-center justify-center"
                              title="Șterge mesaj"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Avatar pentru mesajele proprii (dreapta) */}
                    {isOwn && (
                      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {sender?.avatar ? (
                          <img
                            src={sender.avatar}
                            alt={senderName}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-gray-600 text-xs">{senderName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  Nu există mesaje. Începe conversația!
                </div>
              )}
              {/* Typing Indicator */}
              {selectedConversation && typingUsers[selectedConversation.id] && (() => {
                const typingUserId = typingUsers[selectedConversation.id];
                const typingUser = adminUsers.find(u => u.id === typingUserId);
                const typingUserName = typingUser?.name || typingUser?.firstName || typingUser?.email?.split('@')[0] || 'Cineva';
                return (
                  <div className="flex items-end gap-2 justify-start mb-4">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {typingUser?.avatar ? (
                        <img
                          src={typingUser.avatar}
                          alt={typingUserName}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-gray-600 text-xs">{typingUserName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    {/* Typing bubble */}
                    <div className="flex flex-col items-start max-w-[70%]">
                      <div className="text-xs font-medium text-gray-700 mb-1 px-1 text-left">
                        {typingUserName}
                      </div>
                      <div className="bg-gray-100 text-gray-900 px-3 py-2 rounded-lg rounded-bl-sm">
                        <div className="text-base text-gray-500 italic">Scrie...</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Message Input */}
            <div className="bg-white border-t border-gray-200 p-4">
              {/* Image Previews */}
              {imagePreviews.length > 0 && (
                <div className="mb-3 flex gap-2 flex-wrap">
                  {imagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={preview}
                        alt={`Preview ${idx + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border border-gray-300"
                      />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-2 items-center">
                {/* Emoji Button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Emoji"
                  >
                    <FaceSmileIcon className="w-5 h-5" />
                  </button>
                  
                  {/* Emoji Picker */}
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-300 rounded-lg shadow-xl p-2 z-50">
                      <div className="grid grid-cols-5 gap-1 w-[220px]">
                        {commonEmojis.map((emoji, idx) => (
                          <button
                            key={idx}
                            onClick={() => insertEmoji(emoji)}
                            className="text-xl hover:bg-gray-100 rounded p-2 transition-colors flex items-center justify-center aspect-square"
                            title={emoji}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Attachment Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Atașează imagine"
                >
                  <PaperClipIcon className="w-5 h-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => {
                    setMessageInput(e.target.value);
                    // Send typing indicator when user types
                    if (e.target.value.trim().length > 0) {
                      sendTypingIndicator();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (messageInput.trim() || selectedImages.length > 0) {
                        sendMessage();
                      }
                    }
                  }}
                  placeholder="Scrie un mesaj..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSending || isUploadingImages}
                />
                <button
                  onClick={sendMessage}
                  disabled={(!messageInput.trim() && selectedImages.length === 0) || isSending || isUploadingImages}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isUploadingImages ? 'Se încarcă...' : isSending ? 'Trimite...' : 'Trimite'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-200 flex items-center justify-center">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Selectează o conversație
              </h3>
              <p className="text-gray-500">
                Alege o conversație sau creează un grup nou
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateGroupModal(false);
            }
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Creează Grup Nou</h2>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nume Grup *
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="ex: Echipa Marketing"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Avatar Grup (opțional)
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {groupAvatarPreview ? (
                      <div className="relative group">
                        <img
                          src={groupAvatarPreview}
                          alt="Group avatar preview"
                          className="w-20 h-20 rounded-full object-cover border-2 border-gray-300"
                        />
                        <button
                          onClick={() => {
                            setGroupAvatarFile(null);
                            setGroupAvatarPreview(null);
                            if (groupAvatarFileInputRef.current) {
                              groupAvatarFileInputRef.current.value = '';
                            }
                          }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Șterge avatar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold border-2 border-gray-300">
                        <span>👥</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={groupAvatarFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleGroupAvatarFileChange}
                      className="hidden"
                      id="group-avatar-input"
                    />
                    <label
                      htmlFor="group-avatar-input"
                      className="inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer transition-colors text-sm"
                    >
                      {groupAvatarPreview ? 'Schimbă avatar' : 'Adaugă avatar'}
                    </label>
                    <p className="text-xs text-gray-500 mt-1">Max 5MB, format: JPG, PNG, GIF</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selectează Participanți *
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {adminUsers.map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="w-4 h-4 text-blue-500 rounded focus:ring-blue-500"
                      />
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span>{user.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => {
                  setShowCreateGroupModal(false);
                  setGroupName('');
                  setSelectedUserIds([]);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={createGroup}
                disabled={!groupName.trim() || selectedUserIds.length === 0 || isCreatingGroup}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isCreatingGroup ? 'Se creează...' : 'Creează Grup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Message Confirmation Modal */}
      {showDeleteMessageModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => {
            setShowDeleteMessageModal(false);
            setMessageToDelete(null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <TrashIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Șterge mesaj</h3>
            </div>
            <p className="text-gray-700 mb-6">
              Ești sigur că vrei să ștergi acest mesaj? Această acțiune este permanentă și nu poate fi anulată.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteMessageModal(false);
                  setMessageToDelete(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={handleDeleteMessage}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Șterge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Conversation Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => {
            setShowDeleteModal(false);
            setConversationToDelete(null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <TrashIcon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Șterge conversația</h3>
            </div>
            <p className="text-gray-700 mb-6">
              Ești sigur că vrei să ștergi această conversație? Această acțiune este permanentă și nu poate fi anulată.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setConversationToDelete(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={handleDeleteConversation}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Șterge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => setShowErrorModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Eroare</h3>
            </div>
            <p className="text-gray-700 mb-6">{errorMessage}</p>
            <button
              onClick={() => setShowErrorModal(false)}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Participants Modal */}
      {showParticipantsModal && selectedConversation?.conversation_type === 'group' && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => setShowParticipantsModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Participanți în {selectedConversation.group_name || 'Grup'}
                </h3>
                <button
                  onClick={() => setShowParticipantsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Group Avatar Edit Section */}
              {selectedConversation.created_by === currentUserId && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Avatar Grup
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {groupAvatarEditPreview ? (
                        <div className="relative group">
                          <img
                            src={groupAvatarEditPreview}
                            alt="Group avatar preview"
                            className="w-16 h-16 rounded-full object-cover border-2 border-gray-300"
                          />
                          <button
                            onClick={() => {
                              setGroupAvatarEditFile(null);
                              setGroupAvatarEditPreview(null);
                              if (groupAvatarEditFileInputRef.current) {
                                groupAvatarEditFileInputRef.current.value = '';
                              }
                            }}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Anulează"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : selectedConversation.group_avatar ? (
                        <div className="relative group">
                          <img
                            src={selectedConversation.group_avatar}
                            alt="Group avatar"
                            className="w-16 h-16 rounded-full object-cover border-2 border-gray-300"
                          />
                          <button
                            onClick={handleGroupAvatarDelete}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Șterge avatar"
                            disabled={isUploadingGroupAvatar}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold border-2 border-gray-300">
                          <span>👥</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        ref={groupAvatarEditFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleGroupAvatarEditFileChange}
                        className="hidden"
                        id="group-avatar-edit-input"
                      />
                      <label
                        htmlFor="group-avatar-edit-input"
                        className="inline-block px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer transition-colors text-sm"
                      >
                        {groupAvatarEditPreview ? 'Schimbă' : 'Adaugă'}
                      </label>
                      {groupAvatarEditPreview && (
                        <button
                          onClick={handleGroupAvatarEditUpload}
                          disabled={isUploadingGroupAvatar}
                          className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
                        >
                          {isUploadingGroupAvatar ? 'Se încarcă...' : 'Salvează'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingParticipants ? (
                <div className="text-center text-gray-500">Se încarcă...</div>
              ) : (
                <div className="space-y-3">
                  {groupParticipants.map((participant) => (
                    <div
                      key={participant.user_id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
                          {participant.user?.avatar ? (
                            <img
                              src={participant.user.avatar}
                              alt={participant.user.name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <span>{(participant.user?.name || 'U').charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {participant.user?.name || 'Utilizator'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {participant.user?.email || ''}
                            {participant.role === 'admin' && ' • Admin'}
                          </div>
                        </div>
                      </div>
                      {selectedConversation.created_by === currentUserId && participant.user_id !== currentUserId && (
                        <button
                          onClick={() => handleRemoveParticipant(participant.user_id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Elimină participanți"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200">
              {selectedConversation.created_by === currentUserId && (
                <button
                  onClick={() => {
                    setShowAddParticipantsModal(true);
                    setShowParticipantsModal(false);
                  }}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Adaugă participanți
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Participants Modal */}
      {showAddParticipantsModal && selectedConversation?.conversation_type === 'group' && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => {
            setShowAddParticipantsModal(false);
            setSelectedParticipantsToAdd([]);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Adaugă participanți</h3>
                <button
                  onClick={() => {
                    setShowAddParticipantsModal(false);
                    setSelectedParticipantsToAdd([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {adminUsers
                  .filter(user => !groupParticipants.some(p => p.user_id === user.id))
                  .map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedParticipantsToAdd.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedParticipantsToAdd([...selectedParticipantsToAdd, user.id]);
                          } else {
                            setSelectedParticipantsToAdd(selectedParticipantsToAdd.filter(id => id !== user.id));
                          }
                        }}
                        className="w-4 h-4 text-blue-500 rounded focus:ring-blue-500"
                      />
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span>{user.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </label>
                  ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-2">
              <button
                onClick={() => {
                  setShowAddParticipantsModal(false);
                  setSelectedParticipantsToAdd([]);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={handleAddParticipants}
                disabled={selectedParticipantsToAdd.length === 0}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Adaugă ({selectedParticipantsToAdd.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Change Modal */}
      {showAvatarModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => {
            setShowAvatarModal(false);
            setAvatarFile(null);
            setAvatarPreview(null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Schimbă avatarul</h3>
              <button
                onClick={() => {
                  setShowAvatarModal(false);
                  setAvatarFile(null);
                  setAvatarPreview(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
              
              <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Preview"
                      className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                    />
                  ) : (() => {
                    const currentUser = adminUsers.find(u => u.id === currentUserId);
                    return currentUser?.avatar ? (
                      <img
                        src={currentUser.avatar}
                        alt={currentUser.name}
                        className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center border-4 border-gray-200 text-white font-semibold text-4xl">
                        {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    );
                  })()}
                  
                  {/* Action buttons overlay */}
                  <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors"
                      title="Editează avatar"
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    {(() => {
                      const currentUser = adminUsers.find(u => u.id === currentUserId);
                      return currentUser?.avatar && !avatarPreview && (
                        <button
                          onClick={handleDeleteAvatar}
                          className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                          title="Șterge avatar"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      );
                    })()}
                  </div>
                </div>
                
                <button
                  onClick={() => avatarFileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Selectează imagine
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowAvatarModal(false);
                  setAvatarFile(null);
                  setAvatarPreview(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={isUploadingAvatar}
              >
                Anulează
              </button>
              <button
                onClick={handleAvatarUpload}
                disabled={!avatarFile || isUploadingAvatar}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isUploadingAvatar ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Se încarcă...</span>
                  </>
                ) : (
                  'Salvează'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Avatar Edit Modal */}
      {showGroupAvatarModal && selectedConversation?.conversation_type === 'group' && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]"
          onClick={() => {
            setShowGroupAvatarModal(false);
            setGroupAvatarEditFile(null);
            setGroupAvatarEditPreview(selectedConversation.group_avatar || null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Schimbă Avatar Grup</h3>
            </div>

            <div className="p-6">
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative">
                  {groupAvatarEditPreview ? (
                    <img
                      src={groupAvatarEditPreview}
                      alt="Group avatar"
                      className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 flex items-center justify-center text-white text-4xl border-4 border-gray-200">
                      <span>👥</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={groupAvatarEditFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleGroupAvatarEditFileChange}
                    className="hidden"
                    id="group-avatar-edit-modal-input"
                  />
                  <label
                    htmlFor="group-avatar-edit-modal-input"
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer transition-colors"
                  >
                    {groupAvatarEditPreview && groupAvatarEditFile ? 'Schimbă' : 'Selectează imagine'}
                  </label>
                  {selectedConversation.group_avatar && (
                    <button
                      onClick={handleGroupAvatarDelete}
                      disabled={isUploadingGroupAvatar}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Șterge
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowGroupAvatarModal(false);
                    setGroupAvatarEditFile(null);
                    setGroupAvatarEditPreview(selectedConversation.group_avatar || null);
                    if (groupAvatarEditFileInputRef.current) {
                      groupAvatarEditFileInputRef.current.value = '';
                    }
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isUploadingGroupAvatar}
                >
                  Anulează
                </button>
                {groupAvatarEditFile && (
                  <button
                    onClick={handleGroupAvatarEditUpload}
                    disabled={isUploadingGroupAvatar}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {isUploadingGroupAvatar ? 'Se încarcă...' : 'Salvează'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
