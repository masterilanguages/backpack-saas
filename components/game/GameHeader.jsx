"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Clock, LogOut, UserPlus, X, Loader2, BookOpen } from "lucide-react";
import { useNavigate, createPageUrl } from "@/lib/router-compat";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 as base44Client } from "@/api/base44Client";
const base44 = base44Client;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const GameHeader = React.memo(function GameHeader({ profile, coins, onBuyCoins }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [orderedNav, setOrderedNav] = useState([]);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const longPressTimer = useRef(null);
  const isDraggingRef = useRef(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviting, setInviting] = useState(false);
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const stopwatchRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const inactivityCheckRef = useRef(null);
  const INACTIVITY_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
    // Auto-start clock on sign-in
    setStopwatchRunning(true);
  }, []);

  const languageFlags = {
    hebrew: '🇮🇱', english: '🇺🇸', spanish: '🇪🇸',
    french: '🇫🇷', portuguese: '🇵🇹', italian: '🇮🇹'
  };
  const languageNames = {
    hebrew: 'Hebrew', english: 'English', spanish: 'Spanish',
    french: 'French', portuguese: 'Portuguese', italian: 'Italian'
  };

  const updateProfileMutation = useMutation({
    mutationFn: (data) => base44.entities.UserProfile.update(profile?.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userProfile'] }),
  });

  const changeLanguageMutation = useMutation({
    mutationFn: (newLanguage) => base44.entities.UserProfile.update(profile?.id, { language: newLanguage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.removeQueries({ queryKey: ['days'] });
      toast.success("Language updated!");
      setShowMenu(false);
    },
  });

  // Save session to DB
  // Only saves if >= 60 seconds; only marks completed if >= 30 min
  const saveSession = async (seconds, reason) => {
    if (seconds < 60) return; // ignore tiny blips under 1 min
    const exactMinutes = seconds / 60;
    const minutes = Math.round(exactMinutes); // duration_minutes is an INTEGER column — must be whole
    const completed = exactMinutes >= 30;
    const date = new Date().toISOString().split('T')[0];
    try {
      await base44.entities.StudySession.create({ date, duration_minutes: minutes, stopped_reason: reason, completed });
      if (completed) {
        toast.success(`✅ Session completed! ${minutes} min saved.`);
      } else {
        toast.info(`Session paused at ${minutes} min (need 30 min to count as completed).`);
      }
    } catch (e) {
      console.error('Failed to save session', e);
      toast.error('Could not save your study session.');
    }
  };

  // Stopwatch
  useEffect(() => {
    if (stopwatchRunning) {
      stopwatchRef.current = setInterval(() => setStopwatchTime(t => t + 1), 1000);
    } else {
      clearInterval(stopwatchRef.current);
    }
    return () => clearInterval(stopwatchRef.current);
  }, [stopwatchRunning]);

  // Inactivity detection — stop clock after 5 min of no activity
  useEffect(() => {
    const handleActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);

    inactivityCheckRef.current = setInterval(() => {
      if (stopwatchRunning && Date.now() - lastActivityRef.current > INACTIVITY_LIMIT_MS) {
        setStopwatchRunning(false);
        setStopwatchTime(prev => { saveSession(prev, 'inactivity'); return 0; });
      }
    }, 30000); // check every 30s

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      clearInterval(inactivityCheckRef.current);
    };
  }, [stopwatchRunning]);

  // Build nav items (must be before useEffect that uses them)
  const baseNavItems = [
    { id: "home", to: "Home", emoji: "🏠", label: "Home" },
    { id: "schedule", to: "Home", emoji: "📅", label: "Schedule" },
    { id: "backpack", to: "Backpack", emoji: "🎒", label: "Backpack" },
    { id: "videos", to: "MediaLibrary", emoji: "📚", label: "Library" },
    { id: "journal", to: "Journal", emoji: "📖", label: "Journal" },
  ];

  const validNavIds = ["home", "schedule", "backpack", "videos", "journal", "clock"];
  const getSavedOrder = () => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(localStorage.getItem('nav_order') || '[]');
      // If saved order contains stale ids, reset it
      const hasStale = saved.some(id => !validNavIds.includes(id));
      if (hasStale) { localStorage.removeItem('nav_order'); return []; }
      return saved;
    } catch { return []; }
  };

  const getSortedNavItems = (items) => {
    const savedOrder = getSavedOrder();
    if (!savedOrder.length) return items;
    return [...items].sort((a, b) => {
      const ai = savedOrder.indexOf(a.id);
      const bi = savedOrder.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  };

  useEffect(() => {
    if (profile?.language) setOrderedNav(getSortedNavItems(baseNavItems));
  }, [currentUser?.role, profile?.language]);

  // Timer
  useEffect(() => {
    if (!profile?.session_start || !profile?.session_duration) {
      setTimeRemaining(0);
      return;
    }
    if (profile.session_paused) {
      const startTime = new Date(profile.session_start).getTime();
      const durationMs = profile.session_duration * 60 * 1000;
      const pausedAt = new Date(profile.session_paused_at).getTime();
      const pausedTotal = (profile.session_paused_total || 0) * 1000;
      const endTime = startTime + durationMs + pausedTotal;
      setTimeRemaining(Math.max(0, Math.floor((endTime - pausedAt) / 1000)));
      return;
    }
    const updateTimer = () => {
      const startTime = new Date(profile.session_start).getTime();
      const durationMs = profile.session_duration * 60 * 1000;
      const pausedTotal = (profile.session_paused_total || 0) * 1000;
      const endTime = startTime + durationMs + pausedTotal;
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeRemaining(remaining);
      if (remaining === 0 && profile.session_start) toast.info("Session time expired!");
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [profile?.session_start, profile?.session_duration, profile?.session_paused, profile?.session_paused_at, profile?.session_paused_total]);

  const startSession = (minutes) => {
    updateProfileMutation.mutate({ session_start: new Date().toISOString(), session_duration: minutes });
    toast.success(`${minutes} min session started!`);
  };

  const endSession = () => {
    updateProfileMutation.mutate({ session_start: null, session_duration: null, session_paused: false, session_paused_at: null, session_paused_total: 0 });
    toast.success("Session ended");
  };

  const togglePause = () => {
    if (profile.session_paused) {
      const pausedAt = new Date(profile.session_paused_at).getTime();
      const newTotal = (profile.session_paused_total || 0) + Math.floor((Date.now() - pausedAt) / 1000);
      updateProfileMutation.mutate({ session_paused: false, session_paused_at: null, session_paused_total: newTotal });
      toast.success("Session resumed");
    } else {
      updateProfileMutation.mutate({ session_paused: true, session_paused_at: new Date().toISOString() });
      toast.info("Session paused");
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLogout = async () => {
    await base44.auth.logout();
    window.location.href = '/';
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail.trim(), inviteRole);
      toast.success(`Invitation sent to ${inviteEmail}! They'll receive an email to set their password.`);
      setInviteEmail("");
      setInviteRole("user");
      setShowInviteDialog(false);
    } catch (e) {
      toast.error(e?.message || "Failed to send invite");
    }
    setInviting(false);
  };

  // Drag handlers
  const handleDragStart = (e, id) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
    isDraggingRef.current = true;
  };
  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (!draggingId || draggingId === id) return;
    setDragOverId(id);
    setOrderedNav(prev => {
      const from = prev.findIndex(n => n.id === draggingId);
      const to = prev.findIndex(n => n.id === id);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
    isDraggingRef.current = false;
    if (typeof window !== "undefined") {
      localStorage.setItem('nav_order', JSON.stringify(orderedNav.map(n => n.id)));
    }
  };

  const sessionActive = profile?.session_start && profile?.session_duration;

  if (!profile?.language) return null;

  return (
    <>
    <div style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', borderBottom: '1px solid rgba(150,120,255,0.2)' }} className="backdrop-blur-xl">
      {/* Top row */}
      <div className="flex items-center justify-between max-w-7xl mx-auto px-4 py-2">
        {/* Language selector */}
        <div className="relative flex-shrink-0">
          <motion.button
            onClick={() => setShowMenu(!showMenu)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer"
            style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)' }}
          >
            <span className="text-xl">{languageFlags[profile?.language] || '🌍'}</span>
            <span className="font-semibold text-sm" style={{ color: '#93C5FD', fontFamily: 'Jost, sans-serif', letterSpacing: '0.03em' }}>{languageNames[profile?.language] || 'Language'}</span>
          </motion.button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 mt-2 z-50 rounded-xl shadow-2xl overflow-hidden min-w-[200px]"
                style={{ background: '#0D1F3C', border: '1px solid rgba(96,165,250,0.2)' }}
              >
                <div className="p-2">
                  <div className="px-3 py-2 text-xs font-medium border-b" style={{ color: '#60A5FA', borderColor: 'rgba(96,165,250,0.15)', fontFamily: 'Jost, sans-serif', letterSpacing: '0.05em' }}>
                    Learning Language
                  </div>
                  <div className="space-y-1 mt-2">
                    {Object.keys(languageFlags).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => changeLanguageMutation.mutate(lang)}
                        disabled={changeLanguageMutation.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                        style={profile?.language === lang ? { background: 'rgba(96,165,250,0.12)', color: '#BFDBFE' } : { color: '#64748B' }}
                      >
                        <span className="text-xl">{languageFlags[lang]}</span>
                        <span className="text-sm font-medium" style={{ color: 'inherit', fontFamily: 'Jost, sans-serif' }}>{languageNames[lang]}</span>
                        {profile?.language === lang && <span className="ml-auto text-xs">✓</span>}
                      </button>
                    ))}
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Brand */}
        <div className="text-center flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-start leading-none">
              <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500, fontSize: '1.1rem', letterSpacing: '0.25em', color: '#D4AF6A', lineHeight: 1 }}>MASTERI</span>
              <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: '0.6rem', letterSpacing: '0.35em', color: '#A89050', lineHeight: 1.4, borderTop: '1px solid rgba(212,175,106,0.4)', paddingTop: '2px', marginTop: '2px', width: '100%', textAlign: 'center' }}>LANGUAGES</span>
            </div>
          </div>
        </div>

        {/* Streak + Clock + Logout */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <motion.div whileHover={{ scale: 1.05 }} className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
            <Flame className="w-4 h-4" style={{ color: '#F59E0B' }} />
            <span className="text-xs font-bold" style={{ color: '#93C5FD', fontFamily: 'Jost, sans-serif' }}>{profile?.daily_streak || 0}</span>
          </motion.div>

          {(currentUser?.role === 'admin' || currentUser?.role === 'coach') && (
            <div className="flex items-center gap-1">
              <motion.button onClick={() => navigate(createPageUrl("ManageCoaches"))} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <span className="font-bold text-xs" style={{ color: '#93C5FD', fontFamily: 'Jost, sans-serif' }}>⚙️ Admin</span>
              </motion.button>

            </div>
          )}

          <motion.button onClick={handleLogout} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5', fontFamily: 'Jost, sans-serif' }}>
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </motion.button>

          {/* Clock */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setStopwatchRunning(r => {
                if (r) {
                  setStopwatchTime(prev => { saveSession(prev, 'manual'); return 0; });
                } else {
                  lastActivityRef.current = Date.now();
                }
                return !r;
              });
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer"
            style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}
          >
            <span className="text-sm">{stopwatchRunning ? '⏱️' : '🕐'}</span>
            <span className="text-xs font-bold" style={{ color: stopwatchRunning ? '#60A5FA' : '#93C5FD', fontFamily: 'Jost, sans-serif' }}>{formatTime(stopwatchTime)}</span>
          </motion.button>
        </div>
      </div>

      {/* Nav grid */}
      <div style={{ borderTop: '1px solid rgba(96,165,250,0.1)' }} className="px-4 py-2">
        <div className="grid grid-cols-6 gap-1.5 max-w-2xl mx-auto">
          {orderedNav.map(({ id, to, emoji, label }) => {
            const isDragging = draggingId === id;
            const isOver = dragOverId === id && !isDragging;

            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => handleDragStart(e, id)}
                onDragOver={(e) => handleDragOver(e, id)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (isDraggingRef.current) return;
                  navigate(createPageUrl(to));
                }}
                className="flex flex-col items-center py-2 rounded-xl select-none transition-all"
                style={{
                  background: isDragging ? 'rgba(96,165,250,0.05)' : isOver ? 'rgba(96,165,250,0.15)' : 'rgba(96,165,250,0.05)',
                  border: `1px solid ${isDragging ? 'rgba(96,165,250,0.3)' : isOver ? 'rgba(96,165,250,0.4)' : 'rgba(96,165,250,0.12)'}`,
                  cursor: 'pointer',
                  opacity: isDragging ? 0.35 : 1,
                  transform: isOver ? 'scale(1.05)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                }}
              >
                <span className="text-lg">{emoji}</span>
                <span className="text-xs font-medium mt-0.5" style={{ color: '#93C5FD', fontFamily: 'Jost, sans-serif', letterSpacing: '0.03em' }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {/* Invite User Dialog */}
    <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
      <DialogContent className="max-w-sm" style={{ background: '#0D1F3C', border: '1px solid rgba(96,165,250,0.2)' }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#BFDBFE', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1.2rem' }}>
            Invite a Student
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm mb-4" style={{ color: '#64748B' }}>
          They'll receive an email with a link to set their password and access their personal learning portal.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#93C5FD', fontFamily: 'Jost, sans-serif' }}>Email address</label>
            <Input
              type="email"
              placeholder="student@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              className="border-blue-800 bg-blue-950/50 text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: '#93C5FD', fontFamily: 'Jost, sans-serif' }}>Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full h-9 rounded-md border px-3 text-sm"
              style={{ background: '#0A1628', borderColor: 'rgba(96,165,250,0.3)', color: '#BFDBFE' }}
            >
              <option value="user">Student</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button
            onClick={handleInvite}
            disabled={!inviteEmail.trim() || inviting}
            className="w-full"
            style={{ background: 'linear-gradient(135deg, #2563EB, #60A5FA)', color: 'white' }}
          >
            {inviting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><UserPlus className="w-4 h-4 mr-2" />Send Invitation</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
});

export default GameHeader;
