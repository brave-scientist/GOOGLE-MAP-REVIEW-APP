-- =============================================================================
-- 0002_add_organizations.sql — Parent Organization & Multi-Location Support
-- =============================================================================
-- Adds support for parent organizations, multi-location grouping, and roles.
-- Ensures strict ownership constraints (businesses must belong to an organization
-- owned by the same user) using a composite foreign key.
-- =============================================================================

-- 1. Create public.organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Unique constraint on (id, owner_user_id) allows referencing this pair as a composite FK
    CONSTRAINT organizations_owner_id_unique UNIQUE (id, owner_user_id)
);

-- 2. Add organization_id column to businesses
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- 3. Dynamic backfill: create default organizations for existing businesses
DO $$
DECLARE
    biz_owner RECORD;
    org_id UUID;
BEGIN
    FOR biz_owner IN SELECT DISTINCT owner_user_id FROM public.businesses LOOP
        -- Create a default organization for each unique owner
        INSERT INTO public.organizations (name, owner_user_id)
        VALUES ('Default Organization', biz_owner.owner_user_id)
        RETURNING id INTO org_id;

        -- Link all of this owner's businesses to the default organization
        UPDATE public.businesses
        SET organization_id = org_id
        WHERE owner_user_id = biz_owner.owner_user_id AND organization_id IS NULL;
    END LOOP;
END
$$ LANGUAGE plpgsql;

-- 4. Enforce NOT NULL on business organization_id after backfill
ALTER TABLE public.businesses
ALTER COLUMN organization_id SET NOT NULL;

-- 5. Add unique constraint for business names within an organization
ALTER TABLE public.businesses
ADD CONSTRAINT unique_business_name_per_organization UNIQUE (organization_id, name);

-- 6. Add composite foreign key constraint to ensure locations are owned by the org's owner
ALTER TABLE public.businesses
DROP CONSTRAINT IF EXISTS businesses_owner_user_id_fkey;

ALTER TABLE public.businesses
ADD CONSTRAINT businesses_owner_org_fkey
FOREIGN KEY (organization_id, owner_user_id)
REFERENCES public.organizations(id, owner_user_id)
ON DELETE CASCADE;

-- 7. Add role column to public.users for multi-location access control
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'individual'
CHECK (role IN ('individual', 'org_admin', 'location_manager'));
