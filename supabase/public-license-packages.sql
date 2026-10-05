-- Allow the public purchase page to show active license package details.
-- Only active packages are visible to unauthenticated visitors.
BEGIN;

GRANT SELECT ON public.subscription_plans TO anon, authenticated;

DROP POLICY IF EXISTS subscription_plans_public_select ON public.subscription_plans;
CREATE POLICY subscription_plans_public_select ON public.subscription_plans
FOR SELECT TO anon USING (active = true);

COMMIT;
