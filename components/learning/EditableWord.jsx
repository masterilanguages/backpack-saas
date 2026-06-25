"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

export default function EditableWord({ 
  text, 
  onSave, 
  language = "en",
  className = "",
  editable = true,
  onClick,
  placeholder = "click to edit"
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(text);
  const inputRef = useRef(null);

  useEffect(() => {
    setValue(text);
  }, [text]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (value !== text) {
      onSave(value.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setValue(text);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (!editable) {
    return <span className={className} onClick={onClick}>{text}</span>;
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className={`inline-block bg-white/20 border border-cyan-400 rounded px-1 outline-none ${className}`}
        style={{ 
          width: `${Math.max(value.length * 8 + 10, 40)}px`,
          unicodeBidi: language === "he" ? "plaintext" : "normal"
        }}
        dir={language === "he" ? "rtl" : "ltr"}
      />
    );
  }

  return (
    <motion.span
      whileHover={{ backgroundColor: "rgba(255,255,255,0.1)" }}
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      className={`inline-block cursor-pointer px-1 rounded hover:underline ${className}`}
      dir={language === "he" ? "rtl" : "ltr"}
      style={{ unicodeBidi: language === "he" ? "isolate" : "normal" }}
    >
      {text || <span className="opacity-40 italic text-[10px]">{placeholder}</span>}
    </motion.span>
  );
}