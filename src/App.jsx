import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, Music, Plus, ChevronLeft, ChevronRight, Trash2, Edit3, Check, GripVertical, Type, Sun, Moon, X, HelpCircle, FileText, Loader2, Cloud, CloudOff, Menu, Eye } from 'lucide-react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { get, ref, set } from 'firebase/database';

const DEFAULT_FOLDERS = [{ id: 1, name: 'My First EP', songs: [{ id: 1, title: 'New Song Idea' }] }];
const DEFAULT_ACTIVE_SONG_ID = 1;
const AUTH_REDIRECT_PENDING_KEY = 'chordscribe_auth_redirect_pending';
const CHORD_PATTERN = /^[A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?(?:[0-9]{0,2})?(?:[#b]?[0-9]{0,2})*(?:\/[A-G](?:#|b)?)?$/;

const normalizeFolders = (rawFolders) => {
  const foldersArray = Array.isArray(rawFolders)
    ? rawFolders
    : (rawFolders && typeof rawFolders === 'object' ? Object.values(rawFolders) : []);

  const normalized = foldersArray
    .filter(folder => folder && typeof folder === 'object')
    .map((folder, index) => {
      const folderId = folder.id ?? Date.now() + index;
      const songsArray = Array.isArray(folder.songs)
        ? folder.songs
        : (folder.songs && typeof folder.songs === 'object' ? Object.values(folder.songs) : []);

      const songs = songsArray
        .filter(song => song && typeof song === 'object')
        .map((song, songIndex) => ({
          id: song.id ?? `${folderId}-song-${songIndex}`,
          title: typeof song.title === 'string' && song.title.trim() ? song.title : `Song ${songIndex + 1}`
        }));

      return {
        id: folderId,
        name: typeof folder.name === 'string' && folder.name.trim() ? folder.name : `Folder ${index + 1}`,
        songs
      };
    })
    .filter(folder => folder.songs.length > 0);

  return normalized.length > 0 ? normalized : DEFAULT_FOLDERS;
};

const normalizeSongData = (rawSongData) => {
  if (!rawSongData || typeof rawSongData !== 'object' || Array.isArray(rawSongData)) return {};

  const normalizeToArray = (value) => (
    Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : [])
  );

  const safeData = {};

  Object.entries(rawSongData).forEach(([songId, groupsRaw]) => {
    const groups = normalizeToArray(groupsRaw)
      .filter(group => group && typeof group === 'object')
      .map((group, groupIndex) => {
        const sections = normalizeToArray(group.sections)
          .filter(section => section && typeof section === 'object')
          .map((section, sectionIndex) => {
            const lyrics = normalizeToArray(section.lyrics)
              .filter(lyric => lyric && typeof lyric === 'object')
              .map((lyric, lyricIndex) => ({
                id: lyric.id ?? `l-${songId}-${groupIndex}-${sectionIndex}-${lyricIndex}`,
                text: typeof lyric.text === 'string' ? lyric.text : '',
                pos: Number.isFinite(Number(lyric.pos)) ? Number(lyric.pos) : 0,
                isX: Boolean(lyric.isX)
              }));

            const chords = normalizeToArray(section.chords)
              .filter(chord => chord && typeof chord === 'object')
              .map((chord, chordIndex) => ({
                id: chord.id ?? `c-${songId}-${groupIndex}-${sectionIndex}-${chordIndex}`,
                text: typeof chord.text === 'string' ? chord.text : '',
                pos: Number.isFinite(Number(chord.pos)) ? Number(chord.pos) : 0
              }));

            return {
              id: section.id ?? `sec-${songId}-${groupIndex}-${sectionIndex}`,
              lyrics,
              chords
            };
          });

        return {
          id: group.id ?? `g-${songId}-${groupIndex}`,
          title: typeof group.title === 'string' && group.title.trim() ? group.title : `Part ${groupIndex + 1}`,
          sections
        };
      });

    safeData[songId] = groups;
  });

  return safeData;
};

const normalizeNotes = (rawNotes) => (
  rawNotes && typeof rawNotes === 'object' && !Array.isArray(rawNotes) ? rawNotes : {}
);

const normalizeChordInput = (rawValue) => {
  if (!rawValue) return '';
  let value = rawValue
    .replace(/[\[\]\s]+/g, '')
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b');

  const rootMatch = value.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!rootMatch) return value;

  const [, root, accidental, rest] = rootMatch;
  let normalizedRest = rest || '';
  normalizedRest = normalizedRest.replace(/^MIN/i, 'm').replace(/^MAJ/i, 'maj');
  normalizedRest = normalizedRest.replace(/\/([A-Ga-g])([#b]?)/g, (_, bassRoot, bassAcc) => `/${bassRoot.toUpperCase()}${bassAcc || ''}`);

  return `${root.toUpperCase()}${accidental || ''}${normalizedRest}`;
};

const toValidChord = (rawValue) => {
  const normalized = normalizeChordInput(rawValue);
  if (!normalized) return null;
  return CHORD_PATTERN.test(normalized) ? normalized : null;
};

const processInputWord = (val, isChordMode, baseId = Date.now()) => {
  if (isChordMode) {
    const validChord = toValidChord(val);
    if (!validChord) return { error: true };
    return { item: { id: baseId.toString(), word: 'x', chord: validChord } };
  }
  return { item: { id: baseId.toString(), word: val, chord: null } };
};

const parsePastedText = (pasteText, isChordMode, baseId = Date.now()) => {
  const words = pasteText.trim().split(/\s+/);
  return words.reduce((acc, w, i) => {
    if (isChordMode) {
      const validChord = toValidChord(w);
      if (validChord) {
        acc.push({ id: `${baseId}-${i}`, word: 'x', chord: validChord });
      }
    } else {
      let word = w;
      let chord = null;
      const matchEnd = w.match(/^(.*?)\[(.*?)\]$/);
      const matchStart = w.match(/^\[(.*?)\](.*)$/);

      if (matchEnd) {
        word = matchEnd[1];
        chord = toValidChord(matchEnd[2]);
      } else if (matchStart) {
        chord = toValidChord(matchStart[1]);
        word = matchStart[2];
      }
      acc.push({ id: `${baseId}-${i}`, word, chord });
    }
    return acc;
  }, []);
};

const processFinalWordsToSectionItems = (finalWords, baseId = Date.now()) => {
  let newLyrics = [];
  let newChords = [];
  let currentPos = 0;

  finalWords.forEach((w, i) => {
    const isX = w.word.toLowerCase() === 'x';
    newLyrics.push({ id: `l-${baseId}-${i}`, text: w.word, pos: currentPos, isX });

    if (w.chord) {
      let chordPos = currentPos;
      while (newChords.some(existing => existing.pos === chordPos) && chordPos < 31) chordPos++;
      newChords.push({ id: `c-${baseId}-${i}`, text: w.chord, pos: chordPos });
    }

    let slotsNeeded = isX ? 2 : 1;
    currentPos += slotsNeeded;
    if (currentPos > 31) currentPos = 31;
  });

  return { lyrics: newLyrics, chords: newChords };
};

const App = () => {
  // --- Firebase Auth State ---
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showManual, setShowManual] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const dataLoadedRef = useRef(false);

  const [notes, setNotes] = useState({});
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState('saved'); // 'saved', 'saving', 'error'
  const [isChordSyntaxError, setIsChordSyntaxError] = useState(false);

  // --- State Management ---
  const [folders, setFolders] = useState(DEFAULT_FOLDERS);
  const [activeSongId, setActiveSongId] = useState(DEFAULT_ACTIVE_SONG_ID);

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

  // --- Firebase Sync ---
  useEffect(() => {
    const hasPendingRedirect = (() => {
      try {
        return sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY) === '1';
      } catch {
        return false;
      }
    })();

    // Fallback timeout to prevent infinite loading screen if network/Firebase hangs
    const fallbackTimeout = setTimeout(() => {
      setAuthChecking(false);
    }, hasPendingRedirect ? 15000 : 5000);

    getRedirectResult(auth)
      .catch((error) => {
        console.error('Firebase redirect login error:', error);
      })
      .finally(() => {
        try {
          sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
        } catch {
          // ignore storage access issues
        }
      });

    const unsub = onAuthStateChanged(auth, async (userAuth) => {
      clearTimeout(fallbackTimeout);
      setUser(userAuth);
      if (userAuth) {
        try {
          const userRef = ref(db, `users/${userAuth.uid}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            const data = snapshot.val();
            const safeFolders = normalizeFolders(data?.folders);
            const safeSongData = normalizeSongData(data?.songData);
            const safeNotes = normalizeNotes(data?.notes);

            setFolders(safeFolders);
            setActiveSongId(safeFolders[0]?.songs?.[0]?.id ?? DEFAULT_ACTIVE_SONG_ID);
            setSongData(safeSongData);
            setNotes(safeNotes);
          } else {
            // New User completely
            setFolders(DEFAULT_FOLDERS);
            setActiveSongId(DEFAULT_ACTIVE_SONG_ID);
          }
          // VERY IMPORTANT: Only allow saving AFTER we know we've pulled the cloud data
          dataLoadedRef.current = true;
        } catch (error) {
          console.error("Firebase error getting user data:", error);
          // If network error, don't allow saving to prevent accidental overwrites
          dataLoadedRef.current = false;
        }
      } else {
        dataLoadedRef.current = false;
        // Reset state on logout to prevent data bleed handling
        setFolders(DEFAULT_FOLDERS);
        setSongData({});
        setNotes({});
        setActiveSongId(DEFAULT_ACTIVE_SONG_ID);
      }
      setAuthChecking(false);
    });

    return () => {
      clearTimeout(fallbackTimeout);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!user || !dataLoadedRef.current) return;

    setSyncStatus('saving');
    const timeoutId = setTimeout(() => {
      set(ref(db, `users/${user.uid}`), {
        folders,
        songData,
        notes
      })
        .then(() => setSyncStatus('saved'))
        .catch(err => {
          console.error("Error saving to Firebase:", err);
          setSyncStatus('error');
        });
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [folders, songData, notes, user]);

  // Warn user if they try to leave the page while saving is not finished
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (syncStatus === 'saving') {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [syncStatus]);

  const handleLogin = async () => {
    const isMobileBrowser = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setAuthChecking(true);

    try {
      if (isMobileBrowser) {
        try {
          sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, '1');
        } catch {
          // ignore storage access issues
        }
        await signInWithRedirect(auth, googleProvider);
        return;
      }

      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const popupFallbackErrors = [
        'auth/popup-blocked',
        'auth/popup-closed-by-user',
        'auth/operation-not-supported-in-this-environment',
        'auth/cancelled-popup-request'
      ];

      if (popupFallbackErrors.includes(e?.code)) {
        try {
          try {
            sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, '1');
          } catch {
            // ignore storage access issues
          }
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          console.error(redirectError);
        }
      }

      console.error(e);
      setAuthChecking(false);
    }
  };

  const handleLogout = async () => {
    try {
      setShowAuthModal(false);
      // Force an immediate save before logging out to ensure no data is lost
      if (user && dataLoadedRef.current) {
        setSyncStatus('saving');
        await set(ref(db, `users/${user.uid}`), {
          folders,
          songData,
          notes
        });
        setSyncStatus('saved');
      }
      await signOut(auth);
      dataLoadedRef.current = false;
    } catch (e) {
      console.error("Error during logout:", e);
    }
  };

  const openAuthModal = () => setShowAuthModal(true);
  const continueAsGuest = () => {
    setIsGuestMode(true);
    setShowAuthModal(false);
  };

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
  const applyMainInputValue = (raw) => {
    if (isChordMode) {
      setInputValue(normalizeChordInput(raw));
      setIsChordSyntaxError(false);
      return;
    }
    setInputValue(raw);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      if (inputValue.trim()) {
        const result = processInputWord(inputValue.trim(), isChordMode);
        if (result.error) {
          setIsChordSyntaxError(true);
          return;
        }
        setStagedWords(prev => [...prev, result.item]);
        setIsChordSyntaxError(false);
        setInputValue('');
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitSection();
    } else if (e.key === 'Backspace' && inputValue === '') {
      setStagedWords(prev => {
        if (prev.length === 0) return prev;
        const newStaged = [...prev];
        const lastWord = newStaged.pop();
        setInputValue(isChordMode && lastWord.chord ? lastWord.chord : lastWord.word);
        return newStaged;
      });
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    const newWords = parsePastedText(paste, isChordMode);
    setStagedWords(prev => [...prev, ...newWords]);
  };

  const saveChord = (id) => {
    const val = chordInputValue.trim();
    if (val === '') {
      setStagedWords(prev => prev.map(w => w.id === id ? { ...w, chord: null } : w));
      setEditingChordId(null);
      return;
    }

    const validChord = toValidChord(val);
    if (!validChord) {
      setChordInputValue(normalizeChordInput(val));
      return;
    }

    setStagedWords(prev => prev.map(w => w.id === id ? { ...w, chord: validChord } : w));
    setEditingChordId(null);
  };

  const submitSection = () => {
    let finalWords = [...stagedWords];
    if (inputValue.trim()) {
      const result = processInputWord(inputValue.trim(), isChordMode);
      if (result.error) {
        setIsChordSyntaxError(true);
        return;
      }
      finalWords.push(result.item);
      setIsChordSyntaxError(false);
    }

    if (finalWords.length === 0) return;

    const { lyrics, chords } = processFinalWordsToSectionItems(finalWords);
    const newSection = { id: 'sec-' + Date.now(), lyrics, chords };

    setSongData(prev => {
      const currentGroups = prev[activeSongId] || [];
      if (currentGroups.length === 0) {
        return { ...prev, [activeSongId]: [{ id: 'g-' + Date.now(), title: 'Verse 1', sections: [newSection] }] };
      }
      return {
        ...prev,
        [activeSongId]: currentGroups.map((g, idx) =>
          idx === currentGroups.length - 1 ? { ...g, sections: [...g.sections, newSection] } : g
        )
      };
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
    } catch (err) { }
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
    } catch (err) { }
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
    } catch (err) { }
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

  const renameSong = (e, folderId, songId, currentTitle) => {
    e.stopPropagation();
    const newTitle = prompt("Enter new song title:", currentTitle);
    if (newTitle && newTitle.trim() !== "") {
      setFolders(folders.map(f => f.id === folderId ? {
        ...f,
        songs: f.songs.map(s => s.id === songId ? { ...s, title: newTitle.trim() } : s)
      } : f));
    }
  };

  const deleteSong = (e, folderId, songId) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this song?")) {
      const updatedFolders = folders.map(f => f.id === folderId ? {
        ...f,
        songs: f.songs.filter(s => s.id !== songId)
      } : f);

      setFolders(updatedFolders);

      setSongData(prev => {
        const newData = { ...prev };
        delete newData[songId];
        return newData;
      });

      if (activeSongId === songId) {
        // Fallback to the first available song
        const firstAvailable = updatedFolders.find(f => f.songs.length > 0)?.songs[0];
        setActiveSongId(firstAvailable ? firstAvailable.id : null);
      }
    }
  };

  let activeSongName = "No Song Selected";
  folders.forEach(f => {
    const song = f.songs.find(s => s.id === activeSongId);
    if (song) activeSongName = song.title;
  });

  const activeGroups = Array.isArray(songData[activeSongId]) ? songData[activeSongId] : [];

  const authModal = showAuthModal && !user && (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`${theme.modalCard} relative w-full max-w-md rounded-3xl border p-6 shadow-2xl md:p-8 ${theme.borderLight}`}>
        <button
          onClick={() => setShowAuthModal(false)}
          className={`absolute right-4 top-4 rounded-full p-2 transition-colors ${isDayMode ? 'hover:bg-gray-200' : 'hover:bg-gray-700'}`}
          title="Close"
        >
          <X size={18} className={theme.subtleText} />
        </button>

        <h3 className={`text-xs font-bold tracking-[0.2em] ${theme.subtleText}`}>SIGN IN</h3>
        <p className={`mt-3 text-sm leading-relaxed ${theme.subtleText}`}>
          Sign in with Google to save your folders, songs, chords, and notes automatically.
        </p>

        <button
          onClick={handleLogin}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-[#4285F4] px-4 py-3.5 text-[13px] font-bold tracking-wide text-white transition-all duration-300 hover:bg-[#3367D6] hover:shadow-lg"
        >
          <svg className="h-5 w-5 rounded-full bg-white p-0.5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          LOGIN WITH GOOGLE
        </button>

        <button
          onClick={continueAsGuest}
          className={`mt-3 w-full rounded-xl border px-4 py-3 text-[12px] font-bold tracking-wider transition ${theme.borderLight} ${theme.card} ${isDayMode ? 'hover:bg-[#f0f0ea]' : 'hover:bg-[#333333]'}`}
        >
          CONTINUE AS GUEST
        </button>
      </div>
    </div>
  );

  if (authChecking) {
    return (
      <div className={`flex h-screen w-full items-center justify-center ${theme.bg} ${theme.text} transition-colors duration-300`}>
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Music size={40} className={`opacity-50 ${theme.accentText} animate-bounce`} />
          <p className={`${theme.subtleText} text-sm font-medium tracking-widest uppercase`}>Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!user && !isGuestMode) {
    return (
      <div className={`relative min-h-[100dvh] w-full overflow-hidden ${theme.bg} ${theme.text} transition-colors duration-300`}>
        <div className={`pointer-events-none absolute -right-20 top-[-120px] h-[360px] w-[360px] rounded-full blur-3xl ${isDayMode ? 'bg-[#c9b800]/15' : 'bg-[#e0d036]/10'}`}></div>
        <div className={`pointer-events-none absolute -left-32 bottom-[-180px] h-[360px] w-[360px] rounded-full blur-3xl ${isDayMode ? 'bg-[#7a6e00]/10' : 'bg-[#ffffff]/5'}`}></div>

        <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col justify-center gap-6 px-4 py-6 sm:px-6 md:gap-8 md:px-10 md:py-10">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 md:gap-8">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 font-bold tracking-tight ${theme.accentText}`}>
                <Music size={24} className="md:h-7 md:w-7" />
                <span className="text-xl md:text-2xl">ChordScribe</span>
              </div>
              <button
                onClick={() => setIsDayMode(!isDayMode)}
                className={`flex h-9 w-9 items-center justify-center rounded-full border ${theme.borderLight} ${theme.card} transition ${isDayMode ? 'hover:bg-[#ecece6]' : 'hover:bg-[#3a3a3a]'}`}
                title={isDayMode ? 'Switch to Night' : 'Switch to Day'}
              >
                {isDayMode ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>

            <div className="space-y-3 md:space-y-5">
              <h1 className="text-3xl font-black leading-tight md:text-6xl">Write your next song.</h1>
              <p className={`max-w-xl text-sm leading-relaxed md:text-lg ${theme.subtleText}`}>
                Arrange lyrics and chords in one clean workspace, then sync everything securely to your account.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
              <div className={`rounded-xl border p-3 md:p-4 ${theme.borderLight} ${theme.card}`}>
                <p className={`text-[11px] font-bold tracking-wider ${theme.subtleText}`}>FAST FLOW</p>
                <p className="mt-1 text-sm font-semibold">Capture ideas quickly</p>
              </div>
              <div className={`rounded-xl border p-3 md:p-4 ${theme.borderLight} ${theme.card}`}>
                <p className={`text-[11px] font-bold tracking-wider ${theme.subtleText}`}>CHORD READY</p>
                <p className="mt-1 text-sm font-semibold">Drag chords with precision</p>
              </div>
              <div className={`rounded-xl border p-3 md:p-4 ${theme.borderLight} ${theme.card}`}>
                <p className={`text-[11px] font-bold tracking-wider ${theme.subtleText}`}>CLOUD SYNC</p>
                <p className="mt-1 text-sm font-semibold">Continue on any device</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={openAuthModal}
                className="w-full rounded-xl bg-[#4285F4] px-4 py-3 text-[12px] font-bold tracking-wider text-white transition hover:bg-[#3367D6]"
              >
                SIGN IN WITH GOOGLE
              </button>
              <button
                onClick={continueAsGuest}
                className={`w-full rounded-xl border px-4 py-3 text-[12px] font-bold tracking-wider transition ${theme.borderLight} ${theme.card} ${isDayMode ? 'hover:bg-[#f0f0ea]' : 'hover:bg-[#333333]'}`}
              >
                CONTINUE AS GUEST
              </button>
            </div>
          </div>
        </div>

        <div className={`relative z-10 pb-4 text-center text-[11px] tracking-wider opacity-60 md:pb-6 md:text-xs ${theme.subtleText}`}>
          Developed by Parkpoom Wisedsri.
        </div>

        {authModal}
      </div>
    );
  }

  return (
    <div className={`flex h-[100dvh] w-full flex-col md:flex-row ${theme.bg} ${theme.text} font-sans overflow-hidden transition-colors duration-300`}>
      <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col md:flex-row">

        {/* --- Left Navigation (30%) - Hidden in Guest Mode --- */}
        {!isGuestMode && (
          <>
            <div
              className={`fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden ${mobileSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              onClick={() => setMobileSidebarOpen(false)}
            ></div>
            <div className={`${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed left-0 top-0 z-40 h-[100dvh] w-[85%] max-w-[340px] md:translate-x-0 md:static md:z-20 md:h-auto md:w-[320px] md:min-w-[300px] md:max-w-[360px] ${theme.sidebar} flex flex-col border-r ${theme.border} shadow-lg transition-transform duration-300`}>
              <div className={`p-5 flex justify-between items-center ${theme.sidebarBorder}`}>
                <h1 className={`text-xl font-bold tracking-tight ${theme.accentText}`}>ChordScribe</h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowManual(true)}
                    className={`p-1.5 rounded transition ${isDayMode ? 'hover:bg-[#dcdcd6]' : 'hover:bg-[#444]'}`}
                    title="How to Use"
                  >
                    <HelpCircle size={18} />
                  </button>
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
                          onClick={() => {
                            setActiveSongId(song.id);
                            setMobileSidebarOpen(false);
                          }}
                          className={`group flex items-center justify-between p-2 rounded cursor-pointer transition ${activeSongId === song.id ? theme.sidebarActive : theme.sidebarHover}`}
                        >
                          <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                            <Music size={16} className="shrink-0" />
                            <span className="text-sm truncate">{song.title}</span>
                          </div>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0 bg-inherit pl-2">
                            <button
                              onClick={(e) => renameSong(e, folder.id, song.id, song.title)}
                              className={`p-1 rounded ${isDayMode ? 'hover:bg-[#dcdcd6]' : 'hover:bg-[#444]'} hover:text-[#e0d036] transition`}
                              title="Rename Song"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={(e) => deleteSong(e, folder.id, song.id)}
                              className={`p-1 rounded ${isDayMode ? 'hover:bg-[#dcdcd6]' : 'hover:bg-[#444]'} hover:text-red-500 transition`}
                              title="Delete Song"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* --- Profile --- */}
              <div className={`p-4 border-t ${theme.borderLight}`}>
                <div className={`flex items-center justify-between`}>
                  <div className="flex items-center gap-2 overflow-hidden mr-2">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full shadow-sm" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#e0d036] flex items-center justify-center text-black font-bold text-sm shrink-0 shadow-sm">
                        {user?.email?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="truncate text-sm font-medium" title={user?.email}>{user?.displayName || user?.email}</div>
                  </div>
                  <button onClick={handleLogout} className={`px-2 py-1.5 text-xs font-semibold rounded border ${theme.borderLight} hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors`}>
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- Right Content (70% or Full Width Centered in Guest Mode) --- */}
        <div className={`flex flex-col relative z-10 flex-1 min-h-0 ${isGuestMode ? 'w-full max-w-4xl mx-auto md:border-x ' + theme.borderLight : 'w-full md:flex-1 md:min-w-0'}`}>

          {/* Header */}
          <div className={`px-4 md:px-8 py-4 md:py-6 border-b ${theme.borderLight} ${theme.header} flex flex-col sm:flex-row justify-between sm:items-center gap-3 z-10`}>
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              {!isGuestMode && (
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className={`md:hidden p-2 rounded ${isDayMode ? 'bg-[#dcdcd6] hover:bg-[#cccccc] text-gray-700' : 'bg-[#444] hover:bg-[#555] text-gray-300'} transition-colors`}
                  title="Open Library"
                >
                  <Menu size={18} />
                </button>
              )}
              <h2 className="text-xl md:text-3xl font-bold tracking-wide truncate">{activeSongName}</h2>
              {!isGuestMode && user && (
                <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-300 ${syncStatus === 'saving' ? (isDayMode ? 'bg-[#c9b800]/20 text-[#7a6e00]' : 'bg-[#e0d036]/20 text-[#e0d036]') : syncStatus === 'error' ? 'bg-red-500/20 text-red-500' : (isDayMode ? 'bg-green-500/20 text-green-700' : 'bg-green-500/20 text-green-400')}`}>
                  {syncStatus === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {syncStatus === 'saved' && <Cloud className="w-3.5 h-3.5" />}
                  {syncStatus === 'error' && <CloudOff className="w-3.5 h-3.5" />}
                  {syncStatus === 'saving' ? 'Saving...' : syncStatus === 'saved' ? 'Saved to Cloud' : 'Sync Error'}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isGuestMode && (
                <>
                  <button
                    onClick={() => setShowManual(true)}
                    className={`p-2 rounded-full ${isDayMode ? 'bg-[#dcdcd6] hover:bg-[#cccccc] text-gray-700' : 'bg-[#444] hover:bg-[#555] text-gray-300'} transition-colors shadow-sm`}
                    title="How to Use"
                  >
                    <HelpCircle size={20} />
                  </button>
                  <button
                    onClick={openAuthModal}
                    className={`px-5 py-2.5 text-sm font-bold uppercase tracking-widest rounded-full bg-[#4285F4] text-white hover:bg-[#3367D6] transition-colors shadow-md`}
                  >
                    Sign In to Save
                  </button>
                </>
              )}
              {!isGuestMode && user && (
                <button
                  onClick={() => setShowNoteModal(true)}
                  className={`p-2 rounded-full ${isDayMode ? 'bg-[#dcdcd6] hover:bg-[#cccccc] text-gray-700' : 'bg-[#444] hover:bg-[#555] text-gray-300'} transition-colors shadow-sm`}
                  title="Quick Note"
                >
                  <FileText size={20} />
                </button>
              )}
            </div>
          </div>

          {/* --- Staging Area & Live Preview --- */}
          <div className={`p-4 md:p-6 pb-2 ${theme.stagingBg} border-b ${theme.border} relative z-40 transition-colors shadow-inner flex-shrink-0`}>
            <div className={`mx-auto w-full max-w-5xl rounded-xl shadow-sm ${theme.stagingCard} border ${theme.stagingBorder} overflow-visible relative z-50 transition-all duration-300`}>

              {/* Top bar with Toggle */}
              <div className="flex items-center gap-3 px-1">
                <div className={`inline-flex items-center rounded-full p-1 border ${theme.stagingBorder} ${isDayMode ? 'bg-[#efefe8]' : 'bg-[#222]'}`}>
                  <button
                    onClick={() => { setIsChordMode(false); setIsChordSyntaxError(false); }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${!isChordMode
                      ? 'bg-[#e0d036] text-black shadow-[0_0_10px_rgba(224,208,54,0.3)]'
                      : isDayMode ? 'text-gray-700 hover:bg-[#d8d8d0]' : 'text-gray-300 hover:bg-[#444]'
                      }`}
                  >
                    <Type size={12} /> LYRIC
                  </button>
                  <button
                    onClick={() => { setIsChordMode(true); setIsChordSyntaxError(false); }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${isChordMode
                      ? 'bg-[#e0d036] text-black shadow-[0_0_10px_rgba(224,208,54,0.3)]'
                      : isDayMode ? 'text-gray-700 hover:bg-[#d8d8d0]' : 'text-gray-300 hover:bg-[#444]'
                      }`}
                  >
                    <Music size={12} strokeWidth={3} /> CHORD
                  </button>
                </div>
                <span className={`text-xs font-mono flex items-center gap-1 ${theme.subtleText}`}>
                  <Edit3 size={12} /> Staging Area
                </span>
              </div>

              <div className="flex items-start gap-3 relative z-50">
                <div
                  className={`flex-1 flex flex-wrap items-center ${theme.stagingInput} p-2 rounded-lg border ${theme.stagingBorder} min-h-[56px] cursor-text relative z-50`}
                  onClick={(e) => {
                    if (e.target.closest('[data-stop-main-focus="true"]')) return;
                    document.getElementById('main-word-input')?.focus();
                  }}
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
                          <div
                            data-stop-main-focus="true"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className={`flex items-center ${theme.chordText} font-bold text-sm relative z-50`}
                          >
                            [<input
                              autoFocus
                              value={chordInputValue}
                              onChange={e => setChordInputValue(normalizeChordInput(e.target.value))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveChord(sw.id);
                                if (e.key === 'Escape') setEditingChordId(null);
                              }}
                              className={`bg-transparent outline-none min-w-[30px] w-auto text-center ${theme.chordText} placeholder-[#888]`}
                              placeholder="C"
                              size={chordInputValue.length || 1}
                            />]

                            {/* Hover/Click Pad for Chords */}
                            <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-3 rounded-xl shadow-2xl border ${isDayMode ? 'bg-white border-gray-300' : 'bg-[#2a2a2a] border-[#555]'} flex flex-col gap-2 cursor-default animate-in fade-in zoom-in-95 duration-100 z-[9999]`}>
                              <div className="flex justify-between items-center mb-1">
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${theme.subtleText}`}>Chord Pad</span>
                                <div className="flex gap-2">
                                  <button
                                    onMouseDown={(e) => { e.preventDefault(); setChordInputValue(''); }}
                                    onClick={(e) => { e.stopPropagation(); saveChord(sw.id); }}
                                    className="text-xs text-red-500 hover:text-red-400 font-bold px-1"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>

                              <input
                                value={chordInputValue}
                                onMouseDown={(e) => e.stopPropagation()}
                                onChange={(e) => setChordInputValue(normalizeChordInput(e.target.value))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveChord(sw.id);
                                }}
                                placeholder="Type root chord (e.g. F#, Bb, Cmaj7)"
                                className={`w-full px-2 py-1.5 text-xs rounded border ${isDayMode ? 'border-gray-300 bg-white text-black' : 'border-[#555] bg-[#1f1f1f] text-white'} outline-none`}
                              />

                              <div className="grid grid-cols-4 gap-1.5">
                                {['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map(root => (
                                  <button
                                    key={root}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => { e.stopPropagation(); setChordInputValue(root); }}
                                    className={`py-1.5 text-xs font-bold rounded border ${isDayMode ? 'border-gray-200 bg-gray-50 text-black hover:bg-[#e0d036] hover:border-[#e0d036]' : 'border-[#444] bg-[#333] text-white hover:bg-[#e0d036] hover:text-black'} transition-colors`}
                                  >
                                    {root}
                                  </button>
                                ))}
                              </div>

                              <div className="grid grid-cols-3 gap-1.5 mt-1 border-t border-dashed border-gray-300 dark:border-[#444] pt-2">
                                {['m', 'maj', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug'].map(ext => (
                                  <button
                                    key={ext}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      let current = chordInputValue;
                                      const match = current.match(/^[A-G][b#]?/i);
                                      if (match) {
                                        setChordInputValue(normalizeChordInput(match[0].toUpperCase() + ext));
                                      } else {
                                        setChordInputValue(normalizeChordInput(current + ext));
                                      }
                                    }}
                                    className={`py-1 text-[11px] font-medium rounded border ${isDayMode ? 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-200' : 'border-[#444] bg-[#333] text-gray-300 hover:bg-[#444]'} transition-colors`}
                                  >
                                    {ext}
                                  </button>
                                ))}
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={(e) => { e.stopPropagation(); setEditingChordId(null); }}
                                  className={`px-2 py-1 text-[11px] rounded border ${isDayMode ? 'border-gray-300 text-gray-700 hover:bg-gray-100' : 'border-[#555] text-gray-300 hover:bg-[#333]'}`}
                                >
                                  Cancel
                                </button>
                                <button
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={(e) => { e.stopPropagation(); saveChord(sw.id); }}
                                  className="px-2 py-1 text-[11px] rounded bg-[#e0d036] text-black font-bold hover:bg-yellow-400"
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
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
                    onChange={e => applyMainInputValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    onPaste={handlePaste}
                    placeholder={stagedWords.length === 0 ? (isChordMode ? "Type chords (e.g. C Am F) and press Space..." : "Paste lyrics or type space to separate... ('x' for gap)") : ""}
                    className={`bg-transparent text-sm font-mono ${theme.subtleText} outline-none flex-1 min-w-[140px] md:min-w-[250px] ml-2 py-1 placeholder-[#999]`}
                  />
                </div>

                <button
                  onClick={submitSection}
                  disabled={stagedWords.length === 0 && !inputValue.trim()}
                  className={`p-3 rounded-lg flex items-center justify-center transition-all h-[56px] w-[56px] ${stagedWords.length > 0 || inputValue.trim()
                    ? 'bg-[#e0d036] text-black hover:bg-yellow-400 shadow-[0_0_15px_rgba(224,208,54,0.3)]'
                    : 'bg-[#444] text-gray-500 cursor-not-allowed'
                    }`}
                >
                  <Check size={24} strokeWidth={3} />
                </button>
              </div>
              {isChordMode && isChordSyntaxError && (
                <p className="px-2 text-xs text-red-500 font-medium">Invalid chord format. Example: C, F#, Bb, Am, Cmaj7, D/F#</p>
              )}
            </div>

            {/* Live Preview of Input (Mirrors what the section will look like) */}
            {(stagedWords.length > 0 || inputValue.trim() || isChordSyntaxError) && (
              <div className="mt-4">
                <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${theme.subtleText} ml-1 flex items-center gap-2`}>
                  <Eye size={14} /> Live Preview
                </p>
                <div className={`${theme.card} rounded-md shadow-md overflow-hidden border-l-4 border-[#e0d036] relative flex opacity-80 pointer-events-none`}>
                  <div className={`w-6 ${theme.dragHandle} flex items-center justify-center ${theme.subtleText} border-r ${theme.borderLight}`}>
                    <GripVertical size={14} />
                  </div>
                  <div className={`flex-1 overflow-x-auto overscroll-x-contain relative py-3 px-3 touch-pan-x`}>
                    <div className={`grid grid-cols-[repeat(32,minmax(0,1.5rem))] min-w-[760px] md:min-w-[680px] lg:min-w-0 w-full relative group/grid`}>
                      {Array.from({ length: 32 }).map((_, i) => {
                        // Dynamically compute preview sections
                        let currentStaged = [...stagedWords];

                        if (inputValue.trim()) {
                          const result = processInputWord(inputValue.trim(), isChordMode, 'preview');
                          if (!result.error) {
                            currentStaged.push(result.item);
                          }
                        }

                        const { lyrics: previewLyrics, chords: previewChords } = processFinalWordsToSectionItems(currentStaged, 'prev');

                        const chordsHere = previewChords.filter(c => c.pos === i);
                        const lyricsHere = previewLyrics.filter(l => l.pos === i);
                        const isChordOnlySection = currentStaged.every(w => w.word.toLowerCase() === 'x');

                        return (
                          <div key={`prev-${i}`} className="border-l border-white/5 flex flex-col items-start justify-start relative">
                            {/* Chords */}
                            <div className="h-8 w-full relative z-20">
                              {chordsHere.map(chord => (
                                <div key={chord.id} className={`absolute left-0 top-1/2 -translate-y-1/2 font-bold text-xs ${theme.accent} text-black px-1 py-0 rounded shadow-sm whitespace-nowrap z-30`}>
                                  {chord.text}
                                </div>
                              ))}
                            </div>

                            {/* Lyrics */}
                            {!isChordOnlySection && (
                              <div className="h-8 w-full relative z-10">
                                {lyricsHere.map(lyric => (
                                  <span key={lyric.id} className={`absolute left-0 top-1/2 -translate-y-1/2 text-base font-medium tracking-wide leading-tight px-0.5 font-mono ${theme.lyricText} whitespace-nowrap`}>
                                    {lyric.isX ? <span className="text-gray-400 opacity-50">-</span> : lyric.text}
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
              </div>
            )}
          </div>

          {/* --- Sections Area (Groups with Dot Grid) --- */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 relative">
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
                    <div className="flex-1 p-4 space-y-4 md:space-y-3 relative z-10">
                      {(Array.isArray(group.sections) ? group.sections : []).map((section) => {
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

                            <div className={`flex-1 overflow-x-auto overscroll-x-contain relative ${isChordOnlySection ? 'py-2 px-3' : 'p-3 pt-4'} touch-pan-x`}>
                              <div className={`grid grid-cols-[repeat(32,minmax(0,1.5rem))] min-w-[760px] md:min-w-[680px] lg:min-w-0 w-full relative group/grid ${isChordOnlySection ? '' : 'mb-1.5'}`}>
                                {Array.from({ length: 32 }).map((_, i) => {
                                  const sectionChords = Array.isArray(section.chords) ? section.chords : [];
                                  const sectionLyrics = Array.isArray(section.lyrics) ? section.lyrics : [];
                                  const chordsHere = sectionChords.filter(c => c.pos === i);
                                  const lyricsHere = sectionLyrics.filter(l => l.pos === i);

                                  return (
                                    <div
                                      key={i}
                                      className="border-l border-white/5 flex flex-col items-start justify-start relative hover:bg-white/10 transition-colors"
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={(e) => handleChordDrop(e, group.id, section.id, i)}
                                    >
                                      {/* Chords */}
                                      <div className="h-10 w-full relative z-20">
                                        {chordsHere.map(chord => (
                                          <div
                                            key={chord.id}
                                            draggable
                                            onDragStart={(e) => handleDragStartChord(e, group.id, section.id, chord)}
                                            className={`absolute left-0 top-0.5 font-bold text-xs ${theme.accent} text-black rounded shadow-sm whitespace-nowrap group/chord cursor-grab active:cursor-grabbing z-30 flex flex-col items-center`}
                                          >
                                            <span className="px-1 py-0 leading-tight">{chord.text}</span>
                                            <div className="flex items-center gap-0.5 mt-0.5 opacity-0 group-hover/chord:opacity-100 transition-all">
                                              <button
                                                onClick={(e) => { e.stopPropagation(); moveChord(group.id, section.id, chord.id, -1); }}
                                                className="h-3.5 w-3.5 bg-[#222] text-white rounded flex items-center justify-center hover:bg-white hover:text-black transition-colors"
                                              >
                                                <ChevronLeft size={9} />
                                              </button>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); moveChord(group.id, section.id, chord.id, 1); }}
                                                className="h-3.5 w-3.5 bg-[#222] text-white rounded flex items-center justify-center hover:bg-white hover:text-black transition-colors"
                                              >
                                                <ChevronRight size={9} />
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Lyrics */}
                                      {!isChordOnlySection && (
                                        <div className="h-8 w-full relative z-10">
                                          {lyricsHere.map(lyric => (
                                            <span
                                              key={lyric.id}
                                              className={`absolute left-0 top-1/2 -translate-y-1/2 text-base font-medium tracking-wide leading-tight px-0.5 font-mono ${theme.lyricText} whitespace-nowrap`}
                                            >
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
                        )
                      })}
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

        </div>
      </div>

      {/* --- MODALS MOVED TO ROOT TO FIX Z-INDEX OVERLAP --- */}
      {authModal}

      {/* --- Custom Confirm Modal --- */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
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

      {/* --- Manual Pop Up (How to use) --- */}
      {showManual && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className={`${theme.modalCard} p-8 rounded-2xl shadow-2xl border ${theme.border} max-w-2xl w-full mx-4 flex flex-col relative`}>
            <button
              onClick={() => setShowManual(false)}
              className={`absolute top-4 right-4 p-2 rounded-full ${isDayMode ? 'hover:bg-gray-200' : 'hover:bg-gray-700'} transition-colors`}
            >
              <X size={20} className={theme.subtleText} />
            </button>

            <div className={`flex items-center gap-3 mb-6 ${theme.accentText}`}>
              <HelpCircle size={32} />
              <h2 className="text-3xl font-extrabold tracking-tight">How to use ChordScribe</h2>
            </div>

            <div className={`space-y-4 mb-8 ${theme.text} text-sm leading-relaxed overflow-y-auto max-h-[60vh] pr-2`}>
              <div className={`p-4 rounded-xl border ${theme.borderLight} ${isDayMode ? 'bg-gray-50' : 'bg-[#2a2a2a]'}`}>
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Type size={16} /> 1. Lyric Mode & Quick Syntax</h3>
                <p className={`${theme.subtleText} mb-3`}>Select <strong>LYRIC MODE</strong> to type naturally and space out syllables. You can also paste lyrics directly into the box with inline chords right next to the words using brackets! The app will automatically separate the chord and snap it tightly above the right syllable.</p>

                <div className={`p-3 rounded-lg border ${theme.borderLight} ${isDayMode ? 'bg-[#e8e8e2]' : 'bg-[#1f1f1f]'} font-mono text-xs overflow-x-auto`}>
                  <p className="font-bold mb-1 opacity-70">Example Input Format:</p>
                  <p className={theme.chordText}>[C]Jin-gle <span className={theme.text}>bells</span> [Am]jin-gle <span className={theme.text}>bells...</span></p>
                </div>
              </div>

              <div className={`p-4 rounded-xl border ${theme.borderLight} ${isDayMode ? 'bg-gray-50' : 'bg-[#2a2a2a]'}`}>
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Music size={16} /> 2. Chord Mode & Editing</h3>
                <p className={theme.subtleText}>Switch to <strong>CHORD MODE</strong> to sequence progressions quickly. Type a chord name (e.g., C, Am) and hit <code>Spacebar</code> to generate an empty gap block designated for that chord. You can also click on any chord to open the <strong>Chord Pad</strong> for quick, precise modifications (e.g. maj7, sus4).</p>
              </div>

              <div className={`p-4 rounded-xl border ${theme.borderLight} ${isDayMode ? 'bg-gray-50' : 'bg-[#2a2a2a]'}`}>
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><GripVertical size={16} /> 3. Visual Timeline Grid</h3>
                <p className={theme.subtleText}>Everything snaps to a fluid 32-slot visual grid. <strong>Drag and drop</strong> individual parts to rearrange your song structure. You can drag chords left or right to re-align them precisely with specific lyric beats, pushing other chords over fluidly if needed.</p>
              </div>
            </div>

            <button
              onClick={() => setShowManual(false)}
              className={`w-full py-4 rounded-xl font-bold tracking-widest text-sm ${isDayMode ? 'bg-[#1a1a1a] text-[#f5f5f0] hover:bg-[#333]' : 'bg-[#e0d036] text-[#1a1a1a] hover:bg-[#c9b800]'} transition-colors duration-300 shadow-lg`}
            >
              GOT IT, LET'S COMPOSE!
            </button>
          </div>
        </div>
      )}

      {/* --- Quick Note Modal --- */}
      {showNoteModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${theme.modalCard} p-6 rounded-xl shadow-2xl border ${theme.border} max-w-lg w-full mx-4 flex flex-col relative`}>
            <button
              onClick={() => setShowNoteModal(false)}
              className={`absolute top-4 right-4 p-2 rounded-full ${isDayMode ? 'hover:bg-gray-200' : 'hover:bg-gray-700'} transition-colors`}
            >
              <X size={20} className={theme.subtleText} />
            </button>

            <div className={`flex items-center gap-3 mb-4 ${theme.accentText}`}>
              <FileText size={24} />
              <h3 className="text-xl font-bold">Quick Note</h3>
            </div>
            <p className={`text-sm mb-4 ${theme.subtleText}`}>Add plain text notes or ideas specifically for <strong>{activeSongName}</strong>.</p>

            <textarea
              value={notes[activeSongId] || ''}
              onChange={(e) => setNotes(prev => ({ ...prev, [activeSongId]: e.target.value }))}
              className={`w-full h-48 p-4 rounded-xl border ${theme.border} ${isDayMode ? 'bg-[#f9f9f9]' : 'bg-[#1f1f1f]'} text-sm ${theme.text} resize-none focus:outline-none focus:ring-2 focus:ring-opacity-50 ${isDayMode ? 'focus:ring-[#c9b800]' : 'focus:ring-[#e0d036]'}`}
              placeholder="Type your notes here..."
            />

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowNoteModal(false)}
                className={`px-6 py-2 rounded-xl font-bold tracking-widest text-sm ${isDayMode ? 'bg-[#1a1a1a] text-[#f5f5f0] hover:bg-[#333]' : 'bg-[#e0d036] text-[#1a1a1a] hover:bg-[#c9b800]'} transition-colors duration-300 shadow-lg`}
              >
                SAVE & CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
