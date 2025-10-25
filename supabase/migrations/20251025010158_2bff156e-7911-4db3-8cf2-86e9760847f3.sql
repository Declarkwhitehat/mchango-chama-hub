-- Fix Chama: Allow approved members to access their chamas immediately
-- Drop existing restrictive policies and create comprehensive ones

-- CHAMA TABLE: Allow approved members and admins to view
DROP POLICY IF EXISTS "Approved members can view their chama" ON public.chama;
CREATE POLICY "Approved members can view their chama" 
ON public.chama 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  is_chama_member(auth.uid(), id) OR 
  is_chama_manager(auth.uid(), id)
);

-- CHAMA_MEMBERS TABLE: Allow approved members to view all members in their chama
DROP POLICY IF EXISTS "Chama members can view all member details including pending" ON public.chama_members;
CREATE POLICY "Chama members can view all member details including pending" 
ON public.chama_members 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  user_id = auth.uid() OR 
  is_chama_member(auth.uid(), chama_id) OR 
  is_chama_manager(auth.uid(), chama_id)
);

-- CONTRIBUTIONS TABLE: Allow approved members to view and create contributions
DROP POLICY IF EXISTS "Members can view contributions in their chama" ON public.contributions;
CREATE POLICY "Members can view contributions in their chama" 
ON public.contributions 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM chama_members
    WHERE chama_members.chama_id = contributions.chama_id
    AND chama_members.user_id = auth.uid()
    AND chama_members.approval_status = 'approved'
  )
);

DROP POLICY IF EXISTS "Members can create contributions" ON public.contributions;
CREATE POLICY "Members can create contributions" 
ON public.contributions 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM chama_members
    WHERE chama_members.id = contributions.member_id
    AND chama_members.user_id = auth.uid()
    AND chama_members.approval_status = 'approved'
  )
);

-- MCHANGO TABLE: Allow all verified users to view active mchangos
DROP POLICY IF EXISTS "Public can view active mchangos" ON public.mchango;
CREATE POLICY "Verified users can view active mchangos" 
ON public.mchango 
FOR SELECT 
USING (
  status = 'active'::mchango_status AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.kyc_status = 'approved'::kyc_status
    )
  )
);

-- MCHANGO_DONATIONS TABLE: Allow verified users to view and create donations
DROP POLICY IF EXISTS "Anyone can view donations for public mchangos" ON public.mchango_donations;
CREATE POLICY "Verified users can view donations for active mchangos" 
ON public.mchango_donations 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM mchango
    WHERE mchango.id = mchango_donations.mchango_id
    AND mchango.status = 'active'::mchango_status
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.kyc_status = 'approved'::kyc_status
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can create donations" ON public.mchango_donations;
CREATE POLICY "Verified users can create donations" 
ON public.mchango_donations 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      (user_id = auth.uid() OR user_id IS NULL) AND
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.kyc_status = 'approved'::kyc_status
      )
    )
  )
);

-- WITHDRAWALS TABLE: Allow admins full access
CREATE POLICY "Admins can insert withdrawals" 
ON public.withdrawals 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete withdrawals" 
ON public.withdrawals 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- MEMBER_CYCLE_PAYMENTS: Allow admins to view all
CREATE POLICY "Admins can view all cycle payments" 
ON public.member_cycle_payments 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- CONTRIBUTION_CYCLES: Allow admins full access
CREATE POLICY "Admins can view all cycles" 
ON public.contribution_cycles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update cycles" 
ON public.contribution_cycles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete cycles" 
ON public.contribution_cycles 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- TRANSACTIONS: Allow admins to update and delete
CREATE POLICY "Admins can update transactions" 
ON public.transactions 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete transactions" 
ON public.transactions 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- CHAMA_INVITE_CODES: Allow admins full access
CREATE POLICY "Admins can view all invite codes" 
ON public.chama_invite_codes 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete invite codes" 
ON public.chama_invite_codes 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- PAYOUTS: Ensure admins have complete access
DROP POLICY IF EXISTS "Admins can manage payouts" ON public.payouts;
CREATE POLICY "Admins can view payouts" 
ON public.payouts 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.uid() = recipient_id
);

CREATE POLICY "Admins can insert payouts" 
ON public.payouts 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update payouts" 
ON public.payouts 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete payouts" 
ON public.payouts 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));