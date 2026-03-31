import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause, FastForward, User2 } from 'lucide-react'

export function CustomAudioPlayer({ src, isOutbound, senderInitials }: { src: string, isOutbound: boolean, senderInitials?: string }) {
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
    <div className={`flex items-center gap-2 mb-1 min-w-[240px]`}>
      <audio 
        ref={audioRef} 
        src={src} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => { setIsPlaying(false); setProgress(0) }}
        className="hidden"
      />
      
      {/* Sender Avatar mimicking native Whatsapp/Other App */}
      <div className={`w-10 h-10 rounded-full flex shrink-0 items-center justify-center overflow-hidden border-2 ${isOutbound ? 'bg-emerald-400 border-emerald-300 text-white' : 'bg-slate-200 border-slate-100 text-slate-500'}`}>
         {senderInitials ? (
           <span className="text-[14px] font-bold">{senderInitials}</span>
         ) : (
           <User2 className="w-5 h-5 opacity-50" />
         )}
      </div>

      <button 
        onClick={togglePlay}
        className={`w-10 h-10 flex shrink-0 items-center justify-center rounded-full transition-colors ${isOutbound ? 'text-white hover:text-emerald-200' : 'text-emerald-600 hover:text-emerald-800'}`}
      >
        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" fill="currentColor" />}
      </button>
      
      <div className="flex-1 flex flex-col justify-center px-1">
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={progress} 
          onChange={handleSeek}
          className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isOutbound ? 'bg-white/40 [&::-webkit-slider-thumb]:bg-white' : 'bg-slate-300 [&::-webkit-slider-thumb]:bg-emerald-600'} [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full`}
        />
        <div className={`text-[11px] mt-1 font-medium flex justify-between ${isOutbound ? 'text-emerald-100' : 'text-slate-500'}`}>
          <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <button 
        onClick={toggleSpeed}
        className={`px-1.5 h-6 rounded-md text-[10px] font-bold flex shrink-0 items-center gap-1 transition-colors ${isOutbound ? 'bg-emerald-500/30 hover:bg-emerald-500/50 text-white' : 'bg-slate-200/50 hover:bg-slate-200 text-slate-600'}`}
      >
        {speed}x
      </button>
    </div>
  )
}
