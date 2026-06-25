"use client";

import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext<any>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Kept for API compatibility with consumers of this context. Base44 exposed
  // per-app "public settings"; Supabase has no equivalent, so this is a static
  // stub that is never in a loading state.
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState<any>(null);
  const [appPublicSettings] = useState({ id: null, public_settings: {} });

  // Only the INITIAL load toggles isLoadingAuth. Later auth events
  // (TOKEN_REFRESHED / SIGNED_IN that supabase-js fires when the tab regains
  // focus) must NOT flip isLoadingAuth back to true: AuthenticatedApp renders a
  // full-screen spinner whenever isLoadingAuth is true, which REMOUNTS the whole
  // route tree and destroys in-page state (e.g. the video you were watching).
  const loadUser = async ({ initial = false } = {}) => {
    if (initial) setIsLoadingAuth(true);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      // Logged-out is the normal unauthenticated state, not an error to surface.
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      if (initial) setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    // Initial check shows the loading gate once; later events update the user
    // silently (no gate flip → no remount of the app).
    loadUser({ initial: true });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setIsAuthenticated(false);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Refresh the shaped user WITHOUT flipping isLoadingAuth.
        loadUser();
      }
      // TOKEN_REFRESHED / INITIAL_SESSION: ignore — the session is unchanged.
    });
    return () => subscription?.unsubscribe();
  }, []);

  // Kept for API compatibility; re-checks the current session.
  const checkAppState = loadUser;

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      await base44.auth.logout(); // signs out + redirects to /login
    } else {
      await supabase.auth.signOut(); // sign out without redirect
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
