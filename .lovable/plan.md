

## Plan: Enforce Unique Names Across Chama, Mchango, Organizations, and Welfares

### Problem
Currently, multiple chamas, campaigns, organizations, or welfares can share the same name. Only slugs are unique (via random suffixes). This causes confusion for users.

### Solution
Add unique name validation in both the edge functions (server-side) and the frontend create forms (client-side) for all four entity types.

### Database Changes
Add unique constraints on the `name` column (case-insensitive) for each table:

**Migration SQL:**
```sql
CREATE UNIQUE INDEX unique_chama_name ON public.chama (lower(trim(name)));
CREATE UNIQUE INDEX unique_mchango_name ON public.mchango (lower(trim(title)));
CREATE UNIQUE INDEX unique_organization_name ON public.organizations (lower(trim(name)));
CREATE UNIQUE INDEX unique_welfare_name ON public.welfares (lower(trim(name)));
```

### Edge Function Changes (4 files)
Add a duplicate name check before INSERT in each CRUD function, returning a clear error message like `"A chama with this name already exists. Please choose a different name."`:

1. **`supabase/functions/chama-crud/index.ts`** — Check `chama.name` before insert
2. **`supabase/functions/mchango-crud/index.ts`** — Check `mchango.title` before insert
3. **`supabase/functions/welfare-crud/index.ts`** — Check `welfares.name` before insert
4. Organization creation (need to identify the handler — likely inline in a page or separate function)

### Frontend Changes (4 create pages)
Add user-friendly error display when the server returns a duplicate name error:

1. **`src/pages/ChamaCreate.tsx`** — Already shows `error.message` in toast
2. **`src/pages/MchangoCreate.tsx`** — Same pattern
3. **`src/pages/WelfareCreate.tsx`** — Same pattern  
4. **`src/pages/OrganizationCreate.tsx`** — Same pattern

The existing toast error handling in all four forms will automatically surface the server error messages, so minimal frontend changes are needed beyond ensuring the error messages are clear.

### How It Works
1. User enters a name like "Tumaini Savings Group"
2. Edge function queries `SELECT 1 FROM chama WHERE lower(trim(name)) = lower(trim($input))`
3. If found → returns 400 with `"A chama with this name already exists. Please choose a different name."`
4. If not found → proceeds with creation as normal
5. Database unique index acts as a safety net for race conditions

