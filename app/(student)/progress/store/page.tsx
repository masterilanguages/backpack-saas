"use client";

import React, { useState, useEffect } from "react";
import { base44 as base44Client } from "@/api/base44Client";
// base44Client is a JS shim whose `entities` are built dynamically, so TS can't
// see entity keys. Cast to `any` for ergonomic access — the runtime shape is
// guaranteed by the shim.
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Coins, Lock, Check, ArrowLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { toast } from "sonner";
import GameHeader from "@/components/home/GameHeader";
import AvatarDisplay from "@/components/home/AvatarDisplay";

const storeItems = [
  { id: "diaper", name: "Diapers", emoji: "🩲", price: 50, category: "baby" },
  { id: "glasses", name: "Glasses", emoji: "👓", price: 80, category: "accessories" },
  { id: "sunglasses", name: "Sunglasses", emoji: "🕶️", price: 120, category: "accessories" },
  { id: "hat", name: "Cool Hat", emoji: "🎩", price: 150, category: "accessories" },
  { id: "cap", name: "Baseball Cap", emoji: "🧢", price: 100, category: "accessories" },
  { id: "backpack", name: "Backpack", emoji: "🎒", price: 120, category: "accessories" },
  { id: "tennis_racquet", name: "Tennis Racquet", emoji: "🎾", price: 100, category: "sports" },
  { id: "soccer_ball", name: "Soccer Ball", emoji: "⚽", price: 100, category: "sports" },
  { id: "basketball", name: "Basketball", emoji: "🏀", price: 100, category: "sports" },
  { id: "guitar", name: "Guitar", emoji: "🎸", price: 200, category: "hobbies" },
  { id: "skateboard", name: "Skateboard", emoji: "🛹", price: 180, category: "hobbies" },
  { id: "crown", name: "Golden Crown", emoji: "👑", price: 300, category: "premium" },
  { id: "trophy", name: "Trophy", emoji: "🏆", price: 500, category: "premium" },
  { id: "tuxedo", name: "Tuxedo", emoji: "🤵", price: 300, category: "clothing" },
  { id: "dress", name: "Dress", emoji: "👗", price: 300, category: "clothing" },
  { id: "shirt", name: "Cool Shirt", emoji: "👕", price: 150, category: "clothing" },
];

export default function Store() {
  const queryClient = useQueryClient();
  const [buyCoinsDialog, setBuyCoinsDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
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
      if (!currentUser?.email) return null;
      const coins = await base44.entities.UserCoins.filter({ created_by: currentUser.email });
      if (coins.length === 0) {
        return await base44.entities.UserCoins.create({ coins: 100000000, unlocked_items: [], equipped_item: null });
      }
      return coins[0];
    },
    enabled: !!currentUser?.email,
  });

  const updateCoinsMutation = useMutation({
    mutationFn: (data: any) => base44.entities.UserCoins.update(userCoins.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userCoins'] }),
    onError: (e: any) => { console.error("Store: failed to update coins", e); toast.error("Couldn't update your coins. Please try again."); },
  });

  const buyItem = (item: any) => {
    if (userCoins.coins < item.price) {
      toast.error("Not enough coins!");
      return;
    }
    if (userCoins.unlocked_items?.includes(item.id)) {
      toast.info("You already own this!");
      return;
    }
    updateCoinsMutation.mutate({
      coins: userCoins.coins - item.price,
      unlocked_items: [...(userCoins.unlocked_items || []), item.id],
    });
    toast.success(`You bought ${item.name}!`);
  };

  const equipItem = (itemId: string) => {
    const newEquipped = userCoins.equipped_item === itemId ? null : itemId;
    updateCoinsMutation.mutate({ equipped_item: newEquipped });
    toast.success(newEquipped ? "Item equipped!" : "Item unequipped");
  };

  const coins = userCoins?.coins || 0;
  const unlockedItems = userCoins?.unlocked_items || [];
  const equippedItem = userCoins?.equipped_item;
  const equippedItemData = storeItems.find((i) => i.id === equippedItem);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <GameHeader profile={userProfile} coins={coins} onBuyCoins={() => setBuyCoinsDialog(true)} />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/home" className="text-white/60 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">Treasure Store</h1>
            <p className="text-white/60">Buy items for your avatar</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Avatar Preview */}
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8">
            <h2 className="text-white font-bold mb-6 text-center">Your Avatar</h2>
            <AvatarDisplay profile={userProfile} equippedItem={equippedItemData} className="mx-auto" />
          </div>

          {/* Store Grid */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {storeItems.map((item) => {
                const isOwned = unlockedItems.includes(item.id);
                const isEquipped = equippedItem === item.id;
                const canAfford = coins >= item.price;

                return (
                  <motion.div
                    key={item.id}
                    whileHover={{ scale: 1.02 }}
                    className={`relative bg-white/5 rounded-2xl border-2 p-4 text-center transition-all ${
                      isEquipped ? 'border-cyan-400 bg-cyan-500/10' :
                      isOwned ? 'border-green-500/50 bg-green-500/10' :
                      'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {!isOwned && !canAfford && (
                      <div className="absolute top-2 left-2">
                        <Lock className="w-4 h-4 text-white/40" />
                      </div>
                    )}

                    <div className="text-5xl mb-3">{item.emoji}</div>
                    <h3 className="font-semibold text-white text-sm mb-2">{item.name}</h3>

                    {isOwned ? (
                      <Button
                        size="sm"
                        onClick={() => equipItem(item.id)}
                        className={`w-full ${isEquipped ? 'bg-cyan-500' : 'bg-green-500 hover:bg-green-600'}`}
                      >
                        {isEquipped ? <><Check className="w-3 h-3 mr-1" /> Equipped</> : 'Equip'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => buyItem(item)}
                        disabled={!canAfford}
                        className={`w-full ${canAfford ? 'bg-yellow-500 hover:bg-yellow-600 text-black' : 'bg-white/10 text-white/50'}`}
                      >
                        <Coins className="w-3 h-3 mr-1" /> {item.price}
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
