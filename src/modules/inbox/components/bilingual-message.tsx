"use client"

import { useState, useEffect } from "react"
import { translateInboundMessage } from "@/app/actions/translation-actions"
import { Loader2 } from "lucide-react"

export function BilingualMessage({ 
    msg, 
    translationActive, 
    myLang 
}: { 
    msg: any, 
    translationActive: boolean, 
    myLang: string 
}) {
    const [translation, setTranslation] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!translationActive) return;
        if (msg.direction === 'outbound') return; // We only translate inbound automatically
        if (['audio', 'video', 'image', 'document'].includes(msg.message_type)) return;

        // DB saved cache check
        if (msg.translations?.[myLang]) {
            setTranslation(msg.translations[myLang])
            return;
        }

        let isMounted = true;
        setLoading(true);

        translateInboundMessage(msg.id, msg.content, msg.translations, myLang)
            .then((res) => {
                if (isMounted && res.success) {
                    setTranslation(res.translation!)
                }
            })
            .catch(console.error)
            .finally(() => {
                if(isMounted) setLoading(false)
            })

        return () => { isMounted = false }
    }, [translationActive, myLang, msg])

    if (!translationActive || msg.direction === 'outbound' || ['audio', 'video', 'image', 'document'].includes(msg.message_type)) {
        return <p className="text-[14px] leading-relaxed break-words">{msg.content}</p>
    }

    return (
        <div className="flex flex-col gap-1 w-full text-[14px] leading-relaxed break-words">
            <p className="text-zinc-800 font-medium">{msg.content}</p>
            {loading ? (
                <div className="flex items-center gap-2 text-blue-500 text-xs font-medium py-1 border-t border-dashed mt-1 pt-1">
                    <Loader2 className="w-3 h-3 animate-spin"/> Traduzindo via IA...
                </div>
            ) : translation ? (
                <p className="text-zinc-500 text-[12px] italic border-t border-dashed mt-1 pt-1">{translation}</p>
            ) : null}
        </div>
    )
}
