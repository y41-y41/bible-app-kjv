
import React, { useState, useEffect, useRef } from 'react';
import { Book, FavoriteVerseRef, BibleVerse, ChapterData, HighlightColorName, VerseHighlight } from '../types';
import { getChapter } from '../services/bibleService';

interface ScriptureDisplayProps {
  book: Book;
  chapter: number;
  onAddToHistory: (book: Book, chapter: number) => void;
  favoriteVerses: FavoriteVerseRef[];
  onToggleFavorite: (ref: FavoriteVerseRef) => void;
  highlights: VerseHighlight[];
  onSetHighlight: (ref: FavoriteVerseRef, color: HighlightColorName | null) => void;
}

const HIGHLIGHT_COLORS: HighlightColorName[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

const LoadingSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-6 p-6 bg-[var(--color-card-bg)] rounded-lg shadow-md">
    <div className="h-6 bg-[var(--color-skeleton-base)] rounded w-1/3"></div>
    <div className="space-y-3">
      <div className="h-4 bg-[var(--color-skeleton-highlight)] rounded"></div>
      <div className="h-4 bg-[var(--color-skeleton-highlight)] rounded w-5/6"></div>
      <div className="h-4 bg-[var(--color-skeleton-highlight)] rounded w-4/6"></div>
      <div className="h-4 bg-[var(--color-skeleton-highlight)] rounded w-5/6"></div>
    </div>
    <div className="h-4 bg-[var(--color-skeleton-base)] rounded w-1/4 mt-4"></div>
  </div>
);

const VerseActionPopover: React.FC<{
    isFavorited: boolean;
    onFavorite: (e: React.MouseEvent) => void;
    currentHighlight: HighlightColorName | undefined;
    onSetHighlight: (color: HighlightColorName) => void;
    onRemoveHighlight: () => void;
}> = ({ isFavorited, onFavorite, currentHighlight, onSetHighlight, onRemoveHighlight }) => (
    <div 
        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-10 w-max bg-[var(--color-card-bg)] shadow-lg rounded-md border border-[var(--color-border)] flex flex-col p-1"
        onClick={e => e.stopPropagation()}
    >
        <div className="flex items-center border-b border-[var(--color-border)]">
             <button onClick={onFavorite} className="flex-1 text-center px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)] rounded-md transition-colors">
                {isFavorited ? 'Unfavorite' : 'Favorite'}
            </button>
             {currentHighlight && (
                <button onClick={onRemoveHighlight} className="flex-1 text-center px-3 py-1.5 text-sm text-red-500/80 hover:bg-red-500/10 rounded-md transition-colors">
                    Remove Highlight
                </button>
             )}
        </div>
        <div className="flex items-center justify-center p-1 gap-2">
            {HIGHLIGHT_COLORS.map(color => (
                <button
                    key={color}
                    onClick={() => onSetHighlight(color)}
                    aria-label={`Highlight ${color}`}
                    className={`w-6 h-6 rounded-full transition-transform transform hover:scale-110 focus:outline-none ring-1 ring-inset ring-black/10 ${currentHighlight === color ? 'ring-2 ring-offset-2 ring-offset-[var(--color-card-bg)] ring-[var(--color-accent)]' : ''}`}
                    style={{ backgroundColor: `var(--color-highlight-${color})` }}
                />
            ))}
        </div>
    </div>
);


export const ScriptureDisplay: React.FC<ScriptureDisplayProps> = ({ 
    book, chapter, onAddToHistory,
    favoriteVerses, onToggleFavorite,
    highlights, onSetHighlight
}) => {
  const [data, setData] = useState<ChapterData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeVerse, setActiveVerse] = useState<number | null>(null);

  // Audio state
  const [isSpeechSupported, setIsSpeechSupported] = useState<boolean>(false);
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check for speech synthesis support once on mount
  useEffect(() => {
    setIsSpeechSupported('speechSynthesis' in window && window.speechSynthesis !== null);
  }, []);

  // Cleanup speech synthesis on component unmount or chapter change
  useEffect(() => {
    window.scrollTo(0, 0); 
    return () => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
    };
  }, [book, chapter]);

  useEffect(() => {
    const loadChapter = async () => {
      setIsLoading(true);
      setError(null);
      setData(null);
      setActiveVerse(null);
      
      // Stop and reset any ongoing audio playback when chapter changes
      if (isSpeechSupported && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      setPlaybackState('stopped');
      utteranceRef.current = null;

      try {
        const chapterData = await getChapter(book.name, chapter);
        if (!chapterData) {
            setError(`Could not load the text for ${book.name} chapter ${chapter}. Please check your network connection or try again.`);
        } else {
            setData(chapterData);
            onAddToHistory(book, chapter);
        }
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError('An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    if (book && chapter) {
      loadChapter();
    }
  }, [book, chapter, onAddToHistory, isSpeechSupported]);

  const handleAudioPlayPause = () => {
    if (!data || !isSpeechSupported) return;
    const synth = window.speechSynthesis;

    if (playbackState === 'playing') {
      synth.pause();
      setPlaybackState('paused');
      return;
    }

    if (playbackState === 'paused') {
      synth.resume();
      setPlaybackState('playing');
      return;
    }
    
    // If playbackState is 'stopped'
    synth.cancel(); // Cancel any previous utterances from other chapters

    const textToSpeak = data.verses.map(v => `Verse ${v.verse}. ${v.text}`).join(' ');
    const newUtterance = new SpeechSynthesisUtterance(textToSpeak);

    newUtterance.onstart = () => {
      setPlaybackState('playing');
    };

    newUtterance.onend = () => {
      setPlaybackState('stopped');
      utteranceRef.current = null;
    };

    newUtterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      console.error("Speech Synthesis Error:", event.error);
      
      // Don't show a user-facing error for user-initiated cancellations.
      if (event.error === 'canceled') {
        setPlaybackState('stopped');
        utteranceRef.current = null;
        return;
      }
      
      setPlaybackState('stopped');
      utteranceRef.current = null;
      setError(`Sorry, an audio playback error occurred (${event.error}). Your browser may not fully support this feature.`);
    };

    utteranceRef.current = newUtterance;
    synth.speak(newUtterance);
  };

  const handleAudioStop = () => {
    if (!isSpeechSupported) return;
    window.speechSynthesis.cancel();
    // Forcing state change for immediate feedback, as onend/onerror can be slow or inconsistent.
    setPlaybackState('stopped');
    utteranceRef.current = null;
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 bg-[var(--color-card-bg)] border-l-4 border-[var(--color-accent)] rounded-r-lg shadow-md ring-1 ring-[var(--color-card-ring)]">
        <h3 className="font-bold text-[var(--color-text-header)] text-lg">Content Not Available</h3>
        <p className="mt-2 text-[var(--color-text)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return null; 
  }

  const getVerseRef = (verse: BibleVerse): FavoriteVerseRef => `kjv:${verse.book_name}:${verse.chapter}:${verse.verse}`;

  return (
    <div className="bg-[var(--color-card-bg)] p-6 sm:p-8 rounded-lg shadow-md ring-1 ring-[var(--color-card-ring)]">
      <div className="flex justify-between items-center mb-4 border-b border-[var(--color-border)] pb-3">
        <h2 className="text-2xl sm:text-3xl font-bold text-[var(--color-accent)]">
            {data.reference}
        </h2>
        {isSpeechSupported && (
            <div className="flex items-center space-x-2">
                <button onClick={handleAudioPlayPause} className="p-2 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors" aria-label={playbackState === 'playing' ? 'Pause' : 'Play'}>
                    <span className="material-symbols-outlined">{playbackState === 'playing' ? 'pause_circle' : 'play_circle'}</span>
                </button>
                 <button 
                    onClick={handleAudioStop} 
                    className="p-2 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                    aria-label="Stop"
                    disabled={playbackState === 'stopped'}
                >
                    <span className="material-symbols-outlined">stop_circle</span>
                </button>
            </div>
        )}
      </div>
      <div 
        className="prose max-w-none leading-relaxed"
        style={{
            '--tw-prose-body': 'var(--color-text)',
            fontSize: 'var(--font-size-reading)',
            fontFamily: 'var(--font-family-reading)',
        } as React.CSSProperties}
      >
        {data.verses.map((verse) => {
            const verseRef = getVerseRef(verse);
            const isFavorited = favoriteVerses.includes(verseRef);
            const highlight = highlights.find(h => h.ref === verseRef);
            const isVerseActive = activeVerse === verse.verse;

            let bgClass = 'hover:bg-[var(--color-bg-hover)]';
            if (isVerseActive) {
                bgClass = 'bg-[var(--color-accent-bg)]';
            } else if (highlight) {
                bgClass = `bg-[var(--color-highlight-${highlight.color})]`;
            } else if (isFavorited) {
                bgClass = 'bg-[var(--color-favorite-bg)] hover:brightness-95';
            }

            return (
              <p 
                key={verse.verse} 
                className={`mb-4 relative cursor-pointer rounded-md p-2 -m-2 transition-all duration-200 ${bgClass}`}
                onClick={() => setActiveVerse(activeVerse === verse.verse ? null : verse.verse)}
              >
                {activeVerse === verse.verse && (
                    <VerseActionPopover 
                        isFavorited={isFavorited}
                        onFavorite={(e) => { e.stopPropagation(); onToggleFavorite(verseRef); }}
                        currentHighlight={highlight?.color}
                        onSetHighlight={(color) => onSetHighlight(verseRef, color)}
                        onRemoveHighlight={() => onSetHighlight(verseRef, null)}
                    />
                )}
                <sup className="font-sans font-bold text-[var(--color-accent)] mr-1 select-none">{verse.verse}</sup>
                {verse.text.trim()}
              </p>
            )
        })}
      </div>
       <p className="mt-6 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
        Translation: King James Version
      </p>
    </div>
  );
};