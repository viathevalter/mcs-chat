"use client"

import { useState, useRef, useEffect } from 'react'
import { Mic, Square, X } from 'lucide-react'

interface AudioRecorderProps {
  onSend: (base64Audio: string) => void
  disabled?: boolean
}

export function AudioRecorder({ onSend, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = () => {
          const base64String = reader.result as string
          // Remove the prefix "data:audio/webm;base64,"
          const base64Audio = base64String.split(',')[1]
          if (base64Audio) {
            onSend(base64Audio)
          }
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Error accessing microphone', err)
      alert('Não foi possível acessar o microfone. Verifique as permissões do seu navegador.')
    }
  }

  const stopRecording = (cancel: boolean = false) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      if (cancel) {
        // Prevent onstop from processing the chunk or sending
        // We do this by swapping out the onstop handler right before stopping
        mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop())
        }
      } else {
        // Let the default onstop fire, but make sure we kill tracks after
        const defaultOnStop = mediaRecorderRef.current.onstop
        mediaRecorderRef.current.onstop = (e) => {
          if (defaultOnStop) defaultOnStop.call(mediaRecorderRef.current!, e)
          mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop())
        }
      }
      
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      setRecordingTime(0)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-3 bg-red-50 text-red-600 px-3 py-1.5 rounded-xl border border-red-200 shadow-sm animate-in fade-in slide-in-from-right-4">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
        <span className="font-mono text-sm font-medium w-12">{formatTime(recordingTime)}</span>
        
        <button 
          onClick={() => stopRecording(true)} 
          className="p-2 hover:bg-red-100 rounded-md transition-colors text-red-500 hover:text-red-700"
          title="Cancelar Gravação"
        >
          <X className="w-4 h-4" />
        </button>
        
        <button 
          onClick={() => stopRecording(false)} 
          className="p-2 hover:bg-red-100 rounded-md transition-colors text-red-600 hover:text-red-800 font-bold flex items-center gap-1 leading-none shadow-sm"
          title="Enviar Áudio"
        >
          <Square className="w-4 h-4 fill-current" /> Enviar
        </button>
      </div>
    )
  }

  return (
    <button 
      onClick={startRecording}
      disabled={disabled}
      className={`p-3 rounded-xl transition-colors shrink-0 ${disabled ? 'text-slate-300' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
      title="Gravar Áudio"
    >
      <Mic className="w-5 h-5" />
    </button>
  )
}
