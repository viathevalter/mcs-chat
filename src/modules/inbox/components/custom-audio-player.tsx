import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause, FastForward } from 'lucide-react'

export function CustomAudioPlayer({ src, isOutbound }: { src: string, isOutbound: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play().catch(e => console.error("Playback failed", e))
      }
      setIsPlaying(!isPlaying)
    }
  }

  const toggleSpeed = () => {
    if (audioRef.current) {
      const nextSpeed = speed === 1 ? 1.5 : (speed === 1.5 ? 2 : 1)
      audioRef.current.playbackRate = nextSpeed
      setSpeed(nextSpeed)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100 || 0)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = (parseFloat(e.target.value) / 100) * duration
    if (audioRef.current && !isNaN(seekTime)) {
      audioRef.current.currentTime = seekTime
      setProgress(parseFloat(e.target.value))
    }
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00"
    const m = Math.floor(time / 60)
    const s = Math.floor(time % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className={`flex items-center gap-2 p-2 rounded-xl mb-2 min-w-[200px] ${isOutbound ? 'bg-white/20' : 'bg-slate-100'}`}>
      <audio 
        ref={audioRef} 
        src={src} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => { setIsPlaying(false); setProgress(0) }}
        className="hidden"
      />
      
      <button 
        onClick={togglePlay}
        className={`w-10 h-10 flex shrink-0 items-center justify-center rounded-full transition-colors ${isOutbound ? 'bg-white text-indigo-600 hover:bg-white/90' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-1" />}
      </button>
      
      <div className="flex-1 flex flex-col justify-center px-1">
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={progress} 
          onChange={handleSeek}
          className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isOutbound ? 'bg-white/40 [&::-webkit-slider-thumb]:bg-white' : 'bg-slate-300 [&::-webkit-slider-thumb]:bg-indigo-600'} [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full`}
        />
        <div className={`text-[10px] mt-1 font-medium flex justify-between ${isOutbound ? 'text-indigo-100' : 'text-slate-500'}`}>
          <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <button 
        onClick={toggleSpeed}
        className={`px-2 h-7 rounded-md text-[11px] font-bold flex shrink-0 items-center gap-1 transition-colors ${isOutbound ? 'bg-indigo-500/50 hover:bg-indigo-500/70 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
      >
        {speed}x
      </button>
    </div>
  )
}
