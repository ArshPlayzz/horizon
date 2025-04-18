import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

/**
 * Interface defining the audio context functionality
 */
interface AudioContextType {
  /** ID of the currently active audio player */
  activePlayerId: string | null;
  /** Registers a new audio player with the context */
  registerPlayer: (id: string, pause: () => void) => void;
  /** Unregisters an audio player from the context */
  unregisterPlayer: (id: string) => void;
  /** Sets the active audio player */
  setActivePlayer: (id: string | null) => void;
  /** Pauses all audio players except the specified one */
  pauseAllExcept: (id: string) => void;
}

/**
 * Creates the audio context
 */
const AudioContext = createContext<AudioContextType | null>(null);

/**
 * Interface for a registered audio player
 */
interface RegisteredPlayer {
  /** Unique identifier for the player */
  id: string;
  /** Function to pause the player */
  pause: () => void;
}

/**
 * Provider component for the audio context
 * @param children - React children
 * @returns AudioContextProvider component
 */
export function AudioContextProvider({ children }: { children: React.ReactNode }) {
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const registeredPlayers = useRef<Map<string, RegisteredPlayer>>(new Map());

  /**
   * Registers a new audio player with the context
   * @param id - Unique identifier for the player
   * @param pause - Function to pause the player
   */
  const registerPlayer = useCallback((id: string, pause: () => void) => {
    registeredPlayers.current.set(id, { id, pause });
  }, []);

  /**
   * Unregisters an audio player from the context
   * @param id - ID of the player to unregister
   */
  const unregisterPlayer = useCallback((id: string) => {
    registeredPlayers.current.delete(id);
    if (activePlayerId === id) {
      setActivePlayerId(null);
    }
  }, [activePlayerId]);

  /**
   * Sets the active audio player
   * @param id - ID of the player to set as active, or null to clear active player
   */
  const setActivePlayer = useCallback((id: string | null) => {
    if (id === null || registeredPlayers.current.has(id)) {
      setActivePlayerId(id);
    }
  }, []);

  /**
   * Pauses all audio players except the specified one
   * @param id - ID of the player to keep playing
   */
  const pauseAllExcept = useCallback((id: string) => {
    registeredPlayers.current.forEach((player) => {
      if (player.id !== id) {
        player.pause();
      }
    });
  }, []);

  return (
    <AudioContext.Provider 
      value={{ 
        activePlayerId, 
        registerPlayer, 
        unregisterPlayer, 
        setActivePlayer,
        pauseAllExcept
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

/**
 * Hook for using the audio context
 * @returns The audio context
 * @throws Error if used outside of AudioContextProvider
 */
export function useAudioContext() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudioContext must be used within an AudioContextProvider');
  }
  return context;
} 