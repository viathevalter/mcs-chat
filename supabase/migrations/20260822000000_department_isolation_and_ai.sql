-- Migration: Department Isolation, AI Agents, Private Notes and Company Channels
-- Date: 2026-08-22

-- 1. Create chat_ai_agents table
CREATE TABLE IF NOT EXISTS public.chat_ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  rules JSONB DEFAULT '[]'::jsonb,
  llm_model TEXT DEFAULT 'gemini-1.5-flash',
  temperature NUMERIC DEFAULT 0.3,
  department_id UUID REFERENCES public.mcs_departments(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Alter chat_channels to link with companies and AI agents
ALTER TABLE public.chat_channels 
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES core_common.empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES public.chat_ai_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instance_name TEXT,
  ADD COLUMN IF NOT EXISTS instance_token TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS qrcode_base64 TEXT,
  ADD COLUMN IF NOT EXISTS auto_reject_calls BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS call_reject_message TEXT DEFAULT 'Olá! Nosso atendimento é realizado exclusivamente por mensagens de texto e áudio aqui no WhatsApp para garantir o registro do seu histórico. Por favor, envie sua dúvida por mensagem que responderemos em breve!';

-- 3. Alter chat_conversations for department isolation, AI bot status and collaborators
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.mcs_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bot_status TEXT DEFAULT 'active', -- 'active', 'paused', 'off'
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt',
  ADD COLUMN IF NOT EXISTS collaborators UUID[] DEFAULT '{}'::UUID[],
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'; -- 'low', 'normal', 'high', 'urgent'

-- 4. Alter chat_messages for private internal notes and AI flag
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false;

-- 5. Alter mcs_users to ensure managed_departments and department_id exist
ALTER TABLE public.mcs_users
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.mcs_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS managed_departments UUID[] DEFAULT '{}'::UUID[];

-- 6. Insert Default AI Agents if not exist
INSERT INTO public.chat_ai_agents (id, name, description, system_prompt, rules, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Agente de Recepção & Triagem Geral',
  'Agente padrão para canais de WhatsApp de trabalhadores das empresas',
  'Você é o assistente virtual oficial das empresas do grupo MCS (Stocco, Luminous, Triângulo, Wiseowe e Kotrik). Sua missão é atender trabalhadores com gentileza, presteza e profissionalismo. Identifique o trabalhador e sua necessidade com base nas regras fornecidas. Responda sempre no mesmo idioma do trabalhador (Português ou Espanhol).',
  '[
    {
      "id": "acidente",
      "topic": "Acidente de Trabalho",
      "action": "urgent_handoff",
      "target_department": "Recursos Humanos",
      "rule": "Se o trabalhador relatar qualquer acidente ou emergência médica, NÃO dê opiniões técnicas. Acolha com calma, pergunte apenas onde está e faça transferência IMEDIATA com urgência para a equipe de Segurança e RH."
    },
    {
      "id": "adiantamento",
      "topic": "Adiantamento / Vales",
      "action": "check_date_rule",
      "target_department": "Financeiro",
      "deadline_day": 10,
      "rule": "Solicitações de vale/adiantamento são aceitas exclusivamente do dia 01 ao dia 10 de cada mês. Se a data atual for após o dia 10, informe com educação que o prazo para adiantamentos do mês vigente já encerrou (limite dia 10) e oriente sobre o próximo ciclo. Se estiver no prazo, colete o valor e transfira para o Financeiro."
    },
    {
      "id": "holerite",
      "topic": "Holerite / Dúvida em Descontos",
      "action": "handoff",
      "target_department": "Financeiro",
      "rule": "Solicite qual o mês de referência e qual o valor ou desconto contestado, e transfira para a equipe do Financeiro com o resumo."
    },
    {
      "id": "alojamento",
      "topic": "Alojamentos / Habitação",
      "action": "handoff",
      "target_department": "Logística",
      "rule": "Para solicitações de manutenção, troca de alojamento ou transporte, colete os detalhes e transfira para o departamento de Logística."
    }
  ]'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;

-- 7. RLS policies
ALTER TABLE public.chat_ai_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated all chat_ai_agents" ON public.chat_ai_agents;
CREATE POLICY "Allow authenticated all chat_ai_agents" ON public.chat_ai_agents FOR ALL TO authenticated USING (true) WITH CHECK (true);
