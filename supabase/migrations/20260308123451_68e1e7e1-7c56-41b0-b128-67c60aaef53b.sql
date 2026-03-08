ALTER TABLE public.transactions
ADD CONSTRAINT transactions_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);