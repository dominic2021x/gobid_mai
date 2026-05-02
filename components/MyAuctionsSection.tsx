"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface MyAuctionsSectionProps {
  isDarkMode: boolean;
  userId: string;
  addAuctionUrl?: string; // Optional URL for add auction page
}

interface Auction {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  startingPrice: number;
  currency: 'RON' | 'EUR';
  images: string[];
  status: 'draft' | 'active';
  createdAt: string;
  productType: 'live-bid';
}

export default function MyAuctionsSection({ isDarkMode, userId, addAuctionUrl = "/dashboard/add-auction" }: MyAuctionsSectionProps) {
  const router = useRouter();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    startingPrice: 0,
    currency: 'RON' as 'RON' | 'EUR',
    images: [] as string[],
    status: 'draft' as 'draft' | 'active'
  });

  useEffect(() => {
    if (userId) {
      loadAuctions();
    }
  }, [userId]);

  const loadAuctions = async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', userId)
        .eq('product_type', 'live_bid')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAuctions((data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        subcategory: item.subcategory,
        startingPrice: item.starting_price || 0,
        currency: item.currency || 'RON',
        images: item.images || [],
        status: item.status || 'draft',
        createdAt: item.created_at,
        productType: 'live-bid' as const
      })));
    } catch (error: any) {
      console.error('Error loading auctions:', error);
      setMessage({ type: 'error', text: 'Eroare la încărcarea licitațiilor' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId) {
      setMessage({ type: 'error', text: 'Utilizatorul nu este autentificat' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          subcategory: formData.subcategory,
          starting_price: formData.startingPrice,
          currency: formData.currency,
          images: formData.images,
          status: formData.status,
          product_type: 'live_bid',
          user_id: userId
        })
        .select()
        .single();

      if (error) throw error;

      setMessage({ type: 'success', text: 'Licitația a fost adăugată cu succes!' });
      // setShowAddForm(false); // TODO: Add showAddForm state if needed
      setFormData({
        title: '',
        description: '',
        category: '',
        subcategory: '',
        startingPrice: 0,
        currency: 'RON',
        images: [],
        status: 'draft'
      });
      await loadAuctions();
    } catch (error: any) {
      console.error('Error adding auction:', error);
      setMessage({ type: 'error', text: error.message || 'Eroare la adăugarea licitației' });
    }
  };

  const deleteAuction = async (id: string) => {
    if (!confirm('Sigur vrei să ștergi această licitație?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Licitația a fost ștearsă!' });
      await loadAuctions();
    } catch (error: any) {
      console.error('Error deleting auction:', error);
      setMessage({ type: 'error', text: 'Eroare la ștergerea licitației' });
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'draft' ? 'active' : 'draft';
    
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: newStatus })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;

      setMessage({ type: 'success', text: `Licitația a fost ${newStatus === 'active' ? 'activată' : 'dezactivată'}!` });
      await loadAuctions();
    } catch (error: any) {
      console.error('Error updating status:', error);
      setMessage({ type: 'error', text: 'Eroare la actualizarea statusului' });
    }
  };

  const filteredAuctions = auctions.filter(auction =>
    auction.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    auction.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatPrice = (price: number, currency: string) => {
    return `${price.toLocaleString('ro-RO')} ${currency}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <section className="space-y-6">
      {/* Message */}
      {message && (
        <div className={`fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg transition-all ${
          message.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* Header with Search and Add Button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="Caută licitații..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg border transition-colors ${
              isDarkMode 
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
            }`}
          />
        </div>
        <a
          href={addAuctionUrl}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all font-semibold"
        >
          <i className="ri-add-line"></i>
          <span>Adaugă licitație</span>
        </a>
      </div>


      {/* Auctions Table */}
      <div className={`rounded-xl shadow-lg overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={isDarkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  Titlu
                </th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  Categorie
                </th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  Preț
                </th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  Status
                </th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  Data
                </th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                  Acțiuni
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className={`px-4 py-8 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Se încarcă...
                  </td>
                </tr>
              ) : filteredAuctions.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-4 py-8 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Nu ai licitații încă. Adaugă prima ta licitație!
                  </td>
                </tr>
              ) : (
                filteredAuctions.map((auction) => (
                  <tr key={auction.id} className={`hover:${isDarkMode ? 'bg-gray-700' : 'bg-gray-50'} transition-colors`}>
                    <td className={`px-4 py-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      <div className="font-medium">{auction.title}</div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {auction.description.substring(0, 50)}...
                      </div>
                    </td>
                    <td className={`px-4 py-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      <div>{auction.category}</div>
                      {auction.subcategory && (
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {auction.subcategory}
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3 font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {formatPrice(auction.startingPrice, auction.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        auction.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      }`}>
                        {auction.status === 'draft' ? 'Draft' : 'Activ'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {formatDate(auction.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleStatus(auction.id, auction.status)}
                          className={`px-2 py-1 rounded-lg transition-all ${
                            auction.status === 'draft'
                              ? 'bg-green-500 hover:bg-green-600 text-white'
                              : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                          }`}
                          title={auction.status === 'draft' ? 'Activează' : 'Dezactivează'}
                        >
                          <i className={auction.status === 'draft' ? 'ri-check-line' : 'ri-close-line'}></i>
                        </button>
                        <button
                          onClick={() => deleteAuction(auction.id)}
                          className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
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
    </section>
  );
}
