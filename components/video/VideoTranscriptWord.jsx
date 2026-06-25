"use client";

import React, { useState, useRef, useEffect } from "react";
import { Pencil, ShoppingBag } from "lucide-react";

export default function VideoTranscriptWord({ 
  word, 
  hebrew,
  transliteration,
  english,
  onEdit,
  onAddToBackpack,
  className = ""
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(word || "");
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  if (!word) return null;

  const handleSave = () => {
    if (value && value.trim() && value !== word && onEdit) {
      onEdit(value.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
    else if (e.key === "Escape") { setValue(word); setIsEditing(false); }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`inline-block bg-white/20 border border-cyan-400 rounded px-1 outline-none ${className}`}
        style={{ width: `${Math.max(value.length * 8 + 10, 40)}px` }}
      />
    );
  }

  return (
    <span className="relative inline-block" ref={menuRef}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={`cursor-pointer hover:bg-cyan-500/20 px-0.5 rounded transition-all ${className}`}
      >
        {word}
      </span>

      {showMenu && (
        <span
          className="absolute bottom-full left-0 mb-1 flex gap-1 z-50"
          style={{ whiteSpace: 'nowrap' }}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setShowMenu(false);
              setIsEditing(true);
            }}
            className="flex items-center justify-center w-6 h-6 rounded bg-blue-500/80 hover:bg-blue-500 text-white shadow-lg"
            title="Edit word"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setShowMenu(false);
              if (onAddToBackpack) onAddToBackpack(hebrew, transliteration, english);
            }}
            className="flex items-center justify-center w-6 h-6 rounded bg-amber-500/80 hover:bg-amber-500 text-white shadow-lg"
            title="Add to backpack"
          >
            <ShoppingBag className="w-3 h-3" />
          </button>
        </span>
      )}
    </span>
  );
}