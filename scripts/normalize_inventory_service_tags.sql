-- Run this in the Supabase SQL editor.
-- Replace YOUR_ORG_ID with the real organization ID you want to fix.
-- This clears legacy mixed inventory tags and assigns a single service type to each item.

-- 1) Set the service tag for each item.
UPDATE public.inventory_items
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{service_type}',
  to_jsonb(
    CASE
      WHEN lower(COALESCE(name, '')) LIKE '%dtf%' OR lower(COALESCE(category, '')) LIKE '%dtf%' THEN 'dtf'
      WHEN lower(COALESCE(name, '')) ~ '(direct image|direct-image|di printing|\bdi\b)' OR lower(COALESCE(category, '')) ~ '(direct image|direct-image|di printing|\bdi\b)' THEN 'direct_image'
      WHEN lower(COALESCE(name, '')) ~ '(large format|large-format|vinyl|flex|banner|sav|backlit|window|reflective)' OR lower(COALESCE(category, '')) ~ '(large format|large-format|vinyl|flex|banner|sav|backlit|window|reflective)' THEN 'large_format'
      ELSE COALESCE((metadata->>'service_type'), 'general')
    END
  ),
  true
)
WHERE organization_id = 'YOUR_ORG_ID';

-- 2) Keep calculator_type aligned with the resolved service.
UPDATE public.inventory_items
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{calculator_type}',
  to_jsonb(
    CASE
      WHEN COALESCE(metadata->>'service_type', '') = 'dtf' THEN 'dtf'
      WHEN COALESCE(metadata->>'service_type', '') = 'direct_image' THEN 'direct_image'
      WHEN COALESCE(metadata->>'service_type', '') = 'large_format' THEN 'large_format'
      ELSE COALESCE(metadata->>'calculator_type', 'generic')
    END
  ),
  true
)
WHERE organization_id = 'YOUR_ORG_ID';

-- 3) Review the result.
SELECT id, name, category, metadata->>'service_type' AS service_type, metadata->>'calculator_type' AS calculator_type
FROM public.inventory_items
WHERE organization_id = 'YOUR_ORG_ID'
ORDER BY name;
