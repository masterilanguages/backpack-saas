"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { base44 as base44Client } from "@/api/base44Client";
// base44Client is a JS shim whose `entities`/`auth` are built dynamically, so TS
// can't see entity keys like `UserProfile`. Cast to `any` for ergonomic access —
// the runtime shape is guaranteed by the shim.
const base44: any = base44Client;
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { LEARNING_LANGUAGES as languages } from "@/lib/learningLanguages";

export default function LanguageSelect() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);

  useEffect(() => {
    document.title = "Choose Language - Lashon Languages";
  }, []);

  const selectLanguageMutation = useMutation({
    mutationFn: async (language: string) => {
      const currentUser = await base44.auth.me();
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        return await base44.entities.UserProfile.update(profiles[0].id, { language });
      }
      return await base44.entities.UserProfile.create({
        language,
        current_day: 1,
        is_new_user: true
      });
    },
    onSuccess: async () => {
      const currentUser = await base44.auth.me();
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      if (profiles[0]) {
        await base44.entities.UserProfile.update(profiles[0].id, {
          is_new_user: false,
          onboarding_completed_at: new Date().toISOString(),
          avatar_id: "default",
          avatar_name: "Student"
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['userProfile', currentUser?.email] });
      navigate("/home");
    },
  });

  const handleSelect = (lang: typeof languages[number]) => {
    if (!lang.active) {
      setShowComingSoon(true);
      return;
    }
    setSelectedLanguage(lang.id);
  };

  const handleContinue = () => {
    if (!selectedLanguage) {
      toast.error("Please select a language");
      return;
    }
    selectLanguageMutation.mutate(selectedLanguage);
  };

  if (showComingSoon) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(160deg, #f0ece4 0%, #e8e4d8 100%)' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white/70 backdrop-blur-xl border-2 border-stone-200 rounded-3xl p-8 text-center"
        >
          <div className="text-6xl mb-6">🚧</div>
          <h2 className="text-3xl font-bold mb-3" style={{ color: '#4a5c4a', fontFamily: 'Cormorant Garamond, serif' }}>Coming Soon!</h2>
          <p className="text-stone-600 text-lg mb-8">
            This language is not available yet. We're working hard to bring it to you soon!
          </p>
          <Button
            onClick={() => setShowComingSoon(false)}
            className="w-full py-4 text-lg font-bold"
            style={{ background: '#5a6b5a', color: '#f5f0e8' }}
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Go Back
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(160deg, #f0ece4 0%, #e8e4d8 100%)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3" style={{ color: '#3a4a3a', fontFamily: 'Cormorant Garamond, serif', fontWeight: 300 }}>
            Choose your language
          </h1>
          <p className="text-lg" style={{ color: '#6b7c6b', fontFamily: 'Jost, sans-serif' }}>
            Start your learning journey
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {languages.map((lang) => (
            <motion.button
              key={lang.id}
              onClick={() => handleSelect(lang)}
              whileHover={{ scale: lang.active ? 1.05 : 1 }}
              whileTap={{ scale: lang.active ? 0.95 : 1 }}
              className={`relative p-8 rounded-3xl border-2 transition-all bg-white/60 backdrop-blur-sm ${
                selectedLanguage === lang.id
                  ? 'border-stone-500 shadow-lg'
                  : lang.active
                  ? 'border-stone-200 hover:border-stone-400'
                  : 'border-stone-100 opacity-50 cursor-pointer'
              }`}
            >
              <div className="text-7xl mb-3">{lang.emoji}</div>
              <p className="font-semibold text-lg" style={{ color: '#3a4a3a', fontFamily: 'Jost, sans-serif' }}>{lang.name}</p>
              {!lang.active && (
                <p className="text-stone-400 text-xs mt-1">Coming Soon</p>
              )}
            </motion.button>
          ))}
        </div>

        <Button
          onClick={handleContinue}
          disabled={!selectedLanguage || selectLanguageMutation.isPending}
          className="w-full py-6 text-lg font-bold shadow-lg disabled:opacity-50"
          style={{ background: '#5a6b5a', color: '#f5f0e8', fontFamily: 'Jost, sans-serif' }}
        >
          {selectLanguageMutation.isPending ? "Starting..." : "Continue"}
        </Button>
      </motion.div>
    </div>
  );
}
