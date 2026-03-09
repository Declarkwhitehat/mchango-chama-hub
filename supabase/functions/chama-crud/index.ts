import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim() || null;
    
    // Create Supabase client with anon key and forward Authorization for user context
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
        auth: {
          persistSession: false,
        },
      }
    );

    // Create admin client for user verification
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    const id = lastPart === 'chama-crud' ? null : lastPart;
    console.log('chama-crud request', { method: req.method, path: url.pathname, hasAuth: !!authHeader });

    // GET /chama-crud - List all active chamas
    if (req.method === 'GET' && !id) {
      const { data, error } = await supabaseClient
        .from('chama')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email
          ),
          chama_members (
            id,
            member_code,
            is_manager,
            status
          )
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /chama-crud/:id - Get single chama by ID or slug
    if (req.method === 'GET' && id) {
      console.log('Fetching chama by id or slug:', id);
      
      // Try by slug first (with normalization that trims trailing hyphens)
      const slugCandidate = id as string;
      const normalizedSlug = slugCandidate.replace(/-+$/, '');

      const { data: bySlug, error: slugError } = await supabaseClient
        .from('chama')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email,
            phone
          ),
          chama_members!chama_members_chama_id_fkey (
            id,
            user_id,
            member_code,
            is_manager,
            joined_at,
            status,
            approval_status,
            order_index,
            profiles!chama_members_user_id_fkey (
              full_name,
              email
            )
          )
        `)
        .eq('slug', slugCandidate)
        .maybeSingle();
      
      if (slugError) {
        console.error('Error fetching by slug:', slugError);
      }
      
      if (bySlug) {
        console.log('Found chama by slug:', bySlug.id);
        return new Response(JSON.stringify({ data: bySlug }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Try normalized slug (without trailing hyphens)
      if (normalizedSlug !== slugCandidate) {
        const { data: byNormalizedSlug, error: normalizedSlugError } = await supabaseClient
          .from('chama')
          .select(`
            *,
            profiles:created_by (
              full_name,
              email,
              phone
            ),
            chama_members!chama_members_chama_id_fkey (
              id,
              user_id,
              member_code,
              is_manager,
              joined_at,
              status,
              approval_status,
              order_index,
              profiles!chama_members_user_id_fkey (
                full_name,
                email
              )
            )
          `)
          .eq('slug', normalizedSlug)
          .maybeSingle();

        if (normalizedSlugError) {
          console.error('Error fetching by normalized slug:', normalizedSlugError);
        }

        if (byNormalizedSlug) {
          console.log('Found chama by normalized slug:', byNormalizedSlug.id);
          return new Response(JSON.stringify({ data: byNormalizedSlug }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Try by ID
      const { data, error } = await supabaseClient
        .from('chama')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email,
            phone
          ),
          chama_members!chama_members_chama_id_fkey (
            id,
            user_id,
            member_code,
            is_manager,
            joined_at,
            status,
            approval_status,
            order_index,
            profiles!chama_members_user_id_fkey (
              full_name,
              email
            )
          )
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching by id:', error);
        return new Response(JSON.stringify({ 
          error: 'Database error',
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (!data) {
        console.log('Chama not found:', id);
        return new Response(JSON.stringify({ error: 'Chama not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Found chama by id:', data.id);
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /chama-crud - Handle both creation and fetching
    if (req.method === 'POST') {
      let body;
      try {
        const text = await req.text();
        console.log('Request body text:', text);
        body = text ? JSON.parse(text) : {};
      } catch (parseError: any) {
        console.error('JSON parse error:', parseError);
        return new Response(JSON.stringify({ 
          error: 'Invalid JSON in request body',
          details: parseError.message
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const chamaId = body.chama_id || id;
      
      // If chama_id is provided, this is a fetch request
      if (chamaId) {
        console.log('Fetching chama via POST with id:', chamaId);
        
        // Try by slug first (with normalization)
        const slugCandidate = String(chamaId);
        const normalizedSlug = slugCandidate.replace(/-+$/, '');

        const { data: bySlug, error: slugError } = await supabaseClient
          .from('chama')
          .select(`
            *,
            profiles:created_by (
              full_name,
              email,
              phone
            ),
            chama_members!chama_members_chama_id_fkey (
              id,
              user_id,
              member_code,
              is_manager,
              joined_at,
              status,
              approval_status,
              order_index,
              profiles!chama_members_user_id_fkey (
                full_name,
                email
              )
            )
          `)
          .eq('slug', slugCandidate)
          .maybeSingle();
        
        if (slugError) {
          console.error('Error fetching by slug:', slugError);
        }
        
        if (bySlug) {
          console.log('Found chama by slug:', bySlug.id);
          return new Response(JSON.stringify({ data: bySlug }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Try normalized slug
        if (normalizedSlug !== slugCandidate) {
          const { data: byNormalizedSlug, error: normalizedSlugError } = await supabaseClient
            .from('chama')
            .select(`
              *,
              profiles:created_by (
                full_name,
                email,
                phone
              ),
              chama_members!chama_members_chama_id_fkey (
                id,
                user_id,
                member_code,
                is_manager,
                joined_at,
                status,
                approval_status,
                order_index,
                profiles!chama_members_user_id_fkey (
                  full_name,
                  email
                )
              )
            `)
            .eq('slug', normalizedSlug)
            .maybeSingle();

          if (normalizedSlugError) {
            console.error('Error fetching by normalized slug:', normalizedSlugError);
          }

          if (byNormalizedSlug) {
            console.log('Found chama by normalized slug:', byNormalizedSlug.id);
            return new Response(JSON.stringify({ data: byNormalizedSlug }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // Try by ID
        const { data, error } = await supabaseClient
          .from('chama')
          .select(`
            *,
            profiles:created_by (
              full_name,
              email,
              phone
            ),
            chama_members!chama_members_chama_id_fkey (
              id,
              user_id,
              member_code,
              is_manager,
              joined_at,
              status,
              approval_status,
              order_index,
              profiles!chama_members_user_id_fkey (
                full_name,
                email
              )
            )
          `)
          .eq('id', chamaId)
          .maybeSingle();
        
        if (error) {
          console.error('Error fetching by id:', error);
          return new Response(JSON.stringify({ 
            error: 'Database error',
            details: error.message
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        if (!data) {
          console.log('Chama not found:', chamaId);
          return new Response(JSON.stringify({ error: 'Chama not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('Found chama by id:', data.id);
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Otherwise, this is a create request - require authentication
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      console.log('chama-crud POST create', { hasUser: !!user, userId: user?.id });

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check KYC status
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('kyc_status')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        return new Response(JSON.stringify({ error: 'Profile not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (profile.kyc_status !== 'approved') {
        return new Response(JSON.stringify({ 
          error: 'You must complete verification before creating a Chama.',
          message: 'Only KYC-approved users can create chamas. Please complete your KYC verification first.',
          kyc_status: profile.kyc_status
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate constraints
      const minMembers = body.min_members || 2;
      const maxMembers = body.max_members || 50;

      if (minMembers < 2) {
        return new Response(JSON.stringify({ error: 'Minimum members must be at least 2' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (maxMembers > 100) {
        return new Response(JSON.stringify({ error: 'Maximum members cannot exceed 100' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (maxMembers < minMembers) {
        return new Response(JSON.stringify({ error: 'Maximum members must be greater than minimum members' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate every_n_days_count if frequency is every_n_days
      if (body.contribution_frequency === 'every_n_days' && (!body.every_n_days_count || body.every_n_days_count < 1)) {
        return new Response(JSON.stringify({ error: 'Every N days count must be specified and greater than 0' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate monthly contribution day(s)
      if ((body.contribution_frequency === 'monthly' || body.contribution_frequency === 'twice_monthly') && body.monthly_contribution_day) {
        if (body.monthly_contribution_day < 1 || body.monthly_contribution_day > 28) {
          return new Response(JSON.stringify({ error: 'Monthly contribution day must be between 1 and 28' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      if (body.contribution_frequency === 'twice_monthly') {
        if (!body.monthly_contribution_day || !body.monthly_contribution_day_2) {
          return new Response(JSON.stringify({ error: 'Both contribution days are required for twice monthly frequency' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (body.monthly_contribution_day_2 < 1 || body.monthly_contribution_day_2 > 28) {
          return new Response(JSON.stringify({ error: 'Second contribution day must be between 1 and 28' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (body.monthly_contribution_day === body.monthly_contribution_day_2) {
          return new Response(JSON.stringify({ error: 'The two contribution days must be different' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Validate required fields and generate a safe slug
      if (!body?.name || typeof body.name !== 'string') {
        return new Response(JSON.stringify({ error: 'name is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check for duplicate name
      const { data: existingChama } = await supabaseAdmin
        .from('chama')
        .select('id')
        .ilike('name', body.name.trim())
        .maybeSingle();

      if (existingChama) {
        return new Response(JSON.stringify({ error: 'A chama with this name already exists. Please choose a different name.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const base = (body.slug || body.name).toString().trim();
      // Generate unique slug by appending random string
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const slug = base
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+$/, '') + '-' + randomSuffix;

      const { data, error } = await supabaseClient
        .from('chama')
        .insert({
          name: body.name,
          description: body.description,
          slug: body.slug || slug,
          contribution_amount: body.contribution_amount,
          contribution_frequency: body.contribution_frequency,
          every_n_days_count: body.every_n_days_count,
          monthly_contribution_day: body.monthly_contribution_day || null,
          monthly_contribution_day_2: body.monthly_contribution_day_2 || null,
          min_members: minMembers,
          max_members: maxMembers,
          is_public: body.is_public !== undefined ? body.is_public : true,
          payout_order: body.payout_order || 'join_date',
          commission_rate: body.commission_rate || 0.05,
          whatsapp_link: body.whatsapp_link,
          created_by: user.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Chama creation error:', error);
        throw error;
      }

      // Creator is automatically added as manager via trigger
      console.log('Chama created successfully:', data.id);

      return new Response(JSON.stringify({ data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /chama-crud/:id - Update chama
    if (req.method === 'PUT' && id) {
      const body = await req.json();

      // Check if chama is in cycle_complete status - only allow specific fields
      const { data: currentChama } = await supabaseClient
        .from('chama')
        .select('status')
        .eq('id', id)
        .single();

      if (currentChama?.status === 'cycle_complete') {
        const allowedFields = ['contribution_amount', 'contribution_frequency', 'every_n_days_count', 'whatsapp_link'];
        const filteredBody: Record<string, any> = {};
        for (const key of allowedFields) {
          if (body[key] !== undefined) {
            filteredBody[key] = body[key];
          }
        }
        filteredBody.updated_at = new Date().toISOString();

        const { data, error } = await supabaseClient
          .from('chama')
          .update(filteredBody)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        // Send SMS to all members about updated terms
        if (filteredBody.contribution_amount || filteredBody.contribution_frequency) {
          const { data: members } = await supabaseAdmin
            .from('chama_members')
            .select('profiles!chama_members_user_id_fkey(phone)')
            .eq('chama_id', id);

          const { data: updatedChama } = await supabaseAdmin
            .from('chama')
            .select('name, contribution_amount, contribution_frequency')
            .eq('id', id)
            .single();

          if (members && updatedChama) {
            const smsPromises = members.map(async (m: any) => {
              const phone = m.profiles?.phone;
              if (!phone) return;
              const message = `📝 Terms updated for "${updatedChama.name}": KES ${updatedChama.contribution_amount} (${updatedChama.contribution_frequency}). Review and confirm before rejoining.`;
              try {
                await supabaseAdmin.functions.invoke('send-transactional-sms', {
                  body: { phone, message, eventType: 'chama_terms_updated' }
                });
              } catch (err) {
                console.error('SMS error:', err);
              }
            });
            await Promise.all(smsPromises);
          }
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const { data, error } = await supabaseClient
        .from('chama')
        .update(body)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /chama-crud/:id - Soft delete (set status to inactive)
    if (req.method === 'DELETE' && id) {
      const { data, error } = await supabaseClient
        .from('chama')
        .update({ status: 'inactive' })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in chama-crud:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
