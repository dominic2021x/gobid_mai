"use client";

import React, { useState, useEffect } from "react";
import supabase from "@/lib/supabase";

interface NewsletterSubscriber {
  id: string;
  email: string;
  name?: string;
  subscribedAt: string;
  status: 'active' | 'unsubscribed';
  category?: string; // Categorie AI: imobiliare, auto, tehnologie, etc.
  interests?: string[]; // Interese detectate de AI
  activityScore?: number; // Scor activitate
  // Token code fields (for newsletter subscription rewards)
  tokenCode?: string; // Cod pentru 5 tokeni
  tokens?: number; // Număr de tokeni oferiți
  tokenCodeUsed?: boolean; // Dacă codul a fost folosit
  // Legacy coupon fields (for backward compatibility)
  couponCode?: string;
  couponUsed?: boolean;
}

interface NewsletterTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  category?: string; // Categorie pentru care e template-ul
  createdAt: string;
}

interface NewsletterCampaign {
  id: string;
  name: string;
  templateId?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  sentAt?: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  recipientCount: number;
  sentCount?: number;
  failedCount?: number;
  recipientCategories?: string[]; // Categoriile cărora le-a fost trimis
}

interface UserActivity {
  userId: string;
  email: string;
  category: string;
  activity: string;
  timestamp: string;
  score: number;
}

export default function NewsletterPage() {
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState<'templates' | 'subscribers' | 'campaigns' | 'auto'>('templates');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSubscriberModal, setShowSubscriberModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<NewsletterTemplate | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const [selectedSubscribers, setSelectedSubscribers] = useState<string[]>([]); // Individual subscriber IDs
  const [selectionMode, setSelectionMode] = useState<'all' | 'categories' | 'individual'>('all'); // Selection mode for sending
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>([]);
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [autoModeEnabled, setAutoModeEnabled] = useState(false);
  // Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'unsubscribed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    subject: '',
    htmlContent: '',
    textContent: '',
    category: ''
  });
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    templateId: '',
    subject: '',
    htmlContent: '',
    textContent: '',
    categories: [] as string[]
  });
  const [newSubscriber, setNewSubscriber] = useState({
    email: '',
    name: '',
    category: ''
  });
  const [resendEnabled, setResendEnabled] = useState(false);

  // Categories detected by AI
  const categories = ['imobiliare', 'auto', 'tehnologie', 'fashion', 'sport', 'casa-si-gradina', 'mama-copil', 'antichitati', 'altele'];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsClient(true);
    
    try {
      loadSubscribers();
      loadCampaigns();
      loadTemplates(); // Now async
      loadUserActivities();
      loadAutoMode();
      checkResendStatus();
    } catch (error) {
      console.error('Error initializing newsletter page:', error);
    }
  }, []);

  useEffect(() => {
    // Auto mode: monitor user activities and categorize
    if (autoModeEnabled && typeof window !== 'undefined') {
      const interval = setInterval(() => {
        try {
          analyzeUserActivities();
        } catch (error) {
          console.error('Error in analyzeUserActivities:', error);
        }
      }, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoModeEnabled]);

  const checkResendStatus = async () => {
    if (typeof window === 'undefined') return;
    try {
      // Check if Resend is configured via environment variables (for API)
      try {
        const response = await fetch('/api/admin/check-resend-config');
        if (response.ok) {
          const data = await response.json();
          if (data.configured) {
            setResendEnabled(true);
            return;
          }
        }
      } catch (apiError) {
        console.log('[Newsletter] Could not check Resend config via API');
      }

      // Check Supabase modules configuration
      try {
        const response = await fetch('/api/admin/modules/config');
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.modules) {
            const resendModule = result.modules.find((m: any) => m.module_id === 'resend');
            if (resendModule?.enabled && resendModule?.config?.apiKey) {
              setResendEnabled(true);
              return;
            }
          }
        }
      } catch (supabaseError) {
        console.log('[Newsletter] Could not check Resend config from Supabase');
      }

      setResendEnabled(false);
    } catch (e) {
      console.error('Error checking Resend status:', e);
      setResendEnabled(false);
    }
  };

  const loadSubscribers = async () => {
    try {
      console.log('[Newsletter Admin] Loading subscribers from Supabase...');
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .order('subscribed_at', { ascending: false });

      if (error) {
        console.error('[Newsletter Admin] Error loading subscribers:', error);
        setMessage({ type: 'error', text: `Eroare la încărcarea abonaților: ${error.message}` });
        return;
      }

      console.log('[Newsletter Admin] Subscribers loaded:', data?.length || 0);

      // Map Supabase data to NewsletterSubscriber interface
      const mappedSubscribers: NewsletterSubscriber[] = (data || []).map((item: any) => ({
        id: item.id,
        email: item.email,
        name: item.name || undefined,
        subscribedAt: item.subscribed_at,
        status: item.status as 'active' | 'unsubscribed',
        category: item.category || undefined,
        interests: item.interests || undefined,
        activityScore: item.activity_score || undefined,
        tokenCode: item.token_code || undefined,
        tokens: item.tokens || undefined,
        tokenCodeUsed: item.token_code_used || undefined,
      }));

      setSubscribers(mappedSubscribers);
    } catch (e: any) {
      console.error('[Newsletter Admin] Error loading subscribers:', e);
      setMessage({ type: 'error', text: `Eroare la încărcarea abonaților: ${e.message}` });
    }
  };

  const loadCampaigns = () => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('newsletter_campaigns');
      if (saved) {
        setCampaigns(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading campaigns:', e);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('newsletter_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Newsletter Admin] Error loading templates:', error);
        setMessage({ type: 'error', text: `Eroare la încărcarea template-urilor: ${error.message}` });
        return;
      }

      // Map Supabase data to NewsletterTemplate interface
      const mappedTemplates: NewsletterTemplate[] = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        subject: item.subject,
        htmlContent: item.html_content,
        textContent: item.text_content || undefined,
        category: item.category || undefined,
        createdAt: item.created_at,
      }));

      setTemplates(mappedTemplates);

      // Migrate templates from localStorage to Supabase if they exist (one-time migration)
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('newsletter_templates');
        if (saved) {
          try {
            const localTemplates: NewsletterTemplate[] = JSON.parse(saved);
            
            // Check if we need to migrate (only if we have local templates but no Supabase templates)
            if (localTemplates.length > 0 && mappedTemplates.length === 0) {
              console.log('[Newsletter Admin] Migrating templates from localStorage to Supabase...');
              
              for (const template of localTemplates) {
                const { error: insertError } = await supabase
                  .from('newsletter_templates')
                  .insert({
                    id: template.id,
                    name: template.name,
                    subject: template.subject,
                    html_content: template.htmlContent,
                    text_content: template.textContent || null,
                    category: template.category || null,
                  });

                if (insertError && insertError.code !== '23505') { // 23505 = duplicate key (ignore)
                  console.error('[Newsletter Admin] Error migrating template:', template.id, insertError);
                }
              }

              // Reload templates after migration
              const { data: migratedData } = await supabase
                .from('newsletter_templates')
                .select('*')
                .order('created_at', { ascending: false });

              if (migratedData) {
                const migratedTemplates: NewsletterTemplate[] = migratedData.map((item: any) => ({
                  id: item.id,
                  name: item.name,
                  subject: item.subject,
                  htmlContent: item.html_content,
                  textContent: item.text_content || undefined,
                  category: item.category || undefined,
                  createdAt: item.created_at,
                }));
                setTemplates(migratedTemplates);
              }

              // Remove from localStorage after successful migration
              localStorage.removeItem('newsletter_templates');
              console.log('[Newsletter Admin] Migration completed, localStorage cleared');
            }
          } catch (migrationError) {
            console.error('[Newsletter Admin] Error during migration:', migrationError);
          }
        }
      }
    } catch (e: any) {
      console.error('[Newsletter Admin] Error loading templates:', e);
      setMessage({ type: 'error', text: `Eroare la încărcarea template-urilor: ${e.message}` });
    }
  };

  const loadUserActivities = () => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('user_activities');
      if (saved) {
        setUserActivities(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading user activities:', e);
    }
  };

  const loadAutoMode = () => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('newsletter_auto_mode');
      if (saved) {
        setAutoModeEnabled(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading auto mode:', e);
    }
  };

  const analyzeUserActivities = () => {
    // Simulate AI analysis of user activities
    // In a real implementation, this would analyze user behavior, visited pages, etc.
    if (typeof window === 'undefined') return;
    
    const allUserInfo = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('userInfo_')) {
          try {
            const userInfo = JSON.parse(localStorage.getItem(key) || '{}');
            if (userInfo.email) {
              allUserInfo.push(userInfo);
            }
          } catch (e) {
            // Skip invalid entries
          }
        }
      }
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return;
    }

    // Analyze and categorize users
    try {
      allUserInfo.forEach((userInfo) => {
        try {
          // Check user's auction history, favorites, etc.
          const favorites = JSON.parse(localStorage.getItem(`favoriteAuctions_${userInfo.email}`) || '[]');
          const unlocked = JSON.parse(localStorage.getItem(`unlockedAuctions_${userInfo.email}`) || '[]');
          
          // Detect category based on activity
          let detectedCategory = 'altele';
          let interests: string[] = [];
          let activityScore = 0;

          // Simple AI-like categorization
          if (favorites.length > 0 || unlocked.length > 0) {
            // Analyze auction titles/descriptions to detect category
            const keywords = {
              'imobiliare': ['apartament', 'casă', 'teren', 'vila', 'imobil'],
              'auto': ['mașină', 'autoturism', 'vehicul', 'auto', 'motor'],
              'tehnologie': ['laptop', 'telefon', 'calculator', 'tablet', 'tech'],
              'fashion': ['haine', 'pantofi', 'accesorii', 'mode', 'fashion'],
              'sport': ['bicicletă', 'echipament', 'sport', 'fitness']
            };

            const allText = [...favorites, ...unlocked].join(' ').toLowerCase();
            
            for (const [category, words] of Object.entries(keywords)) {
              const matches = words.filter(word => allText.includes(word)).length;
              if (matches > 0) {
                detectedCategory = category;
                interests.push(category);
                activityScore += matches * 10;
              }
            }
          }

          // Update or create subscriber with AI-detected category
          const currentSubscribers = JSON.parse(localStorage.getItem('newsletter_subscribers') || '[]');
          const existingSubscriber = currentSubscribers.find((s: NewsletterSubscriber) => s.email === userInfo.email);
          
          if (existingSubscriber) {
            const updated = currentSubscribers.map((s: NewsletterSubscriber) =>
              s.id === existingSubscriber.id
                ? { ...s, category: detectedCategory, interests, activityScore }
                : s
            );
            saveSubscribers(updated);
          } else {
            // Auto-subscribe users with detected category
            const newSubscriber: NewsletterSubscriber = {
              id: `SUB-${Date.now()}-${Math.random()}`,
              email: userInfo.email,
              name: `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim() || undefined,
              subscribedAt: new Date().toISOString(),
              status: 'active',
              category: detectedCategory,
              interests,
              activityScore
            };
            const updated = [...currentSubscribers, newSubscriber];
            saveSubscribers(updated);
          }

          // Record activity
          const activity: UserActivity = {
            userId: userInfo.email,
            email: userInfo.email,
            category: detectedCategory,
            activity: 'Navigation detected',
            timestamp: new Date().toISOString(),
            score: activityScore
          };
          const currentActivities = JSON.parse(localStorage.getItem('user_activities') || '[]');
          const updatedActivities = [activity, ...currentActivities].slice(0, 100); // Keep last 100
          setUserActivities(updatedActivities);
          localStorage.setItem('user_activities', JSON.stringify(updatedActivities));
        } catch (e) {
          console.error('Error processing user info:', e);
        }
      });
    } catch (e) {
      console.error('Error in analyzeUserActivities forEach:', e);
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

  const saveTemplates = async (updated: NewsletterTemplate[]) => {
    setTemplates(updated);
    // Templates are now saved directly to Supabase in handleCreateTemplate and handleDeleteTemplate
  };

  const handleToggleAutoMode = () => {
    const newValue = !autoModeEnabled;
    setAutoModeEnabled(newValue);
    localStorage.setItem('newsletter_auto_mode', JSON.stringify(newValue));
    
    if (newValue) {
      setMessage({ type: 'success', text: 'Mod auto activat! AI va analiza activitatea utilizatorilor.' });
      analyzeUserActivities(); // Run initial analysis
    } else {
      setMessage({ type: 'info', text: 'Mod auto dezactivat.' });
    }
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // Function to replace placeholders in template HTML with mock values for preview
  const processTemplateForPreview = (htmlContent: string): string => {
    if (!htmlContent) return '';
    
    // Get base URL for logo
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    const logoUrl = `${baseUrl}/logo_negru.png`;
    
    // Mock values
    const mockName = 'Utilizator Test';
    const mockTokenCode = 'TOKEN5-ABCD1234';
    const currentYear = new Date().getFullYear().toString();
    
    // Replace placeholders
    let processed = htmlContent;
    processed = processed.replace(/\{\{name\}\}/g, mockName);
    processed = processed.replace(/\{\{tokenCode\}\}/g, mockTokenCode);
    processed = processed.replace(/\{\{logoUrl\}\}/g, logoUrl);
    processed = processed.replace(/\{\{year\}\}/g, currentYear);
    
    // Handle Handlebars-style conditionals (if they exist)
    // Remove {{#if name}}...{{/if}} blocks and replace with content ([\\s\\S] = any char including newlines)
    processed = processed.replace(/\{\{#if name\}\}([\s\S]*?)\{\{\/if\}\}/g, mockName ? '$1' : '');
    
    return processed;
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.subject || !newTemplate.htmlContent) {
      setMessage({ type: 'error', text: 'Completează numele, subiectul și conținutul HTML!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }

    try {
      if (editingTemplateId) {
        // Update existing template
        const { data, error } = await supabase
          .from('newsletter_templates')
          .update({
            name: newTemplate.name,
            subject: newTemplate.subject,
            html_content: newTemplate.htmlContent,
            text_content: newTemplate.textContent || null,
            category: newTemplate.category || null,
          })
          .eq('id', editingTemplateId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        const updatedTemplate: NewsletterTemplate = {
          id: data.id,
          name: data.name,
          subject: data.subject,
          htmlContent: data.html_content,
          textContent: data.text_content || undefined,
          category: data.category || undefined,
          createdAt: data.created_at,
        };

        setTemplates(templates.map(t => t.id === editingTemplateId ? updatedTemplate : t));
        setMessage({ type: 'success', text: 'Template actualizat cu succes!' });
      } else {
        // Create new template
        const templateId = `TEMPLATE-${Date.now()}`;

        const { data, error } = await supabase
          .from('newsletter_templates')
          .insert({
            id: templateId,
            name: newTemplate.name,
            subject: newTemplate.subject,
            html_content: newTemplate.htmlContent,
            text_content: newTemplate.textContent || null,
            category: newTemplate.category || null,
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        const newTemplateObj: NewsletterTemplate = {
          id: data.id,
          name: data.name,
          subject: data.subject,
          htmlContent: data.html_content,
          textContent: data.text_content || undefined,
          category: data.category || undefined,
          createdAt: data.created_at,
        };

        setTemplates([...templates, newTemplateObj]);
        setMessage({ type: 'success', text: 'Template creat cu succes!' });
      }

      setNewTemplate({ name: '', subject: '', htmlContent: '', textContent: '', category: '' });
      setEditingTemplateId(null);
      setShowTemplateModal(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error: any) {
      console.error('[Newsletter Admin] Error saving template:', error);
      setMessage({ type: 'error', text: error.message || 'Eroare la salvarea template-ului!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
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
      name: newSubscriber.name || undefined,
      subscribedAt: new Date().toISOString(),
      status: 'active',
      category: newSubscriber.category || undefined
    };

    const updated = [...subscribers, subscriber];
    saveSubscribers(updated);
    setNewSubscriber({ email: '', name: '', category: '' });
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

    // Filter subscribers based on selection mode
    let recipients: NewsletterSubscriber[] = [];
    if (selectionMode === 'all') {
      recipients = subscribers.filter(s => s.status === 'active');
    } else if (selectionMode === 'categories') {
      if (selectedCategories.length === 0) {
        setMessage({ type: 'error', text: 'Selectează cel puțin o categorie!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
      recipients = subscribers.filter(s => 
        s.status === 'active' && 
        (s.category && selectedCategories.includes(s.category))
      );
    } else if (selectionMode === 'individual') {
      if (selectedSubscribers.length === 0) {
        setMessage({ type: 'error', text: 'Selectează cel puțin un abonat!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
      recipients = subscribers.filter(s => 
        s.status === 'active' && 
        selectedSubscribers.includes(s.id)
      );
    }

    if (recipients.length === 0) {
      setMessage({ type: 'error', text: 'Nu există destinatari pentru selecția făcută!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }

    setIsLoading(true);

    try {
      const campaign: NewsletterCampaign = {
        id: `CAMPAIGN-${Date.now()}`,
        name: newCampaign.name || `Campanie ${new Date().toLocaleDateString('ro-RO')}`,
        templateId: newCampaign.templateId || undefined,
        subject: newCampaign.subject,
        htmlContent: newCampaign.htmlContent,
        textContent: newCampaign.textContent,
        status: 'sending',
        recipientCount: recipients.length,
        sentAt: new Date().toISOString(),
        recipientCategories: selectionMode === 'all' ? ['toate'] : selectionMode === 'categories' ? selectedCategories : ['individuali']
      };

      // Send email to all recipients via API route
      // API-ul va folosi automat variabilele de mediu pentru Resend
      const recipientEmails = recipients.map(r => r.email);
      
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
        }),
      });

      const result = await response.json();

      if (result.success) {
        campaign.status = 'sent';
        campaign.sentCount = recipients.length;
        setMessage({ type: 'success', text: `Newsletter trimis cu succes la ${recipients.length} abonați!` });
      } else {
        campaign.status = 'failed';
        campaign.failedCount = recipients.length;
        setMessage({ type: 'error', text: `Eroare la trimitere: ${result.message}` });
      }

      // Save campaign
      const updatedCampaigns = [campaign, ...campaigns];
      saveCampaigns(updatedCampaigns);

      // Reset form
      setNewCampaign({ name: '', templateId: '', subject: '', htmlContent: '', textContent: '', categories: [] });
      setSelectionMode('all');
      setSelectedCategories([]);
      setSelectedSubscribers([]);
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

  const handleUseTemplate = (template: NewsletterTemplate) => {
    setSelectedTemplate(template);
    setNewCampaign({
      ...newCampaign,
      templateId: template.id,
      subject: template.subject,
      htmlContent: template.htmlContent,
      textContent: template.textContent || '',
      categories: template.category ? [template.category] : []
    });
    if (template.category) {
      setSelectedCategories([template.category]);
      setSelectionMode('categories');
    } else {
      setSelectionMode('all');
    }
    setSelectedSubscribers([]);
    setShowSendModal(true);
  };

  const handleToggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  // Filter subscribers based on all filters
  const getFilteredSubscribers = () => {
    let filtered = [...subscribers];

    // Search filter
    if (searchFilter) {
      const searchLower = searchFilter.toLowerCase();
      filtered = filtered.filter(s => 
        s.email.toLowerCase().includes(searchLower) ||
        (s.name && s.name.toLowerCase().includes(searchLower))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(s => s.category === categoryFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(s => {
        const subDate = new Date(s.subscribedAt);
        if (dateFilter === 'today') {
          return subDate.toDateString() === now.toDateString();
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return subDate >= weekAgo;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return subDate >= monthAgo;
        }
        return true;
      });
    }

    return filtered;
  };

  // Check if all filtered active subscribers are selected
  const areAllFilteredSelected = () => {
    const activeFiltered = getFilteredSubscribers().filter(s => s.status === 'active');
    if (activeFiltered.length === 0) return false;
    return activeFiltered.every(s => selectedSubscribers.includes(s.id));
  };

  const handleUnsubscribe = async (subscriberId: string) => {
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .update({ status: 'unsubscribed' })
        .eq('id', subscriberId);

      if (error) {
        throw error;
      }

      setMessage({ type: 'success', text: 'Abonat dezabonat cu succes!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      // Reload subscribers list
      await loadSubscribers();
    } catch (error: any) {
      console.error('Error unsubscribing:', error);
      setMessage({ type: 'error', text: error.message || 'Eroare la dezabonare!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleDeleteSubscriber = async (subscriberId: string) => {
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .delete()
        .eq('id', subscriberId);

      if (error) {
        throw error;
      }

      setMessage({ type: 'success', text: 'Abonat șters cu succes!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      // Reload subscribers list
      await loadSubscribers();
    } catch (error: any) {
      console.error('Error deleting subscriber:', error);
      setMessage({ type: 'error', text: error.message || 'Eroare la ștergere!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('newsletter_templates')
        .delete()
        .eq('id', templateId);

      if (error) {
        throw error;
      }

      const updated = templates.filter(t => t.id !== templateId);
      setTemplates(updated);
      setMessage({ type: 'success', text: 'Template șters cu succes!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error: any) {
      console.error('[Newsletter Admin] Error deleting template:', error);
      setMessage({ type: 'error', text: error.message || 'Eroare la ștergerea template-ului!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  // Auto-send based on category (when auto mode is enabled)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!autoModeEnabled || templates.length === 0 || subscribers.length === 0) return;
    
    try {
      // Check for new activities and auto-send
      const lastActivity = userActivities[0];
      if (lastActivity && lastActivity.category) {
        // Find template for this category
        const categoryTemplate = templates.find(t => t.category === lastActivity.category);
        if (categoryTemplate) {
          // Check if we already sent recently (avoid spam)
          const recentCampaign = campaigns.find(c => 
            c.templateId === categoryTemplate.id && 
            c.sentAt && 
            new Date(c.sentAt).getTime() > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
          );

          if (!recentCampaign) {
            // Auto-send to user
            const userSubscriber = subscribers.find(s => s.email === lastActivity.email && s.status === 'active');
            if (userSubscriber) {
              // Auto-send in background
              sendAutoEmail(userSubscriber, categoryTemplate);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in auto-send useEffect:', error);
    }
  }, [autoModeEnabled, userActivities, templates, subscribers, campaigns]);

  const sendAutoEmail = async (subscriber: NewsletterSubscriber, template: NewsletterTemplate) => {
    if (!resendEnabled || typeof window === 'undefined') return;

    try {
      // API-ul va folosi automat variabilele de mediu pentru Resend
      const response = await fetch('/api/resend/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: subscriber.email,
          subject: template.subject,
          html: template.htmlContent,
          text: template.textContent || '',
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Record auto-sent campaign
        const campaign: NewsletterCampaign = {
          id: `AUTO-${Date.now()}`,
          name: `Auto: ${template.name}`,
          templateId: template.id,
          subject: template.subject,
          htmlContent: template.htmlContent,
          textContent: template.textContent,
          status: 'sent',
          recipientCount: 1,
          sentCount: 1,
          sentAt: new Date().toISOString(),
          recipientCategories: subscriber.category ? [subscriber.category] : []
        };
        const updatedCampaigns = [campaign, ...campaigns];
        saveCampaigns(updatedCampaigns);
      }
    } catch (error) {
      console.error('Error in auto-send:', error);
    }
  };

  // Don't render on server
  if (!isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 text-white p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-300">Se încarcă...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-blue-400 bg-clip-text text-transparent">
                Newsletter Management
              </h1>
              <p className="text-gray-300">
                Gestionează template-uri, abonați și campanii newsletter cu Resend
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Auto Mode Switch */}
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-lg rounded-lg p-4 border border-white/20">
                <span className="text-sm font-medium text-gray-300">Mod Auto AI</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoModeEnabled}
                    onChange={handleToggleAutoMode}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg backdrop-blur-lg shadow-xl border ${
            message.type === 'success'
              ? 'bg-green-500/20 text-green-300 border-green-400/30'
              : message.type === 'info'
              ? 'bg-blue-500/20 text-blue-300 border-blue-400/30'
              : 'bg-red-500/20 text-red-300 border-red-400/30'
          }`}>
            {message.text}
          </div>
        )}

        {/* Resend Status Warning */}
        {!resendEnabled && (
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

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex space-x-2 border-b border-white/20">
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-6 py-3 text-sm font-medium transition-all ${
                activeTab === 'templates'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <i className="ri-file-text-line mr-2"></i>
              Template-uri ({templates.length})
            </button>
            <button
              onClick={() => setActiveTab('subscribers')}
              className={`px-6 py-3 text-sm font-medium transition-all ${
                activeTab === 'subscribers'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <i className="ri-user-line mr-2"></i>
              Abonați ({subscribers.filter(s => s.status === 'active').length})
            </button>
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`px-6 py-3 text-sm font-medium transition-all ${
                activeTab === 'campaigns'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <i className="ri-mail-send-line mr-2"></i>
              Campanii ({campaigns.length})
            </button>
            <button
              onClick={() => setActiveTab('auto')}
              className={`px-6 py-3 text-sm font-medium transition-all ${
                activeTab === 'auto'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <i className="ri-robot-line mr-2"></i>
              Auto AI
            </button>
          </div>
        </div>

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">Template-uri HTML</h2>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium"
              >
                <i className="ri-add-line mr-2"></i>
                Adaugă Template
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-white/20 hover:bg-white/15 transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-white mb-1">{template.name}</h3>
                      <div className="flex items-center gap-2 mb-2">
                        {template.category && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
                            {template.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 mb-2">{template.subject}</p>
                      <p className="text-xs text-gray-400">
                        Creat: {new Date(template.createdAt).toLocaleDateString('ro-RO')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleUseTemplate(template)}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 text-sm font-medium"
                    >
                      <i className="ri-send-plane-line mr-1"></i>
                      Folosește
                    </button>
                    <button
                      onClick={() => {
                        setEditingTemplateId(template.id);
                        setNewTemplate({
                          name: template.name,
                          subject: template.subject,
                          htmlContent: template.htmlContent,
                          textContent: template.textContent || '',
                          category: template.category || '',
                        });
                        setShowTemplateModal(true);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 text-sm font-medium"
                      title="Editează template"
                    >
                      <i className="ri-edit-line"></i>
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 text-sm font-medium"
                      title="Șterge template"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subscribers Tab */}
        {activeTab === 'subscribers' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">Abonați Newsletter</h2>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await loadSubscribers();
                    setMessage({ type: 'success', text: 'Lista de abonați a fost actualizată!' });
                    setTimeout(() => setMessage({ type: '', text: '' }), 2000);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium"
                  title="Reîncarcă lista de abonați"
                >
                  <i className="ri-refresh-line mr-2"></i>
                  Reîncarcă
                </button>
                <button
                  onClick={() => setShowSubscriberModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-300 font-medium"
                >
                  <i className="ri-user-add-line mr-2"></i>
                  Adaugă Abonat
                </button>
              </div>
            </div>

            {/* Advanced Filters */}
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-4 border border-white/20 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Search */}
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Căutare</label>
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Email sau nume..."
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* Status Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'unsubscribed')}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all" className="bg-gray-800">Toți</option>
                    <option value="active" className="bg-gray-800">Activi</option>
                    <option value="unsubscribed" className="bg-gray-800">Dezabonați</option>
                  </select>
                </div>
                {/* Category Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Categorie</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all" className="bg-gray-800">Toate</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat} className="bg-gray-800 capitalize">
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Date Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Data Abonare</label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all" className="bg-gray-800">Toate</option>
                    <option value="today" className="bg-gray-800">Astăzi</option>
                    <option value="week" className="bg-gray-800">Ultima săptămână</option>
                    <option value="month" className="bg-gray-800">Ultima lună</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  onClick={() => {
                    setSearchFilter('');
                    setStatusFilter('all');
                    setCategoryFilter('all');
                    setDateFilter('all');
                    setSelectedSubscribers([]);
                  }}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <i className="ri-refresh-line mr-1"></i>
                  Resetează filtrele
                </button>
                {selectedSubscribers.length > 0 && (
                  <button
                    onClick={() => {
                      setSelectionMode('individual');
                      setShowSendModal(true);
                    }}
                    className="text-xs px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors"
                  >
                    <i className="ri-send-plane-line mr-1"></i>
                    Trimite la {selectedSubscribers.length} selectați
                  </button>
                )}
              </div>
            </div>

            {/* Subscribers Table */}
            <div className="bg-white/10 backdrop-blur-lg rounded-lg shadow-xl border border-white/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={areAllFilteredSelected()}
                          onChange={(e) => {
                            const activeFiltered = getFilteredSubscribers().filter(s => s.status === 'active');
                            if (e.target.checked) {
                              setSelectedSubscribers([...new Set([...selectedSubscribers, ...activeFiltered.map(s => s.id)])]);
                            } else {
                              const filteredIds = activeFiltered.map(s => s.id);
                              setSelectedSubscribers(selectedSubscribers.filter(id => !filteredIds.includes(id)));
                            }
                          }}
                          className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nume</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Categorie AI</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Interese</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Scor Activitate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Data Abonare</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {subscribers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-8 text-center text-gray-400">
                          Nu există abonați
                        </td>
                      </tr>
                    ) : (
                      getFilteredSubscribers().map((subscriber) => (
                          <tr key={subscriber.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-4 whitespace-nowrap">
                              {subscriber.status === 'active' && (
                                <input
                                  type="checkbox"
                                  checked={selectedSubscribers.includes(subscriber.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedSubscribers([...selectedSubscribers, subscriber.id]);
                                    } else {
                                      setSelectedSubscribers(selectedSubscribers.filter(id => id !== subscriber.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500"
                                />
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{subscriber.email}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{subscriber.name || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {subscriber.category ? (
                                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30 capitalize">
                                  {subscriber.category}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {subscriber.interests && subscriber.interests.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {subscriber.interests.map((interest, idx) => (
                                    <span key={idx} className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-400/30">
                                      {interest}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {subscriber.activityScore !== undefined ? (
                                <span className="text-gray-300">{subscriber.activityScore}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                              {new Date(subscriber.subscribedAt).toLocaleDateString('ro-RO')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                subscriber.status === 'active'
                                  ? 'bg-green-500/20 text-green-300 border border-green-400/30'
                                  : 'bg-red-500/20 text-red-300 border border-red-400/30'
                              }`}>
                                {subscriber.status === 'active' ? 'Activ' : 'Dezabonat'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex gap-2">
                                {subscriber.status === 'active' && (
                                  <button
                                    onClick={() => handleUnsubscribe(subscriber.id)}
                                    className="text-yellow-400 hover:text-yellow-300 transition-colors"
                                    title="Dezabonează"
                                  >
                                    <i className="ri-notification-off-line"></i>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteSubscriber(subscriber.id)}
                                  className="text-red-400 hover:text-red-300 transition-colors"
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
          </div>
        )}

        {/* Campaigns Tab */}
        {activeTab === 'campaigns' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">Campanii Newsletter</h2>
              <button
                  onClick={() => {
                    setSelectedTemplate(null);
                    setNewCampaign({ name: '', templateId: '', subject: '', htmlContent: '', textContent: '', categories: [] });
                    setSelectionMode('all');
                    setSelectedCategories([]);
                    setSelectedSubscribers([]);
                    setShowSendModal(true);
                  }}
                disabled={!resendEnabled}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-send-plane-line mr-2"></i>
                Trimite Newsletter
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-12 bg-white/10 backdrop-blur-lg rounded-lg border border-white/20">
                <i className="ri-mail-send-line text-6xl text-gray-500 mb-4"></i>
                <p className="text-gray-400 text-lg mb-2">Nu există campanii newsletter</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="bg-white/10 backdrop-blur-lg rounded-lg p-6 shadow-xl border border-white/20">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">{campaign.name}</h3>
                        <p className="text-sm text-gray-300 mb-2">{campaign.subject}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-400 mb-2">
                          <span>Destinatari: {campaign.recipientCount}</span>
                          {campaign.sentCount !== undefined && <span>Trimiși: {campaign.sentCount}</span>}
                          {campaign.failedCount !== undefined && <span>Eșuate: {campaign.failedCount}</span>}
                        </div>
                        {campaign.recipientCategories && campaign.recipientCategories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {campaign.recipientCategories.map((cat, idx) => (
                              <span key={idx} className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-400/30">
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                        {campaign.sentAt && (
                          <p className="text-xs text-gray-400">Data: {new Date(campaign.sentAt).toLocaleString('ro-RO')}</p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        campaign.status === 'sent' ? 'bg-green-500/20 text-green-300 border border-green-400/30' :
                        campaign.status === 'sending' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30' :
                        campaign.status === 'failed' ? 'bg-red-500/20 text-red-300 border border-red-400/30' :
                        'bg-gray-500/20 text-gray-300 border border-gray-400/30'
                      }`}>
                        {campaign.status === 'sent' ? 'Trimis' :
                         campaign.status === 'sending' ? 'Se trimite' :
                         campaign.status === 'failed' ? 'Eșuat' : 'Draft'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Auto AI Tab */}
        {activeTab === 'auto' && (
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 shadow-xl border border-white/20">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">Mod Auto AI</h2>
                  <p className="text-sm text-gray-300">
                    AI analizează activitatea utilizatorilor și trimite automat email-uri personalizate pe baza categoriilor detectate.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoModeEnabled}
                    onChange={handleToggleAutoMode}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {autoModeEnabled && (
                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                  <p className="text-sm text-blue-300">
                    <i className="ri-robot-line mr-2"></i>
                    Mod auto activat! AI urmărește activitatea utilizatorilor și va trimite automat email-uri când utilizatorii intră în categorii specifice.
                  </p>
                </div>
              )}
            </div>

            {/* Recent Activities */}
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 shadow-xl border border-white/20">
              <h3 className="text-lg font-semibold text-white mb-4">Activități Recente Detectate</h3>
              {userActivities.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Nu există activități înregistrate</p>
              ) : (
                <div className="space-y-2">
                  {userActivities.slice(0, 20).map((activity, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium">{activity.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-400/30 capitalize">
                            {activity.category}
                          </span>
                          <span className="text-xs text-gray-400">{activity.activity}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(activity.timestamp).toLocaleString('ro-RO')}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-300 border border-green-400/30">
                        Scor: {activity.score}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create Template Modal */}
        {showTemplateModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowTemplateModal(false)}
          >
            <div
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-3xl w-full shadow-2xl border border-white/20 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">
                  {editingTemplateId ? 'Editează Template HTML' : 'Creează Template HTML'}
                </h2>
                <button
                  onClick={() => {
                    setShowTemplateModal(false);
                    setEditingTemplateId(null);
                    setNewTemplate({ name: '', subject: '', htmlContent: '', textContent: '', category: '' });
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nume Template *
                  </label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="ex: Template Imobiliare"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Categorie (opțional)
                  </label>
                  <select
                    value={newTemplate.category}
                    onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Selectează categorie</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat} className="bg-gray-800">
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Categoria pentru care e template-ul (pentru mod auto)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Subiect Email *
                  </label>
                  <input
                    type="text"
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Subiect email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Conținut HTML *
                  </label>
                  <textarea
                    value={newTemplate.htmlContent}
                    onChange={(e) => setNewTemplate({ ...newTemplate, htmlContent: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    rows={15}
                    placeholder="<html><body>...</body></html>"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Template HTML complet pentru email
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Preview Email
                  </label>
                  <div className="w-full bg-white rounded-lg border border-white/20 overflow-hidden" style={{ minHeight: '500px' }}>
                    <iframe
                      srcDoc={processTemplateForPreview(newTemplate.htmlContent) || '<div style="padding: 20px; color: #666; text-align: center;">Nu există conținut HTML pentru preview</div>'}
                      className="w-full border-0"
                      style={{ height: '600px' }}
                      title="HTML Preview"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Preview-ul afișează cum va arăta email-ul cu placeholders-urile înlocuite
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Conținut Text (opțional)
                  </label>
                  <textarea
                    value={newTemplate.textContent}
                    onChange={(e) => setNewTemplate({ ...newTemplate, textContent: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    rows={5}
                    placeholder="Text alternativ"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowTemplateModal(false);
                    setEditingTemplateId(null);
                    setNewTemplate({ name: '', subject: '', htmlContent: '', textContent: '', category: '' });
                  }}
                  className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all duration-300"
                >
                  Anulează
                </button>
                <button
                  onClick={handleCreateTemplate}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium"
                >
                  {editingTemplateId ? 'Salvează Modificările' : 'Salvează Template'}
                </button>
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
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-4xl w-full shadow-2xl border border-white/20 max-h-[90vh] overflow-y-auto"
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
                {/* Template Selection */}
                {templates.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Selectează Template (opțional)
                    </label>
                    <select
                      value={newCampaign.templateId}
                      onChange={(e) => {
                        const template = templates.find(t => t.id === e.target.value);
                        if (template) {
                          handleUseTemplate(template);
                        }
                      }}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Fără template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id} className="bg-gray-800">
                          {template.name} {template.category && `(${template.category})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nume Campanie (opțional)
                  </label>
                  <input
                    type="text"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="ex: Campanie Imobiliare Decembrie"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Subiect Email *
                  </label>
                  <input
                    type="text"
                    value={newCampaign.subject}
                    onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Subiect newsletter"
                  />
                </div>

                {/* Recipient Selection */}
                <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Destinatari *
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={selectionMode === 'all'}
                        onChange={() => {
                          setSelectionMode('all');
                          setSelectedCategories([]);
                          setSelectedSubscribers([]);
                        }}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">
                        Toți abonații activi ({subscribers.filter(s => s.status === 'active').length})
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={selectionMode === 'categories'}
                        onChange={() => {
                          setSelectionMode('categories');
                          if (selectedCategories.length === 0) {
                            setSelectedCategories([categories[0]]);
                          }
                          setSelectedSubscribers([]);
                        }}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Pe categorii</span>
                    </label>
                    {selectionMode === 'categories' && (
                      <div className="ml-6 mt-2 flex flex-wrap gap-2">
                        {categories.map((category) => {
                          const count = subscribers.filter(s => s.category === category && s.status === 'active').length;
                          return (
                            <label key={category} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedCategories.includes(category)}
                                onChange={() => handleToggleCategory(category)}
                                className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-300 capitalize">
                                {category} ({count})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={selectionMode === 'individual'}
                        onChange={() => {
                          setSelectionMode('individual');
                          setSelectedCategories([]);
                        }}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">
                        Selectare individuală ({selectedSubscribers.length} selectați)
                      </span>
                    </label>
                    {selectionMode === 'individual' && (
                      <div className="ml-6 mt-2 bg-white/5 rounded-lg p-3 max-h-60 overflow-y-auto border border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400">Selectează abonații:</span>
                          <button
                            onClick={() => {
                              const activeIds = subscribers.filter(s => s.status === 'active').map(s => s.id);
                              setSelectedSubscribers(
                                selectedSubscribers.length === activeIds.length ? [] : activeIds
                              );
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            {selectedSubscribers.length === subscribers.filter(s => s.status === 'active').length
                              ? 'Deselectează toți'
                              : 'Selectează toți'}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {subscribers
                            .filter(s => s.status === 'active')
                            .slice(0, 50) // Limit to first 50 for performance
                            .map((subscriber) => (
                              <label key={subscriber.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={selectedSubscribers.includes(subscriber.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedSubscribers([...selectedSubscribers, subscriber.id]);
                                    } else {
                                      setSelectedSubscribers(selectedSubscribers.filter(id => id !== subscriber.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-300">
                                  {subscriber.email} {subscriber.name && `(${subscriber.name})`}
                                </span>
                              </label>
                            ))}
                        </div>
                        {subscribers.filter(s => s.status === 'active').length > 50 && (
                          <p className="text-xs text-gray-400 mt-2">
                            Afișați primii 50 abonați. Folosește filtrele din tab-ul Subscribers pentru selecție avansată.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Conținut HTML *
                  </label>
                  <textarea
                    value={newCampaign.htmlContent}
                    onChange={(e) => setNewCampaign({ ...newCampaign, htmlContent: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    rows={12}
                    placeholder="<html><body>...</body></html>"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {selectionMode === 'all' ? (
                      <>Se trimite la {subscribers.filter(s => s.status === 'active').length} abonați activi</>
                    ) : selectionMode === 'categories' && selectedCategories.length > 0 ? (
                      <>Se trimite la {subscribers.filter(s => s.status === 'active' && s.category && selectedCategories.includes(s.category)).length} abonați din categoriile selectate</>
                    ) : selectionMode === 'individual' && selectedSubscribers.length > 0 ? (
                      <>Se trimite la {selectedSubscribers.length} abonați selectați</>
                    ) : (
                      <>Selectează destinatari</>
                    )}
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
                    placeholder="Text alternativ"
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
                  disabled={isLoading || !newCampaign.subject || !newCampaign.htmlContent || !resendEnabled || (selectionMode === 'all' && subscribers.filter(s => s.status === 'active').length === 0) || (selectionMode === 'categories' && selectedCategories.length === 0) || (selectionMode === 'individual' && selectedSubscribers.length === 0)}
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

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Categorie (opțional)
                  </label>
                  <select
                    value={newSubscriber.category}
                    onChange={(e) => setNewSubscriber({ ...newSubscriber, category: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Selectează categorie</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat} className="bg-gray-800">
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
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
    </div>
  );
}



