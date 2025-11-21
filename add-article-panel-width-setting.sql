-- Add article_panel_width column to user_settings table
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS article_panel_width INTEGER DEFAULT 650;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.article_panel_width IS 'Width of the article detail panel in pixels (400-1200)';
