"use client";

import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function UniversalEditableWord({ 
  text,
  context,
  contextId,
  field,
  index,
  className = "",
  onSave,
  showUnderline = true
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(text);
  const inputRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setValue(text);
  }, [text]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const saveEditMutation = useMutation({
    mutationFn: async (newValue) => {
      // Find existing edit
      const existing = await base44.entities.TextEdit.filter({
        context,
        context_id: contextId,
        field,
        index: index || 0
      });

      if (existing.length > 0) {
        await base44.entities.TextEdit.update(existing[0].id, {
          edited: newValue
        });
      } else {
        await base44.entities.TextEdit.create({
          context,
          context_id: contextId,
          field,
          index: index || 0,
          original: text,
          edited: newValue
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      if (onSave) onSave(value);
    }
  });

  const handleSave = async () => {
    if (value.trim() && value !== text) {
      await saveEditMutation.mutateAsync(value.trim());
      toast.success("Updated!");
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

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`inline-block bg-cyan-500/20 border border-cyan-400 rounded px-1 outline-none ${className}`}
        style={{ 
          width: `${Math.max(value.length * 10 + 10, 40)}px`,
          minWidth: '40px'
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      className={`cursor-pointer hover:bg-cyan-500/20 px-1 rounded transition-all ${
        showUnderline ? 'hover:underline' : ''
      } ${className}`}
      title="Click to edit"
    >
      {text}
    </span>
  );
}