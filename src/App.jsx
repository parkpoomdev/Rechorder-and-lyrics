import React, { useState } from 'react';
import { FolderPlus, Music, Plus, ChevronLeft, ChevronRight, Trash2, Edit3, Check, GripVertical, Type, Sun, Moon } from 'lucide-react';

const App = () => {
  // --- State Management ---
  const [folders, setFolders] = useState([
    {
      id: 1,
      name: 'My First EP',
      songs: [{ id: 1, title: 'New Song Idea' }]
    }
  ]);
  const [activeSongId, setActiveSongId] = useState(1);
  
  // Data Structure is now grouped by Song Parts (Intro, Verse, etc.)
  const [songData, setSongData] = useState({
    1: [
      {
        id: 'group-1',
        title: 'Intro',
        sections: []
      },
      {
        id: 'group-2',
        title: 'Verse 1',
        sections: [
          {
            id: 'sec-1',
            lyrics: [
              { id: 'l-1', text: 'Let', pos: 0, isX: false },
              { id: 'l-2', text: 'it', pos: 2, isX: false },
              { id: 'l-3', text: 'be,', pos: 4, isX: false },
              { id: 'l-4', text: 'let', pos: 6, isX: false },
              { id: 'l-5', text: 'it', pos: 9, isX: false },
              { id: 'l-6', text: 'be', pos: 11, isX: false }
            ],
            chords: [
              { id: 'c-1', text: 'C', pos: 0 },
              { id: 'c-2', text: 'G', pos: 6 },
              { id: 'c-3', text: 'Am', pos: 11 }
            ]
          }
        ]
      }
    ]
  });
  
  // --- Input Staging State (Tag Editor) ---
  const [stagedWords, setStagedWords] = useState([]); // { id, word, chord }
  const [inputValue, setInputValue] = useState('');
  const [editingChordId, setEditingChordId] = useState(null);
  const [chordInputValue, setChordInputValue] = useState('');
  
  // New State for Toggle Mode
  const [isChordMode, setIsChordMode] = useState(false);
  
  // Modal state for deletion
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, groupId: null });

  // Day / Night theme
  const [isDayMode, setIsDayMode] = useState(false);

  // --- Theme Colors ---
  const theme = isDayMode ? {
    bg: 'bg-[#f5f5f0]',
    sidebar: 'bg-[#e8e8e2]',
    card: 'bg-[#ffffff]',
    accent: 'bg-[#c9b800]',
    accentText: 'text-[#7a6e00]',
    text: 'text-[#1a1a1a]',
    border: 'border-[#cccccc]',
    header: 'bg-[#ededea]',
    stagingBg: 'bg-[#f0f0ea]',
    stagingCard: 'bg-[#e8e8e2]',
    stagingInput: 'bg-[#ffffff]',
    stagingBorder: 'border-[#cccccc]',
    groupBorder: 'border-[#cccccc]',
    groupHeader: 'bg-[#e8e8e2]/80',
    modalCard: 'bg-[#ffffff]',
    sidebarBorder: 'border-b border-[#d0d0ca]',
    sidebarActive: 'bg-[#dcdcd6] text-[#7a6e00]',
    sidebarHover: 'hover:bg-[#e0e0da]',
    subtleText: 'text-[#888880]',
    chordText: 'text-[#7a6e00]',
    lyricText: 'text-[#1a1a1a]',
    borderLight: 'border-[#dddddd]',
    dragHandle: 'bg-[#e8e8e2]',
    addBtn: 'border-[#aaaaaa] text-[#888880] bg-[#f5f5f0] hover:border-[#c9b800] hover:text-[#7a6e00]',
  } : {
    bg: 'bg-[#1a1a1a]',
    sidebar: 'bg-[#2b2b2b]',
    card: 'bg-[#3a3a3a]',
    accent: 'bg-[#e0d036]',
    accentText: 'text-[#e0d036]',
    text: 'text-[#e5e5e5]',
    border: 'border-[#444444]',
    header: 'bg-[#1f1f1f]',
    stagingBg: 'bg-[#1a1a1a]',
    stagingCard: 'bg-[#2b2b2b]',
    stagingInput: 'bg-[#222222]',
    stagingBorder: 'border-[#444444]',
    groupBorder: 'border-[#333333]',
    groupHeader: 'bg-[#1f1f1f]/80',
    modalCard: 'bg-[#3a3a3a]',
    sidebarBorder: 'border-b border-[#111111]',
    sidebarActive: 'bg-[#444444] text-[#e0d036]',
    sidebarHover: 'hover:bg-[#333333]',
    subtleText: 'text-[#aaaaaa]',
    chordText: 'text-[#e0d036]',
    lyricText: 'text-gray-200',
    borderLight: 'border-[#333333]',
    dragHandle: 'bg-[#2b2b2b]',
    addBtn: 'border-[#444444] text-[#666666] bg-[#1a1a1a] hover:border-[#e0d036] hover:text-[#e0d036]',
  };

  // --- Input & Tag Editor Logic ---
  const handleInputKeyDown = (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      if (inputValue.trim()) {
        const val = inputValue.trim();
        if (isChordMode) {
          // If in Chord Mode, treat input as a gap ('x') and set the text as its chord
          setStagedWords([...stagedWords, { id: Date.now().toString(), word: 'x', chord: val.replace(/[\[\]]/g, '') }]);
        } else {
          setStagedWords([...stagedWords, { id: Date.now().toString(), word: val, chord: null }]);
        }
        setInputValue('');
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitSection();
    } else if (e.key === 'Backspace' && inputValue === '') {
      if (stagedWords.length > 0) {
        const lastWord = stagedWords[stagedWords.length - 1];
        // If it was a chord-only block, put the chord back into input
        setInputValue(isChordMode && lastWord.chord ? lastWord.chord : lastWord.word);
        setStagedWords(stagedWords.slice(0, -1));
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    const words = paste.trim().split(/\s+/);
    
    const newWords = words.map((w, i) => {
      if (isChordMode) {
        // In Chord Mode, everything pasted becomes a chord on an empty gap
        return { id: Date.now() + i.toString(), word: 'x', chord: w.replace(/[\[\]]/g, '') };
      } else {
        let word = w;
        let chord = null;
        const matchEnd = w.match(/^(.*?)\[(.*?)\]$/);
        const matchStart = w.match(/^\[(.*?)\](.*)$/);
        
        if (matchEnd) { word = matchEnd[1]; chord = matchEnd[2]; } 
        else if (matchStart) { chord = matchStart[1]; word = matchStart[2]; }

        return { id: Date.now() + i.toString(), word, chord };
      }
    });

    setStagedWords([...stagedWords, ...newWords]);
  };

  const saveChord = (id) => {
    const val = chordInputValue.trim();
    setStagedWords(stagedWords.map(w => w.id === id ? { ...w, chord: val === '' ? null : val } : w));
    setEditingChordId(null);
  };

  const submitSection = () => {
    let finalWords = [...stagedWords];
    if (inputValue.trim()) {
      const val = inputValue.trim();
      if (isChordMode) {
        finalWords.push({ id: Date.now().toString(), word: 'x', chord: val.replace(/[\[\]]/g, '') });
      } else {
        finalWords.push({ id: Date.now().toString(), word: val, chord: null });
      }
    }

    if (finalWords.length === 0) return;

    let newLyrics = [];
    let newChords = [];
    let currentPos = 0;

    finalWords.forEach((w, i) => {
      const isX = w.word.toLowerCase() === 'x'; // Detect 'x' or 'X'

      newLyrics.push({ id: `l-${Date.now()}-${i}`, text: w.word, pos: currentPos, isX });

      if (w.chord) {
        let chordPos = currentPos;
        while (newChords.some(existing => existing.pos === chordPos) && chordPos < 31) chordPos++;
        newChords.push({ id: `c-${Date.now()}-${i}`, text: w.chord, pos: chordPos });
      }

      // X takes 2 slots as a gap, normal words calculate size
      let slotsNeeded = isX ? 2 : Math.ceil(w.word.length / 2.5);
      currentPos += slotsNeeded + 1; 
      if (currentPos > 31) currentPos = 31;
    });

    const newSection = { id: 'sec-' + Date.now(), lyrics: newLyrics, chords: newChords };

    setSongData(prev => {
      const currentGroups = prev[activeSongId] || [];
      // If no groups, create default Verse 1
      if (currentGroups.length === 0) {
        return { ...prev, [activeSongId]: [{ id: 'g-' + Date.now(), title: 'Verse 1', sections: [newSection] }] };
      }
      // Always append to the LAST group by default
      const newGroups = currentGroups.map((g, idx) =>
        idx === currentGroups.length - 1
          ? { ...g, sections: [...g.sections, newSection] }
          : g
      );
      return { ...prev, [activeSongId]: newGroups };
    });

    setStagedWords([]);
    setInputValue('');
  };

  // --- Structure & Drag Logic ---
  const addGroup = () => {
    setSongData(prev => ({
      ...prev,
      [activeSongId]: [...(prev[activeSongId] || []), { id: 'g-' + Date.now(), title: 'New Part', sections: [] }]
    }));
  };

  const updateGroupTitle = (groupId, newTitle) => {
    setSongData(prev => ({
      ...prev,
      [activeSongId]: prev[activeSongId].map(g => g.id === groupId ? { ...g, title: newTitle } : g)
    }));
  };

  const requestRemoveGroup = (groupId) => {
    setDeleteConfirm({ isOpen: true, groupId });
  };

  const confirmRemoveGroup = () => {
    if (deleteConfirm.groupId) {
      setSongData(prev => ({
        ...prev,
        [activeSongId]: prev[activeSongId].filter(g => g.id !== deleteConfirm.groupId)
      }));
    }
    setDeleteConfirm({ isOpen: false, groupId: null });
  };

  const cancelRemoveGroup = () => {
    setDeleteConfirm({ isOpen: false, groupId: null });
  };

  const moveChord = (groupId, sectionId, chordId, direction) => {
    setSongData(prev => ({
      ...prev,
      [activeSongId]: prev[activeSongId].map(g => {
        if (g.id !== groupId) return g;
        return {
          ...g, sections: g.sections.map(sec => {
            if (sec.id !== sectionId) return sec;
            let newChords = [...sec.chords];
            const chordIndex = newChords.findIndex(c => c.id === chordId);
            const currentPos = newChords[chordIndex].pos;
            let newPos = currentPos + direction;

            if (newPos < 0) newPos = 0;
            if (newPos > 31) newPos = 31;

            const existingIndex = newChords.findIndex(c => c.pos === newPos);
            if (existingIndex !== -1 && existingIndex !== chordIndex) {
              newChords[existingIndex].pos = currentPos;
            }
            newChords[chordIndex].pos = newPos;
            return { ...sec, chords: newChords };
          })
        };
      })
    }));
  };

  // Drag Handlers
  const handleDragStartSection = (e, groupId, sectionId) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'section', groupId, sectionId }));
  };

  const handleDragStartChord = (e, groupId, sectionId, chord) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'chord', groupId, sectionId, chordId: chord.id, sourcePos: chord.pos }));
  };

  const handleGroupDrop = (e, targetGroupId) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type !== 'section') return;

      setSongData(prev => {
        let sectionToMove = null;
        let tempGroups = prev[activeSongId].map(g => {
          if (g.id === data.groupId) {
            sectionToMove = g.sections.find(s => s.id === data.sectionId);
            return { ...g, sections: g.sections.filter(s => s.id !== data.sectionId) };
          }
          return g;
        });

        if (!sectionToMove) return prev;
        return { ...prev, [activeSongId]: tempGroups.map(g => g.id === targetGroupId ? { ...g, sections: [...g.sections, sectionToMove] } : g) };
      });
    } catch (err) {}
  };

  const handleSectionDrop = (e, targetGroupId, targetSectionId) => {
    e.preventDefault();
    e.stopPropagation(); // Stop Group from catching this
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type !== 'section' || data.sectionId === targetSectionId) return;

      setSongData(prev => {
        let sectionToMove = null;
        let tempGroups = prev[activeSongId].map(g => {
          if (g.id === data.groupId) {
            sectionToMove = g.sections.find(s => s.id === data.sectionId);
            return { ...g, sections: g.sections.filter(s => s.id !== data.sectionId) };
          }
          return g;
        });

        if (!sectionToMove) return prev;
        return {
          ...prev, [activeSongId]: tempGroups.map(g => {
            if (g.id === targetGroupId) {
              let newSec = [...g.sections];
              const tIdx = newSec.findIndex(s => s.id === targetSectionId);
              newSec.splice(tIdx, 0, sectionToMove); // Insert before target
              return { ...g, sections: newSec };
            }
            return g;
          })
        };
      });
    } catch (err) {}
  };

  const handleChordDrop = (e, targetGroupId, targetSectionId, targetPos) => {
    e.preventDefault();
    e.stopPropagation(); // Stop Section & Group from catching this
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type !== 'chord' || data.sectionId !== targetSectionId) return;

      setSongData(prev => ({
        ...prev,
        [activeSongId]: prev[activeSongId].map(g => g.id === targetGroupId ? {
          ...g, sections: g.sections.map(sec => {
            if (sec.id !== targetSectionId) return sec;
            let newChords = [...sec.chords];
            const dIdx = newChords.findIndex(c => c.id === data.chordId);
            const eIdx = newChords.findIndex(c => c.pos === targetPos);
            if (eIdx !== -1 && eIdx !== dIdx) newChords[eIdx].pos = data.sourcePos;
            newChords[dIdx].pos = targetPos;
            return { ...sec, chords: newChords };
          })
        } : g)
      }));
    } catch (err) {}
  };

  const removeSection = (groupId, sectionId) => {
    setSongData(prev => ({
      ...prev, [activeSongId]: prev[activeSongId].map(g => g.id === groupId ? { ...g, sections: g.sections.filter(s => s.id !== sectionId) } : g)
    }));
  };

  // --- Folder Management ---
  const addFolder = () => {
    const name = prompt("Enter folder name:");
    if (name) setFolders([...folders, { id: Date.now(), name, songs: [] }]);
  };

  const addSong = (folderId) => {
    const title = prompt("Enter song title:");
    if (title) {
      const newSong = { id: Date.now(), title };
      setFolders(folders.map(f => f.id === folderId ? { ...f, songs: [...f.songs, newSong] } : f));
      setActiveSongId(newSong.id);
      setSongData(prev => ({ ...prev, [newSong.id]: [] }));
    }
  };

  let activeSongName = "No Song Selected";
  folders.forEach(f => {
    const song = f.songs.find(s => s.id === activeSongId);
    if (song) activeSongName = song.title;
  });

  const activeGroups = songData[activeSongId] || [];

  return (
    <div className={`flex h-screen w-full ${theme.bg} ${theme.text} font-sans overflow-hidden transition-colors duration-300`}>
      
      {/* --- Left Navigation (30%) --- */}
      <div className={`w-[30%] ${theme.sidebar} flex flex-col border-r ${theme.border} shadow-lg z-20`}>
        <div className={`p-5 flex justify-between items-center ${theme.sidebarBorder}`}>
          <h1 className={`text-xl font-bold tracking-tight ${theme.accentText}`}>ChordScribe</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDayMode(!isDayMode)}
              className={`p-1.5 rounded transition ${isDayMode ? 'hover:bg-[#dcdcd6]' : 'hover:bg-[#444]'}`}
              title={isDayMode ? 'Switch to Night' : 'Switch to Day'}
            >
              {isDayMode ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button onClick={addFolder} className={`p-1 rounded transition ${isDayMode ? 'hover:bg-[#dcdcd6]' : 'hover:bg-[#444]'}`} title="Add Folder">
              <FolderPlus size={20} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {folders.map(folder => (
            <div key={folder.id} className="mb-4">
              <div className={`flex justify-between items-center text-sm uppercase tracking-wider mb-2 font-semibold ${theme.subtleText}`}>
                <span>{folder.name}</span>
                <button onClick={() => addSong(folder.id)} className={`transition ${isDayMode ? 'hover:text-[#1a1a1a]' : 'hover:text-white'}`}>
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-1">
                {folder.songs.map(song => (
                  <div 
                    key={song.id}
                    onClick={() => setActiveSongId(song.id)}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition ${activeSongId === song.id ? theme.sidebarActive : theme.sidebarHover}`}
                  >
                    <Music size={16} />
                    <span className="text-sm truncate">{song.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Right Content (70%) --- */}
      <div className="w-[70%] flex flex-col relative z-10">
        
        {/* Header */}
        <div className={`px-8 py-6 border-b ${theme.borderLight} ${theme.header}`}>
          <h2 className="text-3xl font-bold tracking-wide">{activeSongName}</h2>
        </div>

        {/* --- Token Input Area (Staging Area) --- */}
        <div className={`px-8 py-6 border-b ${theme.borderLight} ${theme.stagingBg} shrink-0 z-20 shadow-sm relative`}>
          <div className={`w-full flex flex-col gap-2 ${theme.stagingCard} p-3 rounded-xl border ${theme.stagingBorder} shadow-inner`}>
            
            {/* Top bar with Toggle */}
            <div className="flex items-center gap-3 px-1">
              <button
                onClick={() => setIsChordMode(!isChordMode)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  isChordMode
                    ? 'bg-[#e0d036] text-black shadow-[0_0_10px_rgba(224,208,54,0.3)]'
                    : isDayMode ? 'bg-[#dcdcd6] text-gray-700 hover:bg-[#cccccc]' : 'bg-[#444] text-gray-300 hover:bg-[#555]'
                }`}
              >
                {isChordMode ? <Music size={12} strokeWidth={3} /> : <Type size={12} />}
                {isChordMode ? 'CHORD MODE' : 'LYRIC MODE'}
              </button>
              <span className={`text-xs font-mono flex items-center gap-1 ${theme.subtleText}`}>
                <Edit3 size={12} /> Staging Area
              </span>
            </div>

            <div className="flex items-start gap-3">
              <div 
                className={`flex-1 flex flex-wrap items-center ${theme.stagingInput} p-2 rounded-lg border ${theme.stagingBorder} min-h-[56px] cursor-text`}
                onClick={() => document.getElementById('main-word-input')?.focus()}
              >
                {stagedWords.map((sw) => {
                  const isX = sw.word.toLowerCase() === 'x';
                  const isChordOnly = isX && sw.chord; // If it's a gap and has a chord, it's considered a "Chord Block"

                  return (
                    <div key={sw.id} className={`relative flex items-center ${isDayMode ? 'bg-[#e8e8e2] hover:bg-[#dcdcd6] border-[#cccccc]' : 'bg-[#333] hover:bg-[#3a3a3a] border-[#555]'} border rounded-md px-2 py-1 m-1 group transition-colors`}>
                      {/* Only show the word/gap text if it's NOT a chord-only block */}
                      {!isChordOnly && (
                        <span className={`text-sm font-mono mr-1 cursor-default ${isX ? `${theme.subtleText} italic` : theme.text}`}>
                          {isX ? '(gap)' : sw.word}
                        </span>
                      )}

                      {editingChordId === sw.id ? (
                        <div className={`flex items-center ${theme.chordText} font-bold text-sm`}>
                          [<input
                            autoFocus
                            value={chordInputValue}
                            onChange={e => setChordInputValue(e.target.value)}
                            onBlur={() => saveChord(sw.id)}
                            onKeyDown={e => e.key === 'Enter' && saveChord(sw.id)}
                            className={`bg-transparent outline-none w-6 text-center ${theme.chordText} placeholder-[#888]`}
                            placeholder="C"
                          />]
                        </div>
                      ) : sw.chord ? (
                        <span
                          onClick={(e) => { e.stopPropagation(); setEditingChordId(sw.id); setChordInputValue(sw.chord); }}
                          className={`text-sm font-bold ${theme.chordText} cursor-pointer ${isDayMode ? 'hover:text-black' : 'hover:text-white'} transition-colors ${isChordOnly ? 'ml-0' : ''}`}
                          title="Edit Chord"
                        >
                          [{sw.chord}]
                        </span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingChordId(sw.id); setChordInputValue(''); }}
                          className={`w-4 h-4 flex items-center justify-center text-[10px] ${isDayMode ? 'bg-[#cccccc] text-gray-700' : 'bg-[#555] text-white'} rounded-full opacity-0 group-hover:opacity-100 hover:bg-[#e0d036] hover:text-black transition-all ml-1`}
                        >
                          <Plus size={10} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  );
                })}

                <input
                  id="main-word-input"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onPaste={handlePaste}
                  placeholder={stagedWords.length === 0 ? (isChordMode ? "Type chords (e.g. C Am F) and press Space..." : "Paste lyrics or type space to separate... ('x' for gap)") : ""}
                  className={`bg-transparent text-sm font-mono ${theme.subtleText} outline-none flex-1 min-w-[250px] ml-2 py-1 placeholder-[#999]`}
                />
              </div>

              <button
                onClick={submitSection}
                disabled={stagedWords.length === 0 && !inputValue.trim()}
                className={`p-3 rounded-lg flex items-center justify-center transition-all h-[56px] w-[56px] ${
                  stagedWords.length > 0 || inputValue.trim()
                    ? 'bg-[#e0d036] text-black hover:bg-yellow-400 shadow-[0_0_15px_rgba(224,208,54,0.3)]' 
                    : 'bg-[#444] text-gray-500 cursor-not-allowed'
                }`}
              >
                <Check size={24} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        {/* --- Sections Area (Groups with Dot Grid) --- */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          {activeGroups.length === 0 ? (
            <div className={`text-center mt-20 flex flex-col items-center ${theme.subtleText}`}>
              <Music size={48} className="mb-4 opacity-20" />
              <p>Type lyrics above to start your first part.</p>
            </div>
          ) : (
            <div className="space-y-6 pb-32">
              {activeGroups.map((group) => (
                <div 
                  key={group.id} 
                  className={`group/container border-2 border-dashed ${theme.groupBorder} hover:border-opacity-70 rounded-xl transition-colors min-h-[140px] flex flex-col overflow-hidden`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleGroupDrop(e, group.id)}
                >
                  {/* Dot Grid Background overlay */}
                  <div className={`absolute inset-0 pointer-events-none opacity-10 ${isDayMode ? 'bg-[radial-gradient(#555_1.5px,transparent_1.5px)]' : 'bg-[radial-gradient(#888_1.5px,transparent_1.5px)]'} bg-[length:24px_24px] z-0`}></div>

                  {/* Group Header */}
                  <div className={`p-4 flex items-center gap-3 relative z-10 ${theme.groupHeader} backdrop-blur-sm border-b ${theme.borderLight}`}>
                    <input
                      value={group.title}
                      onChange={(e) => updateGroupTitle(group.id, e.target.value)}
                      className={`bg-transparent ${theme.accentText} font-bold text-xl outline-none transition-colors w-40 placeholder-[#999]`}
                      placeholder="Part Name"
                    />
                    <div className={`flex-1 border-t border-dashed ${theme.border}`}></div>
                    <button 
                      onClick={() => requestRemoveGroup(group.id)} 
                      className={`${theme.subtleText} hover:text-red-500 transition-colors opacity-0 group-hover/container:opacity-100`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Droppable Area for Sections */}
                  <div className="flex-1 p-4 space-y-3 relative z-10">
                    {group.sections.map((section) => {
                      // เช็คว่า section นี้เป็นคอร์ดเพียวๆ หรือไม่ (คำทั้งหมดเป็น 'x')
                      const isChordOnlySection = section.lyrics && section.lyrics.length > 0 && section.lyrics.every(l => l.isX);
                      
                      return (
                      <div 
                        key={section.id} 
                        draggable
                        onDragStart={(e) => handleDragStartSection(e, group.id, section.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleSectionDrop(e, group.id, section.id)}
                        className={`${theme.card} rounded-md shadow-md overflow-hidden border-l-4 border-[#e0d036] relative group transition-all flex`}
                      >
                        {/* Drag Handle */}
                        <div className={`w-6 ${theme.dragHandle} flex items-center justify-center ${theme.subtleText} cursor-grab active:cursor-grabbing border-r ${theme.borderLight}`}>
                           <GripVertical size={14} />
                        </div>

                        {/* Section Delete Button */}
                        <button 
                          onClick={() => removeSection(group.id, section.id)}
                          className={`absolute right-2 p-1.5 bg-red-500/10 text-red-400 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition z-30 ${isChordOnlySection ? 'top-1/2 -translate-y-1/2' : 'top-2'}`}
                        >
                          <Trash2 size={14} />
                        </button>

                        <div className={`flex-1 overflow-hidden relative ${isChordOnlySection ? 'py-1 px-3' : 'p-3 pt-4'}`}>
                          <div className={`grid grid-cols-[repeat(32,minmax(0,1fr))] relative group/grid ${isChordOnlySection ? '' : 'mb-1'}`}>
                            {Array.from({ length: 32 }).map((_, i) => {
                              const chordsHere = section.chords.filter(c => c.pos === i);
                              const lyricsHere = section.lyrics ? section.lyrics.filter(l => l.pos === i) : [];
                              
                              return (
                                <div
                                  key={i}
                                  className="border-l border-white/5 flex flex-col items-start justify-start relative hover:bg-white/10 transition-colors"
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => handleChordDrop(e, group.id, section.id, i)}
                                >
                                  {/* Chords */}
                                  <div className="h-7 w-full relative z-20 flex items-center">
                                    {chordsHere.map(chord => (
                                      <div
                                        key={chord.id}
                                        draggable
                                        onDragStart={(e) => handleDragStartChord(e, group.id, section.id, chord)}
                                        className={`absolute left-0 font-bold text-xs ${theme.accent} text-black px-1 py-0 rounded shadow-sm whitespace-nowrap group/chord cursor-grab active:cursor-grabbing z-30`}
                                      >
                                        <button
                                          onClick={(e) => { e.stopPropagation(); moveChord(group.id, section.id, chord.id, -1); }}
                                          className="absolute -left-5 top-0 bottom-0 m-auto h-4 w-4 bg-[#222] text-white rounded flex items-center justify-center opacity-0 group-hover/chord:opacity-100 hover:bg-white hover:text-black transition-all transform -translate-x-1 group-hover/chord:translate-x-0"
                                        >
                                          <ChevronLeft size={10} />
                                        </button>
                                        {chord.text}
                                        <button
                                          onClick={(e) => { e.stopPropagation(); moveChord(group.id, section.id, chord.id, 1); }}
                                          className="absolute -right-5 top-0 bottom-0 m-auto h-4 w-4 bg-[#222] text-white rounded flex items-center justify-center opacity-0 group-hover/chord:opacity-100 hover:bg-white hover:text-black transition-all transform translate-x-1 group-hover/chord:translate-x-0"
                                        >
                                          <ChevronRight size={10} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Lyrics */}
                                  {!isChordOnlySection && (
                                    <div className="h-7 w-full relative z-10 flex items-center">
                                      {lyricsHere.map(lyric => (
                                        <span 
                                          key={lyric.id} 
                                          className={`absolute left-0 text-base font-medium tracking-wide pl-1 font-mono ${theme.lyricText} whitespace-nowrap pointer-events-none`}
                                        >
                                          {/* If it's the 'x' token, render nothing but it still consumes space! */}
                                          {lyric.isX ? '' : lyric.text}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              ))}
              
              {/* --- Add Group (+) Button --- */}
              <button
                onClick={addGroup}
                className={`w-full py-6 mt-6 border-2 border-dashed ${theme.addBtn} rounded-xl flex flex-col items-center justify-center transition-all group/add`}
              >
                <Plus size={32} className="group-hover/add:scale-125 transition-transform duration-300" />
                <span className="text-xs font-bold uppercase tracking-widest mt-2 opacity-0 group-hover/add:opacity-100 transition-opacity">Add Part</span>
              </button>

            </div>
          )}
        </div>

        {/* --- Custom Confirm Modal --- */}
        {deleteConfirm.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={`${theme.modalCard} p-6 rounded-xl shadow-2xl border ${theme.border} max-w-sm w-full mx-4`}>
              <h3 className={`text-xl font-bold mb-2 ${theme.text}`}>Delete Part?</h3>
              <p className={`${theme.subtleText} mb-6`}>Are you sure you want to delete this entire part and all its lyrics? This action cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelRemoveGroup}
                  className={`px-4 py-2 rounded ${theme.subtleText} ${isDayMode ? 'hover:bg-[#e0e0da]' : 'hover:bg-[#444]'} transition-colors`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveGroup}
                  className="px-4 py-2 rounded bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors font-bold"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;