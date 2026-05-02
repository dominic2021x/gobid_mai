"use client";

import React, { useState, useEffect } from "react";

interface DayNote {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  content: string;
  color?: string;
  hour?: string; // HH format
  minute?: string; // MM format
  createdAt: string;
}

interface PersistentNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDayNoteModal, setShowDayNoteModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [dayNotes, setDayNotes] = useState<DayNote[]>([]);
  const [persistentNotes, setPersistentNotes] = useState<PersistentNote[]>([]);
  const [editingNote, setEditingNote] = useState<PersistentNote | null>(null);
  const [editingDayNote, setEditingDayNote] = useState<DayNote | null>(null);
  const [newDayNote, setNewDayNote] = useState({ title: '', content: '', color: '#3B82F6', hour: '', minute: '' });
  const [searchNotes, setSearchNotes] = useState('');

  const monthNames = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ];

  const dayNames = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
  const dayNamesFull = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

  useEffect(() => {
    if (typeof window !== 'undefined') {
      loadDayNotes();
      loadPersistentNotes();
    }
  }, []);

  const loadDayNotes = () => {
    try {
      const saved = localStorage.getItem('calendar_day_notes');
      if (saved) {
        setDayNotes(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading day notes:', e);
    }
  };

  const loadPersistentNotes = () => {
    try {
      const saved = localStorage.getItem('calendar_persistent_notes');
      if (saved) {
        setPersistentNotes(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading persistent notes:', e);
    }
  };

  const saveDayNotes = (notes: DayNote[]) => {
    try {
      setDayNotes(notes);
      if (typeof window !== 'undefined') {
        localStorage.setItem('calendar_day_notes', JSON.stringify(notes));
      }
    } catch (e) {
      console.error('Error saving day notes:', e);
    }
  };

  const savePersistentNotes = (notes: PersistentNote[]) => {
    try {
      setPersistentNotes(notes);
      if (typeof window !== 'undefined') {
        localStorage.setItem('calendar_persistent_notes', JSON.stringify(notes));
      }
    } catch (e) {
      console.error('Error saving persistent notes:', e);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0

    const days: (Date | null)[] = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const formatDateKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const getDayNotes = (dateKey: string) => {
    return dayNotes.filter(note => note.date === dateKey);
  };

  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date | null) => {
    if (!date || !selectedDate) return false;
    return formatDateKey(date) === selectedDate;
  };

  const handleDayClick = (date: Date | null) => {
    if (!date) return;
    const dateKey = formatDateKey(date);
    setSelectedDate(dateKey);
    
    // Load existing note for this day
    const existingNote = dayNotes.find(n => n.date === dateKey);
    if (existingNote) {
      setEditingDayNote(existingNote);
      setNewDayNote({ 
        title: existingNote.title, 
        content: existingNote.content, 
        color: existingNote.color || '#3B82F6',
        hour: existingNote.hour || '',
        minute: existingNote.minute || ''
      });
    } else {
      setEditingDayNote(null);
      setNewDayNote({ title: '', content: '', color: '#3B82F6', hour: '', minute: '' });
    }
    
    setShowDayNoteModal(true);
  };

  const handleSaveDayNote = () => {
    if (typeof window === 'undefined' || !selectedDate) return;
    
    try {
      if (editingDayNote) {
        // Update existing note
        const updated = dayNotes.map(note =>
          note.id === editingDayNote.id
            ? { ...note, title: newDayNote.title, content: newDayNote.content, color: newDayNote.color, hour: newDayNote.hour, minute: newDayNote.minute }
            : note
        );
        saveDayNotes(updated);
      } else {
        // Create new note - remove any existing note for this date first
        const existingNotes = dayNotes.filter(n => n.date !== selectedDate);
        const note: DayNote = {
          id: `NOTE-${Date.now()}-${Math.random()}`,
          date: selectedDate,
          title: newDayNote.title || 'Fără titlu',
          content: newDayNote.content,
          color: newDayNote.color,
          hour: newDayNote.hour || undefined,
          minute: newDayNote.minute || undefined,
          createdAt: new Date().toISOString()
        };
        saveDayNotes([...existingNotes, note]);
      }
      
      // Reload to ensure state is synced
      loadDayNotes();
      
      setShowDayNoteModal(false);
      setEditingDayNote(null);
      setSelectedDate(null);
      setNewDayNote({ title: '', content: '', color: '#3B82F6', hour: '', minute: '' });
    } catch (error) {
      console.error('Error saving day note:', error);
    }
  };

  const handleDeleteDayNote = () => {
    if (!editingDayNote) return;
    try {
      const updated = dayNotes.filter(n => n.id !== editingDayNote.id);
      saveDayNotes(updated);
      loadDayNotes(); // Reload to ensure state is synced
      setShowDayNoteModal(false);
      setEditingDayNote(null);
      setSelectedDate(null);
      setNewDayNote({ title: '', content: '', color: '#3B82F6', hour: '', minute: '' });
    } catch (error) {
      console.error('Error deleting day note:', error);
    }
  };

  const handleSavePersistentNote = () => {
    if (typeof window === 'undefined') return;
    
    try {
      if (editingNote?.id && editingNote.id.startsWith('PNOTE-')) {
        // Update existing note
        const updated = persistentNotes.map(note =>
          note.id === editingNote.id
            ? { ...note, title: editingNote.title || '', content: editingNote.content || '', updatedAt: new Date().toISOString() }
            : note
        );
        savePersistentNotes(updated);
      } else {
        // Create new note
        if (!editingNote?.content && !editingNote?.title) {
          return;
        }
        const note: PersistentNote = {
          id: `PNOTE-${Date.now()}-${Math.random()}`,
          title: editingNote?.title || '',
          content: editingNote?.content || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pinned: false
        };
        savePersistentNotes([note, ...persistentNotes]);
      }
      
      // Reload to ensure state is synced
      loadPersistentNotes();
      
      setShowNoteModal(false);
      setEditingNote(null);
    } catch (error) {
      console.error('Error saving persistent note:', error);
    }
  };

  const handleDeletePersistentNote = (id: string) => {
    try {
      const updated = persistentNotes.filter(n => n.id !== id);
      savePersistentNotes(updated);
      loadPersistentNotes(); // Reload to ensure state is synced
    } catch (error) {
      console.error('Error deleting persistent note:', error);
    }
  };

  const handleTogglePin = (id: string) => {
    try {
      const updated = persistentNotes.map(note =>
        note.id === id ? { ...note, pinned: !note.pinned } : note
      );
      // Sort: pinned first, then by updatedAt
      const sorted = updated.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      savePersistentNotes(sorted);
      loadPersistentNotes(); // Reload to ensure state is synced
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const days = getDaysInMonth(currentDate);
  const filteredNotes = persistentNotes.filter(note =>
    note.title.toLowerCase().includes(searchNotes.toLowerCase()) ||
    note.content.toLowerCase().includes(searchNotes.toLowerCase())
  );
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const colorOptions = [
    { name: 'Albastru', value: '#3B82F6' },
    { name: 'Roșu', value: '#EF4444' },
    { name: 'Verde', value: '#10B981' },
    { name: 'Galben', value: '#F59E0B' },
    { name: 'Mov', value: '#8B5CF6' },
    { name: 'Roz', value: '#EC4899' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Calendar &amp; Note</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Calendar Section */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={prevMonth}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <i className="ri-arrow-left-s-line text-xl text-gray-700"></i>
              </button>
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-900">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h2>
                <button
                  onClick={goToToday}
                  className="text-sm text-blue-600 hover:text-blue-700 mt-1"
                >
                  Astăzi
                </button>
              </div>
              <button
                onClick={nextMonth}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <i className="ri-arrow-right-s-line text-xl text-gray-700"></i>
              </button>
            </div>

            {/* Day Names */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {dayNames.map((day) => (
                <div
                  key={day}
                  className="text-center text-sm font-medium text-gray-500 py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {days.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="aspect-square"></div>;
                }

                const dateKey = formatDateKey(date);
                const notes = getDayNotes(dateKey);
                const isCurrentDay = isToday(date);
                const isSelectedDay = isSelected(date);
                const hasNote = notes.length > 0;
                const noteColor = hasNote ? notes[0].color : null; // Use first note's color

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleDayClick(date)}
                    className={`
                      aspect-square rounded-2xl flex flex-col items-center justify-center p-2
                      transition-all duration-200 relative group
                      ${isCurrentDay && !hasNote
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                        : isCurrentDay && hasNote
                        ? 'text-white shadow-lg'
                        : isSelectedDay && !hasNote
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : hasNote
                        ? 'shadow-md hover:shadow-lg'
                        : 'bg-gray-50 hover:bg-gray-100'
                      }
                    `}
                    style={hasNote && noteColor ? {
                      backgroundColor: noteColor,
                      opacity: isCurrentDay ? 0.8 : 0.9
                    } : {}}
                  >
                    <span className={`
                      text-sm font-medium z-10
                      ${(isCurrentDay || hasNote) ? 'text-white' : 'text-gray-700'}
                      ${hasNote && !isCurrentDay ? 'drop-shadow-sm' : ''}
                    `}>
                      {date.getDate()}
                    </span>
                    {hasNote && (
                      <div className="mt-1 flex flex-col items-center z-10">
                        {notes[0].title && (
                          <span className="text-xs text-white/90 drop-shadow-sm line-clamp-1">
                            {notes[0].title}
                          </span>
                        )}
                        {(notes[0].hour || notes[0].minute) && (
                          <span className="text-xs text-white/80 drop-shadow-sm mt-0.5 font-medium">
                            {String(notes[0].hour || '00').padStart(2, '0')}:{String(notes[0].minute || '00').padStart(2, '0')}
                          </span>
                        )}
                      </div>
                    )}
                    {isSelectedDay && hasNote && (
                      <div className="absolute inset-0 rounded-2xl border-2 border-white/50 z-20" />
                    )}
                    <div 
                      className={`absolute inset-0 rounded-2xl bg-gradient-to-br from-white/0 to-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10`}
                      style={hasNote ? { opacity: '0', backgroundColor: 'rgba(0,0,0,0.05)' } : {}}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes Section */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">Note</h2>
              <button
                onClick={() => {
                  setEditingNote({ id: '', title: '', content: '', createdAt: '', updatedAt: '' });
                  setShowNoteModal(true);
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 transition-all"
              >
                <i className="ri-add-line text-xl"></i>
              </button>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  value={searchNotes}
                  onChange={(e) => setSearchNotes(e.target.value)}
                  placeholder="Caută în note..."
                  className="w-full px-4 py-3 pl-10 bg-gray-50 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                />
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              </div>
            </div>

            {/* Notes List */}
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {sortedNotes.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📝</div>
                  <p className="text-gray-400">Nu există note</p>
                  <p className="text-sm text-gray-300 mt-2">Adaugă o notă nouă</p>
                </div>
              ) : (
                sortedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-gray-50 rounded-2xl p-4 border border-gray-200 hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => {
                      setEditingNote(note);
                      setShowNoteModal(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 line-clamp-1 flex-1">
                        {note.pinned && <i className="ri-pushpin-line text-blue-500 mr-2"></i>}
                        {note.title || 'Fără titlu'}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(note.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 rounded-lg"
                      >
                        <i className={`ri-pushpin-${note.pinned ? 'fill' : 'line'} text-gray-400 text-sm`}></i>
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">{note.content || 'Fără conținut'}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        {new Date(note.updatedAt).toLocaleDateString('ro-RO', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePersistentNote(note.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 p-1"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Day Note Modal */}
        {showDayNoteModal && selectedDate && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDayNoteModal(false)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  {new Date(selectedDate).toLocaleDateString('ro-RO', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  })}
                </h3>
                <button
                  onClick={() => setShowDayNoteModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <i className="ri-close-line text-gray-600"></i>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Titlu</label>
                  <input
                    type="text"
                    value={newDayNote.title}
                    onChange={(e) => setNewDayNote({ ...newDayNote, title: e.target.value })}
                    placeholder="ex: Programare client"
                    className="w-full px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ora și minutul (opțional)</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ora</label>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={newDayNote.hour}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 23)) {
                            setNewDayNote({ ...newDayNote, hour: val });
                          }
                        }}
                        placeholder="00"
                        className="w-full px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Minutul</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={newDayNote.minute}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 59)) {
                            setNewDayNote({ ...newDayNote, minute: val });
                          }
                        }}
                        placeholder="00"
                        className="w-full px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-center"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notă</label>
                  <textarea
                    value={newDayNote.content}
                    onChange={(e) => setNewDayNote({ ...newDayNote, content: e.target.value })}
                    placeholder="Descriere sau amintire..."
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Culoare</label>
                  <div className="flex gap-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setNewDayNote({ ...newDayNote, color: color.value })}
                        className={`
                          w-10 h-10 rounded-full border-2 transition-all
                          ${newDayNote.color === color.value ? 'border-gray-900 scale-110' : 'border-gray-300'}
                        `}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                {editingDayNote && (
                  <button
                    onClick={handleDeleteDayNote}
                    className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-medium transition-colors"
                  >
                    Șterge
                  </button>
                )}
                <button
                  onClick={() => setShowDayNoteModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-medium transition-colors"
                >
                  Anulează
                </button>
                <button
                  onClick={handleSaveDayNote}
                  className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-medium transition-colors"
                >
                  Salvează
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Persistent Note Modal */}
        {showNoteModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowNoteModal(false)}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  {editingNote?.id ? 'Editează Notă' : 'Notă Nouă'}
                </h3>
                <button
                  onClick={() => setShowNoteModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  <i className="ri-close-line text-gray-600"></i>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={editingNote?.title || ''}
                    onChange={(e) => setEditingNote({ ...editingNote!, title: e.target.value })}
                    placeholder="Titlu (opțional)"
                    className="w-full px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-lg font-medium"
                  />
                </div>

                <div>
                  <textarea
                    value={editingNote?.content || ''}
                    onChange={(e) => setEditingNote({ ...editingNote!, content: e.target.value })}
                    placeholder="Scrie aici..."
                    rows={12}
                    className="w-full px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowNoteModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-medium transition-colors"
                >
                  Anulează
                </button>
                <button
                  onClick={handleSavePersistentNote}
                  disabled={!editingNote?.content && !editingNote?.title}
                  className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Salvează
                </button>
              </div>
            </div>
          </div>
        )}
          </div>
    </div>
  );
}
