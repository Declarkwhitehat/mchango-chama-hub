---
name: Official Admin-Created Campaigns Pinning
description: Mchango campaigns created by admin accounts get is_official=true via trigger and are pinned first on MchangoExplore with an "Official" badge.
type: feature
---
Column: `public.mchango.is_official boolean default false`. Trigger `set_mchango_official_for_admin_trg` (BEFORE INSERT) sets `is_official=true`, `is_verified=true`, `creator_is_verified=true` when `has_role(NEW.created_by, 'admin')`. Existing admin-created campaigns were backfilled.

`MchangoExplore.tsx` always sorts `is_official DESC` first, then by the user-chosen sort (newest / most-funded / ending-soon). Official cards show a primary-coloured "Official" badge overlay (top-left of image, or inline beside title if no image) and a `ring-2 ring-primary/40` border. No badge change elsewhere — pinning is Explore-only by design.
