-- Fix extract_category() function to use main domain instead of subdomain
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION extract_category(feed_url TEXT)
RETURNS TEXT AS $$
DECLARE
    domain TEXT;
    parts TEXT[];
    main_domain TEXT;
BEGIN
    -- Extract hostname from URL
    domain := regexp_replace(feed_url, '^https?://(www\.)?([^/]+).*', '\2');

    -- Check for common domains first
    IF domain LIKE '%youtube.com%' THEN
        RETURN 'YouTube';
    ELSIF domain LIKE '%reddit.com%' THEN
        RETURN 'Reddit';
    ELSIF domain LIKE '%github.com%' THEN
        RETURN 'GitHub';
    ELSIF domain LIKE '%medium.com%' THEN
        RETURN 'Medium';
    ELSIF domain LIKE '%substack.com%' THEN
        RETURN 'Substack';
    END IF;

    -- Extract main domain from multi-level domains
    -- Split domain by dots
    parts := string_to_array(domain, '.');

    -- For multi-level domains (blog.google.com), use second-to-last part
    -- For simple domains (example.com), use first part
    IF array_length(parts, 1) > 2 THEN
        main_domain := parts[array_length(parts, 1) - 1];
    ELSE
        main_domain := parts[1];
    END IF;

    -- Capitalize first letter
    RETURN initcap(main_domain);
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Other';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing feed categories to use the correct main domain
-- Comment out if you don't want to update existing data
UPDATE feeds
SET category = extract_category(url)
WHERE category IS NOT NULL;
