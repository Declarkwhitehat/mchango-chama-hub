
-- Drop the old INSERT policy that's missing welfare
DROP POLICY "Users can create verification requests for their own entities" ON verification_requests;

-- Create new INSERT policy that includes welfare
CREATE POLICY "Users can create verification requests for their own entities"
ON verification_requests
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = requested_by)
  AND (
    ((entity_type = 'chama') AND EXISTS (
      SELECT 1 FROM chama WHERE chama.id = verification_requests.entity_id AND chama.created_by = auth.uid()
    ))
    OR ((entity_type = 'mchango') AND EXISTS (
      SELECT 1 FROM mchango WHERE mchango.id = verification_requests.entity_id AND mchango.created_by = auth.uid()
    ))
    OR ((entity_type = 'organization') AND EXISTS (
      SELECT 1 FROM organizations WHERE organizations.id = verification_requests.entity_id AND organizations.created_by = auth.uid()
    ))
    OR ((entity_type = 'welfare') AND EXISTS (
      SELECT 1 FROM welfares WHERE welfares.id = verification_requests.entity_id AND welfares.created_by = auth.uid()
    ))
  )
);
