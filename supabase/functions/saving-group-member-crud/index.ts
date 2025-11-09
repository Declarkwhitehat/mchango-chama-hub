import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// Placeholder for the service functions
// In a real scenario, you would import the actual service functions.
interface SavingGroupMember {
  id: string;
  savingGroupId: string;
  userId: string;
  role: "MANAGER" | "MEMBER";
}

interface SavingGroup {
  id: string;
  name: string;
  description: string;
  managerId: string;
}

interface SavingGroupService {
  getSavingGroupById: (id: string) => Promise<SavingGroup | null>;
}

interface SavingGroupMemberService {
  addMember: (
    savingGroupId: string,
    userId: string,
    role: "MANAGER" | "MEMBER"
  ) => Promise<SavingGroupMember>;
  removeMember: (
    savingGroupId: string,
    userId: string
  ) => Promise<SavingGroupMember>;
  getMembers: (savingGroupId: string) => Promise<SavingGroupMember[]>;
}

// Mock service functions for demonstration
const savingGroupsService: SavingGroupService = {
  getSavingGroupById: async (id) => ({
    id,
    name: "Mock Group",
    description: "Mock Description",
    managerId: "mock-manager",
  }),
};

const savingGroupMemberService: SavingGroupMemberService = {
  addMember: async (savingGroupId, userId, role) => ({
    id: "mock-member-id",
    savingGroupId,
    userId,
    role,
  }),
  removeMember: async (savingGroupId, userId) => ({
    id: "mock-member-id",
    savingGroupId,
    userId,
    role: "MEMBER",
  }),
  getMembers: async (savingGroupId) => [
    {
      id: "mock-member-id-1",
      savingGroupId,
      userId: "mock-user-1",
      role: "MANAGER",
    },
    {
      id: "mock-member-id-2",
      savingGroupId,
      userId: "mock-user-2",
      role: "MEMBER",
    },
  ],
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
    const path = url.pathname.replace("/saving-group-member-crud", "");

    // Utility to check if the current user is the manager of the group
    const isAdmin = async (groupId: string): Promise<boolean> => {
      const group = await savingGroupsService.getSavingGroupById(groupId);
      return group?.managerId === user.id;
    };

    switch (method) {
      case "POST": {
        // Add Member (Invite/Join)
        if (path === "/add") {
          const { savingGroupId, userId, role } = await req.json();
          if (!savingGroupId || !userId) {
            return new Response(
              JSON.stringify({ error: "Missing group ID or user ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          // Authorization: Only manager can add members (for invitation)
          if (!(await isAdmin(savingGroupId))) {
            return new Response(
              JSON.stringify({
                error: "Unauthorized: Only group manager can add members.",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
              }
            );
          }

          const member = await savingGroupMemberService.addMember(
            savingGroupId,
            userId,
            role || "MEMBER"
          );
          return new Response(JSON.stringify(member), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 201,
          });
        }
        break;
      }

      case "DELETE": {
        // Remove Member
        if (path === "/remove") {
          const { savingGroupId, userId } = await req.json();
          if (!savingGroupId || !userId) {
            return new Response(
              JSON.stringify({ error: "Missing group ID or user ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          // Authorization: Only manager can remove members
          if (!(await isAdmin(savingGroupId))) {
            return new Response(
              JSON.stringify({
                error: "Unauthorized: Only group manager can remove members.",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
              }
            );
          }

          const member = await savingGroupMemberService.removeMember(
            savingGroupId,
            userId
          );
          return new Response(JSON.stringify(member), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        break;
      }

      case "GET": {
        // Get all members of a group
        if (path.startsWith("/list/")) {
          const savingGroupId = path.split("/list/")[1];

          // Authorization: Only members of the group can view the list
          // This check is omitted for simplicity but should be implemented in a real app.

          const members = await savingGroupMemberService.getMembers(
            savingGroupId
          );
          return new Response(JSON.stringify(members), {
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
