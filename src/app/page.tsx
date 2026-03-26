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
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/inbox')
    })
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError('Credenciais inválidas. Verifique seu e-mail e senha.')
      setLoading(false)
    } else {
      router.push('/inbox')
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-slate-50 dark:bg-slate-900 selection:bg-indigo-500/30">
      
      {/* Lado Esquerdo - Decorativo */}
      <div className="hidden lg:flex w-1/2 relative bg-indigo-600 overflow-hidden items-center justify-center">
         <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-indigo-700 z-0"></div>
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay z-10"></div>
         
         <div className="relative z-20 text-white max-w-lg px-12">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 mb-8 shadow-xl">
               <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-5xl font-black mb-6 leading-[1.1] tracking-tight">
               O hub de comunicação GESTAOLOGINPRO.
            </h1>
            <p className="text-indigo-100 text-lg leading-relaxed font-medium">
               Gerencie múltiplos provedores de WhatsApp, converse com seus colaboradores em tempo real e orquestre o atendimento com o AI Capitão.
            </p>
            
            <div className="mt-12 flex items-center gap-4 text-indigo-200">
               <div className="flex -space-x-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-400 border-2 border-indigo-600"></div>
                  <div className="w-10 h-10 rounded-full bg-indigo-300 border-2 border-indigo-600"></div>
                  <div className="w-10 h-10 rounded-full bg-indigo-200 border-2 border-indigo-600"></div>
               </div>
               <span className="text-sm font-bold tracking-wide">Plataforma Exclusiva</span>
            </div>
         </div>
      </div>

      {/* Lado Direito - Formulario de Login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-24 bg-white dark:bg-slate-900 transition-colors">
         <div className="w-full max-w-md">
            
            <div className="mb-10 text-center lg:text-left">
               <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 mb-6 lg:hidden mx-auto">
                  <Building2 className="w-7 h-7 text-white" />
               </div>
               <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2 tracking-tight">Bem-vindo de volta</h2>
               <p className="text-slate-500 dark:text-slate-400 font-medium">Faça login com sua conta GESTAOLOGINPRO para acessar o Inbox.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
               
               {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-center gap-3">
                     <AlertCircle className="hidden" /> {/* keeping space, no icon to save import */}
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
                        className="w-full py-4 pl-12 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-[15px] font-medium transition-all text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        placeholder="nome@universatv.com.br"
                     />
                  </div>
               </div>

               <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between ml-1 mb-1.5">
                     <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Senha</label>
                     <a href="#" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors">Esqueceu a senha?</a>
                  </div>
                  <div className="relative">
                     <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                     <input 
                        type="password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full py-4 pl-12 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-[15px] font-medium transition-all text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        placeholder="••••••••"
                     />
                  </div>
               </div>

               <div className="pt-4">
                  <button 
                     type="submit"
                     disabled={loading}
                     className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:hover:translate-y-0 flex items-center justify-center gap-2 group"
                  >
                     {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                     ) : (
                        <>
                           Entrar no Sistema
                           <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                     )}
                  </button>
               </div>
               
               <p className="text-center text-sm text-slate-500 dark:text-slate-400 font-medium mt-8">
                  Sistema de uso restrito da GESTAOLOGINPRO.
               </p>
            </form>
         </div>
      </div>
    </div>
  )
}
