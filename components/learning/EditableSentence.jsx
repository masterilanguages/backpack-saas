"use client";

import React from "react";
import UniversalEditableWord from "./UniversalEditableWord";

export default function EditableSentence({ 
  text, 
  context, 
  contextId, 
  field, 
  className = "" 
}) {
  const words = text.split(/(\s+)/); // Split by whitespace but keep the whitespace

  return (
    <span className={className}>
      {words.map((word, idx) => {
        // If it's whitespace, render as-is
        if (word.match(/^\s+$/)) {
          return <span key={idx}>{word}</span>;
        }
        
        // Otherwise, make it editable
        return (
          <UniversalEditableWord
            key={idx}
            text={word}
            context={context}
            contextId={contextId}
            field={field}
            index={idx}
            className={className}
          />
        );
      })}
    </span>
  );
}