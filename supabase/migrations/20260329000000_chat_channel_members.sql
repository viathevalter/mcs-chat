CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.mcs_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access chat_channel_members" ON public.chat_channel_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated all access chat_channel_members" ON public.chat_channel_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
