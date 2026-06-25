"use client";

import { base44 } from './base44Client';

// Re-export the same names the app imports from this module.

export const Query = base44.entities.Query;

// auth sdk:
export const User = base44.auth;
