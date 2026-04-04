CREATE POLICY "Service role can delete old messages"
ON public.chama_messages
FOR DELETE
TO public
USING (true);