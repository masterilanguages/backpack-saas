"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import VideoTranscriptWord from "../video/VideoTranscriptWord";

export default function KaraokeTranscript({ 
  lines, 
  audioRef, 
  videoRef,
  onLineUpdate,
  onAddToBackpack,
  className = ""
}) {
  const [activeLineId, setActiveLineId] = useState(null);
  const activeLineRef = useRef(null);
  const containerRef = useRef(null);

  // Sync logic - poll audio/video time and highlight active line
  useEffect(() => {
    const mediaElement = audioRef?.current || videoRef?.current;
    if (!mediaElement || !lines?.length) return;

    const interval = setInterval(() => {
      if (mediaElement.paused) return;
      
      const currentMs = mediaElement.currentTime * 1000;
      
      // Find active line
      const activeLine = lines.find(line =>
        line.start_ms <= currentMs && currentMs < line.end_ms
      );

      const newId = activeLine?.id || null;
      setActiveLineId(prev => prev !== newId ? newId : prev);
    }, 150);

    return () => clearInterval(interval);
  }, [lines, audioRef, videoRef]);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const line = activeLineRef.current;
      
      const containerHeight = container.clientHeight;
      const lineTop = line.offsetTop;
      const lineHeight = line.clientHeight;
      
      // Center the active line
      const targetScroll = lineTop - (containerHeight / 2) + (lineHeight / 2);
      
      container.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
  }, [activeLineId]);

  const handleLineClick = (line) => {
    const mediaElement = audioRef?.current || videoRef?.current;
    if (!mediaElement) return;
    
    mediaElement.currentTime = line.start_ms / 1000;
    mediaElement.play();
  };

  const updateWord = (lineId, field, wordIndex, newValue) => {
    if (!onLineUpdate) return;
    
    const lineIndex = lines.findIndex(l => l.id === lineId);
    if (lineIndex === -1) return;
    
    const line = lines[lineIndex];
    const words = line[field].split(/(\s+)/);
    words[wordIndex] = newValue;
    const newText = words.join('');
    
    onLineUpdate(lineIndex, { ...line, [field]: newText });
  };

  return (
    <div 
      ref={containerRef}
      className={`space-y-2 max-h-96 overflow-y-auto ${className}`}
      style={{ direction: 'ltr', textAlign: 'left' }}
    >
      {lines.map((line, lineIndex) => {
        const isActive = line.id === activeLineId;
        
        return (
          <div
            key={line.id}
            ref={isActive ? activeLineRef : null}
            data-start={line.start_ms}
            data-end={line.end_ms}
            onClick={() => handleLineClick(line)}
            className={`karaoke-line group relative p-3 rounded-lg cursor-pointer transition-all ${
              isActive 
                ? 'bg-yellow-400/35 border-l-4 border-yellow-500 pl-4' 
                : 'hover:bg-white/5'
            }`}
            style={{ direction: 'ltr', textAlign: 'left' }}
          >
            {onAddToBackpack && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToBackpack(line.hebrew, line.transliteration, line.english);
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center"
                title="Add to backpack"
              >
                <Plus className="w-4 h-4 text-amber-400" />
              </button>
            )}
            
            {/* Transliteration */}
            <div className="transliteration mb-0.5" style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'bidi-override' }}>
              {line.transliteration.split(/(\s+)/).map((part, i) => 
                /\S/.test(part) ? (
                  <VideoTranscriptWord
                    key={i}
                    word={part}
                    hebrew={line.hebrew}
                    transliteration={line.transliteration}
                    english={line.english}
                    onEdit={(newWord) => updateWord(line.id, 'transliteration', i, newWord)}
                    onAddToBackpack={onAddToBackpack}
                    className="text-white/90 text-lg leading-tight"
                  />
                ) : part
              )}
            </div>
            
            {/* English */}
            <div className="english mb-1" style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'bidi-override' }}>
              {line.english.split(/(\s+)/).map((part, i) => 
                /\S/.test(part) ? (
                  <VideoTranscriptWord
                    key={i}
                    word={part}
                    hebrew={line.hebrew}
                    transliteration={line.transliteration}
                    english={line.english}
                    onEdit={(newWord) => updateWord(line.id, 'english', i, newWord)}
                    onAddToBackpack={onAddToBackpack}
                    className="text-white/70 text-base leading-tight"
                  />
                ) : part
              )}
            </div>
            
            {/* Hebrew */}
            <div className="hebrew" style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'bidi-override' }}>
              {line.hebrew.split(/(\s+)/).map((part, i) => 
                /\S/.test(part) ? (
                  <VideoTranscriptWord
                    key={i}
                    word={part}
                    hebrew={line.hebrew}
                    transliteration={line.transliteration}
                    english={line.english}
                    onEdit={(newWord) => updateWord(line.id, 'hebrew', i, newWord)}
                    onAddToBackpack={onAddToBackpack}
                    className="text-cyan-400 text-xl font-bold leading-tight"
                  />
                ) : part
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}