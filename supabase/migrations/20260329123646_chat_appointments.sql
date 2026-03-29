CREATE TABLE IF NOT EXISTS public.chat_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.mcs_users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read chat_appointments" ON public.chat_appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated all chat_appointments" ON public.chat_appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
