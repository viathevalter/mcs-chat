"use client"

import { useState, useEffect } from "react"
import { Loader2, RefreshCw } from "lucide-react"

// Cache em memória da aba para evitar retraduzir a mesma mensagem ou mesmo texto ao alternar conversas
const translationMemoryCache = new Map<string, string>()
const inflightTranslations = new Map<string, Promise<string | null>>()

// Controle de concorrência para não disparar 50 chamadas simultâneas ao abrir uma conversa longa
const MAX_CONCURRENT = 6
let activeCount = 0
const queue: Array<() => void> = []

function runWithConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const execute = () => {
      activeCount++
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeCount--
          const next = queue.shift()
          if (next) next()
        })
    }

    if (activeCount < MAX_CONCURRENT) {
      execute()
    } else {
      queue.push(execute)
    }
  })
}

async function requestFastTranslation(
  messageId: string,
  content: string,
  currentTranslations: any,
  myLang: string
): Promise<string | null> {
  const cacheKey = `${myLang}::${content.trim()}`
  if (translationMemoryCache.has(cacheKey)) {
    return translationMemoryCache.get(cacheKey)!
  }

  if (inflightTranslations.has(cacheKey)) {
    return inflightTranslations.get(cacheKey)!
  }

  const promise = runWithConcurrency(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        const res = await fetch('/api/chat/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId,
            content,
            currentTranslations,
            targetLang: myLang,
            mode: 'inbound'
          }),
          signal: controller.signal
        })
        clearTimeout(timer)
        if (res.ok) {
          const data = await res.json()
          if (data?.success && data?.translation) {
            translationMemoryCache.set(cacheKey, data.translation)
            return data.translation as string
          }
        }
      } catch {}
    }
    return null
  }).finally(() => {
    inflightTranslations.delete(cacheKey)
  })

  inflightTranslations.set(cacheKey, promise)
  return promise
}

export function BilingualMessage({
  msg,
  translationActive,
  myLang
}: {
  msg: any
  translationActive: boolean
  myLang: string
}) {
  const cachedFromDb = msg?.translations?.[myLang] || null
  const cacheKey = `${myLang}::${String(msg?.content || '').trim()}`
  const cachedFromMem = translationMemoryCache.get(cacheKey) || null

  const [translation, setTranslation] = useState<string | null>(cachedFromDb || cachedFromMem)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!translationActive) return
    if (msg.direction === 'outbound') return
    if (['audio', 'video', 'image', 'document'].includes(msg.message_type)) return

    const textContent = String(msg?.content || '').trim()
    if (!textContent) return

    const dbHit = msg?.translations?.[myLang]
    if (dbHit) {
      translationMemoryCache.set(`${myLang}::${textContent}`, dbHit)
      setTranslation(dbHit)
      setLoading(false)
      setFailed(false)
      return
    }

    const memHit = translationMemoryCache.get(`${myLang}::${textContent}`)
    if (memHit) {
      setTranslation(memHit)
      setLoading(false)
      setFailed(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setFailed(false)

    requestFastTranslation(msg.id, textContent, msg.translations, myLang)
      .then((result) => {
        if (cancelled) return
        if (result) {
          setTranslation(result)
          setFailed(false)
        } else {
          setFailed(true)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [translationActive, myLang, msg.id, msg.content, cachedFromDb, retryCount])

  if (!translationActive || msg.direction === 'outbound' || ['audio', 'video', 'image', 'document'].includes(msg.message_type)) {
    return <p className="text-[14px] leading-relaxed break-words">{msg.content}</p>
  }

  return (
    <div className="flex flex-col gap-1 w-full text-[14px] leading-relaxed break-words">
      <p className="text-zinc-800 dark:text-zinc-100 font-medium whitespace-pre-wrap">{msg.content}</p>
      {loading ? (
        <div className="flex items-center gap-1.5 text-blue-500 text-[11px] font-medium py-0.5 border-t border-dashed border-slate-200 dark:border-slate-700 mt-0.5 pt-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Traduzindo...</span>
        </div>
      ) : translation ? (
        <p className="text-zinc-600 dark:text-zinc-300 text-[12.5px] italic border-t border-dashed border-slate-200 dark:border-slate-700 mt-0.5 pt-1 whitespace-pre-wrap">
          {translation}
        </p>
      ) : failed ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setRetryCount((c) => c + 1)
          }}
          className="flex items-center gap-1 text-amber-600 hover:text-amber-700 text-[11px] font-semibold border-t border-dashed border-slate-200 mt-0.5 pt-1 w-fit cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Tentar traduzir novamente</span>
        </button>
      ) : null}
    </div>
  )
}
