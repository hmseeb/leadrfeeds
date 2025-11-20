# LeadrFeeds

A modern RSS feed aggregator with AI-powered chat assistance, built with SvelteKit and Supabase.

## Features

- **Feed Discovery**: Browse and subscribe to RSS feeds with search and category filtering
- **Timeline View**: Read entries from subscribed feeds with unread/starred tracking
- **Smart Sidebar**: Categorized feed list with unread counts
- **Entry Detail**: Full article view with rich content rendering
- **AI Chat**: Context-aware AI assistant powered by OpenRouter (Claude, GPT-4, Gemini, etc.)
- **User Authentication**: Secure email/password authentication via Supabase Auth
- **Auto-categorization**: Feeds automatically categorized by domain (Reddit, YouTube, GitHub, etc.)
- **Read/Starred Tracking**: Mark entries as read or starred for later
- **Dark Theme**: Modern dark UI with warm orange/green accents

## Architecture

### Backend: Supabase (PostgreSQL)

**Database Tables:**
- `feeds` - RSS feed metadata
- `entries` - Feed posts/articles
- `user_subscriptions` - User-feed relationships
- `user_entry_status` - Read/starred tracking per user per entry
- `chat_messages` - AI conversation history
- `user_settings` - User preferences and API keys

**Database Functions:**
- `extract_category()` - Auto-extracts category from feed URL
- `get_user_timeline()` - Returns user's feed entries with filters
- `get_unread_counts()` - Returns unread counts per feed
- `get_discovery_feeds()` - Returns feeds for discovery page
- `mark_entry_read()` - Marks entry as read
- `toggle_entry_star()` - Toggles entry starred status

**Row Level Security (RLS):**
- Feeds visible to all authenticated users (discovery)
- Entries only visible to users subscribed to the feed
- User settings/subscriptions locked to user's own data

### Frontend: SvelteKit

**Tech Stack:**
- SvelteKit 5 with TypeScript
- Tailwind CSS for styling
- Supabase JS client for database/auth
- Lucide Svelte for icons
- date-fns for date formatting

**Key Routes:**
- `/` - Root redirect based on auth status
- `/auth/login` - Login page
- `/auth/register` - Registration page
- `/discover` - Feed discovery with search
- `/timeline/all` - All entries from subscribed feeds
- `/timeline/starred` - Starred entries
- `/timeline/feed/{id}` - Entries from specific feed
- `/settings` - User settings and API key configuration

### Data Flow: n8n → Supabase → SvelteKit

1. **RSS Polling**: n8n polls RSS feeds via Folo.is
2. **Webhook**: n8n sends new entries to Supabase via webhook
3. **Storage**: Feeds and entries stored in Supabase
4. **Frontend**: SvelteKit fetches and displays data
5. **Real-time**: Supabase handles auth session management

## Setup

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- n8n instance (for RSS feed automation)
- OpenRouter API key (for AI chat, optional)

### 1. Clone Repository

```bash
git clone <repository-url>
cd LeadrFeeds
```

### 2. Supabase Setup

The Supabase project is already configured with project ID: `zhcshvmklmuuqngshcdv`

Database schema, RLS policies, functions, and triggers are already set up. See [N8N_WEBHOOK_CONFIG.md](./N8N_WEBHOOK_CONFIG.md) for details.

### 3. n8n Webhook Configuration

1. Import the workflow from [n8n-workflow-folo-to-supabase.json](./n8n-workflow-folo-to-supabase.json)
2. Add Supabase credentials in n8n (service role key)
3. Connect the workflow to your Folo webhook
4. Test the workflow

See [N8N_WEBHOOK_CONFIG.md](./N8N_WEBHOOK_CONFIG.md) for detailed instructions.

### 4. Frontend Setup

```bash
cd app
npm install
```

Create `.env` file (or use existing):

```env
PUBLIC_SUPABASE_URL=https://zhcshvmklmuuqngshcdv.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Start development server:

```bash
npm run dev
```

Visit http://localhost:5173

### 5. OpenRouter API Key (Optional)

To use the AI chat feature:

1. Get an API key from https://openrouter.ai/keys
2. Sign up/login to LeadrFeeds
3. Go to Settings and enter your OpenRouter API key
4. Select your preferred model (Claude, GPT-4, etc.)

## Usage

### First Time Setup

1. **Register**: Create an account at `/auth/register`
2. **Discover**: Browse feeds at `/discover`
3. **Subscribe**: Click "Subscribe" on feeds you like
4. **Timeline**: View entries at `/timeline/all`

### Reading Feeds

- Click on any entry card to view full article
- Unread entries have an orange left border
- Click star icon to save entries for later
- Click "Open Original" to view on source website

### AI Chat

- Chat panel appears on the right side of timeline
- Ask questions about your feeds or entries
- Context-aware: Knows which entry/feed you're viewing
- Configure API key in Settings

### Managing Subscriptions

- Sidebar shows categorized feeds with unread counts
- Click feed name to filter timeline to that feed
- View all starred entries at `/timeline/starred`
- Unsubscribe from feeds in Discovery page

## Database Schema

### Tables

#### feeds
- `id` (uuid, primary key)
- `url` (text, unique)
- `title`, `description`, `image`
- `category` (auto-extracted)
- `subscriber_count` (auto-updated)
- `checked_at`, `last_entry_at`
- `etag_header`, `last_modified_header` (caching)
- `error_message`, `error_at`

#### entries
- `id` (uuid, primary key)
- `feed_id` (foreign key → feeds)
- `guid` (text, unique per feed)
- `url` (text)
- `title`, `description`, `content`, `author`
- `published_at`, `inserted_at`
- `media`, `attachments` (jsonb)

#### user_subscriptions
- `id` (uuid, primary key)
- `user_id` (uuid)
- `feed_id` (foreign key → feeds)
- `subscribed_at`

#### user_entry_status
- `id` (uuid, primary key)
- `user_id` (uuid)
- `entry_id` (foreign key → entries)
- `is_read`, `is_starred`
- `read_at`, `starred_at`

#### chat_messages
- `id` (uuid, primary key)
- `user_id` (uuid)
- `context_type` ('global', 'feed', 'entry')
- `context_id` (uuid, nullable)
- `role` ('user', 'assistant')
- `content` (text)
- `created_at`

#### user_settings
- `user_id` (uuid, primary key)
- `openrouter_api_key` (text, encrypted)
- `preferred_model` (text)
- `theme` (text)

## Development

### Project Structure

```
app/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── AIChat.svelte
│   │   │   ├── EntryCard.svelte
│   │   │   ├── LoadingSpinner.svelte
│   │   │   └── Sidebar.svelte
│   │   ├── services/
│   │   │   └── supabase.ts
│   │   ├── stores/
│   │   │   └── auth.ts
│   │   ├── types/
│   │   │   └── database.ts (generated)
│   │   └── utils/
│   ├── routes/
│   │   ├── auth/
│   │   │   ├── login/+page.svelte
│   │   │   ├── register/+page.svelte
│   │   │   └── callback/+server.ts
│   │   ├── discover/+page.svelte
│   │   ├── settings/+page.svelte
│   │   ├── timeline/
│   │   │   └── [filter]/+page.svelte
│   │   ├── +layout.svelte
│   │   ├── +layout.ts
│   │   └── +page.svelte
│   └── app.css
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

### Type Generation

To regenerate TypeScript types from Supabase schema:

```bash
npx supabase gen types typescript --project-id zhcshvmklmuuqngshcdv > src/lib/types/database.ts
```

### Building for Production

```bash
npm run build
npm run preview
```

## Deployment

### SvelteKit (Vercel/Netlify)

1. Connect GitHub repository
2. Set environment variables:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
3. Deploy

### Supabase

Already deployed at: https://zhcshvmklmuuqngshcdv.supabase.co

## Security Notes

- **Service Role Key**: Only used by n8n webhook (bypasses RLS)
- **Anon Key**: Used by frontend (respects RLS policies)
- **RLS Policies**: Ensure users only access their own data
- **API Keys**: OpenRouter keys encrypted in database
- **Auth**: Supabase Auth with email verification

## Roadmap

- [ ] Mobile responsive design
- [ ] Light theme support
- [ ] Email notifications for new entries
- [ ] Feed import/export (OPML)
- [ ] Keyboard shortcuts
- [ ] Full-text search across entries
- [ ] Entry bookmarking with tags
- [ ] RSS feed management (add custom feeds)
- [ ] Reading statistics and analytics
- [ ] Social sharing

## License

MIT

## Credits

- Built with [SvelteKit](https://kit.svelte.dev/)
- Database powered by [Supabase](https://supabase.com/)
- AI chat via [OpenRouter](https://openrouter.ai/)
- Icons by [Lucide](https://lucide.dev/)
- RSS automation with [n8n](https://n8n.io/)
