"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Mail, Lock, LogIn, Loader2, Sparkles, Building2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // 1. Verificar se recebeu tokens via URL (SSO direto)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const access_token = url.searchParams.get('access_token') || new URLSearchParams(window.location.hash.substring(1)).get('access_token')
      const refresh_token = url.searchParams.get('refresh_token') || new URLSearchParams(window.location.hash.substring(1)).get('refresh_token')

      if (access_token && refresh_token) {
        setLoading(true)
        supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error }) => {
          if (!error && data?.session) {
            window.location.href = '/inbox'
          } else {
            setLoading(false)
            setError('Falha ao autenticar sessão única. Por favor faça o login manual.')
          }
        }).catch(() => {
          setLoading(false)
          setError('Erro ao validar credenciais do Hub.')
        })
        return
      }
    }

    // 2. Verificar se já possui sessão ativa
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = '/inbox'
      }
    })
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const cleanEmail = email.trim().toLowerCase()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      })

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError('E-mail ou senha incorretos. Verifique suas credenciais.')
        } else {
          setError(signInError.message || 'Erro ao realizar login.')
        }
        setLoading(false)
      } else if (data?.session) {
        window.location.href = '/inbox'
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado na conexão.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-slate-50 dark:bg-slate-900 selection:bg-emerald-500/30">
      
      {/* Lado Esquerdo - Decorativo */}
      <div className="hidden lg:flex w-1/2 relative bg-emerald-600 overflow-hidden items-center justify-center">
         <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-700 z-0"></div>
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-10"></div>
         
         <div className="relative z-20 text-white max-w-lg px-12">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 mb-8 shadow-xl">
               <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-5xl font-black mb-6 leading-[1.1] tracking-tight">
               O hub de comunicação MCS-Chat.
            </h1>
            <p className="text-emerald-50 text-lg leading-relaxed font-medium">
               Gerencie múltiplos provedores de WhatsApp, converse com seus colaboradores em tempo real e orquestre o atendimento com o AI Capitão.
            </p>
            
            <div className="mt-12 flex items-center gap-4 text-emerald-100">
               <div className="flex -space-x-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-400 border-2 border-emerald-600"></div>
                  <div className="w-10 h-10 rounded-full bg-emerald-300 border-2 border-emerald-600"></div>
                  <div className="w-10 h-10 rounded-full bg-emerald-200 border-2 border-emerald-600"></div>
               </div>
               <span className="text-sm font-bold tracking-wide">Plataforma Exclusiva</span>
            </div>
         </div>
      </div>

      {/* Lado Direito - Formulario de Login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-24 bg-white dark:bg-slate-900 transition-colors">
         <div className="w-full max-w-md">
            
            <div className="mb-10 text-center lg:text-left">
               <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20 mb-6 lg:hidden mx-auto">
                  <Building2 className="w-7 h-7 text-white" />
               </div>
               <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2 tracking-tight">Bem-vindo de volta</h2>
               <p className="text-slate-500 dark:text-slate-400 font-medium">Faça login com sua conta MCS-Chat para acessar o Inbox.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
               
               {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-center gap-3">
                     <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                     <p className="text-sm text-red-600 dark:text-red-400 font-bold">{error}</p>
                  </div>
               )}

               <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">E-mail Corporativo</label>
                  <div className="relative">
                     <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                     <input 
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full py-4 pl-12 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none text-[15px] font-medium transition-all text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        placeholder="valter@gestaologinpro.com"
                     />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <div className="flex justify-between items-center ml-1">
                     <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Senha</label>
                  </div>
                  <div className="relative">
                     <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                     <input 
                        type="password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full py-4 pl-12 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none text-[15px] font-medium transition-all text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        placeholder="••••••••"
                     />
                  </div>
               </div>

               <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group mt-2"
               >
                  {loading ? (
                     <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Autenticando...</span>
                     </>
                  ) : (
                     <>
                        <span>Entrar no Sistema</span>
                        <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                     </>
                  )}
               </button>

            </form>

            <div className="mt-8 text-center">
               <p className="text-xs text-slate-400 dark:text-slate-500">
                  Sistema de uso restrito da MCS Chat.
               </p>
            </div>

         </div>
      </div>

    </div>
  )
}
