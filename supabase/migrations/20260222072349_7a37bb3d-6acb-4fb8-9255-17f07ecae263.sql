ALTER TABLE public.chama_rejoin_requests
ADD CONSTRAINT chama_rejoin_requests_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);