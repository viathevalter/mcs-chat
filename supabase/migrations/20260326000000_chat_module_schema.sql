CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT,
  department_id UUID REFERENCES public.mcs_departments(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES core_personal.workers(id) ON DELETE SET NULL,
  company_id BIGINT REFERENCES public.empresas(id) ON DELETE SET NULL,
  pedido_id BIGINT REFERENCES public.pedidos(id) ON DELETE SET NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  status TEXT DEFAULT 'open',
  category_tag TEXT,
  assigned_to UUID REFERENCES public.mcs_users(id) ON DELETE SET NULL,
  unread_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  status TEXT DEFAULT 'sent',
  external_id TEXT UNIQUE,
  sender_name TEXT,
  sender_user_id UUID REFERENCES public.mcs_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_worker_id UUID REFERENCES core_personal.workers(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access chat_channels" ON public.chat_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated all access chat_channels" ON public.chat_channels FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read access chat_conversations" ON public.chat_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated all access chat_conversations" ON public.chat_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read access chat_messages" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated all access chat_messages" ON public.chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read access chat_scheduled_messages" ON public.chat_scheduled_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated all access chat_scheduled_messages" ON public.chat_scheduled_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_chat_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_chat_channels_updated_at BEFORE UPDATE ON public.chat_channels FOR EACH ROW EXECUTE PROCEDURE update_chat_updated_at_column();
CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE PROCEDURE update_chat_updated_at_column();
CREATE TRIGGER update_chat_scheduled_messages_updated_at BEFORE UPDATE ON public.chat_scheduled_messages FOR EACH ROW EXECUTE PROCEDURE update_chat_updated_at_column();
