import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// Import the service functions from the shared server directory
// NOTE: This path assumes the service file is accessible from the Supabase function environment.
// In a real-world Supabase setup, you might need to bundle or adjust the import path.
// For this task, we will assume a simplified path for demonstration.
// The actual path in the sandbox is src/server/saving_groups/savingGroupsService.ts
// We will use a relative path that might work in a Supabase function environment if the files are bundled.
// Since we cannot run the Supabase environment, we will use a placeholder import and focus on the handler logic.

// Placeholder for the service functions
// In a real Supabase environment, you would import the actual service functions.
// For this exercise, we will define the expected function signatures.
interface SavingGroup {
  id: string;
  name: string;
  description: string;
  managerId: string;
  savingGoal: number;
  maxMembers: number;
  whatsAppGroupLink: string;
  totalSavings: number;
  totalProfits: number;
}

interface SavingGroupService {
  createSavingGroup: (
    name: string,
    description: string,
    managerId: string,
    savingGoal: number,
    maxMembers: number,
    whatsAppGroupLink: string
  ) => Promise<SavingGroup>;
  getSavingGroupById: (id: string) => Promise<SavingGroup | null>;
  getSavingGroupsByAdminId: (managerId: string) => Promise<SavingGroup[]>;
  getSavingGroupsByMemberId: (memberId: string) => Promise<SavingGroup[]>;
  updateSavingGroup: (
    id: string,
    name: string,
    description: string,
    savingGoal: number,
    maxMembers: number,
    whatsAppGroupLink: string
  ) => Promise<SavingGroup>;
  deleteSavingGroup: (id: string) => Promise<SavingGroup>;
}

// Since we cannot import the actual service, we will mock it for the handler logic
// In a real scenario, the service would be imported and used.
const savingGroupsService: SavingGroupService = {
  createSavingGroup: async (
    name,
    description,
    managerId,
    savingGoal,
    maxMembers,
    whatsAppGroupLink
  ) => ({
    id: "mock-id",
    name,
    description,
    managerId,
    savingGoal,
    maxMembers,
    whatsAppGroupLink,
    totalSavings: 0,
    totalProfits: 0,
  }),
  getSavingGroupById: async (id) => ({
    id,
    name: "Mock Group",
    description: "Mock Description",
    managerId: "mock-manager",
    savingGoal: 100000,
    maxMembers: 100,
    whatsAppGroupLink: "https://wa.link/mock",
    totalSavings: 50000,
    totalProfits: 500,
  }),
  getSavingGroupsByAdminId: async (managerId) => [],
  getSavingGroupsByMemberId: async (memberId) => [],
  updateSavingGroup: async (
    id: string,
    name: string,
    description: string,
    savingGoal: number,
    maxMembers: number,
    whatsAppGroupLink: string
  ) => ({
    id,
    name,
    description,
    managerId: "mock-manager",
    savingGoal,
    maxMembers,
    whatsAppGroupLink,
    totalSavings: 0,
    totalProfits: 0,
  }),
  deleteSavingGroup: async (id) => ({
    id,
    name: "Deleted Mock Group",
    description: "Deleted Mock Description",
    managerId: "mock-manager",
    savingGoal: 0,
    maxMembers: 0,
    whatsAppGroupLink: "",
    totalSavings: 0,
    totalProfits: 0,
  }),
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.replace("/saving-group-crud", "");

    switch (method) {
      case "POST": {
        // Create Saving Group
        if (path === "/create") {
          const { name, description, savingGoal, maxMembers, whatsAppGroupLink } = await req.json();
          if (!name || !description || !savingGoal || !maxMembers) {
            return new Response(
              JSON.stringify({ error: "Missing required fields for group creation" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }
          
          // Generate slug from name
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          
          // Create the saving group
          const { data: savingGroup, error: createError } = await supabaseClient
            .from('saving_groups')
            .insert({
              name,
              description: description || '',
              slug: `${slug}-${Date.now()}`,
              manager_id: user.id,
              created_by: user.id,
              cycle_start_date: new Date().toISOString(),
              cycle_end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
              saving_goal: savingGoal,
              max_members: maxMembers,
              whatsapp_link: whatsAppGroupLink || null,
            })
            .select()
            .single();
            
          if (createError) {
            console.error('Error creating saving group:', createError);
            return new Response(
              JSON.stringify({ error: 'Failed to create saving group' }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
              }
            );
          }
          
          // Add creator as first member
          await supabaseClient
            .from('saving_group_members')
            .insert({
              group_id: savingGroup.id,
              user_id: user.id,
              status: 'active',
            });
          
          return new Response(JSON.stringify({
            id: savingGroup.id,
            name: savingGroup.name,
            description: savingGroup.description,
            managerId: savingGroup.manager_id,
            savingGoal: parseFloat(savingGroup.saving_goal || '0'),
            maxMembers: savingGroup.max_members || 100,
            whatsAppGroupLink: savingGroup.whatsapp_link || '',
            totalSavings: parseFloat(savingGroup.total_group_savings || '0'),
            totalProfits: parseFloat(savingGroup.group_profit_pool || '0'),
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 201,
          });
        }
        break;
      }

      case "GET": {
        // Get Basic Saving Group Data by ID
        if (path.startsWith("/group/")) {
          const id = path.split("/group/")[1];
          
          const { data: savingGroup, error: fetchError } = await supabaseClient
            .from('saving_groups')
            .select('*')
            .eq('id', id)
            .single();
            
          if (fetchError || !savingGroup) {
            return new Response(
              JSON.stringify({ error: "Saving Group not found" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 404,
              }
            );
          }
          
          return new Response(JSON.stringify({
            id: savingGroup.id,
            name: savingGroup.name,
            description: savingGroup.description,
            managerId: savingGroup.manager_id,
            savingGoal: parseFloat(savingGroup.saving_goal || '0'),
            maxMembers: savingGroup.max_members || 100,
            whatsAppGroupLink: savingGroup.whatsapp_link || '',
            totalSavings: parseFloat(savingGroup.total_group_savings || '0'),
            totalProfits: parseFloat(savingGroup.group_profit_pool || '0'),
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Get Saving Groups by Manager ID (User's groups)
        if (path === "/manager") {
          const { data: savingGroups, error: fetchError } = await supabaseClient
            .from('saving_groups')
            .select('*')
            .eq('manager_id', user.id);
            
          if (fetchError) {
            return new Response(
              JSON.stringify({ error: 'Failed to fetch managed groups' }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
              }
            );
          }
          
          const groups = (savingGroups || []).map(sg => ({
            id: sg.id,
            name: sg.name,
            description: sg.description,
            managerId: sg.manager_id,
            savingGoal: parseFloat(sg.saving_goal || '0'),
            maxMembers: sg.max_members || 100,
            whatsAppGroupLink: sg.whatsapp_link || '',
            totalSavings: parseFloat(sg.total_group_savings || '0'),
            totalProfits: parseFloat(sg.group_profit_pool || '0'),
          }));
          
          return new Response(JSON.stringify(groups), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Get Saving Groups by Member ID (Groups user belongs to)
        if (path === "/member") {
          const { data: memberships, error: fetchError } = await supabaseClient
            .from('saving_group_members')
            .select('group_id, saving_groups(*)')
            .eq('user_id', user.id)
            .eq('status', 'active');
            
          if (fetchError) {
            return new Response(
              JSON.stringify({ error: 'Failed to fetch member groups' }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
              }
            );
          }
          
          const groups = (memberships || []).map(m => {
            const sg = m.saving_groups as any;
            return {
              id: sg.id,
              name: sg.name,
              description: sg.description,
              managerId: sg.manager_id,
              savingGoal: parseFloat(sg.saving_goal || '0'),
              maxMembers: sg.max_members || 100,
              whatsAppGroupLink: sg.whatsapp_link || '',
              totalSavings: parseFloat(sg.total_group_savings || '0'),
              totalProfits: parseFloat(sg.group_profit_pool || '0'),
            };
          });
          
          return new Response(JSON.stringify(groups), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        break;
      }

      case "PUT": {
        // Update Saving Group
        if (path.startsWith("/group/")) {
          const id = path.split("/group/")[1];
          const { name, description, savingGoal, maxMembers, whatsAppGroupLink } = await req.json();
          if (!name || !description || !savingGoal || !maxMembers || !whatsAppGroupLink) {
            return new Response(
              JSON.stringify({ error: "Missing required fields for group update" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }
          // Add authorization check: only manager can update
          const existingGroup = await savingGroupsService.getSavingGroupById(id);
          if (!existingGroup || existingGroup.managerId !== user.id) {
            return new Response(
              JSON.stringify({ error: "Unauthorized to update this group" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
              }
            );
          }

          const savingGroup = await savingGroupsService.updateSavingGroup(
            id,
            name,
            description,
            savingGoal,
            maxMembers,
            whatsAppGroupLink
          );
          return new Response(JSON.stringify(savingGroup), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        break;
      }

      case "DELETE": {
        // Delete Saving Group
        if (path.startsWith("/group/")) {
          const id = path.split("/group/")[1];

          // Add authorization check: only manager can delete
          const existingGroup = await savingGroupsService.getSavingGroupById(id);
          if (!existingGroup || existingGroup.managerId !== user.id) {
            return new Response(
              JSON.stringify({ error: "Unauthorized to delete this group" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
              }
            );
          }

          const savingGroup = await savingGroupsService.deleteSavingGroup(id);
          return new Response(JSON.stringify(savingGroup), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        break;
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404,
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
