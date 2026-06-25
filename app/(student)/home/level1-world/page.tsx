"use client";

import React, { useState, useEffect } from "react";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Home as HomeIcon, Rabbit, Zap, Heart, Play, Star } from "lucide-react";
import { Link, createPageUrl } from "@/lib/router-compat";
import { toast } from "sonner";
import GameHeader from "@/components/dashboard/GameHeader";

const zones: any[] = [
  {
    id: "home",
    name: "Home",
    icon: HomeIcon,
    gradient: "from-blue-500 to-cyan-500",
    words: ["אמא", "אבא", "בית", "מים", "אוכל"],
    description: "Learn family and home words",
    color: "blue",
  },
  {
    id: "animals",
    name: "Animals",
    icon: Rabbit,
    gradient: "from-green-500 to-emerald-500",
    words: ["כלב", "חתול", "ציפור"],
    description: "Meet friendly animals",
    color: "green",
  },
  {
    id: "actions",
    name: "Actions",
    icon: Zap,
    gradient: "from-amber-500 to-orange-500",
    words: ["בא", "הולך", "אוכל", "יושב"],
    description: "Make your avatar move",
    color: "amber",
  },
  {
    id: "feelings",
    name: "Feelings",
    icon: Heart,
    gradient: "from-pink-500 to-rose-500",
    words: ["שמח", "עייף", "רעב"],
    description: "Help express emotions",
    color: "pink",
  },
];

export default function Level1World() {
  const queryClient = useQueryClient();
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const [sessionEnding, setSessionEnding] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Get current user for owner-scoped reads/writes
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
  });

  const { data: userCoins } = useQuery({
    queryKey: ['userCoins', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return { coins: 0 };
      const coins = await base44.entities.UserCoins.filter({ created_by: currentUser.email });
      if (coins.length === 0) {
        return await base44.entities.UserCoins.create({ coins: 100000000 });
      }
      return coins[0];
    },
    enabled: !!currentUser?.email,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => base44.entities.UserProfile.update(userProfile?.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userProfile'] }),
  });



  const handleZoneComplete = async (xpEarned = 5) => {
    // Save progress silently
    const currentXp = userProfile?.xp || 0;
    await updateProfileMutation.mutateAsync({
      xp: currentXp + xpEarned,
      last_active_date: new Date().toISOString().split('T')[0]
    });

    toast.success("Nice! 🎉", {
      description: `+${xpEarned} XP`
    });
  };

  const handleZoneSelect = (zone: any) => {
    setSelectedZone(zone);
    toast.success(`Welcome to ${zone.name}! 🎉`);
  };

  const handleZoneExit = async () => {
    setSelectedZone(null);
    await handleZoneComplete(5);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <GameHeader profile={userProfile} coins={userCoins?.coins} onBuyCoins={() => {}} />



      <div className="max-w-4xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {!selectedZone ? (
            <motion.div
              key="zone-selector"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center gap-4 mb-8">
                <Link to={createPageUrl("Home")} className="text-white/60 hover:text-white">
                  <ArrowLeft className="w-6 h-6" />
                </Link>
                <div>
                  <h1 className="text-3xl font-bold text-white">Level 1 World</h1>
                  <p className="text-white/60">Choose a zone to play</p>
                </div>
              </div>

              {/* Avatar Status */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6 text-center">
                <div className="text-6xl mb-3">👶</div>
                <p className="text-white font-bold text-lg">{userProfile?.avatar_name || 'Baby'} is ready to learn!</p>
                <div className="flex gap-4 justify-center mt-4">
                  <div className="text-center">
                    <div className="w-16 h-2 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: '30%' }} />
                    </div>
                    <p className="text-white/60 text-xs mt-1">🎧 Listening</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-2 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-400 to-pink-500" style={{ width: '20%' }} />
                    </div>
                    <p className="text-white/60 text-xs mt-1">💬 Speaking</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-2 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-rose-400 to-red-500" style={{ width: '40%' }} />
                    </div>
                    <p className="text-white/60 text-xs mt-1">❤️ Confidence</p>
                  </div>
                </div>
              </div>

              {/* Zone Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {zones.map((zone, idx) => {
                  const Icon = zone.icon;
                  return (
                    <motion.button
                      key={zone.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      whileHover={{ scale: 1.05, y: -5 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleZoneSelect(zone)}
                      className={`bg-gradient-to-br ${zone.gradient} rounded-2xl p-6 text-left border-2 border-white/20 hover:border-white/50 transition-all relative overflow-hidden`}
                    >
                      <motion.div
                        className="absolute inset-0 bg-white/10"
                        animate={{ opacity: [0, 0.2, 0] }}
                        transition={{ duration: 2, repeat: Infinity, delay: idx * 0.3 }}
                      />
                      <Icon className="w-12 h-12 text-white mb-3" />
                      <h3 className="text-white font-bold text-xl mb-2">{zone.name}</h3>
                      <p className="text-white/80 text-sm mb-3">{zone.description}</p>
                      <div className="flex items-center gap-2 text-white/60 text-xs">
                        <Star className="w-3 h-3" />
                        <span>{zone.words.length} words</span>
                      </div>
                      <div className="absolute bottom-4 right-4">
                        <Play className="w-8 h-8 text-white/40" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <div className="mt-6 text-center">
                <p className="text-white/40 text-sm">✨ All zones are replayable anytime</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="zone-content"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              <button
                onClick={handleZoneExit}
                className="mb-6 text-white/60 hover:text-white flex items-center gap-2 mx-auto"
              >
                <ArrowLeft className="w-4 h-4" /> Back to zones
              </button>

              <div className={`bg-gradient-to-br ${selectedZone.gradient} rounded-3xl p-12 text-white border-4 border-white/20`}>
                {React.createElement(selectedZone.icon, { className: "w-20 h-20 mx-auto mb-4" })}
                <h2 className="text-4xl font-bold mb-3">{selectedZone.name}</h2>
                <p className="text-white/90 mb-6">{selectedZone.description}</p>

                <div className="bg-black/20 rounded-xl p-6 max-w-md mx-auto">
                  <p className="text-white/80 mb-4">Words in this zone:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {selectedZone.words.map((word: string, idx: number) => (
                      <span key={idx} className="bg-white/20 px-3 py-1 rounded-full text-sm" dir="rtl">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-white/60 text-sm">🎮 Zone activities coming soon...</p>
                  <p className="text-white/40 text-xs mt-2">This zone will have interactive games and activities</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
